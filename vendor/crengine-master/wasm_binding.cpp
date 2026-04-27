/**
 * Emscripten binding layer for CREngine (CoolReader engine).
 *
 * Exposes an EpubRenderer class to JavaScript that wraps LVDocView and
 * related CREngine facilities.
 *
 * Key design: LVDocView creation is deferred until at least one font has been
 * registered, because the LVDocView constructor calls fontMan->GetFont() which
 * crashes if no fonts are available.
 */

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include "crsetup.h"
#include "lvdocview.h"
#include "lvdocviewcmd.h"
#include "lvdocviewprops.h"
#include "lvdrawbuf.h"
#include "lvfntman.h"
#include "lvstream.h"
#include "lvtinydom.h"
#include "props.h"
#include "ft_compat.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <set>
#include <algorithm>
#include <sys/stat.h>

static bool g_crengine_initialized = false;
static bool g_has_fonts = false;

static void ensureCREngineInit() {
    if (g_crengine_initialized) return;
    g_crengine_initialized = true;

    mkdir("/fonts", 0777);

    printf("CRE_WASM: initializing font manager with path=/fonts\n");
    InitFontManager(lString8("/fonts"));
    printf("CRE_WASM: font manager initialized, fontMan=%p\n", (void*)fontMan);
}

using namespace emscripten;

struct ImageRegion {
    int x;
    int y;
    int width;
    int height;
    int type; // 0=illustration, 1=background, 2=decoration
    float confidence;
};

class TrackingColorDrawBuf : public LVColorDrawBuf {
public:
    TrackingColorDrawBuf(int dx, int dy, int bpp = 32)
        : LVColorDrawBuf(dx, dy, bpp), m_currentHint(0) {}

    void resetImageRegions() {
        m_regions.clear();
    }

    const std::vector<ImageRegion> &getImageRegions() const {
        return m_regions;
    }

    int getImageDrawCount() const {
        return getDrawnImagesCount();
    }

    int getImageDrawSurface() const {
        return getDrawnImagesSurface();
    }

    virtual void setImageDrawHint(int hint) override {
        m_currentHint = hint;
    }

    virtual void Draw(LVImageSourceRef img, int x, int y, int width, int height, bool dither) override {
        LVColorDrawBuf::Draw(img, x, y, width, height, dither);
        if (width <= 0 || height <= 0) return;

        int bufW = GetWidth();
        int bufH = GetHeight();
        int x0 = std::max(0, x);
        int y0 = std::max(0, y);
        int x1 = std::min(bufW, x + width);
        int y1 = std::min(bufH, y + height);
        if (x1 <= x0 || y1 <= y0) return;

        ImageRegion rc;
        rc.x = x0;
        rc.y = y0;
        rc.width = x1 - x0;
        rc.height = y1 - y0;
        int frameArea = std::max(1, bufW * bufH);
        float areaRatio = (float)(rc.width * rc.height) / (float)frameArea;
        if (m_currentHint == 1) {
            rc.type = 1; // background
            rc.confidence = 0.90f;
        } else if (areaRatio > 0.05f) {
            rc.type = 0; // illustration
            rc.confidence = std::min(0.98f, 0.60f + areaRatio * 2.0f);
        } else {
            rc.type = 2; // decoration
            rc.confidence = std::max(0.35f, 0.85f - areaRatio * 6.0f);
        }
        m_regions.push_back(rc);
    }

private:
    int m_currentHint;
    std::vector<ImageRegion> m_regions;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

static std::string lString32ToStd(const lString32 &s) {
    lString8 u = UnicodeToUtf8(s);
    return std::string(u.c_str(), u.length());
}

static lString8 stdToLString8(const std::string &s) {
    return lString8(s.c_str(), s.length());
}

static val tocItemToVal(LVTocItem *item) {
    val arr = val::array();
    if (!item) return arr;
    int n = item->getChildCount();
    for (int i = 0; i < n; i++) {
        LVTocItem *child = item->getChild(i);
        val entry = val::object();
        entry.set("title", lString32ToStd(child->getName()));
        entry.set("page", child->getPage());
        entry.set("level", child->getLevel());
        val children = tocItemToVal(child);
        if (children["length"].as<int>() > 0)
            entry.set("children", children);
        arr.call<void>("push", entry);
    }
    return arr;
}

// ---------------------------------------------------------------------------
// Font file writing helper
// ---------------------------------------------------------------------------

static bool writeFontToMEMFS(const lUInt8 *data, int len, const std::string &safeFilename) {
    std::string fullPath = std::string("/fonts/") + safeFilename;
    FILE *f = fopen(fullPath.c_str(), "wb");
    if (!f) {
        printf("CRE_WASM: ERROR: fopen('%s', 'wb') failed\n", fullPath.c_str());
        return false;
    }
    size_t written = fwrite(data, 1, len, f);
    fclose(f);

    if ((int)written != len) {
        printf("CRE_WASM: ERROR: incomplete write %zu/%d for %s\n", written, len, fullPath.c_str());
        return false;
    }
    printf("CRE_WASM: wrote %d bytes to %s\n", len, fullPath.c_str());
    return true;
}

static std::string sanitizeFilename(const std::string &name) {
    std::string safe = name;
    for (auto &c : safe) {
        if (c == ' ' || c == '/' || c == '\\') c = '_';
    }
    if (safe.find('.') == std::string::npos) {
        safe += ".ttf";
    }
    return safe;
}

// ---------------------------------------------------------------------------
// EpubRenderer
// ---------------------------------------------------------------------------

class EpubRenderer {
public:
    EpubRenderer(int width, int height)
        : m_width(width), m_height(height),
          m_drawBuf(width, height, 32),
          m_docView(nullptr),
          m_defaultCss(DEFAULT_CSS)
    {
        ensureCREngineInit();
        printf("CRE_WASM: EpubRenderer(%d, %d) — docView deferred until font registered\n",
               width, height);
    }

    ~EpubRenderer() {
        if (m_docView) {
            delete m_docView;
            m_docView = nullptr;
        }
    }

    // -- Font registration (can be called before docView exists) ------------

    void registerFontFromMemory(uintptr_t ptr, int length, const std::string &name) {
        printf("CRE_WASM: registerFontFromMemory(len=%d, name='%s')\n", length, name.c_str());
        lUInt8 *fontData = reinterpret_cast<lUInt8 *>(ptr);

        if (length < 12) {
            printf("CRE_WASM: font data too small (%d bytes), skip\n", length);
            return;
        }

        printf("CRE_WASM: font magic: %02x %02x %02x %02x\n",
               fontData[0], fontData[1], fontData[2], fontData[3]);

        std::string safeFilename = sanitizeFilename(name);

        // Skip if we already registered a font under this exact filename
        std::string fullPath = std::string("/fonts/") + safeFilename;
        if (m_registeredFonts.count(safeFilename)) {
            printf("CRE_WASM: font '%s' already registered, skip duplicate\n", safeFilename.c_str());
            return;
        }

        if (!writeFontToMEMFS(fontData, length, safeFilename)) {
            return;
        }

        // Verify the file can be read back
        FILE *verify = fopen(fullPath.c_str(), "rb");
        if (!verify) {
            printf("CRE_WASM: ERROR: post-write verify fopen('%s','rb') failed!\n", fullPath.c_str());
            return;
        }
        fseek(verify, 0, SEEK_END);
        long verifySize = ftell(verify);
        fclose(verify);
        printf("CRE_WASM: verify OK: %s (%ld bytes)\n", fullPath.c_str(), verifySize);

        bool ok = fontMan->RegisterFont(stdToLString8(safeFilename));
        printf("CRE_WASM: RegisterFont('%s') = %s\n", safeFilename.c_str(), ok ? "OK" : "FAILED");

        if (!ok) {
            ok = fontMan->RegisterFont(stdToLString8(fullPath));
            printf("CRE_WASM: RegisterFont('%s') fallback = %s\n",
                   fullPath.c_str(), ok ? "OK" : "FAILED");
        }

        if (ok) {
            m_registeredFonts.insert(safeFilename);
            g_has_fonts = true;
            ensureDocView();
        }
    }

    // -- Document loading ---------------------------------------------------

    void loadEpubFromMemory(uintptr_t ptr, int length) {
        ensureDocView();
        if (!m_docView) {
            printf("CRE_WASM: ERROR: loadEpubFromMemory called but no docView (no fonts?)\n");
            return;
        }
        printf("CRE_WASM: loadEpubFromMemory(ptr=0x%x, len=%d)\n", (unsigned)ptr, length);
        void *buf = reinterpret_cast<void *>(ptr);
        LVStreamRef stream = LVCreateMemoryStream(buf, length, true, LVOM_READ);
        if (stream.isNull()) {
            printf("CRE_WASM: ERROR: failed to create memory stream\n");
            return;
        }
        bool ok = m_docView->LoadDocument(stream);
        printf("CRE_WASM: LoadDocument = %s\n", ok ? "OK" : "FAILED");
    }

    // -- Page navigation ----------------------------------------------------

    int getPageCount() {
        if (!m_docView) {
            printf("CRE_WASM: getPageCount() called but no docView\n");
            return 0;
        }
        printf("CRE_WASM: getPageCount() calling Render()...\n");
        m_docView->Render();
        int count = m_docView->getPageCount();
        printf("CRE_WASM: getPageCount() = %d\n", count);
        return count;
    }

    /// 返回指定页的纯文本内容（用于前端按页拼接全文、提取章节目录等）。pageIndex 从 0 起。
    std::string getPageText(int pageIndex) {
        if (!m_docView) return "";
        lString32 txt = m_docView->getPageText(false, pageIndex);
        return lString32ToStd(txt);
    }

    void goToPage(int page) {
        if (m_docView) m_docView->goToPage(page);
    }

    // -- Rendering ----------------------------------------------------------

    void renderCurrentPage() {
        if (!m_docView) return;
        m_drawBuf.resetImageRegions();
        m_drawBuf.Clear(0xFFFFFF);
        m_docView->setLineBaselinesCollector(&m_lineBaselines);
        m_docView->setLineBaselinesHeadingCollector(&m_lineBaselinesHeading);
        m_docView->Draw(m_drawBuf);
    }

    /// Returns line bottom Y coordinates (pixels) for the last rendered page. One entry per text line. Used by frontend for underline positioning.
    val getLineBaselines() {
        val out = val::global("Int32Array").new_(m_lineBaselines.size());
        if (!m_lineBaselines.empty()) {
            val view = val(typed_memory_view(m_lineBaselines.size(), m_lineBaselines.data()));
            out.call<void>("set", view);
        }
        return out;
    }

    /// Returns per-line heading flag (1 = h1–h6) for the last rendered page. Same length as getLineBaselines(). Used by frontend to avoid underlines in heading gaps.
    val getLineBaselinesHeading() {
        val out = val::global("Uint8Array").new_(m_lineBaselinesHeading.size());
        if (!m_lineBaselinesHeading.empty()) {
            val view = val(typed_memory_view(m_lineBaselinesHeading.size(), m_lineBaselinesHeading.data()));
            out.call<void>("set", view);
        }
        return out;
    }

    val getFrameBuffer() {
        int w = m_drawBuf.GetWidth();
        int h = m_drawBuf.GetHeight();
        int stride = w * 4;
        int totalBytes = stride * h;

        std::vector<lUInt8> rgbaBuf(totalBytes);
        for (int y = 0; y < h; y++) {
            lUInt8 *scanline = m_drawBuf.GetScanLine(y);
            if (!scanline) continue;
            const lUInt32 *src = reinterpret_cast<const lUInt32 *>(scanline);
            lUInt8 *dst = rgbaBuf.data() + y * stride;
            for (int x = 0; x < w; x++) {
                lUInt32 bgra = src[x];
                dst[x*4 + 0] = (bgra >> 16) & 0xFF; // R
                dst[x*4 + 1] = (bgra >>  8) & 0xFF; // G
                dst[x*4 + 2] =  bgra         & 0xFF; // B
                dst[x*4 + 3] = 255;                   // A (fully opaque)
            }
        }

        val jsBuffer = val::global("Uint8Array").new_(totalBytes);
        val view = val(typed_memory_view(totalBytes, rgbaBuf.data()));
        jsBuffer.call<void>("set", view);
        return jsBuffer;
    }

    val getImageRegions() {
        val arr = val::array();
        const std::vector<ImageRegion> &regions = m_drawBuf.getImageRegions();
        for (size_t i = 0; i < regions.size(); i++) {
            val rc = val::object();
            rc.set("x", regions[i].x);
            rc.set("y", regions[i].y);
            rc.set("width", regions[i].width);
            rc.set("height", regions[i].height);
            const char *typeName = "illustration";
            if (regions[i].type == 1) typeName = "background";
            else if (regions[i].type == 2) typeName = "decoration";
            rc.set("type", std::string(typeName));
            rc.set("confidence", regions[i].confidence);
            arr.call<void>("push", rc);
        }
        return arr;
    }

    val getImageDrawStats() {
        val out = val::object();
        out.set("count", m_drawBuf.getImageDrawCount());
        out.set("surface", m_drawBuf.getImageDrawSurface());
        out.set("frameWidth", m_drawBuf.GetWidth());
        out.set("frameHeight", m_drawBuf.GetHeight());
        return out;
    }

    void resize(int width, int height) {
        m_width = width;
        m_height = height;
        m_drawBuf.Resize(m_width, m_height);
        if (m_docView) m_docView->Resize(m_width, m_height);
    }

    // -- Font settings ------------------------------------------------------

    void setFontFace(const std::string &name) {
        printf("CRE_WASM: setFontFace('%s')\n", name.c_str());
        if (m_docView) m_docView->setDefaultFontFace(stdToLString8(name));
    }

    void setFontSize(int size) {
        if (m_docView) m_docView->setFontSize(size);
    }

    void setFontWeight(int weight) {
        if (!m_docView) return;
        CRPropRef props = m_docView->propsGetCurrent();
        if (!props.isNull()) {
            props->setInt(PROP_FONT_BASE_WEIGHT, weight);
            m_docView->propsApply(props);
        }
    }

    void setEmbeddedFontsEnabled(bool enabled) {
        printf("CRE_WASM: setEmbeddedFontsEnabled(%d)\n", enabled ? 1 : 0);
        if (m_docView) m_docView->doCommand(DCMD_SET_DOC_FONTS, enabled ? 1 : 0);
    }

    // -- Layout settings ----------------------------------------------------

    void setMargins(int left, int top, int right, int bottom) {
        if (!m_docView) return;
        lvRect rc(left, top, right, bottom);
        m_docView->setPageMargins(rc);
    }

    void setInterlineSpace(int percent) {
        if (m_docView) m_docView->setDefaultInterlineSpace(percent);
    }

    /// 横屏时可见页数：1 = 单列，2 = 双列。竖屏时引擎固定单页，此选项仅横屏生效。
    void setVisiblePageCount(int n) {
        m_visiblePageCount = (n == 2) ? 2 : 1;
        if (m_docView) m_docView->setVisiblePageCount(m_visiblePageCount);
    }

    void setTextAlign(int align) {
        const char *alignCss[] = { "left", "right", "center", "justify" };
        if (align < 0 || align > 3) align = 3;
        char buf[256];
        snprintf(buf, sizeof(buf),
            "body, p, div { text-align: %s !important; }\n", alignCss[align]);
        m_textAlignCss = buf;
        rebuildUserStylesheet();
    }

    void setHyphenation(int mode) {
        if (!m_docView) return;
        CRPropRef props = m_docView->propsGetCurrent();
        if (!props.isNull()) {
            if (mode == 0) {
                props->setString(PROP_HYPHENATION_DICT, PROP_HYPHENATION_DICT_VALUE_NONE);
                props->setString(PROP_TEXTLANG_HYPHENATION_ENABLED, "0");
            } else if (mode == 1) {
                props->setString(PROP_HYPHENATION_DICT, PROP_HYPHENATION_DICT_VALUE_ALGORITHM);
                props->setString(PROP_TEXTLANG_HYPHENATION_ENABLED, "1");
            } else {
                props->setString(PROP_TEXTLANG_HYPHENATION_ENABLED, "1");
            }
            m_docView->propsApply(props);
        }
    }

    void setHyphenationLanguage(const std::string &lang) {
        if (!m_docView) return;
        CRPropRef props = m_docView->propsGetCurrent();
        if (!props.isNull()) {
            props->setString(PROP_TEXTLANG_MAIN_LANG, stdToLString8(lang).c_str());
            m_docView->propsApply(props);
        }
    }

    // -- Status bar ---------------------------------------------------------

    void configureStatusBar(bool a, bool showClock, bool showTitle,
                            bool showAuthor, bool showBattery,
                            bool showChapterMarks, bool showPercent,
                            bool showPageNumber, bool showPageCount) {
        if (m_docView)
            m_docView->setStatusMode(0, showClock, showTitle, showAuthor,
                                     showBattery, showChapterMarks, showPercent,
                                     showPageNumber, showPageCount);
    }

    void setPageHeaderEnabled(bool enabled) {
        // Native CREngine page header drawn inside rendered frame.
        // Keep default off; when enabled show title + page x/y + percent.
        m_pageHeaderFlags = enabled ? (PGHDR_TITLE | PGHDR_PAGE_NUMBER | PGHDR_PAGE_COUNT | PGHDR_PERCENT) : PGHDR_NONE;
        if (m_docView)
            m_docView->setPageHeaderInfo(m_pageHeaderFlags);
    }

    // -- User styles --------------------------------------------------------

    void applyUserStyles(const std::string &css) {
        m_userCss = css;
        rebuildUserStylesheet();
    }

    // -- Document info & TOC -----------------------------------------------

    val getDocumentInfo() {
        val info = val::object();
        if (m_docView) {
            info.set("title", lString32ToStd(m_docView->getTitle()));
            info.set("authors", lString32ToStd(m_docView->getAuthors()));
            info.set("description", lString32ToStd(m_docView->getDescription()));
            info.set("keywords", lString32ToStd(m_docView->getKeywords()));
            info.set("series", lString32ToStd(m_docView->getSeries()));
            info.set("language", lString32ToStd(m_docView->getLanguage()));
        }
        return info;
    }

    val getToc() {
        if (!m_docView) return val::array();
        LVTocItem *root = m_docView->getToc();
        return tocItemToVal(root);
    }

private:
    void ensureDocView() {
        if (m_docView) return;
        if (!g_has_fonts) {
            printf("CRE_WASM: ensureDocView: skipped, no fonts registered yet\n");
            return;
        }
        printf("CRE_WASM: creating LVDocView(%d x %d)...\n", m_width, m_height);
        m_docView = new LVDocView(32, true);
        m_docView->Resize(m_width, m_height);
        m_docView->setViewMode(DVM_PAGES);
        m_docView->setVisiblePageCount(m_visiblePageCount);  // 横屏默认单列，可由 JS 设为 2
        m_docView->setPageHeaderInfo(m_pageHeaderFlags);
        m_docView->setStyleSheet(stdToLString8(m_defaultCss));
        printf("CRE_WASM: LVDocView created OK\n");
    }

    void rebuildUserStylesheet() {
        if (!m_docView) return;
        std::string combined = m_defaultCss + "\n" + m_userCss + "\n" + m_textAlignCss;
        m_docView->setStyleSheet(stdToLString8(combined));
    }

    static constexpr const char *DEFAULT_CSS =
        "DocFragment { page-break-before: always; }\n"
        "DocFragment[NonLinear] { -cr-hint: non-linear; }\n"
        "empty-line { height: 1em; }\n"
        "body { text-align: justify; }\n"
        "h1 { font-size: 150%; font-weight: bold; margin: 0.7em 0 0.5em 0; hyphens: none; page-break-inside: avoid; page-break-after: avoid; }\n"
        "h2 { font-size: 140%; font-weight: bold; margin: 0.7em 0 0.5em 0; hyphens: none; page-break-inside: avoid; page-break-after: avoid; }\n"
        "h3 { font-size: 130%; font-weight: bold; margin: 0.7em 0 0.5em 0; hyphens: none; page-break-inside: avoid; page-break-after: avoid; }\n"
        "h4 { font-size: 120%; font-weight: bold; margin: 0.7em 0 0.5em 0; hyphens: none; page-break-inside: avoid; page-break-after: avoid; }\n"
        "h5 { font-size: 110%; font-weight: bold; margin: 0.7em 0 0.5em 0; hyphens: none; page-break-inside: avoid; page-break-after: avoid; }\n"
        "h6 { font-size: 100%; font-weight: bold; margin: 0.7em 0 0.5em 0; hyphens: none; page-break-inside: avoid; page-break-after: avoid; }\n"
        "p { text-indent: 1.2em; margin-top: 0; margin-bottom: 0; }\n"
        "blockquote { margin: 0.5em 1em 0.5em 2em; }\n"
        "hr { border-style: solid; }\n"
        "ol, ul { margin-left: 1em; margin-top: 0; margin-bottom: 0; }\n"
        "table { font-size: 80%; margin: 3px 0; border-spacing: 1px; }\n"
        "table table { font-size: 100%; }\n"
        "td { padding: 3px; }\n"
        "th { padding: 3px; background-color: #DDD; text-align: center; }\n"
        "xmp, pre { text-align: left; margin: 0.5em 0; white-space: pre; }\n"
        "code { white-space: pre; }\n"
        "sup { font-size: 70%; }\n"
        "sub { font-size: 70%; }\n"
        "a[href] { color: navy; }\n";

    int m_width;
    int m_height;
    TrackingColorDrawBuf m_drawBuf;
    LVDocView *m_docView;
    std::string m_defaultCss;
    std::string m_userCss;
    std::string m_textAlignCss;
    std::set<std::string> m_registeredFonts;
    int m_pageHeaderFlags = PGHDR_NONE;
    int m_visiblePageCount = 1;  // 1=单列 2=双列，仅横屏生效
    std::vector<int> m_lineBaselines;  // line bottom Y coords from last render, for underline layer
    std::vector<uint8_t> m_lineBaselinesHeading;  // per-line is-heading (1 = h1–h6), same length as m_lineBaselines
};

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

static uintptr_t allocateMemory(int size) {
    void *p = malloc(size);
    return reinterpret_cast<uintptr_t>(p);
}

static void freeMemory(uintptr_t ptr) {
    free(reinterpret_cast<void *>(ptr));
}

// ---------------------------------------------------------------------------
// Emscripten bindings
// ---------------------------------------------------------------------------

EMSCRIPTEN_BINDINGS(crengine_module) {

    class_<EpubRenderer>("EpubRenderer")
        .constructor<int, int>()
        .function("loadEpubFromMemory",      &EpubRenderer::loadEpubFromMemory)
        .function("getPageCount",            &EpubRenderer::getPageCount)
        .function("getPageText",             &EpubRenderer::getPageText)
        .function("goToPage",                &EpubRenderer::goToPage)
        .function("renderCurrentPage",       &EpubRenderer::renderCurrentPage)
        .function("getFrameBuffer",          &EpubRenderer::getFrameBuffer)
        .function("getLineBaselines",       &EpubRenderer::getLineBaselines)
        .function("getLineBaselinesHeading", &EpubRenderer::getLineBaselinesHeading)
        .function("getImageRegions",         &EpubRenderer::getImageRegions)
        .function("getImageDrawStats",       &EpubRenderer::getImageDrawStats)
        .function("resize",                  &EpubRenderer::resize)
        .function("setFontFace",             &EpubRenderer::setFontFace)
        .function("setFontSize",             &EpubRenderer::setFontSize)
        .function("setFontWeight",           &EpubRenderer::setFontWeight)
        .function("setEmbeddedFontsEnabled", &EpubRenderer::setEmbeddedFontsEnabled)
        .function("registerFontFromMemory",  &EpubRenderer::registerFontFromMemory)
        .function("setMargins",              &EpubRenderer::setMargins)
        .function("setInterlineSpace",       &EpubRenderer::setInterlineSpace)
        .function("setVisiblePageCount",     &EpubRenderer::setVisiblePageCount)
        .function("setTextAlign",            &EpubRenderer::setTextAlign)
        .function("setHyphenation",          &EpubRenderer::setHyphenation)
        .function("setHyphenationLanguage",  &EpubRenderer::setHyphenationLanguage)
        .function("configureStatusBar",      &EpubRenderer::configureStatusBar)
        .function("setPageHeaderEnabled",    &EpubRenderer::setPageHeaderEnabled)
        .function("applyUserStyles",         &EpubRenderer::applyUserStyles)
        .function("getDocumentInfo",         &EpubRenderer::getDocumentInfo)
        .function("getToc",                  &EpubRenderer::getToc)
        ;

    function("allocateMemory", &allocateMemory);
    function("freeMemory",     &freeMemory);
}

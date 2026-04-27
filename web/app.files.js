// ==================== File Handling ====================
// 预处理逻辑（stripEpubFonts / cleanCss / cleanHtmlStyles / injectEpaperCss）与 cli/lib/epub-preprocess.js
// 保持一致，以便 Web 与 CLI 转换结果一致；详见 docs/crengine-limitations.md
let currentFile = null;

// -------------------- 纯文本章节目录提取（TXT/MOBI 等） --------------------
// 识别规律：多种常见章节标题格式，行首或「正文 」/「数字. 」等前缀后匹配即视为章节行。

/** 从全文逐行扫描，提取符合规律的章节标题行及其行号。返回 { chapters: [{ title, lineIndex }], totalLines } */
function extractChaptersFromText(text) {
    if (typeof text !== 'string' || !text.length) return { chapters: [], totalLines: 0 };
    var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var totalLines = lines.length;
    var chapters = [];

    // 允许的行首前缀：空白、「正文 」或「正文　」、或「数字. 」「数字．」(如 1. 2. )
    function stripPrefix(s) {
        var t = s.trim();
        var m = t.match(/^(?:正文[\s\u3000]+|\d+[．.]\s*)/);
        if (m) return { rest: t.substring(m[0].length).trim(), stripped: m[0].trim() };
        return { rest: t, stripped: '' };
    }

    // 从整行中取出用于目录的标题（从「第」或关键词起，或整行）
    function getDisplayTitle(line, rest) {
        var idx = line.indexOf('第');
        if (idx >= 0) return line.substring(idx).trim();
        idx = line.search(/[【『]?[(（]?[一二三四五六七八九十百千零〇0-9]+[)）]?[章节目回卷部分篇]|序章|前言|引言|楔子|尾声|后记|附录|序|跋|上[中下]篇|上[中下]卷|第[一二三四五六七八九十百千零〇0-9]+篇|序幕|终章|结语|导读|代序|自序|开场白|番外|外传|谢辞|参考文献|卷首语|编者按|目录/);
        if (idx >= 0) return line.substring(idx).trim();
        return rest || line.trim();
    }

    // 固定章节关键词（整行或 rest 以此开头即视为章节）
    var fixedKeywords = /^(序章|前言|引言|楔子|尾声|后记|附录|序|跋|上篇|中篇|下篇|上卷|中卷|下卷|序幕|终章|结语|导读|代序|自序|再版序|开场白|番外|外传|谢辞|卷首语|编者按|目录|参考文献)(?:\s|$|[：:])/;
    // 第X章/节/回/卷/部分（X 为汉字或阿拉伯数字；\s 不含全角空格，故显式加 \u3000）
    var reDi = /^第[\s\u3000]*[一二三四五六七八九十百千零〇0-9]+[\s\u3000]*[章节回卷部分]/;
    // 【第一章】、【第一节】、『第一章』（支持全角空格）
    var reBracket = /^[【『]?[\s\u3000]*第[\s\u3000]*[一二三四五六七八九十百千零〇0-9]+[\s\u3000]*[章节回卷部分][\s\u3000]*[】』]?/;
    // （一）（二） 或 (1)(2)
    var reParen = /^[（(][一二三四五六七八九十百千零〇0-9]+[)）]/;
    // 一、二、 或 十一、十二、 或 壹、贰、 （汉字数字+顿号/点）
    var reHanNum = /^[一二三四五六七八九十百千零〇壹贰叁肆伍陆柒捌玖拾]+\s*[、．.]/;
    // 1. 2. 3. 或 1．2． （阿拉伯数字+点+空格，且后面跟的是章节内容而非长段正文）
    var reNumDot = /^\d+\s*[．.]\s*/;
    // 第一篇、第二篇（支持全角空格）
    var rePart = /^第[\s\u3000]*[一二三四五六七八九十百千零〇0-9]+[\s\u3000]*篇/;
    // 卷X、卷一（支持全角空格）
    var reJuan = /^卷[\s\u3000]*[一二三四五六七八九十百千零〇0-9]+/;
    // Chapter/Section/Part + 数字 或 Chapter One
    var reEn = /^(Chapter|Section|Part)\s+([0-9]+|[Oo]ne|[Tt]wo|[Tt]hree|[Ff]our|[Ff]ive|[Ss]ix|[Ss]even|[Ee]ight|[Nn]ine|[Tt]en)/i;

    for (var i = 0; i < lines.length; i++) {
        var trimmed = lines[i].trim();
        if (!trimmed.length) continue;
        var pref = stripPrefix(trimmed);
        var rest = pref.rest;
        if (!rest.length) continue;

        var title = null;
        if (reDi.test(rest) || reBracket.test(rest)) {
            title = getDisplayTitle(trimmed, rest);
        } else if (fixedKeywords.test(rest)) {
            title = rest;
        } else if (reParen.test(rest)) {
            title = rest;
        } else if (reHanNum.test(rest)) {
            // 一、标题 通常较短，避免把长段落当章节（如「一、」后跟几百字）
            if (rest.length <= 80) title = rest;
        } else if (reNumDot.test(rest)) {
            var afterNum = rest.replace(/^\d+\s*[．.]\s*/, '').trim();
            if (reDi.test(afterNum) || fixedKeywords.test(afterNum) || reParen.test(afterNum) || /^[一二三四五六七八九十百千零〇壹贰叁肆伍陆柒捌玖拾]+\s*[、．.]/.test(afterNum) || rePart.test(afterNum) || reJuan.test(afterNum))
                title = rest;
        } else if (rePart.test(rest) || reJuan.test(rest)) {
            title = getDisplayTitle(trimmed, rest);
        } else if (reEn.test(rest)) {
            title = rest;
        }

        if (title != null)
            chapters.push({ title: title, lineIndex: i });
    }
    return { chapters: chapters, totalLines: totalLines };
}

/** 用提取的章节行号 + 总行数/总页数（或精确的 lineToPage）构建 currentToc。
 * 目录最多保留 MAX_TOC_ENTRIES 条，按文档顺序取前 N 条，避免不同情况越界。
 * @param lineToPage 可选，[lineIndex -> pageIndex]；若提供则用精确页码，否则按行比例估算 */
var MAX_TOC_ENTRIES = 100;
function buildTocFromExtracted(extractedChapters, totalLines, totalPages, lineToPage) {
    if (!extractedChapters.length || totalPages <= 0) return [];
    if (extractedChapters.length > MAX_TOC_ENTRIES)
        extractedChapters = extractedChapters.slice(0, MAX_TOC_ENTRIES);
    var toc = [];
    for (var k = 0; k < extractedChapters.length; k++) {
        var ch = extractedChapters[k];
        var page;
        if (lineToPage && ch.lineIndex >= 0 && ch.lineIndex < lineToPage.length)
            page = Math.min(totalPages - 1, Math.max(0, lineToPage[ch.lineIndex]));
        else if (totalLines > 0)
            page = Math.min(totalPages - 1, Math.floor((ch.lineIndex / totalLines) * totalPages));
        else
            page = 0;
        toc.push({ name: ch.title, title: ch.title, page: page, startPage: page });
    }
    return toc;
}

/** 方案 A 防抖：同一页出现多条章节视为目录页，整页章节全部剔除，不保留任何一条。
 * 仅对「前 15% 页」做此过滤，避免正文中的章节因与目录同页被误删。
 * 使用与 buildTocFromExtracted 相同的页码规则（lineToPage 或行比例）。 */
function dropChaptersOnDensePages(chapters, totalLines, totalPages, lineToPage) {
    if (!chapters.length || totalPages <= 0) return chapters;
    var densePageLimit = Math.max(1, Math.floor(totalPages * 0.15));
    function pageOf(ch) {
        if (lineToPage && ch.lineIndex >= 0 && ch.lineIndex < lineToPage.length)
            return Math.min(totalPages - 1, Math.max(0, lineToPage[ch.lineIndex]));
        if (totalLines <= 0) return 0;
        return Math.min(totalPages - 1, Math.max(0, Math.floor((ch.lineIndex / totalLines) * totalPages)));
    }
    var byPage = {};
    for (var i = 0; i < chapters.length; i++) {
        var p = pageOf(chapters[i]);
        if (!byPage[p]) byPage[p] = [];
        byPage[p].push(chapters[i]);
    }
    var pagesWithMultiple = {};
    for (var p in byPage) {
        if (byPage[p].length >= 2 && Number(p) < densePageLimit) pagesWithMultiple[p] = true;
    }
    return chapters.filter(function(ch) { return !pagesWithMultiple[String(pageOf(ch))]; });
}

/** 从引擎逐页取文拼接全文，并得到每行对应的页码（用于 MOBI 等无原始缓冲的格式） */
function getFullTextAndLineToPage(renderer, totalPages) {
    if (!renderer || typeof renderer.getPageText !== 'function' || totalPages <= 0)
        return { fullText: '', totalLines: 0, lineToPage: [] };
    var pageTexts = [];
    for (var p = 0; p < totalPages; p++)
        pageTexts.push(renderer.getPageText(p) || '');
    var fullText = pageTexts.join('\n');
    var lineToPage = [];
    for (var i = 0; i < pageTexts.length; i++) {
        var lines = pageTexts[i].split(/\r?\n/);
        for (var j = 0; j < lines.length; j++)
            lineToPage.push(i);
    }
    return { fullText: fullText, totalLines: lineToPage.length, lineToPage: lineToPage };
}

/** 批量模式：仅专家模式且勾选「批量转换」时为 true；用于多文件列表与导出全部 */
let loadedFiles = [];
let currentFileIndex = 0;
let batchModeEnabled = false;

// -------------------- Markdown → HTML（带适配样式） --------------------
var MARKDOWN_HTML_STYLE = [
    'body { font-family: serif; font-size: 1em; line-height: 1.6; color: #000; margin: 0.5em 0; }',
    'h1 { font-size: 1.6em; font-weight: bold; margin: 0.6em 0 0.3em; border-bottom: 1px solid #ccc; padding-bottom: 0.2em; color: #000; }',
    'h2 { font-size: 1.4em; font-weight: bold; margin: 0.55em 0 0.25em; color: #000; }',
    'h3 { font-size: 1.25em; font-weight: bold; margin: 0.5em 0 0.2em; color: #000; }',
    'h4,h5,h6 { font-size: 1.1em; font-weight: bold; margin: 0.45em 0 0.2em; color: #000; }',
    'p { margin: 0.4em 0; text-indent: 0; color: #000; }',
    'pre, code { font-family: monospace; background: rgba(0,0,0,0.06); color: #000; }',
    'pre { padding: 0.5em; overflow: auto; border-radius: 4px; margin: 0.5em 0; white-space: pre-wrap; }',
    'code { padding: 0.15em 0.35em; border-radius: 3px; font-size: 0.95em; }',
    'pre code { padding: 0; background: none; }',
    'blockquote { margin: 0.5em 0; padding-left: 1em; border-left: 4px solid #666; color: #000; }',
    'ul, ol { margin: 0.4em 0; padding-left: 1.5em; }',
    'li { margin: 0.2em 0; color: #000; }',
    'a { color: #000; text-decoration: underline; }',
    'a:hover { text-decoration: underline; }',
    'hr { border: none; border-top: 1px solid #333; margin: 0.8em 0; }',
    'strong { font-weight: bold; color: #000; }',
    'em { font-style: italic; color: #000; }',
    'table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }',
    'th, td { border: 1px solid #333; padding: 0.35em 0.6em; text-align: left; color: #000; }',
    'th { background: rgba(0,0,0,0.08); font-weight: bold; }'
].join('\n');

function markdownToHtml(md) {
    if (typeof md !== 'string') return '';
    var html = [];
    var lines = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var i = 0;
    var inFenced = false;
    var fenceChar = '';
    var fenceLen = 0;
    var codeBlock = [];

    function flushCodeBlock() {
        if (codeBlock.length) {
            var code = codeBlock.join('\n');
            code = escapeHtml(code);
            html.push('<pre><code>' + code + '</code></pre>');
            codeBlock = [];
        }
    }

    function escapeHtml(s) {
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function parseInline(line) {
        return line
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\\\*/g, '\u0001').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\u0001/g, '*')
            .replace(/\\_/g, '\u0002').replace(/__(.+?)__/g, '<strong>$1</strong>').replace(/\u0002/g, '_')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/_(.+?)_/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\[([^\]]*)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    }

    while (i < lines.length) {
        var line = lines[i];
        var trimmed = line.trimRight();

        if (inFenced) {
            if (trimmed.slice(0, fenceLen) === fenceChar && /^[\s`~]*$/.test(trimmed.slice(fenceLen))) {
                flushCodeBlock();
                inFenced = false;
                i++;
                continue;
            }
            codeBlock.push(line);
            i++;
            continue;
        }

        var fc = trimmed.slice(0, 3);
        if ((fc === '```' || fc === '~~~') && /^[`~]{3,}\s*$/.test(trimmed)) {
            flushCodeBlock();
            var fenceMatch = trimmed.match(/^([`~]+)/);
            fenceChar = fenceMatch[1];
            fenceLen = fenceChar.length;
            inFenced = true;
            i++;
            continue;
        }

        if (/^#{1,6}\s/.test(trimmed)) {
            var level = trimmed.match(/^#+/)[0].length;
            if (level > 6) level = 6;
            var headText = trimmed.replace(/^#+\s*/, '');
            html.push('<h' + level + '>' + parseInline(headText) + '</h' + level + '>');
            i++;
            continue;
        }

        if (/^>\s?/.test(trimmed)) {
            var blockquoteLines = [];
            while (i < lines.length && /^>\s?/.test(lines[i].trimRight())) {
                blockquoteLines.push(lines[i].replace(/^>\s?/, '').trimRight());
                i++;
            }
            html.push('<blockquote><p>' + parseInline(blockquoteLines.join(' ')) + '</p></blockquote>');
            continue;
        }

        if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
            var listTag = /^\d+\.\s+/.test(trimmed) ? 'ol' : 'ul';
            html.push('<' + listTag + '>');
            while (i < lines.length) {
                var li = lines[i];
                var liTrim = li.trimRight();
                var bullet = /^[-*+]\s+/.test(liTrim) || /^\d+\.\s+/.test(liTrim);
                if (!bullet && liTrim !== '') break;
                if (bullet) {
                    var content = liTrim.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '');
                    html.push('<li>' + parseInline(content) + '</li>');
                }
                i++;
            }
            html.push('</' + listTag + '>');
            continue;
        }

        if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) {
            html.push('<hr>');
            i++;
            continue;
        }

        if (trimmed === '') {
            i++;
            continue;
        }

        html.push('<p>' + parseInline(trimmed) + '</p>');
        i++;
    }

    flushCodeBlock();
    return html.join('\n');
}

function markdownToHtmlDocument(md, title) {
    var body = markdownToHtml(md);
    var raw = (title && title.length) ? title : 'Document';
    var docTitle = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + docTitle + '</title>\n<style>\n' + MARKDOWN_HTML_STYLE + '\n</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>';
}

var EPUB_FONT_DEBUG = true;
var SUPPRESS_FT_NOISE_LOGS = true;
// Large font byte writes to many MEMFS paths can pressure WASM heap.
// Keep disabled by default; only enable for targeted debugging.
var ENABLE_MEMFS_FONT_FALLBACK = false;
var _fontRefLogCount = 0;
var ENABLE_IMAGE_FORMAT_COMPAT = true;

function fontDebug() {
    if (!EPUB_FONT_DEBUG) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[FONT-DEBUG]');
    console.log.apply(console, args);
}
// Persistent WASM pointer for the loaded EPUB data.
// CREngine stores this ptr internally and reads from it on every repagination.
// Must NOT be freed while any EPUB is loaded — free it only when loading a new EPUB.
// 单实例模式：仅保留一份 EPUB 数据，不再维护“无图”副本。
var currentEpubPtr = 0;

function createCREngineModuleOptions() {
    if (!SUPPRESS_FT_NOISE_LOGS) return {};
    return {
        printErr: function(text) {
            var msg = String(text || '');
            // Filter only known noisy FreeType path-probe failures.
            if (msg.indexOf('FT_New_Face failed: 0x2') !== -1) return;
            if (msg.indexOf('loadFromFile: FT_New_Face failed: 0x2') !== -1) return;
            console.error(msg);
        }
    };
}

/** Match HTML that contains image elements (img/svg/image). */
var RE_HTML_IMAGE = /<(?:img|svg|image)\b/i;

/**
 * From EPUB zip, parse OPF spine and mark each spine item that has images in its HTML.
 * Returns { spineCount, spineHasImages: boolean[] } for mapping pageIndex -> spine -> hasImages.
 */
async function buildSpineImageFlags(epubZip) {
    var spineHasImages = [];
    try {
        var containerFile = epubZip.files['META-INF/container.xml'];
        if (!containerFile) return { spineCount: 0, spineHasImages: [] };
        var containerXml = await containerFile.async('string');
        var opfMatch = containerXml.match(/full-path="([^"]+)"/);
        if (!opfMatch) return { spineCount: 0, spineHasImages: [] };
        var opfPath = opfMatch[1];
        var opfDir = opfPath.replace(/[^/]*$/, '');
        var opfFile = epubZip.files[opfPath];
        if (!opfFile) return { spineCount: 0, spineHasImages: [] };
        var opfXml = await opfFile.async('string');

        var manifest = {};
        var manifestRe = /<item\s+[^>]*\bid="([^"]+)"[^>]*\bhref="([^"]+)"/gi;
        var m;
        while ((m = manifestRe.exec(opfXml)) !== null) {
            manifest[m[1]] = m[2];
        }
        var spineIds = [];
        var spineRe = /<itemref\s+[^>]*\bidref="([^"]+)"/gi;
        while ((m = spineRe.exec(opfXml)) !== null) {
            spineIds.push(m[1]);
        }
        for (var i = 0; i < spineIds.length; i++) {
            var href = manifest[spineIds[i]];
            if (!href) {
                spineHasImages.push(false);
                continue;
            }
            var fullPath = (opfDir + href).replace(/\/\/+/g, '/').replace(/^\//, '');
            var isHtml = /\.(x?html?|htm)$/i.test(fullPath);
            if (!isHtml) {
                spineHasImages.push(false);
                continue;
            }
            var entry = epubZip.files[fullPath];
            if (!entry) {
                spineHasImages.push(false);
                continue;
            }
            var html = await entry.async('string');
            spineHasImages.push(RE_HTML_IMAGE.test(html));
        }
        return { spineCount: spineHasImages.length, spineHasImages: spineHasImages };
    } catch (e) {
        console.warn('[buildSpineImageFlags]', e);
        return { spineCount: 0, spineHasImages: [] };
    }
}

async function detectImageHeavyEpub(data) {
    try {
        var zip = await JSZip.loadAsync(data);
        var files = Object.keys(zip.files);
        var imageCount = 0;
        var htmlPaths = [];
        for (var i = 0; i < files.length; i++) {
            var p = files[i];
            var f = zip.files[p];
            if (!f || f.dir) continue;
            if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(p)) imageCount++;
            if (/\.(html|xhtml|htm)$/i.test(p)) htmlPaths.push(p);
        }
        if (htmlPaths.length === 0) return false;

        // Sample several chapters to avoid full-book decode cost.
        var sampleSize = Math.min(htmlPaths.length, 20);
        var totalTextLen = 0;
        var pagesWithImages = 0;
        for (var j = 0; j < sampleSize; j++) {
            var html = await zip.files[htmlPaths[j]].async('string');
            if (/<(img|svg|image)\b/i.test(html)) pagesWithImages++;
            var text = html
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            totalTextLen += text.length;
        }

        var avgTextLen = totalTextLen / sampleSize;
        var imagePageRatio = pagesWithImages / sampleSize;
        // Comics/manga-like books: lots of images with very low text density.
        return imageCount >= htmlPaths.length && imagePageRatio >= 0.8 && avgTextLen <= 160;
    } catch (e) {
        console.warn('[detectImageHeavyEpub] failed:', e);
        return false;
    }
}

async function preprocessEpub(data, indent, spacing, options) {
    options = options || {};
    var hideImages = options.hideImages === true;
    var epubZip = await JSZip.loadAsync(data);
    _fontReferencedPaths = [];
    _fontReferencedRawPaths = [];
    _fontRefLogCount = 0;

    await stripEpubFonts(epubZip);
    if (ENABLE_IMAGE_FORMAT_COMPAT) {
        await transcodeUnsupportedImagesInZip(epubZip);
    }

    var files = Object.keys(epubZip.files);

    for (var i = 0; i < files.length; i++) {
        var path = files[i];
        var zipFile = epubZip.files[path];
        if (!zipFile || zipFile.dir) continue;

        if (/\.css$/i.test(path)) {
            var css = await zipFile.async('string');
            collectFontRefPathsFromCss(css, path);
            var cleanedCss = cleanCss(css);
            epubZip.file(path, cleanedCss);
        }

        if (/\.(html|xhtml|htm)$/i.test(path)) {
            if (LOG_FONT_STRIP) console.log('[font-strip] preprocessEpub: processing HTML', path);
            var html = await zipFile.async('string');
            html = normalizeSvgWrappedCoverImage(html, path);
            html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, function(match, open, css, close) {
                collectFontRefPathsFromCss(css, path);
                return match;
            });
            html = html.replace(/<link\b[^>]*href\s*=\s*["'][^"']*\.(ttf|otf|woff2?|eot)["'][^>]*\/?>/gi, '');
            html = cleanHtmlStyles(html);
            html = stripLeadingEmSpaces(html);
            html = injectEpaperCss(html, indent || 0, spacing || 0);
            if (hideImages) {
                var hideCss = '<style type="text/css">' +
                    'img, svg, image, object, video, figure { visibility: hidden !important; }' +
                    '</style>';
                if (html.indexOf('</head>') !== -1) {
                    html = html.replace('</head>', hideCss + '</head>');
                } else {
                    html = hideCss + html;
                }
            }
            epubZip.file(path, html);
        }
    }

    var result = await epubZip.generateAsync({ type: 'uint8array' });
    fontDebug('[preprocessEpub] summary', {
        strippedCount: _strippedFontPaths.length,
        referencedResolvedCount: _fontReferencedPaths.length,
        referencedRawCount: _fontReferencedRawPaths.length,
        strippedSample: _strippedFontPaths.slice(0, 8),
        referencedSample: _fontReferencedPaths.slice(0, 8),
        rawSample: _fontReferencedRawPaths.slice(0, 8)
    });
    return result;
}

function getMimeByImageExt(path) {
    var p = String(path || '').toLowerCase();
    if (p.endsWith('.webp')) return 'image/webp';
    if (p.endsWith('.avif')) return 'image/avif';
    if (p.endsWith('.jp2') || p.endsWith('.j2k') || p.endsWith('.jpf')) return 'image/jp2';
    if (p.endsWith('.heic')) return 'image/heic';
    if (p.endsWith('.heif')) return 'image/heif';
    if (p.endsWith('.tif') || p.endsWith('.tiff')) return 'image/tiff';
    return 'application/octet-stream';
}

function isLikelyUnsupportedImageExt(path) {
    return /\.(webp|avif|jp2|j2k|jpf|heic|heif|tiff?)$/i.test(String(path || ''));
}

async function transcodeImageBytesToPng(bytes, srcMime) {
    try {
        var blob = new Blob([bytes], { type: srcMime || 'application/octet-stream' });
        var bmp = await createImageBitmap(blob);
        var canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        var c2d = canvas.getContext('2d');
        c2d.drawImage(bmp, 0, 0);
        if (typeof bmp.close === 'function') bmp.close();
        var outBlob = await new Promise(function(resolve) { canvas.toBlob(resolve, 'image/png'); });
        if (!outBlob) return null;
        var outBuf = await outBlob.arrayBuffer();
        return new Uint8Array(outBuf);
    } catch (e) {
        return null;
    }
}

async function transcodeUnsupportedImagesInZip(epubZip) {
    var files = Object.keys(epubZip.files);
    var converted = 0;
    var failed = 0;
    for (var i = 0; i < files.length; i++) {
        var path = files[i];
        var zipFile = epubZip.files[path];
        if (!zipFile || zipFile.dir) continue;
        if (!isLikelyUnsupportedImageExt(path)) continue;

        try {
            var src = await zipFile.async('uint8array');
            var mime = getMimeByImageExt(path);
            var png = await transcodeImageBytesToPng(src, mime);
            if (png && png.length > 0) {
                // Keep original href/path unchanged so OPF/CSS references remain valid.
                // CREngine will decode by stream signature and can read PNG.
                epubZip.file(path, png);
                converted++;
                console.log('[image-compat] transcoded to PNG bytes:', path, 'from', mime);
            } else {
                failed++;
                console.warn('[image-compat] transcode failed (decoder unsupported):', path, mime);
            }
        } catch (err) {
            failed++;
            console.warn('[image-compat] transcode error:', path, err);
        }
    }
    if (converted || failed) {
        console.log('[image-compat] summary', { converted: converted, failed: failed });
    }
}

function normalizeSvgWrappedCoverImage(html, sourcePath) {
    if (!html) return html;
    // Typical failing cover page pattern:
    // <svg ...><image ... xlink:href="images/cover.jpeg"/></svg>
    // Convert to plain <img> for robust CREngine compatibility.
    var isCoverLike = /calibre:cover/i.test(html) || /<title>\s*cover\s*<\/title>/i.test(html) || /titlepage/i.test(String(sourcePath || ''));
    if (!isCoverLike) return html;

    var svgImageRe = /<svg\b[\s\S]*?<image\b[^>]*(?:xlink:href|href)\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/svg>/i;
    var m = html.match(svgImageRe);
    if (!m || !m[1]) return html;
    var href = m[1];
    var replacement =
        '<div class="cr-cover-fallback">' +
        '<img src="' + href + '" alt="cover" style="display:block;margin:0 auto;max-width:100%;height:auto;" />' +
        '</div>';
    var out = html.replace(svgImageRe, replacement);
    console.log('[image-compat] normalized svg cover to img in', sourcePath, 'href=', href);
    return out;
}

var _strippedFontPaths = [];
var _fontReferencedPaths = [];
var _fontReferencedRawPaths = [];

function normalizeZipPath(path) {
    if (!path) return '';
    var p = String(path).replace(/\\/g, '/');
    var q = p.indexOf('?');
    if (q >= 0) p = p.slice(0, q);
    var h = p.indexOf('#');
    if (h >= 0) p = p.slice(0, h);
    p = p.replace(/^\/+/, '');

    var parts = p.split('/');
    var stack = [];
    for (var i = 0; i < parts.length; i++) {
        var seg = parts[i];
        if (!seg || seg === '.') continue;
        if (seg === '..') {
            if (stack.length > 0) stack.pop();
            continue;
        }
        stack.push(seg);
    }
    return stack.join('/');
}

function resolveZipReferencePath(baseFilePath, refPath) {
    if (!refPath) return '';
    var raw = String(refPath).trim().replace(/^['"]|['"]$/g, '');
    var lower = raw.toLowerCase();
    if (!raw || lower.indexOf('data:') === 0 || lower.indexOf('http:') === 0 ||
        lower.indexOf('https:') === 0 || lower.indexOf('blob:') === 0 ||
        lower.indexOf('file:') === 0 || raw[0] === '#') {
        return '';
    }
    if (raw[0] === '/') return normalizeZipPath(raw);
    var baseDir = String(baseFilePath || '').replace(/[^/]*$/, '');
    return normalizeZipPath(baseDir + raw);
}

function collectFontRefPathsFromCss(cssText, sourcePath) {
    if (!cssText) return;
    var seen = Object.create(null);
    var faceBlocks = cssText.match(/@font-face\s*\{[\s\S]*?\}/gi) || [];
    for (var i = 0; i < faceBlocks.length; i++) {
        var block = faceBlocks[i];
        var m;
        var urlRe = /url\s*\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
        while ((m = urlRe.exec(block)) !== null) {
            var rawPath = String(m[2] || '').trim().replace(/^['"]|['"]$/g, '');
            if (rawPath) _fontReferencedRawPaths.push(rawPath);
            var resolved = resolveZipReferencePath(sourcePath, rawPath);
            if (_fontRefLogCount < 20 && rawPath) {
                fontDebug('[collectFontRefPathsFromCss]', { sourcePath: sourcePath, rawPath: rawPath, resolvedPath: resolved });
                _fontRefLogCount++;
            }
            if (!resolved || seen[resolved]) continue;
            seen[resolved] = true;
            _fontReferencedPaths.push(resolved);
        }
    }
}

function isLikelyFontPath(path) {
    if (!path) return false;
    var p = String(path).toLowerCase();
    return /\.(ttf|otf|ttc|woff2?|eot)(?:$|[?#])/i.test(p) ||
        p.indexOf('font') >= 0 ||
        p.indexOf('fzlth') >= 0 ||
        p.indexOf('fzss') >= 0 ||
        p.indexOf('songti') >= 0 ||
        p.indexOf('kaiti') >= 0 ||
        p.indexOf('heiti') >= 0 ||
        p.indexOf('xxxxxxxx') >= 0;
}

function getFallbackFontData() {
    if (!fontPtrCache || !fontPtrCache.length) return null;
    var best = null;
    for (var i = 0; i < fontPtrCache.length; i++) {
        var entry = fontPtrCache[i];
        if (!entry || !entry.originalData || !entry.originalData.length) continue;
        if (!best || entry.originalData.length < best.originalData.length) best = entry;
    }
    return best ? best.originalData : null;
}

function writeSingleFallbackFontPath(targetPath) {
    if (!Module || !Module.FS || !fontPtrCache || !fontPtrCache.length) return false;
    var data = getFallbackFontData();
    if (!data) return false;
    if (targetPath.indexOf('/..namedfork/rsrc') >= 0) {
        // Resource fork pseudo-path is not a writable real file in MEMFS.
        return false;
    }
    try {
        var dir = targetPath.replace(/[^/]*$/, '');
        if (dir) {
            try { Module.FS.mkdirTree(dir); } catch (e) { /* exists */ }
        }
        Module.__fontOpenFallbackBypass = true;
        Module.FS.writeFile(targetPath, data);
        console.log('[FONT] dynamic fallback write OK:', targetPath);
        return true;
    } catch (e) {
        console.warn('[FONT] dynamic fallback write failed:', targetPath, e);
        return false;
    } finally {
        Module.__fontOpenFallbackBypass = false;
    }
}

function _buildAllowedFontPathSet() {
    var allowed = Object.create(null);
    var sources = [_strippedFontPaths, _fontReferencedPaths, _fontReferencedRawPaths];
    for (var s = 0; s < sources.length; s++) {
        var arr = sources[s];
        if (!arr) continue;
        for (var i = 0; i < arr.length; i++) {
            var raw = String(arr[i] || '').trim();
            if (!raw) continue;
            var n = normalizeZipPath(raw);
            if (n) {
                allowed['/' + n] = true;
                allowed[n] = true;
            }
            var stripped = raw.replace(/^\/+/, '');
            if (stripped) {
                allowed['/' + stripped] = true;
                allowed[stripped] = true;
            }
        }
    }
    return allowed;
}

async function stripEpubFonts(epubZip) {
    var fontExt = /\.(ttf|otf|woff2?|eot)$/i;
    var fontMediaType = /(?:font\/|application\/(?:vnd\.ms-opentype|x-font|font\-woff|font))/i;

    _strippedFontPaths = [];

    // 1. Remove font binary files from ZIP and record their paths
    Object.keys(epubZip.files).forEach(function(path) {
        if (fontExt.test(path)) {
            console.log('[stripEpubFonts] removing font file:', path);
            _strippedFontPaths.push(path);
            delete epubZip.files[path];
        }
    });

    // 2. Remove font <item> entries from OPF manifest so CREngine never queues them
    try {
        var containerFile = epubZip.files['META-INF/container.xml'];
        if (!containerFile) return;
        var containerXml = await containerFile.async('string');
        var opfMatch = containerXml.match(/full-path=["']([^"']+)["']/);
        if (!opfMatch) return;
        var opfPath = opfMatch[1];
        var opfDir = opfPath.replace(/[^/]*$/, '');
        var opfFile = epubZip.files[opfPath];
        if (!opfFile) return;

        var opfXml = await opfFile.async('string');
        var before = opfXml.length;

        // Robust removal: match <item ... /> or <item ...></item> with any attribute order and single/double quotes
        function isFontItem(tagContent) {
            var hrefMatch = tagContent.match(/href\s*=\s*["']([^"']+)["']/i);
            var mtMatch = tagContent.match(/media-type\s*=\s*["']([^"']+)["']/i);
            if (hrefMatch && fontExt.test(hrefMatch[1])) return true;
            if (mtMatch && fontMediaType.test(mtMatch[1])) return true;
            return false;
        }
        function removeReferencedFontFile(tagContent) {
            var hrefMatch = tagContent.match(/href\s*=\s*["']([^"']+)["']/i);
            if (!hrefMatch) return;
            var href = String(hrefMatch[1] || '').trim();
            if (!href) return;
            var resolved = normalizeZipPath((opfDir + href).replace(/\\/g, '/'));
            if (!resolved) return;
            if (epubZip.files[resolved]) {
                console.log('[stripEpubFonts] removing manifest-referenced font file:', resolved);
                _strippedFontPaths.push(resolved);
                delete epubZip.files[resolved];
            }
        }
        // Remove self-closing <item ... />
        opfXml = opfXml.replace(/<item\b([^>]*)\s*\/>/gi, function(m, attrs) {
            if (isFontItem(attrs)) {
                console.log('[stripEpubFonts] OPF removing font item (self-closing):', attrs.slice(0, 120));
                removeReferencedFontFile(attrs);
                return '';
            }
            return m;
        });
        // Remove full <item ...></item>
        opfXml = opfXml.replace(/<item\b([^>]*)>[\s\S]*?<\/item>/gi, function(m, attrs) {
            if (isFontItem(attrs)) {
                console.log('[stripEpubFonts] OPF removing font item (full):', attrs.slice(0, 120));
                removeReferencedFontFile(attrs);
                return '';
            }
            return m;
        });

        console.log('[stripEpubFonts] OPF trimmed', before - opfXml.length, 'chars from', opfPath);
        if (LOG_FONT_STRIP) {
            var itemTags = opfXml.match(/<item\b[^>]*>/gi);
            if (itemTags) {
                var fontLike = [];
                itemTags.forEach(function(tag) {
                    var m = tag.match(/href\s*=\s*["']([^"']+)["']/i);
                    if (m && fontExt.test(m[1])) fontLike.push(m[1]);
                });
                if (fontLike.length) console.warn('[stripEpubFonts] WARNING: font-like hrefs still in OPF after strip:', fontLike);
            }
        }
        epubZip.file(opfPath, opfXml);
    } catch (e) {
        console.warn('[stripEpubFonts] OPF processing failed:', e);
    }
}

/**
 * Write the default loaded font data to MEMFS at every path that was stripped
 * from the EPUB, so if CREngine's internal CSS resolver still tries to
 * loadFromFile on those paths, FT_New_Face succeeds instead of returning 0x2.
 */
function writeFallbackFontsToMemfs() {
    if (!ENABLE_MEMFS_FONT_FALLBACK) {
        fontDebug('[writeFallbackFontsToMemfs] skipped (disabled)');
        return;
    }
    if (!Module || !Module.FS || !fontPtrCache.length) return;
    var data = getFallbackFontData();
    if (!data) return;
    var combined = _strippedFontPaths.concat(_fontReferencedPaths, _fontReferencedRawPaths);
    if (!combined.length) return;
    var dedup = Object.create(null);
    var writeCount = 0;
    var failCount = 0;
    var fsCwd = '/';
    try {
        if (typeof Module.FS.cwd === 'function') fsCwd = Module.FS.cwd() || '/';
    } catch (e) {
        fsCwd = '/';
    }

    for (var i = 0; i < combined.length; i++) {
        var raw = String(combined[i] || '').trim();
        var p = normalizeZipPath(raw);
        var relCandidates = [];
        if (p) relCandidates.push(p);
        if (raw) {
            var rawNoLead = raw.replace(/^\/+/, '');
            if (rawNoLead && relCandidates.indexOf(rawNoLead) < 0) relCandidates.push(rawNoLead);
        }

        for (var j = 0; j < relCandidates.length; j++) {
            var rel = relCandidates[j];
            var pathCandidates = ['/' + rel];
            if (fsCwd && fsCwd !== '/') {
                var cwdPath = fsCwd.replace(/\/+$/, '') + '/' + rel;
                pathCandidates.push(cwdPath.replace(/\/+/g, '/'));
            }
            for (var k = 0; k < pathCandidates.length; k++) {
                var target = pathCandidates[k];
                if (!target || dedup[target]) continue;
                dedup[target] = true;
                try {
                    var dir = target.replace(/[^/]*$/, '');
                    if (dir) {
                        try { Module.FS.mkdirTree(dir); } catch (e) { /* exists */ }
                    }
                    Module.FS.writeFile(target, data);
                    console.log('[FONT] MEMFS fallback write OK:', target);
                    writeCount++;
                } catch (e) {
                    console.warn('[FONT] MEMFS fallback write failed:', target, e);
                    failCount++;
                }
            }
        }
    }
    fontDebug('[writeFallbackFontsToMemfs] summary', {
        fsCwd: fsCwd,
        combinedCount: combined.length,
        uniqueTargetCount: Object.keys(dedup).length,
        writeCount: writeCount,
        failCount: failCount
    });
}

var LOG_FONT_STRIP = false;

function removeFontFaceBlocks(css) {
    var out = '';
    var re = /@font-face\s*\{/gi;
    var lastEnd = 0;
    var m;
    var removed = 0;
    re.lastIndex = 0;
    while ((m = re.exec(css)) !== null) {
        out += css.slice(lastEnd, m.index);
        var start = m.index + m[0].length;
        var depth = 1;
        while (start < css.length && depth > 0) {
            var c = css[start];
            if (c === '\\') { start += 2; continue; }
            if (c === '"' || c === "'") {
                var q = c;
                start++;
                while (start < css.length && (css[start] !== q || css[start - 1] === '\\')) start++;
                start++;
                continue;
            }
            if (c === '/' && css[start + 1] === '*') {
                start = css.indexOf('*/', start + 2) + 2;
                if (start === 1) start = css.length;
                continue;
            }
            if (c === '{') depth++;
            else if (c === '}') depth--;
            start++;
        }
        if (depth === 0) { lastEnd = start; removed++; } else lastEnd = m.index;
    }
    if (LOG_FONT_STRIP && removed > 0) console.log('[font-strip] removeFontFaceBlocks: removed', removed, 'block(s)');
    return out + css.slice(lastEnd);
}

/** 去掉 CSS 中指向字体文件的 url()，防止 CREngine 解析路径后 loadFromFile */
function stripFontUrlsInCss(css) {
    var before = css;
    // Any @font-face src containing url(...) can trigger CREngine loadFromFile; remove src entirely.
    var after = css.replace(/src\s*:\s*[^;]*url\s*\(\s*[^)]*\)\s*[^;]*;?/gi, '');
    after = after.replace(/src\s*:\s*[^;]*url\s*\(\s*["']?[^"')]*\.(ttf|otf|woff2?|eot)["']?\s*\)[^;]*;?/gi, '');
    after = after.replace(/url\s*\(\s*["']?[^"')]*\.(ttf|otf|woff2?|eot)["']?\s*\)/gi, 'url()');
    after = after.replace(/url\s*\(\s*["']?[^"')]*(?:font|Font)[^"')]*["']?\s*\)/gi, 'url()');
    if (LOG_FONT_STRIP && after !== before) console.log('[font-strip] stripFontUrlsInCss: replaced font url()');
    return after;
}

var EPUB_FORCE_FONT_FACE = 'Noto Sans SC';

/** 返回当前应在 EPUB 预处理 CSS 中使用的字体 face name。优先取用户选择的字体（若已在 fontFaceNameMap），否则取已加载字体列表第一个，兜底 Noto Sans SC。 */
function getEpubForceFontFace() {
    if (typeof fontFamily !== 'undefined' && fontFamily && fontFamily.value &&
        typeof fontFaceNameMap !== 'undefined' && fontFaceNameMap[fontFamily.value]) {
        return fontFaceNameMap[fontFamily.value];
    }
    if (typeof fontFaceNameMap !== 'undefined' && typeof loadedFonts !== 'undefined') {
        var iter = loadedFonts.values();
        var entry = iter.next();
        while (!entry.done) {
            var fn = fontFaceNameMap[entry.value];
            if (fn) return fn;
            entry = iter.next();
        }
    }
    return EPUB_FORCE_FONT_FACE;
}

/** 获取当前用户选择的字体名称，用于 EPUB 预处理 */
function getCurrentFontFaceName() {
    // Must return a REAL registered font key that CREngine can match via CSS font-family.
    // Generic names like "sans-serif" are not safe in CREngine.
    if (typeof fontFamily !== 'undefined' && fontFamily && fontFamily.value &&
        typeof fontFaceNameMap !== 'undefined' && fontFaceNameMap[fontFamily.value]) {
        return fontFaceNameMap[fontFamily.value];
    }
    return getEpubForceFontFace();
}

function hardStripStyles(cssText) {
    var currentFont = getCurrentFontFaceName();
    console.log('[FONT] hardStripStyles using font:', currentFont);
    return cssText
        .replace(/font-family\s*:\s*[^;!]+(!important)?\s*/gi, 'font-family: "' + currentFont + '" !important ')
        .replace(/font-variant\s*:\s*[^;]+;?/gi, '')
        .replace(/font-variant-[a-z-]+\s*:\s*[^;]+;?/gi, '')
        .replace(/font-feature-settings\s*:\s*[^;]+;?/gi, '')
        .replace(/font-variation-settings\s*:\s*[^;]+;?/gi, '')
        .replace(/font\s*:\s*(?!family|size|weight|style|variant|feature|variation)[^;}{]+;/gi, function(m) {
            return 'font-family: "' + currentFont + '" !important;';
        });
}

function cleanCss(css) {
    css = removeFontFaceBlocks(css);
    css = stripFontUrlsInCss(css);
    css = hardStripStyles(css);
    // CREngine 基于较旧的 CSS 子集，以下属性会导致错版或崩溃，统一移除后依赖默认/注入样式
    // 移除 line-height 以便界面「行高」滑块（setInterlineSpace）生效
    var problematic = [
        /line-height\s*:\s*[^;]+;?/gi,
        /float\s*:\s*[^;]+;?/gi,
        /position\s*:\s*(fixed|sticky|absolute)[^;]*;?/gi,
        /display\s*:\s*(flex|grid|inline-flex|inline-grid)[^;]*;?/gi,
        /@media[^{]+\{[^}]*\}/gi,
        /transform[^;]*;?/gi,
        /animation[^;]*;?/gi,
        /transition[^;]*;?/gi,
        /filter\s*:\s*[^;]+;?/gi,
        /backdrop-filter[^;]*;?/gi,
        /object-fit[^;]*;?/gi,
        /gap\s*:\s*[^;]+;?/gi,
        /inset[^;]*;?/gi,
        /z-index\s*:\s*[^;]+;?/gi,
        /box-sizing\s*:\s*border-box[^;]*;?/gi,
        /font-variant\s*:\s*[^;]+;?/gi,
        /font-variant-[a-z-]+\s*:\s*[^;]+;?/gi,
        /font-feature-settings\s*:\s*[^;]+;?/gi,
        /font-variation-settings\s*:\s*[^;]+;?/gi
    ];

    for (var i = 0; i < problematic.length; i++) {
        css = css.replace(problematic[i], '');
    }

    return css;
}

function cleanHtmlStyles(html) {
    html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, function(match, open, css, close) {
        var beforeLen = css.length;
        css = removeFontFaceBlocks(stripFontUrlsInCss(css));
        css = css.replace(/line-height\s*:\s*[^;}+]+;?/gi, '');
        css = hardStripStyles(css);
        if (LOG_FONT_STRIP) {
            console.log('[font-strip] <style> len', beforeLen, '->', css.length);
            console.log('[font-strip] <style> after (first 500):', css.slice(0, 500));
            var famMatches = css.match(/font-family\s*:\s*[^;}+]+/g);
            if (famMatches) console.log('[font-strip] font-family in result:', famMatches);
        }
        return open + css + close;
    });
    var stripInline = [
        /line-height\s*:\s*[^;"]+;?/gi,
        /float\s*:\s*[^;"]+;?/gi,
        /position\s*:\s*(fixed|sticky|absolute)[^;"]*;?/gi,
        /display\s*:\s*(flex|grid|inline-flex|inline-grid)[^;"]*;?/gi,
        /transform\s*:[^;"]+;?/gi,
        /animation\s*:[^;"]+;?/gi,
        /transition\s*:[^;"]+;?/gi,
        /filter\s*:[^;"]+;?/gi,
        /object-fit\s*:[^;"]+;?/gi
    ];
    return html.replace(/style="[^"]*"/gi, function(match) {
        var style = match.slice(7, -1);
        for (var i = 0; i < stripInline.length; i++) {
            style = style.replace(stripInline[i], '');
        }
        style = hardStripStyles(style);
        return 'style="' + style + '"';
    });
}

/**
 * 去掉段落开头的全角空格（U+3000）及紧邻空白，使首行缩进完全由用户设置控制、不与书内硬空格累加。
 * 常见于从 Word/Calibre 导出的 EPUB，段落用「　　　」做硬缩进；对所有 EPUB 均执行，避免累加。
 */
function stripLeadingEmSpaces(html) {
    return html.replace(/(<p\b[^>]*>)[\u3000\s]+/g, '$1');
}

function injectEpaperCss(html, indent, spacing) {
    // 段落规则：始终带 !important，覆盖书内 class（如 .msonormal { margin:0 }），避免段落间距/首行缩进无效
    var paraStyle = 'margin-top:0;margin-bottom:' + (spacing > 0 ? spacing + 'px' : '0') + ';';
    if (indent > 0) paraStyle += 'text-indent:' + indent + 'em;';
    var pRule = 'p { ' + paraStyle.replace(/;/g, ' !important;') + ' }';

    // Must use a real registered font face name; CREngine cannot resolve generic names like "sans-serif".
    var ff = getCurrentFontFaceName();
    var epaperCss = '<style type="text/css">' +
        'html, body { margin: 0 !important; padding: 0 !important; height: 100% !important; }' +
        'body, body[class], .calibre1 { font-family: "' + ff + '" !important; font-style: normal !important; font-weight: normal !important; text-align: justify; margin: 0 !important; padding: 0 !important; text-indent: 0; height: 100% !important; }' +
        'h1, h2, h3, h4, h5, h6 { text-indent: 0; margin: 1em 0 0.5em 0; font-family: "' + ff + '" !important; font-weight: normal !important; font-style: normal !important; hyphenate: none; }' +
        'title, .title { text-align: center; text-indent: 0; font-family: "' + ff + '" !important; font-weight: normal !important; font-style: normal !important; hyphenate: none; }' +
        'img, svg, image { display: block !important; margin-left: auto !important; margin-right: auto !important; max-width: 100% !important; height: auto !important; text-align: center !important; }' +
        'img[class*="frame"] { display: inline !important; vertical-align: middle !important; }' +
        '.fs { width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important; display: table !important; }' +
        '.fs .calibre2 { width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important; position: static !important; display: table-cell !important; vertical-align: middle !important; text-align: center !important; }' +
        '.singlepage, .twopage { display: inline-block !important; margin-left: auto !important; margin-right: auto !important; max-height: 100% !important; }' +
        'ul, ol { margin: 0.5em 0; padding-left: 2em; }' +
        'li { margin: 0.25em 0; }' +
        'table { border-collapse: collapse; font-size: 0.9em; }' +
        'td, th { padding: 4px; text-indent: 0; border: 1px solid #333; }' +
        'th { font-family: "' + ff + '" !important; font-weight: normal !important; }' +
        'pre, code { font-family: "' + ff + '" !important; font-style: normal !important; white-space: pre; text-align: left; }' +
        'blockquote { margin: 1em 1.5em; }' +
        'b, strong { font-weight: bold; }' +
        'i, em { font-style: italic; }' +
        'u, ins { text-decoration: underline; }' +
        'del, s, strike { text-decoration: line-through; }' +
        'small { font-size: 83%; }' +
        'big { font-size: 130%; }' +
        'mark { background-color: #eee; }' +
        'cite, dfn, var { font-style: italic; }' +
        'dl { margin: 0.5em 0; }' +
        'dt { font-weight: bold; margin-top: 0.5em; }' +
        'dd { margin-left: 2em; margin-bottom: 0.25em; }' +
        'figure { margin: 0.5em 0; text-align: center; }' +
        'figcaption { font-size: 0.9em; margin-top: 0.25em; color: #555; }' +
        'ruby { ruby-position: over; ruby-align: center; }' +
        'rt { font-size: 0.5em; font-weight: normal; }' +
        pRule +
        '</style>';

    if (html.indexOf('</head>') !== -1) {
        return html.replace('</head>', epaperCss + '</head>');
    }
    return html;
}

function setupDropZone() {
    dropZone.addEventListener('click', function() {
        fileInput.click();
    });

    dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', function() {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        var files = e.dataTransfer.files;
        if (isBatchMode() && files.length > 0) {
            addFiles(Array.from(files));
        } else if (files.length > 0) {
            loadFile(files[0]);
        }
    });

    var previewEmpty = document.getElementById('previewEmpty');
    if (previewEmpty) {
        previewEmpty.addEventListener('click', function() {
            fileInput.click();
        });
        previewEmpty.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.stopPropagation();
            previewEmpty.classList.add('drag-over');
        });
        previewEmpty.addEventListener('dragleave', function() {
            previewEmpty.classList.remove('drag-over');
        });
        previewEmpty.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            previewEmpty.classList.remove('drag-over');
            var files = e.dataTransfer.files;
            if (isBatchMode() && files.length > 0) {
                addFiles(Array.from(files));
            } else if (files.length > 0) {
                loadFile(files[0]);
            }
        });
    }

    fileInput.addEventListener('change', function(e) {
        var files = e.target.files;
        if (!files || files.length === 0) return;
        if (isBatchMode()) {
            addFiles(Array.from(files));
        } else {
            loadFile(files[0]);
        }
        fileInput.value = '';
    });

    replaceFileBtn.addEventListener('click', function() {
        fileInput.click();
    });

    setupBatchMode();
}

function isBatchMode() {
    return (typeof currentMode !== 'undefined' && currentMode === 'expert') && batchModeEnabled;
}

function updateBatchUI() {
    if (typeof currentMode !== 'undefined' && currentMode !== 'expert') {
        batchModeEnabled = false;
        if (document.getElementById('batchModeToggle')) document.getElementById('batchModeToggle').checked = false;
        fileInput.multiple = false;
    }
    var wrap = document.getElementById('fileListContainer');
    if (wrap) wrap.style.display = (typeof currentMode !== 'undefined' && currentMode === 'expert' && batchModeEnabled) ? 'block' : 'none';
    if (batchModeEnabled) updateFileListUI();
    else {
        var btn = document.getElementById('exportAllBtn');
        if (btn) btn.style.display = 'none';
    }
    var replaceBtn = document.getElementById('replaceFileBtn');
    if (replaceBtn) replaceBtn.textContent = (typeof t === 'function' ? t(batchModeEnabled ? 'addFiles' : 'replaceFile') : (batchModeEnabled ? 'Add files' : 'Replace'));
    var dropText = document.querySelector('.drop-zone-text');
    if (dropText) dropText.textContent = (typeof t === 'function' ? t(batchModeEnabled ? 'dropZoneTextBatch' : 'dropZoneText') : (batchModeEnabled ? 'Tap or drop multiple files' : 'Tap or drop file here'));
}

function addFiles(files) {
    var allowed = ['.epub', '.pdf', '.mobi', '.azw', '.prc', '.pdb', '.txt', '.md', '.markdown', '.doc', '.docx', '.docm', '.pptx', '.ppt'];
    function ok(f) {
        var n = (f.name || '').toLowerCase();
        return allowed.some(function(ext) { return n.endsWith(ext); });
    }
    var list = Array.from(files).filter(ok);
    if (list.length === 0) return;
    var firstNew = -1;
    for (var i = 0; i < list.length; i++) {
        var f = list[i];
        var dup = loadedFiles.some(function(item) { return item.name === f.name && item.file.size === f.size; });
        if (!dup) {
            if (firstNew === -1) firstNew = loadedFiles.length;
            loadedFiles.push({ file: f, name: f.name });
        }
    }
    updateFileListUI();
    if (firstNew !== -1) switchToFile(firstNew);
}

function updateFileListUI() {
    var countEl = document.getElementById('fileListCount');
    var itemsEl = document.getElementById('fileListItems');
    var exportAllBtn = document.getElementById('exportAllBtn');
    if (!countEl || !itemsEl) return;
    countEl.textContent = (typeof t === 'function' ? t('fileListCount') : '{0} file(s)').replace('{0}', String(loadedFiles.length));
    itemsEl.innerHTML = '';
    for (var i = 0; i < loadedFiles.length; i++) {
        var info = loadedFiles[i];
        var div = document.createElement('div');
        div.className = 'file-list-item' + (i === currentFileIndex ? ' active' : '');
        div.innerHTML = '<span class="file-list-item-name" title="' + (info.name || '').replace(/"/g, '&quot;') + '">' + (info.name || '') + '</span> <span class="file-list-item-remove" data-index="' + i + '" title="Remove" aria-label="Remove">&times;</span>';
        (function(idx) {
            div.addEventListener('click', function(ev) {
                if (ev.target.classList.contains('file-list-item-remove')) return;
                switchToFile(idx);
            });
        })(i);
        itemsEl.appendChild(div);
    }
    itemsEl.querySelectorAll('.file-list-item-remove').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            removeFile(parseInt(btn.getAttribute('data-index'), 10));
        });
    });
    if (exportAllBtn) exportAllBtn.style.display = (loadedFiles.length > 1) ? 'block' : 'none';
}

function removeFile(index) {
    if (index < 0 || index >= loadedFiles.length) return;
    loadedFiles.splice(index, 1);
    if (loadedFiles.length === 0) {
        currentFileIndex = 0;
        clearPreview();
        updateBatchUI();
        return;
    }
    if (index <= currentFileIndex) currentFileIndex = Math.max(0, currentFileIndex - 1);
    switchToFile(currentFileIndex);
    updateFileListUI();
}

function switchToFile(index) {
    if (index < 0 || index >= loadedFiles.length) return;
    currentFileIndex = index;
    loadFile(loadedFiles[index].file);
    updateFileListUI();
}

function setupBatchMode() {
    var toggle = document.getElementById('batchModeToggle');
    if (toggle) {
        toggle.addEventListener('change', function() {
            batchModeEnabled = toggle.checked;
            fileInput.multiple = batchModeEnabled;
            if (!batchModeEnabled && loadedFiles.length > 1) {
                var keep = loadedFiles[currentFileIndex];
                loadedFiles = keep ? [keep] : [];
                currentFileIndex = 0;
            }
            updateBatchUI();
        });
    }
    var exportAllBtn = document.getElementById('exportAllBtn');
    if (exportAllBtn) {
        exportAllBtn.addEventListener('click', function() {
            if (loadedFiles.length === 0 || !batchModeEnabled) return;
            if (typeof exportAllBatch === 'function') exportAllBatch();
        });
    }
    updateBatchUI();
}

/** 供 setMode 切换专家/简洁时调用，同步批量 UI 与 input.multiple */
function updateBatchModeVisibility() {
    if (typeof currentMode !== 'undefined' && currentMode !== 'expert') {
        batchModeEnabled = false;
        var t = document.getElementById('batchModeToggle');
        if (t) t.checked = false;
        fileInput.multiple = false;
    }
    updateBatchUI();
}

/** 批量导出：逐个 loadFile 再 exportXTC(directDownload)，由「导出全部」按钮触发 */
async function exportAllBatch() {
    if (loadedFiles.length === 0 || !batchModeEnabled) return;
    var N = loadedFiles.length;
    var progressContainer = document.getElementById('progressContainer');
    var progressFill = document.getElementById('progressFill');
    var progressText = document.getElementById('progressText');
    var exportAllBtn = document.getElementById('exportAllBtn');
    if (exportBtn) exportBtn.disabled = true;
    if (exportAllBtn) exportAllBtn.disabled = true;
    if (progressContainer) progressContainer.style.display = 'flex';
    var progressMsg = typeof t === 'function' ? t('progressConverting') : 'Converting file {0} / {1}: {2}';
    try {
        for (var i = 0; i < N; i++) {
            var info = loadedFiles[i];
            if (progressFill) progressFill.style.width = (i / N * 100) + '%';
            if (progressText) progressText.textContent = progressMsg.replace('{0}', String(i + 1)).replace('{1}', String(N)).replace('{2}', info.name || '');
            await loadFile(info.file);
            currentFileIndex = i;
            if (typeof exportXTC === 'function') await exportXTC({ directDownload: true });
            await new Promise(function(r) { setTimeout(r, 300); });
        }
        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.textContent = (typeof t === 'function' ? t('progressExportDone') : 'Export complete!');
    } catch (err) {
        console.error('Export All failed:', err);
        if (progressText) progressText.textContent = (typeof t === 'function' ? t('progressExportFailed') : 'Export failed: ').replace('{0}', err.message);
    }
    setTimeout(function() {
        if (progressContainer) progressContainer.style.display = 'none';
        if (exportBtn) exportBtn.disabled = false;
        if (exportAllBtn) exportAllBtn.disabled = false;
    }, 2000);
}

/** 显示文件加载遮罩，返回 { hide(success) } 在加载完成或失败时调用 */
function showFileLoadingOverlay() {
    var o = document.getElementById('fileLoadingOverlay');
    var textEl = document.getElementById('fileLoadingText');
    if (!o || !textEl) return { hide: function() {} };
    textEl.textContent = (typeof t === 'function' ? t('fileLoading') : 'Loading…');
    o.classList.remove('done');
    o.classList.add('active');
    return {
        hide: function(success) {
            if (success) {
                o.classList.add('done');
                setTimeout(function() { o.classList.remove('active'); o.classList.remove('done'); }, 400);
            } else {
                o.classList.remove('active');
                o.classList.remove('done');
            }
        }
    };
}

async function loadFile(file) {
    var lowerName = file && file.name ? file.name.toLowerCase() : '';
    var isEpub = lowerName.endsWith('.epub');
    var isPdf = lowerName.endsWith('.pdf');
    var isMobi = lowerName.endsWith('.mobi') || lowerName.endsWith('.azw') || lowerName.endsWith('.prc') || lowerName.endsWith('.pdb');
    var isTxt = lowerName.endsWith('.txt');
    var isMarkdown = lowerName.endsWith('.md') || lowerName.endsWith('.markdown');
    var isDoc = lowerName.endsWith('.doc');
    var isDocx = lowerName.endsWith('.docx') || lowerName.endsWith('.docm');
    var isPptx = lowerName.endsWith('.pptx');
    var isPptOld = lowerName.endsWith('.ppt');
    if (isPptOld) {
        alert(t('alertPptOldFormat'));
        return;
    }
    if (!file || (!isEpub && !isPdf && !isMobi && !isTxt && !isMarkdown && !isDoc && !isDocx && !isPptx)) {
        alert(t('alertSelectEpub'));
        return;
    }

    currentFile = { file: file, name: file.name };

    fileName.textContent = file.name;
    dropZone.style.display = 'none';
    fileInfo.style.display = 'flex';

    // 移动端：滚回顶部，确保文件信息和预设按钮可见
    var panelLeft = document.querySelector('.panel-left');
    if (panelLeft) panelLeft.scrollTop = 0;

    if (!wasmReady) {
        alert(t('alertWasmFailed'));
        currentFile = null;
        dropZone.style.display = '';
        fileInfo.style.display = 'none';
        return;
    }

    var fileLoading = showFileLoadingOverlay();
    var fileBuffer = await file.arrayBuffer();
    var originalData = new Uint8Array(fileBuffer);
    currentFile.originalData = originalData;
    currentFile.type = isPdf ? 'pdf' : (isPptx ? 'pptx' : (isMobi ? 'mobi' : (isTxt ? 'txt' : (isMarkdown ? 'markdown' : (isDoc ? 'doc' : (isDocx ? 'docx' : 'epub'))))));

    if (isPdf) {
        try {
            if (currentEpubPtr) {
                Module.freeMemory(currentEpubPtr);
                currentEpubPtr = 0;
            }
            isPdfMode = true;
            isPptxMode = false;
            if (typeof updatePdfModeUI === 'function') updatePdfModeUI(true);
            if (typeof unloadPptxDocument === 'function') await unloadPptxDocument();

            var pdfLoaded = await loadPdfDocument(fileBuffer);
            totalPages = pdfLoaded.totalPages || 0;
            currentPage = 0;
            currentToc = pdfLoaded.toc || [];
            if (currentToc.length > MAX_TOC_ENTRIES) currentToc = currentToc.slice(0, MAX_TOC_ENTRIES);

            if (ditherMode) ditherMode.value = 'full';
            if (typeof updateDitherModeUI === 'function') updateDitherModeUI();

            var pdfInfo = pdfLoaded.info || {};
            fileName.textContent = pdfInfo.title || file.name;
            bookAuthor.textContent = pdfInfo.author || t('unknownAuthor');

            updateChapterList();
            exportBtn.disabled = false;
            exportPageBtn.disabled = false;
            previewCanvas.classList.add('has-file');

            if (window.innerWidth <= 800) {
                var panelLeftForPdf = document.querySelector('.panel-left');
                if (panelLeftForPdf) panelLeftForPdf.classList.add('panel-collapsed');
                setSettingsToggleState(false);
            }

            var emptyElForPdf = document.getElementById('previewEmpty');
            if (emptyElForPdf) emptyElForPdf.classList.add('hidden');

            renderCurrentPage();
            fileLoading.hide(true);
        } catch (errPdf) {
            console.error('Failed to load PDF:', errPdf);
            alert(t('alertLoadEpubFailed'));
            clearPreview();
            totalPages = 0;
            currentPage = 0;
            currentToc = [];
            fileLoading.hide(false);
        }
        return;
    }

    if (isPptx) {
        try {
            if (currentEpubPtr) {
                Module.freeMemory(currentEpubPtr);
                currentEpubPtr = 0;
            }
            isPdfMode = false;
            isPptxMode = true;
            if (typeof updatePdfModeUI === 'function') updatePdfModeUI(true);
            if (typeof unloadPdfDocument === 'function') await unloadPdfDocument();

            var pptxLoaded = await loadPptxDocument(fileBuffer);
            totalPages = pptxLoaded.totalPages || 0;
            currentPage = 0;
            currentToc = pptxLoaded.toc || [];

            if (ditherMode) ditherMode.value = 'full';
            if (typeof updateDitherModeUI === 'function') updateDitherModeUI();

            var pptxInfo = pptxLoaded.info || {};
            fileName.textContent = pptxInfo.title || file.name;
            bookAuthor.textContent = pptxInfo.author || t('unknownAuthor');

            updateChapterList();
            exportBtn.disabled = false;
            exportPageBtn.disabled = false;
            previewCanvas.classList.add('has-file');

            if (window.innerWidth <= 800) {
                var panelLeftForPptx = document.querySelector('.panel-left');
                if (panelLeftForPptx) panelLeftForPptx.classList.add('panel-collapsed');
                setSettingsToggleState(false);
            }

            var emptyElForPptx = document.getElementById('previewEmpty');
            if (emptyElForPptx) emptyElForPptx.classList.add('hidden');

            renderCurrentPage();
            fileLoading.hide(true);
        } catch (errPptx) {
            console.error('Failed to load PPTX:', errPptx);
            alert(t('alertLoadEpubFailed'));
            clearPreview();
            totalPages = 0;
            currentPage = 0;
            currentToc = [];
            fileLoading.hide(false);
        }
        return;
    }

    try {
        isPdfMode = false;
        isPptxMode = false;
        if (typeof updatePdfModeUI === 'function') updatePdfModeUI(false);
        if (typeof unloadPdfDocument === 'function') await unloadPdfDocument();
        if (typeof unloadPptxDocument === 'function') await unloadPptxDocument();

        var data;
        if (isMarkdown) {
            // Markdown：转成带样式的 HTML 文档后由 CREngine 按 HTML 解析
            var decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : { decode: function(b) { return decodeURIComponent(escape(String.fromCharCode.apply(null, b))); } };
            var mdText = decoder.decode(originalData);
            var baseTitle = file.name.replace(/\.(md|markdown)$/i, '').trim() || file.name;
            var htmlDoc = markdownToHtmlDocument(mdText, baseTitle);
            var encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : { encode: function(s) { var u = []; for (var j = 0; j < s.length; j++) { var c = s.charCodeAt(j); if (c < 128) u.push(c); else if (c < 2048) { u.push(192 | c >> 6); u.push(128 | c & 63); } else if (c < 65536) { u.push(224 | c >> 12); u.push(128 | (c >> 6) & 63); u.push(128 | c & 63); } else { u.push(240 | c >> 18); u.push(128 | (c >> 12) & 63); u.push(128 | (c >> 6) & 63); u.push(128 | c & 63); } } return new Uint8Array(u); } };
            data = encoder.encode(htmlDoc);
            currentFile.spineCount = 0;
            currentFile.spineHasImages = false;
            currentFile.isImageHeavy = false;
        } else if (isDoc || isDocx) {
            // DOC/DOCX：CREngine 直接解析，无需预处理
            currentFile.spineCount = 0;
            currentFile.spineHasImages = false;
            currentFile.isImageHeavy = false;
            data = originalData.slice();
        } else if (isMobi || isTxt) {
            // MOBI/PDB 或 TXT：CREngine 直接解析，无需 ZIP 预处理
            currentFile.spineCount = 0;
            currentFile.spineHasImages = false;
            currentFile.isImageHeavy = false;
            data = originalData.slice();
        } else {
            var zipForMeta = await JSZip.loadAsync(originalData);
            var spineFlags = await buildSpineImageFlags(zipForMeta);
            currentFile.spineCount = spineFlags.spineCount;
            currentFile.spineHasImages = spineFlags.spineHasImages;
            currentFile.isImageHeavy = await detectImageHeavyEpub(originalData);
            if (currentFile.isImageHeavy) {
                // Image-heavy books render better on X3/X4 with near-zero margins.
                if (margin) margin.value = '0';
                if (marginNum) marginNum.value = '0';
                if (marginTop) marginTop.value = '0';
                if (marginBottom) marginBottom.value = '0';
                if (marginLeft) marginLeft.value = '0';
                if (marginRight) marginRight.value = '0';
                var marginValue = document.getElementById('marginValue');
                if (marginValue) marginValue.textContent = '0';
            }

            var indent = paraIndent ? parseFloat(paraIndent.value) || 0 : 0;
            var spacing = (typeof getEffectiveParaSpacingPx === 'function') ? getEffectiveParaSpacingPx() : (paraSpacing ? parseInt(paraSpacing.value, 10) || 0 : 0);
            // 确保当前选中的字体已加载，否则 getCurrentFontFaceName() / resolveRendererFontFaceName() 会退回到默认字体
            if (typeof fontFamily !== 'undefined' && fontFamily && fontFamily.value && fontFamily.value !== 'custom' &&
                typeof GOOGLE_FONTS !== 'undefined' && GOOGLE_FONTS[fontFamily.value] &&
                typeof loadedFonts !== 'undefined' && !loadedFonts.has(fontFamily.value) &&
                typeof loadGoogleFont === 'function') {
                fontDebug('[loadFile] ensuring selected font loaded before preprocess:', fontFamily.value);
                await loadGoogleFont(fontFamily.value);
            }
            data = await preprocessEpub(originalData.slice(), indent, spacing);
        }

        // Free previous EPUB data before allocating new
        if (currentEpubPtr) { console.log('[loadFile] freeing old currentEpubPtr=', currentEpubPtr); Module.freeMemory(currentEpubPtr); currentEpubPtr = 0; }
        var ptr = Module.allocateMemory(data.length);
        Module.HEAPU8.set(data, ptr);
        console.log('[loadFile] allocated ptr=', ptr, 'size=', data.length);

        console.log('[loadFile] loadEpubFromMemory...');
        renderer.loadEpubFromMemory(ptr, data.length);
        currentEpubPtr = ptr;
        console.log('[loadFile] loadEpubFromMemory OK, currentEpubPtr=', currentEpubPtr);
        if (typeof reRegisterFonts === 'function') reRegisterFonts();
        writeFallbackFontsToMemfs();
        fontDebug('[loadFile] pre-getPageCount', {
            selectedFont: fontFamily ? fontFamily.value : null,
            loadedFonts: (typeof loadedFonts !== 'undefined' && loadedFonts && loadedFonts.size !== undefined)
                ? Array.from(loadedFonts.values())
                : [],
            faceMapKeys: (typeof fontFaceNameMap !== 'undefined' && fontFaceNameMap)
                ? Object.keys(fontFaceNameMap)
                : []
        });
        renderer.configureStatusBar(false, false, false, false, false, false, false, false, false);
        // IMPORTANT: Do not force user font before first pagination.
        // Some face names (e.g. with macOS resource-fork aliases) can crash CR engine in getPageCount.
        // We first paginate with cleaned EPUB styles, then apply user font via applySettings().

        console.log('[loadFile] getPageCount...');
        totalPages = renderer.getPageCount();
        console.log('[loadFile] totalPages=', totalPages);
        currentPage = 0;

        applySettings();

        var info = renderer.getDocumentInfo() || {};
        fileName.textContent = info.title || file.name;
        bookAuthor.textContent = info.author || info.authors || t('unknownAuthor');

        currentToc = renderer.getToc() || [];
        // 纯文本类 / 目录过少的 EPUB：用「规律识别」从引擎逐页文本提取目录，lineToPage 精确映射页码
        // TXT / MOBI 一律走提取；EPUB 仅当 getToc() 少于 10 条时也用提取
        if (currentFile.type === 'txt' || currentFile.type === 'mobi') {
            var plainText = getFullTextAndLineToPage(renderer, totalPages);
            var plainExtracted = extractChaptersFromText(plainText.fullText);
            if (plainExtracted.chapters.length > 0) {
                var plainCh = dropChaptersOnDensePages(plainExtracted.chapters, plainExtracted.totalLines, totalPages, plainText.lineToPage);
                currentToc = buildTocFromExtracted(plainCh, plainExtracted.totalLines, totalPages, plainText.lineToPage);
            } else
                currentToc = [];
        } else if (currentFile.type === 'epub' && currentToc.length < 10) {
            var epubPlainText = getFullTextAndLineToPage(renderer, totalPages);
            var epubExtracted = extractChaptersFromText(epubPlainText.fullText);
            if (epubExtracted.chapters.length > 0) {
                var epubCh = dropChaptersOnDensePages(epubExtracted.chapters, epubExtracted.totalLines, totalPages, epubPlainText.lineToPage);
                currentToc = buildTocFromExtracted(epubCh, epubExtracted.totalLines, totalPages, epubPlainText.lineToPage);
            }
        }
        if (currentToc.length > MAX_TOC_ENTRIES) currentToc = currentToc.slice(0, MAX_TOC_ENTRIES);
        updateChapterList();

        exportBtn.disabled = false;
        exportPageBtn.disabled = false;
        previewCanvas.classList.add('has-file');

        // 移动端：文件加载成功后收起设置面板，扩大预览区
        if (window.innerWidth <= 800) {
            var panelLeft = document.querySelector('.panel-left');
            if (panelLeft) panelLeft.classList.add('panel-collapsed');
            setSettingsToggleState(false);
        }

        // 隐藏空状态，显示预览
        var emptyEl = document.getElementById('previewEmpty');
        if (emptyEl) emptyEl.classList.add('hidden');

        renderCurrentPage();
        fileLoading.hide(true);
    } catch (err) {
        console.error('Failed to load EPUB:', err);
        alert(t('alertLoadEpubFailed'));
        if (typeof ptr !== 'undefined' && ptr) Module.freeMemory(ptr);
        currentEpubPtr = 0;
        clearPreview();
        totalPages = 0;
        currentPage = 0;
        currentToc = [];
        fileLoading.hide(false);
    }
}

function clearPreview() {
    currentFile = null;
    isPdfMode = false;
    isPptxMode = false;
    if (typeof updatePdfModeUI === 'function') updatePdfModeUI(false);
    if (typeof unloadPdfDocument === 'function') unloadPdfDocument();
    if (typeof unloadPptxDocument === 'function') unloadPptxDocument();
    // Free persistent EPUB WASM memory
    if (currentEpubPtr) { Module.freeMemory(currentEpubPtr); currentEpubPtr = 0; }
    previewCanvas.classList.remove('has-file');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    bookAuthor.textContent = t('dropToStart');
    if (typeof window.setPageInfoText === 'function') {
        window.setPageInfoText(0, 0);
    } else if (pageInfo) {
        pageInfo.textContent = t('pageOf').replace('{0}', '0').replace('{1}', '0');
    }
    showNoChaptersMessage();
    exportBtn.disabled = true;
    exportPageBtn.disabled = true;
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    var fp = document.getElementById('floatPrevBtn');
    var fn = document.getElementById('floatNextBtn');
    if (fp) fp.disabled = true;
    if (fn) fn.disabled = true;

    // 显示空状态
    var emptyEl = document.getElementById('previewEmpty');
    if (emptyEl) emptyEl.classList.remove('hidden');

    // 移动端：展开设置面板，方便重新加载文件
    var panelLeft = document.querySelector('.panel-left');
    if (panelLeft) panelLeft.classList.remove('panel-collapsed');
    setSettingsToggleState(true);

    dropZone.style.display = '';
    fileInfo.style.display = 'none';
}

function showNoChaptersMessage() {
    while (chapterList.firstChild) {
        chapterList.removeChild(chapterList.firstChild);
    }
    var div = document.createElement('div');
    div.className = 'chapter-item';
    div.textContent = t('noChaptersLoaded');
    chapterList.appendChild(div);
}

// ==================== Chapters ====================
function updateChapterList() {
    while (chapterList.firstChild) {
        chapterList.removeChild(chapterList.firstChild);
    }

    if (currentToc.length === 0) {
        var noChapters = document.createElement('div');
        noChapters.className = 'chapter-item';
        noChapters.textContent = t('noChaptersFound');
        chapterList.appendChild(noChapters);
        return;
    }

    for (var i = 0; i < currentToc.length; i++) {
        var ch = currentToc[i];
        if (!ch) continue;

        var div = document.createElement('div');
        div.className = 'chapter-item';
        div.textContent = ch.title || ch.name || t('chapterDefault').replace('{0}', String(i + 1));

        var chapterPage = ch.page != null ? ch.page : (ch.startPage != null ? ch.startPage : 0);
        div.setAttribute('data-page', chapterPage);
        div.setAttribute('data-index', i);

        (function(page) {
            div.addEventListener('click', function() {
                var targetPage = parseInt(page, 10);
                if (isNaN(targetPage)) targetPage = 0;
                if (totalPages > 0) {
                    if (targetPage < 0) targetPage = 0;
                    if (targetPage >= totalPages) targetPage = totalPages - 1;
                }
                currentPage = targetPage;
                renderCurrentPage();
            });
        })(chapterPage);

        chapterList.appendChild(div);
    }
}

function updateCurrentChapter() {
    var items = chapterList.querySelectorAll('.chapter-item');
    for (var i = 0; i < items.length; i++) {
        items[i].classList.remove('active');
    }

    for (var i = currentToc.length - 1; i >= 0; i--) {
        var ch = currentToc[i];
        if (!ch) continue;
        var chapterPage = ch.page != null ? ch.page : (ch.startPage != null ? ch.startPage : 0);
        if (currentPage >= chapterPage) {
            if (items[i]) {
                items[i].classList.add('active');
            }
            break;
        }
    }
}

// ==================== Paragraph Reload ====================
var paraReloadTimer = null;
var paraReloadInProgress = false;
var paraReloadScheduleCount = 0;

var PARAGRAPH_RELOAD_DEBOUNCE_MS = 600;

/** 仅当段落缩进/段间距等需要重新预处理 HTML 时调用；单实例下在同一 renderer 上重新 loadEpubFromMemory。 */
function scheduleParagraphReload() {
    if (isPdfMode || isPptxMode) {
        renderCurrentPage();
        return;
    }
    paraReloadScheduleCount++;
    console.log('[scheduleParagraphReload] call #' + paraReloadScheduleCount + ', inProgress=' + paraReloadInProgress + ', currentEpubPtr=' + currentEpubPtr);
    clearTimeout(paraReloadTimer);
    paraReloadTimer = setTimeout(doReloadForParagraph, PARAGRAPH_RELOAD_DEBOUNCE_MS);
}

// ==================== Settings Change (no WASM restart) ====================
function scheduleSettingsReload() {
    if (isPdfMode || isPptxMode) {
        renderCurrentPage();
        return;
    }
    if (typeof applySettings === 'function') applySettings();
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
}

async function doReloadForParagraph() {
    if (isPdfMode || isPptxMode) {
        renderCurrentPage();
        return;
    }
    console.log('[doReload] entered. currentFile=' + !!currentFile + ', originalData=' + !!(currentFile && currentFile.originalData) + ', wasmReady=' + wasmReady + ', renderer=' + !!renderer);
    if (!currentFile || !currentFile.originalData || !wasmReady || !renderer) {
        console.log('[doReload] early return (missing deps)');
        return;
    }

    // Prevent concurrent EPUB reloads: concurrent WASM access corrupts renderer state.
    if (paraReloadInProgress) {
        console.log('[doReload] already in progress, rescheduling');
        scheduleParagraphReload();
        return;
    }
    paraReloadInProgress = true;
    console.log('[doReload] paraReloadInProgress=true, old currentEpubPtr=' + currentEpubPtr);

    // Show blocking overlay — prevents all interaction while WASM is repaginating
    var overlay = document.getElementById('repaginateOverlay');
    var overlayText = document.getElementById('repaginateText');
    if (overlay) {
        if (overlayText) overlayText.textContent = t('progressRepaginating');
        overlay.classList.add('active');
    }

    var indent = paraIndent ? parseFloat(paraIndent.value) || 0 : 0;
    var spacing = (typeof getEffectiveParaSpacingPx === 'function') ? getEffectiveParaSpacingPx() : (paraSpacing ? parseInt(paraSpacing.value, 10) || 0 : 0);
    var data;
    if (currentFile.type === 'epub') {
        data = await preprocessEpub(currentFile.originalData.slice(), indent, spacing);
    } else {
        // mobi / txt / markdown：非 ZIP 格式，不能调用 preprocessEpub，直接使用原始数据重载
        data = currentFile.originalData.slice();
    }

    // Allocate NEW buffer first. Do NOT free old ptr yet — CREngine still holds the old pointer
    // and will use it until loadEpubFromMemory(newPtr) succeeds. Freeing before load causes
    // use-after-free → WASM heap corruption → "function signature mismatch".
    var ptr = Module.allocateMemory(data.length);
    Module.HEAPU8.set(data, ptr);
    console.log('[doReload] allocated new ptr=' + ptr + ', size=' + data.length);

    try {
        if (LOG_FONT_STRIP) console.log('[font-strip] doReload: about to loadEpubFromMemory, size=', data.length, 'first 4 bytes (ZIP magic)=', data[0], data[1], data[2], data[3]);
        console.log('[doReload] calling renderer.loadEpubFromMemory(ptr=' + ptr + ', len=' + data.length + ')...');
        renderer.loadEpubFromMemory(ptr, data.length);
        console.log('[doReload] loadEpubFromMemory OK');

        // Only AFTER success: release old buffer so CREngine is no longer using it.
        var oldEpub = currentEpubPtr;
        if (oldEpub) {
            console.log('[doReload] freeing old currentEpubPtr=' + oldEpub);
            Module.freeMemory(oldEpub);
        }
        currentEpubPtr = ptr;
        console.log('[doReload] currentEpubPtr=' + currentEpubPtr);

        // 新文档后重新注册字体（document-scoped 字体随文档切换而清除）
        if (typeof reRegisterFonts === 'function') reRegisterFonts();
        writeFallbackFontsToMemfs();
        renderer.configureStatusBar(false, false, false, false, false, false, false, false, false);
        if (typeof applyUserStylesOverride === 'function') applyUserStylesOverride();

        console.log('[doReload] applySettings...');
        applySettings();
        renderCurrentPage();
        console.log('[doReload] done. currentPage=' + currentPage + ', totalPages=' + totalPages);
    } catch (e) {
        console.error('[doReload] FAILED:', e);
        // Only free new buffer if we never handed it to the renderer (throw before currentEpubPtr = ptr).
        if (currentEpubPtr !== ptr) Module.freeMemory(ptr);
    } finally {
        paraReloadInProgress = false;
        console.log('[doReload] paraReloadInProgress=false');
        if (overlay) overlay.classList.remove('active');
    }
}
// Fonts configuration.
// On localhost or LAN, fonts are served from the local /system/fonts/ path (use `npm run dev` which proxies this).
// In production, set FONT_CDN_BASE to your own font CDN/static hosting URL, e.g.:
//   var FONT_CDN_BASE = 'https://your-cdn.example.com/fonts/';
// Fonts are standard TTF files from Google Fonts / open-source projects.
// See README.md for instructions on self-hosting fonts.
var FONT_CDN_BASE = '';  // configure your font CDN base URL here
var FONT_BASE = (function () {
    if (typeof location === 'undefined') return FONT_CDN_BASE || '/system/fonts/';
    var h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1'
        || /^192\.168\./.test(h) || /^10\./.test(h)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
        return '/system/fonts/';
    }
    return FONT_CDN_BASE || '/system/fonts/';
})();
// 新增字体直接使用 Google 官方仓库 raw 链接（无需上传阿里云）
var G_FONTS_RAW = 'https://raw.githubusercontent.com/google/fonts/main/';
var GOOGLE_FONTS = {
    'Literata': [
        { url: FONT_BASE + 'Literata-Regular.ttf', name: 'Literata-Regular.ttf' },
        { url: FONT_BASE + 'Literata-Italic.ttf', name: 'Literata-Italic.ttf' }
    ],
    'Lora': [
        { url: FONT_BASE + 'Lora-Regular.ttf', name: 'Lora-Regular.ttf' },
        { url: FONT_BASE + 'Lora-Italic.ttf', name: 'Lora-Italic.ttf' }
    ],
    'Merriweather': [
        { url: FONT_BASE + 'Merriweather-Regular.ttf', name: 'Merriweather-Regular.ttf' },
        { url: FONT_BASE + 'Merriweather-Italic.ttf', name: 'Merriweather-Italic.ttf' }
    ],
    'Source Serif 4': [
        { url: FONT_BASE + 'SourceSerif4-Regular.ttf', name: 'SourceSerif4-Regular.ttf' }
    ],
    'Noto Serif': [
        { url: FONT_BASE + 'NotoSerif-Regular.ttf', name: 'NotoSerif-Regular.ttf' },
        { url: FONT_BASE + 'NotoSerif-Italic.ttf', name: 'NotoSerif-Italic.ttf' }
    ],
    'Noto Sans': [
        { url: FONT_BASE + 'NotoSans-Regular.ttf', name: 'NotoSans-Regular.ttf' }
    ],
    'Open Sans': [
        { url: FONT_BASE + 'OpenSans-Regular.ttf', name: 'OpenSans-Regular.ttf' }
    ],
    'Roboto': [
        { url: FONT_BASE + 'Roboto-Regular.ttf', name: 'Roboto-Regular.ttf' }
    ],
    'EB Garamond': [
        { url: FONT_BASE + 'EBGaramond-Regular.ttf', name: 'EBGaramond-Regular.ttf' },
        { url: FONT_BASE + 'EBGaramond-Italic.ttf', name: 'EBGaramond-Italic.ttf' }
    ],
    'Crimson Pro': [
        { url: FONT_BASE + 'CrimsonPro-Regular.ttf', name: 'CrimsonPro-Regular.ttf' },
        { url: FONT_BASE + 'CrimsonPro-Italic.ttf', name: 'CrimsonPro-Italic.ttf' }
    ],
    'Noto Sans SC': [
        { url: FONT_BASE + 'NotoSansSC-Regular.ttf', name: 'NotoSansSC-Regular.ttf' }
    ],
    'Noto Serif SC': [
        { url: FONT_BASE + 'NotoSerifSC-Regular.ttf', name: 'NotoSerifSC-Regular.ttf' }
    ],
    'Alegreya Sans SC': [
        { url: FONT_BASE + 'AlegreyaSansSC-Regular.ttf', name: 'AlegreyaSansSC-Regular.ttf' }
    ],
    'Alegreya SC': [
        { url: FONT_BASE + 'AlegreyaSC-Regular.ttf', name: 'AlegreyaSC-Regular.ttf' }
    ],
    'LXGW WenKai GB Screen': [
        { url: FONT_BASE + 'LXGWWenKaiGBScreen.ttf', name: 'LXGWWenKaiGBScreen.ttf' }
    ],
    'MiSans': [
        { url: FONT_BASE + 'MiSans-Regular.ttf', name: 'MiSans-Regular.ttf' },
        { url: FONT_BASE + 'MiSans-Semibold.ttf', name: 'MiSans-Semibold.ttf' }
    ],
    'ZCOOL XiaoWei': [
        { url: FONT_BASE + 'ZCOOLXiaoWei-Regular.ttf', name: 'ZCOOLXiaoWei-Regular.ttf' }
    ],
    'ZCOOL QingKe HuangYou': [
        { url: FONT_BASE + 'ZCOOLQingKeHuangYou-Regular.ttf', name: 'ZCOOLQingKeHuangYou-Regular.ttf' }
    ],
    'Ma Shan Zheng': [
        { url: FONT_BASE + 'MaShanZheng-Regular.ttf', name: 'MaShanZheng-Regular.ttf' }
    ],
    'Long Cang': [
        { url: FONT_BASE + 'LongCang-Regular.ttf', name: 'LongCang-Regular.ttf' }
    ],
    // === 以下使用 Google 官方仓库链接，无需上传阿里云 ===
    'Liu Jian Mao Cao': [
        { url: G_FONTS_RAW + 'ofl/liujianmaocao/LiuJianMaoCao-Regular.ttf', name: 'LiuJianMaoCao-Regular.ttf' }
    ],
    'Zhi Mang Xing': [
        { url: G_FONTS_RAW + 'ofl/zhimangxing/ZhiMangXing-Regular.ttf', name: 'ZhiMangXing-Regular.ttf' }
    ],
    'ZCOOL KuaiLe': [
        { url: G_FONTS_RAW + 'ofl/zcoolkuaile/ZCOOLKuaiLe-Regular.ttf', name: 'ZCOOLKuaiLe-Regular.ttf' }
    ],
    'Noto Sans TC': [
        { url: G_FONTS_RAW + 'ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf', name: 'NotoSansTC[wght].ttf' }
    ],
    'Noto Serif TC': [
        { url: G_FONTS_RAW + 'ofl/notoseriftc/NotoSerifTC%5Bwght%5D.ttf', name: 'NotoSerifTC[wght].ttf' }
    ],
    'Noto Sans HK': [
        { url: G_FONTS_RAW + 'ofl/notosanshk/NotoSansHK%5Bwght%5D.ttf', name: 'NotoSansHK[wght].ttf' }
    ],
    'Noto Serif HK': [
        { url: G_FONTS_RAW + 'ofl/notoserifhk/NotoSerifHK%5Bwght%5D.ttf', name: 'NotoSerifHK[wght].ttf' }
    ],
    // === 多语种 / 全球化：每语种一个，Google Noto 免费商用（OFL）===
    'Noto Sans Arabic': [
        { url: G_FONTS_RAW + 'ofl/notosansarabic/NotoSansArabic%5Bwdth%2Cwght%5D.ttf', name: 'NotoSansArabic[wdth,wght].ttf' }
    ],
    'Noto Sans Hebrew': [
        { url: G_FONTS_RAW + 'ofl/notosanshebrew/NotoSansHebrew%5Bwdth%2Cwght%5D.ttf', name: 'NotoSansHebrew[wdth,wght].ttf' }
    ],
    'Noto Sans Thai': [
        { url: G_FONTS_RAW + 'ofl/notosansthai/NotoSansThai%5Bwdth%2Cwght%5D.ttf', name: 'NotoSansThai[wdth,wght].ttf' }
    ],
    'Noto Sans Devanagari': [
        { url: G_FONTS_RAW + 'ofl/notosansdevanagari/NotoSansDevanagari%5Bwdth%2Cwght%5D.ttf', name: 'NotoSansDevanagari[wdth,wght].ttf' }
    ],
    'Noto Sans KR': [
        { url: G_FONTS_RAW + 'ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf', name: 'NotoSansKR[wght].ttf' }
    ],
    'Noto Sans JP': [
        { url: G_FONTS_RAW + 'ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf', name: 'NotoSansJP[wght].ttf' }
    ]
};

var loadedFonts = new Set();

var fontFaceNameMap = {};
var fontPtrCache = [];
// Filename-only registration avoids extensionless face-name paths that trigger
// resource-fork probing patterns in CREngine/FreeType.
var FONT_FILENAME_ONLY_REGISTRATION = true;

function reRegisterFonts() {
    if (!renderer || typeof renderer.registerFontFromMemory !== 'function') return;
    for (var i = 0; i < fontPtrCache.length; i++) {
        var f = fontPtrCache[i];
        if (!f.originalData) {
            console.warn('[reRegisterFonts] no originalData for', f.faceName, '- skipping');
            continue;
        }
        // 每次分配全新 WASM 内存，避免复用 CREngine 已释放的旧 ptr
        var freshPtr = Module.allocateMemory(f.len);
        Module.HEAPU8.set(f.originalData, freshPtr);
        f.ptr = freshPtr; // 更新缓存中的 ptr
        if (FONT_FILENAME_ONLY_REGISTRATION) {
            renderer.registerFontFromMemory(freshPtr, f.len, f.filename);
        } else {
            renderer.registerFontFromMemory(freshPtr, f.len, f.faceName);
            if (f.filename && f.filename !== f.faceName) {
                renderer.registerFontFromMemory(freshPtr, f.len, f.filename);
            }
        }
    }
    console.log('[reRegisterFonts] re-registered', fontPtrCache.length, 'font(s)');
}

/**
 * 从 TTF/OTF 二进制数据中提取字体 Family 名称。
 * 返回 { lookup, display }：
 * - lookup: 传给 CREngine/FreeType 的名称，优先 ASCII（与 FreeType face->family_name 一致，便于匹配）
 * - display: 用于界面显示，优先中文等非 ASCII 名称
 * CREngine 用字体内嵌的 family name 查找，FreeType 通常返回英文字体名。
 */
function parseTtfFamilyName(data) {
    try {
        if (!data || data.length < 16) return null;
        var view = new DataView(data.buffer ? data.buffer : data);
        var offset = data.byteOffset || 0;
        var numTables = view.getUint16(offset + 4);
        var nameTableOffset = -1;
        for (var i = 0; i < numTables; i++) {
            var base = offset + 12 + i * 16;
            var tag = String.fromCharCode(
                view.getUint8(base), view.getUint8(base + 1),
                view.getUint8(base + 2), view.getUint8(base + 3)
            );
            if (tag === 'name') {
                nameTableOffset = view.getUint32(base + 8);
                break;
            }
        }
        if (nameTableOffset < 0) return null;
        var nameCount = view.getUint16(nameTableOffset + 2);
        var storageAbs = nameTableOffset + view.getUint16(nameTableOffset + 4);
        var familyName = null;
        var typographicName = null;
        var asciiFrom16 = null;  // nameID 16 的 ASCII（与 FreeType family 一致，无 style 后缀）
        var asciiFrom1 = null;  // nameID 1 的 ASCII 兜底
        var displayName = null;
        for (var j = 0; j < nameCount; j++) {
            var rec = nameTableOffset + 6 + j * 12;
            var platformID = view.getUint16(rec);
            var encodingID = view.getUint16(rec + 2);
            var nameID = view.getUint16(rec + 6);
            var len = view.getUint16(rec + 8);
            var off = view.getUint16(rec + 10);
            if (platformID === 3 && encodingID === 1 && (nameID === 1 || nameID === 16)) {
                var str = '';
                for (var k = 0; k < len; k += 2) {
                    str += String.fromCharCode(view.getUint16(storageAbs + off + k));
                }
                var isAscii = /^[\x00-\x7F]*$/.test(str);
                if (nameID === 16) {
                    typographicName = str;
                    if (isAscii) asciiFrom16 = str;
                    else if (!displayName) displayName = str;
                } else if (nameID === 1) {
                    if (!familyName) familyName = str;
                    if (isAscii) asciiFrom1 = str;
                    else if (!displayName) displayName = str;
                }
            }
        }
        // lookup 优先 nameID 16 的 ASCII（与 FreeType face->family_name 一致）
        var asciiLookup = asciiFrom16 || asciiFrom1;
        // lookup: 优先与 FreeType 一致的 ASCII 名，否则用 typographic/family
        var lookup = asciiLookup || typographicName || familyName || null;
        // display: 优先中文/非 ASCII，否则用 lookup
        var display = displayName || typographicName || familyName || lookup || null;
        return { lookup: lookup, display: display };
    } catch (e) {
        return null;
    }
}

/** 兼容旧调用：若需单个字符串，取 lookup（CREngine 用） */
function parseTtfFamilyNameString(data) {
    var r = parseTtfFamilyName(data);
    return r ? r.lookup : null;
}

function writeFontToMemfs(data, faceName, filename) {
    if (!Module || !Module.FS) return;
    try {
        // 确保 /fonts 目录存在
        try { Module.FS.mkdir('/fonts'); } catch (e) { /* already exists */ }
        if (FONT_FILENAME_ONLY_REGISTRATION) {
            Module.FS.writeFile('/fonts/' + filename, data);
            console.log('[FONT] MEMFS write OK: /fonts/' + filename);
        } else {
            // 写入 face name 路径（CREngine 按 face name 查找）
            Module.FS.writeFile('/fonts/' + faceName, data);
            // 写入文件名路径（兜底）
            if (filename && filename !== faceName) {
                Module.FS.writeFile('/fonts/' + filename, data);
            }
            console.log('[FONT] MEMFS write OK: /fonts/' + faceName);
        }
    } catch (e) {
        console.warn('[FONT] MEMFS write failed:', e);
    }
}

function isFontData(data) {
  if (!data || data.length < 4) return false;
  return (
    (data[0] === 0x00 && data[1] === 0x01 && data[2] === 0x00 && data[3] === 0x00) ||
    (data[0] === 0x4f && data[1] === 0x54 && data[2] === 0x54 && data[3] === 0x4f)
  );
}

async function loadDefaultFonts() {
    // Load Noto Sans SC (思源黑体) as default; fallback to LXGW WenKai then Literata
    var ok = await loadGoogleFont('Noto Sans SC');
    if (!ok) ok = await loadGoogleFont('LXGW WenKai GB Screen');
    if (!ok) await loadGoogleFont('Literata');
}

async function loadGoogleFont(familyName) {
    if (loadedFonts.has(familyName)) {
        console.log('Font already loaded:', familyName);
        return true;
    }

    var fontConfig = GOOGLE_FONTS[familyName];
    if (!fontConfig) {
        console.warn('Unknown font family:', familyName);
        return false;
    }

    console.log('Loading font:', familyName);
    var success = false;

    for (var i = 0; i < fontConfig.length; i++) {
        var font = fontConfig[i];
        try {
            var response = await fetch(font.url);
            if (!response.ok) {
                console.warn('Failed to fetch font:', font.name, response.status);
                continue;
            }
            var data = new Uint8Array(await response.arrayBuffer());
            if (!isFontData(data)) {
                console.warn('Invalid font data (not TTF/OTF), skip:', font.name);
                continue;
            }

            var parsed = parseTtfFamilyName(data);
            var faceName = (parsed && parsed.lookup) ? parsed.lookup : font.name;
            if (!fontFaceNameMap[familyName]) fontFaceNameMap[familyName] = faceName;

            var ptr = Module.allocateMemory(data.length);
            Module.HEAPU8.set(data, ptr);

            if (FONT_FILENAME_ONLY_REGISTRATION) {
                renderer.registerFontFromMemory(ptr, data.length, font.name);
            } else {
                // 主注册：用字体内嵌 face name（CREngine 按此名查找）
                renderer.registerFontFromMemory(ptr, data.length, faceName);
                // 备用注册：用文件名（兜底，部分查询路径可能用文件名）
                if (faceName !== font.name) {
                    renderer.registerFontFromMemory(ptr, data.length, font.name);
                }
            }

            fontPtrCache.push({ ptr: ptr, len: data.length, faceName: faceName, filename: font.name, originalData: data });

            writeFontToMemfs(data, faceName, font.name);

            console.log('[FONT] registered: faceName=' + faceName + ', filename=' + font.name + ', ptr=' + ptr);
            success = true;
        } catch (err) {
            console.warn('Failed to load font:', font.name, err);
        }
    }

    if (success) {
        loadedFonts.add(familyName);
    }
    return success;
}

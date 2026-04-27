// ==================== Global State ====================
let Module = null;
/** 全局唯一渲染器实例（单实例），启动时创建一次、字体只注册一次，避免多实例导致的内存与 signature mismatch。 */
let renderer = null;
let wasmReady = false;
let currentPage = 0;
let totalPages = 0;
let currentToc = [];
let ditherWorker = null;
let ditherCallbacks = new Map();
let ditherJobId = 0;
let renderRequestId = 0;
let showImageMaskDebug = false;
let isPdfMode = false;

// Background image state
let bgImageOriginal = null;  // HTMLImageElement
let bgImageData = null;      // ImageData scaled to SCREEN_WIDTH x SCREEN_HEIGHT

// 当前模式：simple(简洁) / expert(专家)
let currentMode = 'simple';

// 预设配置
const PRESETS = {
    'large': { fontSize: 40, lineHeight: 110, margin: 24, fontWeight: 400, paraIndent: 1, paraSpacing: 22 },
    'comfort': { fontSize: 34, lineHeight: 100, margin: 20, fontWeight: 400, paraIndent: 1, paraSpacing: 20 },
    'compact': { fontSize: 28, lineHeight: 100, margin: 16, fontWeight: 400, paraIndent: 1, paraSpacing: 18 }
};

// Device presets
const DEVICES = {
    'xteink-x4': { width: 480, height: 800, name: 'Xteink X4', defaultPrefix: '[X4]' },
    'xteink-x3': { width: 528, height: 792, name: 'Xteink X3', defaultPrefix: '[X3]' },
    'custom': { width: 480, height: 800, name: 'Custom' }
};

let SCREEN_WIDTH = 480;
let SCREEN_HEIGHT = 800;
/** 内容旋转：0/90/180/270。90/270 时按横屏布局渲染再旋转进设备缓冲，设备横放显示正确。 */
var contentRotation = 0;
/** 设备原生分辨率（竖屏尺寸），预览与导出始终用此尺寸；横屏时渲染用 swap(deviceWidth, deviceHeight)。 */
var deviceWidth = 480;
var deviceHeight = 800;

// ==================== DOM Elements ====================
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const replaceFileBtn = document.getElementById('replaceFileBtn');
const bookAuthor = document.getElementById('bookAuthor');
const previewCanvas = document.getElementById('previewCanvas');
const ctx = previewCanvas.getContext('2d');
const pageInfo = document.getElementById('pageInfo');
const chapterList = document.getElementById('chapterList');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

// Buttons
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const refreshBtn = document.getElementById('refreshBtn');
const exportBtn = document.getElementById('exportBtn');
const exportPageBtn = document.getElementById('exportPageBtn');
const pageJumpInput = document.getElementById('pageJumpInput');
const pageJumpBtn = document.getElementById('pageJumpBtn');
const pageJumpOpenBtn = document.getElementById('pageJumpOpenBtn');
const pageJumpModal = document.getElementById('pageJumpModal');
const pageJumpModalClose = document.getElementById('pageJumpModalClose');
const pageJumpOf = document.getElementById('pageJumpOf');
// const optimizeBtn = document.getElementById('optimizeBtn'); // 已注释

// 页码显示：手机端简写 1/100，桌面端完整「第 1 / 100 页」
function setPageInfoText(curPageOneBased, total) {
    if (!pageInfo) return;
    var c = String(curPageOneBased);
    var t = String(total);
    pageInfo.textContent = window.matchMedia('(max-width: 600px)').matches ? (c + '/' + t) : (typeof window.t === 'function' ? window.t('pageOf').replace('{0}', c).replace('{1}', t) : c + ' / ' + t);
}
window.setPageInfoText = setPageInfoText;

// Settings
const devicePreset = document.getElementById('devicePreset');
const customDimensions = document.getElementById('customDimensions');
const landscapePages = document.getElementById('landscapePages');
const fontFamily = document.getElementById('fontFamily');
const fontSize = document.getElementById('fontSize');
const fontSizeNum = document.getElementById('fontSizeNum');
const fontWeight = document.getElementById('fontWeight');
const fontWeightNum = document.getElementById('fontWeightNum');
const lineHeight = document.getElementById('lineHeight');
const lineHeightNum = document.getElementById('lineHeightNum');
const margin = document.getElementById('margin');
const marginNum = document.getElementById('marginNum');
const textAlign = document.getElementById('textAlign');
const hyphenation = document.getElementById('hyphenation');
const hyphenationLang = document.getElementById('hyphenationLang');
const qualityMode = document.getElementById('qualityMode');
const qualityBtnFast = document.getElementById('qualityBtnFast');
const qualityBtnHq = document.getElementById('qualityBtnHq');
const exportFormat = document.getElementById('exportFormat');
const ditherMode = document.getElementById('ditherMode');
const ditherStrength = document.getElementById('ditherStrength');
const ditherStrengthNum = document.getElementById('ditherStrengthNum');
const imageDetectionSensitivity = document.getElementById('imageDetectionSensitivity');
const imageDetectionSensitivityNum = document.getElementById('imageDetectionSensitivityNum');
const enableNegative = document.getElementById('enableNegative');
const imageRegionBrightness = document.getElementById('imageRegionBrightness');
const imageRegionBrightnessNum = document.getElementById('imageRegionBrightnessNum');
const imageRegionContrast = document.getElementById('imageRegionContrast');
const imageRegionContrastNum = document.getElementById('imageRegionContrastNum');
const imageRegionDitherStrength = document.getElementById('imageRegionDitherStrength');
const imageRegionDitherStrengthNum = document.getElementById('imageRegionDitherStrengthNum');
const imageRegionNegative = document.getElementById('imageRegionNegative');

// Progress bar settings
const enableProgressBar = document.getElementById('enableProgressBar');
const progressPosition = document.getElementById('progressPosition');
const showBookProgress = document.getElementById('showBookProgress');
const showChapterMarks = document.getElementById('showChapterMarks');
const showChapterProgress = document.getElementById('showChapterProgress');
const progressFullWidth = document.getElementById('progressFullWidth');
const showPageXY = document.getElementById('showPageXY');
const showBookPercent = document.getElementById('showBookPercent');
const showChapterXY = document.getElementById('showChapterXY');
const showChapterPercent = document.getElementById('showChapterPercent');
const progressBarTheme = document.getElementById('progressBarTheme');
const statusFontSize = document.getElementById('statusFontSize');
const statusFontSizeNum = document.getElementById('statusFontSizeNum');
const statusEdgeMargin = document.getElementById('statusEdgeMargin');
const statusEdgeMarginNum = document.getElementById('statusEdgeMarginNum');
const statusSideMargin = document.getElementById('statusSideMargin');
const statusSideMarginNum = document.getElementById('statusSideMarginNum');
const statusBarColor = document.getElementById('statusBarColor');
const showCrHeader = document.getElementById('showCrHeader');
const readingUnderlines = document.getElementById('readingUnderlines');
const underlineEffect = document.getElementById('underlineEffect');
const underlinePositionPx = document.getElementById('underlinePositionPx');
const underlinePositionPxNum = document.getElementById('underlinePositionPxNum');
const underlinePositionValue = document.getElementById('underlinePositionValue');
const underlineOptionsGroup = document.getElementById('underlineOptionsGroup');

// New margin controls
const marginTop = document.getElementById('marginTop');
const marginBottom = document.getElementById('marginBottom');
const marginLeft = document.getElementById('marginLeft');
const marginRight = document.getElementById('marginRight');
const paraIndent = document.getElementById('paraIndent');
const paraIndentNum = document.getElementById('paraIndentNum');
const paraSpacing = document.getElementById('paraSpacing');
const paraSpacingNum = document.getElementById('paraSpacingNum');
const paraSpacingMode = document.getElementById('paraSpacingMode');

// Image adjustments
const brightness = document.getElementById('brightness');
const brightnessNum = document.getElementById('brightnessNum');
const contrast = document.getElementById('contrast');
const contrastNum = document.getElementById('contrastNum');
const imageZoom = document.getElementById('imageZoom');
const imageZoomNum = document.getElementById('imageZoomNum');

// Background image effects (only when a background image is set)
const bgBrightness = document.getElementById('bgBrightness');
const bgBrightnessNum = document.getElementById('bgBrightnessNum');
const bgContrast = document.getElementById('bgContrast');
const bgContrastNum = document.getElementById('bgContrastNum');
const bgDitherMode = document.getElementById('bgDitherMode');
const bgDitherStrength = document.getElementById('bgDitherStrength');
const bgDitherStrengthNum = document.getElementById('bgDitherStrengthNum');

// ==================== URL Parameters ====================
function applyUrlParams() {
    var params = new URLSearchParams(window.location.search);
    if (params.toString() === '') return;

    console.log('[URL Params] Applying parameters:', params.toString());

    // Device
    if (params.has('device')) {
        var device = params.get('device');
        if (DEVICES[device]) {
            devicePreset.value = device;
            customDimensions.style.display = device === 'custom' ? 'block' : 'none';
            SCREEN_WIDTH = DEVICES[device].width;
            SCREEN_HEIGHT = DEVICES[device].height;
            if (typeof syncDeviceFrameDataDevice === 'function') syncDeviceFrameDataDevice();
            syncDeviceButtonsState();
        }
    }

    if (params.has('width')) {
        document.getElementById('customWidth').value = params.get('width');
    }
    if (params.has('height')) {
        document.getElementById('customHeight').value = params.get('height');
    }

    if (params.has('orientation')) {
        var orient = parseInt(params.get('orientation'));
        var orientBtns = document.querySelectorAll('.orientation-buttons button');
        orientBtns.forEach(function(btn) {
            btn.classList.remove('active');
            if (parseInt(btn.getAttribute('data-orientation')) === orient) {
                btn.classList.add('active');
            }
        });
        updateOrientation(orient);
    } else if (params.has('device')) {
        updateCanvasSize();
    }

    // Text
    if (params.has('font')) {
        fontFamily.value = params.get('font');
    }
    if (params.has('fontSize')) {
        fontSize.value = params.get('fontSize');
        fontSizeNum.value = params.get('fontSize');
        document.getElementById('fontSizeValue').textContent = params.get('fontSize');
    }
    if (params.has('fontWeight')) {
        fontWeight.value = params.get('fontWeight');
        fontWeightNum.value = params.get('fontWeight');
        document.getElementById('fontWeightValue').textContent = params.get('fontWeight');
    }
    if (params.has('lineHeight')) {
        lineHeight.value = params.get('lineHeight');
        lineHeightNum.value = params.get('lineHeight');
        document.getElementById('lineHeightValue').textContent = params.get('lineHeight');
    }
    if (params.has('margin')) {
        margin.value = params.get('margin');
        marginNum.value = params.get('margin');
        document.getElementById('marginValue').textContent = params.get('margin');
        if (marginTop) marginTop.value = params.get('margin');
        if (marginBottom) marginBottom.value = params.get('margin');
        if (marginLeft) marginLeft.value = params.get('margin');
        if (marginRight) marginRight.value = params.get('margin');
    }
    if (params.has('marginTop') && marginTop) marginTop.value = params.get('marginTop');
    if (params.has('marginBottom') && marginBottom) marginBottom.value = params.get('marginBottom');
    if (params.has('marginLeft') && marginLeft) marginLeft.value = params.get('marginLeft');
    if (params.has('marginRight') && marginRight) marginRight.value = params.get('marginRight');
    if (params.has('paraIndent') && paraIndent) {
        paraIndent.value = params.get('paraIndent');
        paraIndentNum.value = params.get('paraIndent');
        var pe = document.getElementById('paraIndentValue');
        if (pe) pe.textContent = params.get('paraIndent');
    }
    if (params.has('paraSpacing') && paraSpacing) {
        paraSpacing.value = params.get('paraSpacing');
        paraSpacingNum.value = params.get('paraSpacing');
        var ps = document.getElementById('paraSpacingValue');
        if (ps) ps.textContent = params.get('paraSpacing');
    }
    if (params.has('paraSpacingMode') && paraSpacingMode) {
        var mode = params.get('paraSpacingMode');
        if (mode === 'double' || mode === 'fixed') paraSpacingMode.value = mode;
    }
    if (params.has('textAlign')) {
        textAlign.value = params.get('textAlign');
    }
    if (params.has('hyphenation')) {
        hyphenation.value = params.get('hyphenation');
        document.getElementById('hyphenationLangGroup').style.display =
            hyphenation.value === '0' ? 'none' : 'block';
    }
    if (params.has('hyphenLang')) {
        hyphenationLang.value = params.get('hyphenLang');
    }

    // Image
    if (params.has('quality')) {
        qualityMode.value = params.get('quality');
    }
    if (params.has('dither')) {
        var d = params.get('dither');
        if (ditherMode) {
            if (d === '1' || d === 'full') ditherMode.value = 'full';
            else if (d === 'imageOnly') ditherMode.value = 'imageOnly';
            else ditherMode.value = 'none';
        }
        updateDitherModeUI();
    }
    if (params.has('ditherStrength')) {
        ditherStrength.value = params.get('ditherStrength');
        ditherStrengthNum.value = params.get('ditherStrength');
        document.getElementById('ditherStrengthValue').textContent = params.get('ditherStrength');
    }
    if (params.has('negative')) {
        enableNegative.checked = params.get('negative') === '1';
    }
    if (params.has('brightness') && brightness) {
        brightness.value = params.get('brightness');
        brightnessNum.value = params.get('brightness');
        var be = document.getElementById('brightnessValue');
        if (be) be.textContent = params.get('brightness');
    }
    if (params.has('contrast') && contrast) {
        contrast.value = params.get('contrast');
        contrastNum.value = params.get('contrast');
        var ce = document.getElementById('contrastValue');
        if (ce) ce.textContent = params.get('contrast');
    }
    if (params.has('maskDebug')) {
        showImageMaskDebug = params.get('maskDebug') === '1';
    }

    // Progress bar
    if (params.has('progressBar')) {
        enableProgressBar.checked = params.get('progressBar') === '1';
        document.getElementById('progressSettings').style.display =
            enableProgressBar.checked ? 'block' : 'none';
    }
    if (params.has('progressPos')) {
        progressPosition.value = params.get('progressPos');
    }
    if (params.has('showBookProgress')) {
        showBookProgress.checked = params.get('showBookProgress') === '1';
    }
    if (params.has('showChapterMarks')) {
        showChapterMarks.checked = params.get('showChapterMarks') === '1';
    }
    if (params.has('showChapterProgress')) {
        showChapterProgress.checked = params.get('showChapterProgress') === '1';
    }
    if (params.has('progressFullWidth')) {
        progressFullWidth.checked = params.get('progressFullWidth') === '1';
    }
    if (params.has('progressBarTheme') && progressBarTheme) {
        var t = params.get('progressBarTheme');
        if (t === '1' || t === '2') progressBarTheme.value = t;
    }
    if (params.has('showPageXY')) {
        showPageXY.checked = params.get('showPageXY') === '1';
    }
    if (params.has('showBookPercent')) {
        showBookPercent.checked = params.get('showBookPercent') === '1';
    }
    if (params.has('showChapterXY')) {
        showChapterXY.checked = params.get('showChapterXY') === '1';
    }
    if (params.has('showChapterPercent')) {
        showChapterPercent.checked = params.get('showChapterPercent') === '1';
    }
    if (params.has('statusFontSize')) {
        statusFontSize.value = params.get('statusFontSize');
        statusFontSizeNum.value = params.get('statusFontSize');
        document.getElementById('statusFontSizeValue').textContent = params.get('statusFontSize');
    }
    if (params.has('statusEdgeMargin')) {
        statusEdgeMargin.value = params.get('statusEdgeMargin');
        statusEdgeMarginNum.value = params.get('statusEdgeMargin');
        document.getElementById('statusEdgeMarginValue').textContent = params.get('statusEdgeMargin');
    }
    if (params.has('statusSideMargin')) {
        statusSideMargin.value = params.get('statusSideMargin');
        statusSideMarginNum.value = params.get('statusSideMargin');
        document.getElementById('statusSideMarginValue').textContent = params.get('statusSideMargin');
    }
    if (params.has('statusBarColor') && statusBarColor) {
        var c = params.get('statusBarColor');
        if (['black', 'dark', 'mid', 'light'].indexOf(c) >= 0) statusBarColor.value = c;
    }
    if (params.has('showCrHeader') && showCrHeader) {
        showCrHeader.checked = params.get('showCrHeader') === '1';
    }
    if (params.has('readingUnderlines') && readingUnderlines) {
        readingUnderlines.checked = params.get('readingUnderlines') === '1';
    }
    if (params.has('underlineEffect') && underlineEffect) {
        var ue = params.get('underlineEffect');
        var valid = ['solid_default', 'solid_subtle', 'solid_prominent', 'solid_faded', 'dashed_default', 'dashed_subtle', 'dashed_prominent', 'dashed_faded'];
        if (valid.indexOf(ue) >= 0) { underlineEffect.value = ue; }
    }
    if (params.has('underlinePositionPx')) {
        var px = parseInt(params.get('underlinePositionPx'), 10);
        if (!isNaN(px) && px >= -10 && px <= 16) {
            if (underlinePositionPx) underlinePositionPx.value = px;
            if (underlinePositionPxNum) underlinePositionPxNum.value = px;
            if (underlinePositionValue) underlinePositionValue.textContent = px;
        }
    }
    if (underlineOptionsGroup && readingUnderlines) {
        underlineOptionsGroup.style.display = readingUnderlines.checked ? 'block' : 'none';
    }

    console.log('[URL Params] Applied successfully');
}

// ==================== Export / Import Config ====================
var CONFIG_VERSION = 1;

function getConfig() {
    var activeOrientBtn = document.querySelector('.orientation-buttons button.active');
    var orientation = activeOrientBtn ? parseInt(activeOrientBtn.getAttribute('data-orientation'), 10) : 0;
    var cfg = {
        version: CONFIG_VERSION,
        device: devicePreset ? devicePreset.value : 'xteink-x4',
        width: parseInt(document.getElementById('customWidth').value, 10) || 480,
        height: parseInt(document.getElementById('customHeight').value, 10) || 800,
        orientation: orientation,
        landscapePages: landscapePages ? landscapePages.value : '1',
        font: fontFamily ? fontFamily.value : '',
        fontSize: fontSize ? fontSize.value : '34',
        fontWeight: fontWeight ? fontWeight.value : '400',
        lineHeight: lineHeight ? lineHeight.value : '120',
        margin: margin ? margin.value : '16',
        marginTop: marginTop ? marginTop.value : undefined,
        marginBottom: marginBottom ? marginBottom.value : undefined,
        marginLeft: marginLeft ? marginLeft.value : undefined,
        marginRight: marginRight ? marginRight.value : undefined,
        paraIndent: paraIndent ? paraIndent.value : undefined,
        paraSpacing: paraSpacing ? paraSpacing.value : undefined,
        paraSpacingMode: paraSpacingMode ? paraSpacingMode.value : undefined,
        textAlign: textAlign ? textAlign.value : undefined,
        hyphenation: hyphenation ? hyphenation.value : undefined,
        hyphenLang: hyphenationLang ? hyphenationLang.value : undefined,
        quality: qualityMode ? qualityMode.value : 'fast',
        dither: ditherMode ? (ditherMode.value === 'full' ? 'full' : ditherMode.value === 'imageOnly' ? 'imageOnly' : 'none') : 'none',
        ditherStrength: ditherStrength ? ditherStrength.value : undefined,
        negative: enableNegative ? (enableNegative.checked ? '1' : '0') : '0',
        brightness: brightness ? brightness.value : undefined,
        contrast: contrast ? contrast.value : undefined,
        imageZoom: imageZoom ? imageZoom.value : undefined,
        exportFormat: exportFormat ? exportFormat.value : undefined,
        exportFilenamePrefix: (function() { var el = document.getElementById('exportFilenamePrefix'); return el ? el.value : undefined; })(),
        imageDetectionSensitivity: imageDetectionSensitivity ? imageDetectionSensitivity.value : undefined,
        imageRegionBrightness: imageRegionBrightness ? imageRegionBrightness.value : undefined,
        imageRegionContrast: imageRegionContrast ? imageRegionContrast.value : undefined,
        imageRegionDitherStrength: imageRegionDitherStrength ? imageRegionDitherStrength.value : undefined,
        imageRegionNegative: imageRegionNegative ? (imageRegionNegative.checked ? '1' : '0') : undefined,
        progressBar: enableProgressBar ? (enableProgressBar.checked ? '1' : '0') : '0',
        progressPos: progressPosition ? progressPosition.value : undefined,
        showBookProgress: showBookProgress ? (showBookProgress.checked ? '1' : '0') : undefined,
        showChapterMarks: showChapterMarks ? (showChapterMarks.checked ? '1' : '0') : undefined,
        showChapterProgress: showChapterProgress ? (showChapterProgress.checked ? '1' : '0') : undefined,
        progressFullWidth: progressFullWidth ? (progressFullWidth.checked ? '1' : '0') : undefined,
        showPageXY: showPageXY ? (showPageXY.checked ? '1' : '0') : undefined,
        showBookPercent: showBookPercent ? (showBookPercent.checked ? '1' : '0') : undefined,
        showChapterXY: showChapterXY ? (showChapterXY.checked ? '1' : '0') : undefined,
        showChapterPercent: showChapterPercent ? (showChapterPercent.checked ? '1' : '0') : undefined,
        progressBarTheme: progressBarTheme ? progressBarTheme.value : undefined,
        statusFontSize: statusFontSize ? statusFontSize.value : undefined,
        statusEdgeMargin: statusEdgeMargin ? statusEdgeMargin.value : undefined,
        statusSideMargin: statusSideMargin ? statusSideMargin.value : undefined,
        statusBarColor: statusBarColor ? statusBarColor.value : undefined,
        showCrHeader: showCrHeader ? (showCrHeader.checked ? '1' : '0') : '0',
        readingUnderlines: readingUnderlines ? (readingUnderlines.checked ? '1' : '0') : '0',
        underlineEffect: underlineEffect ? underlineEffect.value : 'dashed_faded',
        underlinePositionPx: underlinePositionPx ? (function() { var p = parseInt(underlinePositionPx.value, 10); return isNaN(p) ? 5 : Math.max(-10, Math.min(16, p)); }()) : 5,
        bgBrightness: bgBrightness ? bgBrightness.value : undefined,
        bgContrast: bgContrast ? bgContrast.value : undefined,
        bgDither: bgDitherMode ? bgDitherMode.value : undefined,
        bgDitherStrength: bgDitherStrength ? bgDitherStrength.value : undefined,
        mode: typeof currentMode === 'string' ? currentMode : 'simple'
    };
    return cfg;
}

function syncDeviceButtonsState() {
    var devicePresetEl = document.getElementById('devicePreset');
    if (!devicePresetEl) return;
    var deviceBtnX4 = document.getElementById('deviceBtnX4');
    var deviceBtnX3 = document.getElementById('deviceBtnX3');
    if (deviceBtnX4) deviceBtnX4.classList.toggle('active', devicePresetEl.value === 'xteink-x4');
    if (deviceBtnX3) deviceBtnX3.classList.toggle('active', devicePresetEl.value === 'xteink-x3');
}

function applyConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    if (cfg.version !== CONFIG_VERSION) {
        console.warn('[Config] Version mismatch, applying anyway. File:', cfg.version, 'App:', CONFIG_VERSION);
    }

    if (cfg.device && DEVICES[cfg.device] && devicePreset) {
        devicePreset.value = cfg.device;
        if (customDimensions) customDimensions.style.display = cfg.device === 'custom' ? 'block' : 'none';
        if (typeof syncDeviceFrameDataDevice === 'function') syncDeviceFrameDataDevice();
        syncDeviceButtonsState();
    }
    if (cfg.width != null) {
        var wEl = document.getElementById('customWidth');
        if (wEl) wEl.value = String(cfg.width);
    }
    if (cfg.height != null) {
        var hEl = document.getElementById('customHeight');
        if (hEl) hEl.value = String(cfg.height);
    }
    if (cfg.orientation != null) {
        var orient = parseInt(cfg.orientation, 10);
        var orientBtns = document.querySelectorAll('.orientation-buttons button');
        orientBtns.forEach(function(btn) {
            btn.classList.remove('active');
            if (parseInt(btn.getAttribute('data-orientation'), 10) === orient) btn.classList.add('active');
        });
        updateOrientation(orient);
    } else {
        updateCanvasSize();
    }
    if (cfg.landscapePages != null && landscapePages) {
        landscapePages.value = (cfg.landscapePages === 2 || cfg.landscapePages === '2') ? '2' : '1';
    }
    updateLandscapePagesVisibility();
    if (cfg.landscapePages != null && renderer && totalPages > 0) {
        scheduleSettingsReload();
    }

    if (cfg.font && fontFamily) fontFamily.value = cfg.font;
    syncCustomFontButtonVisibility();
    if (cfg.fontSize != null && fontSize) {
        fontSize.value = cfg.fontSize;
        if (fontSizeNum) fontSizeNum.value = cfg.fontSize;
        var fv = document.getElementById('fontSizeValue');
        if (fv) fv.textContent = cfg.fontSize;
    }
    if (cfg.fontWeight != null && fontWeight) {
        fontWeight.value = cfg.fontWeight;
        if (fontWeightNum) fontWeightNum.value = cfg.fontWeight;
        var fwv = document.getElementById('fontWeightValue');
        if (fwv) fwv.textContent = cfg.fontWeight;
    }
    if (cfg.lineHeight != null && lineHeight) {
        lineHeight.value = cfg.lineHeight;
        if (lineHeightNum) lineHeightNum.value = cfg.lineHeight;
        var lhv = document.getElementById('lineHeightValue');
        if (lhv) lhv.textContent = cfg.lineHeight;
    }
    if (cfg.margin != null && margin) {
        margin.value = cfg.margin;
        if (marginNum) marginNum.value = cfg.margin;
        var mv = document.getElementById('marginValue');
        if (mv) mv.textContent = cfg.margin;
        if (marginTop) marginTop.value = cfg.margin;
        if (marginBottom) marginBottom.value = cfg.margin;
        if (marginLeft) marginLeft.value = cfg.margin;
        if (marginRight) marginRight.value = cfg.margin;
    }
    if (cfg.marginTop != null && marginTop) marginTop.value = cfg.marginTop;
    if (cfg.marginBottom != null && marginBottom) marginBottom.value = cfg.marginBottom;
    if (cfg.marginLeft != null && marginLeft) marginLeft.value = cfg.marginLeft;
    if (cfg.marginRight != null && marginRight) marginRight.value = cfg.marginRight;
    if (cfg.paraIndent != null && paraIndent) {
        paraIndent.value = cfg.paraIndent;
        if (paraIndentNum) paraIndentNum.value = cfg.paraIndent;
        var pe = document.getElementById('paraIndentValue');
        if (pe) pe.textContent = cfg.paraIndent;
    }
    if (cfg.paraSpacing != null && paraSpacing) {
        paraSpacing.value = cfg.paraSpacing;
        if (paraSpacingNum) paraSpacingNum.value = cfg.paraSpacing;
        var ps = document.getElementById('paraSpacingValue');
        if (ps) ps.textContent = cfg.paraSpacing;
    }
    if (cfg.paraSpacingMode && paraSpacingMode) {
        if (cfg.paraSpacingMode === 'double' || cfg.paraSpacingMode === 'fixed') paraSpacingMode.value = cfg.paraSpacingMode;
    }
    if (cfg.textAlign && textAlign) textAlign.value = cfg.textAlign;
    if (cfg.hyphenation != null && hyphenation) {
        hyphenation.value = cfg.hyphenation;
        var hg = document.getElementById('hyphenationLangGroup');
        if (hg) hg.style.display = hyphenation.value === '0' ? 'none' : 'block';
    }
    if (cfg.hyphenLang != null && hyphenationLang) hyphenationLang.value = cfg.hyphenLang;

    if (cfg.quality && qualityMode) qualityMode.value = cfg.quality;
    if (qualityBtnFast && qualityBtnHq) {
        var isHq = qualityMode.value === 'hq';
        qualityBtnFast.classList.toggle('active', !isHq);
        qualityBtnHq.classList.toggle('active', isHq);
    }
    if (cfg.dither != null && ditherMode) {
        if (cfg.dither === 'full' || cfg.dither === '1') ditherMode.value = 'full';
        else if (cfg.dither === 'imageOnly') ditherMode.value = 'imageOnly';
        else ditherMode.value = 'none';
        updateDitherModeUI();
    }
    if (cfg.ditherStrength != null && ditherStrength) {
        ditherStrength.value = cfg.ditherStrength;
        if (ditherStrengthNum) ditherStrengthNum.value = cfg.ditherStrength;
        var dsv = document.getElementById('ditherStrengthValue');
        if (dsv) dsv.textContent = cfg.ditherStrength;
    }
    if (cfg.negative != null && enableNegative) enableNegative.checked = cfg.negative === '1';
    if (cfg.brightness != null && brightness) {
        brightness.value = cfg.brightness;
        if (brightnessNum) brightnessNum.value = cfg.brightness;
        var bv = document.getElementById('brightnessValue');
        if (bv) bv.textContent = cfg.brightness;
    }
    if (cfg.contrast != null && contrast) {
        contrast.value = cfg.contrast;
        if (contrastNum) contrastNum.value = cfg.contrast;
        var cv = document.getElementById('contrastValue');
        if (cv) cv.textContent = cfg.contrast;
    }
    if (cfg.imageZoom != null && imageZoom) {
        imageZoom.value = cfg.imageZoom;
        if (imageZoomNum) imageZoomNum.value = cfg.imageZoom;
        var izv = document.getElementById('imageZoomValue');
        if (izv) izv.textContent = cfg.imageZoom;
    }
    if (cfg.exportFormat && exportFormat) exportFormat.value = cfg.exportFormat;
    var exportFilenamePrefixEl = document.getElementById('exportFilenamePrefix');
    if (cfg.exportFilenamePrefix != null && exportFilenamePrefixEl) exportFilenamePrefixEl.value = cfg.exportFilenamePrefix;
    if (exportFilenamePrefixEl && cfg.exportFilenamePrefix == null) syncExportPrefixFromDevice();
    if (cfg.imageDetectionSensitivity != null && imageDetectionSensitivity) {
        imageDetectionSensitivity.value = cfg.imageDetectionSensitivity;
        if (imageDetectionSensitivityNum) imageDetectionSensitivityNum.value = cfg.imageDetectionSensitivity;
        var idsv = document.getElementById('imageDetectionSensitivityValue');
        if (idsv) idsv.textContent = cfg.imageDetectionSensitivity;
    }
    if (cfg.imageRegionBrightness != null && imageRegionBrightness) {
        imageRegionBrightness.value = cfg.imageRegionBrightness;
        if (imageRegionBrightnessNum) imageRegionBrightnessNum.value = cfg.imageRegionBrightness;
        var irbv = document.getElementById('imageRegionBrightnessValue');
        if (irbv) irbv.textContent = cfg.imageRegionBrightness;
    }
    if (cfg.imageRegionContrast != null && imageRegionContrast) {
        imageRegionContrast.value = cfg.imageRegionContrast;
        if (imageRegionContrastNum) imageRegionContrastNum.value = cfg.imageRegionContrast;
        var ircv = document.getElementById('imageRegionContrastValue');
        if (ircv) ircv.textContent = cfg.imageRegionContrast;
    }
    if (cfg.imageRegionDitherStrength != null && imageRegionDitherStrength) {
        imageRegionDitherStrength.value = cfg.imageRegionDitherStrength;
        if (imageRegionDitherStrengthNum) imageRegionDitherStrengthNum.value = cfg.imageRegionDitherStrength;
        var irdsv = document.getElementById('imageRegionDitherStrengthValue');
        if (irdsv) irdsv.textContent = cfg.imageRegionDitherStrength;
    }
    if (cfg.imageRegionNegative != null && imageRegionNegative) imageRegionNegative.checked = cfg.imageRegionNegative === '1';

    if (cfg.progressBar != null && enableProgressBar) {
        enableProgressBar.checked = cfg.progressBar === '1';
        var psEl = document.getElementById('progressSettings');
        if (psEl) psEl.style.display = enableProgressBar.checked ? 'block' : 'none';
    }
    if (cfg.progressPos && progressPosition) progressPosition.value = cfg.progressPos;
    if (cfg.showBookProgress != null && showBookProgress) showBookProgress.checked = cfg.showBookProgress === '1';
    if (cfg.showChapterMarks != null && showChapterMarks) showChapterMarks.checked = cfg.showChapterMarks === '1';
    if (cfg.showChapterProgress != null && showChapterProgress) showChapterProgress.checked = cfg.showChapterProgress === '1';
    if (cfg.progressFullWidth != null && progressFullWidth) progressFullWidth.checked = cfg.progressFullWidth === '1';
    if (cfg.showPageXY != null && showPageXY) showPageXY.checked = cfg.showPageXY === '1';
    if (cfg.showBookPercent != null && showBookPercent) showBookPercent.checked = cfg.showBookPercent === '1';
    if (cfg.showChapterXY != null && showChapterXY) showChapterXY.checked = cfg.showChapterXY === '1';
    if (cfg.showChapterPercent != null && showChapterPercent) showChapterPercent.checked = cfg.showChapterPercent === '1';
    if (cfg.progressBarTheme && progressBarTheme && (cfg.progressBarTheme === '1' || cfg.progressBarTheme === '2')) {
        progressBarTheme.value = cfg.progressBarTheme;
    }
    if (cfg.statusFontSize != null && statusFontSize) {
        statusFontSize.value = cfg.statusFontSize;
        if (statusFontSizeNum) statusFontSizeNum.value = cfg.statusFontSize;
        var sfsv = document.getElementById('statusFontSizeValue');
        if (sfsv) sfsv.textContent = cfg.statusFontSize;
    }
    if (cfg.statusEdgeMargin != null && statusEdgeMargin) {
        statusEdgeMargin.value = cfg.statusEdgeMargin;
        if (statusEdgeMarginNum) statusEdgeMarginNum.value = cfg.statusEdgeMargin;
        var semv = document.getElementById('statusEdgeMarginValue');
        if (semv) semv.textContent = cfg.statusEdgeMargin;
    }
    if (cfg.statusSideMargin != null && statusSideMargin) {
        statusSideMargin.value = cfg.statusSideMargin;
        if (statusSideMarginNum) statusSideMarginNum.value = cfg.statusSideMargin;
        var ssmv = document.getElementById('statusSideMarginValue');
        if (ssmv) ssmv.textContent = cfg.statusSideMargin;
    }
    if (cfg.statusBarColor && statusBarColor && ['black', 'dark', 'mid', 'light'].indexOf(cfg.statusBarColor) >= 0) {
        statusBarColor.value = cfg.statusBarColor;
    }
    if (cfg.showCrHeader != null && showCrHeader) {
        showCrHeader.checked = cfg.showCrHeader === '1';
    }
    if (cfg.readingUnderlines != null && readingUnderlines) {
        readingUnderlines.checked = cfg.readingUnderlines === '1';
    }
    if (cfg.underlineEffect && underlineEffect) {
        var valid = ['solid_default', 'solid_subtle', 'solid_prominent', 'solid_faded', 'dashed_default', 'dashed_subtle', 'dashed_prominent', 'dashed_faded'];
        if (valid.indexOf(cfg.underlineEffect) >= 0) { underlineEffect.value = cfg.underlineEffect; }
    }
    if (cfg.underlinePositionPx != null && !isNaN(cfg.underlinePositionPx)) {
        var px = Math.max(-10, Math.min(16, parseInt(cfg.underlinePositionPx, 10)));
        if (underlinePositionPx) underlinePositionPx.value = px;
        if (underlinePositionPxNum) underlinePositionPxNum.value = px;
        if (underlinePositionValue) underlinePositionValue.textContent = px;
    }
    if (underlineOptionsGroup && readingUnderlines) {
        underlineOptionsGroup.style.display = readingUnderlines.checked ? 'block' : 'none';
    }
    if (cfg.bgBrightness != null && bgBrightness) {
        bgBrightness.value = cfg.bgBrightness;
        if (bgBrightnessNum) bgBrightnessNum.value = cfg.bgBrightness;
        var bgBv = document.getElementById('bgBrightnessValue');
        if (bgBv) bgBv.textContent = cfg.bgBrightness;
    }
    if (cfg.bgContrast != null && bgContrast) {
        bgContrast.value = cfg.bgContrast;
        if (bgContrastNum) bgContrastNum.value = cfg.bgContrast;
        var bgCv = document.getElementById('bgContrastValue');
        if (bgCv) bgCv.textContent = cfg.bgContrast;
    }
    if (cfg.bgDither != null && bgDitherMode) {
        if (cfg.bgDither === 'full') bgDitherMode.value = 'full';
        else bgDitherMode.value = 'none';
        var bgDsg = document.getElementById('bgDitherStrengthGroup');
        if (bgDsg) bgDsg.style.display = bgDitherMode.value === 'full' ? 'block' : 'none';
    }
    if (cfg.bgDitherStrength != null && bgDitherStrength) {
        bgDitherStrength.value = cfg.bgDitherStrength;
        if (bgDitherStrengthNum) bgDitherStrengthNum.value = cfg.bgDitherStrength;
        var bgDsv = document.getElementById('bgDitherStrengthValue');
        if (bgDsv) bgDsv.textContent = cfg.bgDitherStrength;
    }
    if (cfg.mode && typeof setMode === 'function') setMode(cfg.mode);

    updateDitherModeUI();
    if (renderer) {
        if (bgImageOriginal) {
            updateBgImageData().then(function() {
                applySettings();
                renderCurrentPage();
            });
        } else {
            applySettings();
            renderCurrentPage();
        }
    }
    console.log('[Config] Applied successfully');
}

function exportConfig() {
    var cfg = getConfig();
    var json = JSON.stringify(cfg, null, 2);
    if (typeof downloadFile === 'function') {
        downloadFile(new Blob([json], { type: 'application/json' }), 'xtc-converter-config.json');
    } else {
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'xtc-converter-config.json';
        a.click();
        setTimeout(function() { URL.revokeObjectURL(url); }, 200);
    }
}

function setupConfigImportExport() {
    var exportConfigBtn = document.getElementById('exportConfigBtn');
    var importConfigBtn = document.getElementById('importConfigBtn');
    var configFileInput = document.getElementById('configFileInput');
    if (exportConfigBtn) exportConfigBtn.addEventListener('click', exportConfig);
    if (importConfigBtn) {
        importConfigBtn.addEventListener('click', function() {
            if (configFileInput) configFileInput.click();
        });
    }
    if (configFileInput) {
        configFileInput.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(ev) {
                try {
                    var cfg = JSON.parse(ev.target.result);
                    applyConfig(cfg);
                } catch (err) {
                    console.error('[Config] Import failed:', err);
                    alert(typeof t === 'function' ? t('alertConfigImportFailed') : 'Failed to import config: ' + err.message);
                }
            };
            reader.onerror = function() {
                console.error('[Config] File read failed');
                alert(typeof t === 'function' ? t('alertConfigImportFailed') : 'Failed to import config: ' + err.message);
            };
            reader.readAsText(file);
            configFileInput.value = '';
        });
    }
}

// ==================== Initialize ====================
function setInitProgress(percent, textKey) {
    var overlay = document.getElementById('initLoadingOverlay');
    if (!overlay) return;
    var bar = document.getElementById('initLoadingBarFill');
    var txt = document.getElementById('initLoadingText');
    if (bar) bar.style.width = percent + '%';
    if (txt) txt.textContent = t(textKey);
}

function dismissInitOverlay() {
    var overlay = document.getElementById('initLoadingOverlay');
    if (!overlay) return;
    setInitProgress(100, 'initLoadingDone');
    setTimeout(function() {
        overlay.classList.add('fade-out');
        setTimeout(function() { overlay.remove(); }, 400);
    }, 300);
}

async function init() {
    var overlay = document.getElementById('initLoadingOverlay');
    try {
        setInitProgress(5, 'initLoading');

        applyUrlParams();
        syncExportPrefixFromDevice();
        syncCustomFontButtonVisibility();
        if (qualityBtnFast && qualityBtnHq) {
            var isHq = qualityMode.value === 'hq';
            qualityBtnFast.classList.toggle('active', !isHq);
            qualityBtnHq.classList.toggle('active', isHq);
        }

        setInitProgress(10, 'initLoadingWasm');

        var moduleOptions = (typeof createCREngineModuleOptions === 'function')
            ? createCREngineModuleOptions()
            : {};
        Module = await CREngine(moduleOptions);
        renderer = new Module.EpubRenderer(SCREEN_WIDTH, SCREEN_HEIGHT);
        if (typeof renderer.setEmbeddedFontsEnabled === 'function') {
            renderer.setEmbeddedFontsEnabled(false);
            console.log('[init] setEmbeddedFontsEnabled(false) OK');
        }
        wasmReady = true;
        console.log('CREngine WASM loaded (single instance)');

        setInitProgress(50, 'initLoadingFonts');

        await loadDefaultFonts();
        if (GOOGLE_FONTS[fontFamily.value] && !loadedFonts.has(fontFamily.value)) {
            var fallbackFamily = null;
            var families = Object.keys(GOOGLE_FONTS);
            for (var i = 0; i < families.length; i++) {
                if (loadedFonts.has(families[i])) {
                    fallbackFamily = families[i];
                    break;
                }
            }
            if (fallbackFamily) {
                fontFamily.value = fallbackFamily;
            }
        }

        setInitProgress(85, 'initLoadingDither');

        await initDitherWorker();

        setInitProgress(95, 'initLoadingDone');

        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, deviceWidth, deviceHeight);

        showNoChaptersMessage();
        updatePdfModeUI(false);

        dismissInitOverlay();

    } catch (err) {
        console.error('Failed to initialize CREngine:', err);
        if (overlay) overlay.remove();
        alert(t('alertWasmFailed'));
    }
}

/** 单实例模式下不再维护“无图”副本，imageOnly 时对含图页面使用整页 dither（无 mask）。 */
function renderNoImagesFrameBuffer(pageNum) {
    return null;
}

// ==================== Background Image ====================

/** Builds bgImageData from bgImageOriginal, applying background-only brightness, contrast, and optional dither. */
function updateBgImageData() {
    if (!bgImageOriginal) { bgImageData = null; return Promise.resolve(); }
    var offscreen = document.createElement('canvas');
    offscreen.width = SCREEN_WIDTH;
    offscreen.height = SCREEN_HEIGHT;
    var offCtx = offscreen.getContext('2d');
    var mode = document.getElementById('bgImageMode');
    if (mode && mode.value === 'tile') {
        // 平铺 = 单张居中，不重复
        offCtx.fillStyle = '#fff';
        offCtx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        var W = bgImageOriginal.naturalWidth || bgImageOriginal.width;
        var H = bgImageOriginal.naturalHeight || bgImageOriginal.height;
        var dx = (SCREEN_WIDTH - W) / 2;
        var dy = (SCREEN_HEIGHT - H) / 2;
        offCtx.drawImage(bgImageOriginal, dx, dy, W, H);
    } else {
        offCtx.drawImage(bgImageOriginal, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    }
    var raw = offCtx.getImageData(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    var brightVal = (bgBrightness && bgBrightness.value != null) ? (parseInt(bgBrightness.value, 10) || 0) : 0;
    var contrastVal = (bgContrast && bgContrast.value != null) ? (parseInt(bgContrast.value, 10) || 0) : 0;
    if (brightVal !== 0 || contrastVal !== 0) {
        if (typeof applyBrightnessContrast === 'function') {
            applyBrightnessContrast(raw, brightVal, contrastVal);
        }
    }

    var bgDitherVal = (bgDitherMode && bgDitherMode.value) ? bgDitherMode.value : 'none';
    if (bgDitherVal === 'full' && typeof applyDithering === 'function') {
        var bits = qualityMode && qualityMode.value === 'hq' ? 2 : 1;
        var strength = (bgDitherStrength && bgDitherStrength.value != null)
            ? (parseInt(bgDitherStrength.value, 10) || 50) / 100 : 0.5;
        return applyDithering(raw, bits, strength).then(function(dithered) {
            bgImageData = dithered;
        });
    }
    bgImageData = raw;
    return Promise.resolve();
}

function compositeBackgroundImage(imageData) {
    if (!bgImageData) return;
    var data = imageData.data;
    var bg = bgImageData.data;
    var len = data.length;
    // 背景已在 updateBgImageData 里单独处理好（亮度/对比/抖动），这里只做“贴上去”：空白区用背景替换，内容区完全保留
    var whiteThreshold = 253; // >= 此值视为空白，用处理好的背景替换；否则保留引擎输出的文字等
    for (var i = 0; i < len; i += 4) {
        if (data[i] >= whiteThreshold) {
            var g = (0.299 * bg[i] + 0.587 * bg[i + 1] + 0.114 * bg[i + 2] + 0.5) | 0;
            data[i] = data[i + 1] = data[i + 2] = g;
        }
    }
}

/** 与 applySettings 一致的边距/行高，用于下划线行网格；下划线左右顶住 ml～(w-mr) */
function getUnderlineLayout() {
    function parseOrDefault(value, fallback) {
        var n = parseInt(value, 10);
        return isNaN(n) ? fallback : n;
    }
    var m = parseOrDefault(margin && margin.value, 16);
    var mt, mb, ml, mr, lineHeightPx;
    if (document.body.classList.contains('expert-mode') && marginTop && marginBottom && marginLeft && marginRight) {
        mt = parseOrDefault(marginTop.value, m);
        mb = parseOrDefault(marginBottom.value, m);
        ml = parseOrDefault(marginLeft.value, m);
        mr = parseOrDefault(marginRight.value, m);
    } else {
        mt = mb = ml = mr = m;
    }
    var fs = parseOrDefault(fontSize && fontSize.value, 34);
    var lh = parseOrDefault(lineHeight && lineHeight.value, 120);
    lineHeightPx = (fs * lh / 100);
    if (lineHeightPx < 8) lineHeightPx = 8;
    return { mt: mt, mb: mb, ml: ml, mr: mr, lineHeightPx: lineHeightPx };
}

/** 根据当前段距模式返回段落 margin-bottom 的像素值。二倍行距模式 = 1×行高；固定模式 = 滑块值。 */
function getEffectiveParaSpacingPx() {
    var layout = getUnderlineLayout();
    if (paraSpacingMode && paraSpacingMode.value === 'double') {
        return Math.max(0, Math.round(layout.lineHeightPx));
    }
    return paraSpacing ? (parseInt(paraSpacing.value, 10) || 0) : 0;
}

/** 检测本页每一行的文字下缘 y（基线），用于按页自动校准下划线 */
function detectTextLineBaselines(imageData, mt, mb, ml, mr) {
    var w = imageData.width;
    var h = imageData.height;
    var data = imageData.data;
    var yEnd = h - mb;
    var xStart = Math.max(0, ml);
    var xEnd = Math.min(w, w - mr);
    var rowWidth = xEnd - xStart;
    var minTextPixels = Math.max(8, (rowWidth * 0.02) | 0);
    var darkThreshold = 240;
    var gapRows = 3;
    var baselines = [];
    var inBlock = false;
    var blockBottom = 0;
    var gapCount = 0;
    var y;
    for (y = mt; y < yEnd; y++) {
        var count = 0;
        var row = y * w * 4;
        for (var x = xStart; x < xEnd; x++) {
            if (data[row + x * 4] < darkThreshold) count++;
        }
        var hasText = count >= minTextPixels;
        if (hasText) {
            if (!inBlock) inBlock = true;
            gapCount = 0;
            blockBottom = y;
        } else {
            if (inBlock) {
                gapCount++;
                if (gapCount >= gapRows) {
                    baselines.push(blockBottom);
                    inBlock = false;
                }
            }
        }
    }
    if (inBlock) baselines.push(blockBottom);
    return baselines;
}

/** 在 imageData 上按页绘制下划线。baselines 为每行底部 y 坐标（可由 CREngine getLineBaselines() 提供）；若未提供或为空则回退到图像检测。仅涂白区，左右顶住边距，位置为相对每行底部的偏移；支持实线/虚线。
 *  baselinesHeadingFromEngine：可选，与 baselines 等长的 Uint8Array/Array，1 表示该行为标题行(h1–h6)。二倍行距补线时，若下一行为标题则不在该间隙内插入合成基线，避免标题上下出现多余下划线。 */
function drawUnderlineLayer(imageData, baselinesFromEngine, baselinesHeadingFromEngine) {
    if (!readingUnderlines || !readingUnderlines.checked) return;

    var positionPx = 5;
    if (underlinePositionPx && underlinePositionPx.value != null) {
        positionPx = parseInt(underlinePositionPx.value, 10);
        if (isNaN(positionPx)) positionPx = 5;
    } else if (underlinePositionPxNum && underlinePositionPxNum.value != null) {
        positionPx = parseInt(underlinePositionPxNum.value, 10);
        if (isNaN(positionPx)) positionPx = 5;
    }
    positionPx = Math.max(-10, Math.min(16, positionPx));

    var effect = (underlineEffect && underlineEffect.value) ? underlineEffect.value : 'dashed_faded';
    var parts = effect.split('_');
    var style = parts[0] || 'solid';
    var theme = parts[1] || 'default';
    var dashed = style === 'dashed';
    var dashLen = 4;
    var gapLen = 3;

    var layout = getUnderlineLayout();
    var mt = layout.mt;
    var mb = layout.mb;
    var ml = layout.ml;
    var mr = layout.mr;
    var w = imageData.width;
    var h = imageData.height;
    var data = imageData.data;
    var xStart = Math.max(0, ml);
    var xEnd = Math.min(w, w - mr);

    var lineGray = theme === 'subtle' ? 200 : 0;
    var thickness = theme === 'prominent' ? 2 : 1;
    // 虚化（faded）：用黑色但只画每隔一像素，1-bit 下仍为黑可见，视觉更淡
    var sparseFaded = (theme === 'faded');

    var baselines;
    var headingFlags = null;  // 与 baselines 等长，1 = 该行为标题行；仅当来自引擎且长度一致时有效
    if (baselinesFromEngine && baselinesFromEngine.length > 0) {
        baselines = Array.from(baselinesFromEngine);
        if (baselinesHeadingFromEngine && baselinesHeadingFromEngine.length === baselines.length) {
            headingFlags = Array.from(baselinesHeadingFromEngine);
            // 按 y 排序，保持 baseline 与 heading 一一对应
            var pairs = baselines.map(function(y, idx) { return { y: y, h: headingFlags[idx] }; });
            pairs.sort(function(a, b) { return a.y - b.y; });
            baselines = pairs.map(function(p) { return p.y; });
            headingFlags = pairs.map(function(p) { return p.h; });
        }
    } else {
        baselines = detectTextLineBaselines(imageData, mt, mb, ml, mr);
    }
    // 只使用引擎/检测到的真实基线，不再在二倍行距下插入合成基线，避免出现两条几乎重合的下划线
    if (!headingFlags && baselines.length > 0)
        baselines = baselines.slice().sort(function(a, b) { return a - b; });
    // 合并过近的基线，避免出现两条几乎重合的下划线（引擎或排版可能返回相邻两条很近的线）
    var minGapPx = Math.min(6, Math.max(2, (layout.lineHeightPx / 3) | 0));
    var filtered = [];
    for (var bi = 0; bi < baselines.length; bi++) {
        if (filtered.length === 0 || baselines[bi] - filtered[filtered.length - 1] >= minGapPx)
            filtered.push(baselines[bi]);
    }
    baselines = filtered;

    var b, lineY, t, yy, x, i, pos;
    for (b = 0; b < baselines.length; b++) {
        lineY = baselines[b] + positionPx;
        for (t = 0; t < thickness; t++) {
            yy = lineY + t;
            if (yy < 0 || yy >= h) continue;
            var row = yy * w * 4;
            for (x = xStart; x < xEnd; x++) {
                if (dashed) {
                    pos = (x - xStart) % (dashLen + gapLen);
                    if (pos >= dashLen) continue;
                }
                if (sparseFaded && (x - xStart) % 2 !== 0) continue;
                i = row + x * 4;
                if (data[i] > 250) {
                    data[i] = data[i + 1] = data[i + 2] = lineGray;
                }
            }
        }
    }
}

// ==================== Rendering ====================
// Preview uses same pipeline as export (dithering / anti-aliasing / negative) so WYSIWYG.
async function renderCurrentPage() {
    var requestId = ++renderRequestId;
    if (!isPdfMode && !isPptxMode && (!wasmReady || !renderer)) return;

    // Don't render if no document is loaded
    if (totalPages === 0) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, deviceWidth, deviceHeight);
        return;
    }

    // Guard against stale/out-of-range page index after re-pagination.
    if (currentPage < 0) currentPage = 0;
    if (currentPage >= totalPages) currentPage = Math.max(0, totalPages - 1);

    try {
        var imageData;
        var lineBaselines = null;
        var lineBaselinesHeading = null;
        if (isPdfMode) {
            imageData = await renderPdfPageToImageData(currentPage, SCREEN_WIDTH, SCREEN_HEIGHT);
        } else if (isPptxMode) {
            imageData = await renderPptxPageToImageData(currentPage, SCREEN_WIDTH, SCREEN_HEIGHT);
        } else {
            renderer.goToPage(currentPage);
            renderer.renderCurrentPage();

            var frameBuffer = renderer.getFrameBuffer();
            if (!frameBuffer || frameBuffer.length === 0) {
                console.warn('Empty frame buffer');
                return;
            }

            var expectedGray = SCREEN_WIDTH * SCREEN_HEIGHT;
            var expectedRGBA = expectedGray * 4;
            if (frameBuffer.length === expectedRGBA) {
                imageData = new ImageData(
                    new Uint8ClampedArray(frameBuffer),
                    SCREEN_WIDTH,
                    SCREEN_HEIGHT
                );
            } else {
                var rgba = new Uint8ClampedArray(expectedRGBA);
                for (var i = 0; i < frameBuffer.length; i++) {
                    var g = frameBuffer[i];
                    var o = i * 4;
                    rgba[o] = g;
                    rgba[o + 1] = g;
                    rgba[o + 2] = g;
                    rgba[o + 3] = 255;
                }
                imageData = new ImageData(rgba, SCREEN_WIDTH, SCREEN_HEIGHT);
            }
            lineBaselines = (typeof renderer.getLineBaselines === 'function') ? renderer.getLineBaselines() : null;
            lineBaselinesHeading = (typeof renderer.getLineBaselinesHeading === 'function') ? renderer.getLineBaselinesHeading() : null;
        }

        // 下划线在合成背景之前绘制：优先使用引擎返回的每行底部 Y，否则回退到图像检测
        if (typeof drawUnderlineLayer === 'function') drawUnderlineLayer(imageData, lineBaselines, lineBaselinesHeading);

        // Background image compositing (multiply blend before any processing)
        if (bgImageData) compositeBackgroundImage(imageData);

        // Brightness/contrast first (grayscale adjustment before 1/2-bit quantization)
        if (brightness && contrast) {
            var brightVal = parseInt(brightness.value) || 0;
            var contrastVal = parseInt(contrast.value) || 0;
            if (brightVal !== 0 || contrastVal !== 0) {
                applyBrightnessContrast(imageData, brightVal, contrastVal);
            }
        }

        // imageOnly 模式优先使用启发式图片区域 mask，仅对图片区域抖动。
        var imageMask = null;
        var imageMaskPixels = 0;

        // Same processing as export: preview = what you get in XTC/XTCH
        var mode = getDitherMode();
        console.log(
            '[dither-debug]',
            'page=', currentPage + 1,
            'ditherMode=', mode,
            'maskPixels=', imageMaskPixels
        );
        if (mode === 'imageOnly') {
            var bits = qualityMode.value === 'hq' ? 2 : 1;
            var imageMapInfo = (isPdfMode || isPptxMode) ? { hasImages: true, source: 'pdf' } : getPageImageMapInfo(currentPage);
            var pageHasImages = !!imageMapInfo.hasImages;
            var imageRegions = [];
            if (!isPdfMode && !isPptxMode && renderer && typeof renderer.getImageRegions === 'function') {
                try {
                    imageRegions = renderer.getImageRegions() || [];
                } catch (regionErr) {
                    console.warn('[dither-debug]', 'getImageRegions failed:', regionErr);
                    imageRegions = [];
                }
            }
            if (imageRegions && imageRegions.length > 0 && typeof buildMaskFromImageRegions === 'function') {
                var regionTypeCounts = { illustration: 0, background: 0, decoration: 0, unknown: 0 };
                for (var ri = 0; ri < imageRegions.length; ri++) {
                    var rt = ((imageRegions[ri] && imageRegions[ri].type) || 'illustration').toString().toLowerCase();
                    if (regionTypeCounts.hasOwnProperty(rt)) regionTypeCounts[rt]++;
                    else regionTypeCounts.unknown++;
                }
                imageMask = buildMaskFromImageRegions(SCREEN_WIDTH, SCREEN_HEIGHT, imageRegions, {
                    expandPx: 1,
                    includeBackground: false,
                    includeDecoration: false,
                    minConfidence: 0.35
                });
                imageMaskPixels = countMaskPixels(imageMask);
                // Engine regions are authoritative; only non-background/non-decoration
                // typed regions should trigger image-only dithering.
                pageHasImages = imageMaskPixels > 0;
                console.log(
                    '[dither-debug]',
                    'engine-image-regions=', imageRegions.length,
                    'maskPixels=', imageMaskPixels,
                    'types=', regionTypeCounts
                );
            } else if (pageHasImages && typeof buildImageRegionMask === 'function') {
                imageMask = buildImageRegionMask(imageData);
                imageMaskPixels = countMaskPixels(imageMask);
                console.log('[dither-debug]', 'heuristic-mask-pixels=', imageMaskPixels);
            }
            console.log(
                '[dither-debug]',
                'page-image-map',
                'page=', currentPage + 1,
                'hasImages=', pageHasImages,
                'spineIndex=', imageMapInfo.spineIndex,
                'spineCount=', imageMapInfo.spineCount,
                'engineRegions=', imageRegions ? imageRegions.length : 0
            );
            if (!pageHasImages) {
                console.log('[dither-debug]', 'branch=images-only-no-images-skip', 'maskPixels=', imageMaskPixels);
                if (qualityMode.value === 'hq') applyAntiAliasing(imageData);
            } else if (imageMask && imageMaskPixels > 0) {
                console.log('[dither-debug]', 'branch=images-only-dither');
                var imageStrength = (imageRegionDitherStrength && imageRegionDitherStrength.value != null)
                    ? parseInt(imageRegionDitherStrength.value, 10) / 100
                    : (parseInt(ditherStrength.value, 10) || 75) / 100;
                imageData = await applyDitheringOnlyToImageRegions(imageData, {
                    bits: bits,
                    isHQ: qualityMode.value === 'hq',
                    imageBrightness: imageRegionBrightness ? (parseInt(imageRegionBrightness.value, 10) || 0) : 0,
                    imageContrast: imageRegionContrast ? (parseInt(imageRegionContrast.value, 10) || 0) : 0,
                    imageDither: true,
                    imageDitherStrength: imageStrength,
                    imageNegative: imageRegionNegative ? imageRegionNegative.checked : false,
                    imageMask: imageMask,
                    strictImageMask: true
                });
            } else {
                console.log('[dither-debug]', 'branch=images-only-has-images-no-mask-full-dither');
                var imgBright = imageRegionBrightness ? (parseInt(imageRegionBrightness.value, 10) || 0) : 0;
                var imgContrast = imageRegionContrast ? (parseInt(imageRegionContrast.value, 10) || 0) : 0;
                if (imgBright !== 0 || imgContrast !== 0) {
                    applyBrightnessContrast(imageData, imgBright, imgContrast);
                }
                var strength = parseInt(ditherStrength.value) / 100;
                imageData = await applyDithering(imageData, bits, strength);
            }
            if (requestId !== renderRequestId) return;
        } else if (mode === 'full') {
            console.log('[dither-debug]', 'branch=full-page-dither');
            var bits = qualityMode.value === 'hq' ? 2 : 1;
            var strength = parseInt(ditherStrength.value, 10) / 100;
            if ((isPdfMode || isPptxMode) && (imageRegionBrightness || imageRegionContrast || imageRegionDitherStrength)) {
                var imgBright = imageRegionBrightness ? (parseInt(imageRegionBrightness.value, 10) || 0) : 0;
                var imgContrast = imageRegionContrast ? (parseInt(imageRegionContrast.value, 10) || 0) : 0;
                if (imgBright !== 0 || imgContrast !== 0) {
                    applyBrightnessContrast(imageData, imgBright, imgContrast);
                }
                if (imageRegionDitherStrength && imageRegionDitherStrength.value != null) {
                    strength = parseInt(imageRegionDitherStrength.value, 10) / 100;
                }
            }
            imageData = await applyDithering(imageData, bits, strength);
            if (requestId !== renderRequestId) return;
        } else if (qualityMode.value === 'hq') {
            console.log('[dither-debug]', 'branch=no-dither-hq-antialias');
            applyAntiAliasing(imageData);
        } else {
            console.log('[dither-debug]', 'branch=no-dither-no-op');
        }

        if (enableNegative.checked) {
            applyNegative(imageData);
        }

        var zoomPercent = getImageZoomPercent();
        if (zoomPercent !== 100) {
            imageData = applyCenterZoom(imageData, zoomPercent);
        }

        drawStatusBar(imageData);
        // Final quantization to match exported XTG/XTH appearance exactly.
        applyOutputQuantization(imageData, qualityMode.value);
        if (showImageMaskDebug && imageMask) {
            drawImageMaskOverlay(imageData, imageMask);
        }
        if (requestId !== renderRequestId) return;

        if (contentRotation !== 0) {
            imageData = applyContentRotation(imageData, contentRotation);
        }
        ctx.putImageData(imageData, 0, 0);

        setPageInfoText(currentPage + 1, totalPages);
        prevBtn.disabled = currentPage === 0;
        nextBtn.disabled = currentPage >= totalPages - 1;
        if (pageJumpOpenBtn) pageJumpOpenBtn.disabled = totalPages <= 0;
        var fp = document.getElementById('floatPrevBtn');
        var fn = document.getElementById('floatNextBtn');
        if (fp) fp.disabled = currentPage === 0;
        if (fn) fn.disabled = currentPage >= totalPages - 1;
        updateCurrentChapter();
    } catch (err) {
        console.error('Error rendering page:', err);
    }
}

function getDitherMode() {
    if (!ditherMode) return 'none';
    var v = (ditherMode.value || '').trim();
    if (v === 'full' || v === 'imageOnly') return v;
    return 'none';
}

/**
 * Whether the given page is from spine HTML that contains images (img/svg/image).
 * Used for imageOnly dither: only try frame-diff / dither when this is true.
 */
function pageHasImagesByHtml(pageIndex) {
    return getPageImageMapInfo(pageIndex).hasImages;
}

function getPageImageMapInfo(pageIndex) {
    if (!currentFile || !currentFile.spineHasImages || !currentFile.spineCount) {
        return { hasImages: false, spineIndex: -1, spineCount: 0 };
    }
    if (totalPages <= 0) {
        return { hasImages: false, spineIndex: -1, spineCount: currentFile.spineCount || 0 };
    }
    var spineIndex = Math.min(currentFile.spineCount - 1, Math.floor((pageIndex / totalPages) * currentFile.spineCount));
    return {
        hasImages: currentFile.spineHasImages[spineIndex] === true,
        spineIndex: spineIndex,
        spineCount: currentFile.spineCount
    };
}

/** Maps UI sensitivity 0–100 to diff threshold 1–30 (higher sensitivity = lower threshold = more area as image). */
function getImageDetectionThreshold() {
    if (!imageDetectionSensitivity) return 12;
    var s = parseInt(imageDetectionSensitivity.value, 10);
    if (isNaN(s)) return 12;
    s = Math.max(0, Math.min(100, s));
    return 1 + Math.round((100 - s) * 29 / 100);
}

function updateDitherModeUI() {
    var mode = getDitherMode();
    var strengthGroup = document.getElementById('ditherStrengthGroup');
    var hintEl = document.getElementById('ditherImageOnlyHint');
    var sensitivityGroup = document.getElementById('imageDetectionSensitivityGroup');
    if (strengthGroup) strengthGroup.style.display = (mode === 'full' || mode === 'imageOnly') ? 'block' : 'none';
    if (hintEl) hintEl.style.display = mode === 'imageOnly' ? 'block' : 'none';
    if (sensitivityGroup) sensitivityGroup.style.display = mode === 'imageOnly' ? 'block' : 'none';
}

function updatePdfModeUI(enabled) {
    document.body.classList.toggle('pdf-mode', enabled);
    var epubOnlyControls = [
        fontFamily, fontSize, fontSizeNum, fontWeight, fontWeightNum, lineHeight, lineHeightNum,
        margin, marginNum, marginTop, marginBottom, marginLeft, marginRight,
        paraIndent, paraIndentNum, textAlign, hyphenation, hyphenationLang
    ];
    if (paraSpacingMode) epubOnlyControls.push(paraSpacingMode);
    for (var i = 0; i < epubOnlyControls.length; i++) {
        var el = epubOnlyControls[i];
        if (!el) continue;
        el.disabled = enabled;
        var row = el.closest ? el.closest('.control-group') : null;
        if (row) row.style.opacity = enabled ? '0.45' : '';
    }

    var textPresetBtns = document.querySelectorAll('#textSizePresetRow .text-preset-btn');
    textPresetBtns.forEach(function(btn) {
        btn.disabled = enabled;
        btn.style.opacity = enabled ? '0.45' : '';
    });

    var customFontInput = document.getElementById('customFontInput');
    if (customFontInput) customFontInput.disabled = enabled;

    var hyphLangGroup = document.getElementById('hyphenationLangGroup');
    if (hyphLangGroup) {
        if (enabled) hyphLangGroup.style.display = 'none';
        else hyphLangGroup.style.display = hyphenation && hyphenation.value === '0' ? 'none' : 'block';
    }
}

function getImageZoomPercent() {
    if (!imageZoom) return 100;
    var z = parseInt(imageZoom.value, 10);
    if (isNaN(z)) return 100;
    if (z < 80) return 80;
    if (z > 180) return 180;
    return z;
}

function applyCenterZoom(imageData, zoomPercent) {
    if (!imageData || !imageData.data || zoomPercent === 100) return imageData;
    var scale = zoomPercent / 100;
    if (!isFinite(scale) || scale <= 0) return imageData;

    var w = imageData.width;
    var h = imageData.height;
    var src = imageData.data;
    var out = new Uint8ClampedArray(src.length);
    // Fill background white; outside zoomed area becomes white.
    for (var i = 0; i < out.length; i += 4) {
        out[i] = 255;
        out[i + 1] = 255;
        out[i + 2] = 255;
        out[i + 3] = 255;
    }

    var cx = (w - 1) / 2;
    var cy = (h - 1) / 2;
    for (var y = 0; y < h; y++) {
        var sy = ((y - cy) / scale) + cy;
        var syi = Math.round(sy);
        if (syi < 0 || syi >= h) continue;
        for (var x = 0; x < w; x++) {
            var sx = ((x - cx) / scale) + cx;
            var sxi = Math.round(sx);
            if (sxi < 0 || sxi >= w) continue;
            var srcIdx = (syi * w + sxi) * 4;
            var dstIdx = (y * w + x) * 4;
            out[dstIdx] = src[srcIdx];
            out[dstIdx + 1] = src[srcIdx + 1];
            out[dstIdx + 2] = src[srcIdx + 2];
            out[dstIdx + 3] = src[srcIdx + 3];
        }
    }

    return new ImageData(out, w, h);
}

function resolveRendererFontFaceName(selectedFont) {
    if (!selectedFont || selectedFont === 'custom') return null;

    if (GOOGLE_FONTS[selectedFont]) {
        if (!loadedFonts.has(selectedFont)) return null;
        // fontFaceNameMap 由 app.fonts.js 在字体加载时填充
        var faceName = (typeof fontFaceNameMap !== 'undefined') ? fontFaceNameMap[selectedFont] : null;
        if (faceName) return faceName;
        // 兜底：用 GOOGLE_FONTS 键名（通常与 face name 一致，如 'Noto Sans SC'、'Lora'）
        return selectedFont;
    }

    // Custom uploaded fonts: use exact registered face name from option dataset.
    var selectedOption = fontFamily.options[fontFamily.selectedIndex];
    if (selectedOption && selectedOption.dataset && selectedOption.dataset.fontFace) {
        return selectedOption.dataset.fontFace;
    }

    if (selectedOption) {
        return selectedOption.value || null;
    }

    return null;
}

var CRENGINE_DEFAULT_CSS =
    'DocFragment { page-break-before: always; }\n' +
    'DocFragment[NonLinear] { -cr-hint: non-linear; }\n' +
    'empty-line { height: 1em; }\n' +
    'body { text-align: justify; }\n' +
    'h1 { font-size: 150%; font-weight: bold; margin: 0.7em 0 0.5em 0; hyphens: none; page-break-inside: avoid; page-break-after: avoid; }\n' +
    'h2 { font-size: 140%; font-weight: bold; margin: 0.7em 0 0.5em 0; hyphens: none; page-break-inside: avoid; page-break-after: avoid; }\n' +
    'h3 { font-size: 130%; font-weight: bold; margin: 0.7em 0 0.5em 0; hyphens: none; page-break-inside: avoid; page-break-after: avoid; }\n' +
    'h4 { font-size: 120%; font-weight: bold; margin: 0.7em 0 0.5em 0; hyphens: none; page-break-inside: avoid; page-break-after: avoid; }\n' +
    'h5 { font-size: 110%; font-weight: bold; margin: 0.7em 0 0.5em 0; hyphens: none; page-break-inside: avoid; page-break-after: avoid; }\n' +
    'h6 { font-size: 100%; font-weight: bold; margin: 0.7em 0 0.5em 0; hyphens: none; page-break-inside: avoid; page-break-after: avoid; }\n' +
    'p { text-indent: 1.2em; margin-top: 0; margin-bottom: 0; }\n' +
    'blockquote { margin: 0.5em 1em 0.5em 2em; }\n' +
    'hr { border-style: solid; }\n' +
    'ol, ul { margin-left: 1em; margin-top: 0; margin-bottom: 0; }\n' +
    'table { font-size: 80%; margin: 3px 0; border-collapse: collapse; }\n' +
    'table table { font-size: 100%; }\n' +
    'td, th { padding: 3px; border: 1px solid #333; }\n' +
    'th { background-color: #DDD; text-align: center; }\n' +
    'xmp, pre { text-align: left; margin: 0.5em 0; white-space: pre; }\n' +
    'code { white-space: pre; }\n' +
    'b, strong { font-weight: bold; }\n' +
    'i, em { font-style: italic; }\n' +
    'u, ins { text-decoration: underline; }\n' +
    'del, s, strike { text-decoration: line-through; }\n' +
    'small { font-size: 83%; }\n' +
    'big { font-size: 130%; }\n' +
    'mark { background-color: #f0f0a0; }\n' +
    'cite, dfn, var { font-style: italic; }\n' +
    'sup { font-size: 70%; }\n' +
    'sub { font-size: 70%; }\n' +
    'dl { margin: 0.5em 0; }\n' +
    'dt { font-weight: bold; margin-top: 0.5em; }\n' +
    'dd { margin-left: 2em; margin-bottom: 0.25em; }\n' +
    'figure { margin: 0.5em 0; text-align: center; }\n' +
    'figcaption { font-size: 0.9em; margin-top: 0.25em; color: #555; }\n' +
    'ruby { ruby-position: over; ruby-align: center; }\n' +
    'rt { font-size: 0.5em; font-weight: normal; }\n' +
    'img { display: inline; }\n' +
    'a[href] { color: navy; }\n';

function applyUserStylesOverride() {
    if (!renderer || typeof renderer.applyUserStyles !== 'function') return;
    var fontFaceName = resolveRendererFontFaceName(fontFamily.value);
    if (!fontFaceName) fontFaceName = (typeof getEpubForceFontFace === 'function') ? getEpubForceFontFace() : 'Noto Sans SC';
    var q = '"';
    var indent = paraIndent ? parseFloat(paraIndent.value) || 0 : 0;
    var spacing = getEffectiveParaSpacingPx();
    var lhPercent = parseInt(lineHeight.value, 10) || 120;
    var paraRule = 'p { text-indent: ' + indent + 'em !important; margin-top: 0 !important; margin-bottom: ' + spacing + 'px !important; }\n';
    var lineHeightRule = 'body, body *, p, div, section, article, .calibre1 { line-height: ' + lhPercent + '% !important; }\n';
    var css = CRENGINE_DEFAULT_CSS +
        paraRule +
        lineHeightRule +
        '* { font-family: ' + q + fontFaceName + q + ' !important; font-weight: normal !important; font-style: normal !important; }\n' +
        'b, strong { font-weight: bold !important; }\n' +
        'i, em, cite, dfn, var { font-style: italic !important; }\n' +
        'u, ins { text-decoration: underline !important; }\n' +
        'del, s, strike { text-decoration: line-through !important; }\n' +
        'small { font-size: 83% !important; }\n' +
        'big { font-size: 130% !important; }\n' +
        'mark { background-color: #f0f0a0 !important; }\n' +
        '.math, code, pre, h1, h2, h3, h4, h5, h6 { font-family: ' + q + fontFaceName + q + ' !important; }';
    console.log('[FONT] applyUserStyles CSS length:', css.length);
    renderer.applyUserStyles(css);
}

function applySettings() {
    if (totalPages === 0) return;
    if (isPdfMode || isPptxMode) {
        renderCurrentPage();
        return;
    }
    if (!renderer) return;

    console.log('[applySettings] called. currentEpubPtr=', typeof currentEpubPtr !== 'undefined' ? currentEpubPtr : 'N/A',
        'fontSize=', fontSize.value, 'lineHeight=', lineHeight.value, 'margin=', margin.value);

    try {
        var fontFaceName = resolveRendererFontFaceName(fontFamily.value) ||
            ((typeof getEpubForceFontFace === 'function') ? getEpubForceFontFace() : 'Noto Sans SC');
        console.log('[FONT] setFontFace called, name=', fontFaceName);
        var setFontFaceOk = true;
        try {
            renderer.setFontFace(fontFaceName);
            console.log('[FONT] setFontFace DONE, name=', fontFaceName);
        } catch (fontErr) {
            setFontFaceOk = false;
            console.warn('[FONT] setFontFace failed, fallback to CSS override only:', fontFaceName, fontErr);
        }
        // 始终注入用户字体 CSS，确保 EPUB 内联样式不会覆盖用户选择的字体
        if (typeof applyUserStylesOverride === 'function') {
            try { applyUserStylesOverride(); } catch (e) { /* ignore */ }
        }

        function parseOrDefault(value, fallback) {
            var n = parseInt(value, 10);
            return isNaN(n) ? fallback : n;
        }
        var m = parseOrDefault(margin.value, 16);
        var mt, mb, ml, mr;
        if (document.body.classList.contains('expert-mode') && marginTop && marginBottom && marginLeft && marginRight) {
            mt = parseOrDefault(marginTop.value, m);
            mb = parseOrDefault(marginBottom.value, m);
            ml = parseOrDefault(marginLeft.value, m);
            mr = parseOrDefault(marginRight.value, m);
        } else {
            mt = mb = ml = mr = m;
        }
        renderer.setFontSize(parseInt(fontSize.value) || 34);
        renderer.setInterlineSpace(parseInt(lineHeight.value) || 120);
        renderer.setFontWeight(parseInt(fontWeight.value) || 400);
        renderer.setTextAlign(getTextAlignValue());
        renderer.setHyphenation(parseInt(hyphenation.value) || 0);
        if (typeof renderer.setPageHeaderEnabled === 'function') {
            renderer.setPageHeaderEnabled(showCrHeader ? showCrHeader.checked : false);
        }

        var hyphLang = hyphenationLang.value;
        if (hyphLang && hyphLang !== 'auto' && renderer.setHyphenationLanguage) {
            renderer.setHyphenationLanguage(hyphLang);
        }

        // 边距必须在 getPageCount() 之前最后一次设置，确保 Render() 使用的 content 区域正确
        renderer.setMargins(ml, mt, mr, mb);
        console.log('[applySettings] setMargins(L,T,R,B)=', ml, mt, mr, mb);

        if (landscapePages && typeof renderer.setVisiblePageCount === 'function') {
            renderer.setVisiblePageCount(parseInt(landscapePages.value, 10) || 1);
        }

        if (typeof currentEpubPtr !== 'undefined' && currentEpubPtr && setFontFaceOk) {
            console.log('[applySettings] calling getPageCount...');
            var pageCount = renderer.getPageCount();
            if (pageCount > 0) {
                var oldPageCount = totalPages;
                totalPages = pageCount;
                if (currentPage >= totalPages) {
                    currentPage = Math.max(0, totalPages - 1);
                }
                if (totalPages !== oldPageCount) {
                    currentToc = renderer.getToc() || [];
                    updateChapterList();
                }
            }
        }
    } catch (err) {
        console.error('【致命错误】引擎异常:', err);
        alert(t('alertWasmFailed') || '引擎异常，请刷新页面。');
    }
}

function getTextAlignValue() {
    var align = textAlign.value;
    // CREngine text align values: 0=left, 1=right, 2=center, 3=justify
    switch (align) {
        case 'left': return 0;
        case 'right': return 1;
        case 'center': return 2;
        case 'justify': return 3;
        default: return 3;
    }
}

// ==================== Navigation ====================
function setupNavigation() {
    prevBtn.addEventListener('click', function() {
        if (currentPage > 0) {
            currentPage--;
            renderCurrentPage();
        }
    });

    nextBtn.addEventListener('click', function() {
        if (currentPage < totalPages - 1) {
            currentPage++;
            renderCurrentPage();
        }
    });

    function doPageJump() {
        if (totalPages <= 0 || !pageJumpInput) return;
        var num = parseInt(pageJumpInput.value, 10);
        if (isNaN(num) || num < 1) num = 1;
        if (num > totalPages) num = totalPages;
        currentPage = num - 1;
        renderCurrentPage();
        if (pageJumpModal) pageJumpModal.classList.remove('open');
    }
    if (pageJumpBtn) pageJumpBtn.addEventListener('click', doPageJump);
    if (pageJumpInput) {
        pageJumpInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') doPageJump();
        });
    }
    if (pageJumpOpenBtn) {
        pageJumpOpenBtn.addEventListener('click', function() {
            if (!pageJumpModal || totalPages <= 0) return;
            if (pageJumpInput) {
                pageJumpInput.value = currentPage + 1;
                pageJumpInput.min = 1;
                pageJumpInput.max = totalPages;
            }
            if (pageJumpOf) pageJumpOf.textContent = ' / ' + totalPages;
            pageJumpModal.classList.add('open');
            pageJumpModal.setAttribute('aria-hidden', 'false');
            if (pageJumpInput) {
                pageJumpInput.focus();
                pageJumpInput.select();
            }
        });
    }
    if (pageJumpModalClose) {
        pageJumpModalClose.addEventListener('click', function() {
            if (pageJumpModal) {
                pageJumpModal.classList.remove('open');
                pageJumpModal.setAttribute('aria-hidden', 'true');
            }
        });
    }
    if (pageJumpModal) {
        pageJumpModal.addEventListener('click', function(e) {
            if (e.target === pageJumpModal) {
                pageJumpModal.classList.remove('open');
                pageJumpModal.setAttribute('aria-hidden', 'true');
            }
        });
    }

    refreshBtn.addEventListener('click', function() {
        // Just re-render current page (applySettings called on slider change)
        renderCurrentPage();
    });

    var floatPrevBtn = document.getElementById('floatPrevBtn');
    var floatNextBtn = document.getElementById('floatNextBtn');
    if (floatPrevBtn) {
        floatPrevBtn.addEventListener('click', function() {
            if (currentPage > 0) { currentPage--; renderCurrentPage(); }
        });
    }
    if (floatNextBtn) {
        floatNextBtn.addEventListener('click', function() {
            if (currentPage < totalPages - 1) { currentPage++; renderCurrentPage(); }
        });
    }
}

// ==================== Preview scale：整体（设备框+画布）自适应，最大占预览区 80% ====================
function updatePreviewScale() {
    if (!previewCanvas) return;
    var area = previewCanvas.closest('.preview-area');
    var wrap = document.getElementById('previewCanvasWrap');
    if (!area || !wrap) return;
    var w = area.clientWidth;
    var h = area.clientHeight;
    if (w <= 0 || h <= 0) return;
    var targetW = w * 0.80;
    var targetH = h * 0.80;
    var framePadW = 52;
    var framePadH = 108;
    var keysW = 8;
    var totalW = deviceWidth + framePadW + keysW;
    var totalH = deviceHeight + framePadH;
    var scale = Math.min(targetW / totalW, targetH / totalH, 1);
    var scalePercent = Math.round(scale * 100);

    wrap.style.setProperty('--preview-wrap-scale', String(scale));
    previewCanvas.style.setProperty('--preview-scale', '1');
    var el = document.getElementById('previewScaleValue');
    if (el) el.textContent = scalePercent + '%';
}

// ==================== Settings UI ====================
/** 根据当前设备预设同步预览区 deviceFrame 的 data-device（x3/x4 不同边框按键样式） */
function syncDeviceFrameDataDevice() {
    var frame = document.getElementById('deviceFrame');
    if (!frame || !devicePreset) return;
    var preset = devicePreset.value;
    frame.setAttribute('data-device', preset === 'xteink-x3' ? 'xteink-x3' : 'xteink-x4');
}

function setupSettings() {
    // When uniform margin changes in expert mode, sync the four per-side inputs FIRST
    // (must be registered before syncInputs so it fires before applySettings)
    function syncMarginToPerSide() {
        if (!document.body.classList.contains('expert-mode')) return;
        var v = margin.value;
        if (marginTop) marginTop.value = v;
        if (marginBottom) marginBottom.value = v;
        if (marginLeft) marginLeft.value = v;
        if (marginRight) marginRight.value = v;
    }
    margin.addEventListener('change', syncMarginToPerSide);
    marginNum.addEventListener('change', syncMarginToPerSide);

    // Sync slider/number inputs
    syncInputs(fontSize, fontSizeNum, 'fontSizeValue');
    syncInputs(fontWeight, fontWeightNum, 'fontWeightValue');
    syncInputs(lineHeight, lineHeightNum, 'lineHeightValue');
    syncInputs(margin, marginNum, 'marginValue');
    syncInputsRenderOnly(ditherStrength, ditherStrengthNum, 'ditherStrengthValue');
    if (imageDetectionSensitivity && imageDetectionSensitivityNum) syncInputsRenderOnly(imageDetectionSensitivity, imageDetectionSensitivityNum, 'imageDetectionSensitivityValue');
    syncInputsRenderOnly(brightness, brightnessNum, 'brightnessValue');
    syncInputsRenderOnly(contrast, contrastNum, 'contrastValue');
    if (imageZoom && imageZoomNum) syncInputsRenderOnly(imageZoom, imageZoomNum, 'imageZoomValue');
    if (imageRegionBrightness && imageRegionBrightnessNum) syncInputsRenderOnly(imageRegionBrightness, imageRegionBrightnessNum, 'imageRegionBrightnessValue');
    if (imageRegionContrast && imageRegionContrastNum) syncInputsRenderOnly(imageRegionContrast, imageRegionContrastNum, 'imageRegionContrastValue');
    if (imageRegionDitherStrength && imageRegionDitherStrengthNum) syncInputsRenderOnly(imageRegionDitherStrength, imageRegionDitherStrengthNum, 'imageRegionDitherStrengthValue');

    // Para indent/spacing: CREngine applies styles at load time only, so we re-preprocess on change
    (function() {
        var valueEl = document.getElementById('paraIndentValue');
        paraIndent.addEventListener('input', function() {
            paraIndentNum.value = paraIndent.value;
            if (valueEl) valueEl.textContent = paraIndent.value;
        });
        paraIndentNum.addEventListener('input', function() {
            paraIndent.value = paraIndentNum.value;
            if (valueEl) valueEl.textContent = paraIndentNum.value;
        });
        paraIndent.addEventListener('change', scheduleParagraphReload);
        paraIndentNum.addEventListener('change', scheduleParagraphReload);
    })();
    (function() {
        var valueEl = document.getElementById('paraSpacingValue');
        paraSpacing.addEventListener('input', function() {
            paraSpacingNum.value = paraSpacing.value;
            if (valueEl) valueEl.textContent = paraSpacing.value;
        });
        paraSpacingNum.addEventListener('input', function() {
            paraSpacing.value = paraSpacingNum.value;
            if (valueEl) valueEl.textContent = paraSpacingNum.value;
        });
        paraSpacing.addEventListener('change', scheduleParagraphReload);
        paraSpacingNum.addEventListener('change', scheduleParagraphReload);
    })();
    if (paraSpacingMode) paraSpacingMode.addEventListener('change', scheduleParagraphReload);

    // Per-side margins - apply on change
    if (marginTop) marginTop.addEventListener('change', function() { scheduleSettingsReload(); });
    if (marginBottom) marginBottom.addEventListener('change', function() { scheduleSettingsReload(); });
    if (marginLeft) marginLeft.addEventListener('change', function() { scheduleSettingsReload(); });
    if (marginRight) marginRight.addEventListener('change', function() { scheduleSettingsReload(); });

    // Optimizer 相关 - 已注释
    /*
    syncInputs(document.getElementById('maxImageWidth'),
               document.getElementById('maxImageWidthNum'),
               'maxImageWidthValue');
    */

    // Status bar sliders (render-only, no applySettings needed)
    syncInputsRenderOnly(statusFontSize, statusFontSizeNum, 'statusFontSizeValue');
    syncInputsRenderOnly(statusEdgeMargin, statusEdgeMarginNum, 'statusEdgeMarginValue');
    syncInputsRenderOnly(statusSideMargin, statusSideMarginNum, 'statusSideMarginValue');

    // Preview scale: observe preview area resize (window/layout change)
    var previewArea = previewCanvas.closest('.preview-area');
    if (previewArea) {
        if (typeof ResizeObserver !== 'undefined') {
            var ro = new ResizeObserver(function() {
                updatePreviewScale();
                if (totalPages >= 0 && typeof setPageInfoText === 'function') setPageInfoText(currentPage + 1, totalPages);
            });
            ro.observe(previewArea);
        } else {
            window.addEventListener('resize', function() {
                updatePreviewScale();
                if (totalPages >= 0 && typeof setPageInfoText === 'function') setPageInfoText(currentPage + 1, totalPages);
            });
        }
    }
    setTimeout(updatePreviewScale, 0);

    // Device preset
    devicePreset.addEventListener('change', function() {
        var preset = devicePreset.value;
        customDimensions.style.display = preset === 'custom' ? 'block' : 'none';
        syncDeviceFrameDataDevice();
        syncDeviceButtonsState();
        var activeOrient = document.querySelector('.orientation-buttons button.active');
        var rot = activeOrient ? parseInt(activeOrient.getAttribute('data-orientation'), 10) : 0;
        updateOrientation(rot);
        updatePreviewScale();
        syncExportPrefixFromDevice();
    });
    syncDeviceFrameDataDevice();
    syncDeviceButtonsState();

    var deviceBtnX4 = document.getElementById('deviceBtnX4');
    var deviceBtnX3 = document.getElementById('deviceBtnX3');
    if (deviceBtnX4) {
        deviceBtnX4.addEventListener('click', function() {
            devicePreset.value = 'xteink-x4';
            devicePreset.dispatchEvent(new Event('change'));
        });
    }
    if (deviceBtnX3) {
        deviceBtnX3.addEventListener('click', function() {
            devicePreset.value = 'xteink-x3';
            devicePreset.dispatchEvent(new Event('change'));
        });
    }

    // Custom dimensions
    document.getElementById('customWidth').addEventListener('change', updateCanvasSize);
    document.getElementById('customHeight').addEventListener('change', updateCanvasSize);

    // Orientation buttons
    var orientBtns = document.querySelectorAll('.orientation-buttons button');
    for (var i = 0; i < orientBtns.length; i++) {
        orientBtns[i].addEventListener('click', function() {
            for (var j = 0; j < orientBtns.length; j++) {
                orientBtns[j].classList.remove('active');
            }
            this.classList.add('active');
            updateOrientation(parseInt(this.getAttribute('data-orientation')));
            updateLandscapePagesVisibility();
        });
    }
    updateLandscapePagesVisibility();

    if (landscapePages) {
        landscapePages.addEventListener('change', function() {
            scheduleSettingsReload();
        });
    }

    // Text align change
    textAlign.addEventListener('change', function() {
        scheduleSettingsReload();
    });

    // Hyphenation mode - show/hide language dropdown
    hyphenation.addEventListener('change', function() {
        var langGroup = document.getElementById('hyphenationLangGroup');
        langGroup.style.display = hyphenation.value === '0' ? 'none' : 'block';
        scheduleSettingsReload();
    });

    // Hyphenation language change
    hyphenationLang.addEventListener('change', function() {
        scheduleSettingsReload();
    });

    // Initialize hyphenation language visibility
    document.getElementById('hyphenationLangGroup').style.display =
        hyphenation.value === '0' ? 'none' : 'block';

    // Quality mode (XTCH vs XTC) — 两个大按钮同步 + 重渲染
    function updateQualityButtonsState() {
        if (!qualityBtnFast || !qualityBtnHq) return;
        var isHq = qualityMode.value === 'hq';
        qualityBtnFast.classList.toggle('active', !isHq);
        qualityBtnHq.classList.toggle('active', isHq);
    }
    if (qualityBtnFast) {
        qualityBtnFast.addEventListener('click', function() {
            qualityMode.value = 'fast';
            updateQualityButtonsState();
            qualityMode.dispatchEvent(new Event('change'));
        });
    }
    if (qualityBtnHq) {
        qualityBtnHq.addEventListener('click', function() {
            qualityMode.value = 'hq';
            updateQualityButtonsState();
            qualityMode.dispatchEvent(new Event('change'));
        });
    }
    qualityMode.addEventListener('change', function() {
        updateQualityButtonsState();
        updateDitherModeUI();
        renderCurrentPage();
    });
    updateQualityButtonsState();

    // Dithering mode — re-render so preview matches export
    if (ditherMode) {
        ditherMode.addEventListener('change', function() {
            updateDitherModeUI();
            renderCurrentPage();
        });
    }

    // Initialize dither UI visibility on first load
    updateDitherModeUI();

    // Negative (dark mode) toggle
    enableNegative.addEventListener('change', function() {
        renderCurrentPage();
    });

    // Status bar color
    if (statusBarColor) {
        statusBarColor.addEventListener('change', function() {
            renderCurrentPage();
        });
    }
    if (showCrHeader) {
        showCrHeader.addEventListener('change', function() {
            scheduleSettingsReload();
        });
    }

    // Image brightness/contrast adjustments
    if (brightness && contrast) {
        brightness.addEventListener('change', function() {
            renderCurrentPage();
        });
        contrast.addEventListener('change', function() {
            renderCurrentPage();
        });
    }

    // Image region settings (brightness, contrast, dither strength, negative)
    if (imageRegionBrightness) imageRegionBrightness.addEventListener('change', function() { renderCurrentPage(); });
    if (imageRegionBrightnessNum) imageRegionBrightnessNum.addEventListener('change', function() { renderCurrentPage(); });
    if (imageRegionContrast) imageRegionContrast.addEventListener('change', function() { renderCurrentPage(); });
    if (imageRegionContrastNum) imageRegionContrastNum.addEventListener('change', function() { renderCurrentPage(); });
    if (imageRegionDitherStrength) imageRegionDitherStrength.addEventListener('change', function() { renderCurrentPage(); });
    if (imageRegionDitherStrengthNum) imageRegionDitherStrengthNum.addEventListener('change', function() { renderCurrentPage(); });
    if (imageRegionNegative) imageRegionNegative.addEventListener('change', function() { renderCurrentPage(); });

    // Image region quick presets
    var imagePresetBtns = document.querySelectorAll('#screenPresetRow .image-preset-btn');
    imagePresetBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var preset = btn.getAttribute('data-image-preset');
            applyImageRegionPreset(preset);
        });
    });

    // Progress bar toggle - re-render to show/hide our custom status bar
    enableProgressBar.addEventListener('change', function() {
        document.getElementById('progressSettings').style.display =
            enableProgressBar.checked ? 'block' : 'none';
        renderCurrentPage();
    });

    // All progress bar setting changes trigger re-render
    var progressBarCheckboxes = [
        progressPosition, progressBarTheme, showBookProgress, showChapterMarks, showChapterProgress,
        progressFullWidth, showPageXY, showBookPercent, showChapterXY, showChapterPercent
    ];
    progressBarCheckboxes.forEach(function(el) {
        if (el) {
            el.addEventListener('change', function() {
                renderCurrentPage();
            });
        }
    });

    // Tabs - 注释掉
    /*
    var tabBtns = document.querySelectorAll('.tabs button');
    for (var i = 0; i < tabBtns.length; i++) {
        tabBtns[i].addEventListener('click', function() {
            for (var j = 0; j < tabBtns.length; j++) {
                tabBtns[j].classList.remove('active');
            }
            var tabContents = document.querySelectorAll('.tab-panel');
            for (var j = 0; j < tabContents.length; j++) {
                tabContents[j].classList.remove('active');
            }
            this.classList.add('active');
            document.getElementById(this.getAttribute('data-tab') + '-tab').classList.add('active');
        });
    }
    */
}

// ==================== 模式切换 ====================
function setupModeSwitcher() {
    currentMode = 'simple';
    document.body.classList.add(currentMode + '-mode');

    // 模式切换按钮
    var modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var mode = btn.getAttribute('data-mode');
            setMode(mode);
        });
    });

    // 预设按钮
    var presetBtns = document.querySelectorAll('#textSizePresetRow .text-preset-btn');
    presetBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var preset = btn.getAttribute('data-preset');
            applyPreset(preset);
        });
    });

    // 初始化默认预设
    applyPreset('comfort');

    updateFontModeHint();
}

function updateFontModeHint() {
    var el = document.getElementById('fontModeHint');
    if (!el || typeof window.t !== 'function') return;
    var key = currentMode === 'expert' ? 'fontModeHintExpert' : 'fontModeHintSimple';
    el.innerHTML = window.t(key);
}
window.updateFontModeHint = updateFontModeHint;

function setMode(mode) {
    currentMode = mode;

    // 更新按钮状态
    var modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });

    // 更新body类名
    document.body.classList.remove('simple-mode', 'expert-mode');
    document.body.classList.add(mode + '-mode');

    // 切换到专家模式时，将 uniform margin 同步到四边输入框
    if (mode === 'expert' && margin) {
        var v = margin.value;
        if (marginTop) marginTop.value = v;
        if (marginBottom) marginBottom.value = v;
        if (marginLeft) marginLeft.value = v;
        if (marginRight) marginRight.value = v;
        scheduleSettingsReload();
    }

    // 保存模式到localStorage
    try {
        localStorage.setItem('converterMode', mode);
    } catch (e) {}

    updateFontModeHint();
    if (typeof updateBatchModeVisibility === 'function') updateBatchModeVisibility();
}

function applyPreset(presetName) {
    var preset = PRESETS[presetName];
    if (!preset) return;

    // 更新按钮状态
    var presetBtns = document.querySelectorAll('#textSizePresetRow .text-preset-btn');
    presetBtns.forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-preset') === presetName);
    });

    // 更新滑块和数值
    fontSize.value = preset.fontSize;
    fontSizeNum.value = preset.fontSize;
    document.getElementById('fontSizeValue').textContent = preset.fontSize;

    lineHeight.value = preset.lineHeight;
    lineHeightNum.value = preset.lineHeight;
    document.getElementById('lineHeightValue').textContent = preset.lineHeight;

    margin.value = preset.margin;
    marginNum.value = preset.margin;
    document.getElementById('marginValue').textContent = preset.margin;

    if (marginTop) { marginTop.value = preset.margin; }
    if (marginBottom) { marginBottom.value = preset.margin; }
    if (marginLeft) { marginLeft.value = preset.margin; }
    if (marginRight) { marginRight.value = preset.margin; }

    fontWeight.value = preset.fontWeight;
    fontWeightNum.value = preset.fontWeight;
    document.getElementById('fontWeightValue').textContent = preset.fontWeight;

    if (paraIndent && paraIndentNum) {
        paraIndent.value = preset.paraIndent;
        paraIndentNum.value = preset.paraIndent;
        var paraIndentValue = document.getElementById('paraIndentValue');
        if (paraIndentValue) paraIndentValue.textContent = preset.paraIndent;
    }

    if (paraSpacing && paraSpacingNum) {
        paraSpacing.value = preset.paraSpacing;
        paraSpacingNum.value = preset.paraSpacing;
        var paraSpacingValue = document.getElementById('paraSpacingValue');
        if (paraSpacingValue) paraSpacingValue.textContent = preset.paraSpacing;
    }

    // 单实例：先同步引擎参数，再让出主线程，避免 getPageCount 与 renderCurrentPage 在同一 tick 内连续重排导致崩溃
    console.log('[applyPreset]', presetName, '→ scheduleSettingsReload');
    scheduleSettingsReload();
}

function applyImageRegionPreset(presetName) {
    var presets = {
        balanced: { brightness: 0, contrast: 0, ditherStrength: 75 },
        photo: { brightness: 8, contrast: 24, ditherStrength: 35 },
        lineart: { brightness: 0, contrast: 38, ditherStrength: 55 }
    };
    var preset = presets[presetName];
    if (!preset) return;

    function setField(slider, num, valueId, value) {
        if (!slider || !num) return;
        slider.value = value;
        num.value = value;
        var el = document.getElementById(valueId);
        if (el) el.textContent = String(value);
    }

    setField(imageRegionBrightness, imageRegionBrightnessNum, 'imageRegionBrightnessValue', preset.brightness);
    setField(imageRegionContrast, imageRegionContrastNum, 'imageRegionContrastValue', preset.contrast);
    setField(imageRegionDitherStrength, imageRegionDitherStrengthNum, 'imageRegionDitherStrengthValue', preset.ditherStrength);

    var imagePresetBtns = document.querySelectorAll('#screenPresetRow .image-preset-btn');
    imagePresetBtns.forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-image-preset') === presetName);
    });

    renderCurrentPage();
}

function syncInputs(slider, num, valueId) {
    var valueEl = document.getElementById(valueId);

    slider.addEventListener('input', function() {
        num.value = slider.value;
        if (valueEl) valueEl.textContent = slider.value;
    });

    num.addEventListener('input', function() {
        slider.value = num.value;
        if (valueEl) valueEl.textContent = num.value;
    });

    slider.addEventListener('change', function() {
        scheduleSettingsReload();
    });
    num.addEventListener('change', function() {
        scheduleSettingsReload();
    });
}

// Sync inputs that only need re-render (not applySettings)
function syncInputsRenderOnly(slider, num, valueId) {
    var valueEl = document.getElementById(valueId);

    slider.addEventListener('input', function() {
        num.value = slider.value;
        if (valueEl) valueEl.textContent = slider.value;
        renderCurrentPage();
    });

    num.addEventListener('input', function() {
        slider.value = num.value;
        if (valueEl) valueEl.textContent = num.value;
        renderCurrentPage();
    });
}

function updateCanvasSize() {
    var baseDevice = DEVICES[devicePreset.value] || DEVICES['xteink-x4'];
    if (devicePreset.value === 'custom') {
        deviceWidth = parseInt(document.getElementById('customWidth').value, 10) || baseDevice.width;
        deviceHeight = parseInt(document.getElementById('customHeight').value, 10) || baseDevice.height;
    } else {
        deviceWidth = baseDevice.width;
        deviceHeight = baseDevice.height;
    }
    SCREEN_WIDTH = (contentRotation === 90 || contentRotation === 270) ? deviceHeight : deviceWidth;
    SCREEN_HEIGHT = (contentRotation === 90 || contentRotation === 270) ? deviceWidth : deviceHeight;

    previewCanvas.width = deviceWidth;
    previewCanvas.height = deviceHeight;

    if (bgImageOriginal) updateBgImageData().then(function() {
        if (renderer && !isPdfMode && !isPptxMode) scheduleSettingsReload();
        else if (isPdfMode || isPptxMode) renderCurrentPage();
    });

    if (renderer && !isPdfMode && !isPptxMode) {
        renderer.resize(SCREEN_WIDTH, SCREEN_HEIGHT);
        scheduleSettingsReload();
    } else if (isPdfMode || isPptxMode) {
        renderCurrentPage();
    }
    updatePreviewScale();
    updateLandscapePagesVisibility();
}

function updateLandscapePagesVisibility() {
    var orientBtn = document.querySelector('.orientation-buttons button.active');
    var orient = orientBtn ? parseInt(orientBtn.getAttribute('data-orientation'), 10) : 0;
    var isLandscape = (orient === 90 || orient === 270);
    var grp = document.getElementById('landscapePagesGroup');
    if (grp) grp.style.display = isLandscape ? 'block' : 'none';
}

function updateOrientation(rotation) {
    contentRotation = (rotation === 90 || rotation === 270 || rotation === 180) ? rotation : 0;
    var wrap = document.getElementById('previewCanvasWrap');
    if (wrap) wrap.setAttribute('data-rotate', String(contentRotation));
    updateCanvasSize();
}

function syncExportPrefixFromDevice() {
    var el = document.getElementById('exportFilenamePrefix');
    if (!el) return;
    var dev = DEVICES[devicePreset && devicePreset.value ? devicePreset.value : 'xteink-x4'];
    el.value = (dev && dev.defaultPrefix) ? dev.defaultPrefix : '';
}

/**
 * 对 imageData 做内容旋转。设备横放时拿到的仍是 deviceWidth×deviceHeight 的缓冲。
 * 0°: 原样；180°: 同尺寸旋转 180°；90°/270°: 将横屏渲染的 W×H 旋转后输出为 H×W（正好填满设备缓冲）。
 */
function applyContentRotation(imageData, rotation) {
    if (!imageData || !rotation || rotation === 0) return imageData;
    var w = imageData.width, h = imageData.height;
    var src = document.createElement('canvas');
    src.width = w;
    src.height = h;
    src.getContext('2d').putImageData(imageData, 0, 0);

    var outW = w, outH = h;
    if (rotation === 90 || rotation === 270) {
        outW = h;
        outH = w;
    }
    var out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    var ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);

    ctx.save();
    if (rotation === 180) {
        ctx.translate(w, h);
        ctx.rotate(Math.PI);
        ctx.drawImage(src, 0, 0, w, h);
    } else if (rotation === 90) {
        ctx.translate(outW / 2, outH / 2);
        ctx.rotate(-90 * Math.PI / 180);
        ctx.drawImage(src, -w / 2, -h / 2, w, h);
    } else if (rotation === 270) {
        ctx.translate(outW / 2, outH / 2);
        ctx.rotate(90 * Math.PI / 180);
        ctx.drawImage(src, -w / 2, -h / 2, w, h);
    }
    ctx.restore();
    return ctx.getImageData(0, 0, outW, outH);
}

// ==================== Event Listeners ====================
function syncCustomFontButtonVisibility() {
    var wrap = document.getElementById('customFontFileWrap');
    var btn = document.getElementById('customFontSelectBtn');
    if (!fontFamily || !wrap) return;
    if (fontFamily.value === 'custom') {
        wrap.style.display = '';
        if (btn && typeof t === 'function') btn.textContent = t('customFontSelectFile');
    } else {
        wrap.style.display = 'none';
    }
}

function setupEventListeners() {
    exportBtn.addEventListener('click', exportXTC);
    exportPageBtn.addEventListener('click', exportCurrentPage);
    // optimizeBtn.addEventListener('click', optimizeEpubs); // 已注释

    // 设备边框颜色切换（黑/白）
    (function() {
        var wrap = document.getElementById('deviceFrame');
        var switchEl = document.getElementById('deviceSkinSwitch');
        if (!wrap || !switchEl) return;
        switchEl.querySelectorAll('.device-skin-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var skin = this.getAttribute('data-skin');
                wrap.setAttribute('data-skin', skin);
                switchEl.querySelectorAll('.device-skin-btn').forEach(function(b) {
                    b.classList.toggle('active', b.getAttribute('data-skin') === skin);
                    b.setAttribute('aria-pressed', b.getAttribute('data-skin') === skin ? 'true' : 'false');
                });
            });
        });
    })();

    // Font family change - load Google Fonts on demand
    fontFamily.addEventListener('change', async function() {
        var selectedFont = fontFamily.value;

        if (selectedFont === 'custom') {
            // iOS Safari 不允许在 select 的 change 里对隐藏的 input[file] 触发 click，
            // 必须由用户直接点击可见按钮触发，所以只显示“选择字体文件”按钮，不在这里 click
            syncCustomFontButtonVisibility();
            return;
        }

        syncCustomFontButtonVisibility();

        // Load Google Font if not already loaded
        if (GOOGLE_FONTS[selectedFont] && !loadedFonts.has(selectedFont)) {
            progressContainer.style.display = 'flex';
            progressText.textContent = t('progressLoadingFont').replace('{0}', selectedFont);
            progressFill.style.width = '50%';

            var success = await loadGoogleFont(selectedFont);

            if (success) {
                progressText.textContent = t('progressFontLoaded').replace('{0}', selectedFont);
                scheduleSettingsReload();
            } else {
                progressText.textContent = t('progressFontFailed').replace('{0}', selectedFont);
            }

            setTimeout(function() {
                progressContainer.style.display = 'none';
            }, 1500);
        } else {
            scheduleSettingsReload();
        }
    });

    var customFontSelectBtn = document.getElementById('customFontSelectBtn');
    if (customFontSelectBtn) customFontSelectBtn.addEventListener('click', function() {
        var input = document.getElementById('customFontInput');
        if (input) input.click();
    });

    document.getElementById('customFontInput').addEventListener('change', async function(e) {
        var file = e.target.files[0];
        if (!file) return;

        var data = new Uint8Array(await file.arrayBuffer());
        if (!isFontData(data)) {
            console.warn('[customFont] not a valid TTF/OTF, skip:', file.name);
            return;
        }

        var faceName = (typeof parseTtfFamilyName === 'function') ? parseTtfFamilyName(data) : null;
        var lookupName = (faceName && faceName.lookup) ? faceName.lookup : (faceName || file.name);
        var displayName = (faceName && faceName.display) ? faceName.display : lookupName;

        var ptr = Module.allocateMemory(data.length);
        Module.HEAPU8.set(data, ptr);
        if (typeof FONT_FILENAME_ONLY_REGISTRATION !== 'undefined' && FONT_FILENAME_ONLY_REGISTRATION) {
            renderer.registerFontFromMemory(ptr, data.length, file.name);
        } else {
            renderer.registerFontFromMemory(ptr, data.length, lookupName);
            if (lookupName !== file.name) {
                renderer.registerFontFromMemory(ptr, data.length, file.name);
            }
        }
        // 加入缓存，供下次 loadEpubFromMemory 后重新注册
        // originalData 保存原始字节，reRegisterFonts 每次从此重新分配 WASM 内存，避免旧 ptr 失效
        if (typeof fontPtrCache !== 'undefined') {
            fontPtrCache.push({ ptr: ptr, len: data.length, faceName: lookupName, filename: file.name, originalData: data });
        }
        if (typeof fontFaceNameMap !== 'undefined') {
            fontFaceNameMap[file.name] = lookupName;
        }
        if (typeof writeFontToMemfs === 'function') {
            writeFontToMemfs(data, lookupName, file.name);
        }

        // Add to font family dropdown（CREngine 用 lookupName 查找；界面显示 displayName）
        var option = document.createElement('option');
        option.value = file.name;
        option.textContent = displayName !== file.name ? displayName + ' (' + file.name + ')' : file.name;
        option.dataset.fontFace = lookupName;
        fontFamily.insertBefore(option, fontFamily.lastElementChild);
        fontFamily.value = option.value;

        scheduleSettingsReload();
    });

    // Background image
    var bgImageBtn = document.getElementById('bgImageBtn');
    var bgImageInput = document.getElementById('bgImageInput');
    var bgImageDefaultBtn = document.getElementById('bgImageDefaultBtn');
    var bgImageDefaultLandscapeBtn = document.getElementById('bgImageDefaultLandscapeBtn');
    var bgImageClearBtn = document.getElementById('bgImageClearBtn');
    var bgImageModeRow = document.getElementById('bgImageModeRow');
    var bgImageModeSelect = document.getElementById('bgImageMode');
    var bgImageNameEl = document.getElementById('bgImageName');
    var bgImageEffectsGroup = document.getElementById('bgImageEffectsGroup');

    var OFFICIAL_DEFAULT_BG_URL = 'imgs/官方默认背景图.jpg';
    var OFFICIAL_DEFAULT_BG_URL_LANDSCAPE = 'imgs/官方默认背景图_横版.jpg';

    function applyOfficialDefaultBg(url, displayName) {
        var img = new Image();
        img.onload = function() {
            bgImageOriginal = img;
            if (bgImageModeRow) bgImageModeRow.style.display = '';
            if (bgImageEffectsGroup) bgImageEffectsGroup.style.display = 'block';
            if (bgImageNameEl) {
                bgImageNameEl.textContent = displayName;
                bgImageNameEl.style.display = '';
            }
            if (bgImageInput) bgImageInput.value = '';
            var bgDsg = document.getElementById('bgDitherStrengthGroup');
            if (bgDsg && bgDitherMode) bgDsg.style.display = bgDitherMode.value === 'full' ? 'block' : 'none';
            var OFFICIAL_DEFAULT_BG_BRIGHTNESS = -17;
            var OFFICIAL_DEFAULT_BG_CONTRAST = 9;
            if (bgBrightness) { bgBrightness.value = OFFICIAL_DEFAULT_BG_BRIGHTNESS; }
            if (bgBrightnessNum) bgBrightnessNum.value = OFFICIAL_DEFAULT_BG_BRIGHTNESS;
            var bgBv = document.getElementById('bgBrightnessValue');
            if (bgBv) bgBv.textContent = OFFICIAL_DEFAULT_BG_BRIGHTNESS;
            if (bgContrast) { bgContrast.value = OFFICIAL_DEFAULT_BG_CONTRAST; }
            if (bgContrastNum) bgContrastNum.value = OFFICIAL_DEFAULT_BG_CONTRAST;
            var bgCv = document.getElementById('bgContrastValue');
            if (bgCv) bgCv.textContent = OFFICIAL_DEFAULT_BG_CONTRAST;
            if (bgDitherMode) { bgDitherMode.value = 'full'; }
            if (bgDsg) bgDsg.style.display = 'block';
            var OFFICIAL_DEFAULT_BG_MARGIN_TOP_BOTTOM = 50;
            if (marginTop) marginTop.value = OFFICIAL_DEFAULT_BG_MARGIN_TOP_BOTTOM;
            if (marginBottom) marginBottom.value = OFFICIAL_DEFAULT_BG_MARGIN_TOP_BOTTOM;
            if (margin) { margin.value = OFFICIAL_DEFAULT_BG_MARGIN_TOP_BOTTOM; }
            if (marginNum) marginNum.value = OFFICIAL_DEFAULT_BG_MARGIN_TOP_BOTTOM;
            var mv = document.getElementById('marginValue');
            if (mv) mv.textContent = OFFICIAL_DEFAULT_BG_MARGIN_TOP_BOTTOM;
            updateBgImageData().then(function() { scheduleSettingsReload(); });
        };
        img.onerror = function() {
            if (typeof alert === 'function') alert(t('bgImageDefaultLoadError'));
        };
        img.src = url;
    }

    if (bgImageBtn && bgImageInput) {
        bgImageBtn.addEventListener('click', function() { bgImageInput.click(); });
        bgImageInput.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (!file) return;
            var img = new Image();
            img.onload = function() {
                bgImageOriginal = img;
                if (bgImageModeRow) bgImageModeRow.style.display = '';
                if (bgImageEffectsGroup) bgImageEffectsGroup.style.display = 'block';
                if (bgImageNameEl) {
                    bgImageNameEl.textContent = file.name;
                    bgImageNameEl.style.display = '';
                }
                var bgDsg = document.getElementById('bgDitherStrengthGroup');
                if (bgDsg && bgDitherMode) bgDsg.style.display = bgDitherMode.value === 'full' ? 'block' : 'none';
                updateBgImageData().then(function() { renderCurrentPage(); });
            };
            img.src = URL.createObjectURL(file);
        });
    }
    if (bgImageDefaultBtn) {
        bgImageDefaultBtn.addEventListener('click', function() {
            applyOfficialDefaultBg(OFFICIAL_DEFAULT_BG_URL, t('bgImageDefault'));
        });
    }
    if (bgImageDefaultLandscapeBtn) {
        bgImageDefaultLandscapeBtn.addEventListener('click', function() {
            applyOfficialDefaultBg(OFFICIAL_DEFAULT_BG_URL_LANDSCAPE, t('bgImageDefaultLandscape'));
        });
    }
    if (bgImageClearBtn) {
        bgImageClearBtn.addEventListener('click', function() {
            bgImageOriginal = null;
            bgImageData = null;
            if (bgImageModeRow) bgImageModeRow.style.display = 'none';
            if (bgImageEffectsGroup) bgImageEffectsGroup.style.display = 'none';
            if (bgImageNameEl) { bgImageNameEl.textContent = ''; bgImageNameEl.style.display = 'none'; }
            if (bgImageInput) bgImageInput.value = '';
            renderCurrentPage();
        });
    }
    if (bgImageModeSelect) {
        bgImageModeSelect.addEventListener('change', function() {
            updateBgImageData().then(function() { renderCurrentPage(); });
        });
    }

    function scheduleBgImageUpdate() {
        updateBgImageData().then(function() { renderCurrentPage(); });
    }
    if (bgBrightness) {
        bgBrightness.addEventListener('input', function() {
            if (bgBrightnessNum) bgBrightnessNum.value = bgBrightness.value;
            var el = document.getElementById('bgBrightnessValue');
            if (el) el.textContent = bgBrightness.value;
            scheduleBgImageUpdate();
        });
    }
    if (bgBrightnessNum) {
        bgBrightnessNum.addEventListener('input', function() {
            bgBrightness.value = bgBrightnessNum.value;
            var el = document.getElementById('bgBrightnessValue');
            if (el) el.textContent = bgBrightnessNum.value;
            scheduleBgImageUpdate();
        });
    }
    if (bgContrast) {
        bgContrast.addEventListener('input', function() {
            if (bgContrastNum) bgContrastNum.value = bgContrast.value;
            var el = document.getElementById('bgContrastValue');
            if (el) el.textContent = bgContrast.value;
            scheduleBgImageUpdate();
        });
    }
    if (bgContrastNum) {
        bgContrastNum.addEventListener('input', function() {
            bgContrast.value = bgContrastNum.value;
            var el = document.getElementById('bgContrastValue');
            if (el) el.textContent = bgContrastNum.value;
            scheduleBgImageUpdate();
        });
    }
    if (bgDitherMode) {
        bgDitherMode.addEventListener('change', function() {
            var bgDsg = document.getElementById('bgDitherStrengthGroup');
            if (bgDsg) bgDsg.style.display = bgDitherMode.value === 'full' ? 'block' : 'none';
            scheduleBgImageUpdate();
        });
    }
    if (bgDitherStrength) {
        bgDitherStrength.addEventListener('input', function() {
            if (bgDitherStrengthNum) bgDitherStrengthNum.value = bgDitherStrength.value;
            var el = document.getElementById('bgDitherStrengthValue');
            if (el) el.textContent = bgDitherStrength.value;
            scheduleBgImageUpdate();
        });
    }
    if (bgDitherStrengthNum) {
        bgDitherStrengthNum.addEventListener('input', function() {
            bgDitherStrength.value = bgDitherStrengthNum.value;
            var el = document.getElementById('bgDitherStrengthValue');
            if (el) el.textContent = bgDitherStrengthNum.value;
            scheduleBgImageUpdate();
        });
    }

    if (readingUnderlines) {
        readingUnderlines.addEventListener('change', function() {
            if (underlineOptionsGroup) underlineOptionsGroup.style.display = readingUnderlines.checked ? 'block' : 'none';
            scheduleSettingsReload();
        });
    }
    if (underlineEffect) {
        underlineEffect.addEventListener('change', function() { scheduleSettingsReload(); });
    }
    function syncUnderlinePositionPx() {
        var val = underlinePositionPx ? parseInt(underlinePositionPx.value, 10) : 5;
        if (isNaN(val)) val = 5;
        val = Math.max(-10, Math.min(16, val));
        if (underlinePositionPxNum) underlinePositionPxNum.value = val;
        if (underlinePositionValue) underlinePositionValue.textContent = val;
        if (underlinePositionPx) underlinePositionPx.value = val;
        scheduleSettingsReload();
    }
    if (underlinePositionPx) underlinePositionPx.addEventListener('input', syncUnderlinePositionPx);
    if (underlinePositionPx) underlinePositionPx.addEventListener('change', syncUnderlinePositionPx);
    if (underlinePositionPxNum) underlinePositionPxNum.addEventListener('change', function() {
        var val = parseInt(underlinePositionPxNum.value, 10);
        if (isNaN(val)) val = 5;
        val = Math.max(-10, Math.min(16, val));
        underlinePositionPxNum.value = val;
        if (underlinePositionPx) underlinePositionPx.value = val;
        if (underlinePositionValue) underlinePositionValue.textContent = val;
        scheduleSettingsReload();
    });
    if (underlineOptionsGroup && readingUnderlines) {
        underlineOptionsGroup.style.display = readingUnderlines.checked ? 'block' : 'none';
    }
}

// ==================== Initialize App ====================
// 同步设置面板切换按钮的文字与状态（isOpen = 面板展开）
function setSettingsToggleState(isOpen) {
    var btn = document.getElementById('settingsToggleBtn');
    if (!btn) return;
    var key = isOpen ? 'hideSettings' : 'showSettings';
    btn.setAttribute('data-i18n', key);
    btn.textContent = t(key);
    btn.classList.toggle('active', isOpen);
}

function setupMobileUI() {
    // 点击预览图全屏查看
    previewCanvas.addEventListener('click', function() {
        if (!currentFile) return;
        var lb = document.getElementById('previewLightbox');
        var img = document.getElementById('lightboxImg');
        img.src = previewCanvas.toDataURL();
        lb.classList.add('open');
    });
    document.getElementById('previewLightbox').addEventListener('click', function() {
        this.classList.remove('open');
    });

    // 移动端设置面板折叠/展开
    var settingsToggleBtn = document.getElementById('settingsToggleBtn');
    if (settingsToggleBtn) {
        settingsToggleBtn.addEventListener('click', function() {
            var panelLeft = document.querySelector('.panel-left');
            if (!panelLeft) return;
            var collapsed = panelLeft.classList.toggle('panel-collapsed');
            setSettingsToggleState(!collapsed);
        });
    }
}

function setupTechModal() {
    var openBtn = document.getElementById('techInfoBtn');
    var modal = document.getElementById('techModal');
    var closeBtn = document.getElementById('techModalClose');
    if (!openBtn || !modal) return;

    function openModal() {
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeModal() {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }

    openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('open')) {
            closeModal();
        }
    });
}

function setupUsageModal() {
    var openBtn = document.getElementById('usageGuideBtn');
    var modal = document.getElementById('usageGuideModal');
    var closeBtn = document.getElementById('usageGuideClose');
    if (!openBtn || !modal) return;

    function openModal() {
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeModal() {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }

    openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('open')) {
            closeModal();
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    setupDropZone();
    setupNavigation();
    setupSettings();
    setupEventListeners();
    setupConfigImportExport();
    setupModeSwitcher();
    setupMobileUI();
    setupTechModal();
    setupUsageModal();

    document.querySelectorAll('.lang-toggle').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var newLang = window.currentLang === 'zh' ? 'en' : 'zh';
            setLang(newLang);
        });
    });
    updateAllText();

    // 主题：同步 meta theme-color，绑定切换按钮，可选跟随系统
    (function() {
        var metaTheme = document.querySelector('meta[name="theme-color"]');
        function applyTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            if (metaTheme) metaTheme.setAttribute('content', theme === 'dark' ? '#0f766e' : '#0d9488');
        }
        function setTheme(theme, save) {
            applyTheme(theme);
            if (save !== false) {
                try { localStorage.setItem('theme', theme); } catch (e) {}
            }
        }
        var current = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(current);
        var toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function() {
                var next = current === 'dark' ? 'light' : 'dark';
                setTheme(next, true);
                current = next;
            });
        }
        try {
            if (!localStorage.getItem('theme')) {
                window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
                    var theme = e.matches ? 'dark' : 'light';
                    setTheme(theme, false);
                    current = theme;
                });
            }
        } catch (e) {}
    })();

    // 尝试恢复保存的模式
    try {
        var savedMode = localStorage.getItem('converterMode');
        if (savedMode) {
            setMode(savedMode);
        }
    } catch (e) {}

    init();
});

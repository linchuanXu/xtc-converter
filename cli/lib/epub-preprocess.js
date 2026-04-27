/**
 * EPUB 预处理：去字体、清理不兼容 CSS、注入兜底样式
 * 与 web/app.files.js 逻辑保持一致，供 CLI convert 使用；injectEpaperCss 供 CLI optimizer 复用
 * 详见 docs/crengine-limitations.md
 */

const JSZip = require('jszip');

/**
 * 从 ZIP 中移除内嵌字体并在 OPF 中删除对应 item，避免 CREngine 重排时尝试加载导致错误
 */
async function stripEpubFonts(epubZip) {
    const fontExt = /\.(ttf|otf|woff2?|eot)$/i;
    for (const filePath of Object.keys(epubZip.files)) {
        if (fontExt.test(filePath)) {
            delete epubZip.files[filePath];
        }
    }
    try {
        const containerFile = epubZip.files['META-INF/container.xml'];
        if (!containerFile) return;
        const containerXml = await containerFile.async('string');
        const opfMatch = containerXml.match(/full-path="([^"]+)"/);
        if (!opfMatch) return;
        const opfPath = opfMatch[1];
        const opfFile = epubZip.files[opfPath];
        if (!opfFile) return;
        let opfXml = await opfFile.async('string');
        opfXml = opfXml.replace(/<item\b[^>]*href="[^"]*\.(ttf|otf|woff2?|eot)"[^>]*\/>/gi, '');
        opfXml = opfXml.replace(/<item\b[^>]*media-type="(?:font\/|application\/(?:vnd\.ms-opentype|x-font|font))[^"]*"[^>]*\/>/gi, '');
        opfXml = opfXml.replace(/<item\b[\s\S]*?href="[^"]*\.(ttf|otf|woff2?|eot)"[\s\S]*?<\/item>/gi, '');
        opfXml = opfXml.replace(/<item\b[\s\S]*?media-type="(?:font\/|application\/(?:vnd\.ms-opentype|x-font|font))[^"]*"[\s\S]*?<\/item>/gi, '');
        epubZip.file(opfPath, opfXml);
    } catch (e) {
        // ignore
    }
}

/**
 * 移除 CREngine 不支持或易导致错版的 CSS 属性
 */
function cleanCss(css) {
    const problematic = [
        /@font-face\s*\{[^}]*\}/gi,
        /line-height\s*:\s*[^;}+]+;?/gi,
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
    for (const re of problematic) {
        css = css.replace(re, '');
    }
    return css;
}

/**
 * 清理 HTML 内联样式与 style 标签中的不兼容属性
 */
function cleanHtmlStyles(html) {
    html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (match, open, css, close) => {
        return open + css.replace(/@font-face\s*\{[^}]*\}/gi, '').replace(/line-height\s*:\s*[^;}+]+;?/gi, '') + close;
    });
    const stripInline = [
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
    return html.replace(/style="[^"]*"/gi, (match) => {
        let style = match;
        for (const re of stripInline) style = style.replace(re, '');
        return style;
    });
}

/**
 * 去掉段落开头的全角空格（U+3000）及紧邻空白，使首行缩进完全由用户设置控制、不与书内硬空格累加。
 * 常见于从 Word/Calibre 导出的 EPUB，段落用「　　　」做硬缩进；对所有 EPUB 均执行，避免累加。
 * @param {string} html - 章节 HTML
 * @returns {string}
 */
function stripLeadingEmSpaces(html) {
    return html.replace(/(<p\b[^>]*>)[\u3000\s]+/g, '$1');
}

/**
 * 注入兜底样式。用户控制的段落首行缩进与段落间距使用 !important，确保覆盖书内 class（如 .msonormal { margin:0 }）
 * @param {string} html - 章节 HTML
 * @param {number} indent - 首行缩进（em）
 * @param {number} spacing - 段落间距（px）
 */
function injectEpaperCss(html, indent = 0, spacing = 0) {
    let paraStyle = 'margin-top:0;margin-bottom:' + (spacing > 0 ? spacing + 'px' : '0') + ';';
    if (indent > 0) paraStyle += 'text-indent:' + indent + 'em;';
    const pRule = 'p { ' + paraStyle.replace(/;/g, ' !important;') + ' }';

    const epaperCss = '<style type="text/css">' +
        'html, body { margin: 0 !important; padding: 0 !important; height: 100% !important; }' +
        'body, body[class], .calibre1 { font-family: serif; text-align: justify; margin: 0 !important; padding: 0 !important; text-indent: 0; height: 100% !important; }' +
        'h1, h2, h3, h4, h5, h6 { text-indent: 0; margin: 1em 0 0.5em 0; font-weight: bold; hyphenate: none; }' +
        'title, .title { text-align: center; text-indent: 0; font-weight: bold; hyphenate: none; }' +
        'img, svg, image { display: block !important; margin-left: auto !important; margin-right: auto !important; max-width: 100% !important; height: auto !important; text-align: center !important; }' +
        'img[class*="frame"] { display: inline !important; vertical-align: middle !important; }' +
        '.fs { width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important; display: table !important; }' +
        '.fs .calibre2 { width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important; position: static !important; display: table-cell !important; vertical-align: middle !important; text-align: center !important; }' +
        '.singlepage, .twopage { display: inline-block !important; margin-left: auto !important; margin-right: auto !important; max-height: 100% !important; }' +
        'ul, ol { margin: 0.5em 0; padding-left: 2em; }' +
        'li { margin: 0.25em 0; }' +
        'table { border-collapse: collapse; font-size: 0.9em; }' +
        'td, th { padding: 4px; text-indent: 0; border: 1px solid #333; }' +
        'th { font-weight: bold; }' +
        'pre, code { font-family: monospace; white-space: pre; text-align: left; }' +
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

/**
 * 对 EPUB 缓冲区做完整预处理（去字体、清理 CSS/HTML、注入样式），返回新缓冲区
 * @param {Buffer|Uint8Array} buffer - 原始 EPUB
 * @param {number} indent - 首行缩进（em）
 * @param {number} spacing - 段落间距（px）
 * @returns {Promise<Buffer>}
 */
async function preprocessEpub(buffer, indent = 0, spacing = 0) {
    const epubZip = await JSZip.loadAsync(buffer);
    await stripEpubFonts(epubZip);

    const files = Object.keys(epubZip.files);
    for (const filePath of files) {
        const zipFile = epubZip.files[filePath];
        if (!zipFile || zipFile.dir) continue;

        if (/\.css$/i.test(filePath)) {
            const css = await zipFile.async('string');
            epubZip.file(filePath, cleanCss(css));
        } else if (/\.(html|xhtml|htm)$/i.test(filePath)) {
            let html = await zipFile.async('string');
            html = cleanHtmlStyles(html);
            html = stripLeadingEmSpaces(html);
            html = injectEpaperCss(html, indent, spacing);
            epubZip.file(filePath, html);
        }
    }

    return Buffer.from(await epubZip.generateAsync({ type: 'uint8array' }));
}

module.exports = {
    stripEpubFonts,
    cleanCss,
    cleanHtmlStyles,
    stripLeadingEmSpaces,
    injectEpaperCss,
    preprocessEpub
};

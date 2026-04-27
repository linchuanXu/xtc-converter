// ==================== EPUB Optimizer ====================
async function optimizeEpubs() {
    if (!currentFile) {
        alert(t('alertLoadFirst'));
        return;
    }

    progressContainer.style.display = 'flex';
    progressText.textContent = t('progressOptimizing').replace('{0}', '1').replace('{1}', '1').replace('{2}', currentFile.name);
    progressFill.style.width = '0%';

    try {
        var optimized = await optimizeEpub(currentFile.file);
        downloadFile(optimized, currentFile.name.replace('.epub', '_optimized.epub'));
        progressText.textContent = t('progressOptDone');
    } catch (err) {
        console.error('Failed to optimize:', currentFile.name, err);
        progressText.textContent = t('progressExportFailed').replace('{0}', err.message);
    }

    setTimeout(function() {
        progressContainer.style.display = 'none';
    }, 2000);
}

async function optimizeEpub(file) {
    var data = await file.arrayBuffer();
    var epubZip = await JSZip.loadAsync(data);

    var settings = {
        removeCss: document.getElementById('optRemoveCss').checked,
        stripFonts: document.getElementById('optStripFonts').checked,
        grayscale: document.getElementById('optGrayscale').checked,
        maxWidth: parseInt(document.getElementById('maxImageWidth').value),
        injectCss: document.getElementById('optInjectCss').checked
    };

    var files = Object.keys(epubZip.files);

    for (var i = 0; i < files.length; i++) {
        var path = files[i];
        var zipFile = epubZip.files[path];
        if (zipFile.dir) continue;

        if (settings.stripFonts && /\.(ttf|otf|woff|woff2)$/i.test(path)) {
            epubZip.remove(path);
            continue;
        }

        if (settings.removeCss && /\.css$/i.test(path)) {
            var css = await zipFile.async('string');
            var cleanedCss = cleanCss(css);
            epubZip.file(path, cleanedCss);
        }

        if (/\.(html|xhtml|htm)$/i.test(path)) {
            var html = await zipFile.async('string');

            if (settings.removeCss) {
                html = cleanHtmlStyles(html);
            }

            if (settings.injectCss) {
                html = injectEpaperCss(html);
            }

            epubZip.file(path, html);
        }

        if (settings.grayscale && /\.(jpg|jpeg|png|gif)$/i.test(path)) {
            var imgData = await zipFile.async('arraybuffer');
            var processedImg = await processImage(imgData, settings.maxWidth, settings.grayscale);
            if (processedImg) {
                epubZip.file(path, processedImg);
            }
        }
    }

    return await epubZip.generateAsync({ type: 'blob' });
}

function cleanCss(css) {
    var problematic = [
        /float\s*:\s*[^;]+;?/gi,
        /position\s*:\s*(fixed|absolute)[^;]*;?/gi,
        /display\s*:\s*(flex|grid)[^;]*;?/gi,
        /@media[^{]+\{[^}]*\}/gi,
        /transform[^;]*;?/gi,
        /animation[^;]*;?/gi
    ];

    for (var i = 0; i < problematic.length; i++) {
        css = css.replace(problematic[i], '');
    }

    return css;
}

function cleanHtmlStyles(html) {
    return html.replace(/style="[^"]*"/gi, function(match) {
        var style = match;
        style = style.replace(/float\s*:\s*[^;"]+;?/gi, '');
        style = style.replace(/position\s*:\s*(fixed|absolute)[^;"]*;?/gi, '');
        return style;
    });
}

function injectEpaperCss(html) {
    var epaperCss = '<style type="text/css">' +
        '/* E-paper optimized styles */' +
        'body { font-family: serif; line-height: 1.4; text-align: justify; margin: 0; padding: 0; }' +
        'p { margin: 0.5em 0; text-indent: 1.5em; }' +
        'h1, h2, h3, h4, h5, h6 { text-indent: 0; margin: 1em 0 0.5em 0; }' +
        'img { max-width: 100%; height: auto; }' +
        '</style>';

    if (html.indexOf('</head>') !== -1) {
        return html.replace('</head>', epaperCss + '</head>');
    }
    return html;
}

async function processImage(imgData, maxWidth, toGrayscale) {
    return new Promise(function(resolve) {
        var blob = new Blob([imgData]);
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');

            var width = img.width;
            var height = img.height;

            if (width > maxWidth) {
                height = Math.round(height * (maxWidth / width));
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            if (toGrayscale) {
                var imageData = ctx.getImageData(0, 0, width, height);
                var data = imageData.data;

                for (var i = 0; i < data.length; i += 4) {
                    var gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    data[i] = data[i + 1] = data[i + 2] = gray;
                }

                ctx.putImageData(imageData, 0, 0);
            }

            canvas.toBlob(function(blob) {
                blob.arrayBuffer().then(resolve);
            }, 'image/jpeg', 0.85);
        };

        img.onerror = function() { resolve(null); };
        img.src = URL.createObjectURL(blob);
    });
}
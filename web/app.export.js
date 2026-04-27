// ==================== Export Functions ====================
//
// Android WebView 内 <a download> + blob: 常无法出现系统“保存/下载”。
// 在地址栏加 `?android=1` 进入“安卓 in-app 模式”：若原生注入了 `xtcNativeFileDownload`
//（或兼容名见下方），则走分片 Base64 交给原生；否则仍回退为浏览器 blob 下载（与 iOS/桌面 一致）。
// iOS 不加参数时行为不变，仍为 blob 下载；WKWebView 若需走原生，可再单独加桥接，勿改默认 URL。
//
// 原生需注入（@JavascriptInterface 方法名与 JS 一致）:
//   startDownload(String fileName, String mimeType, long totalBytes) — 在拿到完整二进制后再调，先分配/创建目标
//   appendBase64(String base64Chunk) — 多段，顺序与源字节序一致
//   finishDownload() — 落盘/关闭并通知完成
// 可选： cancelDownload() — JS 在 append 过程中抛错时若存在则调用，用于丢弃半成品（避免损坏文件被当成成功）
// JS 上对应 window.xtcNativeFileDownload；亦可使用 window.XTCDownload 或 window.Android
// 仅当该对象上同时具备 start/append/finish 三方法时才会被选用（避免误用其它 Android 接口）。
// ---------
(function initXtcAndroidInAppFromUrl() {
    try {
        var p = new URLSearchParams(window.location.search);
        window.__XTC_ANDROID_INAPP__ = p.get('android') === '1' || p.get('inapp') === 'android' || p.get('app') === 'android';
    } catch (e) {
        window.__XTC_ANDROID_INAPP__ = false;
    }
})();

function uint8ToBase64Chunk(u8) {
    var PART = 0x8000;
    var s = '';
    for (var i = 0; i < u8.length; i += PART) {
        s += String.fromCharCode.apply(null, u8.subarray(i, i + PART));
    }
    return btoa(s);
}

function getXtcNativeDownloadBridge() {
    var candidates = [window.xtcNativeFileDownload, window.XTCDownload, window.Android];
    for (var i = 0; i < candidates.length; i++) {
        var o = candidates[i];
        if (o && typeof o.startDownload === 'function' && typeof o.appendBase64 === 'function' && typeof o.finishDownload === 'function') {
            return o;
        }
    }
    return null;
}

/** 串行执行原生下载，避免两次 export 的 append 交错。上一任务成功或失败都继续排下一单。 */
var __xtcNativeDlQueue = Promise.resolve();

function runXtcNativeDownloadQueued(taskFn) {
    __xtcNativeDlQueue = __xtcNativeDlQueue
        .catch(function() {
            /* 吞掉上一单 rejection，不阻断队列 */
        })
        .then(function() {
            return taskFn();
        });
    return __xtcNativeDlQueue;
}

function shouldUseXtcNativeDownload() {
    return window.__XTC_ANDROID_INAPP__ === true && getXtcNativeDownloadBridge() !== null;
}
// XTCZ-LZ4 (XTZ4) 格式，与设备端 xtcz_extract_lz4 对应：
//   Header (12B): "XTZ4" (4B) + totalSize(4B LE) + blockSize(4B LE)，推荐 blockSize=4096
//   Blocks: blockHeader(4B LE) + blockData
//     blockHeader bit31=0: LZ4 压缩，bits0-30=压缩数据长度
//     blockHeader bit31=1: 原样存储，bits0-30=数据长度
//     blockHeader=0: 结束
var XTZ4_BLOCK_SIZE = 4096;

function writeU32LE(val) {
    var b = new Uint8Array(4);
    b[0] = val & 0xff;
    b[1] = (val >>> 8) & 0xff;
    b[2] = (val >>> 16) & 0xff;
    b[3] = (val >>> 24) & 0xff;
    return b;
}

function compressXtczLz4(xtcData) {
    if (typeof LZ4 === 'undefined' || !LZ4.compressBlock || !LZ4.compressBound || !LZ4.makeBuffer) {
        throw new Error('LZ4 未加载，请刷新页面后重试');
    }
    var totalSize = xtcData.length;
    var blockSize = XTZ4_BLOCK_SIZE;
    var chunks = [];
    chunks.push(new Uint8Array([0x58, 0x54, 0x5a, 0x34])); // "XTZ4"
    chunks.push(writeU32LE(totalSize));
    chunks.push(writeU32LE(blockSize));
    var hashSize = 65536;
    var hashTable = new Array(hashSize);
    for (var i = 0; i < hashSize; i++) hashTable[i] = 0;
    var offset = 0;
    while (offset < totalSize) {
        var chunkLen = Math.min(blockSize, totalSize - offset);
        var maxOut = LZ4.compressBound(chunkLen);
        var outBuf = LZ4.makeBuffer(maxOut);
        for (var h = 0; h < hashSize; h++) hashTable[h] = 0;
        var compLen = LZ4.compressBlock(xtcData, outBuf, offset, chunkLen, hashTable);
        if (compLen > 0 && compLen < chunkLen) {
            chunks.push(writeU32LE(compLen));
            chunks.push(outBuf.subarray ? outBuf.subarray(0, compLen) : outBuf.slice(0, compLen));
        } else {
            chunks.push(writeU32LE(chunkLen | 0x80000000));
            chunks.push(xtcData.subarray ? xtcData.subarray(offset, offset + chunkLen) : xtcData.slice(offset, offset + chunkLen));
        }
        offset += chunkLen;
    }
    chunks.push(writeU32LE(0));
    var totalLen = 0;
    for (var c = 0; c < chunks.length; c++) totalLen += chunks[c].length;
    var out = new Uint8Array(totalLen);
    var pos = 0;
    for (var c = 0; c < chunks.length; c++) {
        out.set(chunks[c], pos);
        pos += chunks[c].length;
    }
    return out;
}

function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\.+$/, '');
}

function formatFileSize(data) {
    var bytes = (data instanceof Blob) ? data.size : (data && data.byteLength !== undefined ? data.byteLength : 0);
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return bytes + ' B';
}

/** 星曈云传输约 50–100 KB/s，取中间值 75 KB/s 估算传输时间 */
function formatCloudTransferTime(data) {
    var bytes = (data instanceof Blob) ? data.size : (data && data.byteLength !== undefined ? data.byteLength : 0);
    var speedBps = 75 * 1024;
    var seconds = bytes / speedBps;
    var fmt = function(key, val) {
        return (typeof t === 'function' ? t(key) : '').replace('{0}', val);
    };
    if (seconds >= 60) {
        var mins = (seconds / 60).toFixed(1);
        return fmt('exportCloudTransferMinutes', mins) || (mins + ' 分钟');
    }
    var secs = Math.max(1, Math.ceil(seconds));
    return fmt('exportCloudTransferSeconds', String(secs)) || (secs + ' 秒');
}

/** SD 卡插 U 盘传输约 25 MB/s，据此估算传输时间 */
function formatUsbTransferTime(data) {
    var bytes = (data instanceof Blob) ? data.size : (data && data.byteLength !== undefined ? data.byteLength : 0);
    var speedBps = 25 * 1024 * 1024;
    var seconds = bytes / speedBps;
    var fmt = function(key, val) {
        return (typeof t === 'function' ? t(key) : '').replace('{0}', val);
    };
    if (seconds >= 60) {
        var mins = (seconds / 60).toFixed(1);
        return fmt('exportCloudTransferMinutes', mins) || (mins + ' 分钟');
    }
    var secs = Math.max(1, Math.ceil(seconds));
    return fmt('exportCloudTransferSeconds', String(secs)) || (secs + ' 秒');
}

/** 超过此页数时拆分为多个文件导出，每个文件最多 CHUNK_PAGES 页 */
var SPLIT_THRESHOLD = 6666;
/** 拆分导出时每个文件的页数上限 */
var CHUNK_PAGES = 6666;

/** 为某一页范围 [startPage, endPage) 生成目录（页码为相对于该范围的 0-based，endPage 为 inclusive）。
 * 仅保留与该范围有交集的章节，并裁剪为区间内的起止页。*/
function buildTocForChunk(startPage, endPage) {
    var chunkSize = endPage - startPage;
    var result = [];
    for (var i = 0; i < currentToc.length; i++) {
        var ch = currentToc[i];
        var chStart = ch.page != null ? ch.page : (ch.startPage != null ? ch.startPage : 0);
        var chEnd = (i + 1 < currentToc.length)
            ? ((currentToc[i + 1].page != null ? currentToc[i + 1].page : currentToc[i + 1].startPage) - 1)
            : (totalPages - 1);
        if (chStart >= endPage || chEnd < startPage) continue;
        var newStart = Math.max(0, chStart - startPage);
        var newEnd = Math.min(chunkSize - 1, chEnd - startPage);
        if (newEnd < newStart) newEnd = newStart;
        result.push({
            title: ch.title || ch.name,
            name: ch.name || ch.title,
            page: newStart,
            endPage: newEnd
        });
    }
    return result;
}

function showExportConfirmModal(blobOrBuffer, filename, format) {
    var modal = document.getElementById('exportConfirmModal');
    var deviceEl = document.getElementById('exportConfirmDevice');
    var dimensionsEl = document.getElementById('exportConfirmDimensions');
    var sizeEl = document.getElementById('exportConfirmSize');
    var cloudEl = document.getElementById('exportConfirmCloud');
    var usbEl = document.getElementById('exportConfirmUsb');
    var recommendEl = document.getElementById('exportConfirmRecommend');
    var questionEl = document.getElementById('exportConfirmQuestion');
    var xtczTipEl = document.getElementById('exportConfirmXtczTip');
    if (!modal || !deviceEl || !dimensionsEl || !sizeEl || !cloudEl || !usbEl || !questionEl) return;
    var blob = blobOrBuffer instanceof Blob ? blobOrBuffer : new Blob([blobOrBuffer]);
    modal._exportBlob = blob;
    modal._exportFilename = filename;
    var msg = function(key) { return (typeof t === 'function' ? t(key) : key); };
    var deviceName = (typeof DEVICES !== 'undefined' && typeof devicePreset !== 'undefined' && DEVICES[devicePreset.value])
        ? (devicePreset.value === 'custom' ? (msg('custom') || 'Custom') : DEVICES[devicePreset.value].name)
        : (msg('custom') || 'Custom');
    var w = (typeof deviceWidth !== 'undefined' ? deviceWidth : 480);
    var h = (typeof deviceHeight !== 'undefined' ? deviceHeight : 800);
    deviceEl.textContent = (msg('exportConfirmDevice') || 'Device: {name}').replace('{name}', deviceName);
    dimensionsEl.textContent = (msg('exportConfirmDimensions') || 'Dimensions: {width} × {height}')
        .replace('{width}', String(w)).replace('{height}', String(h));
    var sizeStr = formatFileSize(blob);
    var timeStr = formatCloudTransferTime(blob);
    var timeUsbStr = formatUsbTransferTime(blob);
    sizeEl.textContent = (msg('exportConfirmSize') || '文件大小：{size}').replace('{size}', sizeStr);
    cloudEl.textContent = (msg('exportConfirmCloud') || '星曈云传输约需 {time}（约 50–100 KB/s）').replace('{time}', timeStr);
    usbEl.textContent = (msg('exportConfirmUsb') || 'SD 卡插 U 盘约需 {timeUsb}（约 25 MB/s）').replace('{timeUsb}', timeUsbStr);
    if (recommendEl) recommendEl.textContent = msg('exportConfirmRecommend') || '建议使用 SD 卡传输，速度更快。';
    if (format === 'xtc') {
        var uncompressedMsg = msg('exportConfirmQuestionUncompressed') || '文件大小高达 {size}，是否确认？建议使用压缩格式（XTCZ），最新硬件系统可以打开。';
        questionEl.textContent = uncompressedMsg.replace('{size}', sizeStr);
    } else {
        questionEl.textContent = msg('exportConfirmQuestion') || '是否确认导出？';
    }
    if (format === 'xtcz' && xtczTipEl) {
        var xtczTipText = msg('exportConfirmXtczTip') || '需硬件系统 5.1.6 及以上才能打开 XTCZ 文件。';
        xtczTipEl.innerHTML = xtczTipText.replace(/5\.1\.6/, '<strong style="font-weight:700;color:#d32f2f;">5.1.6</strong>');
        xtczTipEl.style.display = 'block';
    } else if (xtczTipEl) {
        xtczTipEl.style.display = 'none';
    }
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

async function exportXTC(opts) {
    opts = opts || {};
    if ((!renderer && !isPdfMode && !isPptxMode) || totalPages === 0) return;

    var isHQ = qualityMode.value === 'hq';
    var extension = isHQ ? 'xtch' : 'xtc';
    var format = exportFormat.value;
    var baseName = currentFile.name.replace(/\.(epub|pdf|mobi|azw|prc|pdb|txt|md|markdown|doc|docx|docm|pptx|ppt)$/i, '');
    baseName = sanitizeFilename(baseName) || 'book';
    var prefixEl = document.getElementById('exportFilenamePrefix');
    var prefix = (prefixEl && prefixEl.value && String(prefixEl.value).trim())
        ? String(prefixEl.value).trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        : '';
    var ext = format === 'xtcz' ? 'xtcz' : extension;

    progressContainer.style.display = 'flex';
    progressText.textContent = t('progressGenerating');
    progressFill.style.width = '0%';

    try {
        var split = totalPages > SPLIT_THRESHOLD;
        var numChunks = split ? Math.ceil(totalPages / CHUNK_PAGES) : 1;

        if (split) {
            // 多文件导出：按 CHUNK_PAGES 分片，每片生成一个文件并下载
            var splitIntro = (typeof t === 'function' ? t('exportSplitIntro') : 'Splitting into {0} file(s).').replace('{0}', String(numChunks));
            var partMsg = function(partNum, startP, endP) {
                return (typeof t === 'function' ? t('progressPart') : 'Part {0}/{1} (pages {2}–{3})')
                    .replace('{0}', String(partNum)).replace('{1}', String(numChunks))
                    .replace('{2}', String(startP)).replace('{3}', String(endP));
            };
            progressText.textContent = splitIntro + ' ' + partMsg(1, 1, Math.min(CHUNK_PAGES, totalPages));

            for (var partIndex = 0; partIndex < numChunks; partIndex++) {
                var startPage = partIndex * CHUNK_PAGES;
                var endPage = Math.min(startPage + CHUNK_PAGES, totalPages);
                var partNum = partIndex + 1;
                progressText.textContent = splitIntro + ' ' + partMsg(partNum, startPage + 1, endPage);

                var xtcData = await generateXTC(function(progress, page) {
                    progressFill.style.width = ((partIndex / numChunks) + (progress / 100) / numChunks) * 100 + '%';
                    progressText.textContent = splitIntro + ' ' + partMsg(partNum, startPage + 1, endPage)
                        + ' — ' + (typeof t === 'function' ? t('progressPage') : 'Page {0}/{1}').replace('{0}', String(page - startPage)).replace('{1}', String(endPage - startPage));
                }, { startPage: startPage, endPage: endPage });

                if (format === 'xtcz') {
                    xtcData = compressXtczLz4(xtcData);
                    xtcData = new Blob([xtcData], { type: 'application/octet-stream' });
                }
                var partFilename = prefix + 'P' + partNum + '-' + baseName + '.' + ext;
                downloadFile(xtcData, partFilename);

                if (partIndex < numChunks - 1) {
                    await new Promise(function(r) { setTimeout(r, 300); });
                }
            }
            progressFill.style.width = '100%';
            progressText.textContent = (typeof t === 'function' ? t('exportPartsDone') : 'Export complete. {0} file(s) downloaded.').replace('{0}', String(numChunks));
        } else {
            // 单文件导出（与原先逻辑一致）
            var xtcData = await generateXTC(function(progress, page) {
                progressFill.style.width = progress + '%';
                progressText.textContent = t('progressPage').replace('{0}', String(page)).replace('{1}', String(totalPages));
            });

            if (format === 'xtcz') {
                xtcData = compressXtczLz4(xtcData);
                xtcData = new Blob([xtcData], { type: 'application/octet-stream' });
            }

            progressFill.style.width = '100%';
            if (opts.directDownload) {
                progressText.textContent = t('progressExportDone');
                downloadFile(xtcData, prefix + baseName + '.' + ext);
                progressContainer.style.display = 'none';
                return;
            }
            progressText.textContent = typeof t === 'function' ? t('exportConfirmTitle') : '确认导出';
            progressContainer.style.display = 'none';
            showExportConfirmModal(xtcData, prefix + baseName + '.' + ext, format);
            return;
        }

        setTimeout(function() { progressContainer.style.display = 'none'; }, 2000);
    } catch (err) {
        console.error('Export failed:', err);
        var msg = err.message;
        if (err.name === 'RangeError' || msg.indexOf('Array buffer allocation') !== -1 || msg === 'EXPORT_BUFFER_TOO_LARGE') {
            msg = (typeof t === 'function' ? t('exportTooManyPages') : 'Too many pages').replace('{0}', String(totalPages));
        }
        progressText.textContent = t('progressExportFailed').replace('{0}', msg);
        setTimeout(function() {
            progressContainer.style.display = 'none';
        }, 2000);
    }
}

function timestampSeconds() {
    var d = new Date();
    var pad = function(n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() +
        pad(d.getMonth() + 1) + pad(d.getDate()) + '_' +
        pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

async function exportCurrentPage() {
    if (!renderer && !isPdfMode && !isPptxMode) return;

    var isHQ = qualityMode.value === 'hq';
    var pageData = await renderPageForExport(currentPage);

    var prefixEl = document.getElementById('exportFilenamePrefix');
    var prefix = (prefixEl && prefixEl.value && String(prefixEl.value).trim())
        ? String(prefixEl.value).trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        : '';
    var filename = prefix + 'page_' + (currentPage + 1) + '_' + timestampSeconds() + '.' + (isHQ ? 'xth' : 'xtg');
    downloadFile(pageData, filename);
}

async function generateXTC(progressCallback, opts) {
    opts = opts || {};
    var startPage = opts.startPage != null ? opts.startPage : 0;
    var endPage = opts.endPage != null ? opts.endPage : totalPages;
    var isHQ = qualityMode.value === 'hq';
    var pages = [];
    var YIELD_EVERY = 20;

    for (var i = startPage; i < endPage; i++) {
        var pageData = await renderPageForExport(i);
        pages.push(pageData);

        if (progressCallback) {
            progressCallback(((i - startPage + 1) / (endPage - startPage)) * 100, i + 1);
        }

        var done = i - startPage + 1;
        if (done % YIELD_EVERY === 0 || i === endPage - 1) {
            await new Promise(function(resolve) {
                setTimeout(resolve, 0);
            });
        }
    }

    var tocOverride = (startPage !== 0 || endPage !== totalPages) ? buildTocForChunk(startPage, endPage) : null;
    return buildXTCContainer(pages, isHQ, typeof deviceWidth !== 'undefined' ? deviceWidth : undefined, typeof deviceHeight !== 'undefined' ? deviceHeight : undefined, tocOverride);
}

async function renderPageForExport(pageNum) {
    var imageData;
    var lineBaselines = null;
    var lineBaselinesHeading = null;
    if (isPdfMode) {
        imageData = await renderPdfPageToImageData(pageNum, SCREEN_WIDTH, SCREEN_HEIGHT);
    } else if (isPptxMode) {
        imageData = await renderPptxPageToImageData(pageNum, SCREEN_WIDTH, SCREEN_HEIGHT);
    } else {
        renderer.goToPage(pageNum);
        renderer.renderCurrentPage();

        var frameBuffer = renderer.getFrameBuffer();
        if (!frameBuffer || frameBuffer.length === 0) {
            throw new Error('Empty frame buffer for page ' + pageNum);
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
        var lineBaselines = (typeof renderer.getLineBaselines === 'function') ? renderer.getLineBaselines() : null;
        var lineBaselinesHeading = (typeof renderer.getLineBaselinesHeading === 'function') ? renderer.getLineBaselinesHeading() : null;
    }
    // 下划线在合成背景之前绘制，避免背景图与下划线互相干扰；优先使用引擎返回的每行底部 Y
    if (typeof drawUnderlineLayer === 'function') {
        drawUnderlineLayer(imageData, lineBaselines, lineBaselinesHeading);
    }
    // Background image compositing (multiply blend before any processing)
    if (typeof compositeBackgroundImage === 'function' && bgImageData) {
        compositeBackgroundImage(imageData);
    }

    var imageMask = null;
    var imageMaskPixels = 0;
    var ditherModeVal = (typeof getDitherMode === 'function') ? getDitherMode() : 'none';
    var pageHasImages = (isPdfMode || isPptxMode) ? true : ((typeof pageHasImagesByHtml === 'function') ? pageHasImagesByHtml(pageNum) : false);

    // Brightness/contrast first (grayscale adjustment before 1/2-bit quantization)
    if (brightness && contrast) {
        var brightVal = parseInt(brightness.value) || 0;
        var contrastVal = parseInt(contrast.value) || 0;
        if (brightVal !== 0 || contrastVal !== 0) {
            applyBrightnessContrast(imageData, brightVal, contrastVal);
        }
    }

    var shouldDitherImagesOnly = ditherModeVal === 'imageOnly';
    if (shouldDitherImagesOnly) {
        var bits = qualityMode.value === 'hq' ? 2 : 1;
        var pageHasImages = (isPdfMode || isPptxMode) ? true : ((typeof pageHasImagesByHtml === 'function') ? pageHasImagesByHtml(pageNum) : false);
        var imageRegions = [];
        if (!isPdfMode && !isPptxMode && renderer && typeof renderer.getImageRegions === 'function') {
            try {
                imageRegions = renderer.getImageRegions() || [];
            } catch (regionErr) {
                imageRegions = [];
            }
        }
        if (imageRegions && imageRegions.length > 0 && typeof buildMaskFromImageRegions === 'function') {
            imageMask = buildMaskFromImageRegions(SCREEN_WIDTH, SCREEN_HEIGHT, imageRegions, {
                expandPx: 1,
                includeBackground: false,
                includeDecoration: false,
                minConfidence: 0.35
            });
            imageMaskPixels = countMaskPixels(imageMask);
            pageHasImages = imageMaskPixels > 0;
        } else if (pageHasImages && typeof buildImageRegionMask === 'function') {
            imageMask = buildImageRegionMask(imageData);
            imageMaskPixels = countMaskPixels(imageMask);
        }
        if (!pageHasImages) {
            if (qualityMode.value === 'hq') applyAntiAliasing(imageData);
        } else if (imageMask && imageMaskPixels > 0) {
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
            var imgBright = imageRegionBrightness ? (parseInt(imageRegionBrightness.value, 10) || 0) : 0;
            var imgContrast = imageRegionContrast ? (parseInt(imageRegionContrast.value, 10) || 0) : 0;
            if (imgBright !== 0 || imgContrast !== 0) {
                applyBrightnessContrast(imageData, imgBright, imgContrast);
            }
            var strength = parseInt(ditherStrength.value) / 100;
            imageData = await applyDithering(imageData, bits, strength);
        }
    } else if (ditherModeVal === 'full') {
        var bits = qualityMode.value === 'hq' ? 2 : 1;
        var strength = parseInt(ditherStrength.value, 10) / 100;
        if ((isPdfMode || isPptxMode) && (imageRegionBrightness || imageRegionContrast || imageRegionDitherStrength)) {
            var imgBright = imageRegionBrightness ? (parseInt(imageRegionBrightness.value, 10) || 0) : 0;
            var imgContrast = imageRegionContrast ? (parseInt(imageRegionContrast.value, 10) || 0) : 0;
            if ((imgBright !== 0 || imgContrast !== 0) && typeof applyBrightnessContrast === 'function') {
                applyBrightnessContrast(imageData, imgBright, imgContrast);
            }
            if (imageRegionDitherStrength && imageRegionDitherStrength.value != null) {
                strength = parseInt(imageRegionDitherStrength.value, 10) / 100;
            }
        }
        imageData = await applyDithering(imageData, bits, strength);
    } else if (qualityMode.value === 'hq') {
        applyAntiAliasing(imageData);
    }

    if (enableNegative.checked) {
        applyNegative(imageData);
    }

    var zoomPercent = (typeof getImageZoomPercent === 'function') ? getImageZoomPercent() : 100;
    if (zoomPercent !== 100 && typeof applyCenterZoom === 'function') {
        imageData = applyCenterZoom(imageData, zoomPercent);
    }

    if (enableProgressBar.checked) {
        drawProgressBar(imageData, pageNum);
    }

    if (typeof contentRotation !== 'undefined' && contentRotation !== 0 && typeof applyContentRotation === 'function') {
        imageData = applyContentRotation(imageData, contentRotation);
    }

    var isHQ = qualityMode.value === 'hq';
    return isHQ ? encodeXTH(imageData) : encodeXTG(imageData);
}

// ==================== Utility Functions ====================
var XTC_NATIVE_BINARY_CHUNK = 256 * 1024;
var XTC_NATIVE_DL_WARNED_NO_BRIDGE = false;

function tryNativeDownloadCancel(bridge) {
    if (bridge && typeof bridge.cancelDownload === 'function') {
        try {
            bridge.cancelDownload();
        } catch (cancelErr) {
            console.error('[XTC] cancelDownload', cancelErr);
        }
    }
}

function runNativeDownloadTransfer(bridge, u8, safeName, mime) {
    bridge.startDownload(safeName, mime, u8.length);
    for (var off = 0; off < u8.length; off += XTC_NATIVE_BINARY_CHUNK) {
        var slice = u8.subarray(off, off + XTC_NATIVE_BINARY_CHUNK);
        bridge.appendBase64(uint8ToBase64Chunk(slice));
    }
    bridge.finishDownload();
}

function downloadFileBlob(data, filename) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: 'application/octet-stream' });
    if (blob.type !== 'application/octet-stream') {
        blob = new Blob([blob], { type: 'application/octet-stream' });
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadFile(data, filename) {
    var blob0 = data instanceof Blob ? data : new Blob([data], { type: 'application/octet-stream' });
    if (blob0.type !== 'application/octet-stream') {
        blob0 = new Blob([blob0], { type: 'application/octet-stream' });
    }
    if (shouldUseXtcNativeDownload()) {
        var bridge = getXtcNativeDownloadBridge();
        if (!bridge) {
            downloadFileBlob(data, filename);
            return;
        }
        var safeName = typeof sanitizeFilename === 'function' ? sanitizeFilename(filename) : String(filename);
        var mime = blob0.type || 'application/octet-stream';
        // 先完整读取 Blob，成功后再调 startDownload，避免 arrayBuffer 失败时原生已 start 而状态不一致
        runXtcNativeDownloadQueued(function() {
            return blob0.arrayBuffer().then(function(ab) {
                var u8 = new Uint8Array(ab);
                try {
                    runNativeDownloadTransfer(bridge, u8, safeName, mime);
                } catch (innerErr) {
                    tryNativeDownloadCancel(bridge);
                    console.error('[XTC] native download transfer failed, fallback to blob', innerErr);
                    downloadFileBlob(data, filename);
                }
            }, function(err) {
                // 未调过 startDownload，无需 cancel
                console.error('[XTC] arrayBuffer failed, fallback to blob', err);
                downloadFileBlob(data, filename);
            });
        });
        return;
    }
    if (window.__XTC_ANDROID_INAPP__ && !getXtcNativeDownloadBridge() && !XTC_NATIVE_DL_WARNED_NO_BRIDGE) {
        XTC_NATIVE_DL_WARNED_NO_BRIDGE = true;
        console.warn('[XTC] android=1 但未注入 xtcNativeFileDownload，将使用 blob 回退（与 iOS/桌面相同）');
    }
    downloadFileBlob(data, filename);
}

(function initExportConfirmModal() {
    var modal = document.getElementById('exportConfirmModal');
    if (!modal) return;
    var closeBtn = document.getElementById('exportConfirmClose');
    var cancelBtn = document.getElementById('exportConfirmCancel');
    var okBtn = document.getElementById('exportConfirmOk');

    function closeExportConfirmModal() {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        modal._exportBlob = null;
        modal._exportFilename = null;
        if (typeof progressContainer !== 'undefined') progressContainer.style.display = 'none';
    }

    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeExportConfirmModal();
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('open')) closeExportConfirmModal();
    });
    if (closeBtn) closeBtn.addEventListener('click', closeExportConfirmModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeExportConfirmModal);
    if (okBtn) {
        okBtn.addEventListener('click', function() {
            if (!modal._exportBlob) return;
            downloadFile(modal._exportBlob, modal._exportFilename);
            closeExportConfirmModal();
            if (typeof progressText !== 'undefined') {
                progressText.textContent = (typeof t === 'function' ? t('progressExportDone') : '导出完成！');
                if (typeof progressContainer !== 'undefined') {
                    progressContainer.style.display = 'flex';
                    setTimeout(function() { progressContainer.style.display = 'none'; }, 2000);
                }
            }
        });
    }
})();
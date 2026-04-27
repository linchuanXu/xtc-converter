// ==================== Status Bar ====================
// Helper to get current chapter info
function getCurrentChapterInfo() {
    if (currentToc.length === 0) return { index: 0, startPage: 0, endPage: totalPages - 1, pagesInChapter: totalPages, pageInChapter: currentPage + 1 };

    var chapterIndex = 0;
    var chapterStartPage = 0;

    for (var i = currentToc.length - 1; i >= 0; i--) {
        var ch = currentToc[i];
        if (!ch) continue;
        var chPage = ch.page != null ? ch.page : (ch.startPage != null ? ch.startPage : 0);
        if (currentPage >= chPage) {
            chapterIndex = i;
            chapterStartPage = chPage;
            break;
        }
    }

    // Find end page (start of next chapter or total pages)
    var chapterEndPage = totalPages - 1;
    if (chapterIndex < currentToc.length - 1) {
        var nextCh = currentToc[chapterIndex + 1];
        if (nextCh) {
            var nextChPage = nextCh.page != null ? nextCh.page : (nextCh.startPage != null ? nextCh.startPage : totalPages);
            chapterEndPage = nextChPage - 1;
        }
    }

    var pagesInChapter = chapterEndPage - chapterStartPage + 1;
    var pageInChapter = currentPage - chapterStartPage + 1;

    return {
        index: chapterIndex,
        startPage: chapterStartPage,
        endPage: chapterEndPage,
        pagesInChapter: pagesInChapter,
        pageInChapter: pageInChapter
    };
}

// Get all chapter start positions as fractions of total pages (for Theme 1 progress line marks)
function getChapterPositions() {
    var positions = [];
    var total = totalPages > 0 ? totalPages : 1;
    function extract(items) {
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (!item) continue;
            var p = item.page != null ? item.page : (item.startPage != null ? item.startPage : 0);
            positions.push(p / total);
            if (item.children && item.children.length > 0) extract(item.children);
        }
    }
    if (currentToc && currentToc.length > 0) extract(currentToc);
    return positions;
}

// Theme 1: line-style progress (pure black/white, Canvas 2D stroke/fill). Draws on ctx.
function drawProgressIndicatorTheme1(ctx, width, height, pageNum, totalPages) {
    var PROGRESS_BAR_HEIGHT = 14;
    var PROGRESS_BAR_HEIGHT_FULLWIDTH = 20;
    var PROGRESS_BAR_HEIGHT_EXTENDED = 28;
    var lineThickness = 1;
    var progressThickness = 4;
    var chapterMarkHeight = 11;

    var edgeMargin = parseInt(statusEdgeMargin.value) || 0;
    var sideMargin = parseInt(statusSideMargin.value) || 0;
    var padding = 8 + sideMargin;
    var isTop = progressPosition.value === 'top';
    var isFullWidth = progressFullWidth.checked;
    var showProgressLine = showBookProgress.checked;
    var hasProgressLine = showProgressLine || showChapterProgress.checked;
    var hasBothLines = showProgressLine && showChapterProgress.checked;

    var barHeight = PROGRESS_BAR_HEIGHT;
    if (showChapterMarks.checked || (isFullWidth && hasBothLines)) barHeight = PROGRESS_BAR_HEIGHT_EXTENDED;
    else if (isFullWidth && hasProgressLine) barHeight = PROGRESS_BAR_HEIGHT_FULLWIDTH;

    var baseY = isTop ? edgeMargin : height - barHeight - edgeMargin;
    var centerY = baseY + barHeight / 2;

    var isNegative = enableNegative && enableNegative.checked;
    var bgColor = isNegative ? '#000000' : '#ffffff';
    var textColor = isNegative ? '#ffffff' : '#000000';
    var lineColor = isNegative ? '#ffffff' : '#000000';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, baseY, width, barHeight);

    var fontSize = parseInt(statusFontSize.value) || 10;
    ctx.font = fontSize + 'px sans-serif';
    ctx.textBaseline = 'middle';

    var chapterInfo = getChapterInfoForPage(pageNum);
    var leftText = '';
    if (showChapterXY.checked || showChapterPercent.checked) {
        var chapterPages = chapterInfo.endPage - chapterInfo.startPage + 1;
        var pageInChapter = pageNum - chapterInfo.startPage + 1;
        var parts = [];
        if (showChapterXY.checked) parts.push(pageInChapter + '/' + chapterPages);
        if (showChapterPercent.checked) parts.push(Math.round((pageInChapter / chapterPages) * 100) + '%');
        leftText = parts.join('  ');
    }
    var rightParts = [];
    if (showPageXY.checked) rightParts.push((pageNum + 1) + '/' + totalPages);
    if (showBookPercent.checked) rightParts.push(Math.round(((pageNum + 1) / totalPages) * 100) + '%');
    var rightText = rightParts.join('  ');

    var leftTextWidth = leftText ? ctx.measureText(leftText).width : 0;
    var rightTextWidth = rightText ? ctx.measureText(rightText).width : 0;

    var barStartX, barEndX, barWidth, lineY;
    if (isFullWidth && hasProgressLine) {
        lineY = baseY + 4;
        var textY = baseY + barHeight - fontSize / 2 - 1;
        barStartX = padding;
        barEndX = width - padding;
        barWidth = barEndX - barStartX;
        if (leftText) { ctx.fillStyle = textColor; ctx.textAlign = 'left'; ctx.fillText(leftText, padding, textY); }
        if (rightText) { ctx.fillStyle = textColor; ctx.textAlign = 'right'; ctx.fillText(rightText, width - padding, textY); }
    } else {
        lineY = centerY;
        barStartX = padding + (leftText ? leftTextWidth + 12 : 0);
        barEndX = width - padding - (rightText ? rightTextWidth + 12 : 0);
        barWidth = barEndX - barStartX;
        if (leftText) { ctx.fillStyle = textColor; ctx.textAlign = 'left'; ctx.fillText(leftText, padding, centerY); }
        if (rightText) { ctx.fillStyle = textColor; ctx.textAlign = 'right'; ctx.fillText(rightText, width - padding, centerY); }
    }

    if (showProgressLine && barWidth > 0) {
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineThickness;
        ctx.beginPath();
        ctx.moveTo(barStartX, lineY);
        ctx.lineTo(barEndX, lineY);
        ctx.stroke();

        var progress = (pageNum + 1) / totalPages;
        var progressX = barStartX + barWidth * progress;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = progressThickness;
        ctx.beginPath();
        ctx.moveTo(barStartX, lineY);
        ctx.lineTo(progressX, lineY);
        ctx.stroke();

        if (showChapterMarks.checked) {
            var positions = getChapterPositions();
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 1;
            for (var i = 0; i < positions.length; i++) {
                var markX = barStartX + positions[i] * barWidth;
                if (markX >= barStartX && markX <= barEndX) {
                    ctx.beginPath();
                    ctx.moveTo(markX, lineY - chapterMarkHeight / 2);
                    ctx.lineTo(markX, lineY + chapterMarkHeight / 2);
                    ctx.stroke();
                }
            }
        }
    }

    if (showChapterProgress.checked && barWidth > 0) {
        var chInfo = getChapterInfoForPage(pageNum);
        var chPages = chInfo.endPage - chInfo.startPage + 1;
        var pageInCh = pageNum - chInfo.startPage + 1;
        var chapterProgress = pageInCh / chPages;
        if (!showProgressLine) {
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = lineThickness;
            ctx.beginPath();
            ctx.moveTo(barStartX, lineY);
            ctx.lineTo(barEndX, lineY);
            ctx.stroke();
        }
        var chapterY = showProgressLine ? lineY + 9 : lineY;
        var chapterProgressX = barStartX + barWidth * chapterProgress;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = showProgressLine ? 2 : progressThickness;
        ctx.beginPath();
        ctx.moveTo(barStartX, chapterY);
        ctx.lineTo(chapterProgressX, chapterY);
        ctx.stroke();
    }
}

function drawStatusBar(imageData) {
    if (!enableProgressBar.checked) return;

    var progressBarThemeEl = document.getElementById('progressBarTheme');
    var theme = (progressBarThemeEl && progressBarThemeEl.value) === '1' ? '1' : '2';

    if (theme === '1') {
        var w = imageData.width;
        var h = imageData.height;
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
        drawProgressIndicatorTheme1(ctx, w, h, currentPage, totalPages);
        var out = ctx.getImageData(0, 0, w, h);
        imageData.data.set(out.data);
        return;
    }

    var data = imageData.data;
    var width = imageData.width;
    var height = imageData.height;
    var position = progressPosition.value;
    var edgeMargin = parseInt(statusEdgeMargin.value) || 0;
    var sideMargin = parseInt(statusSideMargin.value) || 0;
    var fontSize = parseInt(statusFontSize.value) || 14;
    var fullWidth = progressFullWidth.checked;

    // Get status bar color (grayscale for e-ink)
    var colorSetting = statusBarColor ? statusBarColor.value : 'black';
    var barColors = {
        'black': { fill: 0, bg: 200, text: 0 },
        'dark': { fill: 40, bg: 220, text: 60 },
        'mid': { fill: 100, bg: 230, text: 120 },
        'light': { fill: 160, bg: 240, text: 180 }
    };
    var colors = barColors[colorSetting] || barColors.black;

    // Calculate status bar area
    var barHeight = 6;
    var textHeight = fontSize + 4;
    var totalHeight = barHeight + textHeight + 4;
    var startY = position === 'top' ? edgeMargin : height - totalHeight - edgeMargin;
    var barY = position === 'top' ? startY + textHeight + 2 : startY;
    var textY = position === 'top' ? startY : startY + barHeight + 2;

    var barStartX = fullWidth ? 0 : sideMargin;
    var barEndX = fullWidth ? width : width - sideMargin;
    var barWidth = barEndX - barStartX;

    // Clear the status bar area (white background)
    for (var y = startY; y < startY + totalHeight && y < height; y++) {
        for (var x = 0; x < width; x++) {
            if (y >= 0) {
                var idx = (y * width + x) * 4;
                data[idx] = 255;
                data[idx + 1] = 255;
                data[idx + 2] = 255;
                data[idx + 3] = 255;
            }
        }
    }

    var chapterInfo = getCurrentChapterInfo();

    // Draw book progress bar
    if (showBookProgress.checked && barWidth > 0) {
        // Background
        for (var y = barY; y < barY + barHeight && y < height; y++) {
            for (var x = barStartX; x < barEndX; x++) {
                if (y >= 0) {
                    var idx = (y * width + x) * 4;
                    data[idx] = colors.bg;
                    data[idx + 1] = colors.bg;
                    data[idx + 2] = colors.bg;
                    data[idx + 3] = 255;
                }
            }
        }

        // Progress fill
        var bookProgress = totalPages > 0 ? (currentPage + 1) / totalPages : 0;
        var progressWidth = Math.floor(barWidth * bookProgress);

        for (var y = barY; y < barY + barHeight && y < height; y++) {
            for (var x = barStartX; x < barStartX + progressWidth && x < barEndX; x++) {
                if (y >= 0) {
                    var idx = (y * width + x) * 4;
                    data[idx] = colors.fill;
                    data[idx + 1] = colors.fill;
                    data[idx + 2] = colors.fill;
                    data[idx + 3] = 255;
                }
            }
        }

        // Chapter marks
        if (showChapterMarks.checked && currentToc.length > 0) {
            for (var i = 0; i < currentToc.length; i++) {
                var ch = currentToc[i];
                if (!ch) continue;
                var chapterPage = ch.page != null ? ch.page : (ch.startPage != null ? ch.startPage : 0);
                var markX = barStartX + Math.floor((chapterPage / totalPages) * barWidth);
                for (var y = barY - 2; y < barY + barHeight + 2; y++) {
                    if (y >= 0 && y < height && markX >= barStartX && markX < barEndX) {
                        var idx = (y * width + markX) * 4;
                        data[idx] = 255;
                        data[idx + 1] = 255;
                        data[idx + 2] = 255;
                        data[idx + 3] = 255;
                    }
                }
            }
        }
    }

    // Draw chapter progress bar (below book progress)
    if (showChapterProgress.checked && barWidth > 0) {
        var chapterBarY = barY + barHeight + 2;

        // Background - use mid-tone between bg and fill
        var chapterBg = Math.round((colors.bg + colors.fill) / 2);
        for (var y = chapterBarY; y < chapterBarY + barHeight && y < height; y++) {
            for (var x = barStartX; x < barEndX; x++) {
                if (y >= 0) {
                    var idx = (y * width + x) * 4;
                    data[idx] = chapterBg;
                    data[idx + 1] = chapterBg;
                    data[idx + 2] = chapterBg;
                    data[idx + 3] = 255;
                }
            }
        }

        // Chapter progress fill - use text color for contrast
        var chapterProgress = chapterInfo.pagesInChapter > 0 ? chapterInfo.pageInChapter / chapterInfo.pagesInChapter : 0;
        var chapterProgressWidth = Math.floor(barWidth * chapterProgress);

        for (var y = chapterBarY; y < chapterBarY + barHeight && y < height; y++) {
            for (var x = barStartX; x < barStartX + chapterProgressWidth && x < barEndX; x++) {
                if (y >= 0) {
                    var idx = (y * width + x) * 4;
                    data[idx] = colors.text;
                    data[idx + 1] = colors.text;
                    data[idx + 2] = colors.text;
                    data[idx + 3] = 255;
                }
            }
        }
    }

    // Build text strings
    var leftText = '';
    var rightText = '';

    if (showPageXY.checked) {
        leftText += (currentPage + 1) + '/' + totalPages;
    }

    if (showBookPercent.checked) {
        var bookPct = totalPages > 0 ? Math.round(((currentPage + 1) / totalPages) * 100) : 0;
        if (leftText) leftText += '  ';
        leftText += bookPct + '%';
    }

    if (showChapterXY.checked) {
        rightText += chapterInfo.pageInChapter + '/' + chapterInfo.pagesInChapter;
    }

    if (showChapterPercent.checked) {
        var chapterPct = chapterInfo.pagesInChapter > 0 ? Math.round((chapterInfo.pageInChapter / chapterInfo.pagesInChapter) * 100) : 0;
        if (rightText) rightText += '  ';
        rightText += chapterPct + '%';
    }

    // Draw text using offscreen canvas
    if (leftText || rightText) {
        var textCanvas = document.createElement('canvas');
        textCanvas.width = width;
        textCanvas.height = textHeight;
        var textCtx = textCanvas.getContext('2d');

        textCtx.fillStyle = '#fff';
        textCtx.fillRect(0, 0, width, textHeight);

        textCtx.font = fontSize + 'px sans-serif';
        textCtx.fillStyle = colors.text === 0 ? '#000' : (colors.text === 255 ? '#fff' : 'rgb(' + colors.text + ',' + colors.text + ',' + colors.text + ')');
        textCtx.textBaseline = 'middle';

        if (leftText) {
            textCtx.textAlign = 'left';
            textCtx.fillText(leftText, sideMargin + 4, textHeight / 2);
        }

        if (rightText) {
            textCtx.textAlign = 'right';
            textCtx.fillText(rightText, width - sideMargin - 4, textHeight / 2);
        }

        // Copy text to imageData
        var textImageData = textCtx.getImageData(0, 0, width, textHeight);
        var textData = textImageData.data;

        for (var ty = 0; ty < textHeight; ty++) {
            var destY = textY + ty;
            if (destY >= 0 && destY < height) {
                for (var tx = 0; tx < width; tx++) {
                    var srcIdx = (ty * width + tx) * 4;
                    var destIdx = (destY * width + tx) * 4;
                    data[destIdx] = textData[srcIdx];
                    data[destIdx + 1] = textData[srcIdx + 1];
                    data[destIdx + 2] = textData[srcIdx + 2];
                    data[destIdx + 3] = textData[srcIdx + 3];
                }
            }
        }
    }
}

// Helper to get chapter info for a specific page (for export)
function getChapterInfoForPage(pageNum) {
    if (currentToc.length === 0) return { index: 0, startPage: 0, endPage: totalPages - 1, pagesInChapter: totalPages, pageInChapter: pageNum + 1 };

    var chapterIndex = 0;
    var chapterStartPage = 0;

    for (var i = currentToc.length - 1; i >= 0; i--) {
        var ch = currentToc[i];
        if (!ch) continue;
        var chPage = ch.page != null ? ch.page : (ch.startPage != null ? ch.startPage : 0);
        if (pageNum >= chPage) {
            chapterIndex = i;
            chapterStartPage = chPage;
            break;
        }
    }

    var chapterEndPage = totalPages - 1;
    if (chapterIndex < currentToc.length - 1) {
        var nextCh = currentToc[chapterIndex + 1];
        if (nextCh) {
            var nextChPage = nextCh.page != null ? nextCh.page : (nextCh.startPage != null ? nextCh.startPage : totalPages);
            chapterEndPage = nextChPage - 1;
        }
    }

    var pagesInChapter = chapterEndPage - chapterStartPage + 1;
    var pageInChapter = pageNum - chapterStartPage + 1;

    return {
        index: chapterIndex,
        startPage: chapterStartPage,
        endPage: chapterEndPage,
        pagesInChapter: pagesInChapter,
        pageInChapter: pageInChapter
    };
}

function drawProgressBar(imageData, pageNum) {
    var progressBarThemeEl = document.getElementById('progressBarTheme');
    var theme = (progressBarThemeEl && progressBarThemeEl.value) === '1' ? '1' : '2';

    if (theme === '1') {
        var w = imageData.width;
        var h = imageData.height;
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
        drawProgressIndicatorTheme1(ctx, w, h, pageNum, totalPages);
        var out = ctx.getImageData(0, 0, w, h);
        imageData.data.set(out.data);
        return;
    }

    var data = imageData.data;
    var width = imageData.width;
    var height = imageData.height;
    var position = progressPosition.value;
    var edgeMargin = parseInt(statusEdgeMargin.value) || 0;
    var sideMargin = parseInt(statusSideMargin.value) || 0;
    var fontSize = parseInt(statusFontSize.value) || 14;
    var fullWidth = progressFullWidth.checked;

    // Get status bar color (grayscale for e-ink)
    var colorSetting = statusBarColor ? statusBarColor.value : 'black';
    var barColors = {
        'black': { fill: 0, bg: 200, text: 0 },
        'dark': { fill: 40, bg: 220, text: 60 },
        'mid': { fill: 100, bg: 230, text: 120 },
        'light': { fill: 160, bg: 240, text: 180 }
    };
    var colors = barColors[colorSetting] || barColors.black;

    var barHeight = 6;
    var textHeight = fontSize + 4;
    var totalHeight = barHeight + textHeight + 4;
    var startY = position === 'top' ? edgeMargin : height - totalHeight - edgeMargin;
    var barY = position === 'top' ? startY + textHeight + 2 : startY;
    var textY = position === 'top' ? startY : startY + barHeight + 2;

    var barStartX = fullWidth ? 0 : sideMargin;
    var barEndX = fullWidth ? width : width - sideMargin;
    var barWidth = barEndX - barStartX;

    // Clear the status bar area (white background)
    for (var y = startY; y < startY + totalHeight && y < height; y++) {
        for (var x = 0; x < width; x++) {
            if (y >= 0) {
                var idx = (y * width + x) * 4;
                data[idx] = 255;
                data[idx + 1] = 255;
                data[idx + 2] = 255;
                data[idx + 3] = 255;
            }
        }
    }

    var chapterInfo = getChapterInfoForPage(pageNum);

    // Draw book progress bar
    if (showBookProgress.checked && barWidth > 0) {
        for (var y = barY; y < barY + barHeight && y < height; y++) {
            for (var x = barStartX; x < barEndX; x++) {
                if (y >= 0) {
                    var idx = (y * width + x) * 4;
                    data[idx] = colors.bg;
                    data[idx + 1] = colors.bg;
                    data[idx + 2] = colors.bg;
                    data[idx + 3] = 255;
                }
            }
        }

        var bookProgress = totalPages > 0 ? (pageNum + 1) / totalPages : 0;
        var progressWidth = Math.floor(barWidth * bookProgress);

        for (var y = barY; y < barY + barHeight && y < height; y++) {
            for (var x = barStartX; x < barStartX + progressWidth && x < barEndX; x++) {
                if (y >= 0) {
                    var idx = (y * width + x) * 4;
                    data[idx] = data[idx + 1] = data[idx + 2] = colors.fill;
                    data[idx + 3] = 255;
                }
            }
        }

        if (showChapterMarks.checked && currentToc.length > 0) {
            for (var i = 0; i < currentToc.length; i++) {
                var ch = currentToc[i];
                if (!ch) continue;
                var chapterPage = ch.page != null ? ch.page : (ch.startPage != null ? ch.startPage : 0);
                var markX = barStartX + Math.floor((chapterPage / totalPages) * barWidth);
                for (var y = barY - 2; y < barY + barHeight + 2; y++) {
                    if (y >= 0 && y < height && markX >= barStartX && markX < barEndX) {
                        var idx = (y * width + markX) * 4;
                        data[idx] = 255;
                        data[idx + 1] = 255;
                        data[idx + 2] = 255;
                        data[idx + 3] = 255;
                    }
                }
            }
        }
    }

    // Draw chapter progress bar
    if (showChapterProgress.checked && barWidth > 0) {
        var chapterBarY = barY + barHeight + 2;
        var chapterBg = Math.round((colors.bg + colors.fill) / 2);

        for (var y = chapterBarY; y < chapterBarY + barHeight && y < height; y++) {
            for (var x = barStartX; x < barEndX; x++) {
                if (y >= 0) {
                    var idx = (y * width + x) * 4;
                    data[idx] = chapterBg;
                    data[idx + 1] = chapterBg;
                    data[idx + 2] = chapterBg;
                    data[idx + 3] = 255;
                }
            }
        }

        var chapterProgress = chapterInfo.pagesInChapter > 0 ? chapterInfo.pageInChapter / chapterInfo.pagesInChapter : 0;
        var chapterProgressWidth = Math.floor(barWidth * chapterProgress);

        for (var y = chapterBarY; y < chapterBarY + barHeight && y < height; y++) {
            for (var x = barStartX; x < barStartX + chapterProgressWidth && x < barEndX; x++) {
                if (y >= 0) {
                    var idx = (y * width + x) * 4;
                    data[idx] = colors.text;
                    data[idx + 1] = colors.text;
                    data[idx + 2] = colors.text;
                    data[idx + 3] = 255;
                }
            }
        }
    }

    // Build text strings
    var leftText = '';
    var rightText = '';

    if (showPageXY.checked) {
        leftText += (pageNum + 1) + '/' + totalPages;
    }

    if (showBookPercent.checked) {
        var bookPct = totalPages > 0 ? Math.round(((pageNum + 1) / totalPages) * 100) : 0;
        if (leftText) leftText += '  ';
        leftText += bookPct + '%';
    }

    if (showChapterXY.checked) {
        rightText += chapterInfo.pageInChapter + '/' + chapterInfo.pagesInChapter;
    }

    if (showChapterPercent.checked) {
        var chapterPct = chapterInfo.pagesInChapter > 0 ? Math.round((chapterInfo.pageInChapter / chapterInfo.pagesInChapter) * 100) : 0;
        if (rightText) rightText += '  ';
        rightText += chapterPct + '%';
    }

    // Draw text using offscreen canvas
    if (leftText || rightText) {
        var textCanvas = document.createElement('canvas');
        textCanvas.width = width;
        textCanvas.height = textHeight;
        var textCtx = textCanvas.getContext('2d');

        textCtx.fillStyle = '#fff';
        textCtx.fillRect(0, 0, width, textHeight);

        textCtx.font = fontSize + 'px sans-serif';
        textCtx.fillStyle = colors.text === 0 ? '#000' : (colors.text === 255 ? '#fff' : 'rgb(' + colors.text + ',' + colors.text + ',' + colors.text + ')');
        textCtx.textBaseline = 'middle';

        if (leftText) {
            textCtx.textAlign = 'left';
            textCtx.fillText(leftText, sideMargin + 4, textHeight / 2);
        }

        if (rightText) {
            textCtx.textAlign = 'right';
            textCtx.fillText(rightText, width - sideMargin - 4, textHeight / 2);
        }

        var textImageData = textCtx.getImageData(0, 0, width, textHeight);
        var textData = textImageData.data;

        for (var ty = 0; ty < textHeight; ty++) {
            var destY = textY + ty;
            if (destY >= 0 && destY < height) {
                for (var tx = 0; tx < width; tx++) {
                    var srcIdx = (ty * width + tx) * 4;
                    var destIdx = (destY * width + tx) * 4;
                    data[destIdx] = textData[srcIdx];
                    data[destIdx + 1] = textData[srcIdx + 1];
                    data[destIdx + 2] = textData[srcIdx + 2];
                    data[destIdx + 3] = textData[srcIdx + 3];
                }
            }
        }
    }
}

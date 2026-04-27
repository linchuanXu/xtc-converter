function initDitherWorker() {
    return new Promise(function(resolve) {
        try {
            ditherWorker = new Worker('dither-worker.js');
            ditherWorker.onmessage = function(e) {
                var data = e.data;
                if (data && data.type === 'ready') {
                    console.log('Dither worker initialized');
                    resolve(true);
                    return;
                }
                var pending = ditherCallbacks.get(data.id);
                if (pending) {
                    ditherCallbacks.delete(data.id);
                    clearTimeout(pending.timeoutId);
                    if (data && data.imageData) {
                        pending.resolve(new ImageData(
                            new Uint8ClampedArray(data.imageData),
                            pending.width,
                            pending.height
                        ));
                    } else {
                        pending.reject(new Error('Invalid dither worker response'));
                    }
                }
            };
            ditherWorker.onerror = function(err) {
                console.warn('Dither worker crashed, switching to sync fallback:', err);
                ditherCallbacks.forEach(function(pending) {
                    clearTimeout(pending.timeoutId);
                    pending.reject(new Error('Dither worker crashed'));
                });
                ditherCallbacks.clear();
                ditherWorker = null;
                resolve(false);
            };
        } catch (err) {
            console.warn('Dither worker not available, using sync fallback');
            resolve(false);
        }
    });
}

// ==================== Image region mask (dither images only, text no dither) ====================
var BLOCK_SIZE = 12;
var MID_TONE_MIN = 15;
var MID_TONE_MAX = 240;
var IMAGE_BLOCK_MID_TONE_RATIO = 0.03;   // block with this ratio of mid-tones → treat as image (lower = more sensitive)
var IMAGE_BLOCK_DISTINCT_GRAY_MIN = 7;    // or block with this many distinct gray levels → image (photos have many levels)

function cloneImageData(imageData) {
    return new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
    );
}

/**
 * Build mask from two rendered pages:
 * - normalBuffer: page with images
 * - noImageBuffer: same page with images hidden from EPUB DOM/CSS
 * Any pixel with significant gray difference is treated as image region.
 */
function buildImageMaskFromFrameDiff(normalBuffer, noImageBuffer, width, height, diffThreshold) {
    var threshold = diffThreshold != null ? diffThreshold : 12;
    var blockSize = 10;
    var minBlockRatio = 0.04;
    var minChangedPixels = 4;
    var mask = new Uint8Array(width * height);
    if (!normalBuffer || !noImageBuffer) return mask;
    var len = Math.min(normalBuffer.length, noImageBuffer.length);
    var diffMask = new Uint8Array(width * height);

    for (var i = 0; i + 3 < len; i += 4) {
        var g1 = Math.round(0.299 * normalBuffer[i] + 0.587 * normalBuffer[i + 1] + 0.114 * normalBuffer[i + 2]);
        var g2 = Math.round(0.299 * noImageBuffer[i] + 0.587 * noImageBuffer[i + 1] + 0.114 * noImageBuffer[i + 2]);
        var idx = i >> 2;
        if (Math.abs(g1 - g2) >= threshold) {
            diffMask[idx] = 255;
        }
    }

    // Block filtering: keep only dense difference regions; removes scattered text speckles.
    for (var by = 0; by < height; by += blockSize) {
        for (var bx = 0; bx < width; bx += blockSize) {
            var changed = 0;
            var total = 0;
            for (var dy = 0; dy < blockSize && by + dy < height; dy++) {
                for (var dx = 0; dx < blockSize && bx + dx < width; dx++) {
                    var p = (by + dy) * width + (bx + dx);
                    if (diffMask[p] > 128) changed++;
                    total++;
                }
            }
            var keep = total > 0 && (changed >= minChangedPixels || (changed / total) >= minBlockRatio);
            if (!keep) continue;
            for (var dy = 0; dy < blockSize && by + dy < height; dy++) {
                for (var dx = 0; dx < blockSize && bx + dx < width; dx++) {
                    var p = (by + dy) * width + (bx + dx);
                    // Fill whole kept block so flat-color image areas are also included.
                    mask[p] = 255;
                }
            }
        }
    }
    return mask;
}

function countMaskPixels(mask) {
    if (!mask) return 0;
    var count = 0;
    for (var i = 0; i < mask.length; i++) {
        if (mask[i] > 128) count++;
    }
    return count;
}

function filterRegionsByType(regions, opts) {
    var out = [];
    if (!regions || !regions.length) return out;
    opts = opts || {};
    var includeBackground = !!opts.includeBackground;
    var includeDecoration = !!opts.includeDecoration;
    var minConfidence = opts.minConfidence != null ? Number(opts.minConfidence) : 0.35;

    for (var i = 0; i < regions.length; i++) {
        var r = regions[i];
        if (!r) continue;
        var t = (r.type || 'illustration').toString().toLowerCase();
        var c = r.confidence != null ? Number(r.confidence) : 1;
        if (isNaN(c)) c = 1;
        if (c < minConfidence) continue;
        if (t === 'background' && !includeBackground) continue;
        if (t === 'decoration' && !includeDecoration) continue;
        out.push(r);
    }
    return out;
}

function buildMaskFromImageRegions(width, height, regions, expandPxOrOptions) {
    var mask = new Uint8Array(width * height);
    if (!regions || !regions.length) return mask;
    var options = {};
    if (typeof expandPxOrOptions === 'number' || expandPxOrOptions == null) {
        options.expandPx = expandPxOrOptions;
    } else {
        options = expandPxOrOptions || {};
    }
    var filteredRegions = filterRegionsByType(regions, options);
    if (!filteredRegions.length) return mask;
    var basePad = options.expandPx != null ? options.expandPx : 1;
    var illustrationPad = options.illustrationPad != null ? options.illustrationPad : basePad;
    var decorationPad = options.decorationPad != null ? options.decorationPad : 0;

    for (var i = 0; i < filteredRegions.length; i++) {
        var r = filteredRegions[i];
        if (!r) continue;
        var t = (r.type || 'illustration').toString().toLowerCase();
        var pad = t === 'decoration' ? decorationPad : illustrationPad;
        var x = Math.max(0, (r.x | 0) - pad);
        var y = Math.max(0, (r.y | 0) - pad);
        var w = Math.max(0, (r.width | 0) + pad * 2);
        var h = Math.max(0, (r.height | 0) + pad * 2);
        var x1 = Math.min(width, x + w);
        var y1 = Math.min(height, y + h);
        if (x1 <= x || y1 <= y) continue;

        for (var yy = y; yy < y1; yy++) {
            var row = yy * width;
            for (var xx = x; xx < x1; xx++) {
                mask[row + xx] = 255;
            }
        }
    }
    return mask;
}

function drawImageMaskOverlay(imageData, mask) {
    if (!imageData || !mask) return imageData;
    var data = imageData.data;
    var total = Math.min(mask.length, imageData.width * imageData.height);
    for (var i = 0; i < total; i++) {
        if (mask[i] <= 128) continue;
        var idx = i * 4;
        // Use mid-gray overlay so it remains visible after final quantization.
        data[idx] = 170;
        data[idx + 1] = 170;
        data[idx + 2] = 170;
    }
    return imageData;
}

/**
 * Build per-pixel mask: 0 = text (no dither), 255 = image (dither).
 * Block = image if: (mid-tone ratio >= threshold) OR (distinct gray count >= IMAGE_BLOCK_DISTINCT_GRAY_MIN).
 */
function buildImageRegionMask(imageData, blockSize, midToneRatioThreshold) {
    var data = imageData.data;
    var w = imageData.width;
    var h = imageData.height;
    blockSize = blockSize || BLOCK_SIZE;
    midToneRatioThreshold = midToneRatioThreshold != null ? midToneRatioThreshold : IMAGE_BLOCK_MID_TONE_RATIO;

    var mask = new Uint8Array(w * h);

    for (var by = 0; by < h; by += blockSize) {
        for (var bx = 0; bx < w; bx += blockSize) {
            var midCount = 0;
            var total = 0;
            var grayCounts = {};
            for (var dy = 0; dy < blockSize && by + dy < h; dy++) {
                for (var dx = 0; dx < blockSize && bx + dx < w; dx++) {
                    var y = by + dy, x = bx + dx;
                    var idx = (y * w + x) * 4;
                    var g = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
                    if (g >= MID_TONE_MIN && g <= MID_TONE_MAX) midCount++;
                    grayCounts[g] = (grayCounts[g] || 0) + 1;
                    total++;
                }
            }
            var ratio = total > 0 ? midCount / total : 0;
            var distinctGrays = Object.keys(grayCounts).length;
            var isImage = ratio >= midToneRatioThreshold || distinctGrays >= IMAGE_BLOCK_DISTINCT_GRAY_MIN;
            var v = isImage ? 255 : 0;
            for (var dy = 0; dy < blockSize && by + dy < h; dy++) {
                for (var dx = 0; dx < blockSize && bx + dx < w; dx++) {
                    var y = by + dy, x = bx + dx;
                    mask[y * w + x] = v;
                }
            }
        }
    }
    return mask;
}

/**
 * Composite: for each pixel, use imageDataImage where mask > 128, else imageDataText.
 * Result is written into imageDataText (mutates it).
 */
function compositeByMask(imageDataText, imageDataImage, mask) {
    var w = imageDataText.width;
    var h = imageDataText.height;
    var textData = imageDataText.data;
    var imageData = imageDataImage.data;

    for (var i = 0; i < w * h; i++) {
        if (mask[i] <= 128) continue;
        var idx = i * 4;
        textData[idx] = imageData[idx];
        textData[idx + 1] = imageData[idx + 1];
        textData[idx + 2] = imageData[idx + 2];
    }
    return imageDataText;
}

/**
 * Apply image-region-only pipeline: image areas get separate brightness, contrast, dither, negative.
 * opts: { bits, isHQ, imageBrightness, imageContrast, imageDither, imageDitherStrength, imageNegative }
 * Returns the composited ImageData (same dimensions as input).
 */
async function applyDitheringOnlyToImageRegions(imageData, opts) {
    var bits = opts.bits;
    var isHQ = opts.isHQ;
    var imageBrightness = opts.imageBrightness != null ? opts.imageBrightness : 0;
    var imageContrast = opts.imageContrast != null ? opts.imageContrast : 0;
    var imageDither = opts.imageDither !== false;
    var imageDitherStrength = opts.imageDitherStrength != null ? opts.imageDitherStrength : 0.75;
    var imageNegative = opts.imageNegative === true;
    var strictImageMask = opts.strictImageMask === true;

    var hasExternalMask = !!opts.imageMask;
    var mask = opts.imageMask || (strictImageMask ? new Uint8Array(imageData.width * imageData.height) : buildImageRegionMask(imageData));
    var totalPixels = imageData.width * imageData.height;
    var imagePixelCount = 0;
    for (var k = 0; k < totalPixels; k++) {
        if (mask[k] > 128) imagePixelCount++;
    }
    console.log(
        '[dither-debug]',
        'images-only-enter',
        'strictMask=', !!strictImageMask,
        'hasExternalMask=', !!hasExternalMask,
        'imagePixelCount=', imagePixelCount
    );
    // 外部差分 mask 可能因个别书籍/样式失效（全 0），回退到启发式 mask。
    if (hasExternalMask && imagePixelCount === 0) {
        if (strictImageMask) {
            console.log('[dither-debug]', 'images-only-early-return-strict-empty-mask');
            if (isHQ) applyAntiAliasing(imageData);
            return imageData;
        }
        var fallbackMask = buildImageRegionMask(imageData);
        var fallbackCount = 0;
        for (var fk = 0; fk < totalPixels; fk++) {
            if (fallbackMask[fk] > 128) fallbackCount++;
        }
        if (fallbackCount > 0) {
            mask = fallbackMask;
            imagePixelCount = fallbackCount;
            hasExternalMask = false;
        }
    }

    // 若仍未检测到任何图片区域，对整页应用图片管线，避免“完全无效果”
    if (imagePixelCount === 0) {
        if (strictImageMask) {
            console.log('[dither-debug]', 'images-only-empty-mask-strict-return');
            if (isHQ) applyAntiAliasing(imageData);
            return imageData;
        }
        // 精确外部 mask（正常页 vs 无图页）优先：无图页就不做图片抖动
        if (hasExternalMask) {
            if (isHQ) applyAntiAliasing(imageData);
            return imageData;
        }
        if (imageBrightness !== 0 || imageContrast !== 0) {
            applyBrightnessContrast(imageData, imageBrightness, imageContrast);
        }
        if (imageDither) {
            imageData = await applyDithering(imageData, bits, imageDitherStrength);
        } else if (isHQ) {
            applyAntiAliasing(imageData);
        }
        if (imageNegative) {
            applyNegative(imageData);
        }
        return imageData;
    }

    var textLayer = cloneImageData(imageData);
    var imageLayer = cloneImageData(imageData);

    if (isHQ) applyAntiAliasing(textLayer);

    if (imageBrightness !== 0 || imageContrast !== 0) {
        applyBrightnessContrast(imageLayer, imageBrightness, imageContrast);
    }
    if (imageDither) {
        console.log('[dither-debug]', 'images-only-apply-dither', 'strength=', imageDitherStrength);
        imageLayer = await applyDithering(imageLayer, bits, imageDitherStrength);
    } else if (isHQ) {
        applyAntiAliasing(imageLayer);
    }
    if (imageNegative) {
        applyNegative(imageLayer);
    }

    compositeByMask(textLayer, imageLayer, mask);
    return textLayer;
}

// ==================== Dithering ====================
async function applyDithering(imageData, bits, strength) {
    if (ditherWorker) {
        try {
            return await applyDitheringAsync(imageData, bits, strength);
        } catch (err) {
            console.warn('Async dithering failed, using sync fallback:', err);
            return applyDitheringSync(imageData, bits, strength);
        }
    } else {
        return applyDitheringSync(imageData, bits, strength);
    }
}

function applyDitheringAsync(imageData, bits, strength) {
    return new Promise(function(resolve, reject) {
        var id = ++ditherJobId;
        var timeoutId = setTimeout(function() {
            var pending = ditherCallbacks.get(id);
            if (!pending) return;
            ditherCallbacks.delete(id);
            reject(new Error('Dither worker timeout'));
        }, 10000);

        ditherCallbacks.set(id, {
            resolve: resolve,
            reject: reject,
            timeoutId: timeoutId,
            width: imageData.width,
            height: imageData.height
        });

        ditherWorker.postMessage({
            imageData: imageData.data.buffer.slice(0),
            width: imageData.width,
            height: imageData.height,
            bits: bits,
            strength: strength,
            id: id
        });
    });
}

function applyDitheringSync(imageData, bits, strength) {
    var data = imageData.data;
    var width = imageData.width;
    var height = imageData.height;

    // Floyd-Steinberg dithering
    var gray = new Float32Array(width * height);

    // Convert to grayscale
    for (var i = 0; i < width * height; i++) {
        var idx = i * 4;
        gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }

    // Dither
    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var idx = y * width + x;
            var oldPixel = gray[idx];
            var newPixel = quantize(oldPixel, bits);
            gray[idx] = newPixel;

            var error = (oldPixel - newPixel) * strength;

            if (x + 1 < width) gray[idx + 1] += error * 7 / 16;
            if (y + 1 < height) {
                if (x > 0) gray[idx + width - 1] += error * 3 / 16;
                gray[idx + width] += error * 5 / 16;
                if (x + 1 < width) gray[idx + width + 1] += error * 1 / 16;
            }
        }
    }

    // Write back to imageData
    for (var i = 0; i < width * height; i++) {
        var v = Math.max(0, Math.min(255, Math.round(gray[i])));
        var idx = i * 4;
        data[idx] = data[idx + 1] = data[idx + 2] = v;
    }

    return imageData;
}

function quantize(value, bits) {
    if (bits === 1) {
        return value < 128 ? 0 : 255;
    } else {
        // 2-bit: 4 levels for XTH
        if (value > 212) return 255;
        if (value > 127) return 170;
        if (value > 42) return 85;
        return 0;
    }
}

function applyNegative(imageData) {
    var data = imageData.data;
    for (var i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
    }
}

// ==================== Brightness/Contrast for E-ink (grayscale) ====================
function applyBrightnessContrast(imageData, brightness, contrast) {
    var data = imageData.data;
    var width = imageData.width;
    var height = imageData.height;

    // Convert to grayscale first if needed
    var gray = new Uint8Array(width * height);
    for (var i = 0; i < width * height; i++) {
        var idx = i * 4;
        gray[i] = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
    }

    // Apply brightness and contrast
    // brightness: -100 to 100, maps to -128 to 128
    // contrast: -100 to 100, maps to 0.5 to 2.0
    var brightnessOffset = brightness * 1.28; // -128 to 128
    var contrastFactor = (contrast + 100) / 100; // 0 to 2

    for (var i = 0; i < width * height; i++) {
        var v = gray[i];

        // Apply contrast first
        v = ((v / 255 - 0.5) * contrastFactor + 0.5) * 255;

        // Then apply brightness
        v = v + brightnessOffset;

        // Clamp to 0-255
        v = Math.max(0, Math.min(255, Math.round(v)));

        gray[i] = v;
    }

    // Write back to imageData
    for (var i = 0; i < width * height; i++) {
        var v = gray[i];
        var idx = i * 4;
        data[idx] = data[idx + 1] = data[idx + 2] = v;
    }

    return imageData;
}

// ==================== Anti-aliasing for XTCH (4-level gray edges) ====================
// Only blur pixels on the black/white boundary so character bodies stay black, background white.
function applyAntiAliasing(imageData) {
    var data = imageData.data;
    var width = imageData.width;
    var height = imageData.height;
    var gray = new Float32Array(width * height);

    for (var i = 0; i < width * height; i++) {
        var idx = i * 4;
        gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }

    var out = new Float32Array(width * height);
    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var idx = y * width + x;
            var center = gray[idx];
            var hasLow = false, hasHigh = false;
            for (var dy = -1; dy <= 1; dy++) {
                for (var dx = -1; dx <= 1; dx++) {
                    var nx = x + dx, ny = y + dy;
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                    var v = gray[ny * width + nx];
                    if (v <= 127) hasLow = true;
                    if (v >= 128) hasHigh = true;
                }
            }
            if (hasLow && hasHigh) {
                // Center-heavy kernel (8 center, 1 cardinal, 0 diagonal): subtle edge gray, keeps strokes sharp
                var sum = 0, w = 0;
                for (var dy = -1; dy <= 1; dy++) {
                    for (var dx = -1; dx <= 1; dx++) {
                        var nx = x + dx, ny = y + dy;
                        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                        var kw = (dx === 0 && dy === 0) ? 8 : (dx !== 0 && dy !== 0) ? 0 : 1;
                        sum += gray[ny * width + nx] * kw;
                        w += kw;
                    }
                }
                out[idx] = w > 0 ? sum / w : center;
            } else {
                out[idx] = center;
            }
        }
    }

    for (var i = 0; i < width * height; i++) {
        var v = Math.max(0, Math.min(255, Math.round(out[i])));
        var idx = i * 4;
        data[idx] = data[idx + 1] = data[idx + 2] = v;
    }
    return imageData;
}

// ==================== Final output quantization (match encoder) ====================
// Preview should show the same effective levels as exported XTG/XTH.
function applyOutputQuantization(imageData, qualityValue) {
    var data = imageData.data;
    var isHQ = qualityValue === 'hq';

    for (var i = 0; i < data.length; i += 4) {
        var gray = data[i];
        var v;

        if (isHQ) {
            // Same thresholds as XTH encoder: 4 levels (0/85/170/255).
            if (gray > 212) v = 255;
            else if (gray > 127) v = 170;
            else if (gray > 42) v = 85;
            else v = 0;
        } else {
            // Same threshold rule as XTG encoder (>=128 => white).
            v = gray >= 128 ? 255 : 0;
        }

        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
    }

    return imageData;
}

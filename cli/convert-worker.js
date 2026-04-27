/**
 * Worker for parallel EPUB conversion: loads EPUB once, renders a page range, returns encoded pages.
 * Used by converter.convertEpubParallel().
 */

const path = require('path');
const fs = require('fs');
const { parentPort, workerData } = require('worker_threads');
const { applyDithering, applyNegative, applyAntiAliasing } = require('./dither');
const { encodeXTG, encodeXTH } = require('./encoder');
const { preprocessEpub } = require('./lib/epub-preprocess');

async function run() {
    const { epubPath, settings, workerId, numWorkers } = workerData;
    const { width, height, output } = settings;
    const isHQ = output.format === 'xtch';
    const bits = isHQ ? 2 : 1;

    const wasmPath = path.join(__dirname, '..', 'web', 'crengine.js');
    if (!fs.existsSync(wasmPath)) {
        throw new Error(`CREngine not found: ${wasmPath}`);
    }

    const CREngine = require(wasmPath);
    const Module = await CREngine();
    const renderer = new Module.EpubRenderer(width, height);

    try {
        const fontData = fs.readFileSync(settings.font.path);
        const fontName = path.basename(settings.font.path);
        const fontPtr = Module.allocateMemory(fontData.length);
        Module.HEAPU8.set(new Uint8Array(fontData), fontPtr);
        renderer.registerFontFromMemory(fontPtr, fontData.length, fontName);
        Module.freeMemory(fontPtr);

        let epubData = fs.readFileSync(epubPath);
        const indent = settings.paraIndent ?? 1;
        const spacing = settings.paraSpacing ?? 20;
        epubData = await preprocessEpub(epubData, indent, spacing);
        const ptr = Module.allocateMemory(epubData.length);
        Module.HEAPU8.set(new Uint8Array(epubData), ptr);
        try {
            renderer.loadEpubFromMemory(ptr, epubData.length);
            renderer.configureStatusBar(false, false, false, false, false, false, false, false, false);
        } finally {
            Module.freeMemory(ptr);
        }

        const { margins, font, lineHeight, textAlignValue, hyphenation } = settings;
        renderer.setMargins(margins.left, margins.top, margins.right, margins.bottom);
        renderer.setFontSize(font.size);
        renderer.setFontWeight(font.weight);
        renderer.setInterlineSpace(lineHeight);
        renderer.setTextAlign(textAlignValue);
        if (hyphenation.enabled) {
            renderer.setHyphenation(2);
            if (renderer.setHyphenationLanguage) renderer.setHyphenationLanguage(hyphenation.language);
        } else {
            renderer.setHyphenation(0);
        }

        const totalPages = renderer.getPageCount();
        const start = Math.floor((totalPages * workerId) / numWorkers);
        const end = Math.floor((totalPages * (workerId + 1)) / numWorkers);

        const pages = [];
        for (let i = start; i < end; i++) {
            renderer.goToPage(i);
            renderer.renderCurrentPage();
            const frameBuffer = renderer.getFrameBuffer();
            if (!frameBuffer || frameBuffer.length === 0) {
                throw new Error(`Empty frame buffer for page ${i}`);
            }
            let imageData = new Uint8ClampedArray(frameBuffer);

            if (output.dithering) {
                imageData = applyDithering(imageData, width, height, bits, output.ditherStrength);
            } else if (isHQ) {
                applyAntiAliasing(imageData, width, height);
            }
            if (output.negative) {
                applyNegative(imageData);
            }

            const encoded = isHQ
                ? encodeXTH(imageData, width, height)
                : encodeXTG(imageData, width, height);
            pages.push(encoded);
        }

        const info = renderer.getDocumentInfo() || {};
        const toc = renderer.getToc() || [];
        renderer.delete();

        parentPort.postMessage(
            { workerId, totalPages, info, toc, pages },
            pages.map((p) => p.buffer)
        );
    } catch (err) {
        parentPort.postMessage({ workerId, error: err.message || String(err) });
    }
}

run();

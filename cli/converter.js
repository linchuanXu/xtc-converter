/**
 * Core EPUB to XTC/XTCH converter
 * Uses CREngine WASM for EPUB rendering
 */

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { applyDithering, applyNegative, applyAntiAliasing } = require('./dither');
const { encodeXTG, encodeXTH, buildXTCContainer } = require('./encoder');
const { preprocessEpub } = require('./lib/epub-preprocess');

let Module = null;
let renderer = null;

/**
 * Destroy renderer and free WASM memory
 */
function destroyRenderer() {
    if (renderer) {
        renderer.delete();  // Emscripten destructor - frees WASM heap
        renderer = null;
    }
}

/**
 * Initialize CREngine WASM module
 */
async function initWasm() {
    if (Module) return;

    const wasmPath = path.join(__dirname, '..', 'web', 'crengine.js');

    if (!fs.existsSync(wasmPath)) {
        throw new Error(`CREngine WASM not found at: ${wasmPath}`);
    }

    // Load CREngine module
    const CREngine = require(wasmPath);
    Module = await CREngine();
}

/**
 * Create renderer with specified dimensions
 */
function createRenderer(width, height) {
    if (!Module) {
        throw new Error('WASM module not initialized. Call initWasm() first.');
    }
    destroyRenderer();  // Clean up existing renderer before creating new one
    renderer = new Module.EpubRenderer(width, height);

    return renderer;
}

/**
 * Register font from file
 */
async function registerFont(fontPath) {
    if (!renderer) {
        throw new Error('Renderer not initialized');
    }

    const fontData = fs.readFileSync(fontPath);
    const fontName = path.basename(fontPath);

    const ptr = Module.allocateMemory(fontData.length);
    Module.HEAPU8.set(new Uint8Array(fontData), ptr);
    renderer.registerFontFromMemory(ptr, fontData.length, fontName);
    Module.freeMemory(ptr);

    return fontName;
}

/**
 * Load EPUB file into renderer.
 * Applies same preprocessing as Web (strip fonts, clean CSS/HTML, inject base styles + para indent/spacing)
 * so CLI and Web produce consistent layout; see docs/crengine-limitations.md
 */
async function loadEpub(epubPath, settings = {}) {
    if (!renderer) {
        throw new Error('Renderer not initialized');
    }

    let epubData = fs.readFileSync(epubPath);
    const indent = settings.paraIndent ?? 1;
    const spacing = settings.paraSpacing ?? 20;
    epubData = await preprocessEpub(epubData, indent, spacing);

    const ptr = Module.allocateMemory(epubData.length);
    Module.HEAPU8.set(new Uint8Array(epubData), ptr);

    try {
        renderer.loadEpubFromMemory(ptr, epubData.length);

        // Disable built-in status bar (must be after loading document)
        renderer.configureStatusBar(false, false, false, false, false, false, false, false, false);
    } finally {
        Module.freeMemory(ptr);
    }

    return {
        pageCount: renderer.getPageCount(),
        info: renderer.getDocumentInfo() || {},
        toc: renderer.getToc() || []
    };
}

/**
 * Apply rendering settings
 */
function applySettings(settings) {
    if (!renderer) {
        throw new Error('Renderer not initialized');
    }

    const { margins, font, lineHeight, textAlignValue, hyphenation } = settings;

    renderer.setMargins(
        margins.left,
        margins.top,
        margins.right,
        margins.bottom
    );
    renderer.setFontSize(font.size);
    renderer.setFontWeight(font.weight);
    renderer.setInterlineSpace(lineHeight);
    renderer.setTextAlign(textAlignValue);

    if (hyphenation.enabled) {
        renderer.setHyphenation(2); // Dictionary-based
        if (renderer.setHyphenationLanguage) {
            renderer.setHyphenationLanguage(hyphenation.language);
        }
    } else {
        renderer.setHyphenation(0); // Disabled
    }
}

/**
 * Render a single page
 */
function renderPage(pageNum) {
    if (!renderer) {
        throw new Error('Renderer not initialized');
    }

    renderer.goToPage(pageNum);
    renderer.renderCurrentPage();

    const frameBuffer = renderer.getFrameBuffer();
    if (!frameBuffer || frameBuffer.length === 0) {
        throw new Error(`Empty frame buffer for page ${pageNum}`);
    }

    // Copy buffer (frame buffer may be reused by WASM)
    return new Uint8ClampedArray(frameBuffer);
}

/**
 * Convert single EPUB to XTC/XTCH
 */
async function convertEpub(epubPath, outputPath, settings, progressCallback) {
    const { width, height, output } = settings;
    const isHQ = output.format === 'xtch';
    const bits = isHQ ? 2 : 1;

    // Initialize and setup
    await initWasm();
    createRenderer(width, height);

    // Register font
    await registerFont(settings.font.path);

    // Load EPUB (with preprocessing: strip fonts, clean CSS, inject styles + para indent/spacing)
    const { pageCount, info, toc } = await loadEpub(epubPath, settings);

    if (pageCount === 0) {
        throw new Error('EPUB has no pages');
    }

    // Apply settings after loading (affects pagination)
    applySettings(settings);

    // Re-get page count after settings (pagination may change)
    const totalPages = renderer.getPageCount();

    // Render all pages
    const pages = [];
    for (let i = 0; i < totalPages; i++) {
        // Render page
        let imageData = renderPage(i);

        // Apply dithering if enabled
        if (output.dithering) {
            imageData = applyDithering(imageData, width, height, bits, output.ditherStrength);
        } else if (isHQ) {
            // XTCH without dithering: anti-alias edges for 4-level gray character edges
            applyAntiAliasing(imageData, width, height);
        }

        // Apply negative if enabled
        if (output.negative) {
            applyNegative(imageData);
        }

        // Encode page
        const encoded = isHQ
            ? encodeXTH(imageData, width, height)
            : encodeXTG(imageData, width, height);
        pages.push(encoded);

        // Progress callback
        if (progressCallback) {
            progressCallback(i + 1, totalPages);
        }
    }

    // Build container
    const metadata = {
        title: info.title || path.basename(epubPath, '.epub'),
        author: info.author || info.authors || ''
    };

    const container = buildXTCContainer(pages, metadata, toc, width, height, isHQ);

    // Write output
    fs.writeFileSync(outputPath, container);

    return {
        outputPath,
        pageCount: totalPages,
        format: output.format
    };
}

/**
 * Convert single EPUB to XTC/XTCH using multiple workers (parallel rendering).
 * @param {string} epubPath - Path to EPUB file
 * @param {string} outputPath - Path to output XTC/XTCH file
 * @param {object} settings - Resolved settings (font.path must be absolute)
 * @param {number} jobs - Number of worker threads (e.g. 4)
 * @param {function} [progressCallback] - Optional (current, total) for progress
 */
async function convertEpubParallel(epubPath, outputPath, settings, jobs, progressCallback) {
    const { width, height, output } = settings;
    const isHQ = output.format === 'xtch';
    const numWorkers = Math.max(1, Math.min(jobs, require('os').cpus().length));

    const workerPath = path.join(__dirname, 'convert-worker.js');
    const workers = [];
    for (let w = 0; w < numWorkers; w++) {
        const worker = new Worker(workerPath, {
            workerData: {
                epubPath: path.resolve(epubPath),
                settings,
                workerId: w,
                numWorkers
            }
        });
        workers.push(worker);
    }

    const results = await Promise.all(
        workers.map(
            (worker) =>
                new Promise((resolve, reject) => {
                    worker.on('message', (msg) => {
                        if (msg.error) {
                            reject(new Error(msg.error));
                        } else {
                            resolve(msg);
                        }
                    });
                    worker.on('error', reject);
                })
        )
    );

    for (const w of workers) {
        w.terminate().catch(() => {});
    }

    const sorted = results.sort((a, b) => a.workerId - b.workerId);
    const first = sorted[0];
    if (first.error) {
        throw new Error(first.error);
    }

    const allPages = [];
    for (const r of sorted) {
        for (const p of r.pages) {
            allPages.push(p instanceof Uint8Array ? p : new Uint8Array(p));
        }
    }

    const totalPages = first.totalPages;
    if (allPages.length !== totalPages) {
        throw new Error(`Page count mismatch: got ${allPages.length}, expected ${totalPages}`);
    }

    const metadata = {
        title: first.info.title || path.basename(epubPath, '.epub'),
        author: first.info.author || first.info.authors || ''
    };
    const container = buildXTCContainer(allPages, metadata, first.toc || [], width, height, isHQ);
    fs.writeFileSync(outputPath, container);

    if (progressCallback) {
        progressCallback(totalPages, totalPages);
    }

    return {
        outputPath,
        pageCount: totalPages,
        format: output.format
    };
}

/**
 * Get output path for an EPUB file
 * @param {string} inputPath - Full path to input EPUB
 * @param {string} outputDir - Output directory
 * @param {string} format - 'xtc' or 'xtch'
 * @param {string} [prefix] - Optional filename prefix (e.g. '[X3]')
 */
function getOutputPath(inputPath, outputDir, format, prefix) {
    const basename = path.basename(inputPath, '.epub');
    const extension = format === 'xtch' ? '.xtch' : '.xtc';
    const safePrefix = (prefix && String(prefix).trim())
        ? String(prefix).trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        : '';
    return path.join(outputDir, safePrefix + basename + extension);
}

/**
 * Cleanup renderer resources
 */
function cleanup() {
    destroyRenderer();
}

module.exports = {
    initWasm,
    createRenderer,
    registerFont,
    loadEpub,
    applySettings,
    renderPage,
    convertEpub,
    convertEpubParallel,
    getOutputPath,
    cleanup
};

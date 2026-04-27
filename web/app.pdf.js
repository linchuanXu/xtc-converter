// ==================== PDF Handling ====================
var pdfDoc = null;
var pdfDocInfo = { title: '', author: '' };
var PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function ensurePdfJsReady() {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js is not loaded');
    }
    if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    }
}

async function unloadPdfDocument() {
    if (!pdfDoc) return;
    try {
        await pdfDoc.destroy();
    } catch (e) {
        console.warn('[unloadPdfDocument] destroy failed:', e);
    }
    pdfDoc = null;
    pdfDocInfo = { title: '', author: '' };
}

async function loadPdfDocument(arrayBuffer) {
    ensurePdfJsReady();
    await unloadPdfDocument();

    var loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    var doc = await loadingTask.promise;
    pdfDoc = doc;

    pdfDocInfo = await readPdfMetadata(doc);
    var toc = await buildPdfToc(doc);
    return {
        totalPages: doc.numPages || 0,
        toc: toc,
        info: pdfDocInfo
    };
}

function getPdfDocumentInfo() {
    return pdfDocInfo || { title: '', author: '' };
}

async function renderPdfPageToImageData(pageIndex, width, height) {
    if (!pdfDoc) {
        throw new Error('No PDF document loaded');
    }
    if (pageIndex < 0 || pageIndex >= pdfDoc.numPages) {
        throw new Error('Page out of range: ' + pageIndex);
    }

    var page = await pdfDoc.getPage(pageIndex + 1);
    var baseViewport = page.getViewport({ scale: 1 });
    var scale = Math.min(width / baseViewport.width, height / baseViewport.height);
    var viewport = page.getViewport({ scale: scale });
    var dx = Math.round((width - viewport.width) / 2);
    var dy = Math.round((height - viewport.height) / 2);

    // PDF.js forbids concurrent render() on the same canvas.
    // Use a fresh canvas per render request to avoid overlap errors when UI triggers rapid re-renders.
    var renderCanvas = document.createElement('canvas');
    var renderCtx = renderCanvas.getContext('2d', { alpha: false });
    renderCanvas.width = width;
    renderCanvas.height = height;

    renderCtx.fillStyle = '#fff';
    renderCtx.fillRect(0, 0, width, height);

    await page.render({
        canvasContext: renderCtx,
        viewport: viewport,
        transform: [1, 0, 0, 1, dx, dy]
    }).promise;

    return renderCtx.getImageData(0, 0, width, height);
}

async function readPdfMetadata(doc) {
    try {
        var meta = await doc.getMetadata();
        var info = (meta && meta.info) ? meta.info : {};
        var title = info.Title || '';
        var author = info.Author || '';
        return { title: title, author: author };
    } catch (e) {
        console.warn('[readPdfMetadata] failed:', e);
        return { title: '', author: '' };
    }
}

async function buildPdfToc(doc) {
    try {
        var outline = await doc.getOutline();
        if (!outline || !outline.length) return [];
        var toc = [];
        await collectOutlineItems(doc, outline, toc);
        return toc;
    } catch (e) {
        console.warn('[buildPdfToc] failed:', e);
        return [];
    }
}

async function collectOutlineItems(doc, items, out) {
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item) continue;
        var pageIndex = await resolveOutlinePageIndex(doc, item.dest);
        if (pageIndex >= 0) {
            var title = (item.title || '').trim() || ('Chapter ' + (out.length + 1));
            out.push({
                title: title,
                page: pageIndex,
                startPage: pageIndex
            });
        }
        if (item.items && item.items.length) {
            await collectOutlineItems(doc, item.items, out);
        }
    }
}

async function resolveOutlinePageIndex(doc, dest) {
    try {
        var resolvedDest = dest;
        if (typeof dest === 'string') {
            resolvedDest = await doc.getDestination(dest);
        }
        if (!resolvedDest || !resolvedDest.length) return -1;
        var pageRef = resolvedDest[0];
        if (!pageRef) return -1;
        return await doc.getPageIndex(pageRef);
    } catch (e) {
        return -1;
    }
}

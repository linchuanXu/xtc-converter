// ==================== XTG/XTH Encoding ====================
function encodeXTG(imageData) {
    // XTG: 1-bit monochrome, row-major, MSB = leftmost pixel
    var width = imageData.width;
    var height = imageData.height;
    var data = imageData.data;

    // Header: 22 bytes
    var header = new Uint8Array(22);
    var view = new DataView(header.buffer);

    // Magic "XTG\0"
    header[0] = 0x58; // X
    header[1] = 0x54; // T
    header[2] = 0x47; // G
    header[3] = 0x00;

    // Dimensions (per XTG spec - no version field!)
    view.setUint16(4, width, true);    // offset 0x04
    view.setUint16(6, height, true);   // offset 0x06
    header[8] = 0;                      // colorMode = 0 (monochrome)
    header[9] = 0;                      // compression = 0 (uncompressed)

    // Bitmap: 8 pixels per byte, MSB = leftmost
    var rowBytes = Math.ceil(width / 8);
    var dataSize = rowBytes * height;
    view.setUint32(10, dataSize, true); // offset 0x0A (dataSize)
    // md5 at 0x0E left as zeros (optional)
    var bitmap = new Uint8Array(rowBytes * height);

    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var srcIdx = (y * width + x) * 4;
            var gray = data[srcIdx]; // Already grayscale after dithering

            if (gray >= 128) {
                // White pixel - set bit (per XTG spec: 0=black, 1=white)
                var byteIdx = y * rowBytes + Math.floor(x / 8);
                var bitIdx = 7 - (x % 8); // MSB first
                bitmap[byteIdx] |= (1 << bitIdx);
            }
        }
    }

    // Combine header + bitmap
    var result = new Uint8Array(header.length + bitmap.length);
    result.set(header, 0);
    result.set(bitmap, header.length);

    return result;
}

function encodeXTH(imageData) {
    // XTH: 2-bit grayscale, vertical scan (columns right-to-left)
    var width = imageData.width;
    var height = imageData.height;
    var data = imageData.data;

    // Header: 22 bytes
    var header = new Uint8Array(22);
    var view = new DataView(header.buffer);

    // Magic "XTH\0"
    header[0] = 0x58; // X
    header[1] = 0x54; // T
    header[2] = 0x48; // H
    header[3] = 0x00;

    // Dimensions (per XTH spec - no version field!)
    view.setUint16(4, width, true);    // offset 0x04
    view.setUint16(6, height, true);   // offset 0x06
    header[8] = 0;                      // colorMode = 0
    header[9] = 0;                      // compression = 0

    // Two bit planes, vertical scan, columns right-to-left
    var colBytes = Math.ceil(height / 8);
    var dataSize = colBytes * width * 2; // Two bit planes
    view.setUint32(10, dataSize, true); // offset 0x0A (dataSize)
    // md5 at 0x0E left as zeros (optional)
    var plane0 = new Uint8Array(colBytes * width); // bit 0
    var plane1 = new Uint8Array(colBytes * width); // bit 1

    for (var x = width - 1; x >= 0; x--) {
        var colIdx = width - 1 - x;

        for (var y = 0; y < height; y++) {
            var srcIdx = (y * width + x) * 4;
            var gray = data[srcIdx];

            // Quantize to 2-bit (XTH LUT; device shows 01=light, 10=dark so we swap vs spec)
            var level;
            if (gray > 212) level = 0b00;      // White
            else if (gray > 127) level = 0b01; // Light Gray (send 01 for device)
            else if (gray > 42) level = 0b10;  // Dark Gray (send 10 for device)
            else level = 0b11;                 // Black

            var byteIdx = colIdx * colBytes + Math.floor(y / 8);
            var bitIdx = 7 - (y % 8);

            if (level & 0b01) plane0[byteIdx] |= (1 << bitIdx);
            if (level & 0b10) plane1[byteIdx] |= (1 << bitIdx);
        }
    }

    // Combine header + plane0 + plane1
    var result = new Uint8Array(header.length + plane0.length + plane1.length);
    result.set(header, 0);
    result.set(plane0, header.length);
    result.set(plane1, header.length + plane0.length);

    return result;
}

// ==================== XTC Container ====================
/** 导出时目录条数上限，与 app.files.js 的 MAX_TOC_ENTRIES 一致，避免设备卡死 */
var MAX_TOC_EXPORT = 100;

function buildXTCContainer(pages, isHQ, deviceWidth, deviceHeight, tocOverride) {
    var magic = isHQ ? 'XTCH' : 'XTC\0';
    // 索引中的宽高固定为设备原生尺寸，不随旋转改变
    var indexW = (deviceWidth != null && deviceHeight != null) ? deviceWidth : SCREEN_WIDTH;
    var indexH = (deviceWidth != null && deviceHeight != null) ? deviceHeight : SCREEN_HEIGHT;

    var toc = (tocOverride != null && tocOverride.length > 0)
        ? tocOverride
        : ((currentToc.length > MAX_TOC_EXPORT) ? currentToc.slice(0, MAX_TOC_EXPORT) : currentToc);
    if (toc.length > MAX_TOC_EXPORT) toc = toc.slice(0, MAX_TOC_EXPORT);

    // Get metadata
    var info = {};
    if (isPdfMode && typeof getPdfDocumentInfo === 'function') {
        info = getPdfDocumentInfo() || {};
    } else if (renderer && typeof renderer.getDocumentInfo === 'function') {
        info = renderer.getDocumentInfo() || {};
    }
    var title = info.title || (currentFile ? currentFile.name : 'book');
    var author = info.author || info.authors || '';

    // Calculate offsets
    var headerSize = 56;
    var metadataSize = 256;
    var chapterEntrySize = 96;
    var chaptersSize = toc.length * chapterEntrySize;
    var indexEntrySize = 16;
    var indexSize = pages.length * indexEntrySize;

    var metadataOffset = headerSize;
    var chapterOffset = metadataOffset + metadataSize;
    var indexOffset = chapterOffset + chaptersSize;
    var pageDataOffset = indexOffset + indexSize;

    // Build page index
    var pageOffsets = [];
    var currentOffset = pageDataOffset;
    for (var i = 0; i < pages.length; i++) {
        pageOffsets.push({ offset: currentOffset, size: pages[i].length });
        currentOffset += pages[i].length;
    }

    var totalSize = currentOffset;
    var buffer = new ArrayBuffer(totalSize);
    var view = new DataView(buffer);
    var bytes = new Uint8Array(buffer);

    // Write header (56 bytes)
    for (var i = 0; i < 4; i++) {
        bytes[i] = magic.charCodeAt(i);
    }
    view.setUint16(4, 1, true); // Version
    view.setUint16(6, pages.length, true); // Page count
    // Individual flag bytes per XTC spec
    bytes[8] = 0;   // readDirection (0 = L→R)
    bytes[9] = 1;   // hasMetadata
    bytes[10] = 0;  // hasThumbnails
    bytes[11] = toc.length > 0 ? 1 : 0;  // hasChapters
    view.setUint32(12, 1, true); // Current page (1-indexed)

    // Use BigInt for 64-bit values
    view.setBigUint64(16, BigInt(metadataOffset), true);
    view.setBigUint64(24, BigInt(indexOffset), true);
    view.setBigUint64(32, BigInt(pageDataOffset), true);
    view.setBigUint64(40, BigInt(0), true); // Reserved
    view.setBigUint64(48, BigInt(chapterOffset), true);

    // Write metadata (256 bytes)
    var encoder = new TextEncoder();
    var titleBytes = encoder.encode(title);
    if (titleBytes.length > 126) titleBytes = titleBytes.slice(0, 126);
    var authorBytes = encoder.encode(author);
    if (authorBytes.length > 62) authorBytes = authorBytes.slice(0, 62);

    bytes.set(titleBytes, metadataOffset);
    bytes[metadataOffset + 127] = 0; // Null terminator
    bytes.set(authorBytes, metadataOffset + 128);
    bytes[metadataOffset + 191] = 0; // Null terminator
    // createTime at 0xF0 (240), chapterCount at 0xF6 (246) — per XTC spec
    view.setUint32(metadataOffset + 240, Math.floor(Date.now() / 1000), true); // createTime
    view.setUint16(metadataOffset + 246, toc.length, true); // chapterCount

    // Write chapters — page numbers are 0-based per XTC spec
    var chapterPos = chapterOffset;
    for (var i = 0; i < toc.length; i++) {
        var ch = toc[i];
        if (!ch) continue;
        var chTitle = ch.title || ch.name || 'Chapter ' + (i + 1);
        var chPage = ch.page != null ? ch.page : (ch.startPage != null ? ch.startPage : 0);
        var chEndPage = (ch.endPage != null) ? ch.endPage : (function() {
            var nextCh = toc[i + 1];
            return nextCh
                ? (nextCh.page != null ? nextCh.page : (nextCh.startPage != null ? nextCh.startPage : pages.length)) - 1
                : pages.length - 1;
        }());
        if (chEndPage < chPage) chEndPage = chPage;
        var chNameBytes = encoder.encode(chTitle.substring(0, 78));
        bytes.set(chNameBytes, chapterPos);
        bytes[chapterPos + 79] = 0;
        view.setUint16(chapterPos + 80, chPage + 1, true); // Start page (1-based per hardware)
        view.setUint16(chapterPos + 82, chEndPage + 1, true); // End page (1-based per hardware)
        chapterPos += chapterEntrySize;
    }

    // Write index
    var indexPos = indexOffset;
    for (var i = 0; i < pages.length; i++) {
        view.setBigUint64(indexPos, BigInt(pageOffsets[i].offset), true);
        view.setUint32(indexPos + 8, pageOffsets[i].size, true);
        view.setUint16(indexPos + 12, indexW, true);
        view.setUint16(indexPos + 14, indexH, true);
        indexPos += indexEntrySize;
    }

    // Write page data
    var dataPos = pageDataOffset;
    for (var i = 0; i < pages.length; i++) {
        bytes.set(pages[i], dataPos);
        dataPos += pages[i].length;
    }

    return bytes;
}

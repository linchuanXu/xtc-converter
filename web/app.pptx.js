// ==================== PPTX Handling ====================
var pptxDoc = null;
var pptxDocInfo = { title: '', author: '' };
var isPptxMode = false;

var PPTX_EMU_PER_INCH = 914400;
var PPTX_PX_PER_PT = 96 / 72;

function pptxEmuToPx(emu) {
    return (emu / PPTX_EMU_PER_INCH) * 96;
}

function pptxPtToPx(pt) {
    return pt * PPTX_PX_PER_PT;
}

async function unloadPptxDocument() {
    pptxDoc = null;
    pptxDocInfo = { title: '', author: '' };
}

function getPptxDocumentInfo() {
    return pptxDocInfo || { title: '', author: '' };
}

async function loadPptxDocument(arrayBuffer) {
    await unloadPptxDocument();

    var zip = await JSZip.loadAsync(arrayBuffer);
    var parser = new DOMParser();

    var presFile = zip.file('ppt/presentation.xml');
    if (!presFile) throw new Error('Invalid PPTX: missing ppt/presentation.xml');
    var presXml = await presFile.async('string');
    var presDoc = parser.parseFromString(presXml, 'application/xml');

    var slideWidthEmu = 9144000;
    var slideHeightEmu = 6858000;
    var sldSzList = presDoc.getElementsByTagName('p:sldSz');
    if (sldSzList.length > 0) {
        slideWidthEmu = parseInt(sldSzList[0].getAttribute('cx')) || slideWidthEmu;
        slideHeightEmu = parseInt(sldSzList[0].getAttribute('cy')) || slideHeightEmu;
    }

    var rIdToTarget = {};
    var presRelsFile = zip.file('ppt/_rels/presentation.xml.rels');
    if (presRelsFile) {
        var relsDoc = parser.parseFromString(await presRelsFile.async('string'), 'application/xml');
        var rels = relsDoc.getElementsByTagName('Relationship');
        for (var i = 0; i < rels.length; i++) {
            rIdToTarget[rels[i].getAttribute('Id')] = rels[i].getAttribute('Target');
        }
    }

    var slides = [];
    var sldIdLst = presDoc.getElementsByTagName('p:sldIdLst');
    if (sldIdLst.length > 0) {
        var sldIds = sldIdLst[0].getElementsByTagName('p:sldId');
        for (var i = 0; i < sldIds.length; i++) {
            var rId = sldIds[i].getAttribute('r:id') ||
                sldIds[i].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
            if (rId && rIdToTarget[rId]) {
                slides.push('ppt/' + rIdToTarget[rId].replace(/^\.?\//, ''));
            }
        }
    }
    if (slides.length === 0) {
        slides = Object.keys(zip.files)
            .filter(function(p) { return /^ppt\/slides\/slide\d+\.xml$/.test(p); })
            .sort(function(a, b) {
                return parseInt(a.match(/slide(\d+)/)[1]) - parseInt(b.match(/slide(\d+)/)[1]);
            });
    }

    var info = { title: '', author: '' };
    try {
        var coreFile = zip.file('docProps/core.xml');
        if (coreFile) {
            var coreDoc = parser.parseFromString(await coreFile.async('string'), 'application/xml');
            var titleEl = pptxFindTag(coreDoc, ['dc:title']);
            var creatorEl = pptxFindTag(coreDoc, ['dc:creator']);
            if (titleEl) info.title = titleEl.textContent || '';
            if (creatorEl) info.author = creatorEl.textContent || '';
        }
    } catch (e) { console.warn('[PPTX] metadata failed:', e); }

    var theme = null;
    try {
        var themeFile = zip.file('ppt/theme/theme1.xml');
        if (themeFile) theme = pptxParseTheme(parser.parseFromString(await themeFile.async('string'), 'application/xml'));
    } catch (e) { console.warn('[PPTX] theme parse failed:', e); }

    // Preload all slide layouts and masters for placeholder resolution
    var layoutCache = {};
    var masterCache = {};
    try {
        var layoutFiles = Object.keys(zip.files).filter(function(p) {
            return /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(p);
        });
        for (var li = 0; li < layoutFiles.length; li++) {
            var lf = zip.file(layoutFiles[li]);
            if (lf) {
                var layoutDoc = parser.parseFromString(await lf.async('string'), 'application/xml');
                var phMap = {};
                pptxCollectPlaceholders(layoutDoc, phMap);
                layoutCache[layoutFiles[li]] = { doc: layoutDoc, placeholders: phMap };

                // Also load layout rels for images
                var layoutRelsPath = layoutFiles[li].replace('ppt/slideLayouts/', 'ppt/slideLayouts/_rels/') + '.rels';
                var layoutRelsFile = zip.file(layoutRelsPath);
                if (layoutRelsFile) {
                    var lrDoc = parser.parseFromString(await layoutRelsFile.async('string'), 'application/xml');
                    var lrels = {};
                    var lrelsList = lrDoc.getElementsByTagName('Relationship');
                    for (var ri = 0; ri < lrelsList.length; ri++) {
                        lrels[lrelsList[ri].getAttribute('Id')] = {
                            target: lrelsList[ri].getAttribute('Target'),
                            type: lrelsList[ri].getAttribute('Type') || ''
                        };
                    }
                    layoutCache[layoutFiles[li]].rels = lrels;
                }
            }
        }
    } catch (e) { console.warn('[PPTX] layout preload failed:', e); }

    try {
        var masterFiles = Object.keys(zip.files).filter(function(p) {
            return /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(p);
        });
        for (var mi = 0; mi < masterFiles.length; mi++) {
            var mf = zip.file(masterFiles[mi]);
            if (mf) {
                var masterDoc = parser.parseFromString(await mf.async('string'), 'application/xml');
                var mPhMap = {};
                pptxCollectPlaceholders(masterDoc, mPhMap);
                masterCache[masterFiles[mi]] = { doc: masterDoc, placeholders: mPhMap };
            }
        }
    } catch (e) { console.warn('[PPTX] master preload failed:', e); }

    // Merge master placeholders into each layout as fallback
    try {
        for (var lp in layoutCache) {
            var layoutRels = layoutCache[lp].rels || {};
            var masterPath = null;
            for (var rk in layoutRels) {
                if ((layoutRels[rk].type || '').indexOf('slideMaster') !== -1) {
                    masterPath = pptxResolveRelPath(layoutRels[rk].target, 'ppt/slideLayouts/');
                    break;
                }
            }
            if (masterPath && masterCache[masterPath]) {
                var masterPh = masterCache[masterPath].placeholders;
                var layoutPh = layoutCache[lp].placeholders;
                for (var mk in masterPh) {
                    if (mk.indexOf('__sp__') === 0) continue;
                    if (!layoutPh[mk]) layoutPh[mk] = masterPh[mk];
                }
            }
        }
    } catch (e) { console.warn('[PPTX] master merge failed:', e); }

    pptxDoc = {
        zip: zip,
        parser: parser,
        slides: slides,
        slideWidthEmu: slideWidthEmu,
        slideHeightEmu: slideHeightEmu,
        theme: theme,
        layoutCache: layoutCache,
        masterCache: masterCache,
        info: info
    };
    pptxDocInfo = info;

    return {
        totalPages: slides.length,
        toc: [],
        info: info
    };
}

function pptxFindTag(doc, names) {
    for (var i = 0; i < names.length; i++) {
        var els = doc.getElementsByTagName(names[i]);
        if (els.length > 0) return els[0];
    }
    return null;
}

function pptxParseTheme(themeDoc) {
    var theme = { colors: {}, fonts: {} };
    var clrScheme = themeDoc.getElementsByTagName('a:clrScheme')[0];
    if (clrScheme) {
        var colorNames = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
        for (var i = 0; i < colorNames.length; i++) {
            var el = clrScheme.getElementsByTagName('a:' + colorNames[i])[0];
            if (!el) continue;
            var srgb = el.getElementsByTagName('a:srgbClr')[0];
            var sys = el.getElementsByTagName('a:sysClr')[0];
            if (srgb) theme.colors[colorNames[i]] = '#' + srgb.getAttribute('val');
            else if (sys) theme.colors[colorNames[i]] = '#' + (sys.getAttribute('lastClr') || '000000');
        }
    }
    var fontScheme = themeDoc.getElementsByTagName('a:fontScheme')[0];
    if (fontScheme) {
        var majorFont = fontScheme.getElementsByTagName('a:majorFont')[0];
        var minorFont = fontScheme.getElementsByTagName('a:minorFont')[0];
        if (majorFont) {
            var lat = majorFont.getElementsByTagName('a:latin')[0];
            var ea = majorFont.getElementsByTagName('a:ea')[0];
            if (lat) theme.fonts.major = lat.getAttribute('typeface');
            if (ea) theme.fonts.majorEa = ea.getAttribute('typeface');
        }
        if (minorFont) {
            var lat = minorFont.getElementsByTagName('a:latin')[0];
            var ea = minorFont.getElementsByTagName('a:ea')[0];
            if (lat) theme.fonts.minor = lat.getAttribute('typeface');
            if (ea) theme.fonts.minorEa = ea.getAttribute('typeface');
        }
    }
    return theme;
}

// Collect placeholder xfrm from a slide/layout/master doc
function pptxCollectPlaceholders(doc, out) {
    var sps = doc.getElementsByTagName('p:sp');
    for (var i = 0; i < sps.length; i++) {
        var nvSpPr = sps[i].getElementsByTagName('p:nvSpPr')[0];
        if (!nvSpPr) continue;
        var nvPr = nvSpPr.getElementsByTagName('p:nvPr')[0];
        if (!nvPr) continue;
        var ph = nvPr.getElementsByTagName('p:ph')[0];
        if (!ph) continue;
        var phType = ph.getAttribute('type') || '';
        var phIdx = ph.getAttribute('idx') || '';
        var xfrm = pptxExtractXfrm(sps[i]);
        // Store with multiple keys for flexible lookup
        var key = phType + ':' + phIdx;
        if (xfrm) {
            out[key] = xfrm;
            if (phType) out['type:' + phType] = xfrm;
            if (phIdx) out['idx:' + phIdx] = xfrm;
        }
        // Store the full shape element for text style extraction
        out['__sp__' + key] = sps[i];
    }
}

// Extract xfrm from a shape element without fallback
function pptxExtractXfrm(el) {
    var spPr = el.getElementsByTagName('p:spPr')[0];
    if (!spPr) return null;
    var xfrm = spPr.getElementsByTagName('a:xfrm')[0];
    if (!xfrm) return null;
    var off = xfrm.getElementsByTagName('a:off')[0];
    var ext = xfrm.getElementsByTagName('a:ext')[0];
    if (!off || !ext) return null;
    var cx = parseInt(ext.getAttribute('cx'));
    var cy = parseInt(ext.getAttribute('cy'));
    if (!cx && !cy) return null;
    return {
        x: pptxEmuToPx(parseInt(off.getAttribute('x')) || 0),
        y: pptxEmuToPx(parseInt(off.getAttribute('y')) || 0),
        w: pptxEmuToPx(cx || 0),
        h: pptxEmuToPx(cy || 0),
        rot: (parseInt(xfrm.getAttribute('rot')) || 0) / 60000,
        flipH: xfrm.getAttribute('flipH') === '1',
        flipV: xfrm.getAttribute('flipV') === '1'
    };
}

// ==================== Slide Rendering ====================

async function renderPptxPageToImageData(pageIndex, width, height) {
    if (!pptxDoc) throw new Error('No PPTX document loaded');
    if (pageIndex < 0 || pageIndex >= pptxDoc.slides.length) throw new Error('Slide out of range: ' + pageIndex);

    var slidePath = pptxDoc.slides[pageIndex];
    var zip = pptxDoc.zip;
    var parser = pptxDoc.parser;
    var slideFile = zip.file(slidePath);
    if (!slideFile) throw new Error('Slide not found: ' + slidePath);

    var slideDoc = parser.parseFromString(await slideFile.async('string'), 'application/xml');

    // Slide relationships
    var slideRelsPath = slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
    var slideRels = {};
    var layoutPath = null;
    var slideRelsFile = zip.file(slideRelsPath);
    if (slideRelsFile) {
        var relsDoc = parser.parseFromString(await slideRelsFile.async('string'), 'application/xml');
        var rels = relsDoc.getElementsByTagName('Relationship');
        for (var i = 0; i < rels.length; i++) {
            var rId = rels[i].getAttribute('Id');
            var rTarget = rels[i].getAttribute('Target');
            var rType = rels[i].getAttribute('Type') || '';
            slideRels[rId] = rTarget;
            if (rType.indexOf('slideLayout') !== -1) {
                layoutPath = pptxResolveRelPath(rTarget);
            }
        }
    }

    // Resolve layout placeholders for this slide
    var layoutPlaceholders = {};
    if (layoutPath && pptxDoc.layoutCache[layoutPath]) {
        layoutPlaceholders = pptxDoc.layoutCache[layoutPath].placeholders;
    }

    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var c = canvas.getContext('2d', { alpha: false });

    var slideW = pptxEmuToPx(pptxDoc.slideWidthEmu);
    var slideH = pptxEmuToPx(pptxDoc.slideHeightEmu);
    var scale = Math.min(width / slideW, height / slideH);
    var offsetX = Math.round((width - slideW * scale) / 2);
    var offsetY = Math.round((height - slideH * scale) / 2);

    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, width, height);

    await pptxRenderBg(c, slideDoc, zip, slideRels, offsetX, offsetY, slideW * scale, slideH * scale);

    c.save();
    c.translate(offsetX, offsetY);
    c.scale(scale, scale);

    // Render layout shapes first (decorative/background elements from layout)
    if (layoutPath && pptxDoc.layoutCache[layoutPath]) {
        var layoutDoc = pptxDoc.layoutCache[layoutPath].doc;
        var layoutSpTree = layoutDoc.getElementsByTagName('p:spTree')[0];
        var layoutRels = pptxDoc.layoutCache[layoutPath].rels || {};
        var layoutRelMap = {};
        for (var k in layoutRels) {
            layoutRelMap[k] = layoutRels[k].target;
        }
        if (layoutSpTree) {
            await pptxRenderTree(c, layoutSpTree, zip, layoutRelMap, layoutPlaceholders, true);
        }
    }

    var spTree = slideDoc.getElementsByTagName('p:spTree')[0];
    if (spTree) await pptxRenderTree(c, spTree, zip, slideRels, layoutPlaceholders, false);

    c.restore();

    return c.getImageData(0, 0, width, height);
}

// ==================== Background ====================

async function pptxRenderBg(c, slideDoc, zip, slideRels, x, y, w, h) {
    var bg = slideDoc.getElementsByTagName('p:bg')[0];
    if (!bg) {
        c.fillStyle = '#ffffff';
        c.fillRect(x, y, w, h);
        return;
    }
    var bgPr = bg.getElementsByTagName('p:bgPr')[0];
    if (!bgPr) {
        var bgRef = bg.getElementsByTagName('p:bgRef')[0];
        if (bgRef) {
            var fillColor = pptxParseFillColor(bgRef);
            c.fillStyle = fillColor || '#ffffff';
            c.fillRect(x, y, w, h);
            return;
        }
        c.fillStyle = '#ffffff';
        c.fillRect(x, y, w, h);
        return;
    }

    var solidFill = pptxDirectChild(bgPr, 'a:solidFill');
    if (solidFill) {
        c.fillStyle = pptxParseFillColor(solidFill) || '#ffffff';
        c.fillRect(x, y, w, h);
        return;
    }

    var blipFill = bgPr.getElementsByTagName('a:blipFill')[0];
    if (blipFill) {
        var blip = blipFill.getElementsByTagName('a:blip')[0];
        if (blip) {
            var rEmbed = pptxGetREmbed(blip);
            if (rEmbed && slideRels[rEmbed]) {
                try {
                    var imgPath = pptxResolveRelPath(slideRels[rEmbed]);
                    var imgData = await zip.file(imgPath).async('uint8array');
                    var img = await pptxLoadImage(imgData);
                    c.drawImage(img, x, y, w, h);
                    return;
                } catch (e) { console.warn('[PPTX] bg image failed:', e); }
            }
        }
    }

    var gradFill = pptxDirectChild(bgPr, 'a:gradFill');
    if (gradFill) {
        pptxRenderGradient(c, gradFill, x, y, w, h);
        return;
    }

    c.fillStyle = '#ffffff';
    c.fillRect(x, y, w, h);
}

// ==================== Shape Tree ====================

// isLayout: when true, skip shapes that are placeholders (they'll be filled by slide content)
async function pptxRenderTree(c, tree, zip, slideRels, layoutPh, isLayout) {
    var children = tree.childNodes;
    for (var i = 0; i < children.length; i++) {
        var node = children[i];
        if (node.nodeType !== 1) continue;
        var tag = node.tagName || node.nodeName;

        // Handle mc:AlternateContent - use Fallback (simpler), or first Choice
        if (tag === 'mc:AlternateContent' || tag === 'AlternateContent') {
            var fallback = pptxFindChildByTagSuffix(node, 'Fallback');
            var choice = pptxFindChildByTagSuffix(node, 'Choice');
            var altContainer = fallback || choice;
            if (altContainer) {
                await pptxRenderTree(c, altContainer, zip, slideRels, layoutPh, isLayout);
            }
            continue;
        }

        if (isLayout) {
            var nvSpPr = node.getElementsByTagName('p:nvSpPr')[0];
            if (nvSpPr) {
                var nvPr = nvSpPr.getElementsByTagName('p:nvPr')[0];
                if (nvPr && nvPr.getElementsByTagName('p:ph').length > 0) continue;
            }
        }

        if (tag === 'p:sp') await pptxRenderShape(c, node, zip, slideRels, layoutPh);
        else if (tag === 'p:pic') await pptxRenderPicture(c, node, zip, slideRels);
        else if (tag === 'p:grpSp') await pptxRenderGroup(c, node, zip, slideRels, layoutPh);
        else if (tag === 'p:graphicFrame') await pptxRenderGraphicFrame(c, node, zip, slideRels);
        else if (tag === 'p:cxnSp') await pptxRenderConnector(c, node);
    }
}

function pptxFindChildByTagSuffix(parent, suffix) {
    var ch = parent.childNodes;
    for (var i = 0; i < ch.length; i++) {
        if (ch[i].nodeType !== 1) continue;
        var t = ch[i].tagName || ch[i].nodeName || '';
        if (t === suffix || t.indexOf(':' + suffix) > 0) return ch[i];
    }
    return null;
}

// ==================== Placeholder Resolution ====================

function pptxGetPlaceholderInfo(sp) {
    var nvSpPr = sp.getElementsByTagName('p:nvSpPr')[0];
    if (!nvSpPr) return null;
    var nvPr = nvSpPr.getElementsByTagName('p:nvPr')[0];
    if (!nvPr) return null;
    var ph = nvPr.getElementsByTagName('p:ph')[0];
    if (!ph) return null;
    return {
        type: ph.getAttribute('type') || '',
        idx: ph.getAttribute('idx') || ''
    };
}

function pptxResolvePlaceholderXfrm(phInfo, layoutPh) {
    if (!phInfo || !layoutPh) return null;
    var key = phInfo.type + ':' + phInfo.idx;
    if (layoutPh[key]) return layoutPh[key];
    if (phInfo.type && layoutPh['type:' + phInfo.type]) return layoutPh['type:' + phInfo.type];
    if (phInfo.idx && layoutPh['idx:' + phInfo.idx]) return layoutPh['idx:' + phInfo.idx];
    // Common defaults for standard placeholder types
    return null;
}

// Get xfrm from shape, falling back to layout placeholder, then defaults
function pptxGetShapeXfrm(sp, layoutPh) {
    var xfrm = pptxExtractXfrm(sp);
    if (xfrm) return xfrm;

    var phInfo = pptxGetPlaceholderInfo(sp);
    if (phInfo) {
        var resolved = pptxResolvePlaceholderXfrm(phInfo, layoutPh);
        if (resolved) return resolved;
        var def = pptxDefaultPlaceholderXfrm(phInfo.type);
        if (def) return def;
    }
    return null;
}

function pptxDefaultPlaceholderXfrm(phType) {
    var sw = pptxDoc ? pptxEmuToPx(pptxDoc.slideWidthEmu) : 960;
    var sh = pptxDoc ? pptxEmuToPx(pptxDoc.slideHeightEmu) : 720;
    var margin = sw * 0.05;
    if (phType === 'title' || phType === 'ctrTitle')
        return { x: margin, y: sh * 0.08, w: sw - margin * 2, h: sh * 0.18, rot: 0 };
    if (phType === 'subTitle')
        return { x: sw * 0.15, y: sh * 0.35, w: sw * 0.7, h: sh * 0.25, rot: 0 };
    if (phType === 'body')
        return { x: margin, y: sh * 0.3, w: sw - margin * 2, h: sh * 0.58, rot: 0 };
    if (phType === 'dt' || phType === 'sldNum' || phType === 'ftr')
        return { x: margin, y: sh * 0.93, w: sw * 0.25, h: sh * 0.04, rot: 0 };
    return null;
}

// ==================== Shape ====================

async function pptxRenderShape(c, sp, zip, slideRels, layoutPh) {
    var xfrm = pptxGetShapeXfrm(sp, layoutPh);
    if (!xfrm || (xfrm.w === 0 && xfrm.h === 0)) return;

    var spPr = sp.getElementsByTagName('p:spPr')[0];
    c.save();

    if (xfrm.rot) {
        c.translate(xfrm.x + xfrm.w / 2, xfrm.y + xfrm.h / 2);
        c.rotate(xfrm.rot * Math.PI / 180);
        c.translate(-(xfrm.x + xfrm.w / 2), -(xfrm.y + xfrm.h / 2));
    }

    if (spPr) {
        var solidFill = pptxDirectChild(spPr, 'a:solidFill');
        var gradFill = pptxDirectChild(spPr, 'a:gradFill');
        var blipFill = spPr.getElementsByTagName('a:blipFill')[0];
        var noFill = pptxDirectChild(spPr, 'a:noFill');

        if (solidFill) {
            var color = pptxParseFillColor(solidFill);
            if (color && color !== 'transparent') {
                c.fillStyle = color;
                pptxDrawShapePath(c, spPr, xfrm);
                c.fill();
            }
        } else if (gradFill) {
            pptxDrawShapePath(c, spPr, xfrm);
            pptxRenderGradient(c, gradFill, xfrm.x, xfrm.y, xfrm.w, xfrm.h);
        } else if (blipFill) {
            await pptxRenderBlipFill(c, blipFill, xfrm, zip, slideRels);
        }

        if (!noFill) {
            var ln = pptxDirectChild(spPr, 'a:ln');
            if (ln) {
                var lnFill = ln.getElementsByTagName('a:solidFill')[0];
                var lnNoFill = pptxDirectChild(ln, 'a:noFill');
                if (lnFill && !lnNoFill) {
                    c.strokeStyle = pptxParseFillColor(lnFill) || '#000000';
                    c.lineWidth = Math.max(0.5, pptxEmuToPx(parseInt(ln.getAttribute('w')) || 12700));
                    pptxDrawShapePath(c, spPr, xfrm);
                    c.stroke();
                }
            }
        }
    }

    var txBody = sp.getElementsByTagName('p:txBody')[0];
    if (txBody) pptxRenderTextBody(c, txBody, xfrm, sp, layoutPh);

    c.restore();
}

async function pptxRenderBlipFill(c, blipFill, xfrm, zip, slideRels) {
    var blip = blipFill.getElementsByTagName('a:blip')[0];
    if (!blip) return;
    var rEmbed = pptxGetREmbed(blip);
    if (!rEmbed || !slideRels[rEmbed]) return;
    try {
        var imgPath = pptxResolveRelPath(slideRels[rEmbed]);
        var imgFile = zip.file(imgPath);
        if (!imgFile) return;
        var img = await pptxLoadImage(await imgFile.async('uint8array'));
        c.drawImage(img, xfrm.x, xfrm.y, xfrm.w, xfrm.h);
    } catch (e) {}
}

// ==================== Picture ====================

async function pptxRenderPicture(c, pic, zip, slideRels) {
    var xfrm = pptxExtractXfrm(pic);
    if (!xfrm) return;

    var blipFill = pic.getElementsByTagName('p:blipFill')[0];
    if (!blipFill) return;
    var blip = blipFill.getElementsByTagName('a:blip')[0];
    if (!blip) return;
    var rEmbed = pptxGetREmbed(blip);
    if (!rEmbed || !slideRels[rEmbed]) return;

    try {
        var imgPath = pptxResolveRelPath(slideRels[rEmbed]);
        var imgFile = zip.file(imgPath);
        if (!imgFile) return;
        var img = await pptxLoadImage(await imgFile.async('uint8array'));

        c.save();
        if (xfrm.rot) {
            c.translate(xfrm.x + xfrm.w / 2, xfrm.y + xfrm.h / 2);
            c.rotate(xfrm.rot * Math.PI / 180);
            c.translate(-(xfrm.x + xfrm.w / 2), -(xfrm.y + xfrm.h / 2));
        }

        var srcRect = blipFill.getElementsByTagName('a:srcRect')[0];
        if (srcRect) {
            var cropL = (parseInt(srcRect.getAttribute('l')) || 0) / 100000;
            var cropT = (parseInt(srcRect.getAttribute('t')) || 0) / 100000;
            var cropR = (parseInt(srcRect.getAttribute('r')) || 0) / 100000;
            var cropB = (parseInt(srcRect.getAttribute('b')) || 0) / 100000;
            var sx = img.width * cropL;
            var sy = img.height * cropT;
            var sw = img.width * (1 - cropL - cropR);
            var sh = img.height * (1 - cropT - cropB);
            c.drawImage(img, sx, sy, sw, sh, xfrm.x, xfrm.y, xfrm.w, xfrm.h);
        } else {
            c.drawImage(img, xfrm.x, xfrm.y, xfrm.w, xfrm.h);
        }
        c.restore();
    } catch (e) { console.warn('[PPTX] image render failed:', e); }
}

// ==================== Group Shape ====================

async function pptxRenderGroup(c, grpSp, zip, slideRels, layoutPh) {
    var grpSpPr = grpSp.getElementsByTagName('p:grpSpPr')[0];
    var transformed = false;
    if (grpSpPr) {
        var grpXfrm = grpSpPr.getElementsByTagName('a:xfrm')[0];
        if (grpXfrm) {
            var off = grpXfrm.getElementsByTagName('a:off')[0];
            var ext = grpXfrm.getElementsByTagName('a:ext')[0];
            var chOff = grpXfrm.getElementsByTagName('a:chOff')[0];
            var chExt = grpXfrm.getElementsByTagName('a:chExt')[0];
            if (off && ext && chOff && chExt) {
                var gx = pptxEmuToPx(parseInt(off.getAttribute('x')) || 0);
                var gy = pptxEmuToPx(parseInt(off.getAttribute('y')) || 0);
                var gw = pptxEmuToPx(parseInt(ext.getAttribute('cx')) || 0);
                var gh = pptxEmuToPx(parseInt(ext.getAttribute('cy')) || 0);
                var cx = pptxEmuToPx(parseInt(chOff.getAttribute('x')) || 0);
                var cy = pptxEmuToPx(parseInt(chOff.getAttribute('y')) || 0);
                var cw = pptxEmuToPx(parseInt(chExt.getAttribute('cx')) || 0);
                var ch = pptxEmuToPx(parseInt(chExt.getAttribute('cy')) || 0);
                c.save();
                c.translate(gx, gy);
                if (cw > 0 && ch > 0) c.scale(gw / cw, gh / ch);
                c.translate(-cx, -cy);
                transformed = true;
            }
        }
    }
    await pptxRenderTree(c, grpSp, zip, slideRels, layoutPh, false);
    if (transformed) c.restore();
}

// ==================== Connector ====================

async function pptxRenderConnector(c, cxnSp) {
    var xfrm = pptxExtractXfrm(cxnSp);
    if (!xfrm) return;

    var spPr = cxnSp.getElementsByTagName('p:spPr')[0];
    var ln = spPr ? pptxDirectChild(spPr, 'a:ln') : null;
    var color = '#000000';
    var lineW = 1;
    if (ln) {
        var lnFill = ln.getElementsByTagName('a:solidFill')[0];
        if (lnFill) color = pptxParseFillColor(lnFill) || '#000000';
        lineW = Math.max(0.5, pptxEmuToPx(parseInt(ln.getAttribute('w')) || 12700));
    }

    c.save();
    c.strokeStyle = color;
    c.lineWidth = lineW;
    c.beginPath();
    if (xfrm.flipH && !xfrm.flipV) {
        c.moveTo(xfrm.x + xfrm.w, xfrm.y);
        c.lineTo(xfrm.x, xfrm.y + xfrm.h);
    } else if (!xfrm.flipH && xfrm.flipV) {
        c.moveTo(xfrm.x, xfrm.y + xfrm.h);
        c.lineTo(xfrm.x + xfrm.w, xfrm.y);
    } else if (xfrm.flipH && xfrm.flipV) {
        c.moveTo(xfrm.x + xfrm.w, xfrm.y + xfrm.h);
        c.lineTo(xfrm.x, xfrm.y);
    } else {
        c.moveTo(xfrm.x, xfrm.y);
        c.lineTo(xfrm.x + xfrm.w, xfrm.y + xfrm.h);
    }
    c.stroke();
    c.restore();
}

// ==================== Graphic Frame (Tables) ====================

async function pptxRenderGraphicFrame(c, gf, zip, slideRels) {
    var tbl = gf.getElementsByTagName('a:tbl')[0];
    if (!tbl) return;

    var xfrmEl = gf.getElementsByTagName('p:xfrm')[0];
    if (!xfrmEl) return;
    var off = xfrmEl.getElementsByTagName('a:off')[0];
    var ext = xfrmEl.getElementsByTagName('a:ext')[0];
    if (!off || !ext) return;

    var x = pptxEmuToPx(parseInt(off.getAttribute('x')) || 0);
    var y = pptxEmuToPx(parseInt(off.getAttribute('y')) || 0);
    var w = pptxEmuToPx(parseInt(ext.getAttribute('cx')) || 0);

    var tblGrid = tbl.getElementsByTagName('a:tblGrid')[0];
    var gridCols = tblGrid ? tblGrid.getElementsByTagName('a:gridCol') : [];
    var colWidths = [];
    for (var ci = 0; ci < gridCols.length; ci++) {
        colWidths.push(pptxEmuToPx(parseInt(gridCols[ci].getAttribute('w')) || 0));
    }

    var rows = tbl.getElementsByTagName('a:tr');
    var curY = y;

    for (var ri = 0; ri < rows.length; ri++) {
        var rowH = pptxEmuToPx(parseInt(rows[ri].getAttribute('h')) || 300000);
        var cells = rows[ri].getElementsByTagName('a:tc');
        var curX = x;
        for (var ci = 0; ci < cells.length; ci++) {
            var cellW = colWidths[ci] || (w / (cells.length || 1));

            var tcPr = cells[ci].getElementsByTagName('a:tcPr')[0];
            if (tcPr) {
                var cellFill = tcPr.getElementsByTagName('a:solidFill')[0];
                if (cellFill) {
                    var cf = pptxParseFillColor(cellFill);
                    if (cf) { c.fillStyle = cf; c.fillRect(curX, curY, cellW, rowH); }
                }
            }

            c.strokeStyle = '#999999';
            c.lineWidth = 0.8;
            c.strokeRect(curX, curY, cellW, rowH);

            var txBody = cells[ci].getElementsByTagName('a:txBody')[0];
            if (txBody) {
                pptxRenderTextBody(c, txBody, { x: curX, y: curY, w: cellW, h: rowH }, null, null);
            }
            curX += cellW;
        }
        curY += rowH;
    }
}

// ==================== Text Rendering ====================

// Resolve default font size from placeholder info in layout
function pptxGetDefaultFontSize(sp, layoutPh) {
    // Check shape's own defRPr
    var txBody = sp ? sp.getElementsByTagName('p:txBody')[0] : null;
    if (txBody) {
        var lstStyle = txBody.getElementsByTagName('a:lstStyle')[0];
        if (lstStyle) {
            var lvl1pPr = lstStyle.getElementsByTagName('a:lvl1pPr')[0];
            if (lvl1pPr) {
                var defRPr = lvl1pPr.getElementsByTagName('a:defRPr')[0];
                if (defRPr) {
                    var sz = parseInt(defRPr.getAttribute('sz'));
                    if (sz) return pptxPtToPx(sz / 100);
                }
            }
        }
    }

    // Check placeholder type for typical sizes
    if (sp) {
        var phInfo = pptxGetPlaceholderInfo(sp);
        if (phInfo) {
            if (phInfo.type === 'title' || phInfo.type === 'ctrTitle') return pptxPtToPx(36);
            if (phInfo.type === 'subTitle') return pptxPtToPx(20);
            if (phInfo.type === 'body' || phInfo.type === 'obj') return pptxPtToPx(18);
            if (phInfo.type === 'dt' || phInfo.type === 'ftr' || phInfo.type === 'sldNum') return pptxPtToPx(10);
        }
    }

    return pptxPtToPx(18);
}

function pptxRenderTextBody(c, txBody, xfrm, sp, layoutPh) {
    if (!txBody || !xfrm) return;

    var bodyPr = txBody.getElementsByTagName('a:bodyPr')[0];
    function attrInt(el, attr, def) {
        if (!el) return def;
        var v = el.getAttribute(attr);
        if (v === null || v === '') return def;
        var n = parseInt(v, 10);
        return isNaN(n) ? def : n;
    }
    var lIns = pptxEmuToPx(attrInt(bodyPr, 'lIns', 91440));
    var tIns = pptxEmuToPx(attrInt(bodyPr, 'tIns', 45720));
    var rIns = pptxEmuToPx(attrInt(bodyPr, 'rIns', 91440));
    var bIns = pptxEmuToPx(attrInt(bodyPr, 'bIns', 45720));
    var anchor = bodyPr ? bodyPr.getAttribute('anchor') : null;

    var textLeft = xfrm.x + lIns;
    var textTop = xfrm.y + tIns;
    var textWidth = xfrm.w - lIns - rIns;
    var textHeight = xfrm.h - tIns - bIns;
    if (textWidth <= 2 || textHeight <= 2) return;

    var defFontSizePx = pptxGetDefaultFontSize(sp, layoutPh);

    // Collect all paragraphs as direct children of txBody
    var paragraphs = [];
    var txChildren = txBody.childNodes;
    for (var ti = 0; ti < txChildren.length; ti++) {
        var tn = txChildren[ti];
        if (tn.nodeType === 1 && (tn.tagName === 'a:p' || tn.nodeName === 'a:p')) {
            paragraphs.push(tn);
        }
    }

    var lines = [];
    var totalH = 0;

    for (var p = 0; p < paragraphs.length; p++) {
        var para = paragraphs[p];
        var pPr = pptxDirectChild(para, 'a:pPr');
        var alignment = pPr ? pPr.getAttribute('algn') : null;

        // Paragraph-level default font size
        var paraDefSize = defFontSizePx;
        if (pPr) {
            var pDefRPr = pPr.getElementsByTagName('a:defRPr')[0];
            if (pDefRPr) {
                var pdsz = parseInt(pDefRPr.getAttribute('sz'));
                if (pdsz) paraDefSize = pptxPtToPx(pdsz / 100);
            }
        }

        // Paragraph spacing
        var spcBef = 0, spcAft = 0;
        if (pPr) {
            var spcBefEl = pPr.getElementsByTagName('a:spcBef')[0];
            if (spcBefEl) {
                var pts = spcBefEl.getElementsByTagName('a:spcPts')[0];
                if (pts) spcBef = pptxPtToPx(parseInt(pts.getAttribute('val') || 0) / 100);
            }
            var spcAftEl = pPr.getElementsByTagName('a:spcAft')[0];
            if (spcAftEl) {
                var pts = spcAftEl.getElementsByTagName('a:spcPts')[0];
                if (pts) spcAft = pptxPtToPx(parseInt(pts.getAttribute('val') || 0) / 100);
            }
        }

        // Collect runs from direct children
        var runData = [];
        var pChildren = para.childNodes;
        for (var ci = 0; ci < pChildren.length; ci++) {
            var node = pChildren[ci];
            if (node.nodeType !== 1) continue;
            var nodeName = node.tagName || node.nodeName;
            if (nodeName === 'a:r') {
                var rPr = pptxDirectChild(node, 'a:rPr');
                var textEl = node.getElementsByTagName('a:t')[0];
                var text = textEl ? (textEl.textContent || '') : '';
                var sz = paraDefSize;
                var bold = false, italic = false;
                var color = null;
                if (rPr) {
                    var szAttr = parseInt(rPr.getAttribute('sz'));
                    if (szAttr) sz = pptxPtToPx(szAttr / 100);
                    bold = rPr.getAttribute('b') === '1';
                    italic = rPr.getAttribute('i') === '1';
                    var runFill = rPr.getElementsByTagName('a:solidFill')[0];
                    if (runFill) color = pptxParseFillColor(runFill);
                }
                if (text) runData.push({ text: text, size: sz, bold: bold, italic: italic, color: color });
            } else if (nodeName === 'a:fld') {
                var fldText = node.getElementsByTagName('a:t')[0];
                if (fldText && fldText.textContent) {
                    runData.push({ text: fldText.textContent, size: paraDefSize, bold: false, italic: false, color: null });
                }
            } else if (nodeName === 'a:br') {
                runData.push({ text: '\n', size: paraDefSize, bold: false, italic: false, color: null });
            }
        }

        // Empty paragraph: small gap
        if (runData.length === 0) {
            totalH += paraDefSize * 0.5;
            lines.push({ runs: [], height: paraDefSize * 0.5, alignment: alignment, spcBef: spcBef, spcAft: spcAft });
            continue;
        }

        // Build lines with per-run formatting, handling wrapping across runs
        totalH += spcBef;
        var curLineRuns = [];
        var curLineW = 0;
        var curLineMaxSz = paraDefSize;
        var isFirstLine = true;

        function flushLine(isFinal) {
            if (curLineRuns.length === 0 && !isFinal) return;
            var lineH = curLineMaxSz * 1.3;
            lines.push({
                runs: curLineRuns,
                height: lineH,
                alignment: alignment,
                spcBef: isFirstLine ? spcBef : 0,
                spcAft: isFinal ? spcAft : 0
            });
            totalH += lineH;
            curLineRuns = [];
            curLineW = 0;
            curLineMaxSz = paraDefSize;
            isFirstLine = false;
        }

        for (var ri = 0; ri < runData.length; ri++) {
            var rd = runData[ri];
            if (rd.text === '\n') { flushLine(ri === runData.length - 1); continue; }
            var rdFont = (rd.italic ? 'italic ' : '') + (rd.bold ? 'bold ' : '') + rd.size + 'px sans-serif';
            c.font = rdFont;
            if (rd.size > curLineMaxSz) curLineMaxSz = rd.size;

            var hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uff00-\uffef]/.test(rd.text);
            var pieces = hasCJK ? rd.text.split('') : rd.text.split(/(\s+)/);
            var buf = '';
            for (var pi = 0; pi < pieces.length; pi++) {
                var piece = pieces[pi];
                if (!piece) continue;
                var testW = c.measureText(buf + piece).width;
                if (curLineW + testW > textWidth && (curLineRuns.length > 0 || buf.length > 0)) {
                    if (buf) curLineRuns.push({ text: buf, size: rd.size, bold: rd.bold, italic: rd.italic, color: rd.color });
                    flushLine(false);
                    if (rd.size > curLineMaxSz) curLineMaxSz = rd.size;
                    c.font = rdFont;
                    buf = hasCJK ? piece : piece.replace(/^\s+/, '');
                } else {
                    buf += piece;
                }
            }
            if (buf) {
                curLineRuns.push({ text: buf, size: rd.size, bold: rd.bold, italic: rd.italic, color: rd.color });
                curLineW += c.measureText(buf).width;
            }
        }
        flushLine(true);
        totalH += spcAft;
    }

    // Vertical alignment
    var yOff = 0;
    if (anchor === 'ctr' || anchor === 'mid') yOff = Math.max(0, (textHeight - totalH) / 2);
    else if (anchor === 'b') yOff = Math.max(0, textHeight - totalH);

    var defaultColor = '#000000';
    var curY = textTop + yOff;
    for (var li = 0; li < lines.length; li++) {
        var line = lines[li];
        curY += line.spcBef || 0;
        if (curY > xfrm.y + xfrm.h) break;
        if (line.runs.length > 0) {
            // Measure total line width for alignment
            var lineWidth = 0;
            for (var rj = 0; rj < line.runs.length; rj++) {
                var rr = line.runs[rj];
                c.font = (rr.italic ? 'italic ' : '') + (rr.bold ? 'bold ' : '') + rr.size + 'px sans-serif';
                lineWidth += c.measureText(rr.text).width;
            }
            var textX = textLeft;
            if (line.alignment === 'ctr') textX = textLeft + (textWidth - lineWidth) / 2;
            else if (line.alignment === 'r') textX = textLeft + textWidth - lineWidth;

            c.textBaseline = 'top';
            for (var rj = 0; rj < line.runs.length; rj++) {
                var run = line.runs[rj];
                c.font = (run.italic ? 'italic ' : '') + (run.bold ? 'bold ' : '') + run.size + 'px sans-serif';
                c.fillStyle = run.color || defaultColor;
                c.fillText(run.text, textX, curY);
                textX += c.measureText(run.text).width;
            }
        }
        curY += line.height + (line.spcAft || 0);
    }
}

function pptxWrapText(c, text, maxWidth) {
    if (!text || maxWidth <= 0) return [text || ''];

    var hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uff00-\uffef]/.test(text);
    var result = [];

    if (hasCJK) {
        var line = '';
        for (var i = 0; i < text.length; i++) {
            var test = line + text[i];
            if (c.measureText(test).width > maxWidth && line.length > 0) {
                result.push(line);
                line = text[i];
            } else {
                line = test;
            }
        }
        if (line) result.push(line);
    } else {
        var words = text.split(/(\s+)/);
        var line = '';
        for (var i = 0; i < words.length; i++) {
            var test = line + words[i];
            if (c.measureText(test).width > maxWidth && line.length > 0) {
                result.push(line.trimEnd());
                line = words[i].trimStart();
            } else {
                line = test;
            }
        }
        if (line.trim()) result.push(line.trim());
    }

    return result.length > 0 ? result : [''];
}

// ==================== Drawing Helpers ====================

function pptxDrawShapePath(c, spPr, xfrm) {
    var prstGeom = spPr.getElementsByTagName('a:prstGeom')[0];
    var prst = prstGeom ? prstGeom.getAttribute('prst') : 'rect';

    c.beginPath();
    switch (prst) {
        case 'ellipse':
            c.ellipse(xfrm.x + xfrm.w / 2, xfrm.y + xfrm.h / 2, xfrm.w / 2, xfrm.h / 2, 0, 0, Math.PI * 2);
            break;
        case 'roundRect':
            pptxRoundRect(c, xfrm.x, xfrm.y, xfrm.w, xfrm.h, Math.min(xfrm.w, xfrm.h) * 0.1);
            break;
        case 'triangle':
        case 'rtTriangle':
            c.moveTo(xfrm.x + xfrm.w / 2, xfrm.y);
            c.lineTo(xfrm.x + xfrm.w, xfrm.y + xfrm.h);
            c.lineTo(xfrm.x, xfrm.y + xfrm.h);
            c.closePath();
            break;
        case 'diamond':
            c.moveTo(xfrm.x + xfrm.w / 2, xfrm.y);
            c.lineTo(xfrm.x + xfrm.w, xfrm.y + xfrm.h / 2);
            c.lineTo(xfrm.x + xfrm.w / 2, xfrm.y + xfrm.h);
            c.lineTo(xfrm.x, xfrm.y + xfrm.h / 2);
            c.closePath();
            break;
        case 'trapezoid':
            c.moveTo(xfrm.x + xfrm.w * 0.2, xfrm.y);
            c.lineTo(xfrm.x + xfrm.w * 0.8, xfrm.y);
            c.lineTo(xfrm.x + xfrm.w, xfrm.y + xfrm.h);
            c.lineTo(xfrm.x, xfrm.y + xfrm.h);
            c.closePath();
            break;
        case 'parallelogram':
            c.moveTo(xfrm.x + xfrm.w * 0.2, xfrm.y);
            c.lineTo(xfrm.x + xfrm.w, xfrm.y);
            c.lineTo(xfrm.x + xfrm.w * 0.8, xfrm.y + xfrm.h);
            c.lineTo(xfrm.x, xfrm.y + xfrm.h);
            c.closePath();
            break;
        case 'hexagon':
            var hx = xfrm.x, hy = xfrm.y, hw = xfrm.w, hh = xfrm.h;
            c.moveTo(hx + hw * 0.25, hy);
            c.lineTo(hx + hw * 0.75, hy);
            c.lineTo(hx + hw, hy + hh / 2);
            c.lineTo(hx + hw * 0.75, hy + hh);
            c.lineTo(hx + hw * 0.25, hy + hh);
            c.lineTo(hx, hy + hh / 2);
            c.closePath();
            break;
        case 'line':
        case 'straightConnector1':
        case 'bentConnector3':
            c.moveTo(xfrm.x, xfrm.y);
            c.lineTo(xfrm.x + xfrm.w, xfrm.y + xfrm.h);
            break;
        default:
            c.rect(xfrm.x, xfrm.y, xfrm.w, xfrm.h);
    }
}

function pptxRoundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
}

function pptxRenderGradient(c, gradFill, x, y, w, h) {
    var gsLst = gradFill.getElementsByTagName('a:gsLst')[0];
    if (!gsLst) return;
    var stops = gsLst.getElementsByTagName('a:gs');
    if (stops.length === 0) return;

    var lin = gradFill.getElementsByTagName('a:lin')[0];
    var angle = lin ? (parseInt(lin.getAttribute('ang')) || 0) / 60000 : 90;
    var rad = angle * Math.PI / 180;
    var cos = Math.cos(rad), sin = Math.sin(rad);
    var x0 = x + w / 2 - cos * w / 2, y0 = y + h / 2 - sin * h / 2;
    var x1 = x + w / 2 + cos * w / 2, y1 = y + h / 2 + sin * h / 2;
    var gradient = c.createLinearGradient(x0, y0, x1, y1);

    for (var i = 0; i < stops.length; i++) {
        var pos = (parseInt(stops[i].getAttribute('pos')) || 0) / 100000;
        var srgb = stops[i].getElementsByTagName('a:srgbClr')[0];
        var schm = stops[i].getElementsByTagName('a:schemeClr')[0];
        var color = '#cccccc';
        if (srgb) color = '#' + srgb.getAttribute('val');
        else if (schm) color = pptxSchemeColorToHex(schm.getAttribute('val'));
        gradient.addColorStop(Math.max(0, Math.min(1, pos)), color);
    }
    c.fillStyle = gradient;
    c.fillRect(x, y, w, h);
}

// ==================== Color Parsing ====================

function pptxParseFillColor(el) {
    if (!el) return null;
    var srgb = el.getElementsByTagName('a:srgbClr')[0];
    if (srgb) {
        var color = '#' + srgb.getAttribute('val');
        var alpha = srgb.getElementsByTagName('a:alpha')[0];
        if (alpha && (parseInt(alpha.getAttribute('val')) || 100000) < 5000) return 'transparent';
        return color;
    }
    var schemeClr = el.getElementsByTagName('a:schemeClr')[0];
    if (schemeClr) {
        var val = schemeClr.getAttribute('val');
        var hex = pptxSchemeColorToHex(val);
        var alpha = schemeClr.getElementsByTagName('a:alpha')[0];
        if (alpha && (parseInt(alpha.getAttribute('val')) || 100000) < 5000) return 'transparent';
        // Handle lumMod/lumOff for lightened/darkened scheme colors
        var lumMod = schemeClr.getElementsByTagName('a:lumMod')[0];
        var lumOff = schemeClr.getElementsByTagName('a:lumOff')[0];
        if (lumMod || lumOff) {
            hex = pptxApplyLuminance(hex,
                lumMod ? parseInt(lumMod.getAttribute('val')) / 1000 : 100,
                lumOff ? parseInt(lumOff.getAttribute('val')) / 1000 : 0);
        }
        return hex;
    }
    var prstClr = el.getElementsByTagName('a:prstClr')[0];
    if (prstClr) {
        var name = prstClr.getAttribute('val') || 'black';
        var presetMap = { 'black': '#000000', 'white': '#ffffff', 'red': '#ff0000', 'green': '#008000', 'blue': '#0000ff', 'yellow': '#ffff00', 'gray': '#808080', 'ltGray': '#c0c0c0', 'dkGray': '#404040' };
        return presetMap[name] || '#000000';
    }
    return null;
}

function pptxApplyLuminance(hex, modPercent, offPercent) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    r = Math.round(Math.min(255, Math.max(0, r * modPercent / 100 + 255 * offPercent / 100)));
    g = Math.round(Math.min(255, Math.max(0, g * modPercent / 100 + 255 * offPercent / 100)));
    b = Math.round(Math.min(255, Math.max(0, b * modPercent / 100 + 255 * offPercent / 100)));
    return '#' + ('0' + r.toString(16)).slice(-2) + ('0' + g.toString(16)).slice(-2) + ('0' + b.toString(16)).slice(-2);
}

function pptxSchemeColorToHex(name) {
    if (pptxDoc && pptxDoc.theme && pptxDoc.theme.colors[name]) {
        return pptxDoc.theme.colors[name];
    }
    var defaults = {
        'bg1': '#ffffff', 'bg2': '#eeeeee', 'tx1': '#000000', 'tx2': '#333333',
        'dk1': '#000000', 'dk2': '#333333', 'lt1': '#ffffff', 'lt2': '#eeeeee',
        'accent1': '#4472c4', 'accent2': '#ed7d31', 'accent3': '#a5a5a5',
        'accent4': '#ffc000', 'accent5': '#5b9bd5', 'accent6': '#70ad47',
        'hlink': '#0563c1', 'folHlink': '#954f72', 'phClr': '#000000'
    };
    return defaults[name] || '#000000';
}

// ==================== Utility ====================

function pptxDirectChild(parent, tagName) {
    var children = parent.childNodes;
    for (var i = 0; i < children.length; i++) {
        var t = children[i].tagName || children[i].nodeName;
        if (t === tagName) return children[i];
    }
    return null;
}

function pptxGetREmbed(blip) {
    return blip.getAttribute('r:embed') ||
        blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
}

function pptxResolveRelPath(target, baseDir) {
    var base = baseDir || 'ppt/slides/';
    var parts = (base + target).split('/');
    var resolved = [];
    for (var i = 0; i < parts.length; i++) {
        if (parts[i] === '..') { if (resolved.length > 0) resolved.pop(); }
        else if (parts[i] !== '.') resolved.push(parts[i]);
    }
    return resolved.join('/');
}

function pptxLoadImage(bytes) {
    return new Promise(function(resolve, reject) {
        var blob = new Blob([bytes]);
        var url = URL.createObjectURL(blob);
        var img = new Image();
        img.onload = function() { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = function() { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
        img.src = url;
    });
}

#!/usr/bin/env node
/**
 * Dev server: serves web/ statically and proxies /system/fonts/* to a remote font CDN,
 * avoiding CORS issues during local development.
 * Usage: npm run dev  or  node scripts/serve-dev.js
 * Default port 8009; override with PORT=8000 node scripts/serve-dev.js
 *
 * Set FONT_ORIGIN env var to point to your font CDN, e.g.:
 *   FONT_ORIGIN=https://your-cdn.example.com node scripts/serve-dev.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = parseInt(process.env.PORT || '8009', 10);
const FONT_ORIGIN = process.env.FONT_ORIGIN || '';
const WEB_DIR = path.resolve(__dirname, '..', 'web');

const MIMES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function sendFile(res, filePath, ext) {
  const stream = fs.createReadStream(filePath);
  const contentType = MIMES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  stream.pipe(res);
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500).end();
  });
}

// TTF: 0x00010000; OTF/CFF: 'OTTO'. 用于校验代理返回的是真实字体而非 HTML/错误页
function isFontBuffer(buf) {
  if (!buf || buf.length < 4) return false;
  const b = new Uint8Array(buf);
  return (
    (b[0] === 0x00 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) ||
    (b[0] === 0x4f && b[1] === 0x54 && b[2] === 0x54 && b[3] === 0x4f)
  );
}

async function proxyFont(res, pathname) {
  if (!FONT_ORIGIN) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('FONT_ORIGIN not configured. Set it via env: FONT_ORIGIN=https://your-cdn.example.com');
    return;
  }
  const target = FONT_ORIGIN + pathname;
  try {
    const r = await fetch(target, {
      headers: {
        Accept: 'application/octet-stream, font/ttf, font/otf, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; epub-xtc-dev-proxy/1.0)',
      },
    });
    if (!r.ok) {
      res.writeHead(r.status).end();
      return;
    }
    const buf = await r.arrayBuffer();
    if (!isFontBuffer(buf)) {
      console.error('Font proxy: invalid font data (not TTF/OTF magic):', pathname);
      res.writeHead(502, { 'Content-Type': 'text/plain' }).end('Invalid font data');
      return;
    }
    const ext = path.extname(pathname);
    const contentType = MIMES[ext] || 'font/ttf';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(Buffer.from(buf));
  } catch (err) {
    console.error('Font proxy error:', pathname, err.message);
    res.writeHead(502).end();
  }
}

const server = http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);
  const pathname = decodeURIComponent(u.pathname);

  if (pathname.startsWith('/system/fonts/')) {
    await proxyFont(res, pathname);
    return;
  }

  let filePath = path.join(WEB_DIR, pathname === '/' ? 'index.html' : pathname);
  filePath = path.normalize(filePath);
  if (!filePath.startsWith(WEB_DIR)) {
    res.writeHead(403).end();
    return;
  }
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (_) {
    res.writeHead(404).end();
    return;
  }
  if (stat.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    if (!fs.existsSync(filePath)) {
      res.writeHead(404).end();
      return;
    }
  }
  const ext = path.extname(filePath);
  sendFile(res, filePath, ext);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Dev server: http://localhost:${PORT}`);
  if (FONT_ORIGIN) {
    console.log(`Font proxy active: /system/fonts/* → ${FONT_ORIGIN}`);
  } else {
    console.log('Font proxy disabled. Set FONT_ORIGIN env var to enable remote font CDN proxy.');
  }
});

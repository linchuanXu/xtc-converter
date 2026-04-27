#!/usr/bin/env node
/**
 * 将 lz4js 打成可在浏览器中通过 window.LZ4 使用的单文件
 * 输出: web/vendor/lz4-bundle.js
 */
const browserify = require('browserify');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const webDir = path.join(rootDir, 'web');
const vendorDir = path.join(webDir, 'vendor');
const entryPath = path.join(vendorDir, 'lz4-bundle-src.js');
const outPath = path.join(vendorDir, 'lz4-bundle.js');

fs.mkdirSync(vendorDir, { recursive: true });

if (!fs.existsSync(entryPath)) {
  fs.writeFileSync(
    entryPath,
    "// Browserify entry: expose lz4js as window.LZ4\nwindow.LZ4 = require('lz4js');\n",
    'utf8'
  );
}

const b = browserify(entryPath, { standalone: undefined });
b.bundle((err, buf) => {
  if (err) {
    console.error('browserify error:', err);
    process.exit(1);
  }
  fs.writeFileSync(outPath, buf);
  console.log('LZ4 bundle written to web/vendor/lz4-bundle.js');
});

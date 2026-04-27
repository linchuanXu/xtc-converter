#!/usr/bin/env node
/**
 * 构建脚本：用 Terser 压缩/混淆 JS，输出到 dist/，并生成引用 app.min.js 的 index.html
 * 方案 1 本地构建：npm run build
 * 方案 2 Docker 构建阶段会执行同一脚本
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const noMinify = process.argv.includes('--no-minify');
const rootDir = path.resolve(__dirname, '..');
const webDir = path.join(rootDir, 'web');
const distDir = path.join(rootDir, 'dist');

// 主应用脚本（顺序必须与 index.html 一致，app.js 最后）
const appScripts = [
  'app.i18n.js', 
  'app.fonts.js',
  'app.pptx.js',
  'app.files.js',
  'app.pdf.js',
  'app.export.js',
  'app.dither.js',
  'app.statusbar.js',
  'app.encoding.js',
  'app.js',
];

function runTerser(inputPath, outputPath) {
  const cmd = noMinify
    ? `npx terser "${inputPath}" -o "${outputPath}"`
    : `npx terser "${inputPath}" -o "${outputPath}" -c -m`;
  execSync(cmd, { stdio: 'inherit', cwd: rootDir });
}

function main() {
  if (!fs.existsSync(webDir)) {
    console.error('web/ 目录不存在');
    process.exit(1);
  }

  fs.mkdirSync(distDir, { recursive: true });

  // 0. 生成 LZ4 浏览器包（XTCZ XTZ4 格式依赖）
  const lz4BundlePath = path.join(webDir, 'vendor', 'lz4-bundle.js');
  if (!fs.existsSync(lz4BundlePath)) {
    try {
      execSync('node scripts/build-lz4.js', { stdio: 'inherit', cwd: rootDir });
    } catch (e) {
      console.warn('LZ4 打包跳过，XTCZ (LZ4) 将不可用');
    }
  }

  // 1. 打包主应用脚本为 app.min.js
  const appMinPath = path.join(distDir, 'app.min.js');
  if (noMinify) {
    const concat = appScripts
      .map((f) => fs.readFileSync(path.join(webDir, f), 'utf8'))
      .join('\n');
    fs.writeFileSync(appMinPath, concat);
  } else {
    const appInputs = appScripts.map((f) => path.join(webDir, f));
    const cmd = `npx terser ${appInputs.map((p) => `"${p}"`).join(' ')} -o "${appMinPath}" -c -m`;
    execSync(cmd, { stdio: 'inherit', cwd: rootDir });
  }

  // 2. 单独压缩 crengine.js、dither-worker.js（需保持独立：Worker 按路径加载）
  for (const name of ['crengine.js', 'dither-worker.js']) {
    const src = path.join(webDir, name);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(distDir, name);
    if (noMinify) {
      fs.copyFileSync(src, dest);
    } else {
      runTerser(src, dest);
    }
  }

  // 2b. 复制 crengine.wasm（CREngine 运行时必需，与 crengine.js 同目录加载）
  const wasmSrc = path.join(webDir, 'crengine.wasm');
  if (fs.existsSync(wasmSrc)) {
    fs.copyFileSync(wasmSrc, path.join(distDir, 'crengine.wasm'));
  } else {
    console.warn('警告: web/crengine.wasm 不存在，部署后 EPUB 渲染将不可用。请将 CREngine 编译产物放入 web/ 后重新构建。');
  }

  // 3. 复制 style.css
  fs.copyFileSync(path.join(webDir, 'style.css'), path.join(distDir, 'style.css'));

  // 3b. 复制 imgs/（含官方默认背景图等静态资源）
  const imgsDir = path.join(webDir, 'imgs');
  if (fs.existsSync(imgsDir)) {
    const distImgs = path.join(distDir, 'imgs');
    fs.mkdirSync(distImgs, { recursive: true });
    for (const name of fs.readdirSync(imgsDir)) {
      const src = path.join(imgsDir, name);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, path.join(distImgs, name));
      }
    }
  }

  // 4. 资源版本号：从 package.json 读取，统一写入 web/index.html 与 dist/index.html
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const resourceVersion = String(pkg.resourceVersion ?? 1);
  const versionSuffix = `?v=${resourceVersion}`;

  const indexPath = path.join(webDir, 'index.html');
  let indexHtml = fs.readFileSync(indexPath, 'utf8');
  // 统一替换所有资源上的 ?v=数字 为当前 resourceVersion（便于缓存失效）
  indexHtml = indexHtml.replace(/\?v=\d+/g, versionSuffix);
  // 为没有版本号的本地资源加上版本号（href="style.css" -> href="style.css?v=10"）
  indexHtml = indexHtml.replace(
    /(href|src)="([^"]+\.(css|js))"/g,
    (m, attr, url, ext) => {
      if (url.startsWith('http')) return m;
      return url.includes('?v=') ? m : `${attr}="${url}${versionSuffix}"`;
    }
  );
  fs.writeFileSync(indexPath, indexHtml);

  // 5. 生成 dist/index.html：把多段 script 换成 crengine.js + vendor/lz4-bundle.js + app.min.js
  const scriptBlock = /(\s*<script src=")crengine\.js(?:\?[^"]*)?("><\/script>)\s*[\s\S]*?<script src="app\.js(?:\?[^"]*)?"><\/script>/;
  const replacement = `$1crengine.js${versionSuffix}$2\n    <script src="vendor/lz4-bundle.js${versionSuffix}"></script>\n    <script src="app.min.js${versionSuffix}"></script>`;
  if (!scriptBlock.test(indexHtml)) {
    console.error('未在 index.html 中找到预期的 script 块');
    process.exit(1);
  }
  indexHtml = indexHtml.replace(scriptBlock, replacement);
  fs.writeFileSync(path.join(distDir, 'index.html'), indexHtml);

  const vendorDir = path.join(webDir, 'vendor');
  const lz4Bundle = path.join(vendorDir, 'lz4-bundle.js');
  if (fs.existsSync(lz4Bundle)) {
    const distVendor = path.join(distDir, 'vendor');
    fs.mkdirSync(distVendor, { recursive: true });
    fs.copyFileSync(lz4Bundle, path.join(distVendor, 'lz4-bundle.js'));
  }

  console.log('构建完成 → dist/');
}

main();

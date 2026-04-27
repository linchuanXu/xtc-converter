#!/usr/bin/env node

/**
 * EPUB to XTC/XTCH CLI Converter
 * Converts EPUB files to Xteink e-reader format
 */

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { minimatch } = require('minimatch');
const { loadSettings, resolveSettings, validateSettings, validateOptimizerSettings, generateDefaultConfig } = require('./settings');
const { convertEpub, convertEpubParallel, getOutputPath, cleanup } = require('./converter');
const { optimizeEpub } = require('./optimizer');

program
    .name('epub-to-xtc')
    .description('Convert EPUB files to XTC/XTCH format for Xteink e-readers')
    .version('1.0.0');

program
    .command('convert <input>')
    .description('Convert EPUB file(s) to XTC/XTCH format')
    .option('-o, --output <path>', 'Output file or directory')
    .option('-c, --config <path>', 'Path to settings JSON file')
    .option('-f, --format <format>', 'Output format: xtc (1-bit) or xtch (2-bit)')
    .option('-j, --jobs <n>', 'Number of parallel workers; default 8, fallback 4 then 1 on failure', '8')
    .option('-p, --prefix <prefix>', 'Filename prefix for output (e.g. "[X3]")')
    .action(async (input, options) => {
        try {
            // Load and resolve settings
            let settings = loadSettings(options.config);
            settings = resolveSettings(settings);

            // Override format if specified
            if (options.format) {
                settings.output.format = options.format;
            }
            // Override prefix if specified
            if (options.prefix !== undefined) {
                settings.output.filenamePrefix = options.prefix;
            }

            const jobs = Math.max(1, parseInt(options.jobs, 10) || 8);

            // Validate settings
            const errors = validateSettings(settings);
            if (errors.length > 0) {
                console.error('Configuration errors:');
                errors.forEach(e => console.error(`  - ${e}`));
                process.exit(1);
            }

            // Resolve input path
            const inputPath = path.resolve(input);

            if (!fs.existsSync(inputPath)) {
                console.error(`Input not found: ${inputPath}`);
                process.exit(1);
            }

            const stat = fs.statSync(inputPath);

            if (stat.isDirectory()) {
                // Convert all EPUBs in directory
                await convertDirectory(inputPath, options.output, settings, jobs);
            } else if (stat.isFile() && inputPath.endsWith('.epub')) {
                // Convert single file
                await convertSingleFile(inputPath, options.output, settings, jobs);
            } else {
                console.error('Input must be an EPUB file or directory containing EPUB files');
                process.exit(1);
            }

        } catch (err) {
            console.error(`Error: ${err.message}`);
            process.exit(1);
        } finally {
            cleanup();
        }
    });

program
    .command('init')
    .description('Generate default settings.json file')
    .option('-o, --output <path>', 'Output path', 'settings.json')
    .action((options) => {
        const outputPath = path.resolve(options.output);

        if (fs.existsSync(outputPath)) {
            console.error(`File already exists: ${outputPath}`);
            process.exit(1);
        }

        fs.writeFileSync(outputPath, generateDefaultConfig());
        console.log(`Created default settings file: ${outputPath}`);
        console.log('\nImportant: Edit the file to set font.path to your TTF/OTF font file.');
    });

program
    .command('optimize <input>')
    .description('Optimize EPUB file(s) for e-paper devices')
    .option('-o, --output <path>', 'Output file or directory')
    .option('-c, --config <path>', 'Path to settings JSON file')
    .action(async (input, options) => {
        try {
            const settings = loadSettings(options.config);
            const opts = settings.optimizer || {};

            const errors = validateOptimizerSettings(settings);
            if (errors.length > 0) {
                console.error('Configuration errors:');
                errors.forEach(e => console.error(`  - ${e}`));
                process.exit(1);
            }

            const inputPath = path.resolve(input);

            if (!fs.existsSync(inputPath)) {
                console.error(`Input not found: ${inputPath}`);
                process.exit(1);
            }

            const stat = fs.statSync(inputPath);

            if (stat.isDirectory()) {
                await optimizeDirectory(inputPath, options.output, opts);
            } else if (stat.isFile() && inputPath.endsWith('.epub')) {
                await optimizeSingleFile(inputPath, options.output, opts);
            } else {
                console.error('Input must be an EPUB file or directory containing EPUB files');
                process.exit(1);
            }

        } catch (err) {
            console.error(`Error: ${err.message}`);
            process.exit(1);
        }
    });

function formatSize(bytes) {
    return (bytes / 1024).toFixed(1) + ' KB';
}

async function optimizeSingleFile(inputPath, outputPath, opts) {
    if (!outputPath) {
        const dir = path.dirname(inputPath);
        const ext = path.extname(inputPath);
        const base = path.basename(inputPath, ext);
        outputPath = path.join(dir, `${base}_optimized${ext}`);
    } else if (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
        outputPath = path.join(outputPath, path.basename(inputPath));
    } else {
        outputPath = path.resolve(outputPath);
    }

    const filename = path.basename(inputPath);
    console.log(`Optimizing: ${filename}`);

    const result = await optimizeEpub(inputPath, outputPath, opts);

    console.log(`  Output: ${result.outputPath}`);
    console.log(`  Size: ${formatSize(result.originalSize)} -> ${formatSize(result.optimizedSize)} (${result.reductionPercent}% reduction)`);
}

/**
 * Collect EPUB files from a directory, optionally recursive
 */
function collectEpubFiles(dir, opts, basedir) {
    basedir = basedir || dir;
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const include = opts.include || '*.epub';
    const exclude = opts.exclude || null;

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(basedir, fullPath);

        if (entry.isDirectory() && opts.recursive) {
            results = results.concat(collectEpubFiles(fullPath, opts, basedir));
        } else if (entry.isFile()) {
            if (!minimatch(entry.name, include)) continue;
            if (exclude && minimatch(entry.name, exclude)) continue;
            results.push({ absolute: fullPath, relative: relPath });
        }
    }

    return results;
}

async function optimizeDirectory(inputDir, outputDir, opts) {
    const files = collectEpubFiles(inputDir, opts, inputDir);

    if (files.length === 0) {
        console.error('No EPUB files found in directory');
        process.exit(1);
    }

    const inPlace = !outputDir;
    if (!outputDir) {
        outputDir = inputDir;
    } else {
        outputDir = path.resolve(outputDir);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
    }

    console.log(`Optimizing ${files.length} EPUB file(s)...\n`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Preserve relative directory structure in output
        let outputPath;
        if (inPlace) {
            // Add _optimized suffix to avoid overwriting originals
            const ext = path.extname(file.relative);
            const base = file.relative.slice(0, -ext.length);
            outputPath = path.join(outputDir, `${base}_optimized${ext}`);
        } else {
            outputPath = path.join(outputDir, file.relative);
        }

        console.log(`[${i + 1}/${files.length}] ${file.relative}`);

        try {
            const result = await optimizeEpub(file.absolute, outputPath, opts);

            console.log(`  Output: ${path.basename(result.outputPath)}`);
            console.log(`  Size: ${formatSize(result.originalSize)} -> ${formatSize(result.optimizedSize)} (${result.reductionPercent}% reduction)\n`);
            successCount++;

        } catch (err) {
            console.log(`  Error: ${err.message}\n`);
            failCount++;
        }
    }

    console.log(`\nOptimization complete: ${successCount} succeeded, ${failCount} failed`);
}

/** Build job attempt sequence: try jobs, then 4, then 1 on failure (capped by CPU count) */
function getJobAttempts(jobs) {
    const cpus = os.cpus().length;
    const first = Math.min(Math.max(1, jobs), cpus);
    const attempts = [first];
    if (first > 4) attempts.push(4);
    if (first > 1) attempts.push(1);
    return attempts;
}

async function convertSingleFile(inputPath, outputPath, settings, jobs = 8) {
    // Determine output path
    const prefix = settings.output.filenamePrefix || '';
    if (!outputPath) {
        const dir = path.dirname(inputPath);
        outputPath = getOutputPath(inputPath, dir, settings.output.format, prefix);
    } else if (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
        outputPath = getOutputPath(inputPath, outputPath, settings.output.format, prefix);
    } else {
        outputPath = path.resolve(outputPath);
    }

    const filename = path.basename(inputPath);
    console.log(`Converting: ${filename}`);

    const attempts = getJobAttempts(jobs);
    const progressCb = (current, total) => {
        const percent = Math.round((current / total) * 100);
        process.stdout.write(`\r  Progress: ${current}/${total} pages (${percent}%)`);
    };

    let result;
    let lastErr;
    for (const j of attempts) {
        try {
            if (j === 1) {
                if (attempts.indexOf(1) < attempts.length - 1) {
                    console.log(`  Retrying with 1 worker...`);
                }
                result = await convertEpub(inputPath, outputPath, settings, progressCb);
            } else {
                if (attempts.indexOf(j) > 0) {
                    console.log(`  Retrying with ${j} workers...`);
                } else if (j > 1) {
                    console.log(`  Using ${j} workers`);
                }
                result = await convertEpubParallel(inputPath, outputPath, settings, j, progressCb);
            }
            lastErr = null;
            break;
        } catch (err) {
            lastErr = err;
            if (j === 1) break;
            console.log(`  ${j} workers failed: ${err.message}`);
        }
    }

    if (lastErr) {
        throw lastErr;
    }

    console.log(`\n  Output: ${result.outputPath}`);
    console.log(`  Pages: ${result.pageCount}`);
    console.log(`  Format: ${result.format.toUpperCase()}`);
}

async function convertDirectory(inputDir, outputDir, settings, jobs = 8) {
    // Find all EPUB files
    const files = fs.readdirSync(inputDir)
        .filter(f => f.endsWith('.epub'))
        .map(f => path.join(inputDir, f));

    if (files.length === 0) {
        console.error('No EPUB files found in directory');
        process.exit(1);
    }

    // Determine output directory
    if (!outputDir) {
        outputDir = inputDir;
    } else {
        outputDir = path.resolve(outputDir);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
    }

    console.log(`Converting ${files.length} EPUB file(s)...\n`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
        const inputPath = files[i];
        const filename = path.basename(inputPath);
        const prefix = settings.output.filenamePrefix || '';
        const outputPath = getOutputPath(inputPath, outputDir, settings.output.format, prefix);

        console.log(`[${i + 1}/${files.length}] ${filename}`);

        try {
            const attempts = getJobAttempts(jobs);
            const progressCb = (cur, total) => {
                const percent = Math.round((cur / total) * 100);
                process.stdout.write(`\r  Progress: ${cur}/${total} pages (${percent}%)`);
            };
            let result;
            let lastErr;
            for (const j of attempts) {
                try {
                    if (j === 1) {
                        if (attempts.indexOf(1) < attempts.length - 1) {
                            console.log(`  Retrying with 1 worker...`);
                        }
                        result = await convertEpub(inputPath, outputPath, settings, progressCb);
                    } else {
                        if (attempts.indexOf(j) > 0) {
                            console.log(`  Retrying with ${j} workers...`);
                        }
                        result = await convertEpubParallel(inputPath, outputPath, settings, j, progressCb);
                    }
                    lastErr = null;
                    break;
                } catch (err) {
                    lastErr = err;
                    if (j === 1) break;
                    console.log(`  ${j} workers failed: ${err.message}`);
                }
            }
            if (lastErr) throw lastErr;

            console.log(`\n  Output: ${path.basename(result.outputPath)}`);
            console.log(`  Pages: ${result.pageCount}\n`);
            successCount++;

        } catch (err) {
            console.log(`\n  Error: ${err.message}\n`);
            failCount++;
        }
    }

    console.log(`\nConversion complete: ${successCount} succeeded, ${failCount} failed`);
}

program.parse();

#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DEFAULT_FRONTEND_URL =
    'https://github.com/sub-store-org/Sub-Store-Front-End/releases/latest/download/dist.zip';
const OUTPUT_DIR = path.join(__dirname, 'dist', 'frontend');
const META_FILE = '.frontend-meta.json';
const ASSETS_IGNORE_FILE = '.assetsignore';

const DEFAULT_CF_HEADERS = `/chunks/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: public, max-age=0, must-revalidate

/sw.js
  Cache-Control: public, max-age=0, must-revalidate

/registerSW.js
  Cache-Control: public, max-age=0, must-revalidate
`;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

function isTruthy(value) {
    return /^(1|true|yes)$/i.test(String(value || '').trim());
}

function resolveFrontendSource() {
    const localDir = (process.env.SUB_STORE_FRONTEND_DIR || '').trim();
    if (localDir) {
        return {
            type: 'dir',
            value: path.resolve(localDir),
        };
    }

    const customUrl = (process.env.SUB_STORE_FRONTEND_URL || '').trim();
    if (customUrl) {
        return {
            type: 'url',
            value: customUrl,
        };
    }

    const version = (process.env.SUB_STORE_FRONTEND_VERSION || '').trim();
    if (version) {
        const tag = encodeURIComponent(version);
        return {
            type: 'url',
            value: `https://github.com/sub-store-org/Sub-Store-Front-End/releases/download/${tag}/dist.zip`,
        };
    }

    return {
        type: 'url',
        value: DEFAULT_FRONTEND_URL,
    };
}

function readExistingMeta(outputDir) {
    const metaPath = path.join(outputDir, META_FILE);
    if (!fs.existsSync(metaPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
        return null;
    }
}

function isCIEnvironment() {
    return (
        isTruthy(process.env.CI) ||
        isTruthy(process.env.WORKERS_CI) ||
        isTruthy(process.env.CF_PAGES)
    );
}

function findEocdOffset(buffer) {
    const minOffset = Math.max(0, buffer.length - 65557);
    for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
        if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
            return offset;
        }
    }
    throw new Error('Invalid ZIP archive: End of Central Directory not found');
}

/**
 * Parse a standard ZIP archive (Store / Deflate) using only Node.js built-ins.
 * Returns an array of { name, isDirectory, data }.
 */
function parseZipEntries(buffer) {
    const eocdOffset = findEocdOffset(buffer);
    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

    const entries = [];
    let offset = centralDirOffset;

    for (let i = 0; i < totalEntries; i++) {
        if (buffer.readUInt32LE(offset) !== CENTRAL_DIR_SIGNATURE) {
            throw new Error(
                `Invalid ZIP archive: unexpected central directory header at ${offset}`,
            );
        }

        const compressionMethod = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const fileNameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);

        const rawName = buffer
            .subarray(offset + 46, offset + 46 + fileNameLength)
            .toString('utf8')
            .replace(/\\/g, '/');

        offset += 46 + fileNameLength + extraLength + commentLength;

        if (!rawName || rawName.startsWith('__MACOSX/')) {
            continue;
        }

        const isDirectory = rawName.endsWith('/');
        if (isDirectory) {
            entries.push({ name: rawName, isDirectory: true, data: null });
            continue;
        }

        if (buffer.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
            throw new Error(
                `Invalid ZIP archive: unexpected local file header for ${rawName}`,
            );
        }

        const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
        const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
        const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
        const compressedData = buffer.subarray(
            dataStart,
            dataStart + compressedSize,
        );

        let data;
        if (compressionMethod === 0) {
            data = compressedData;
        } else if (compressionMethod === 8) {
            data = zlib.inflateRawSync(compressedData);
        } else {
            throw new Error(
                `Unsupported ZIP compression method (${compressionMethod}) for ${rawName}`,
            );
        }

        entries.push({ name: rawName, isDirectory: false, data });
    }

    return entries;
}

function detectCommonRootPrefix(entries) {
    const files = entries.filter((entry) => !entry.isDirectory);
    if (files.length === 0) return '';

    const firstSlash = files[0].name.indexOf('/');
    if (firstSlash === -1) return '';

    const candidatePrefix = files[0].name.slice(0, firstSlash + 1);
    const allMatch = files.every((entry) =>
        entry.name.startsWith(candidatePrefix),
    );
    return allMatch ? candidatePrefix : '';
}

function assertSafeTargetPath(rootDir, relativePath) {
    const resolvedRoot = path.resolve(rootDir);
    const resolvedTarget = path.resolve(resolvedRoot, relativePath);
    if (
        resolvedTarget !== resolvedRoot &&
        !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
    ) {
        throw new Error(`Unsafe path in frontend archive: ${relativePath}`);
    }
    return resolvedTarget;
}

function extractZipToDir(buffer, outputDir) {
    const entries = parseZipEntries(buffer);
    const rootPrefix = detectCommonRootPrefix(entries);

    const fileEntries = entries
        .filter((entry) => !entry.isDirectory)
        .map((entry) => ({
            relativePath: rootPrefix
                ? entry.name.slice(rootPrefix.length)
                : entry.name,
            data: entry.data,
        }))
        .filter((entry) => entry.relativePath && !entry.relativePath.endsWith('/'));

    const allPaths = new Set(fileEntries.map((entry) => entry.relativePath));

    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });

    let writtenFiles = 0;
    let skippedGzipFiles = 0;

    for (const entry of fileEntries) {
        // Cloudflare Workers Static Assets compresses responses on the fly (Brotli/Gzip)
        // and does not use .gz sidecar files; skip redundant .gz counterparts.
        if (
            entry.relativePath.endsWith('.gz') &&
            allPaths.has(entry.relativePath.slice(0, -3))
        ) {
            skippedGzipFiles += 1;
            continue;
        }

        const targetPath = assertSafeTargetPath(outputDir, entry.relativePath);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, entry.data);
        writtenFiles += 1;
    }

    return { writtenFiles, skippedGzipFiles };
}

function copyLocalFrontendDir(sourceDir, outputDir) {
    if (!fs.existsSync(path.join(sourceDir, 'index.html'))) {
        throw new Error(
            `SUB_STORE_FRONTEND_DIR does not contain index.html: ${sourceDir}`,
        );
    }

    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.cpSync(sourceDir, outputDir, { recursive: true });
}

function finalizeOutputDir(outputDir, source) {
    const indexPath = path.join(outputDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
        throw new Error(
            `Frontend assets are missing index.html after preparation: ${outputDir}`,
        );
    }

    const headersPath = path.join(outputDir, '_headers');
    if (!fs.existsSync(headersPath)) {
        fs.writeFileSync(headersPath, DEFAULT_CF_HEADERS, 'utf8');
    }

    const assetsIgnorePath = path.join(outputDir, ASSETS_IGNORE_FILE);
    const ignoreLines = new Set(
        fs.existsSync(assetsIgnorePath)
            ? fs
                  .readFileSync(assetsIgnorePath, 'utf8')
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean)
            : [],
    );
    ignoreLines.add(META_FILE);
    fs.writeFileSync(
        assetsIgnorePath,
        `${Array.from(ignoreLines).join('\n')}\n`,
        'utf8',
    );

    fs.writeFileSync(
        path.join(outputDir, META_FILE),
        JSON.stringify(
            {
                source,
                fetchedAt: new Date().toISOString(),
            },
            null,
            2,
        ),
        'utf8',
    );
}

function prepareEmptyOutputDir(outputDir) {
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });
}

async function fetchFrontend({
    ifMissing = false,
    optIn = false,
    outputDir = OUTPUT_DIR,
} = {}) {
    if (isTruthy(process.env.SUB_STORE_CF_SKIP_FRONTEND)) {
        prepareEmptyOutputDir(outputDir);
        console.log(
            'Skipping frontend preparation (SUB_STORE_CF_SKIP_FRONTEND is set).',
        );
        return;
    }

    if (optIn && !isTruthy(process.env.SUB_STORE_CF_FRONTEND)) {
        prepareEmptyOutputDir(outputDir);
        console.log(
            'Frontend deployment disabled (set build env SUB_STORE_CF_FRONTEND=true to bundle frontend at "/").',
        );
        return;
    }

    const source = resolveFrontendSource();
    const indexExists = fs.existsSync(path.join(outputDir, 'index.html'));

    if (ifMissing && indexExists && !isCIEnvironment()) {
        const existingMeta = readExistingMeta(outputDir);
        if (
            existingMeta?.source?.type === source.type &&
            existingMeta?.source?.value === source.value
        ) {
            console.log(
                `Using cached frontend assets in ${outputDir} (run "pnpm run fetch:frontend" to refresh).`,
            );
            return;
        }
    }

    if (source.type === 'dir') {
        console.log(`Copying frontend assets from ${source.value}...`);
        copyLocalFrontendDir(source.value, outputDir);
        finalizeOutputDir(outputDir, source);
        console.log(`Prepared frontend assets in ${outputDir}`);
        return;
    }

    console.log(`Downloading Sub-Store frontend from ${source.value}...`);
    const response = await fetch(source.value, { redirect: 'follow' });
    if (!response.ok) {
        throw new Error(
            `Failed to download frontend (${response.status} ${response.statusText}) from ${source.value}`,
        );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { writtenFiles, skippedGzipFiles } = extractZipToDir(
        buffer,
        outputDir,
    );
    finalizeOutputDir(outputDir, source);

    const sizeKB = (buffer.length / 1024).toFixed(1);
    console.log(
        `Prepared frontend assets in ${outputDir} (${writtenFiles} files extracted from ${sizeKB} KB archive, ${skippedGzipFiles} redundant .gz files skipped).`,
    );
}

if (require.main === module) {
    const args = new Set(process.argv.slice(2));
    const ifMissing = args.has('--if-missing') && !args.has('--force');
    const optIn = args.has('--opt-in');

    fetchFrontend({ ifMissing, optIn }).catch((err) => {
        console.error(err?.stack || err);
        process.exitCode = 1;
    });
}

module.exports = {
    extractZipToDir,
    fetchFrontend,
    parseZipEntries,
    prepareEmptyOutputDir,
    resolveFrontendSource,
};

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSizeToBytes = parseSizeToBytes;
exports.parseNextBundleReport = parseNextBundleReport;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Parses a size string (e.g. "7.16 KB", "2.56 KB") to bytes.
 */
function parseSizeToBytes(sizeStr) {
    if (!sizeStr || typeof sizeStr !== 'string')
        return 0;
    const trimmed = sizeStr.trim();
    if (!trimmed)
        return 0;
    const match = trimmed.match(/^([\d.]+)\s*([KMGT]?B?)$/i);
    if (!match)
        return 0;
    const value = parseFloat(match[1]);
    const unit = (match[2] || 'b').toUpperCase();
    const multipliers = {
        B: 1,
        KB: 1024,
        MB: 1024 * 1024,
        GB: 1024 * 1024 * 1024,
    };
    const mult = multipliers[unit] ?? multipliers[unit.replace('B', '')] ?? 1;
    return Math.round(value * mult);
}
/**
 * Converts a raw chunk to normalized BundleChunk.
 */
function toBundleChunk(raw, source) {
    const chunk = {
        label: raw.label,
        parsedSize: parseSizeToBytes(raw.parsedSize ?? raw.statSize),
        source,
    };
    const gzip = parseSizeToBytes(raw.gzipSize);
    if (gzip > 0)
        chunk.gzipSize = gzip;
    if (raw.chunkNames?.length)
        chunk.chunkNames = raw.chunkNames;
    return chunk;
}
/**
 * Derives source (client/edge/nodejs) from filename.
 * Next.js @next/bundle-analyzer outputs: client.json, edge.json, nodejs.json
 */
function getSourceFromFilename(filename) {
    const base = path.basename(filename, path.extname(filename));
    const lower = base.toLowerCase();
    if (lower === 'client' || lower === 'edge' || lower === 'nodejs')
        return lower;
    return undefined;
}
/**
 * Parses Next.js bundle analyzer JSON from a directory.
 * Expects files like client.json, edge.json, nodejs.json (or any *.json).
 * Merges all chunks with source field from filename.
 */
function parseNextBundleReport(dirPath) {
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        throw new Error(`Bundle report directory not found: ${dirPath}`);
    }
    const files = fs.readdirSync(resolved).filter((f) => f.endsWith('.json'));
    const chunks = [];
    for (const file of files) {
        const filePath = path.join(resolved, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const source = getSourceFromFilename(file);
        let data;
        try {
            data = JSON.parse(content);
        }
        catch {
            continue; // skip invalid JSON
        }
        const arr = Array.isArray(data) ? data : [data];
        for (const raw of arr) {
            if (raw?.label) {
                chunks.push(toBundleChunk(raw, source));
            }
        }
    }
    return {
        version: 1,
        ecosystem: 'next',
        createdAt: new Date().toISOString(),
        chunks,
        meta: { fileCount: files.length },
    };
}

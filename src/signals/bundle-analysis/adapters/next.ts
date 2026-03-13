import * as fs from 'fs';
import * as path from 'path';
import type { BundleChunk, BundleReport } from '../types';

/**
 * Raw chunk from webpack-bundle-analyzer JSON output.
 * Sizes are formatted strings (e.g. "7.16 KB").
 */
interface RawChunk {
  label: string;
  parsedSize?: string;
  gzipSize?: string;
  statSize?: string;
  chunkNames?: string[];
}

/**
 * Parses a size string (e.g. "7.16 KB", "2.56 KB") to bytes.
 */
export function parseSizeToBytes(sizeStr: string | undefined): number {
  if (!sizeStr || typeof sizeStr !== 'string') return 0;
  const trimmed = sizeStr.trim();
  if (!trimmed) return 0;

  const match = trimmed.match(/^([\d.]+)\s*([KMGT]?B?)$/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'b').toUpperCase();

  const multipliers: Record<string, number> = {
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
function toBundleChunk(raw: RawChunk, source?: string): BundleChunk {
  const chunk: BundleChunk = {
    label: raw.label,
    parsedSize: parseSizeToBytes(raw.parsedSize ?? raw.statSize),
    source,
  };
  const gzip = parseSizeToBytes(raw.gzipSize);
  if (gzip > 0) chunk.gzipSize = gzip;
  if (raw.chunkNames?.length) chunk.chunkNames = raw.chunkNames;
  return chunk;
}

/**
 * Derives source (client/edge/nodejs) from filename.
 * Next.js @next/bundle-analyzer outputs: client.json, edge.json, nodejs.json
 */
function getSourceFromFilename(filename: string): string | undefined {
  const base = path.basename(filename, path.extname(filename));
  const lower = base.toLowerCase();
  if (lower === 'client' || lower === 'edge' || lower === 'nodejs') return lower;
  return undefined;
}

/**
 * Parses Next.js bundle analyzer JSON from a directory.
 * Expects files like client.json, edge.json, nodejs.json (or any *.json).
 * Merges all chunks with source field from filename.
 */
export function parseNextBundleReport(dirPath: string): BundleReport {
  const resolved = path.resolve(dirPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Bundle report directory not found: ${dirPath}`);
  }

  const files = fs.readdirSync(resolved).filter((f) => f.endsWith('.json'));
  const chunks: BundleChunk[] = [];

  for (const file of files) {
    const filePath = path.join(resolved, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const source = getSourceFromFilename(file);

    let data: RawChunk[] | RawChunk;
    try {
      data = JSON.parse(content);
    } catch {
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

/**
 * Normalized bundle schema — ecosystem-agnostic.
 * Each adapter (Next.js, Vite, webpack) produces this from its native output.
 */

export interface BundleChunk {
  label: string;
  parsedSize: number; // bytes (for accurate diff math)
  gzipSize?: number;
  chunkNames?: string[];
  source?: string; // "client" | "edge" | "nodejs" (Next.js) or "main" (Vite)
}

export interface BundleReport {
  version: 1;
  ecosystem: 'next' | 'vite' | 'webpack';
  createdAt: string; // ISO timestamp
  chunks: BundleChunk[];
  meta?: Record<string, unknown>;
}

export type DiffChangeType = 'added' | 'removed' | 'changed';

export interface DiffRow {
  label: string;
  changeType: DiffChangeType;
  deltaBytes: number;
  newSizeBytes: number;
  oldSizeBytes?: number; // only for 'changed'
  source?: string;
}

export interface BundleDiffResult {
  hasChanges: boolean;
  rows: DiffRow[];
  netDeltaBytes: number;
  data?: Record<string, unknown>;
  noChangesComment?: string;
}

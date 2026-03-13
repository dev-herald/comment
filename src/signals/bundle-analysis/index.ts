import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import type { ActionInputs } from '../../types';
import { parseNextBundleReport } from './adapters/next';
import { computeDiff } from './diff';

export interface BundleAnalysisSignalResult {
  hasChanges: boolean;
  skip?: boolean; // true = baseline missing, do not post
  data?: Record<string, unknown>;
  noChangesComment?: string;
}

/**
 * Checks if a directory exists and contains at least one JSON file.
 */
function hasBundleReport(dirPath: string): boolean {
  try {
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return false;
    const files = fs.readdirSync(resolved).filter((f) => f.endsWith('.json'));
    return files.length > 0;
  } catch {
    return false;
  }
}

/**
 * Runs the BUNDLE_ANALYSIS signal: loads baseline + current reports, diffs, returns CUSTOM_TABLE data.
 */
export async function runBundleAnalysisSignal(inputs: ActionInputs): Promise<BundleAnalysisSignalResult> {
  const reportPath = (inputs.bundleReportPath ?? '').trim();
  const baselinePath = (inputs.bundleBaselinePath ?? '').trim();
  const baselineBranch = (inputs.bundleBaselineBranch ?? 'main').trim() || 'main';
  const maxChanges = Math.max(1, parseInt(inputs.maxChanges ?? '25', 10) || 25);
  const showGzip = (inputs.showGzip ?? 'false').toLowerCase() === 'true';

  if (!reportPath || !baselinePath) {
    throw new Error(
      '❌ BUNDLE_ANALYSIS requires "bundle-report-path" and "bundle-baseline-path"\n\n' +
      '💡 Example:\n' +
      '  with:\n' +
      '    signal: "BUNDLE_ANALYSIS"\n' +
      '    bundle-report-path: ".next/analyze/"\n' +
      '    bundle-baseline-path: "baseline/"'
    );
  }

  if (!hasBundleReport(baselinePath)) {
    core.info(
      `No baseline found on ${baselineBranch}. Once the analysis on ${baselineBranch} has run you'll see something.`
    );
    return { hasChanges: false, skip: true };
  }

  if (!hasBundleReport(reportPath)) {
    throw new Error(
      `❌ No bundle report found at "${reportPath}". Ensure ANALYZE=true build ran and produced JSON files.`
    );
  }

  core.info('📂 Loading bundle reports...');
  const baseline = parseNextBundleReport(baselinePath);
  const current = parseNextBundleReport(reportPath);

  core.info(`📋 Baseline: ${baseline.chunks.length} chunks, Current: ${current.chunks.length} chunks`);

  const result = computeDiff(baseline, current, {
    maxChanges,
    showGzip,
  });

  if (result.hasChanges) {
    core.info(`📊 Found ${result.rows.length} bundle change(s)`);
    return {
      hasChanges: true,
      data: result.data,
    };
  }

  return {
    hasChanges: false,
    noChangesComment: result.noChangesComment!,
  };
}

import path from 'path';
import type { ParsedTestResults, TestSuite } from './types';

// ============================================================================
// Vitest / Jest JSON Reporter Types
// Vitest's --reporter=json outputs the Jest-compatible JSON format.
// ============================================================================

interface VitestAssertionResult {
  ancestorTitles: string[];
  fullName: string;
  /** 'pending' and 'todo' are treated as skipped */
  status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo';
  title: string;
  duration: number | null;
  failureMessages: string[];
}

interface VitestTestResult {
  assertionResults: VitestAssertionResult[];
  startTime: number;
  endTime: number;
  status: 'passed' | 'failed';
  message: string;
  /** Vitest v4+ uses `name`; older versions used `testFilePath` */
  name?: string;
  testFilePath?: string;
}

export interface VitestReport {
  numTotalTestSuites: number;
  numPassedTestSuites: number;
  numFailedTestSuites: number;
  numPendingTestSuites: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  startTime: number;
  success: boolean;
  testResults: VitestTestResult[];
}

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

function buildSummary(
  totalPassed: number,
  totalFailed: number,
  totalSkipped: number,
  suiteCount: number
): string {
  const parts: string[] = [];

  if (totalFailed > 0) parts.push(`${totalFailed} failed`);
  if (totalPassed > 0) parts.push(`${totalPassed} passed`);
  if (totalSkipped > 0) parts.push(`${totalSkipped} skipped`);

  if (parts.length === 0) return 'No tests ran';

  const suiteWord = suiteCount === 1 ? 'suite' : 'suites';
  return `${parts.join(', ')} across ${suiteCount} ${suiteWord}`;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Checks whether a plain object looks like Vitest (or Jest) JSON reporter output.
 * Identified by the presence of a `testResults` array and a numeric `numTotalTests`.
 */
export function isVitestReport(raw: unknown): raw is VitestReport {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return Array.isArray(r.testResults) && typeof r.numTotalTests === 'number';
}

/**
 * Parses Vitest (or Jest) JSON reporter output into the canonical ParsedTestResults shape.
 *
 * @param raw - Parsed JSON object from a `--reporter=json` output file.
 */
export function parseVitestReport(raw: VitestReport): ParsedTestResults {
  const testSuites: TestSuite[] = [];

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const fileResult of raw.testResults) {
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const assertion of fileResult.assertionResults) {
      switch (assertion.status) {
        case 'passed':
          passed++;
          break;
        case 'failed':
          failed++;
          break;
        case 'skipped':
        case 'pending':
        case 'todo':
          skipped++;
          break;
      }
    }

    totalPassed += passed;
    totalFailed += failed;
    totalSkipped += skipped;

    const durationMs = fileResult.endTime - fileResult.startTime;

    const filePath = fileResult.name ?? fileResult.testFilePath ?? 'Unknown Suite';

    const suite: TestSuite = {
      name: path.basename(filePath),
      passed,
      failed,
    };

    if (skipped > 0) {
      suite.skipped = skipped;
    }

    if (durationMs > 0) {
      suite.duration = formatDuration(durationMs);
    }

    testSuites.push(suite);
  }

  const summary = buildSummary(totalPassed, totalFailed, totalSkipped, testSuites.length);

  return {
    summary,
    testSuites,
    showTimestamp: true,
  };
}

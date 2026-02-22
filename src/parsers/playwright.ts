import type { ParsedTestResults, TestSuite } from './types';

// ============================================================================
// Playwright JSON Reporter Types
// Based on @playwright/test JSONReport shape
// ============================================================================

interface PlaywrightTestResult {
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
  retry: number;
}

interface PlaywrightTest {
  /** Overall resolved status after retries */
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  results: PlaywrightTestResult[];
}

interface PlaywrightSpec {
  title: string;
  ok: boolean;
  tests: PlaywrightTest[];
}

interface PlaywrightSuite {
  title: string;
  file?: string;
  specs: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

export interface PlaywrightReport {
  config?: unknown;
  suites: PlaywrightSuite[];
  errors?: unknown[];
}

// ============================================================================
// Helpers
// ============================================================================

interface SuiteCounts {
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

/**
 * Recursively walks a suite tree and accumulates counts.
 */
function accumulateSuite(suite: PlaywrightSuite, counts: SuiteCounts): void {
  for (const spec of suite.specs) {
    for (const test of spec.tests) {
      switch (test.status) {
        case 'expected':
          counts.passed++;
          break;
        case 'unexpected':
          counts.failed++;
          break;
        case 'flaky':
          // Flaky tests ultimately passed after retries but are worth highlighting.
          // Count as passed for the summary; callers can extend this if needed.
          counts.passed++;
          break;
        case 'skipped':
          counts.skipped++;
          break;
      }
      // Take the last result's duration (the one that actually counts after retries)
      const lastResult = test.results[test.results.length - 1];
      if (lastResult) {
        counts.durationMs += lastResult.duration;
      }
    }
  }

  for (const child of suite.suites ?? []) {
    accumulateSuite(child, counts);
  }
}

/**
 * Formats a duration in ms to a human-readable string (e.g. "1.2s", "45ms").
 */
function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

/**
 * Builds a plain-English summary line from overall totals.
 */
function buildSummary(totalPassed: number, totalFailed: number, totalSkipped: number, suiteCount: number): string {
  const parts: string[] = [];

  if (totalFailed > 0) {
    parts.push(`${totalFailed} failed`);
  }
  if (totalPassed > 0) {
    parts.push(`${totalPassed} passed`);
  }
  if (totalSkipped > 0) {
    parts.push(`${totalSkipped} skipped`);
  }

  if (parts.length === 0) {
    return 'No tests ran';
  }

  const suiteWord = suiteCount === 1 ? 'suite' : 'suites';
  return `${parts.join(', ')} across ${suiteCount} ${suiteWord}`;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Checks whether a plain object looks like Playwright JSON reporter output.
 */
export function isPlaywrightReport(raw: unknown): raw is PlaywrightReport {
  if (typeof raw !== 'object' || raw === null) return false;
  return Array.isArray((raw as Record<string, unknown>).suites);
}

/**
 * Parses Playwright JSON reporter output into the canonical ParsedTestResults shape.
 *
 * @param raw - Parsed JSON object from a Playwright `--reporter=json` output file.
 */
export function parsePlaywrightReport(raw: PlaywrightReport): ParsedTestResults {
  const testSuites: TestSuite[] = [];

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const topSuite of raw.suites) {
    const counts: SuiteCounts = { passed: 0, failed: 0, skipped: 0, durationMs: 0 };
    accumulateSuite(topSuite, counts);

    totalPassed += counts.passed;
    totalFailed += counts.failed;
    totalSkipped += counts.skipped;

    const suite: TestSuite = {
      name: topSuite.title || topSuite.file || 'Unknown Suite',
      passed: counts.passed,
      failed: counts.failed,
    };

    if (counts.skipped > 0) {
      suite.skipped = counts.skipped;
    }

    if (counts.durationMs > 0) {
      suite.duration = formatDuration(counts.durationMs);
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

import type { ParsedTestResults } from '../parsers/types';

export interface TestResultsSignalResult {
  hasResults: boolean;
  data?: Record<string, unknown>;
  noResultsComment?: string;
}

/**
 * Converts ParsedTestResults into CUSTOM_TABLE template data.
 * Used by the TEST_RESULTS signal to post test results without
 * relying on the deprecated TEST_RESULTS API template.
 */
export function runTestResultsSignal(parsed: ParsedTestResults): TestResultsSignalResult {
  if (parsed.testSuites.length === 0) {
    return {
      hasResults: false,
      noResultsComment:
        `## \uD83E\uDDEA Test Results\n\n` +
        `No test suites found in the provided result files.`,
    };
  }

  const data = {
    title: `\uD83E\uDDEA Test Results`,
    headers: ['Suite', 'Passed', 'Failed', 'Skipped', 'Duration'],
    rows: parsed.testSuites.map((suite) => ({
      cells: [
        { text: suite.name, ...(suite.link ? { link: suite.link } : {}) },
        { text: String(suite.passed) },
        { text: String(suite.failed) },
        { text: String(suite.skipped ?? 0) },
        { text: suite.duration ?? '\u2014' },
      ],
    })),
    showTimestamp: parsed.showTimestamp,
  };

  return { hasResults: true, data };
}

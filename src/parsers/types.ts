/**
 * Shared output types for all test result parsers.
 * These map directly to the TEST_RESULTS template data shape.
 */

export interface TestSuite {
  name: string;
  passed: number;
  failed: number;
  skipped?: number;
  duration?: string;
  link?: string;
}

export interface ParsedTestResults {
  summary: string;
  testSuites: TestSuite[];
  totalLink?: string;
  showTimestamp: boolean;
}

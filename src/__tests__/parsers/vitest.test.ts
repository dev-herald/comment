import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parseVitestReport, isVitestReport } from '../../parsers/vitest';
import { parseResultFile, parseResultFiles } from '../../parsers/index';

const FIXTURES_DIR = path.join(__dirname, '../test-data/vitest');

function loadFixture(name: string): unknown {
  const content = readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
  return JSON.parse(content);
}

// ============================================================================
// isVitestReport
// ============================================================================

describe('isVitestReport', () => {
  it('returns true for valid Vitest JSON output', () => {
    const raw = loadFixture('all-passing.json');
    expect(isVitestReport(raw)).toBe(true);
  });

  it('returns false for non-Vitest JSON', () => {
    expect(isVitestReport({ suites: [] })).toBe(false);
    expect(isVitestReport({ results: [] })).toBe(false);
    expect(isVitestReport(null)).toBe(false);
    expect(isVitestReport('string')).toBe(false);
    expect(isVitestReport(42)).toBe(false);
  });

  it('returns false for an object with testResults but no numTotalTests', () => {
    expect(isVitestReport({ testResults: [] })).toBe(false);
  });
});

// ============================================================================
// parseVitestReport — all-passing fixture
// ============================================================================

describe('parseVitestReport — all-passing fixture', () => {
  const raw = loadFixture('all-passing.json');

  it('fixture is recognized as Vitest format', () => {
    expect(isVitestReport(raw)).toBe(true);
  });

  it('produces one TestSuite per test file', () => {
    const result = parseVitestReport(raw as any);
    expect(result.testSuites).toHaveLength(1);
  });

  it('suite name is the basename of the test file', () => {
    const result = parseVitestReport(raw as any);
    expect(result.testSuites[0].name).toBe('vitest.all-passing.test.ts');
  });

  it('counts 7 passed tests', () => {
    const result = parseVitestReport(raw as any);
    expect(result.testSuites[0].passed).toBe(7);
  });

  it('counts 0 failed tests', () => {
    const result = parseVitestReport(raw as any);
    expect(result.testSuites[0].failed).toBe(0);
  });

  it('counts 1 skipped test', () => {
    const result = parseVitestReport(raw as any);
    expect(result.testSuites[0].skipped).toBe(1);
  });

  it('includes a duration string', () => {
    const result = parseVitestReport(raw as any);
    expect(result.testSuites[0].duration).toMatch(/^\d+(\.\d+)?(ms|s)$/);
  });

  it('summary mentions passed count and no failures', () => {
    const result = parseVitestReport(raw as any);
    expect(result.summary).toContain('7 passed');
    expect(result.summary).not.toContain('failed');
  });

  it('summary mentions suite count', () => {
    const result = parseVitestReport(raw as any);
    expect(result.summary).toContain('1 suite');
  });

  it('sets showTimestamp to true', () => {
    const result = parseVitestReport(raw as any);
    expect(result.showTimestamp).toBe(true);
  });
});

// ============================================================================
// parseVitestReport — with-failures fixture
// ============================================================================

describe('parseVitestReport — with-failures fixture', () => {
  const raw = loadFixture('with-failures.json');

  it('counts 5 passed tests', () => {
    const result = parseVitestReport(raw as any);
    expect(result.testSuites[0].passed).toBe(5);
  });

  it('counts 2 failed tests', () => {
    const result = parseVitestReport(raw as any);
    expect(result.testSuites[0].failed).toBe(2);
  });

  it('counts 1 skipped test', () => {
    const result = parseVitestReport(raw as any);
    expect(result.testSuites[0].skipped).toBe(1);
  });

  it('summary leads with failed count when there are failures', () => {
    const result = parseVitestReport(raw as any);
    expect(result.summary).toMatch(/^2 failed/);
  });

  it('summary includes passed count', () => {
    const result = parseVitestReport(raw as any);
    expect(result.summary).toContain('5 passed');
  });

  it('summary includes skipped count', () => {
    const result = parseVitestReport(raw as any);
    expect(result.summary).toContain('1 skipped');
  });
});

// ============================================================================
// parseVitestReport — empty fixture
// ============================================================================

describe('parseVitestReport — empty fixture', () => {
  const raw = { numTotalTestSuites: 0, numPassedTestSuites: 0, numFailedTestSuites: 0,
    numPendingTestSuites: 0, numTotalTests: 0, numPassedTests: 0, numFailedTests: 0,
    numPendingTests: 0, startTime: 0, success: true, testResults: [] };

  it('returns zero testSuites', () => {
    const result = parseVitestReport(raw);
    expect(result.testSuites).toHaveLength(0);
  });

  it('summary says no tests ran', () => {
    const result = parseVitestReport(raw);
    expect(result.summary).toBe('No tests ran');
  });
});

// ============================================================================
// parseResultFile — integration (reads file from disk)
// ============================================================================

describe('parseResultFile — vitest fixtures', () => {
  it('parses all-passing.json successfully', async () => {
    const result = await parseResultFile(path.join(FIXTURES_DIR, 'all-passing.json'));
    expect(result.testSuites).toHaveLength(1);
    expect(result.testSuites[0].passed).toBe(7);
  });

  it('parses with-failures.json successfully', async () => {
    const result = await parseResultFile(path.join(FIXTURES_DIR, 'with-failures.json'));
    expect(result.testSuites[0].failed).toBe(2);
  });
});

// ============================================================================
// parseResultFiles — merge (playwright + vitest)
// ============================================================================

describe('parseResultFiles — merging multiple result files', () => {
  const playwrightFixturesDir = path.join(__dirname, '../test-data/playwright');

  it('merges suites from two different format files', async () => {
    const result = await parseResultFiles([
      path.join(playwrightFixturesDir, 'all-passing.json'),
      path.join(FIXTURES_DIR, 'all-passing.json'),
    ]);
    expect(result.testSuites).toHaveLength(2);
  });

  it('merged summary reflects combined totals', async () => {
    const result = await parseResultFiles([
      path.join(playwrightFixturesDir, 'all-passing.json'),
      path.join(FIXTURES_DIR, 'all-passing.json'),
    ]);
    // Both fixtures: 7 passed + 1 skipped each = 14 passed, 2 skipped
    expect(result.summary).toContain('14 passed');
    expect(result.summary).toContain('2 suites');
  });

  it('single file returns result directly without wrapping', async () => {
    const result = await parseResultFiles([path.join(FIXTURES_DIR, 'all-passing.json')]);
    expect(result.testSuites).toHaveLength(1);
  });
});

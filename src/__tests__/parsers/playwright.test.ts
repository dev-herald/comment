import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parsePlaywrightReport, isPlaywrightReport } from '../../parsers/playwright';
import { parseResultFile } from '../../parsers/index';

const FIXTURES_DIR = path.join(__dirname, '../test-data/playwright');

function loadFixture(name: string): unknown {
  const content = readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
  return JSON.parse(content);
}

// ============================================================================
// isPlaywrightReport
// ============================================================================

describe('isPlaywrightReport', () => {
  it('returns true for valid Playwright JSON output', () => {
    const raw = loadFixture('all-passing.json');
    expect(isPlaywrightReport(raw)).toBe(true);
  });

  it('returns false for non-Playwright JSON', () => {
    expect(isPlaywrightReport({ results: [] })).toBe(false);
    expect(isPlaywrightReport({ tests: [] })).toBe(false);
    expect(isPlaywrightReport(null)).toBe(false);
    expect(isPlaywrightReport('string')).toBe(false);
    expect(isPlaywrightReport(42)).toBe(false);
  });
});

// ============================================================================
// parsePlaywrightReport — all-passing fixture
// ============================================================================

describe('parsePlaywrightReport — all-passing fixture', () => {
  const raw = loadFixture('all-passing.json');

  it('fixture is recognized as Playwright format', () => {
    expect(isPlaywrightReport(raw)).toBe(true);
  });

  it('produces one TestSuite per top-level file', () => {
    const result = parsePlaywrightReport(raw as any);
    // all-passing.spec.ts = one file = one suite
    expect(result.testSuites).toHaveLength(1);
  });

  it('suite name matches the file name', () => {
    const result = parsePlaywrightReport(raw as any);
    expect(result.testSuites[0].name).toBe('all-passing.spec.ts');
  });

  it('counts 7 passed tests', () => {
    const result = parsePlaywrightReport(raw as any);
    expect(result.testSuites[0].passed).toBe(7);
  });

  it('counts 0 failed tests', () => {
    const result = parsePlaywrightReport(raw as any);
    expect(result.testSuites[0].failed).toBe(0);
  });

  it('counts 1 skipped test', () => {
    const result = parsePlaywrightReport(raw as any);
    expect(result.testSuites[0].skipped).toBe(1);
  });

  it('includes a duration string', () => {
    const result = parsePlaywrightReport(raw as any);
    expect(result.testSuites[0].duration).toMatch(/^\d+(\.\d+)?(ms|s)$/);
  });

  it('summary mentions passed count and no failures', () => {
    const result = parsePlaywrightReport(raw as any);
    expect(result.summary).toContain('7 passed');
    expect(result.summary).not.toContain('failed');
  });

  it('summary mentions suite count', () => {
    const result = parsePlaywrightReport(raw as any);
    expect(result.summary).toContain('1 suite');
  });

  it('sets showTimestamp to true', () => {
    const result = parsePlaywrightReport(raw as any);
    expect(result.showTimestamp).toBe(true);
  });
});

// ============================================================================
// parsePlaywrightReport — with-failures fixture
// ============================================================================

describe('parsePlaywrightReport — with-failures fixture', () => {
  const raw = loadFixture('with-failures.json');

  it('counts 5 passed tests', () => {
    const result = parsePlaywrightReport(raw as any);
    expect(result.testSuites[0].passed).toBe(5);
  });

  it('counts 2 failed tests', () => {
    const result = parsePlaywrightReport(raw as any);
    expect(result.testSuites[0].failed).toBe(2);
  });

  it('counts 1 skipped test', () => {
    const result = parsePlaywrightReport(raw as any);
    expect(result.testSuites[0].skipped).toBe(1);
  });

  it('summary leads with failed count when there are failures', () => {
    const result = parsePlaywrightReport(raw as any);
    expect(result.summary).toMatch(/^2 failed/);
  });

  it('summary includes passed count', () => {
    const result = parsePlaywrightReport(raw as any);
    expect(result.summary).toContain('5 passed');
  });

  it('summary includes skipped count', () => {
    const result = parsePlaywrightReport(raw as any);
    expect(result.summary).toContain('1 skipped');
  });
});

// ============================================================================
// parsePlaywrightReport — empty fixture
// ============================================================================

describe('parsePlaywrightReport — empty fixture', () => {
  const raw = loadFixture('empty.json');

  it('returns zero testSuites', () => {
    const result = parsePlaywrightReport(raw as any);
    expect(result.testSuites).toHaveLength(0);
  });

  it('summary says no tests ran', () => {
    const result = parsePlaywrightReport(raw as any);
    expect(result.summary).toBe('No tests ran');
  });
});

// ============================================================================
// parseResultFile — integration (reads file from disk)
// ============================================================================

describe('parseResultFile', () => {
  it('parses all-passing.json successfully', async () => {
    const result = await parseResultFile(path.join(FIXTURES_DIR, 'all-passing.json'));
    expect(result.testSuites).toHaveLength(1);
    expect(result.testSuites[0].passed).toBe(7);
  });

  it('parses with-failures.json successfully', async () => {
    const result = await parseResultFile(path.join(FIXTURES_DIR, 'with-failures.json'));
    expect(result.testSuites[0].failed).toBe(2);
  });

  it('throws a descriptive error for a missing file', async () => {
    await expect(
      parseResultFile('/nonexistent/path/results.json')
    ).rejects.toThrow('Result file not found');
  });

  it('throws a descriptive error for unrecognized format', async () => {
    const tmpPath = path.join(FIXTURES_DIR, '_unknown-format.json');
    const { writeFileSync, unlinkSync } = await import('fs');
    writeFileSync(tmpPath, JSON.stringify({ results: { tests: [] } }));
    try {
      await expect(parseResultFile(tmpPath)).rejects.toThrow('Unrecognized test result format');
    } finally {
      unlinkSync(tmpPath);
    }
  });
});

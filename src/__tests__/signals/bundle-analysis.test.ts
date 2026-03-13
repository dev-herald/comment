import { describe, it, expect } from 'vitest';
import path from 'path';
import {
  parseSizeToBytes,
  parseNextBundleReport,
} from '../../signals/bundle-analysis/adapters/next';
import { computeDiff, formatBytes, formatDelta } from '../../signals/bundle-analysis/diff';
import { runBundleAnalysisSignal } from '../../signals/bundle-analysis';

const FIXTURES_DIR = path.join(__dirname, '../test-data/bundle-analysis');

describe('parseSizeToBytes', () => {
  it('parses KB correctly', () => {
    expect(parseSizeToBytes('7.16 KB')).toBe(7332);
    expect(parseSizeToBytes('45.2 KB')).toBe(46285);
  });

  it('parses MB correctly', () => {
    expect(parseSizeToBytes('1.5 MB')).toBe(1572864);
  });

  it('parses bytes correctly', () => {
    expect(parseSizeToBytes('1024 B')).toBe(1024);
  });

  it('returns 0 for empty or invalid', () => {
    expect(parseSizeToBytes('')).toBe(0);
    expect(parseSizeToBytes(undefined as unknown as string)).toBe(0);
    expect(parseSizeToBytes('invalid')).toBe(0);
  });
});

describe('parseNextBundleReport', () => {
  it('parses directory with JSON files', () => {
    const report = parseNextBundleReport(path.join(FIXTURES_DIR, 'baseline'));
    expect(report.version).toBe(1);
    expect(report.ecosystem).toBe('next');
    expect(report.chunks.length).toBe(3);
    expect(report.chunks[0].label).toBe('pages/_app.js');
    expect(report.chunks[0].parsedSize).toBe(45056); // 44 KB
    expect(report.chunks[0].source).toBe('client');
  });

  it('throws when directory does not exist', () => {
    expect(() => parseNextBundleReport('/nonexistent/path')).toThrow('not found');
  });
});

describe('computeDiff', () => {
  it('detects added, removed, and changed chunks', () => {
    const baseline = parseNextBundleReport(path.join(FIXTURES_DIR, 'baseline'));
    const current = parseNextBundleReport(path.join(FIXTURES_DIR, 'current'));
    const result = computeDiff(baseline, current, { maxChanges: 25, showGzip: false });

    expect(result.hasChanges).toBe(true);
    expect(result.rows.length).toBe(3); // added, removed, changed

    const added = result.rows.find((r) => r.changeType === 'added');
    expect(added?.label).toBe('pages/new-feature.js');
    expect(added?.deltaBytes).toBe(8499); // ~8.3 KB

    const removed = result.rows.find((r) => r.changeType === 'removed');
    expect(removed?.label).toBe('pages/old-page.js');
    expect(removed?.deltaBytes).toBe(-5120); // -5 KB

    const changed = result.rows.find((r) => r.changeType === 'changed');
    expect(changed?.label).toBe('pages/_app.js');
    expect(changed?.deltaBytes).toBe(1229); // 45.2 - 44 KB
  });

  it('returns noChangesComment when no diff', () => {
    const baseline = parseNextBundleReport(path.join(FIXTURES_DIR, 'baseline'));
    const result = computeDiff(baseline, baseline, { maxChanges: 25, showGzip: false });

    expect(result.hasChanges).toBe(false);
    expect(result.noChangesComment).toContain('No bundle size changes');
  });
});

describe('formatBytes', () => {
  it('formats bytes correctly', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(45056)).toBe('44.0 KB');
    expect(formatBytes(-2048)).toBe('-2.0 KB');
  });
});

describe('formatDelta', () => {
  it('adds + for positive', () => {
    expect(formatDelta(1024)).toBe('+1.0 KB');
  });
  it('no + for negative', () => {
    expect(formatDelta(-1024)).toBe('-1.0 KB');
  });
});

describe('runBundleAnalysisSignal', () => {
  const makeInputs = (overrides: Record<string, string> = {}) => ({
    apiKey: 'test',
    prNumber: 1,
    comment: '',
    template: '',
    templateData: '',
    testResults: '',
    stickyId: '',
    apiUrl: 'https://dev-herald.com/api/v1/github',
    signal: 'BUNDLE_ANALYSIS',
    include: '',
    enableCve: '',
    maxDeps: '',
    bundleReportPath: path.join(FIXTURES_DIR, 'current'),
    bundleBaselinePath: path.join(FIXTURES_DIR, 'baseline'),
    bundleBaselineBranch: 'main',
    maxChanges: '25',
    showGzip: 'false',
    ...overrides,
  });

  it('returns hasChanges and data when diff exists', async () => {
    const result = await runBundleAnalysisSignal(makeInputs() as any);
    expect(result.skip).toBeUndefined();
    expect(result.hasChanges).toBe(true);
    expect(result.data).toBeDefined();
    const data = result.data as { title?: string; rows?: unknown[] };
    expect(data?.title).toContain('Bundle size');
    expect(data?.rows?.length ?? 0).toBeGreaterThan(0);
  });

  it('throws when bundle-report-path and bundle-baseline-path are missing', async () => {
    await expect(
      runBundleAnalysisSignal(makeInputs({ bundleReportPath: '', bundleBaselinePath: '' }) as any)
    ).rejects.toThrow('bundle-report-path');
  });

  it('returns skip when baseline is empty', async () => {
    const result = await runBundleAnalysisSignal(
      makeInputs({ bundleBaselinePath: '/nonexistent/empty' }) as any
    );
    expect(result.skip).toBe(true);
    expect(result.hasChanges).toBe(false);
  });
});

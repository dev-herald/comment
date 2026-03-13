"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const path_1 = __importDefault(require("path"));
const next_1 = require("../../signals/bundle-analysis/adapters/next");
const diff_1 = require("../../signals/bundle-analysis/diff");
const bundle_analysis_1 = require("../../signals/bundle-analysis");
const FIXTURES_DIR = path_1.default.join(__dirname, '../test-data/bundle-analysis');
(0, vitest_1.describe)('parseSizeToBytes', () => {
    (0, vitest_1.it)('parses KB correctly', () => {
        (0, vitest_1.expect)((0, next_1.parseSizeToBytes)('7.16 KB')).toBe(7332);
        (0, vitest_1.expect)((0, next_1.parseSizeToBytes)('45.2 KB')).toBe(46285);
    });
    (0, vitest_1.it)('parses MB correctly', () => {
        (0, vitest_1.expect)((0, next_1.parseSizeToBytes)('1.5 MB')).toBe(1572864);
    });
    (0, vitest_1.it)('parses bytes correctly', () => {
        (0, vitest_1.expect)((0, next_1.parseSizeToBytes)('1024 B')).toBe(1024);
    });
    (0, vitest_1.it)('returns 0 for empty or invalid', () => {
        (0, vitest_1.expect)((0, next_1.parseSizeToBytes)('')).toBe(0);
        (0, vitest_1.expect)((0, next_1.parseSizeToBytes)(undefined)).toBe(0);
        (0, vitest_1.expect)((0, next_1.parseSizeToBytes)('invalid')).toBe(0);
    });
});
(0, vitest_1.describe)('parseNextBundleReport', () => {
    (0, vitest_1.it)('parses directory with JSON files', () => {
        const report = (0, next_1.parseNextBundleReport)(path_1.default.join(FIXTURES_DIR, 'baseline'));
        (0, vitest_1.expect)(report.version).toBe(1);
        (0, vitest_1.expect)(report.ecosystem).toBe('next');
        (0, vitest_1.expect)(report.chunks.length).toBe(3);
        (0, vitest_1.expect)(report.chunks[0].label).toBe('pages/_app.js');
        (0, vitest_1.expect)(report.chunks[0].parsedSize).toBe(45056); // 44 KB
        (0, vitest_1.expect)(report.chunks[0].source).toBe('client');
    });
    (0, vitest_1.it)('throws when directory does not exist', () => {
        (0, vitest_1.expect)(() => (0, next_1.parseNextBundleReport)('/nonexistent/path')).toThrow('not found');
    });
});
(0, vitest_1.describe)('computeDiff', () => {
    (0, vitest_1.it)('detects added, removed, and changed chunks', () => {
        const baseline = (0, next_1.parseNextBundleReport)(path_1.default.join(FIXTURES_DIR, 'baseline'));
        const current = (0, next_1.parseNextBundleReport)(path_1.default.join(FIXTURES_DIR, 'current'));
        const result = (0, diff_1.computeDiff)(baseline, current, { maxChanges: 25, showGzip: false });
        (0, vitest_1.expect)(result.hasChanges).toBe(true);
        (0, vitest_1.expect)(result.rows.length).toBe(3); // added, removed, changed
        const added = result.rows.find((r) => r.changeType === 'added');
        (0, vitest_1.expect)(added?.label).toBe('pages/new-feature.js');
        (0, vitest_1.expect)(added?.deltaBytes).toBe(8499); // ~8.3 KB
        const removed = result.rows.find((r) => r.changeType === 'removed');
        (0, vitest_1.expect)(removed?.label).toBe('pages/old-page.js');
        (0, vitest_1.expect)(removed?.deltaBytes).toBe(-5120); // -5 KB
        const changed = result.rows.find((r) => r.changeType === 'changed');
        (0, vitest_1.expect)(changed?.label).toBe('pages/_app.js');
        (0, vitest_1.expect)(changed?.deltaBytes).toBe(1229); // 45.2 - 44 KB
    });
    (0, vitest_1.it)('returns noChangesComment when no diff', () => {
        const baseline = (0, next_1.parseNextBundleReport)(path_1.default.join(FIXTURES_DIR, 'baseline'));
        const result = (0, diff_1.computeDiff)(baseline, baseline, { maxChanges: 25, showGzip: false });
        (0, vitest_1.expect)(result.hasChanges).toBe(false);
        (0, vitest_1.expect)(result.noChangesComment).toContain('No bundle size changes');
    });
});
(0, vitest_1.describe)('formatBytes', () => {
    (0, vitest_1.it)('formats bytes correctly', () => {
        (0, vitest_1.expect)((0, diff_1.formatBytes)(1024)).toBe('1.0 KB');
        (0, vitest_1.expect)((0, diff_1.formatBytes)(45056)).toBe('44.0 KB');
        (0, vitest_1.expect)((0, diff_1.formatBytes)(-2048)).toBe('-2.0 KB');
    });
});
(0, vitest_1.describe)('formatDelta', () => {
    (0, vitest_1.it)('adds + for positive', () => {
        (0, vitest_1.expect)((0, diff_1.formatDelta)(1024)).toBe('+1.0 KB');
    });
    (0, vitest_1.it)('no + for negative', () => {
        (0, vitest_1.expect)((0, diff_1.formatDelta)(-1024)).toBe('-1.0 KB');
    });
});
(0, vitest_1.describe)('runBundleAnalysisSignal', () => {
    const makeInputs = (overrides = {}) => ({
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
        bundleReportPath: path_1.default.join(FIXTURES_DIR, 'current'),
        bundleBaselinePath: path_1.default.join(FIXTURES_DIR, 'baseline'),
        bundleBaselineBranch: 'main',
        maxChanges: '25',
        showGzip: 'false',
        ...overrides,
    });
    (0, vitest_1.it)('returns hasChanges and data when diff exists', async () => {
        const result = await (0, bundle_analysis_1.runBundleAnalysisSignal)(makeInputs());
        (0, vitest_1.expect)(result.skip).toBeUndefined();
        (0, vitest_1.expect)(result.hasChanges).toBe(true);
        (0, vitest_1.expect)(result.data).toBeDefined();
        const data = result.data;
        (0, vitest_1.expect)(data?.title).toContain('Bundle size');
        (0, vitest_1.expect)(data?.rows?.length ?? 0).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('throws when bundle-report-path and bundle-baseline-path are missing', async () => {
        await (0, vitest_1.expect)((0, bundle_analysis_1.runBundleAnalysisSignal)(makeInputs({ bundleReportPath: '', bundleBaselinePath: '' }))).rejects.toThrow('bundle-report-path');
    });
    (0, vitest_1.it)('returns skip when baseline is empty', async () => {
        const result = await (0, bundle_analysis_1.runBundleAnalysisSignal)(makeInputs({ bundleBaselinePath: '/nonexistent/empty' }));
        (0, vitest_1.expect)(result.skip).toBe(true);
        (0, vitest_1.expect)(result.hasChanges).toBe(false);
    });
});

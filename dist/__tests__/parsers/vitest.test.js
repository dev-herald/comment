"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const vitest_2 = require("../../parsers/vitest");
const index_1 = require("../../parsers/index");
const FIXTURES_DIR = path_1.default.join(__dirname, '../test-data/vitest');
function loadFixture(name) {
    const content = (0, fs_1.readFileSync)(path_1.default.join(FIXTURES_DIR, name), 'utf-8');
    return JSON.parse(content);
}
// ============================================================================
// isVitestReport
// ============================================================================
(0, vitest_1.describe)('isVitestReport', () => {
    (0, vitest_1.it)('returns true for valid Vitest JSON output', () => {
        const raw = loadFixture('all-passing.json');
        (0, vitest_1.expect)((0, vitest_2.isVitestReport)(raw)).toBe(true);
    });
    (0, vitest_1.it)('returns false for non-Vitest JSON', () => {
        (0, vitest_1.expect)((0, vitest_2.isVitestReport)({ suites: [] })).toBe(false);
        (0, vitest_1.expect)((0, vitest_2.isVitestReport)({ results: [] })).toBe(false);
        (0, vitest_1.expect)((0, vitest_2.isVitestReport)(null)).toBe(false);
        (0, vitest_1.expect)((0, vitest_2.isVitestReport)('string')).toBe(false);
        (0, vitest_1.expect)((0, vitest_2.isVitestReport)(42)).toBe(false);
    });
    (0, vitest_1.it)('returns false for an object with testResults but no numTotalTests', () => {
        (0, vitest_1.expect)((0, vitest_2.isVitestReport)({ testResults: [] })).toBe(false);
    });
});
// ============================================================================
// parseVitestReport — all-passing fixture
// ============================================================================
(0, vitest_1.describe)('parseVitestReport — all-passing fixture', () => {
    const raw = loadFixture('all-passing.json');
    (0, vitest_1.it)('fixture is recognized as Vitest format', () => {
        (0, vitest_1.expect)((0, vitest_2.isVitestReport)(raw)).toBe(true);
    });
    (0, vitest_1.it)('produces one TestSuite per test file', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.testSuites).toHaveLength(1);
    });
    (0, vitest_1.it)('suite name is the basename of the test file', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.testSuites[0].name).toBe('vitest.all-passing.test.ts');
    });
    (0, vitest_1.it)('counts 7 passed tests', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.testSuites[0].passed).toBe(7);
    });
    (0, vitest_1.it)('counts 0 failed tests', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.testSuites[0].failed).toBe(0);
    });
    (0, vitest_1.it)('counts 1 skipped test', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.testSuites[0].skipped).toBe(1);
    });
    (0, vitest_1.it)('includes a duration string', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.testSuites[0].duration).toMatch(/^\d+(\.\d+)?(ms|s)$/);
    });
    (0, vitest_1.it)('summary mentions passed count and no failures', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.summary).toContain('7 passed');
        (0, vitest_1.expect)(result.summary).not.toContain('failed');
    });
    (0, vitest_1.it)('summary mentions suite count', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.summary).toContain('1 suite');
    });
    (0, vitest_1.it)('sets showTimestamp to true', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.showTimestamp).toBe(true);
    });
});
// ============================================================================
// parseVitestReport — with-failures fixture
// ============================================================================
(0, vitest_1.describe)('parseVitestReport — with-failures fixture', () => {
    const raw = loadFixture('with-failures.json');
    (0, vitest_1.it)('counts 5 passed tests', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.testSuites[0].passed).toBe(5);
    });
    (0, vitest_1.it)('counts 2 failed tests', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.testSuites[0].failed).toBe(2);
    });
    (0, vitest_1.it)('counts 1 skipped test', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.testSuites[0].skipped).toBe(1);
    });
    (0, vitest_1.it)('summary leads with failed count when there are failures', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.summary).toMatch(/^2 failed/);
    });
    (0, vitest_1.it)('summary includes passed count', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.summary).toContain('5 passed');
    });
    (0, vitest_1.it)('summary includes skipped count', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.summary).toContain('1 skipped');
    });
});
// ============================================================================
// parseVitestReport — empty fixture
// ============================================================================
(0, vitest_1.describe)('parseVitestReport — empty fixture', () => {
    const raw = { numTotalTestSuites: 0, numPassedTestSuites: 0, numFailedTestSuites: 0,
        numPendingTestSuites: 0, numTotalTests: 0, numPassedTests: 0, numFailedTests: 0,
        numPendingTests: 0, startTime: 0, success: true, testResults: [] };
    (0, vitest_1.it)('returns zero testSuites', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.testSuites).toHaveLength(0);
    });
    (0, vitest_1.it)('summary says no tests ran', () => {
        const result = (0, vitest_2.parseVitestReport)(raw);
        (0, vitest_1.expect)(result.summary).toBe('No tests ran');
    });
});
// ============================================================================
// parseResultFile — integration (reads file from disk)
// ============================================================================
(0, vitest_1.describe)('parseResultFile — vitest fixtures', () => {
    (0, vitest_1.it)('parses all-passing.json successfully', async () => {
        const result = await (0, index_1.parseResultFile)(path_1.default.join(FIXTURES_DIR, 'all-passing.json'));
        (0, vitest_1.expect)(result.testSuites).toHaveLength(1);
        (0, vitest_1.expect)(result.testSuites[0].passed).toBe(7);
    });
    (0, vitest_1.it)('parses with-failures.json successfully', async () => {
        const result = await (0, index_1.parseResultFile)(path_1.default.join(FIXTURES_DIR, 'with-failures.json'));
        (0, vitest_1.expect)(result.testSuites[0].failed).toBe(2);
    });
});
// ============================================================================
// parseResultFiles — merge (playwright + vitest)
// ============================================================================
(0, vitest_1.describe)('parseResultFiles — merging multiple result files', () => {
    const playwrightFixturesDir = path_1.default.join(__dirname, '../test-data/playwright');
    (0, vitest_1.it)('merges suites from two different format files', async () => {
        const result = await (0, index_1.parseResultFiles)([
            path_1.default.join(playwrightFixturesDir, 'all-passing.json'),
            path_1.default.join(FIXTURES_DIR, 'all-passing.json'),
        ]);
        (0, vitest_1.expect)(result.testSuites).toHaveLength(2);
    });
    (0, vitest_1.it)('merged summary reflects combined totals', async () => {
        const result = await (0, index_1.parseResultFiles)([
            path_1.default.join(playwrightFixturesDir, 'all-passing.json'),
            path_1.default.join(FIXTURES_DIR, 'all-passing.json'),
        ]);
        // Both fixtures: 7 passed + 1 skipped each = 14 passed, 2 skipped
        (0, vitest_1.expect)(result.summary).toContain('14 passed');
        (0, vitest_1.expect)(result.summary).toContain('2 suites');
    });
    (0, vitest_1.it)('single file returns result directly without wrapping', async () => {
        const result = await (0, index_1.parseResultFiles)([path_1.default.join(FIXTURES_DIR, 'all-passing.json')]);
        (0, vitest_1.expect)(result.testSuites).toHaveLength(1);
    });
});

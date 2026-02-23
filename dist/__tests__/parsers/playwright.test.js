"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const playwright_1 = require("../../parsers/playwright");
const index_1 = require("../../parsers/index");
const FIXTURES_DIR = path_1.default.join(__dirname, '../test-data/playwright');
function loadFixture(name) {
    const content = (0, fs_1.readFileSync)(path_1.default.join(FIXTURES_DIR, name), 'utf-8');
    return JSON.parse(content);
}
// ============================================================================
// isPlaywrightReport
// ============================================================================
(0, vitest_1.describe)('isPlaywrightReport', () => {
    (0, vitest_1.it)('returns true for valid Playwright JSON output', () => {
        const raw = loadFixture('all-passing.json');
        (0, vitest_1.expect)((0, playwright_1.isPlaywrightReport)(raw)).toBe(true);
    });
    (0, vitest_1.it)('returns false for non-Playwright JSON', () => {
        (0, vitest_1.expect)((0, playwright_1.isPlaywrightReport)({ results: [] })).toBe(false);
        (0, vitest_1.expect)((0, playwright_1.isPlaywrightReport)({ tests: [] })).toBe(false);
        (0, vitest_1.expect)((0, playwright_1.isPlaywrightReport)(null)).toBe(false);
        (0, vitest_1.expect)((0, playwright_1.isPlaywrightReport)('string')).toBe(false);
        (0, vitest_1.expect)((0, playwright_1.isPlaywrightReport)(42)).toBe(false);
    });
});
// ============================================================================
// parsePlaywrightReport — all-passing fixture
// ============================================================================
(0, vitest_1.describe)('parsePlaywrightReport — all-passing fixture', () => {
    const raw = loadFixture('all-passing.json');
    (0, vitest_1.it)('fixture is recognized as Playwright format', () => {
        (0, vitest_1.expect)((0, playwright_1.isPlaywrightReport)(raw)).toBe(true);
    });
    (0, vitest_1.it)('produces one TestSuite per top-level file', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        // all-passing.spec.ts = one file = one suite
        (0, vitest_1.expect)(result.testSuites).toHaveLength(1);
    });
    (0, vitest_1.it)('suite name matches the file name', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        (0, vitest_1.expect)(result.testSuites[0].name).toBe('all-passing.spec.ts');
    });
    (0, vitest_1.it)('counts 7 passed tests', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        (0, vitest_1.expect)(result.testSuites[0].passed).toBe(7);
    });
    (0, vitest_1.it)('counts 0 failed tests', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        (0, vitest_1.expect)(result.testSuites[0].failed).toBe(0);
    });
    (0, vitest_1.it)('counts 1 skipped test', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        (0, vitest_1.expect)(result.testSuites[0].skipped).toBe(1);
    });
    (0, vitest_1.it)('includes a duration string', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        (0, vitest_1.expect)(result.testSuites[0].duration).toMatch(/^\d+(\.\d+)?(ms|s)$/);
    });
    (0, vitest_1.it)('summary mentions passed count and no failures', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        (0, vitest_1.expect)(result.summary).toContain('7 passed');
        (0, vitest_1.expect)(result.summary).not.toContain('failed');
    });
    (0, vitest_1.it)('summary mentions suite count', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        (0, vitest_1.expect)(result.summary).toContain('1 suite');
    });
    (0, vitest_1.it)('sets showTimestamp to true', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        (0, vitest_1.expect)(result.showTimestamp).toBe(true);
    });
});
// ============================================================================
// parsePlaywrightReport — with-failures fixture
// ============================================================================
(0, vitest_1.describe)('parsePlaywrightReport — with-failures fixture', () => {
    const raw = loadFixture('with-failures.json');
    (0, vitest_1.it)('counts 5 passed tests', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        (0, vitest_1.expect)(result.testSuites[0].passed).toBe(5);
    });
    (0, vitest_1.it)('counts 2 failed tests', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        (0, vitest_1.expect)(result.testSuites[0].failed).toBe(2);
    });
    (0, vitest_1.it)('counts 1 skipped test', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        (0, vitest_1.expect)(result.testSuites[0].skipped).toBe(1);
    });
    (0, vitest_1.it)('summary leads with failed count when there are failures', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        (0, vitest_1.expect)(result.summary).toMatch(/^2 failed/);
    });
    (0, vitest_1.it)('summary includes passed count', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        (0, vitest_1.expect)(result.summary).toContain('5 passed');
    });
    (0, vitest_1.it)('summary includes skipped count', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        (0, vitest_1.expect)(result.summary).toContain('1 skipped');
    });
});
// ============================================================================
// parsePlaywrightReport — empty fixture
// ============================================================================
(0, vitest_1.describe)('parsePlaywrightReport — empty fixture', () => {
    const raw = loadFixture('empty.json');
    (0, vitest_1.it)('returns zero testSuites', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        (0, vitest_1.expect)(result.testSuites).toHaveLength(0);
    });
    (0, vitest_1.it)('summary says no tests ran', () => {
        const result = (0, playwright_1.parsePlaywrightReport)(raw);
        (0, vitest_1.expect)(result.summary).toBe('No tests ran');
    });
});
// ============================================================================
// parseResultFile — integration (reads file from disk)
// ============================================================================
(0, vitest_1.describe)('parseResultFile', () => {
    (0, vitest_1.it)('parses all-passing.json successfully', async () => {
        const result = await (0, index_1.parseResultFile)(path_1.default.join(FIXTURES_DIR, 'all-passing.json'));
        (0, vitest_1.expect)(result.testSuites).toHaveLength(1);
        (0, vitest_1.expect)(result.testSuites[0].passed).toBe(7);
    });
    (0, vitest_1.it)('parses with-failures.json successfully', async () => {
        const result = await (0, index_1.parseResultFile)(path_1.default.join(FIXTURES_DIR, 'with-failures.json'));
        (0, vitest_1.expect)(result.testSuites[0].failed).toBe(2);
    });
    (0, vitest_1.it)('throws a descriptive error for a missing file', async () => {
        await (0, vitest_1.expect)((0, index_1.parseResultFile)('/nonexistent/path/results.json')).rejects.toThrow('Result file not found');
    });
    (0, vitest_1.it)('throws a descriptive error for unrecognized format', async () => {
        const tmpPath = path_1.default.join(FIXTURES_DIR, '_unknown-format.json');
        const { writeFileSync, unlinkSync } = await Promise.resolve().then(() => __importStar(require('fs')));
        writeFileSync(tmpPath, JSON.stringify({ results: { tests: [] } }));
        try {
            await (0, vitest_1.expect)((0, index_1.parseResultFile)(tmpPath)).rejects.toThrow('Unrecognized test result format');
        }
        finally {
            unlinkSync(tmpPath);
        }
    });
});

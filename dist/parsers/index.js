"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTestResultsInput = parseTestResultsInput;
exports.parseNamedResultEntries = parseNamedResultEntries;
exports.parseResultFile = parseResultFile;
exports.parseResultFiles = parseResultFiles;
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const playwright_1 = require("./playwright");
const vitest_1 = require("./vitest");
/**
 * Parses the YAML-like `test-results` input into named entries.
 *
 * Expected format:
 * ```yaml
 * - name: Unit Tests
 *   path: vitest-results/unit.json
 * - name: E2E Tests
 *   path: playwright-results/results.json
 * ```
 */
function parseTestResultsInput(input) {
    const entries = [];
    let current = null;
    for (const line of input.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        if (trimmed.startsWith('- name:')) {
            if (current?.name && current?.path)
                entries.push(current);
            current = { name: extractYamlValue(trimmed.slice('- name:'.length)) };
        }
        else if (trimmed.startsWith('name:') && current && !current.name) {
            current.name = extractYamlValue(trimmed.slice('name:'.length));
        }
        else if (trimmed.startsWith('path:') && current) {
            current.path = extractYamlValue(trimmed.slice('path:'.length));
        }
    }
    if (current?.name && current?.path)
        entries.push(current);
    if (entries.length === 0) {
        throw new Error('❌ Could not parse any entries from test-results input.\n\n' +
            '💡 Expected format:\n' +
            '    test-results: |\n' +
            '      - name: Unit Tests\n' +
            '        path: vitest-results/unit.json\n' +
            '      - name: E2E Tests\n' +
            '        path: playwright-results/results.json');
    }
    return entries;
}
function extractYamlValue(raw) {
    const trimmed = raw.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}
function parseDurationToMs(duration) {
    if (duration.endsWith('ms'))
        return parseFloat(duration);
    if (duration.endsWith('s'))
        return parseFloat(duration) * 1000;
    return 0;
}
function formatDuration(ms) {
    if (ms >= 1000)
        return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.round(ms)}ms`;
}
function aggregateToSuite(name, result) {
    const passed = result.testSuites.reduce((sum, s) => sum + s.passed, 0);
    const failed = result.testSuites.reduce((sum, s) => sum + s.failed, 0);
    const skipped = result.testSuites.reduce((sum, s) => sum + (s.skipped ?? 0), 0);
    const totalMs = result.testSuites.reduce((sum, s) => {
        return sum + (s.duration ? parseDurationToMs(s.duration) : 0);
    }, 0);
    const suite = { name, passed, failed };
    if (skipped > 0)
        suite.skipped = skipped;
    if (totalMs > 0)
        suite.duration = formatDuration(totalMs);
    return suite;
}
/**
 * Reads and parses each named entry's result file, then aggregates all
 * internal test files into a single TestSuite per entry.
 */
async function parseNamedResultEntries(entries) {
    const testSuites = [];
    for (const entry of entries) {
        const result = await parseResultFile(entry.path);
        testSuites.push(aggregateToSuite(entry.name, result));
    }
    const totalPassed = testSuites.reduce((sum, s) => sum + s.passed, 0);
    const totalFailed = testSuites.reduce((sum, s) => sum + s.failed, 0);
    const totalSkipped = testSuites.reduce((sum, s) => sum + (s.skipped ?? 0), 0);
    const parts = [];
    if (totalFailed > 0)
        parts.push(`${totalFailed} failed`);
    if (totalPassed > 0)
        parts.push(`${totalPassed} passed`);
    if (totalSkipped > 0)
        parts.push(`${totalSkipped} skipped`);
    const suiteWord = testSuites.length === 1 ? 'suite' : 'suites';
    const summary = parts.length > 0
        ? `${parts.join(', ')} across ${testSuites.length} ${suiteWord}`
        : 'No tests ran';
    return {
        summary,
        testSuites,
        showTimestamp: true,
    };
}
// ============================================================================
// Internal helpers (used by named entry parsing and tests)
// ============================================================================
/**
 * Reads a single test result file from disk, auto-detects its format, and
 * returns a normalized ParsedTestResults object.
 *
 * Supported formats:
 *  - Playwright JSON reporter (`--reporter=json`)
 *  - Vitest JSON reporter (`--reporter=json`)
 */
async function parseResultFile(filePath) {
    if (!(0, fs_1.existsSync)(filePath)) {
        throw new Error(`❌ Result file not found: "${filePath}"\n\n` +
            '💡 Make sure your test step runs before this action and the file path is correct.\n' +
            '   Example: path: playwright-report/results.json');
    }
    let raw;
    try {
        const contents = await (0, promises_1.readFile)(filePath, 'utf-8');
        raw = JSON.parse(contents);
    }
    catch (error) {
        throw new Error(`❌ Failed to read or parse result file "${filePath}": ${error instanceof Error ? error.message : String(error)}\n\n` +
            '💡 Ensure the file is valid JSON produced by your test runner.');
    }
    if ((0, playwright_1.isPlaywrightReport)(raw)) {
        return (0, playwright_1.parsePlaywrightReport)(raw);
    }
    if ((0, vitest_1.isVitestReport)(raw)) {
        return (0, vitest_1.parseVitestReport)(raw);
    }
    throw new Error(`❌ Unrecognized test result format in "${filePath}".\n\n` +
        '💡 Currently supported formats:\n' +
        '   - Playwright JSON reporter (set reporter: json in playwright.config.ts)\n' +
        '   - Vitest JSON reporter (set reporters: [\'json\'] in vitest.config.ts)\n\n' +
        '   Example playwright.config.ts:\n' +
        '     reporter: [["json", { outputFile: "playwright-report/results.json" }]]\n\n' +
        '   Example vitest.config.ts:\n' +
        '     reporters: [\'json\'],\n' +
        '     outputFile: \'vitest-results/results.json\'');
}
/**
 * Parses one or more test result files and merges them into a single
 * ParsedTestResults object. Each file is auto-detected by format.
 *
 * @param filePaths - One or more paths to result JSON files.
 */
async function parseResultFiles(filePaths) {
    const results = await Promise.all(filePaths.map(parseResultFile));
    if (results.length === 1) {
        return results[0];
    }
    return mergeResults(results);
}
function mergeResults(results) {
    const allSuites = results.flatMap((r) => r.testSuites);
    const totalPassed = allSuites.reduce((sum, s) => sum + s.passed, 0);
    const totalFailed = allSuites.reduce((sum, s) => sum + s.failed, 0);
    const totalSkipped = allSuites.reduce((sum, s) => sum + (s.skipped ?? 0), 0);
    const parts = [];
    if (totalFailed > 0)
        parts.push(`${totalFailed} failed`);
    if (totalPassed > 0)
        parts.push(`${totalPassed} passed`);
    if (totalSkipped > 0)
        parts.push(`${totalSkipped} skipped`);
    const suiteWord = allSuites.length === 1 ? 'suite' : 'suites';
    const summary = parts.length > 0
        ? `${parts.join(', ')} across ${allSuites.length} ${suiteWord}`
        : 'No tests ran';
    return {
        summary,
        testSuites: allSuites,
        showTimestamp: true,
    };
}

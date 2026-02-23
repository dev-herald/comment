"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseResultFile = parseResultFile;
exports.parseResultFiles = parseResultFiles;
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const playwright_1 = require("./playwright");
const vitest_1 = require("./vitest");
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
            '   Example: test-results: playwright-report/results.json');
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

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isVitestReport = isVitestReport;
exports.parseVitestReport = parseVitestReport;
const path_1 = __importDefault(require("path"));
// ============================================================================
// Helpers
// ============================================================================
function formatDuration(ms) {
    if (ms >= 1000) {
        return `${(ms / 1000).toFixed(1)}s`;
    }
    return `${Math.round(ms)}ms`;
}
function buildSummary(totalPassed, totalFailed, totalSkipped, suiteCount) {
    const parts = [];
    if (totalFailed > 0)
        parts.push(`${totalFailed} failed`);
    if (totalPassed > 0)
        parts.push(`${totalPassed} passed`);
    if (totalSkipped > 0)
        parts.push(`${totalSkipped} skipped`);
    if (parts.length === 0)
        return 'No tests ran';
    const suiteWord = suiteCount === 1 ? 'suite' : 'suites';
    return `${parts.join(', ')} across ${suiteCount} ${suiteWord}`;
}
// ============================================================================
// Public API
// ============================================================================
/**
 * Checks whether a plain object looks like Vitest (or Jest) JSON reporter output.
 * Identified by the presence of a `testResults` array and a numeric `numTotalTests`.
 */
function isVitestReport(raw) {
    if (typeof raw !== 'object' || raw === null)
        return false;
    const r = raw;
    return Array.isArray(r.testResults) && typeof r.numTotalTests === 'number';
}
/**
 * Parses Vitest (or Jest) JSON reporter output into the canonical ParsedTestResults shape.
 *
 * @param raw - Parsed JSON object from a `--reporter=json` output file.
 */
function parseVitestReport(raw) {
    const testSuites = [];
    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    for (const fileResult of raw.testResults) {
        let passed = 0;
        let failed = 0;
        let skipped = 0;
        for (const assertion of fileResult.assertionResults) {
            switch (assertion.status) {
                case 'passed':
                    passed++;
                    break;
                case 'failed':
                    failed++;
                    break;
                case 'skipped':
                case 'pending':
                case 'todo':
                    skipped++;
                    break;
            }
        }
        totalPassed += passed;
        totalFailed += failed;
        totalSkipped += skipped;
        const durationMs = fileResult.endTime - fileResult.startTime;
        const filePath = fileResult.name ?? fileResult.testFilePath ?? 'Unknown Suite';
        const suite = {
            name: path_1.default.basename(filePath),
            passed,
            failed,
        };
        if (skipped > 0) {
            suite.skipped = skipped;
        }
        if (durationMs > 0) {
            suite.duration = formatDuration(durationMs);
        }
        testSuites.push(suite);
    }
    const summary = buildSummary(totalPassed, totalFailed, totalSkipped, testSuites.length);
    return {
        summary,
        testSuites,
        showTimestamp: true,
    };
}

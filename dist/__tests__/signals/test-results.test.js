"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const test_results_1 = require("../../signals/test-results");
(0, vitest_1.describe)('runTestResultsSignal', () => {
    (0, vitest_1.it)('uses markdown link in the first cell when suite.link is set', () => {
        const out = (0, test_results_1.runTestResultsSignal)({
            summary: '1 passed',
            showTimestamp: true,
            testSuites: [
                {
                    name: 'Unit Tests',
                    passed: 27,
                    failed: 0,
                    skipped: 0,
                    duration: '28ms',
                    link: 'https://github.com/owner/repo/actions/runs/1',
                },
            ],
        });
        (0, vitest_1.expect)(out.hasResults).toBe(true);
        const data = out.data;
        (0, vitest_1.expect)(data.rows[0].cells[0].markdown).toBe('[Unit Tests](https://github.com/owner/repo/actions/runs/1)');
        (0, vitest_1.expect)(data.rows[0].cells[1].markdown).toBe('27');
    });
    (0, vitest_1.it)('uses plain suite name when link is absent', () => {
        const out = (0, test_results_1.runTestResultsSignal)({
            summary: '1 passed',
            showTimestamp: true,
            testSuites: [{ name: 'Unit Tests', passed: 2, failed: 0 }],
        });
        const data = out.data;
        (0, vitest_1.expect)(data.rows[0].cells[0].markdown).toBe('Unit Tests');
    });
});

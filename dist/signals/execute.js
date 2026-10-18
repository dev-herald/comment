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
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadParsedTestResults = loadParsedTestResults;
exports.executeSignal = executeSignal;
const core = __importStar(require("@actions/core"));
const index_1 = require("../parsers/index");
const validation_1 = require("../validation");
const dependency_diff_1 = require("./dependency-diff");
const test_results_1 = require("./test-results");
const new_dependency_1 = require("./new-dependency");
const bundle_analysis_1 = require("./bundle-analysis");
/**
 * Reads and parses the `test-results` YAML list.
 */
async function loadParsedTestResults(testResults) {
    core.info('📂 Parsing test results...');
    const entries = (0, index_1.parseTestResultsInput)(testResults);
    core.info(`📋 Found ${entries.length} named suite(s): ${entries.map((e) => e.name).join(', ')}`);
    const parsed = await (0, index_1.parseNamedResultEntries)(entries);
    core.info(`✅ Parsed ${parsed.testSuites.length} test suite(s): ${parsed.summary}`);
    return parsed;
}
function missingTestResultsError() {
    return new Error('❌ The TEST_RESULTS signal requires "test-results" to be set\n\n' +
        '💡 Example:\n' +
        '  with:\n' +
        '    signal: "TEST_RESULTS"\n' +
        '    test-results: |\n' +
        '      - name: Unit Tests\n' +
        '        path: vitest-results/results.json');
}
/**
 * Runs one signal and returns whether to skip it, render a table, or include prose.
 * Single-signal mode and bulk mode share this so skip rules stay in one place.
 */
async function executeSignal(signal, inputs, parsedTestResults) {
    const resolvedInputs = (0, validation_1.resolveInputsForSignal)(inputs, signal);
    if (signal === 'DEPENDENCY_DIFF') {
        const result = await (0, dependency_diff_1.runDependencyDiffSignal)(resolvedInputs);
        if (!result.hasChanges) {
            return {
                action: 'skip',
                commentLog: 'Skipping PR comment (no dependency changes)',
                sectionLog: 'Omitting DEPENDENCY_DIFF (no dependency changes)',
            };
        }
        return { action: 'table', data: result.data ?? {} };
    }
    if (signal === 'TEST_RESULTS') {
        if (!inputs.testResults || inputs.testResults.trim().length === 0) {
            throw missingTestResultsError();
        }
        const parsed = parsedTestResults ?? await loadParsedTestResults(inputs.testResults);
        const result = (0, test_results_1.runTestResultsSignal)(parsed);
        if (result.hasResults) {
            return { action: 'table', data: result.data ?? {} };
        }
        return { action: 'comment', markdown: result.noResultsComment ?? '' };
    }
    if (signal === 'NEW_DEPENDENCY') {
        const result = await (0, new_dependency_1.runNewDependencySignal)(resolvedInputs);
        if (!result.hasChanges) {
            return {
                action: 'skip',
                commentLog: 'Skipping PR comment (no new dependencies)',
                sectionLog: 'Omitting NEW_DEPENDENCY (no new dependencies)',
            };
        }
        return { action: 'table', data: result.data ?? {} };
    }
    if (signal === 'BUNDLE_ANALYSIS') {
        const result = await (0, bundle_analysis_1.runBundleAnalysisSignal)(resolvedInputs);
        if (result.skip) {
            return {
                action: 'skip',
                commentLog: 'Skipping PR comment (baseline not found)',
                sectionLog: 'Omitting BUNDLE_ANALYSIS (baseline not found)',
            };
        }
        if (result.hasChanges) {
            return { action: 'table', data: result.data ?? {} };
        }
        return { action: 'comment', markdown: result.noChangesComment ?? '' };
    }
    throw new Error(`❌ Unhandled signal: "${signal}"`);
}

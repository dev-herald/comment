import * as core from '@actions/core';
import type { ActionInputs } from '../types';
import type { SignalOutcome } from '../bulk-comment';
import type { ParsedTestResults } from '../parsers/types';
import { parseNamedResultEntries, parseTestResultsInput } from '../parsers/index';
import { resolveInputsForSignal } from '../validation';
import { runDependencyDiffSignal } from './dependency-diff';
import { runTestResultsSignal } from './test-results';
import { runNewDependencySignal } from './new-dependency';
import { runBundleAnalysisSignal } from './bundle-analysis';

/**
 * Reads and parses the `test-results` YAML list.
 */
export async function loadParsedTestResults(testResults: string): Promise<ParsedTestResults> {
  core.info('📂 Parsing test results...');
  const entries = parseTestResultsInput(testResults);
  core.info(`📋 Found ${entries.length} named suite(s): ${entries.map((e) => e.name).join(', ')}`);
  const parsed = await parseNamedResultEntries(entries);
  core.info(`✅ Parsed ${parsed.testSuites.length} test suite(s): ${parsed.summary}`);
  return parsed;
}

function missingTestResultsError(): Error {
  return new Error(
    '❌ The TEST_RESULTS signal requires "test-results" to be set\n\n' +
    '💡 Example:\n' +
    '  with:\n' +
    '    signal: "TEST_RESULTS"\n' +
    '    test-results: |\n' +
    '      - name: Unit Tests\n' +
    '        path: vitest-results/results.json'
  );
}

/**
 * Runs one signal and returns whether to skip it, render a table, or include prose.
 * Single-signal mode and bulk mode share this so skip rules stay in one place.
 */
export async function executeSignal(
  signal: string,
  inputs: ActionInputs,
  parsedTestResults?: ParsedTestResults,
): Promise<SignalOutcome> {
  const resolvedInputs = resolveInputsForSignal(inputs, signal);

  if (signal === 'DEPENDENCY_DIFF') {
    const result = await runDependencyDiffSignal(resolvedInputs);
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
    const result = runTestResultsSignal(parsed);
    if (result.hasResults) {
      return { action: 'table', data: result.data ?? {} };
    }
    return { action: 'comment', markdown: result.noResultsComment ?? '' };
  }

  if (signal === 'NEW_DEPENDENCY') {
    const result = await runNewDependencySignal(resolvedInputs);
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
    const result = await runBundleAnalysisSignal(resolvedInputs);
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

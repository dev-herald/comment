import * as core from '@actions/core';
import { getActionInputs, validateInputs, buildRequestConfig } from './validation';
import { buildHeaders, makeHttpRequest } from './api';
import { processResponse } from './output';
import { buildBulkComment } from './bulk-comment';
import { parseSignalsInput } from './signals/parse-signals';
import { executeSignal, loadParsedTestResults } from './signals/execute';
import { formatTimestamp } from './signals/utils';
import type { ParsedTestResults } from './parsers/types';
import type { ActionInputs } from './types';

/**
 * Single-signal mode: one outcome becomes one template payload, one prose comment, or no post.
 */
async function applySingleSignal(inputs: ActionInputs, parsedTestResults?: ParsedTestResults): Promise<boolean> {
  core.info(`📊 Running signal: ${inputs.signal}`);
  const outcome = await executeSignal(inputs.signal, inputs, parsedTestResults);

  if (outcome.action === 'skip') {
    core.info(outcome.commentLog);
    return false;
  }

  if (outcome.action === 'table') {
    inputs.template = 'CUSTOM_TABLE';
    inputs.templateData = JSON.stringify(outcome.data);
    return true;
  }

  inputs.comment = outcome.markdown;
  return true;
}

/**
 * Bulk mode: render each section, join them, and post one plain comment.
 * Returns false when every section was skipped.
 */
async function applyBulkSignals(inputs: ActionInputs, signals: string[]): Promise<boolean> {
  const outcomes = [];

  for (const signal of signals) {
    core.info(`📊 Running signal: ${signal}`);
    const outcome = await executeSignal(signal, inputs);
    if (outcome.action === 'skip') {
      core.info(outcome.sectionLog);
    }
    outcomes.push(outcome);
  }

  const comment = buildBulkComment(outcomes, formatTimestamp());
  if (!comment) {
    core.info('Skipping PR comment (every section was empty)');
    return false;
  }

  inputs.comment = comment;
  inputs.template = '';
  return true;
}

/**
 * Main action entry point
 */
async function run(): Promise<void> {
  try {
    // ============================================================
    // PHASE 1: INPUT VALIDATION (before API call)
    // ============================================================
    core.info('🔍 Validating inputs...');
    const inputs = getActionInputs();
    validateInputs(inputs);
    core.info('✅ Input validation passed');

    const signals = inputs.signals.trim().length > 0 ? parseSignalsInput(inputs.signals) : [];

    // ============================================================
    // PHASE 1.5: PARSE TEST RESULTS FILES (single-signal mode only)
    // Bulk mode parses inside TEST_RESULTS so templateData is not overwritten.
    // ============================================================
    let parsedTestResults: ParsedTestResults | undefined;
    if (signals.length === 0 && inputs.testResults && inputs.testResults.trim().length > 0) {
      parsedTestResults = await loadParsedTestResults(inputs.testResults);
      inputs.templateData = JSON.stringify(parsedTestResults);
    }

    // ============================================================
    // PHASE 1.7: RUN SIGNAL OR SIGNALS
    // ============================================================
    if (signals.length > 0) {
      const shouldPost = await applyBulkSignals(inputs, signals);
      if (!shouldPost) return;
    } else if (inputs.signal && inputs.signal.trim().length > 0) {
      const shouldPost = await applySingleSignal(inputs, parsedTestResults);
      if (!shouldPost) return;
    }

    // Build and validate request configuration
    const config = buildRequestConfig(inputs);

    // ============================================================
    // PHASE 2: API REQUEST
    // ============================================================
    core.info(`🚀 Posting to PR #${inputs.prNumber}`);
    core.info(`📡 Endpoint: ${config.endpoint}`);
    core.debug(`📦 Request body: ${JSON.stringify(config.requestBody, null, 2)}`);

    const headers = buildHeaders(inputs.apiKey);
    const response = await makeHttpRequest(config.endpoint, 'POST', headers, config.requestBody);

    // ============================================================
    // PHASE 3: RESPONSE PROCESSING (after API call)
    // ============================================================
    processResponse(response, config.mode);

  } catch (error) {
    if (error instanceof Error) {
      // Error message is already formatted (from Zod validation or API error handling)
      core.setFailed(error.message);
    } else {
      core.setFailed('❌ Unknown error occurred');
    }
  }
}

run();

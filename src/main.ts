import * as core from '@actions/core';
import { getActionInputs, validateInputs, buildRequestConfig } from './validation';
import { buildHeaders, makeHttpRequest } from './api';
import { processDeleteResponse, processResponse } from './output';
import { buildBulkComment, decideCommentAction, type CommentDecision } from './bulk-comment';
import { parseSignalsInput } from './signals/parse-signals';
import { executeSignal, loadParsedTestResults } from './signals/execute';
import { formatTimestamp } from './signals/utils';
import type { ParsedTestResults } from './parsers/types';
import type { ActionInputs } from './types';

/**
 * Single-signal mode: one outcome becomes one template payload, one prose comment, a delete, or no post.
 */
async function applySingleSignal(inputs: ActionInputs, parsedTestResults?: ParsedTestResults): Promise<CommentDecision> {
  core.info(`📊 Running signal: ${inputs.signal}`);
  const outcome = await executeSignal(inputs.signal, inputs, parsedTestResults);

  if (outcome.action === 'skip' || outcome.action === 'clear') {
    core.info(outcome.commentLog);
  } else if (outcome.action === 'table') {
    inputs.template = 'CUSTOM_TABLE';
    inputs.templateData = JSON.stringify(outcome.data);
  } else {
    inputs.comment = outcome.markdown;
  }

  return decideCommentAction([outcome]);
}

/**
 * Bulk mode: render each section and join the ones that still have content.
 */
async function applyBulkSignals(inputs: ActionInputs, signals: string[]): Promise<CommentDecision> {
  const outcomes = [];

  for (const signal of signals) {
    core.info(`📊 Running signal: ${signal}`);
    const outcome = await executeSignal(signal, inputs);
    if (outcome.action === 'skip' || outcome.action === 'clear') {
      core.info(outcome.sectionLog);
    }
    outcomes.push(outcome);
  }

  const decision = decideCommentAction(outcomes);
  if (decision !== 'post') return decision;

  const comment = buildBulkComment(outcomes, formatTimestamp());
  if (!comment) return 'preserve';

  inputs.comment = comment;
  inputs.template = '';
  return 'post';
}

/**
 * Deletes the sticky comment for this pull request.
 * Without a sticky id there is nothing the API can target, so the step exits successfully.
 */
async function deleteStickyComment(inputs: ActionInputs): Promise<void> {
  if (inputs.stickyId.trim().length === 0) {
    core.info('No sticky-id set, so the previous comment cannot be removed');
    return;
  }

  const endpoint = `${inputs.apiUrl}/comment`;
  const requestBody = { prNumber: inputs.prNumber, stickyId: inputs.stickyId.trim() };

  core.info(`🗑️ Deleting sticky comment "${requestBody.stickyId}" on PR #${inputs.prNumber}`);
  core.info(`📡 Endpoint: ${endpoint}`);
  core.debug(`📦 Request body: ${JSON.stringify(requestBody, null, 2)}`);

  const headers = buildHeaders(inputs.apiKey);
  const response = await makeHttpRequest(endpoint, 'DELETE', headers, requestBody);
  processDeleteResponse(response);
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
    let decision: CommentDecision = 'post';
    if (signals.length > 0) {
      decision = await applyBulkSignals(inputs, signals);
    } else if (inputs.signal && inputs.signal.trim().length > 0) {
      decision = await applySingleSignal(inputs, parsedTestResults);
    }

    if (decision === 'preserve') {
      core.info('Leaving the existing comment in place');
      return;
    }
    if (decision === 'delete') {
      await deleteStickyComment(inputs);
      return;
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

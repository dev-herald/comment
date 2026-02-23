import * as core from '@actions/core';
import { getActionInputs, validateInputs, buildRequestConfig } from './validation';
import { buildHeaders, makeHttpRequest } from './api';
import { processResponse } from './output';
import { parseResultFiles } from './parsers/index';

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

    // ============================================================
    // PHASE 1.5: PARSE TEST RESULTS FILES (if test-results set)
    // ============================================================
    if (inputs.testResults && inputs.testResults.length > 0) {
      core.info(`📂 Parsing test results from: ${inputs.testResults.join(', ')}`);
      const parsed = await parseResultFiles(inputs.testResults);
      inputs.templateData = JSON.stringify(parsed);
      core.info(`✅ Parsed ${parsed.testSuites.length} test suite(s): ${parsed.summary}`);
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

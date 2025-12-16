import * as core from '@actions/core';
import { getActionInputs, validatePrNumber, buildRequestConfig } from './validation';
import { buildHeaders, makeHttpRequest } from './api';
import { processResponse } from './output';

/**
 * Main action entry point
 */
async function run(): Promise<void> {
  try {
    // Get and validate inputs
    const inputs = getActionInputs();
    validatePrNumber(inputs.prNumber, core.getInput('pr-number', { required: true }));

    // Build request configuration
    const config = buildRequestConfig(inputs);

    // Log request info
    core.info(`🚀 Posting to PR #${inputs.prNumber}`);
    core.info(`📡 Endpoint: ${config.endpoint}`);

    // Make API request
    const headers = buildHeaders(inputs.apiKey);
    const response = await makeHttpRequest(config.endpoint, 'POST', headers, config.requestBody);

    // Process and output response
    processResponse(response, config.mode);

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`❌ ${error.message}`);
    } else {
      core.setFailed('❌ Unknown error occurred');
    }
  }
}

run();

import * as core from '@actions/core';
import type { ActionInputs, RequestConfig } from './types';

const VALID_TEMPLATES = ['DEPLOYMENT', 'TEST_RESULTS', 'MIGRATION', 'CUSTOM_TABLE'] as const;

/**
 * Reads and returns all action inputs
 */
export function getActionInputs(): ActionInputs {
  return {
    apiKey: core.getInput('api-key', { required: true }),
    prNumber: parseInt(core.getInput('pr-number', { required: true }), 10),
    comment: core.getInput('comment', { required: false }),
    template: core.getInput('template', { required: false }),
    templateData: core.getInput('template-data', { required: false }),
    stickyId: core.getInput('sticky-id', { required: false }),
    apiUrl: core.getInput('api-url', { required: false }) || 'https://api.devherald.com/api/v1/github'
  };
}

/**
 * Validates the PR number is a positive integer
 */
export function validatePrNumber(prNumber: number, prNumberInput: string): void {
  if (isNaN(prNumber) || prNumber <= 0) {
    throw new Error(`Invalid pr-number: must be a positive integer, got "${prNumberInput}"`);
  }
}

/**
 * Validates that exactly one mode (comment or template) is selected
 */
export function validateModeSelection(hasComment: boolean, hasTemplate: boolean): void {
  if (!hasComment && !hasTemplate) {
    throw new Error('Must provide either "comment" (for simple comments) or "template" (for template comments)');
  }

  if (hasComment && hasTemplate) {
    throw new Error('Cannot provide both "comment" and "template" - choose one mode');
  }
}

/**
 * Validates template input and returns parsed data
 */
export function validateTemplateInput(template: string, templateData: string): any {
  if (!VALID_TEMPLATES.includes(template as any)) {
    throw new Error(`Invalid template: must be one of ${VALID_TEMPLATES.join(', ')}, got "${template}"`);
  }

  if (!templateData || templateData.trim().length === 0) {
    throw new Error('template-data is required when using template mode');
  }

  try {
    return JSON.parse(templateData);
  } catch (error) {
    throw new Error(`Invalid JSON in template-data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Builds the request configuration based on inputs
 */
export function buildRequestConfig(inputs: ActionInputs): RequestConfig {
  const hasComment = inputs.comment.trim().length > 0;
  const hasTemplate = inputs.template.trim().length > 0;

  // Validate mode selection
  validateModeSelection(hasComment, hasTemplate);

  if (hasTemplate) {
    // Template mode
    const parsedData = validateTemplateInput(inputs.template, inputs.templateData);
    
    const requestBody: any = {
      prNumber: inputs.prNumber,
      template: inputs.template as 'DEPLOYMENT' | 'TEST_RESULTS' | 'MIGRATION' | 'CUSTOM_TABLE',
      data: parsedData
    };

    if (inputs.stickyId) {
      requestBody.stickyId = inputs.stickyId;
    }

    core.info(`📋 Using template mode: ${inputs.template}`);
    if (inputs.stickyId) {
      core.info(`🔖 Sticky ID: ${inputs.stickyId} (will update existing comment if found)`);
    }

    return {
      endpoint: `${inputs.apiUrl}/comment/template`,
      requestBody,
      mode: 'template'
    };
  } else {
    // Simple comment mode
    core.info(`💬 Using simple comment mode`);

    return {
      endpoint: `${inputs.apiUrl}/comment`,
      requestBody: {
        comment: inputs.comment,
        prNumber: inputs.prNumber
      },
      mode: 'simple'
    };
  }
}


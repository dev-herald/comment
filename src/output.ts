import * as core from '@actions/core';
import type {
  SimpleCommentResponse,
  TemplateCommentResponse,
  ErrorResponse
} from './types';
import type { HttpResponse } from './api';

/**
 * Parses the HTTP response data as JSON
 */
export function parseResponse(response: HttpResponse): any {
  try {
    return JSON.parse(response.data);
  } catch (error) {
    core.warning('Could not parse response as JSON');
    return { raw: response.data };
  }
}

/**
 * Handles a successful template comment response
 */
export function handleTemplateSuccess(responseData: TemplateCommentResponse): void {
  core.setOutput('comment-id', responseData.data.commentId);
  core.setOutput('status', responseData.data.status);
  core.info(`📝 Comment ID: ${responseData.data.commentId}`);
  core.info(`📊 Status: ${responseData.data.status}`);
  core.info(`💡 ${responseData.data.message}`);
}

/**
 * Handles a successful simple comment response
 */
export function handleSimpleSuccess(responseData: SimpleCommentResponse): void {
  core.setOutput('comment-id', responseData.commentId);
  core.setOutput('github-comment-id', responseData.githubCommentId);
  core.setOutput('github-comment-url', responseData.githubCommentUrl);
  core.setOutput('status', 'posted');
  
  core.info(`📝 Comment ID: ${responseData.commentId}`);
  core.info(`🔗 GitHub Comment URL: ${responseData.githubCommentUrl}`);
  core.info(`📦 Repository: ${responseData.repository}`);
}

/**
 * Handles an error response from the API
 */
export function handleErrorResponse(statusCode: number, responseData: ErrorResponse): void {
  let errorMessage = `API call failed with status code ${statusCode}`;

  if (responseData.error) {
    errorMessage += `\n❌ Error: ${responseData.error}`;
  }

  if (responseData.errors && Array.isArray(responseData.errors)) {
    errorMessage += '\n📋 Validation errors:';
    responseData.errors.forEach((err, index) => {
      errorMessage += `\n  ${index + 1}. ${err.message}`;
      if (err.field) {
        errorMessage += ` (field: ${err.field})`;
      }
      if (err.code) {
        errorMessage += ` [${err.code}]`;
      }
    });
  } else if (responseData.details) {
    errorMessage += `\n📋 Details: ${typeof responseData.details === 'string' ? responseData.details : JSON.stringify(responseData.details)}`;
  }

  core.setFailed(errorMessage);
}

/**
 * Processes the API response and sets appropriate outputs
 */
export function processResponse(response: HttpResponse, mode: 'simple' | 'template'): void {
  const responseData = parseResponse(response);

  // Set full response output
  core.setOutput('response', JSON.stringify(responseData));

  // Handle response based on status code
  if (response.statusCode >= 200 && response.statusCode < 300) {
    core.info(`✅ Success! Status code: ${response.statusCode}`);

    if (mode === 'template') {
      handleTemplateSuccess(responseData as TemplateCommentResponse);
    } else {
      handleSimpleSuccess(responseData as SimpleCommentResponse);
    }
  } else {
    handleErrorResponse(response.statusCode, responseData as ErrorResponse);
  }
}


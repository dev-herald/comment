import * as core from '@actions/core';
import type {
  SimpleCommentResponse,
  TemplateCommentResponse,
  ErrorResponse
} from './types';
import type { HttpResponse } from './api';

/**
 * ============================================================================
 * API RESPONSE PROCESSING
 * ============================================================================
 * 
 * This module handles responses AFTER the API request has been made.
 * 
 * For INPUT VALIDATION (before API call), see validation.ts
 * 
 * Flow:
 *   1. Parse the HTTP response body
 *   2. Check status code (2xx = success, 4xx/5xx = error)
 *   3. Output appropriate GitHub Actions outputs and logs
 */

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
 * Handles an error response from the API (after request was sent)
 * This is for API-level errors, not input validation errors
 */
export function handleApiErrorResponse(statusCode: number, responseData: ErrorResponse): void {
  const lines: string[] = [];
  
  lines.push(`❌ API returned error (status ${statusCode})`);

  // Show the main error message from API
  if (responseData.error) {
    lines.push(`   ${responseData.error}`);
  }

  // Show detailed validation errors from API if present
  if (responseData.errors && Array.isArray(responseData.errors)) {
    lines.push('');
    lines.push('Server validation errors:');
    responseData.errors.forEach((err, index) => {
      let errorLine = `  ${index + 1}. ${err.message}`;
      
      if (err.field) {
        errorLine += ` (field: ${err.field})`;
      }
      if (err.code) {
        errorLine += ` [${err.code}]`;
      }
      
      lines.push(errorLine);
      
      // Show details if available
      if (err.details) {
        const detailsStr = typeof err.details === 'string' 
          ? err.details 
          : JSON.stringify(err.details, null, 2);
        lines.push(`     ${detailsStr}`);
      }
    });
  } else if (responseData.details) {
    lines.push('');
    const detailsStr = typeof responseData.details === 'string' 
      ? responseData.details 
      : JSON.stringify(responseData.details, null, 2);
    lines.push(`Details: ${detailsStr}`);
  }

  // Add comment ID for support if available
  if (responseData.commentId) {
    lines.push('');
    lines.push(`Comment ID: ${responseData.commentId}`);
  }

  // Add simple status-specific hint
  lines.push('');
  if (statusCode === 500) {
    lines.push('💡 This is a server error. Check your API key and project configuration.');
  } else if (statusCode === 401) {
    lines.push('💡 Authentication failed. Verify your API key is valid.');
  } else if (statusCode === 403) {
    lines.push('💡 Access forbidden. Check your API key permissions.');
  } else if (statusCode === 400) {
    lines.push('💡 Invalid request. Review the validation errors above.');
  }

  core.setFailed(lines.join('\n'));
}

/**
 * Handles DELETE /comment. 200 means nothing was on GitHub; 202 means deletion was queued.
 */
export function processDeleteResponse(response: HttpResponse): void {
  const responseData = parseResponse(response);
  core.setOutput('response', JSON.stringify(responseData));

  if (response.statusCode >= 200 && response.statusCode < 300) {
    const data = responseData?.data ?? responseData ?? {};
    const message = typeof data.message === 'string' ? data.message : 'Sticky comment delete completed';
    core.info(`✅ Success! Status code: ${response.statusCode}`);
    core.info(`💡 ${message}`);
    if (typeof data.commentId === 'string') {
      core.setOutput('comment-id', data.commentId);
    }
    if (typeof data.status === 'string') {
      core.setOutput('status', data.status);
    }
    return;
  }

  handleApiErrorResponse(response.statusCode, responseData as ErrorResponse);
}

/**
 * Processes the API response and sets appropriate outputs
 * This handles responses AFTER the API request has been made
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
    handleApiErrorResponse(response.statusCode, responseData as ErrorResponse);
  }
}


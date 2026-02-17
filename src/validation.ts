import * as core from '@actions/core';
import { z } from 'zod';
import {
  prNumberSchema,
  stickyIdSchema,
  simpleCommentSchema,
  templateTypeSchema,
  deploymentTemplateSchema,
  testResultsTemplateSchema,
  migrationTemplateSchema,
  customTableTemplateSchema
} from '@dev-herald/constants';
import type { ActionInputs, RequestConfig } from './types';

// ============================================================================
// Local Schemas (Action-specific)
// ============================================================================

/**
 * Schema for API key - non-empty string
 */
const apiKeySchema = z.string().min(1, {
  message: 'API key is required and cannot be empty'
});

/**
 * Raw action inputs schema (before processing)
 */
const rawInputsSchema = z.object({
  apiKey: apiKeySchema,
  prNumber: prNumberSchema,
  comment: z.string(),
  template: z.string(),
  templateData: z.string(),
  stickyId: z.string(),
  apiUrl: z.string().url('API URL must be a valid HTTPS URL').startsWith('https://', {
    message: 'API URL must use HTTPS for security'
  })
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Formats Zod errors into a human-readable message
 */
export function formatZodError(error: z.ZodError): string {
  const messages: string[] = [];
  
  messages.push('❌ Validation failed:\n');
  
  const issues = error.issues;
  issues.forEach((err: z.ZodIssue, index: number) => {
    const fieldPath = err.path.length > 0 ? err.path.join('.') : 'input';
    messages.push(`  ${index + 1}. Field "${fieldPath}": ${err.message}`);
    
    // Add context for specific error types using type guards and any for complex types
    if (err.code === 'invalid_type') {
      const typeErr = err as any;
      if (typeErr.expected && typeErr.received) {
        messages.push(`     Expected: ${typeErr.expected}, Received: ${typeErr.received}`);
      }
    } else if (err.code === 'invalid_value') {
      const valueErr = err as any;
      if (valueErr.options && Array.isArray(valueErr.options)) {
        messages.push(`     Allowed values: ${valueErr.options.join(', ')}`);
      }
    } else if (err.code === 'too_small') {
      const smallErr = err as any;
      if (smallErr.minimum !== undefined) {
        if (smallErr.type === 'string') {
          messages.push(`     Minimum length: ${smallErr.minimum} characters`);
        } else if (smallErr.type === 'number') {
          messages.push(`     Minimum value: ${smallErr.minimum}`);
        }
      }
    } else if (err.code === 'too_big') {
      const bigErr = err as any;
      if (bigErr.maximum !== undefined) {
        if (bigErr.type === 'string') {
          messages.push(`     Maximum length: ${bigErr.maximum} characters`);
        } else if (bigErr.type === 'number') {
          messages.push(`     Maximum value: ${bigErr.maximum}`);
        }
      }
    }
  });
  
  messages.push('\n💡 Please check your workflow file and ensure all inputs are correct.');
  
  return messages.join('\n');
}

/**
 * Validates template-specific data based on template type
 */
function validateTemplateData(template: string, data: any): any {
  try {
    switch (template) {
      case 'DEPLOYMENT':
        return deploymentTemplateSchema.parse(data);
      case 'TEST_RESULTS':
        return testResultsTemplateSchema.parse(data);
      case 'MIGRATION':
        return migrationTemplateSchema.parse(data);
      case 'CUSTOM_TABLE':
        return customTableTemplateSchema.parse(data);
      default:
        throw new Error(`Unknown template type: ${template}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid data for ${template} template:\n${formatZodError(error)}`);
    }
    throw error;
  }
}

// ============================================================================
// Public API
// ============================================================================

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
    apiUrl: core.getInput('api-url', { required: false }) || 'https://dev-herald.com/api/v1/github'
  };
}

/**
 * Validates all raw inputs using Zod
 */
export function validateInputs(inputs: ActionInputs): void {
  try {
    rawInputsSchema.parse(inputs);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(formatZodError(error));
    }
    throw error;
  }
}

/**
 * Builds the request configuration based on inputs with Zod validation
 */
export function buildRequestConfig(inputs: ActionInputs): RequestConfig {
  const hasComment = inputs.comment.trim().length > 0;
  const hasTemplate = inputs.template.trim().length > 0;

  // Validate mode selection
  if (!hasComment && !hasTemplate) {
    throw new Error(
      '❌ Must provide either "comment" (for simple comments) or "template" (for template comments)\n\n' +
      '💡 Example with comment:\n' +
      '  with:\n' +
      '    comment: "## Build Complete\\n✅ All checks passed!"\n\n' +
      '💡 Example with template:\n' +
      '  with:\n' +
      '    template: "DEPLOYMENT"\n' +
      '    template-data: \'{"projectName": "My App", "deploymentStatus": "Ready", "deploymentLink": "https://vercel.com/deployments/abc123"}\''
    );
  }

  if (hasComment && hasTemplate) {
    throw new Error(
      '❌ Cannot provide both "comment" and "template" - choose one mode\n\n' +
      '💡 Either use:\n' +
      '  - "comment" for simple markdown comments\n' +
      '  - "template" + "template-data" for structured templates'
    );
  }

  if (hasTemplate) {
    // Template mode - validate template type
    let validatedTemplate: z.infer<typeof templateTypeSchema>;
    try {
      validatedTemplate = templateTypeSchema.parse(inputs.template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(formatZodError(error));
      }
      throw error;
    }

    // Parse and validate template data
    if (!inputs.templateData || inputs.templateData.trim().length === 0) {
      throw new Error(
        '❌ template-data is required when using template mode\n\n' +
        `💡 The ${inputs.template} template requires JSON data. Example:\n` +
        '  with:\n' +
        `    template: "${inputs.template}"\n` +
        '    template-data: \'{"key": "value"}\''
      );
    }

    let parsedData: any;
    try {
      parsedData = JSON.parse(inputs.templateData);
    } catch (error) {
      throw new Error(
        `❌ Invalid JSON in template-data: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
        '💡 Make sure your JSON is properly formatted:\n' +
        '  - Use single quotes around the JSON string in YAML\n' +
        '  - Escape special characters properly\n' +
        '  - Validate JSON at https://jsonlint.com\n\n' +
        'Example:\n' +
        '  template-data: \'{"projectName": "My App", "deploymentStatus": "Ready", "deploymentLink": "https://vercel.com/deployments/abc123"}\''
      );
    }

    // Validate template-specific data structure
    const validatedData = validateTemplateData(validatedTemplate, parsedData);
    
    const requestBody: any = {
      prNumber: inputs.prNumber,
      template: validatedTemplate,
      data: validatedData
    };

    // Validate and add sticky ID if provided
    if (inputs.stickyId && inputs.stickyId.trim().length > 0) {
      try {
        const validatedStickyId = stickyIdSchema.parse(inputs.stickyId);
        requestBody.stickyId = validatedStickyId;
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new Error(formatZodError(error));
        }
        throw error;
      }
    }

    core.info(`📋 Using template mode: ${validatedTemplate}`);
    if (requestBody.stickyId) {
      core.info(`🔖 Sticky ID: ${requestBody.stickyId} (will update existing comment if found)`);
    }

    return {
      endpoint: `${inputs.apiUrl}/comment/template`,
      requestBody,
      mode: 'template'
    };
  } else {
    // Simple comment mode - validate comment text
    let validatedComment: string;
    try {
      validatedComment = simpleCommentSchema.parse(inputs.comment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(formatZodError(error));
      }
      throw error;
    }

    core.info(`💬 Using simple comment mode`);
    
    const requestBody: any = {
      comment: validatedComment,
      prNumber: inputs.prNumber
    };

    // Validate and add sticky ID if provided
    if (inputs.stickyId && inputs.stickyId.trim().length > 0) {
      try {
        const validatedStickyId = stickyIdSchema.parse(inputs.stickyId);
        requestBody.stickyId = validatedStickyId;
        core.info(`🔖 Sticky ID: ${requestBody.stickyId} (will update existing comment if found)`);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new Error(formatZodError(error));
        }
        throw error;
      }
    }

    return {
      endpoint: `${inputs.apiUrl}/comment`,
      requestBody,
      mode: 'simple'
    };
  }
}


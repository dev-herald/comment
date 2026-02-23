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
exports.deploymentStatusSchema = void 0;
exports.formatZodError = formatZodError;
exports.getActionInputs = getActionInputs;
exports.validateInputs = validateInputs;
exports.buildRequestConfig = buildRequestConfig;
const core = __importStar(require("@actions/core"));
const zod_1 = require("zod");
const constants_1 = require("@dev-herald/constants");
// ============================================================================
// Deployment Status Enum + Enhanced Schema
// ============================================================================
/**
 * Enum of valid deployment statuses.
 * Values match the keys of DEPLOYMENT_STATUS_IMGS - TypeScript will error at
 * compile time if this ever drifts out of sync with the constants package.
 */
exports.deploymentStatusSchema = zod_1.z.enum(['building', 'queued', 'success', 'failed']);
/**
 * Deployment schema with:
 *  - deploymentStatus constrained to the known enum values
 *  - statusIconUrl auto-defaulted from DEPLOYMENT_STATUS_IMGS when not provided
 */
const deploymentSchema = constants_1.deploymentTemplateSchema
    .extend({ deploymentStatus: exports.deploymentStatusSchema })
    .transform((data) => ({
    ...data,
    statusIconUrl: data.statusIconUrl ?? constants_1.DEPLOYMENT_STATUS_IMGS[data.deploymentStatus]
}));
// ============================================================================
// Local Schemas (Action-specific)
// ============================================================================
/**
 * Schema for API key - non-empty string
 */
const apiKeySchema = zod_1.z.string().min(1, {
    error: 'API key is required and cannot be empty'
});
/**
 * Raw action inputs schema (before processing)
 */
const rawInputsSchema = zod_1.z.object({
    apiKey: apiKeySchema,
    prNumber: constants_1.prNumberSchema,
    comment: zod_1.z.string(),
    template: zod_1.z.string(),
    templateData: zod_1.z.string(),
    testResults: zod_1.z.string(),
    stickyId: zod_1.z.string(),
    apiUrl: zod_1.z
        .url({ error: 'API URL must be a valid HTTPS URL' })
        .startsWith('https://', { error: 'API URL must use HTTPS for security' })
});
// ============================================================================
// Utility Functions
// ============================================================================
/**
 * Recursively converts empty strings to undefined so optional URL/string fields
 * are treated as absent rather than triggering format validation failures.
 */
function stripEmptyStrings(obj) {
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => {
        if (typeof value === 'string' && value.trim() === '')
            return [key, undefined];
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            return [key, stripEmptyStrings(value)];
        }
        return [key, value];
    }));
}
/**
 * Formats Zod errors into a human-readable message
 */
function formatZodError(error) {
    const messages = [];
    messages.push('❌ Validation failed:\n');
    const issues = error.issues;
    issues.forEach((err, index) => {
        const fieldPath = err.path.length > 0 ? err.path.join('.') : 'input';
        messages.push(`  ${index + 1}. Field "${fieldPath}": ${err.message}`);
        // Add context for specific error types (Zod v4 issue shapes)
        if (err.code === 'invalid_type') {
            const typeErr = err;
            if (typeErr.expected != null) {
                const received = typeErr.input !== undefined ? typeof typeErr.input : 'undefined';
                messages.push(`     Expected: ${typeErr.expected}, Received: ${received}`);
            }
        }
        else if (err.code === 'invalid_format') {
            const formatErr = err;
            const receivedValue = formatErr.input;
            if (receivedValue === undefined || receivedValue === null || receivedValue === '') {
                messages.push(`     Received: ${receivedValue === '' ? '(empty string)' : 'undefined'}`);
            }
            else {
                messages.push(`     Received: "${receivedValue}"`);
            }
        }
        else if (err.code === 'invalid_value') {
            const valueErr = err;
            if (valueErr.values?.length) {
                messages.push(`     Allowed values: ${valueErr.values.join(', ')}`);
            }
        }
        else if (err.code === 'too_small') {
            const smallErr = err;
            if (smallErr.minimum !== undefined) {
                if (smallErr.origin === 'string') {
                    messages.push(`     Minimum length: ${smallErr.minimum} characters`);
                }
                else if (smallErr.origin === 'number' || smallErr.origin === 'int') {
                    messages.push(`     Minimum value: ${smallErr.minimum}`);
                }
            }
        }
        else if (err.code === 'too_big') {
            const bigErr = err;
            if (bigErr.maximum !== undefined) {
                if (bigErr.origin === 'string') {
                    messages.push(`     Maximum length: ${bigErr.maximum} characters`);
                }
                else if (bigErr.origin === 'number' || bigErr.origin === 'int') {
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
function validateTemplateData(template, data) {
    const sanitised = stripEmptyStrings(data);
    try {
        switch (template) {
            case 'DEPLOYMENT':
                return deploymentSchema.parse(sanitised);
            case 'TEST_RESULTS':
                return constants_1.testResultsTemplateSchema.parse(sanitised);
            case 'MIGRATION':
                return constants_1.migrationTemplateSchema.parse(sanitised);
            case 'CUSTOM_TABLE':
                return constants_1.customTableTemplateSchema.parse(sanitised);
            default:
                throw new Error(`Unknown template type: ${template}`);
        }
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
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
function getActionInputs() {
    return {
        apiKey: core.getInput('api-key', { required: true }),
        prNumber: parseInt(core.getInput('pr-number', { required: true }), 10),
        comment: core.getInput('comment', { required: false }),
        template: core.getInput('template', { required: false }),
        templateData: core.getInput('template-data', { required: false }),
        testResults: core.getInput('test-results', { required: false }),
        stickyId: core.getInput('sticky-id', { required: false }),
        apiUrl: core.getInput('api-url', { required: false }) || 'https://dev-herald.com/api/v1/github'
    };
}
/**
 * Validates all raw inputs using Zod
 */
function validateInputs(inputs) {
    try {
        rawInputsSchema.parse(inputs);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            throw new Error(formatZodError(error));
        }
        throw error;
    }
}
/**
 * Builds the request configuration based on inputs with Zod validation
 */
function buildRequestConfig(inputs) {
    const hasComment = inputs.comment.trim().length > 0;
    const hasTemplate = inputs.template.trim().length > 0;
    // Validate mode selection
    if (!hasComment && !hasTemplate) {
        throw new Error('❌ Must provide either "comment" (for simple comments) or "template" (for template comments)\n\n' +
            '💡 Example with comment:\n' +
            '  with:\n' +
            '    comment: "## Build Complete\\n✅ All checks passed!"\n\n' +
            '💡 Example with template:\n' +
            '  with:\n' +
            '    template: "DEPLOYMENT"\n' +
            '    template-data: \'{"projectName": "My App", "deploymentStatus": "success", "deploymentLink": "https://vercel.com/deployments/abc123"}\'');
    }
    if (hasComment && hasTemplate) {
        throw new Error('❌ Cannot provide both "comment" and "template" - choose one mode\n\n' +
            '💡 Either use:\n' +
            '  - "comment" for simple markdown comments\n' +
            '  - "template" + "template-data" for structured templates');
    }
    if (hasTemplate) {
        // Template mode - validate template type
        let validatedTemplate;
        try {
            validatedTemplate = constants_1.templateTypeSchema.parse(inputs.template);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                throw new Error(formatZodError(error));
            }
            throw error;
        }
        // Parse and validate template data
        const hasTemplateData = inputs.templateData && inputs.templateData.trim().length > 0;
        const hasTestResults = inputs.testResults && inputs.testResults.trim().length > 0;
        if (!hasTemplateData && !hasTestResults) {
            throw new Error('❌ template-data (or test-results) is required when using template mode\n\n' +
                `💡 The ${inputs.template} template requires JSON data. Example:\n` +
                '  with:\n' +
                `    template: "${inputs.template}"\n` +
                '    template-data: \'{"key": "value"}\'\n\n' +
                '💡 Or, for TEST_RESULTS, point directly at your test output file:\n' +
                '  with:\n' +
                '    template: "TEST_RESULTS"\n' +
                '    test-results: playwright-report/results.json');
        }
        let parsedData;
        try {
            parsedData = JSON.parse(inputs.templateData);
        }
        catch (error) {
            throw new Error(`❌ Invalid JSON in template-data: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
                '💡 Make sure your JSON is properly formatted:\n' +
                '  - Use single quotes around the JSON string in YAML\n' +
                '  - Escape special characters properly\n' +
                '  - Validate JSON at https://jsonlint.com\n\n' +
                'Example:\n' +
                '  template-data: \'{"projectName": "My App", "deploymentStatus": "success", "deploymentLink": "https://vercel.com/deployments/abc123"}\'');
        }
        // Validate template-specific data structure
        const validatedData = validateTemplateData(validatedTemplate, parsedData);
        const requestBody = {
            prNumber: inputs.prNumber,
            template: validatedTemplate,
            data: validatedData
        };
        // Validate and add sticky ID if provided
        if (inputs.stickyId && inputs.stickyId.trim().length > 0) {
            try {
                const validatedStickyId = constants_1.stickyIdSchema.parse(inputs.stickyId);
                requestBody.stickyId = validatedStickyId;
            }
            catch (error) {
                if (error instanceof zod_1.z.ZodError) {
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
    }
    else {
        // Simple comment mode - validate comment text
        let validatedComment;
        try {
            validatedComment = constants_1.simpleCommentSchema.parse(inputs.comment);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                throw new Error(formatZodError(error));
            }
            throw error;
        }
        core.info(`💬 Using simple comment mode`);
        const requestBody = {
            comment: validatedComment,
            prNumber: inputs.prNumber
        };
        // Validate and add sticky ID if provided
        if (inputs.stickyId && inputs.stickyId.trim().length > 0) {
            try {
                const validatedStickyId = constants_1.stickyIdSchema.parse(inputs.stickyId);
                requestBody.stickyId = validatedStickyId;
                core.info(`🔖 Sticky ID: ${requestBody.stickyId} (will update existing comment if found)`);
            }
            catch (error) {
                if (error instanceof zod_1.z.ZodError) {
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

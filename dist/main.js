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
const core = __importStar(require("@actions/core"));
const validation_1 = require("./validation");
const api_1 = require("./api");
const output_1 = require("./output");
const bulk_comment_1 = require("./bulk-comment");
const parse_signals_1 = require("./signals/parse-signals");
const execute_1 = require("./signals/execute");
const utils_1 = require("./signals/utils");
/**
 * Single-signal mode: one outcome becomes one template payload, one prose comment, a delete, or no post.
 */
async function applySingleSignal(inputs, parsedTestResults) {
    core.info(`📊 Running signal: ${inputs.signal}`);
    const outcome = await (0, execute_1.executeSignal)(inputs.signal, inputs, parsedTestResults);
    if (outcome.action === 'skip' || outcome.action === 'clear') {
        core.info(outcome.commentLog);
    }
    else if (outcome.action === 'table') {
        inputs.template = 'CUSTOM_TABLE';
        inputs.templateData = JSON.stringify(outcome.data);
    }
    else {
        inputs.comment = outcome.markdown;
    }
    return (0, bulk_comment_1.decideCommentAction)([outcome]);
}
/**
 * Bulk mode: render each section and join the ones that still have content.
 */
async function applyBulkSignals(inputs, signals) {
    const outcomes = [];
    for (const signal of signals) {
        core.info(`📊 Running signal: ${signal}`);
        const outcome = await (0, execute_1.executeSignal)(signal, inputs);
        if (outcome.action === 'skip' || outcome.action === 'clear') {
            core.info(outcome.sectionLog);
        }
        outcomes.push(outcome);
    }
    const decision = (0, bulk_comment_1.decideCommentAction)(outcomes);
    if (decision !== 'post')
        return decision;
    const comment = (0, bulk_comment_1.buildBulkComment)(outcomes, (0, utils_1.formatTimestamp)());
    if (!comment)
        return 'preserve';
    inputs.comment = comment;
    inputs.template = '';
    return 'post';
}
/**
 * Deletes the sticky comment for this pull request.
 * Without a sticky id there is nothing the API can target, so the step exits successfully.
 */
async function deleteStickyComment(inputs) {
    if (inputs.stickyId.trim().length === 0) {
        core.info('No sticky-id set, so the previous comment cannot be removed');
        return;
    }
    const endpoint = `${inputs.apiUrl}/comment`;
    const requestBody = { prNumber: inputs.prNumber, stickyId: inputs.stickyId.trim() };
    core.info(`🗑️ Deleting sticky comment "${requestBody.stickyId}" on PR #${inputs.prNumber}`);
    core.info(`📡 Endpoint: ${endpoint}`);
    core.debug(`📦 Request body: ${JSON.stringify(requestBody, null, 2)}`);
    const headers = (0, api_1.buildHeaders)(inputs.apiKey);
    const response = await (0, api_1.makeHttpRequest)(endpoint, 'DELETE', headers, requestBody);
    (0, output_1.processDeleteResponse)(response);
}
/**
 * Main action entry point
 */
async function run() {
    try {
        // ============================================================
        // PHASE 1: INPUT VALIDATION (before API call)
        // ============================================================
        core.info('🔍 Validating inputs...');
        const inputs = (0, validation_1.getActionInputs)();
        (0, validation_1.validateInputs)(inputs);
        core.info('✅ Input validation passed');
        const signals = inputs.signals.trim().length > 0 ? (0, parse_signals_1.parseSignalsInput)(inputs.signals) : [];
        // ============================================================
        // PHASE 1.5: PARSE TEST RESULTS FILES (single-signal mode only)
        // Bulk mode parses inside TEST_RESULTS so templateData is not overwritten.
        // ============================================================
        let parsedTestResults;
        if (signals.length === 0 && inputs.testResults && inputs.testResults.trim().length > 0) {
            parsedTestResults = await (0, execute_1.loadParsedTestResults)(inputs.testResults);
            inputs.templateData = JSON.stringify(parsedTestResults);
        }
        // ============================================================
        // PHASE 1.7: RUN SIGNAL OR SIGNALS
        // ============================================================
        let decision = 'post';
        if (signals.length > 0) {
            decision = await applyBulkSignals(inputs, signals);
        }
        else if (inputs.signal && inputs.signal.trim().length > 0) {
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
        const config = (0, validation_1.buildRequestConfig)(inputs);
        // ============================================================
        // PHASE 2: API REQUEST
        // ============================================================
        core.info(`🚀 Posting to PR #${inputs.prNumber}`);
        core.info(`📡 Endpoint: ${config.endpoint}`);
        core.debug(`📦 Request body: ${JSON.stringify(config.requestBody, null, 2)}`);
        const headers = (0, api_1.buildHeaders)(inputs.apiKey);
        const response = await (0, api_1.makeHttpRequest)(config.endpoint, 'POST', headers, config.requestBody);
        // ============================================================
        // PHASE 3: RESPONSE PROCESSING (after API call)
        // ============================================================
        (0, output_1.processResponse)(response, config.mode);
    }
    catch (error) {
        if (error instanceof Error) {
            // Error message is already formatted (from Zod validation or API error handling)
            core.setFailed(error.message);
        }
        else {
            core.setFailed('❌ Unknown error occurred');
        }
    }
}
run();

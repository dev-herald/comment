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
 * Single-signal mode: one outcome becomes one template payload, one prose comment, or no post.
 */
async function applySingleSignal(inputs, parsedTestResults) {
    core.info(`📊 Running signal: ${inputs.signal}`);
    const outcome = await (0, execute_1.executeSignal)(inputs.signal, inputs, parsedTestResults);
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
async function applyBulkSignals(inputs, signals) {
    const outcomes = [];
    for (const signal of signals) {
        core.info(`📊 Running signal: ${signal}`);
        const outcome = await (0, execute_1.executeSignal)(signal, inputs);
        if (outcome.action === 'skip') {
            core.info(outcome.sectionLog);
        }
        outcomes.push(outcome);
    }
    const comment = (0, bulk_comment_1.buildBulkComment)(outcomes, (0, utils_1.formatTimestamp)());
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
        if (signals.length > 0) {
            const shouldPost = await applyBulkSignals(inputs, signals);
            if (!shouldPost)
                return;
        }
        else if (inputs.signal && inputs.signal.trim().length > 0) {
            const shouldPost = await applySingleSignal(inputs, parsedTestResults);
            if (!shouldPost)
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

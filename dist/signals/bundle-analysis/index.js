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
exports.runBundleAnalysisSignal = runBundleAnalysisSignal;
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const next_1 = require("./adapters/next");
const diff_1 = require("./diff");
/**
 * Checks if a directory exists and contains at least one JSON file.
 */
function hasBundleReport(dirPath) {
    try {
        const resolved = path.resolve(dirPath);
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory())
            return false;
        const files = fs.readdirSync(resolved).filter((f) => f.endsWith('.json'));
        return files.length > 0;
    }
    catch {
        return false;
    }
}
/**
 * Runs the BUNDLE_ANALYSIS signal: loads baseline + current reports, diffs, returns CUSTOM_TABLE data.
 */
async function runBundleAnalysisSignal(inputs) {
    const reportPath = (inputs.bundleReportPath ?? '').trim();
    const baselinePath = (inputs.bundleBaselinePath ?? '').trim();
    const baselineBranch = inputs.bundleBaselineBranch.trim() || 'main';
    const maxChanges = Math.max(1, parseInt(inputs.maxChanges, 10) || 25);
    const showGzip = inputs.showGzip.toLowerCase() === 'true';
    if (!reportPath || !baselinePath) {
        throw new Error('❌ BUNDLE_ANALYSIS requires "bundle-report-path" and "bundle-baseline-path"\n\n' +
            '💡 Example:\n' +
            '  with:\n' +
            '    signal: "BUNDLE_ANALYSIS"\n' +
            '    bundle-report-path: ".next/analyze/"\n' +
            '    bundle-baseline-path: "baseline/"');
    }
    if (!hasBundleReport(baselinePath)) {
        core.info(`No baseline found on ${baselineBranch}. Once the analysis on ${baselineBranch} has run you'll see something.`);
        return { hasChanges: false, skip: true };
    }
    if (!hasBundleReport(reportPath)) {
        throw new Error(`❌ No bundle report found at "${reportPath}". Ensure ANALYZE=true build ran and produced JSON files.`);
    }
    core.info('📂 Loading bundle reports...');
    const baseline = (0, next_1.parseNextBundleReport)(baselinePath);
    const current = (0, next_1.parseNextBundleReport)(reportPath);
    core.info(`📋 Baseline: ${baseline.chunks.length} chunks, Current: ${current.chunks.length} chunks`);
    const result = (0, diff_1.computeDiff)(baseline, current, {
        maxChanges,
        showGzip,
    });
    if (result.hasChanges) {
        core.info(`📊 Found ${result.rows.length} bundle change(s)`);
        return {
            hasChanges: true,
            data: result.data,
        };
    }
    return {
        hasChanges: false,
        noChangesComment: result.noChangesComment,
    };
}

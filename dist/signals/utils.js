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
exports.isLocalDep = isLocalDep;
exports.isSemver = isSemver;
exports.getBaseSha = getBaseSha;
exports.readPackageJsonAtSha = readPackageJsonAtSha;
exports.readHeadPackageJson = readHeadPackageJson;
exports.batchOsvQuery = batchOsvQuery;
exports.formatTimestamp = formatTimestamp;
const https = __importStar(require("https"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const github = __importStar(require("@actions/github"));
// ============================================================================
// Version classifiers
// ============================================================================
/**
 * Returns true for versions that reference local paths or workspace protocols.
 * These are always skipped — they carry no meaningful version semantics.
 */
function isLocalDep(version) {
    return (version.startsWith('file:') ||
        version.startsWith('workspace:') ||
        version.startsWith('link:'));
}
/**
 * Returns true for plain semver-compatible version strings
 * (with optional leading range chars ~ ^ = < > or bare digits).
 */
function isSemver(version) {
    return /^[~^=<>]*\d+\.\d+\.\d+/.test(version);
}
// ============================================================================
// Git helpers
// ============================================================================
function getBaseSha(signalName) {
    const sha = github.context.payload?.pull_request?.base?.sha;
    if (sha)
        return sha;
    const baseBranch = process.env.GITHUB_BASE_REF;
    if (baseBranch) {
        try {
            return (0, child_process_1.execSync)(`git merge-base HEAD origin/${baseBranch}`, { encoding: 'utf8' }).trim();
        }
        catch {
            // ignore, fall through to error
        }
    }
    throw new Error(`❌ ${signalName}: Could not determine base SHA.\n` +
        '💡 Make sure this action runs on a pull_request event.');
}
function readPackageJsonAtSha(sha, signalName) {
    let raw;
    try {
        raw = (0, child_process_1.execSync)(`git show ${sha}:package.json`, { encoding: 'utf8' });
    }
    catch (err) {
        throw new Error(`❌ ${signalName}: Could not read package.json at base SHA ${sha}.\n` +
            `💡 Ensure fetch-depth: 0 is set in actions/checkout.\n` +
            `Details: ${err instanceof Error ? err.message : String(err)}`);
    }
    return JSON.parse(raw);
}
function readHeadPackageJson() {
    const raw = fs.readFileSync('package.json', 'utf8');
    return JSON.parse(raw);
}
// ============================================================================
// OSV batch query
// ============================================================================
async function batchOsvQuery(queries) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ queries });
        const options = {
            hostname: 'api.osv.dev',
            port: 443,
            path: '/v1/querybatch',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': 'Dev-Herald-GitHub-Action/1.0',
            },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch {
                    reject(new Error(`OSV response parse error: ${data}`));
                }
            });
        });
        req.on('error', (err) => reject(new Error(`OSV network error: ${err.message}`)));
        req.write(body);
        req.end();
    });
}
// ============================================================================
// Timestamp
// ============================================================================
function formatTimestamp() {
    const now = new Date();
    const day = now.getUTCDate();
    const month = now.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
    const year = now.getUTCFullYear();
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    return `${day} ${month} ${year} \u2022 ${hours}:${minutes} UTC`;
}

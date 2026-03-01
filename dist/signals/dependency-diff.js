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
exports.isSemver = exports.isLocalDep = void 0;
exports.isGitDep = isGitDep;
exports.classifyChange = classifyChange;
exports.formatVersion = formatVersion;
exports.formatChangeType = formatChangeType;
exports.formatCveDelta = formatCveDelta;
exports.runDependencyDiffSignal = runDependencyDiffSignal;
const core = __importStar(require("@actions/core"));
const utils_1 = require("./utils");
Object.defineProperty(exports, "isLocalDep", { enumerable: true, get: function () { return utils_1.isLocalDep; } });
Object.defineProperty(exports, "isSemver", { enumerable: true, get: function () { return utils_1.isSemver; } });
// ============================================================================
// Pure utility functions (exported for testing)
// ============================================================================
/**
 * Returns true for versions that reference a git remote.
 * These are included in the diff but classified as Unknown.
 */
function isGitDep(version) {
    return (version.startsWith('git+') ||
        version.startsWith('git://') ||
        version.startsWith('github:') ||
        version.startsWith('bitbucket:') ||
        version.startsWith('gitlab:'));
}
/**
 * Classifies a version change as major / minor / patch / unknown.
 * Non-semver versions on either side always produce 'unknown'.
 */
function classifyChange(from, to) {
    const clean = (v) => v.replace(/^[~^=<>]+/, '');
    const fromClean = clean(from);
    const toClean = clean(to);
    if (!(0, utils_1.isSemver)(fromClean) || !(0, utils_1.isSemver)(toClean))
        return 'unknown';
    const [fMaj, fMin] = fromClean.split('.').map(Number);
    const [tMaj, tMin, tPat] = toClean.split('.').map(Number);
    const [, , fPat] = fromClean.split('.').map(Number);
    if (tMaj !== fMaj)
        return 'major';
    if (tMin !== fMin)
        return 'minor';
    if (tPat !== fPat)
        return 'patch';
    return 'patch';
}
/**
 * Formats a version string for display in the table.
 * Git-based versions are truncated to `git…`.
 */
function formatVersion(version) {
    if (isGitDep(version))
        return 'git\u2026';
    return version;
}
/**
 * Formats the change type as the label shown in the Type column.
 */
function formatChangeType(type) {
    switch (type) {
        case 'major': return 'Major \uD83D\uDD34';
        case 'minor': return 'Minor \uD83D\uDFE1';
        case 'patch': return 'Patch \uD83D\uDFE2';
        case 'unknown': return 'Unknown \u2014';
    }
}
/**
 * Formats the CVE delta for display.
 * null  → '—' (N/A — non-semver or CVE check disabled)
 * 0     → '0'
 * +n    → '+n'
 * -n    → '-n'
 */
function formatCveDelta(delta) {
    if (delta === null)
        return '\u2014';
    if (delta === 0)
        return '0';
    if (delta > 0)
        return `+${delta}`;
    return `${delta}`;
}
// ============================================================================
// OSV CVE query
// ============================================================================
/**
 * Queries OSV in a single batch request and fills cveDelta on each change.
 * Only semver versions are queried; non-semver entries keep cveDelta = null.
 */
async function queryCVEDeltas(changes) {
    const queryable = changes.filter((c) => (0, utils_1.isSemver)(c.from.replace(/^[~^=<>]+/, '')) && (0, utils_1.isSemver)(c.to.replace(/^[~^=<>]+/, '')));
    if (queryable.length === 0)
        return;
    const queries = queryable.flatMap((c) => [
        { package: { name: c.name, ecosystem: 'npm' }, version: c.from.replace(/^[~^=<>]+/, '') },
        { package: { name: c.name, ecosystem: 'npm' }, version: c.to.replace(/^[~^=<>]+/, '') },
    ]);
    core.info(`🔍 Querying OSV for ${queryable.length} package(s)...`);
    const response = await (0, utils_1.batchOsvQuery)(queries);
    queryable.forEach((change, i) => {
        const fromResult = response.results[i * 2];
        const toResult = response.results[i * 2 + 1];
        const fromVulns = fromResult?.vulns?.length ?? 0;
        const toVulns = toResult?.vulns?.length ?? 0;
        change.cveDelta = toVulns - fromVulns;
    });
}
// ============================================================================
// Main signal entry point
// ============================================================================
async function runDependencyDiffSignal(inputs) {
    const includeRaw = inputs.include.trim() || 'dependencies,devDependencies,optionalDependencies';
    const enableCveRaw = inputs.enableCve.trim() || 'false';
    const maxDepsRaw = inputs.maxDeps.trim() || '25';
    const options = {
        includedFields: includeRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        enableCve: enableCveRaw.toLowerCase() === 'true',
        maxDeps: Math.max(1, parseInt(maxDepsRaw, 10) || 25),
    };
    core.info(`📦 Scanning dependency fields: ${options.includedFields.join(', ')}`);
    const baseSha = (0, utils_1.getBaseSha)('DEPENDENCY_DIFF');
    core.info(`🔀 Base SHA: ${baseSha}`);
    const basePkg = (0, utils_1.readPackageJsonAtSha)(baseSha, 'DEPENDENCY_DIFF');
    const headPkg = (0, utils_1.readHeadPackageJson)();
    const changes = [];
    for (const field of options.includedFields) {
        const baseDeps = basePkg[field] ?? {};
        const headDeps = headPkg[field] ?? {};
        for (const [name, headVersion] of Object.entries(headDeps)) {
            const baseVersion = baseDeps[name];
            // Only report version changes for packages that already existed in base
            if (!baseVersion)
                continue;
            if (baseVersion === headVersion)
                continue;
            // Skip purely local / workspace references
            if ((0, utils_1.isLocalDep)(baseVersion) || (0, utils_1.isLocalDep)(headVersion))
                continue;
            changes.push({
                name,
                from: baseVersion,
                to: headVersion,
                changeType: classifyChange(baseVersion, headVersion),
                cveDelta: null,
            });
        }
    }
    // Apply limit before CVE queries to avoid unnecessary API calls
    const limited = changes.slice(0, options.maxDeps);
    if (options.enableCve && limited.length > 0) {
        try {
            await queryCVEDeltas(limited);
        }
        catch (err) {
            core.warning(`⚠️ CVE query failed (OSV may be unavailable). CVE column will show '—'.\n` +
                `Details: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    if (limited.length === 0) {
        return {
            hasChanges: false,
            noChangesComment: `## \uD83D\uDCE6 Dependency changes\n\n` +
                `No dependency changes detected in the latest commit.\n\n` +
                `<sub>Updated ${(0, utils_1.formatTimestamp)()}</sub>`,
        };
    }
    core.info(`📋 Found ${limited.length} dependency change(s)`);
    const data = {
        title: `\uD83D\uDCE6 Dependency changes (${limited.length})`,
        headers: ['Package', 'From \u2192 To', 'Type', 'CVEs'],
        rows: limited.map((c) => ({
            cells: [
                { text: c.name },
                { text: `${formatVersion(c.from)} \u2192 ${formatVersion(c.to)}` },
                { text: formatChangeType(c.changeType) },
                { text: formatCveDelta(c.cveDelta) },
            ],
        })),
        showTimestamp: true,
    };
    return { hasChanges: true, data };
}

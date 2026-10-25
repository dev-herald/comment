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
exports.collectDependencyChanges = collectDependencyChanges;
exports.buildDependencyDiffData = buildDependencyDiffData;
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
    const queryable = changes.filter((c) => (0, utils_1.isSemver)(c.fromComparable.replace(/^[~^=<>]+/, '')) && (0, utils_1.isSemver)(c.toComparable.replace(/^[~^=<>]+/, '')));
    if (queryable.length === 0)
        return;
    const queries = queryable.flatMap((c) => [
        { package: { name: c.name, ecosystem: 'npm' }, version: c.fromComparable.replace(/^[~^=<>]+/, '') },
        { package: { name: c.name, ecosystem: 'npm' }, version: c.toComparable.replace(/^[~^=<>]+/, '') },
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
/**
 * Version changes per manifest path.
 * Specifier strings are compared as written, except `catalog:` specifiers, which
 * are resolved against that side's pnpm-workspace.yaml. A catalog version bump
 * with an unchanged package.json is a change. `workspace:*` still uses the head
 * package version only, so a local version move with the same alias is not.
 * A path that exists on only one side is an empty manifest on the other.
 * New manifests contribute nothing here; those packages belong to NEW_DEPENDENCY.
 */
function collectDependencyChanges(baseManifests, headManifests, includedFields, catalogs = { base: utils_1.EMPTY_PNPM_CATALOGS, head: utils_1.EMPTY_PNPM_CATALOGS }) {
    const baseByPath = new Map(baseManifests.map((m) => [m.path, m.manifest]));
    const headByPath = new Map(headManifests.map((m) => [m.path, m.manifest]));
    const versionsByName = (0, utils_1.indexPackageVersions)(headManifests);
    const paths = [...new Set([...baseByPath.keys(), ...headByPath.keys()])].sort();
    const changes = [];
    for (const path of paths) {
        const baseManifest = baseByPath.get(path) ?? {};
        const headManifest = headByPath.get(path) ?? {};
        const label = (0, utils_1.manifestLabel)(path);
        for (const field of includedFields) {
            const baseDeps = (0, utils_1.readDependencyField)(baseManifest, field);
            const headDeps = (0, utils_1.readDependencyField)(headManifest, field);
            for (const [name, headVersion] of Object.entries(headDeps)) {
                const baseVersion = baseDeps[name];
                // Only report version changes for packages that already existed in base.
                if (!baseVersion)
                    continue;
                // Skip filesystem installs. workspace: and catalog: specifiers are real rows.
                if ((0, utils_1.isLocalDep)(baseVersion) || (0, utils_1.isLocalDep)(headVersion))
                    continue;
                const fromSpec = (0, utils_1.resolveDependencySpecifier)(baseVersion, name, versionsByName, catalogs.base);
                const toSpec = (0, utils_1.resolveDependencySpecifier)(headVersion, name, versionsByName, catalogs.head);
                if (baseVersion === headVersion && fromSpec.comparable === toSpec.comparable)
                    continue;
                changes.push({
                    manifest: label,
                    name,
                    from: fromSpec.display,
                    to: toSpec.display,
                    fromComparable: fromSpec.comparable,
                    toComparable: toSpec.comparable,
                    changeType: classifyChange(fromSpec.comparable, toSpec.comparable),
                    cveDelta: null,
                });
            }
        }
    }
    return changes;
}
function buildDependencyDiffData(changes, options) {
    const { showManifest } = options;
    const headers = [
        ...(showManifest ? ['Workspace'] : []),
        'Package',
        'From \u2192 To',
        'Type',
        'CVEs',
    ];
    return {
        title: `\uD83D\uDCE6 Dependency changes (${changes.length})`,
        headers,
        rows: changes.map((c) => ({
            cells: [
                ...(showManifest ? [{ markdown: c.manifest }] : []),
                { markdown: c.name },
                { markdown: `${formatVersion(c.from)} \u2192 ${formatVersion(c.to)}` },
                { markdown: formatChangeType(c.changeType) },
                { markdown: formatCveDelta(c.cveDelta) },
            ],
        })),
        showTimestamp: true,
    };
}
// ============================================================================
// Main signal entry point
// ============================================================================
async function runDependencyDiffSignal(inputs) {
    const options = {
        includedFields: inputs.include
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        enableCve: inputs.enableCve.toLowerCase() === 'true',
        maxDeps: Math.max(1, parseInt(inputs.maxDeps, 10) || 25),
    };
    const { baseSha, headSha } = (0, utils_1.getComparisonShas)('DEPENDENCY_DIFF');
    core.info(`🔀 Base SHA: ${baseSha}`);
    core.info(`🔀 Head SHA: ${headSha}`);
    const baseManifests = (0, utils_1.loadManifestsAtSha)(baseSha, 'DEPENDENCY_DIFF');
    const headManifests = (0, utils_1.loadManifestsAtSha)(headSha, 'DEPENDENCY_DIFF');
    const baseCatalogs = (0, utils_1.loadPnpmCatalogsAtSha)(baseSha, 'DEPENDENCY_DIFF');
    const headCatalogs = (0, utils_1.loadPnpmCatalogsAtSha)(headSha, 'DEPENDENCY_DIFF');
    core.info(`📦 Scanning ${headManifests.length} package.json file(s); fields: ${options.includedFields.join(', ')}`);
    const changes = collectDependencyChanges(baseManifests, headManifests, options.includedFields, {
        base: baseCatalogs,
        head: headCatalogs,
    });
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
        return { hasChanges: false };
    }
    core.info(`📋 Found ${limited.length} dependency change(s)`);
    return {
        hasChanges: true,
        data: buildDependencyDiffData(limited, {
            showManifest: (0, utils_1.isMonorepo)([...baseManifests, ...headManifests]),
        }),
    };
}

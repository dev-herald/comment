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
exports.formatCveCount = formatCveCount;
exports.formatDownloads = formatDownloads;
exports.formatRelativeTime = formatRelativeTime;
exports.collectNewDependencies = collectNewDependencies;
exports.buildNewDependencyData = buildNewDependencyData;
exports.runNewDependencySignal = runNewDependencySignal;
const https = __importStar(require("https"));
const core = __importStar(require("@actions/core"));
const utils_1 = require("./utils");
// ============================================================================
// OSV CVE query
// ============================================================================
/**
 * Queries OSV in a single batch and sets cveCount on each dep.
 * One query per package (absolute count for the added version, not a delta).
 * Only semver versions are queried; non-semver entries keep cveCount = null.
 */
async function queryCVECounts(deps) {
    const queryable = deps.filter((d) => (0, utils_1.isSemver)(d.comparableVersion.replace(/^[~^=<>]+/, '')));
    if (queryable.length === 0)
        return;
    const queries = queryable.map((d) => ({
        package: { name: d.name, ecosystem: 'npm' },
        version: d.comparableVersion.replace(/^[~^=<>]+/, ''),
    }));
    core.info(`🔍 Querying OSV for ${queryable.length} new package(s)...`);
    const response = await (0, utils_1.batchOsvQuery)(queries);
    queryable.forEach((dep, i) => {
        dep.cveCount = response.results[i]?.vulns?.length ?? 0;
    });
}
// ============================================================================
// npm downloads API
// ============================================================================
function fetchNpmDownloads(packageName) {
    return new Promise((resolve) => {
        const encoded = encodeURIComponent(packageName);
        const options = {
            hostname: 'api.npmjs.org',
            port: 443,
            path: `/downloads/point/last-week/${encoded}`,
            method: 'GET',
            headers: { 'User-Agent': 'Dev-Herald-GitHub-Action/1.0' },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(typeof parsed.downloads === 'number' ? parsed.downloads : null);
                }
                catch {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.end();
    });
}
async function queryNpmDownloads(deps) {
    const targets = deps.filter((d) => !d.workspace);
    if (targets.length === 0)
        return;
    core.info(`📊 Fetching weekly downloads for ${targets.length} package(s)...`);
    const results = await Promise.all(targets.map((d) => fetchNpmDownloads(d.name)));
    targets.forEach((dep, i) => { dep.weeklyDownloads = results[i] ?? null; });
}
// ============================================================================
// deps.dev version API
// ============================================================================
function fetchDepsDevVersion(packageName, version) {
    return new Promise((resolve) => {
        const cleanVersion = version.replace(/^[~^=<>]+/, '');
        if (!(0, utils_1.isSemver)(cleanVersion)) {
            resolve(null);
            return;
        }
        const encodedName = encodeURIComponent(packageName);
        const encodedVersion = encodeURIComponent(cleanVersion);
        const options = {
            hostname: 'api.deps.dev',
            port: 443,
            path: `/v3/systems/npm/packages/${encodedName}/versions/${encodedVersion}`,
            method: 'GET',
            headers: { 'User-Agent': 'Dev-Herald-GitHub-Action/1.0' },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed.publishedAt ?? null);
                }
                catch {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.end();
    });
}
async function queryDepsDevStats(deps) {
    const targets = deps.filter((d) => !d.workspace);
    if (targets.length === 0)
        return;
    core.info(`📅 Fetching release dates for ${targets.length} package(s)...`);
    const results = await Promise.all(targets.map((d) => fetchDepsDevVersion(d.name, d.comparableVersion)));
    targets.forEach((dep, i) => { dep.publishedAt = results[i] ?? null; });
}
// ============================================================================
// Formatters
// ============================================================================
/**
 * Formats an absolute CVE count.
 * null  → '—' (CVE check disabled or non-semver)
 * 0     → '0'
 * N > 0 → '+N 🚨'
 */
function formatCveCount(count) {
    if (count === null)
        return '\u2014';
    if (count === 0)
        return '0';
    return `+${count} \uD83D\uDEA8`;
}
/**
 * Formats a weekly download count into a human-readable string.
 * null → '—'
 */
function formatDownloads(n) {
    if (n === null)
        return '\u2014';
    if (n >= 1000000)
        return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000)
        return `${(n / 1000).toFixed(1)}k`;
    return `${n}`;
}
/**
 * Formats an RFC3339 date string as a relative time string.
 * null → '—'
 */
function formatRelativeTime(dateStr) {
    if (!dateStr)
        return '\u2014';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime()))
        return '\u2014';
    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 1)
        return 'today';
    if (diffDays < 7)
        return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    const weeks = Math.floor(diffDays / 7);
    if (diffDays < 30)
        return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    const months = Math.floor(diffDays / 30);
    if (diffDays < 365)
        return `${months} month${months === 1 ? '' : 's'} ago`;
    const years = Math.floor(diffDays / 365);
    return `${years} year${years === 1 ? '' : 's'} ago`;
}
/**
 * Packages present on head and absent from the same manifest path on base.
 * A brand-new package.json contributes every dependency it declares.
 * `catalog:` specifiers resolve against the head pnpm-workspace.yaml.
 */
function collectNewDependencies(baseManifests, headManifests, includedFields, catalogs = utils_1.EMPTY_PNPM_CATALOGS) {
    const baseByPath = new Map(baseManifests.map((m) => [m.path, m.manifest]));
    const headByPath = new Map(headManifests.map((m) => [m.path, m.manifest]));
    const versionsByName = (0, utils_1.indexPackageVersions)(headManifests);
    const paths = [...new Set([...baseByPath.keys(), ...headByPath.keys()])].sort();
    const newDeps = [];
    for (const path of paths) {
        const baseManifest = baseByPath.get(path) ?? {};
        const headManifest = headByPath.get(path) ?? {};
        const label = (0, utils_1.manifestLabel)(path);
        for (const field of includedFields) {
            const baseDeps = (0, utils_1.readDependencyField)(baseManifest, field);
            const headDeps = (0, utils_1.readDependencyField)(headManifest, field);
            for (const [name, version] of Object.entries(headDeps)) {
                if (baseDeps[name] !== undefined)
                    continue;
                if ((0, utils_1.isLocalDep)(version))
                    continue;
                const spec = (0, utils_1.resolveDependencySpecifier)(version, name, versionsByName, catalogs);
                newDeps.push({
                    manifest: label,
                    name,
                    version: spec.display,
                    comparableVersion: spec.comparable,
                    workspace: (0, utils_1.isWorkspaceDep)(version),
                    cveCount: null,
                    weeklyDownloads: null,
                    publishedAt: null,
                });
            }
        }
    }
    return newDeps;
}
function buildNewDependencyData(deps, options) {
    const { showManifest } = options;
    const headers = [
        ...(showManifest ? ['Workspace'] : []),
        'Package',
        'Version',
        'CVEs',
        'Weekly DL',
        'Last Release',
    ];
    return {
        title: `\uD83D\uDCE6 New dependencies added (${deps.length})`,
        headers,
        rows: deps.map((d) => ({
            cells: [
                ...(showManifest ? [{ markdown: d.manifest }] : []),
                { markdown: d.name },
                { markdown: d.version },
                { markdown: formatCveCount(d.cveCount) },
                { markdown: formatDownloads(d.weeklyDownloads) },
                { markdown: formatRelativeTime(d.publishedAt) },
            ],
        })),
        showTimestamp: true,
    };
}
// ============================================================================
// Main signal entry point
// ============================================================================
async function runNewDependencySignal(inputs) {
    const options = {
        includedFields: inputs.include
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        enableCve: inputs.enableCve.toLowerCase() === 'true',
        maxDeps: Math.max(1, parseInt(inputs.maxDeps, 10) || 25),
    };
    const baseSha = (0, utils_1.getBaseSha)('NEW_DEPENDENCY');
    core.info(`🔀 Base SHA: ${baseSha}`);
    const baseManifests = (0, utils_1.loadManifestsAtSha)(baseSha, 'NEW_DEPENDENCY');
    const headManifests = (0, utils_1.loadManifestsAtSha)('HEAD', 'NEW_DEPENDENCY');
    const headCatalogs = (0, utils_1.loadPnpmCatalogsAtSha)('HEAD', 'NEW_DEPENDENCY');
    core.info(`📦 Scanning ${headManifests.length} package.json file(s); fields: ${options.includedFields.join(', ')}`);
    const newDeps = collectNewDependencies(baseManifests, headManifests, options.includedFields, headCatalogs);
    // Apply limit before any API queries to avoid unnecessary calls
    const limited = newDeps.slice(0, options.maxDeps);
    if (limited.length === 0) {
        return {
            hasChanges: false,
            noChangesComment: `## \uD83D\uDCE6 New dependencies added\n\n` +
                `No new dependencies detected in this PR.\n\n` +
                `<sub>Updated ${(0, utils_1.formatTimestamp)()}</sub>`,
        };
    }
    core.info(`📋 Found ${limited.length} new dependency(ies)`);
    // Run all enrichment queries concurrently
    await Promise.all([
        options.enableCve
            ? queryCVECounts(limited).catch((err) => {
                core.warning(`⚠️ CVE query failed (OSV may be unavailable). CVE column will show '—'.\n` +
                    `Details: ${err instanceof Error ? err.message : String(err)}`);
            })
            : Promise.resolve(),
        queryNpmDownloads(limited).catch((err) => {
            core.warning(`⚠️ npm downloads query failed. Weekly DL column will show '—'.\n` +
                `Details: ${err instanceof Error ? err.message : String(err)}`);
        }),
        queryDepsDevStats(limited).catch((err) => {
            core.warning(`⚠️ deps.dev query failed. Last Release column will show '—'.\n` +
                `Details: ${err instanceof Error ? err.message : String(err)}`);
        }),
    ]);
    return {
        hasChanges: true,
        data: buildNewDependencyData(limited, {
            showManifest: (0, utils_1.isMonorepo)([...baseManifests, ...headManifests]),
        }),
    };
}

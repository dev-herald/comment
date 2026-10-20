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
exports.isWorkspaceDep = isWorkspaceDep;
exports.isSemver = isSemver;
exports.getBaseSha = getBaseSha;
exports.isTrackedPackageJson = isTrackedPackageJson;
exports.manifestLabel = manifestLabel;
exports.isMonorepo = isMonorepo;
exports.readDependencyField = readDependencyField;
exports.indexPackageVersions = indexPackageVersions;
exports.resolveDependencySpecifier = resolveDependencySpecifier;
exports.loadManifestsAtSha = loadManifestsAtSha;
exports.batchOsvQuery = batchOsvQuery;
exports.formatTimestamp = formatTimestamp;
const https = __importStar(require("https"));
const core = __importStar(require("@actions/core"));
const child_process_1 = require("child_process");
const github = __importStar(require("@actions/github"));
const zod_1 = require("zod");
// ============================================================================
// Version classifiers
// ============================================================================
/**
 * Returns true for versions that reference a filesystem path (`file:` or `link:`).
 * These are skipped — they are path installs, not a named package version.
 * `workspace:` is not local; callers treat it as a dependency.
 */
function isLocalDep(version) {
    return version.startsWith('file:') || version.startsWith('link:');
}
/**
 * Returns true for pnpm, Yarn Berry, and Bun workspace protocol specifiers.
 * npm does not use this protocol.
 */
function isWorkspaceDep(version) {
    return version.startsWith('workspace:');
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
const manifestSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown());
const packageIdentitySchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    version: zod_1.z.string().min(1),
});
const dependencyMapSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.string().min(1));
/** Bare `workspace:*`, `workspace:^`, and `workspace:~` mean the workspace package's current version. */
const BARE_WORKSPACE_ALIAS = /^(?:\*|\^|~)$/;
/**
 * True for a repo-relative path that is a package manifest and not inside node_modules.
 */
function isTrackedPackageJson(path) {
    if (path.split('/').includes('node_modules'))
        return false;
    return path === 'package.json' || path.endsWith('/package.json');
}
/**
 * Directory shown in the Workspace column. The repo root is `root`.
 */
function manifestLabel(packageJsonPath) {
    if (packageJsonPath === 'package.json')
        return 'root';
    return packageJsonPath.replace(/\/package\.json$/, '');
}
/**
 * True when the scanned trees contain more than one package.json.
 * A single manifest, at the root or nested, is not a monorepo.
 */
function isMonorepo(manifests) {
    return new Set(manifests.map((m) => m.path)).size > 1;
}
function readDependencyField(manifest, field) {
    const parsed = dependencyMapSchema.safeParse(manifest[field]);
    return parsed.success ? parsed.data : {};
}
/**
 * Maps a package `name` to its `version` in the head tree.
 * A name that appears with two different versions is left out, so we do not
 * guess which workspace package a `workspace:*` specifier points at.
 */
function indexPackageVersions(manifests) {
    const index = new Map();
    const ambiguous = new Set();
    for (const { manifest } of manifests) {
        const parsed = packageIdentitySchema.safeParse(manifest);
        if (!parsed.success)
            continue;
        const { name, version } = parsed.data;
        const existing = index.get(name);
        if (existing !== undefined && existing !== version) {
            ambiguous.add(name);
            continue;
        }
        index.set(name, version);
    }
    for (const name of ambiguous)
        index.delete(name);
    return index;
}
/**
 * Bare `workspace:*`, `workspace:^`, and `workspace:~` use the local package version.
 * `workspace:^1.2.3` keeps the range after the protocol.
 * Anything else, including an alias we cannot resolve, stays as written.
 */
function resolveDependencySpecifier(specifier, depName, versionsByName) {
    if (!isWorkspaceDep(specifier)) {
        return { display: specifier, comparable: specifier };
    }
    const rest = specifier.slice('workspace:'.length);
    const resolved = BARE_WORKSPACE_ALIAS.test(rest)
        ? versionsByName.get(depName) ?? null
        : rest;
    if (!resolved || resolved === specifier) {
        return { display: specifier, comparable: specifier };
    }
    return {
        display: `${specifier} (${resolved})`,
        comparable: resolved,
    };
}
function gitText(args, signalName, headline) {
    try {
        return (0, child_process_1.execFileSync)('git', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    }
    catch (err) {
        throw new Error(`❌ ${signalName}: ${headline}\n` +
            `💡 Ensure fetch-depth: 0 is set in actions/checkout.\n` +
            `Details: ${err instanceof Error ? err.message : String(err)}`);
    }
}
function parseManifest(raw, path, sha, signalName) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (err) {
        core.warning(`⚠️ ${signalName}: Skipping ${path} at ${sha} because it is not valid JSON. ` +
            `${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
    const manifest = manifestSchema.safeParse(parsed);
    if (!manifest.success) {
        core.warning(`⚠️ ${signalName}: Skipping ${path} at ${sha} because it is not a JSON object.`);
        return null;
    }
    return manifest.data;
}
/**
 * Every tracked package.json at `sha`.
 * Paths come from `git ls-tree -z` so names with spaces stay intact, and the
 * read does not depend on the job working directory.
 * One invalid manifest is skipped. A git or fetch-depth failure still throws.
 */
function loadManifestsAtSha(sha, signalName) {
    const listing = gitText(['ls-tree', '-r', '-z', '--name-only', '--', sha], signalName, `Could not list files at SHA ${sha}.`);
    const paths = listing.split('\0').filter(isTrackedPackageJson).sort();
    const manifests = [];
    for (const path of paths) {
        const raw = gitText(['show', `${sha}:${path}`], signalName, `Could not read ${path} at SHA ${sha}.`);
        const manifest = parseManifest(raw, path, sha, signalName);
        if (manifest)
            manifests.push({ path, manifest });
    }
    return manifests;
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

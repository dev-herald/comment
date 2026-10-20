import * as https from 'https';
import { execFileSync, execSync } from 'child_process';
import * as github from '@actions/github';

// ============================================================================
// Shared types
// ============================================================================

export interface OsvQuery {
  package: { name: string; ecosystem: string };
  version: string;
}

export interface OsvBatchResponse {
  results: Array<{ vulns?: Array<unknown> }>;
}

// ============================================================================
// Version classifiers
// ============================================================================

/**
 * Returns true for versions that reference a filesystem path (`file:` or `link:`).
 * These are skipped — they are path installs, not a named package version.
 * `workspace:` is not local; callers treat it as a dependency.
 */
export function isLocalDep(version: string): boolean {
  return version.startsWith('file:') || version.startsWith('link:');
}

/**
 * Returns true for pnpm, Yarn Berry, and Bun workspace protocol specifiers.
 * npm does not use this protocol.
 */
export function isWorkspaceDep(version: string): boolean {
  return version.startsWith('workspace:');
}

/**
 * Returns true for plain semver-compatible version strings
 * (with optional leading range chars ~ ^ = < > or bare digits).
 */
export function isSemver(version: string): boolean {
  return /^[~^=<>]*\d+\.\d+\.\d+/.test(version);
}

// ============================================================================
// Git helpers
// ============================================================================

export function getBaseSha(signalName: string): string {
  const sha = github.context.payload?.pull_request?.base?.sha as string | undefined;
  if (sha) return sha;

  const baseBranch = process.env.GITHUB_BASE_REF;
  if (baseBranch) {
    try {
      return execSync(`git merge-base HEAD origin/${baseBranch}`, { encoding: 'utf8' }).trim();
    } catch {
      // ignore, fall through to error
    }
  }

  throw new Error(
    `❌ ${signalName}: Could not determine base SHA.\n` +
    '💡 Make sure this action runs on a pull_request event.'
  );
}

export interface LoadedManifest {
  path: string;
  manifest: Record<string, unknown>;
}

/** Bare `workspace:*`, `workspace:^`, and `workspace:~` mean the workspace package's current version. */
const BARE_WORKSPACE_ALIAS = /^(?:\*|\^|~)$/;

/**
 * True for a repo-relative path that is a package manifest and not inside node_modules.
 */
export function isTrackedPackageJson(path: string): boolean {
  if (path.split('/').includes('node_modules')) return false;
  return path === 'package.json' || path.endsWith('/package.json');
}

/**
 * Directory shown in the Manifest column. The repo root is `.`.
 */
export function manifestLabel(packageJsonPath: string): string {
  if (packageJsonPath === 'package.json') return '.';
  return packageJsonPath.replace(/\/package\.json$/, '');
}

export function readDependencyField(
  manifest: Record<string, unknown>,
  field: string,
): Record<string, string> {
  const value = manifest[field];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const deps: Record<string, string> = {};
  for (const [name, version] of Object.entries(value as Record<string, unknown>)) {
    if (typeof version === 'string') deps[name] = version;
  }
  return deps;
}

/**
 * Maps package name to its `version` field using the head tree.
 * Later paths win when two manifests share a name, so the result is stable.
 */
export function indexPackageVersions(manifests: LoadedManifest[]): Map<string, string> {
  const index = new Map<string, string>();
  const sorted = [...manifests].sort((a, b) => a.path.localeCompare(b.path));
  for (const { manifest } of sorted) {
    const name = manifest.name;
    const version = manifest.version;
    if (typeof name === 'string' && name.length > 0 && typeof version === 'string' && version.length > 0) {
      index.set(name, version);
    }
  }
  return index;
}

/**
 * Semver (or range) used for classification and OSV.
 * Bare workspace aliases resolve through `versionsByName`. An explicit
 * `workspace:^1.2.3` keeps the range after the protocol.
 * Returns null when a bare alias has no matching local package.
 */
export function workspaceComparableVersion(
  specifier: string,
  depName: string,
  versionsByName: Map<string, string>,
): string | null {
  if (!isWorkspaceDep(specifier)) return null;
  const rest = specifier.slice('workspace:'.length);
  if (BARE_WORKSPACE_ALIAS.test(rest)) {
    return versionsByName.get(depName) ?? null;
  }
  return rest;
}

export function comparableDependencyVersion(
  specifier: string,
  depName: string,
  versionsByName: Map<string, string>,
): string {
  if (!isWorkspaceDep(specifier)) return specifier;
  return workspaceComparableVersion(specifier, depName, versionsByName) ?? specifier;
}

/**
 * Specifier text for the table. Resolved workspace versions are appended in parentheses.
 */
export function formatDependencyVersion(
  specifier: string,
  depName: string,
  versionsByName: Map<string, string>,
): string {
  if (!isWorkspaceDep(specifier)) return specifier;
  const resolved = workspaceComparableVersion(specifier, depName, versionsByName);
  if (resolved && resolved !== specifier) return `${specifier} (${resolved})`;
  return specifier;
}

function gitText(args: string[], signalName: string, headline: string): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  } catch (err) {
    throw new Error(
      `❌ ${signalName}: ${headline}\n` +
      `💡 Ensure fetch-depth: 0 is set in actions/checkout.\n` +
      `Details: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function parseManifest(
  raw: string,
  path: string,
  sha: string,
  signalName: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `❌ ${signalName}: ${path} at SHA ${sha} is not valid JSON.\n` +
      `Details: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`❌ ${signalName}: ${path} at SHA ${sha} is not a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Every tracked package.json at `sha`, read from git so the working directory cannot change which file is used.
 */
export function loadManifestsAtSha(sha: string, signalName: string): LoadedManifest[] {
  const listing = gitText(
    ['ls-tree', '-r', '--name-only', sha],
    signalName,
    `Could not list files at SHA ${sha}.`,
  );
  const paths = listing
    .split('\n')
    .map((line) => line.trim())
    .filter(isTrackedPackageJson)
    .sort();

  return paths.map((path) => {
    const raw = gitText(
      ['show', `${sha}:${path}`],
      signalName,
      `Could not read ${path} at SHA ${sha}.`,
    );
    return { path, manifest: parseManifest(raw, path, sha, signalName) };
  });
}

// ============================================================================
// OSV batch query
// ============================================================================

export async function batchOsvQuery(queries: OsvQuery[]): Promise<OsvBatchResponse> {
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
          resolve(JSON.parse(data) as OsvBatchResponse);
        } catch {
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

export function formatTimestamp(): string {
  const now = new Date();
  const day = now.getUTCDate();
  const month = now.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  const year = now.getUTCFullYear();
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} \u2022 ${hours}:${minutes} UTC`;
}

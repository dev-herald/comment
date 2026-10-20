import * as https from 'https';
import * as core from '@actions/core';
import { execFileSync, execSync } from 'child_process';
import * as github from '@actions/github';
import { z } from 'zod';

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

const manifestSchema = z.record(z.string(), z.unknown());
const packageIdentitySchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
});
const dependencyMapSchema = z.record(z.string(), z.string().min(1));

export interface LoadedManifest {
  path: string;
  manifest: z.infer<typeof manifestSchema>;
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
  manifest: z.infer<typeof manifestSchema>,
  field: string,
): Record<string, string> {
  const parsed = dependencyMapSchema.safeParse(manifest[field]);
  return parsed.success ? parsed.data : {};
}

/**
 * Maps a package `name` to its `version` in the head tree.
 * A name that appears with two different versions is left out, so we do not
 * guess which workspace package a `workspace:*` specifier points at.
 */
export function indexPackageVersions(manifests: LoadedManifest[]): Map<string, string> {
  const index = new Map<string, string>();
  const ambiguous = new Set<string>();

  for (const { manifest } of manifests) {
    const parsed = packageIdentitySchema.safeParse(manifest);
    if (!parsed.success) continue;
    const { name, version } = parsed.data;

    const existing = index.get(name);
    if (existing !== undefined && existing !== version) {
      ambiguous.add(name);
      continue;
    }
    index.set(name, version);
  }

  for (const name of ambiguous) index.delete(name);
  return index;
}

export interface ResolvedSpecifier {
  /** Text shown in the table. Resolved workspace versions are appended in parentheses. */
  display: string;
  /** Semver or range used for the type column and the OSV query. */
  comparable: string;
}

/**
 * Bare `workspace:*`, `workspace:^`, and `workspace:~` use the local package version.
 * `workspace:^1.2.3` keeps the range after the protocol.
 * Anything else, including an alias we cannot resolve, stays as written.
 */
export function resolveDependencySpecifier(
  specifier: string,
  depName: string,
  versionsByName: Map<string, string>,
): ResolvedSpecifier {
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
): z.infer<typeof manifestSchema> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    core.warning(
      `⚠️ ${signalName}: Skipping ${path} at ${sha} because it is not valid JSON. ` +
      `${err instanceof Error ? err.message : String(err)}`,
    );
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
export function loadManifestsAtSha(sha: string, signalName: string): LoadedManifest[] {
  const listing = gitText(
    ['ls-tree', '-r', '-z', '--name-only', '--', sha],
    signalName,
    `Could not list files at SHA ${sha}.`,
  );
  const paths = listing.split('\0').filter(isTrackedPackageJson).sort();
  const manifests: LoadedManifest[] = [];

  for (const path of paths) {
    const raw = gitText(
      ['show', `${sha}:${path}`],
      signalName,
      `Could not read ${path} at SHA ${sha}.`,
    );
    const manifest = parseManifest(raw, path, sha, signalName);
    if (manifest) manifests.push({ path, manifest });
  }

  return manifests;
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

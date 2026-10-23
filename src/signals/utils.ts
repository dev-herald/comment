import * as https from 'https';
import * as core from '@actions/core';
import { execFileSync, spawnSync } from 'child_process';
import * as github from '@actions/github';
import { parse as parseYaml } from 'yaml';
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

export interface ComparisonShas {
  /** Merge base of the PR and its base branch. Manifests here are the "before" tree. */
  baseSha: string;
  /** Tip of the PR branch. Manifests here are the "after" tree. */
  headSha: string;
}

interface PullRequestTips {
  base?: { sha?: string };
  head?: { sha?: string };
}

/**
 * Commits for a three-dot dependency compare: merge base → PR head.
 * `pull_request.base.sha` is the base branch tip stored on the event, and
 * checkout `HEAD` is often `refs/pull/<n>/merge`, which GitHub rebuilds on the
 * current base. Diffing those two trees reports dependencies that landed on
 * the base branch after this PR branched. The merge base against
 * `pull_request.head.sha` is only what this PR introduced.
 */
export function getComparisonShas(signalName: string, cwd?: string): ComparisonShas {
  const pr = github.context.payload?.pull_request as PullRequestTips | undefined;
  const baseTip = pr?.base?.sha;
  const headTip = pr?.head?.sha;

  if (baseTip && headTip) {
    return {
      baseSha: gitMergeBase(baseTip, headTip, signalName, cwd),
      headSha: headTip,
    };
  }

  const baseBranch = process.env.GITHUB_BASE_REF;
  if (baseBranch) {
    return {
      baseSha: gitMergeBase('HEAD', `origin/${baseBranch}`, signalName, cwd),
      headSha: 'HEAD',
    };
  }

  throw new Error(
    `❌ ${signalName}: Could not determine which commits to compare.\n` +
    '💡 Make sure this action runs on a pull_request event with fetch-depth: 0.'
  );
}

function gitMergeBase(left: string, right: string, signalName: string, cwd?: string): string {
  let sha = '';
  try {
    sha = execFileSync('git', ['merge-base', left, right], { encoding: 'utf8', cwd }).trim();
  } catch (err) {
    throw new Error(
      `❌ ${signalName}: Could not determine the merge base of ${left} and ${right}.\n` +
      '💡 Ensure fetch-depth: 0 is set in actions/checkout so both pull request SHAs are available.\n' +
      `Details: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!sha) {
    throw new Error(`❌ ${signalName}: git merge-base of ${left} and ${right} returned an empty SHA.`);
  }
  return sha;
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
 * Directory shown in the Workspace column. The repo root is `root`.
 */
export function manifestLabel(packageJsonPath: string): string {
  if (packageJsonPath === 'package.json') return 'root';
  return packageJsonPath.replace(/\/package\.json$/, '');
}

/**
 * True when the scanned trees contain more than one package.json.
 * A single manifest, at the root or nested, is not a monorepo.
 */
export function isMonorepo(manifests: LoadedManifest[]): boolean {
  return new Set(manifests.map((m) => m.path)).size > 1;
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
  /** Text shown in the table. Resolved workspace and catalog versions are appended in parentheses. */
  display: string;
  /** Semver or range used for the type column and the OSV query. */
  comparable: string;
}

/** Versions from the `catalog` and `catalogs` maps in pnpm-workspace.yaml. */
export interface PnpmCatalogs {
  defaultCatalog: Record<string, string>;
  named: Record<string, Record<string, string>>;
}

export const EMPTY_PNPM_CATALOGS: PnpmCatalogs = { defaultCatalog: {}, named: {} };

const CATALOG_PROTOCOL = 'catalog:';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringMap(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key.length === 0) continue;
    if (typeof entry === 'string' && entry.length > 0) out[key] = entry;
  }
  return out;
}

/**
 * Reads pnpm's default `catalog` and named `catalogs` maps.
 * Empty input and invalid YAML return null. A workspace file with no catalog
 * keys returns empty maps. Other keys, including `packages`, are ignored.
 */
export function parsePnpmCatalogs(raw: string): PnpmCatalogs | null {
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;

  const named: Record<string, Record<string, string>> = {};
  if (isPlainObject(parsed.catalogs)) {
    for (const [name, table] of Object.entries(parsed.catalogs)) {
      if (name.length === 0) continue;
      named[name] = readStringMap(table);
    }
  }

  return {
    defaultCatalog: readStringMap(parsed.catalog),
    named,
  };
}

/**
 * `catalog:` uses the default catalog. `catalog:<name>` uses that named catalog
 * and does not fall back to the default. The lookup key is the dependency name.
 * Returns null when the specifier is not a catalog protocol.
 */
function lookupCatalogVersion(
  specifier: string,
  depName: string,
  catalogs: PnpmCatalogs,
): string | null {
  if (!specifier.startsWith(CATALOG_PROTOCOL)) return null;
  const catalogName = specifier.slice(CATALOG_PROTOCOL.length);
  const table = catalogName === '' ? catalogs.defaultCatalog : catalogs.named[catalogName];
  if (!table) return null;
  return table[depName] ?? null;
}

/**
 * Bare `workspace:*`, `workspace:^`, and `workspace:~` use the local package version.
 * `workspace:^1.2.3` keeps the range after the protocol.
 * `catalog:` and `catalog:<name>` use the matching pnpm catalog entry.
 * Anything else, including an alias we cannot resolve, stays as written.
 */
export function resolveDependencySpecifier(
  specifier: string,
  depName: string,
  versionsByName: Map<string, string>,
  catalogs: PnpmCatalogs = EMPTY_PNPM_CATALOGS,
): ResolvedSpecifier {
  if (specifier.startsWith(CATALOG_PROTOCOL)) {
    const resolved = lookupCatalogVersion(specifier, depName, catalogs);
    if (!resolved || resolved === specifier) {
      return { display: specifier, comparable: specifier };
    }
    return {
      display: `${specifier} (${resolved})`,
      comparable: resolved,
    };
  }

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

const MISSING_GIT_PATH = /does not exist in|exists on disk, but not in/;

/**
 * Catalogs from `pnpm-workspace.yaml` at `sha`.
 * A missing file is empty catalogs. Invalid YAML warns and is treated as empty.
 * Any other git or fetch-depth failure still throws.
 */
export function loadPnpmCatalogsAtSha(sha: string, signalName: string): PnpmCatalogs {
  const shown = spawnSync('git', ['show', `${sha}:pnpm-workspace.yaml`], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (shown.status !== 0) {
    const detail = `${shown.stderr ?? ''}\n${shown.error?.message ?? ''}`;
    if (MISSING_GIT_PATH.test(detail)) return EMPTY_PNPM_CATALOGS;
    throw new Error(
      `❌ ${signalName}: Could not read pnpm-workspace.yaml at SHA ${sha}.\n` +
      `💡 Ensure fetch-depth: 0 is set in actions/checkout.\n` +
      `Details: ${detail.trim()}`
    );
  }

  const catalogs = parsePnpmCatalogs(shown.stdout);
  if (!catalogs) {
    core.warning(
      `⚠️ ${signalName}: Skipping pnpm-workspace.yaml at ${sha} because it is not valid YAML.`,
    );
    return EMPTY_PNPM_CATALOGS;
  }
  return catalogs;
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

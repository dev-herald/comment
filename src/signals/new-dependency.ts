import * as https from 'https';
import * as core from '@actions/core';
import type { ActionInputs } from '../types';
import {
  type OsvQuery,
  type OsvBatchResponse,
  isLocalDep,
  isSemver,
  getBaseSha,
  readPackageJsonAtSha,
  readHeadPackageJson,
  batchOsvQuery,
  formatTimestamp,
} from './utils';

// ============================================================================
// Types
// ============================================================================

interface NewDep {
  name: string;
  version: string;
  cveCount: number | null;
  weeklyDownloads: number | null;
  publishedAt: string | null;
}

interface NewDependencyOptions {
  includedFields: string[];
  enableCve: boolean;
  maxDeps: number;
}

export interface NewDependencyResult {
  hasChanges: boolean;
  data?: Record<string, unknown>;
  noChangesComment?: string;
}

// ============================================================================
// OSV CVE query
// ============================================================================

/**
 * Queries OSV in a single batch and sets cveCount on each dep.
 * One query per package (absolute count for the added version, not a delta).
 * Only semver versions are queried; non-semver entries keep cveCount = null.
 */
async function queryCVECounts(deps: NewDep[]): Promise<void> {
  const queryable = deps.filter((d) => isSemver(d.version.replace(/^[~^=<>]+/, '')));

  if (queryable.length === 0) return;

  const queries: OsvQuery[] = queryable.map((d) => ({
    package: { name: d.name, ecosystem: 'npm' },
    version: d.version.replace(/^[~^=<>]+/, ''),
  }));

  core.info(`🔍 Querying OSV for ${queryable.length} new package(s)...`);
  const response: OsvBatchResponse = await batchOsvQuery(queries);

  queryable.forEach((dep, i) => {
    dep.cveCount = response.results[i]?.vulns?.length ?? 0;
  });
}

// ============================================================================
// npm downloads API
// ============================================================================

function fetchNpmDownloads(packageName: string): Promise<number | null> {
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
          const parsed = JSON.parse(data) as { downloads?: number };
          resolve(typeof parsed.downloads === 'number' ? parsed.downloads : null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.end();
  });
}

async function queryNpmDownloads(deps: NewDep[]): Promise<void> {
  core.info(`📊 Fetching weekly downloads for ${deps.length} package(s)...`);
  const results = await Promise.all(deps.map((d) => fetchNpmDownloads(d.name)));
  deps.forEach((dep, i) => { dep.weeklyDownloads = results[i] ?? null; });
}

// ============================================================================
// deps.dev version API
// ============================================================================

function fetchDepsDevVersion(packageName: string, version: string): Promise<string | null> {
  return new Promise((resolve) => {
    const cleanVersion = version.replace(/^[~^=<>]+/, '');
    if (!isSemver(cleanVersion)) {
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
          const parsed = JSON.parse(data) as { publishedAt?: string };
          resolve(parsed.publishedAt ?? null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.end();
  });
}

async function queryDepsDevStats(deps: NewDep[]): Promise<void> {
  core.info(`📅 Fetching release dates for ${deps.length} package(s)...`);
  const results = await Promise.all(deps.map((d) => fetchDepsDevVersion(d.name, d.version)));
  deps.forEach((dep, i) => { dep.publishedAt = results[i] ?? null; });
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
export function formatCveCount(count: number | null): string {
  if (count === null) return '\u2014';
  if (count === 0) return '0';
  return `+${count} \uD83D\uDEA8`;
}

/**
 * Formats a weekly download count into a human-readable string.
 * null → '—'
 */
export function formatDownloads(n: number | null): string {
  if (n === null) return '\u2014';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

/**
 * Formats an RFC3339 date string as a relative time string.
 * null → '—'
 */
export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '\u2014';

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '\u2014';

  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return 'today';
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  const weeks = Math.floor(diffDays / 7);
  if (diffDays < 30) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;

  const months = Math.floor(diffDays / 30);
  if (diffDays < 365) return `${months} month${months === 1 ? '' : 's'} ago`;

  const years = Math.floor(diffDays / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

// ============================================================================
// Main signal entry point
// ============================================================================

export async function runNewDependencySignal(inputs: ActionInputs): Promise<NewDependencyResult> {
  const includeRaw = inputs.include.trim() || 'dependencies,devDependencies,optionalDependencies';
  const enableCveRaw = inputs.enableCve.trim() || 'false';
  const maxDepsRaw = inputs.maxDeps.trim() || '25';

  const options: NewDependencyOptions = {
    includedFields: includeRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    enableCve: enableCveRaw.toLowerCase() === 'true',
    maxDeps: Math.max(1, parseInt(maxDepsRaw, 10) || 25),
  };

  core.info(`📦 Scanning dependency fields: ${options.includedFields.join(', ')}`);

  const baseSha = getBaseSha('NEW_DEPENDENCY');
  core.info(`🔀 Base SHA: ${baseSha}`);

  const basePkg = readPackageJsonAtSha(baseSha, 'NEW_DEPENDENCY');
  const headPkg = readHeadPackageJson();

  const newDeps: NewDep[] = [];

  for (const field of options.includedFields) {
    const baseDeps = basePkg[field] ?? {};
    const headDeps = headPkg[field] ?? {};

    for (const [name, version] of Object.entries(headDeps)) {
      // Only report packages that did NOT exist in base at all
      if (baseDeps[name] !== undefined) continue;

      // Skip purely local / workspace references
      if (isLocalDep(version)) continue;

      newDeps.push({
        name,
        version,
        cveCount: null,
        weeklyDownloads: null,
        publishedAt: null,
      });
    }
  }

  // Apply limit before any API queries to avoid unnecessary calls
  const limited = newDeps.slice(0, options.maxDeps);

  if (limited.length === 0) {
    return {
      hasChanges: false,
      noChangesComment:
        `## \uD83D\uDCE6 New dependencies added\n\n` +
        `No new dependencies detected in this PR.\n\n` +
        `<sub>Updated ${formatTimestamp()}</sub>`,
    };
  }

  core.info(`📋 Found ${limited.length} new dependency(ies)`);

  // Run all enrichment queries concurrently
  await Promise.all([
    options.enableCve
      ? queryCVECounts(limited).catch((err) => {
          core.warning(
            `⚠️ CVE query failed (OSV may be unavailable). CVE column will show '—'.\n` +
            `Details: ${err instanceof Error ? err.message : String(err)}`
          );
        })
      : Promise.resolve(),
    queryNpmDownloads(limited).catch((err) => {
      core.warning(
        `⚠️ npm downloads query failed. Weekly DL column will show '—'.\n` +
        `Details: ${err instanceof Error ? err.message : String(err)}`
      );
    }),
    queryDepsDevStats(limited).catch((err) => {
      core.warning(
        `⚠️ deps.dev query failed. Last Release column will show '—'.\n` +
        `Details: ${err instanceof Error ? err.message : String(err)}`
      );
    }),
  ]);

  const data = {
    title: `\uD83D\uDCE6 New dependencies added (${limited.length})`,
    headers: ['Package', 'Version', 'CVEs', 'Weekly DL', 'Last Release'],
    rows: limited.map((d) => ({
      cells: [
        { text: d.name },
        { text: d.version },
        { text: formatCveCount(d.cveCount) },
        { text: formatDownloads(d.weeklyDownloads) },
        { text: formatRelativeTime(d.publishedAt) },
      ],
    })),
    showTimestamp: true,
  };

  return { hasChanges: true, data };
}

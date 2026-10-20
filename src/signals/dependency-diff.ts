import * as core from '@actions/core';
import type { ActionInputs } from '../types';
import {
  type OsvQuery,
  type OsvBatchResponse,
  type LoadedManifest,
  isLocalDep,
  isSemver,
  getBaseSha,
  loadManifestsAtSha,
  readDependencyField,
  indexPackageVersions,
  comparableDependencyVersion,
  formatDependencyVersion,
  manifestLabel,
  batchOsvQuery,
  formatTimestamp,
} from './utils';

export { isLocalDep, isSemver };

// ============================================================================
// Types
// ============================================================================

type ChangeType = 'major' | 'minor' | 'patch' | 'unknown';

interface DepChange {
  manifest: string;
  name: string;
  from: string;
  to: string;
  fromComparable: string;
  toComparable: string;
  changeType: ChangeType;
  cveDelta: number | null;
}

interface DependencyDiffOptions {
  includedFields: string[];
  enableCve: boolean;
  maxDeps: number;
}

export interface DependencyDiffResult {
  hasChanges: boolean;
  data?: Record<string, unknown>;
  noChangesComment?: string;
}

// ============================================================================
// Pure utility functions (exported for testing)
// ============================================================================

/**
 * Returns true for versions that reference a git remote.
 * These are included in the diff but classified as Unknown.
 */
export function isGitDep(version: string): boolean {
  return (
    version.startsWith('git+') ||
    version.startsWith('git://') ||
    version.startsWith('github:') ||
    version.startsWith('bitbucket:') ||
    version.startsWith('gitlab:')
  );
}

/**
 * Classifies a version change as major / minor / patch / unknown.
 * Non-semver versions on either side always produce 'unknown'.
 */
export function classifyChange(from: string, to: string): ChangeType {
  const clean = (v: string) => v.replace(/^[~^=<>]+/, '');
  const fromClean = clean(from);
  const toClean = clean(to);

  if (!isSemver(fromClean) || !isSemver(toClean)) return 'unknown';

  const [fMaj, fMin] = fromClean.split('.').map(Number);
  const [tMaj, tMin, tPat] = toClean.split('.').map(Number);
  const [,, fPat] = fromClean.split('.').map(Number);

  if (tMaj !== fMaj) return 'major';
  if (tMin !== fMin) return 'minor';
  if (tPat !== fPat) return 'patch';
  return 'patch';
}

/**
 * Formats a version string for display in the table.
 * Git-based versions are truncated to `git…`.
 */
export function formatVersion(version: string): string {
  if (isGitDep(version)) return 'git\u2026';
  return version;
}

/**
 * Formats the change type as the label shown in the Type column.
 */
export function formatChangeType(type: ChangeType): string {
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
export function formatCveDelta(delta: number | null): string {
  if (delta === null) return '\u2014';
  if (delta === 0) return '0';
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}

// ============================================================================
// OSV CVE query
// ============================================================================

/**
 * Queries OSV in a single batch request and fills cveDelta on each change.
 * Only semver versions are queried; non-semver entries keep cveDelta = null.
 */
async function queryCVEDeltas(changes: DepChange[]): Promise<void> {
  const queryable = changes.filter(
    (c) => isSemver(c.fromComparable.replace(/^[~^=<>]+/, '')) && isSemver(c.toComparable.replace(/^[~^=<>]+/, ''))
  );

  if (queryable.length === 0) return;

  const queries: OsvQuery[] = queryable.flatMap((c) => [
    { package: { name: c.name, ecosystem: 'npm' }, version: c.fromComparable.replace(/^[~^=<>]+/, '') },
    { package: { name: c.name, ecosystem: 'npm' }, version: c.toComparable.replace(/^[~^=<>]+/, '') },
  ]);

  core.info(`🔍 Querying OSV for ${queryable.length} package(s)...`);
  const response: OsvBatchResponse = await batchOsvQuery(queries);

  queryable.forEach((change, i) => {
    const fromResult = response.results[i * 2];
    const toResult = response.results[i * 2 + 1];
    const fromVulns = fromResult?.vulns?.length ?? 0;
    const toVulns = toResult?.vulns?.length ?? 0;
    change.cveDelta = toVulns - fromVulns;
  });
}

/**
 * Version changes per manifest path. Specifier strings are compared as written.
 * A path that exists on only one side is an empty manifest on the other.
 * New manifests contribute nothing here; those packages belong to NEW_DEPENDENCY.
 */
export function collectDependencyChanges(
  baseManifests: LoadedManifest[],
  headManifests: LoadedManifest[],
  includedFields: string[],
): DepChange[] {
  const baseByPath = new Map(baseManifests.map((m) => [m.path, m.manifest]));
  const headByPath = new Map(headManifests.map((m) => [m.path, m.manifest]));
  const versionsByName = indexPackageVersions(headManifests);
  const paths = [...new Set([...baseByPath.keys(), ...headByPath.keys()])].sort();
  const changes: DepChange[] = [];

  for (const path of paths) {
    const baseManifest = baseByPath.get(path) ?? {};
    const headManifest = headByPath.get(path) ?? {};
    const label = manifestLabel(path);

    for (const field of includedFields) {
      const baseDeps = readDependencyField(baseManifest, field);
      const headDeps = readDependencyField(headManifest, field);

      for (const [name, headVersion] of Object.entries(headDeps)) {
        const baseVersion = baseDeps[name];

        // Only report version changes for packages that already existed in base
        if (!baseVersion) continue;
        if (baseVersion === headVersion) continue;

        // Skip filesystem installs. workspace: specifiers are real rows.
        if (isLocalDep(baseVersion) || isLocalDep(headVersion)) continue;

        const fromComparable = comparableDependencyVersion(baseVersion, name, versionsByName);
        const toComparable = comparableDependencyVersion(headVersion, name, versionsByName);

        changes.push({
          manifest: label,
          name,
          from: formatDependencyVersion(baseVersion, name, versionsByName),
          to: formatDependencyVersion(headVersion, name, versionsByName),
          fromComparable,
          toComparable,
          changeType: classifyChange(fromComparable, toComparable),
          cveDelta: null,
        });
      }
    }
  }

  return changes;
}

export function buildDependencyDiffData(changes: DepChange[]): Record<string, unknown> {
  const showManifest = changes.some((c) => c.manifest !== '.');
  const headers = [
    ...(showManifest ? ['Manifest'] : []),
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

export async function runDependencyDiffSignal(inputs: ActionInputs): Promise<DependencyDiffResult> {
  const options: DependencyDiffOptions = {
    includedFields: inputs.include
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    enableCve: inputs.enableCve.toLowerCase() === 'true',
    maxDeps: Math.max(1, parseInt(inputs.maxDeps, 10) || 25),
  };

  const baseSha = getBaseSha('DEPENDENCY_DIFF');
  core.info(`🔀 Base SHA: ${baseSha}`);

  const baseManifests = loadManifestsAtSha(baseSha, 'DEPENDENCY_DIFF');
  const headManifests = loadManifestsAtSha('HEAD', 'DEPENDENCY_DIFF');
  core.info(
    `📦 Scanning ${headManifests.length} package.json file(s); fields: ${options.includedFields.join(', ')}`,
  );

  const changes = collectDependencyChanges(baseManifests, headManifests, options.includedFields);

  // Apply limit before CVE queries to avoid unnecessary API calls
  const limited = changes.slice(0, options.maxDeps);

  if (options.enableCve && limited.length > 0) {
    try {
      await queryCVEDeltas(limited);
    } catch (err) {
      core.warning(
        `⚠️ CVE query failed (OSV may be unavailable). CVE column will show '—'.\n` +
        `Details: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (limited.length === 0) {
    return {
      hasChanges: false,
      noChangesComment:
        `## \uD83D\uDCE6 Dependency changes\n\n` +
        `No dependency changes detected in the latest commit.\n\n` +
        `<sub>Updated ${formatTimestamp()}</sub>`,
    };
  }

  core.info(`📋 Found ${limited.length} dependency change(s)`);

  return { hasChanges: true, data: buildDependencyDiffData(limited) };
}

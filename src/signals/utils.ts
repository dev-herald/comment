import * as https from 'https';
import * as fs from 'fs';
import { execSync } from 'child_process';
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
 * Returns true for versions that reference local paths or workspace protocols.
 * These are always skipped — they carry no meaningful version semantics.
 */
export function isLocalDep(version: string): boolean {
  return (
    version.startsWith('file:') ||
    version.startsWith('workspace:') ||
    version.startsWith('link:')
  );
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

export function readPackageJsonAtSha(
  sha: string,
  signalName: string
): Record<string, Record<string, string>> {
  let raw: string;
  try {
    raw = execSync(`git show ${sha}:package.json`, { encoding: 'utf8' });
  } catch (err) {
    throw new Error(
      `❌ ${signalName}: Could not read package.json at base SHA ${sha}.\n` +
      `💡 Ensure fetch-depth: 0 is set in actions/checkout.\n` +
      `Details: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return JSON.parse(raw);
}

export function readHeadPackageJson(): Record<string, Record<string, string>> {
  const raw = fs.readFileSync('package.json', 'utf8');
  return JSON.parse(raw);
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

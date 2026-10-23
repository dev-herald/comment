import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import * as github from '@actions/github';
import { afterEach, describe, expect, it } from 'vitest';
import { collectDependencyChanges } from '../../signals/dependency-diff';
import { collectNewDependencies } from '../../signals/new-dependency';
import { getComparisonShas, type LoadedManifest } from '../../signals/utils';

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: gitEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function manifestAt(cwd: string, sha: string): LoadedManifest[] {
  const raw = git(cwd, ['show', `${sha}:package.json`]);
  return [{ path: 'package.json', manifest: JSON.parse(raw) as Record<string, unknown> }];
}

describe('getComparisonShas', () => {
  const originalPayload = github.context.payload;
  const originalBaseRef = process.env.GITHUB_BASE_REF;
  let dir: string | undefined;

  afterEach(() => {
    github.context.payload = originalPayload;
    if (originalBaseRef === undefined) delete process.env.GITHUB_BASE_REF;
    else process.env.GITHUB_BASE_REF = originalBaseRef;
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('ignores a dependency added on the base branch after the PR diverged', () => {
    const root = path.join(process.cwd(), 'src/__tests__/test-data');
    mkdirSync(root, { recursive: true });
    dir = mkdtempSync(path.join(root, 'comparison-shas-'));
    git(dir, ['init', '-b', 'main']);
    writeFileSync(path.join(dir, 'package.json'), '{"dependencies":{"react":"18.0.0"}}\n');
    git(dir, ['add', 'package.json']);
    git(dir, ['commit', '-m', 'init']);
    const fork = git(dir, ['rev-parse', 'HEAD']);

    git(dir, ['checkout', '-b', 'pr']);
    git(dir, ['commit', '--allow-empty', '-m', 'pr work']);
    const head = git(dir, ['rev-parse', 'HEAD']);

    git(dir, ['checkout', 'main']);
    writeFileSync(path.join(dir, 'package.json'), '{"dependencies":{"react":"18.0.0","zod":"1.0.0"}}\n');
    git(dir, ['add', 'package.json']);
    git(dir, ['commit', '-m', 'main adds zod']);
    const baseTip = git(dir, ['rev-parse', 'HEAD']);

    github.context.payload = {
      pull_request: { base: { sha: baseTip }, head: { sha: head } },
    } as unknown as typeof github.context.payload;

    const shas = getComparisonShas('NEW_DEPENDENCY', dir);

    expect(shas).toEqual({ baseSha: fork, headSha: head });
    expect(collectNewDependencies(manifestAt(dir, shas.baseSha), manifestAt(dir, shas.headSha), ['dependencies'])).toEqual([]);
    expect(collectDependencyChanges(manifestAt(dir, shas.baseSha), manifestAt(dir, shas.headSha), ['dependencies'])).toEqual([]);
  });

  it('still reports a dependency this PR added', () => {
    const root = path.join(process.cwd(), 'src/__tests__/test-data');
    mkdirSync(root, { recursive: true });
    dir = mkdtempSync(path.join(root, 'comparison-shas-'));
    git(dir, ['init', '-b', 'main']);
    writeFileSync(path.join(dir, 'package.json'), '{"dependencies":{}}\n');
    git(dir, ['add', 'package.json']);
    git(dir, ['commit', '-m', 'init']);

    git(dir, ['checkout', '-b', 'pr']);
    writeFileSync(path.join(dir, 'package.json'), '{"dependencies":{"zod":"3.0.0"}}\n');
    git(dir, ['add', 'package.json']);
    git(dir, ['commit', '-m', 'pr adds zod']);
    const head = git(dir, ['rev-parse', 'HEAD']);

    git(dir, ['checkout', 'main']);
    const baseTip = git(dir, ['rev-parse', 'HEAD']);

    github.context.payload = {
      pull_request: { base: { sha: baseTip }, head: { sha: head } },
    } as unknown as typeof github.context.payload;

    const shas = getComparisonShas('NEW_DEPENDENCY', dir);
    const added = collectNewDependencies(
      manifestAt(dir, shas.baseSha),
      manifestAt(dir, shas.headSha),
      ['dependencies'],
    );

    expect(added).toEqual([expect.objectContaining({ name: 'zod', version: '3.0.0' })]);
  });

  it('still reports a version change this PR made', () => {
    const root = path.join(process.cwd(), 'src/__tests__/test-data');
    mkdirSync(root, { recursive: true });
    dir = mkdtempSync(path.join(root, 'comparison-shas-'));
    git(dir, ['init', '-b', 'main']);
    writeFileSync(path.join(dir, 'package.json'), '{"dependencies":{"react":"18.0.0"}}\n');
    git(dir, ['add', 'package.json']);
    git(dir, ['commit', '-m', 'init']);

    git(dir, ['checkout', '-b', 'pr']);
    writeFileSync(path.join(dir, 'package.json'), '{"dependencies":{"react":"19.0.0"}}\n');
    git(dir, ['add', 'package.json']);
    git(dir, ['commit', '-m', 'pr bumps react']);
    const head = git(dir, ['rev-parse', 'HEAD']);

    git(dir, ['checkout', 'main']);
    const baseTip = git(dir, ['rev-parse', 'HEAD']);

    github.context.payload = {
      pull_request: { base: { sha: baseTip }, head: { sha: head } },
    } as unknown as typeof github.context.payload;

    const shas = getComparisonShas('DEPENDENCY_DIFF', dir);
    const changes = collectDependencyChanges(
      manifestAt(dir, shas.baseSha),
      manifestAt(dir, shas.headSha),
      ['dependencies'],
    );

    expect(changes).toEqual([
      expect.objectContaining({ name: 'react', from: '18.0.0', to: '19.0.0', changeType: 'major' }),
    ]);
  });

  it('throws when the event has no pull request and no base ref', () => {
    github.context.payload = {} as unknown as typeof github.context.payload;
    delete process.env.GITHUB_BASE_REF;

    expect(() => getComparisonShas('NEW_DEPENDENCY')).toThrow(/pull_request event/);
  });
});

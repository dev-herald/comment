import { describe, it, expect } from 'vitest';
import {
  classifyChange,
  isLocalDep,
  isGitDep,
  isSemver,
  formatVersion,
  formatChangeType,
  formatCveDelta,
} from '../../signals/dependency-diff';

// ---------------------------------------------------------------------------
// isLocalDep
// ---------------------------------------------------------------------------

describe('isLocalDep', () => {
  it.each([
    'file:../shared',
    'file:./packages/utils',
    'workspace:*',
    'workspace:^1.0.0',
    'link:../local-pkg',
  ])('returns true for local ref "%s"', (v) => {
    expect(isLocalDep(v)).toBe(true);
  });

  it.each([
    '1.2.3',
    '^2.0.0',
    '~1.0.0',
    'git+https://github.com/org/repo.git',
    'latest',
  ])('returns false for non-local "%s"', (v) => {
    expect(isLocalDep(v)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isGitDep
// ---------------------------------------------------------------------------

describe('isGitDep', () => {
  it.each([
    'git+https://github.com/org/repo.git',
    'git://github.com/org/repo',
    'github:org/repo',
    'bitbucket:user/repo',
    'gitlab:user/repo',
  ])('returns true for git ref "%s"', (v) => {
    expect(isGitDep(v)).toBe(true);
  });

  it.each([
    '1.2.3',
    '^2.0.0',
    'file:../pkg',
    'workspace:*',
  ])('returns false for non-git "%s"', (v) => {
    expect(isGitDep(v)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSemver
// ---------------------------------------------------------------------------

describe('isSemver', () => {
  it.each([
    '1.2.3',
    '0.0.1',
    '14.1.0',
    '^3.0.0',
    '~1.6.2',
    '>=2.0.0',
    '=1.0.0',
    '<4.0.0',
  ])('recognises "%s" as semver', (v) => {
    expect(isSemver(v)).toBe(true);
  });

  it.each([
    'git+https://github.com/org/repo.git',
    'github:org/repo',
    'file:../pkg',
    'workspace:*',
    '*',
    'latest',
    'next',
  ])('rejects "%s" as non-semver', (v) => {
    expect(isSemver(v)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifyChange
// ---------------------------------------------------------------------------

describe('classifyChange', () => {
  it('detects a major bump', () => {
    expect(classifyChange('14.1.0', '15.0.0')).toBe('major');
  });

  it('detects a minor bump', () => {
    expect(classifyChange('1.5.0', '1.6.0')).toBe('minor');
  });

  it('detects a patch bump', () => {
    expect(classifyChange('1.6.2', '1.6.5')).toBe('patch');
  });

  it('handles range prefixes (^ and ~)', () => {
    expect(classifyChange('^1.6.2', '^1.6.5')).toBe('patch');
    expect(classifyChange('~14.0.0', '~15.0.0')).toBe('major');
  });

  it('returns unknown when from version is a git ref', () => {
    expect(classifyChange('git+https://github.com/org/repo.git#abc', '1.0.0')).toBe('unknown');
  });

  it('returns unknown when to version is a git ref', () => {
    expect(classifyChange('1.0.0', 'git+https://github.com/org/repo.git#def')).toBe('unknown');
  });

  it('returns unknown for bare non-semver tags like "latest"', () => {
    expect(classifyChange('latest', '1.0.0')).toBe('unknown');
  });

  it('returns unknown when both sides are git refs', () => {
    expect(
      classifyChange(
        'git+https://github.com/org/repo.git#abc',
        'git+https://github.com/org/repo.git#def'
      )
    ).toBe('unknown');
  });

  it('returns patch when versions are equal (edge case — no effective change)', () => {
    expect(classifyChange('1.0.0', '1.0.0')).toBe('patch');
  });
});

// ---------------------------------------------------------------------------
// formatVersion
// ---------------------------------------------------------------------------

describe('formatVersion', () => {
  it('returns the version unchanged for regular semver strings', () => {
    expect(formatVersion('1.2.3')).toBe('1.2.3');
    expect(formatVersion('^14.1.0')).toBe('^14.1.0');
  });

  it('truncates git+ URLs to "git…"', () => {
    expect(formatVersion('git+https://github.com/org/repo.git')).toBe('git\u2026');
  });

  it('truncates github: shorthand to "git…"', () => {
    expect(formatVersion('github:org/repo')).toBe('git\u2026');
  });

  it('truncates bitbucket: shorthand to "git…"', () => {
    expect(formatVersion('bitbucket:user/repo')).toBe('git\u2026');
  });
});

// ---------------------------------------------------------------------------
// formatChangeType
// ---------------------------------------------------------------------------

describe('formatChangeType', () => {
  it('formats major', () => expect(formatChangeType('major')).toContain('Major'));
  it('formats minor', () => expect(formatChangeType('minor')).toContain('Minor'));
  it('formats patch', () => expect(formatChangeType('patch')).toContain('Patch'));
  it('formats unknown', () => expect(formatChangeType('unknown')).toContain('Unknown'));
});

// ---------------------------------------------------------------------------
// formatCveDelta
// ---------------------------------------------------------------------------

describe('formatCveDelta', () => {
  it('returns em-dash for null (N/A)', () => {
    expect(formatCveDelta(null)).toBe('\u2014');
  });

  it('returns "0" for no change', () => {
    expect(formatCveDelta(0)).toBe('0');
  });

  it('returns "+n" for newly introduced CVEs', () => {
    expect(formatCveDelta(1)).toBe('+1');
    expect(formatCveDelta(3)).toBe('+3');
  });

  it('returns "-n" for resolved CVEs', () => {
    expect(formatCveDelta(-1)).toBe('-1');
    expect(formatCveDelta(-2)).toBe('-2');
  });
});

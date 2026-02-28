"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const dependency_diff_1 = require("../../signals/dependency-diff");
// ---------------------------------------------------------------------------
// isLocalDep
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('isLocalDep', () => {
    vitest_1.it.each([
        'file:../shared',
        'file:./packages/utils',
        'workspace:*',
        'workspace:^1.0.0',
        'link:../local-pkg',
    ])('returns true for local ref "%s"', (v) => {
        (0, vitest_1.expect)((0, dependency_diff_1.isLocalDep)(v)).toBe(true);
    });
    vitest_1.it.each([
        '1.2.3',
        '^2.0.0',
        '~1.0.0',
        'git+https://github.com/org/repo.git',
        'latest',
    ])('returns false for non-local "%s"', (v) => {
        (0, vitest_1.expect)((0, dependency_diff_1.isLocalDep)(v)).toBe(false);
    });
});
// ---------------------------------------------------------------------------
// isGitDep
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('isGitDep', () => {
    vitest_1.it.each([
        'git+https://github.com/org/repo.git',
        'git://github.com/org/repo',
        'github:org/repo',
        'bitbucket:user/repo',
        'gitlab:user/repo',
    ])('returns true for git ref "%s"', (v) => {
        (0, vitest_1.expect)((0, dependency_diff_1.isGitDep)(v)).toBe(true);
    });
    vitest_1.it.each([
        '1.2.3',
        '^2.0.0',
        'file:../pkg',
        'workspace:*',
    ])('returns false for non-git "%s"', (v) => {
        (0, vitest_1.expect)((0, dependency_diff_1.isGitDep)(v)).toBe(false);
    });
});
// ---------------------------------------------------------------------------
// isSemver
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('isSemver', () => {
    vitest_1.it.each([
        '1.2.3',
        '0.0.1',
        '14.1.0',
        '^3.0.0',
        '~1.6.2',
        '>=2.0.0',
        '=1.0.0',
        '<4.0.0',
    ])('recognises "%s" as semver', (v) => {
        (0, vitest_1.expect)((0, dependency_diff_1.isSemver)(v)).toBe(true);
    });
    vitest_1.it.each([
        'git+https://github.com/org/repo.git',
        'github:org/repo',
        'file:../pkg',
        'workspace:*',
        '*',
        'latest',
        'next',
    ])('rejects "%s" as non-semver', (v) => {
        (0, vitest_1.expect)((0, dependency_diff_1.isSemver)(v)).toBe(false);
    });
});
// ---------------------------------------------------------------------------
// classifyChange
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('classifyChange', () => {
    (0, vitest_1.it)('detects a major bump', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.classifyChange)('14.1.0', '15.0.0')).toBe('major');
    });
    (0, vitest_1.it)('detects a minor bump', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.classifyChange)('1.5.0', '1.6.0')).toBe('minor');
    });
    (0, vitest_1.it)('detects a patch bump', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.classifyChange)('1.6.2', '1.6.5')).toBe('patch');
    });
    (0, vitest_1.it)('handles range prefixes (^ and ~)', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.classifyChange)('^1.6.2', '^1.6.5')).toBe('patch');
        (0, vitest_1.expect)((0, dependency_diff_1.classifyChange)('~14.0.0', '~15.0.0')).toBe('major');
    });
    (0, vitest_1.it)('returns unknown when from version is a git ref', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.classifyChange)('git+https://github.com/org/repo.git#abc', '1.0.0')).toBe('unknown');
    });
    (0, vitest_1.it)('returns unknown when to version is a git ref', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.classifyChange)('1.0.0', 'git+https://github.com/org/repo.git#def')).toBe('unknown');
    });
    (0, vitest_1.it)('returns unknown for bare non-semver tags like "latest"', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.classifyChange)('latest', '1.0.0')).toBe('unknown');
    });
    (0, vitest_1.it)('returns unknown when both sides are git refs', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.classifyChange)('git+https://github.com/org/repo.git#abc', 'git+https://github.com/org/repo.git#def')).toBe('unknown');
    });
    (0, vitest_1.it)('returns patch when versions are equal (edge case — no effective change)', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.classifyChange)('1.0.0', '1.0.0')).toBe('patch');
    });
});
// ---------------------------------------------------------------------------
// formatVersion
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('formatVersion', () => {
    (0, vitest_1.it)('returns the version unchanged for regular semver strings', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.formatVersion)('1.2.3')).toBe('1.2.3');
        (0, vitest_1.expect)((0, dependency_diff_1.formatVersion)('^14.1.0')).toBe('^14.1.0');
    });
    (0, vitest_1.it)('truncates git+ URLs to "git…"', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.formatVersion)('git+https://github.com/org/repo.git')).toBe('git\u2026');
    });
    (0, vitest_1.it)('truncates github: shorthand to "git…"', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.formatVersion)('github:org/repo')).toBe('git\u2026');
    });
    (0, vitest_1.it)('truncates bitbucket: shorthand to "git…"', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.formatVersion)('bitbucket:user/repo')).toBe('git\u2026');
    });
});
// ---------------------------------------------------------------------------
// formatChangeType
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('formatChangeType', () => {
    (0, vitest_1.it)('formats major', () => (0, vitest_1.expect)((0, dependency_diff_1.formatChangeType)('major')).toContain('Major'));
    (0, vitest_1.it)('formats minor', () => (0, vitest_1.expect)((0, dependency_diff_1.formatChangeType)('minor')).toContain('Minor'));
    (0, vitest_1.it)('formats patch', () => (0, vitest_1.expect)((0, dependency_diff_1.formatChangeType)('patch')).toContain('Patch'));
    (0, vitest_1.it)('formats unknown', () => (0, vitest_1.expect)((0, dependency_diff_1.formatChangeType)('unknown')).toContain('Unknown'));
});
// ---------------------------------------------------------------------------
// formatCveDelta
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('formatCveDelta', () => {
    (0, vitest_1.it)('returns em-dash for null (N/A)', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.formatCveDelta)(null)).toBe('\u2014');
    });
    (0, vitest_1.it)('returns "0" for no change', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.formatCveDelta)(0)).toBe('0');
    });
    (0, vitest_1.it)('returns "+n" for newly introduced CVEs', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.formatCveDelta)(1)).toBe('+1');
        (0, vitest_1.expect)((0, dependency_diff_1.formatCveDelta)(3)).toBe('+3');
    });
    (0, vitest_1.it)('returns "-n" for resolved CVEs', () => {
        (0, vitest_1.expect)((0, dependency_diff_1.formatCveDelta)(-1)).toBe('-1');
        (0, vitest_1.expect)((0, dependency_diff_1.formatCveDelta)(-2)).toBe('-2');
    });
});

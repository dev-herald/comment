"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const dependency_diff_1 = require("../../signals/dependency-diff");
const utils_1 = require("../../signals/utils");
// ---------------------------------------------------------------------------
// isLocalDep
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('isLocalDep', () => {
    vitest_1.it.each([
        'file:../shared',
        'file:./packages/utils',
        'link:../local-pkg',
    ])('returns true for local ref "%s"', (v) => {
        (0, vitest_1.expect)((0, dependency_diff_1.isLocalDep)(v)).toBe(true);
    });
    vitest_1.it.each([
        '1.2.3',
        '^2.0.0',
        '~1.0.0',
        'workspace:*',
        'workspace:^1.0.0',
        'git+https://github.com/org/repo.git',
        'latest',
    ])('returns false for non-local "%s"', (v) => {
        (0, vitest_1.expect)((0, dependency_diff_1.isLocalDep)(v)).toBe(false);
    });
});
(0, vitest_1.describe)('isTrackedPackageJson', () => {
    (0, vitest_1.it)('keeps root and nested manifests', () => {
        (0, vitest_1.expect)((0, utils_1.isTrackedPackageJson)('package.json')).toBe(true);
        (0, vitest_1.expect)((0, utils_1.isTrackedPackageJson)('apps/web/package.json')).toBe(true);
    });
    (0, vitest_1.it)('drops manifests inside node_modules', () => {
        (0, vitest_1.expect)((0, utils_1.isTrackedPackageJson)('node_modules/left-pad/package.json')).toBe(false);
        (0, vitest_1.expect)((0, utils_1.isTrackedPackageJson)('apps/web/node_modules/react/package.json')).toBe(false);
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
function manifest(path, body) {
    return { path, manifest: body };
}
const fields = ['dependencies'];
(0, vitest_1.describe)('collectDependencyChanges', () => {
    (0, vitest_1.it)('diffs each package.json against the same path', () => {
        const base = [
            manifest('package.json', { dependencies: { lodash: '1.0.0' } }),
            manifest('apps/web/package.json', { dependencies: { react: '18.0.0' } }),
        ];
        const head = [
            manifest('package.json', { dependencies: { lodash: '2.0.0' } }),
            manifest('apps/web/package.json', { dependencies: { react: '18.2.0' } }),
        ];
        const changes = (0, dependency_diff_1.collectDependencyChanges)(base, head, fields);
        (0, vitest_1.expect)(changes.map((c) => [c.manifest, c.name, c.changeType])).toEqual([
            ['apps/web', 'react', 'minor'],
            ['.', 'lodash', 'major'],
        ]);
    });
    (0, vitest_1.it)('ignores an unchanged workspace:* even when the local package version moved', () => {
        const base = [
            manifest('packages/ui/package.json', { name: '@acme/ui', version: '1.0.0' }),
            manifest('apps/web/package.json', { dependencies: { '@acme/ui': 'workspace:*' } }),
        ];
        const head = [
            manifest('packages/ui/package.json', { name: '@acme/ui', version: '2.0.0' }),
            manifest('apps/web/package.json', { dependencies: { '@acme/ui': 'workspace:*' } }),
        ];
        (0, vitest_1.expect)((0, dependency_diff_1.collectDependencyChanges)(base, head, fields)).toEqual([]);
    });
    (0, vitest_1.it)('resolves a bare workspace alias for the type column', () => {
        const base = [
            manifest('apps/web/package.json', { dependencies: { '@acme/ui': '^1.0.0' } }),
        ];
        const head = [
            manifest('packages/ui/package.json', { name: '@acme/ui', version: '2.0.0' }),
            manifest('apps/web/package.json', { dependencies: { '@acme/ui': 'workspace:*' } }),
        ];
        const [change] = (0, dependency_diff_1.collectDependencyChanges)(base, head, fields);
        (0, vitest_1.expect)(change).toMatchObject({
            manifest: 'apps/web',
            name: '@acme/ui',
            from: '^1.0.0',
            to: 'workspace:* (2.0.0)',
            toComparable: '2.0.0',
            changeType: 'major',
        });
    });
    (0, vitest_1.it)('does not guess a version when two workspace packages share a name', () => {
        const base = [manifest('apps/web/package.json', { dependencies: { '@acme/ui': '^1.0.0' } })];
        const head = [
            manifest('packages/a/package.json', { name: '@acme/ui', version: '1.0.0' }),
            manifest('packages/b/package.json', { name: '@acme/ui', version: '2.0.0' }),
            manifest('apps/web/package.json', { dependencies: { '@acme/ui': 'workspace:*' } }),
        ];
        const [change] = (0, dependency_diff_1.collectDependencyChanges)(base, head, fields);
        (0, vitest_1.expect)(change).toMatchObject({
            to: 'workspace:*',
            toComparable: 'workspace:*',
            changeType: 'unknown',
        });
    });
    (0, vitest_1.it)('leaves an unresolved workspace alias as unknown', () => {
        const base = [manifest('package.json', { dependencies: { '@acme/ui': '1.0.0' } })];
        const head = [manifest('package.json', { dependencies: { '@acme/ui': 'workspace:*' } })];
        const [change] = (0, dependency_diff_1.collectDependencyChanges)(base, head, fields);
        (0, vitest_1.expect)(change).toMatchObject({
            to: 'workspace:*',
            toComparable: 'workspace:*',
            changeType: 'unknown',
        });
    });
    (0, vitest_1.it)('classifies workspace:^1.2.3 from the range after the protocol', () => {
        const base = [manifest('apps/web/package.json', { dependencies: { '@acme/ui': 'workspace:^1.0.0' } })];
        const head = [manifest('apps/web/package.json', { dependencies: { '@acme/ui': 'workspace:^1.2.3' } })];
        const [change] = (0, dependency_diff_1.collectDependencyChanges)(base, head, fields);
        (0, vitest_1.expect)(change).toMatchObject({
            from: 'workspace:^1.0.0 (^1.0.0)',
            to: 'workspace:^1.2.3 (^1.2.3)',
            fromComparable: '^1.0.0',
            toComparable: '^1.2.3',
            changeType: 'minor',
        });
    });
    (0, vitest_1.it)('skips file: installs and does not treat a new manifest as a version change', () => {
        const base = [manifest('package.json', { dependencies: { left: 'file:../left' } })];
        const head = [
            manifest('package.json', { dependencies: { left: 'file:../left-next' } }),
            manifest('packages/new/package.json', { dependencies: { zod: '1.0.0' } }),
        ];
        (0, vitest_1.expect)((0, dependency_diff_1.collectDependencyChanges)(base, head, fields)).toEqual([]);
    });
});
(0, vitest_1.describe)('buildDependencyDiffData', () => {
    (0, vitest_1.it)('omits the Manifest column when every change is in the root', () => {
        const [change] = (0, dependency_diff_1.collectDependencyChanges)([manifest('package.json', { dependencies: { lodash: '1.0.0' } })], [manifest('package.json', { dependencies: { lodash: '1.0.1' } })], fields);
        const data = (0, dependency_diff_1.buildDependencyDiffData)([change]);
        (0, vitest_1.expect)(data.headers).toEqual(['Package', 'From → To', 'Type', 'CVEs']);
    });
    (0, vitest_1.it)('adds a Manifest column when a nested package.json changed', () => {
        const changes = (0, dependency_diff_1.collectDependencyChanges)([manifest('apps/web/package.json', { dependencies: { react: '18.0.0' } })], [manifest('apps/web/package.json', { dependencies: { react: '18.2.0' } })], fields);
        const data = (0, dependency_diff_1.buildDependencyDiffData)(changes);
        (0, vitest_1.expect)(data.headers).toEqual(['Manifest', 'Package', 'From → To', 'Type', 'CVEs']);
        const rows = data.rows;
        (0, vitest_1.expect)(rows[0].cells[0].markdown).toBe('apps/web');
    });
});

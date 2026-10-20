import { describe, it, expect } from 'vitest';
import {
  classifyChange,
  isLocalDep,
  isGitDep,
  isSemver,
  formatVersion,
  formatChangeType,
  formatCveDelta,
  collectDependencyChanges,
  buildDependencyDiffData,
} from '../../signals/dependency-diff';
import { isMonorepo, isTrackedPackageJson, type LoadedManifest } from '../../signals/utils';

// ---------------------------------------------------------------------------
// isLocalDep
// ---------------------------------------------------------------------------

describe('isLocalDep', () => {
  it.each([
    'file:../shared',
    'file:./packages/utils',
    'link:../local-pkg',
  ])('returns true for local ref "%s"', (v) => {
    expect(isLocalDep(v)).toBe(true);
  });

  it.each([
    '1.2.3',
    '^2.0.0',
    '~1.0.0',
    'workspace:*',
    'workspace:^1.0.0',
    'git+https://github.com/org/repo.git',
    'latest',
  ])('returns false for non-local "%s"', (v) => {
    expect(isLocalDep(v)).toBe(false);
  });
});

describe('isTrackedPackageJson', () => {
  it('keeps root and nested manifests', () => {
    expect(isTrackedPackageJson('package.json')).toBe(true);
    expect(isTrackedPackageJson('apps/web/package.json')).toBe(true);
  });

  it('drops manifests inside node_modules', () => {
    expect(isTrackedPackageJson('node_modules/left-pad/package.json')).toBe(false);
    expect(isTrackedPackageJson('apps/web/node_modules/react/package.json')).toBe(false);
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

function manifest(path: string, body: Record<string, unknown>): LoadedManifest {
  return { path, manifest: body };
}

const fields = ['dependencies'];

describe('collectDependencyChanges', () => {
  it('diffs each package.json against the same path', () => {
    const base = [
      manifest('package.json', { dependencies: { lodash: '1.0.0' } }),
      manifest('apps/web/package.json', { dependencies: { react: '18.0.0' } }),
    ];
    const head = [
      manifest('package.json', { dependencies: { lodash: '2.0.0' } }),
      manifest('apps/web/package.json', { dependencies: { react: '18.2.0' } }),
    ];

    const changes = collectDependencyChanges(base, head, fields);

    expect(changes.map((c) => [c.manifest, c.name, c.changeType])).toEqual([
      ['apps/web', 'react', 'minor'],
      ['root manifest', 'lodash', 'major'],
    ]);
  });

  it('ignores an unchanged workspace:* even when the local package version moved', () => {
    const base = [
      manifest('packages/ui/package.json', { name: '@acme/ui', version: '1.0.0' }),
      manifest('apps/web/package.json', { dependencies: { '@acme/ui': 'workspace:*' } }),
    ];
    const head = [
      manifest('packages/ui/package.json', { name: '@acme/ui', version: '2.0.0' }),
      manifest('apps/web/package.json', { dependencies: { '@acme/ui': 'workspace:*' } }),
    ];

    expect(collectDependencyChanges(base, head, fields)).toEqual([]);
  });

  it('resolves a bare workspace alias for the type column', () => {
    const base = [
      manifest('apps/web/package.json', { dependencies: { '@acme/ui': '^1.0.0' } }),
    ];
    const head = [
      manifest('packages/ui/package.json', { name: '@acme/ui', version: '2.0.0' }),
      manifest('apps/web/package.json', { dependencies: { '@acme/ui': 'workspace:*' } }),
    ];

    const [change] = collectDependencyChanges(base, head, fields);
    expect(change).toMatchObject({
      manifest: 'apps/web',
      name: '@acme/ui',
      from: '^1.0.0',
      to: 'workspace:* (2.0.0)',
      toComparable: '2.0.0',
      changeType: 'major',
    });
  });

  it('does not guess a version when two workspace packages share a name', () => {
    const base = [manifest('apps/web/package.json', { dependencies: { '@acme/ui': '^1.0.0' } })];
    const head = [
      manifest('packages/a/package.json', { name: '@acme/ui', version: '1.0.0' }),
      manifest('packages/b/package.json', { name: '@acme/ui', version: '2.0.0' }),
      manifest('apps/web/package.json', { dependencies: { '@acme/ui': 'workspace:*' } }),
    ];

    const [change] = collectDependencyChanges(base, head, fields);
    expect(change).toMatchObject({
      to: 'workspace:*',
      toComparable: 'workspace:*',
      changeType: 'unknown',
    });
  });

  it('leaves an unresolved workspace alias as unknown', () => {
    const base = [manifest('package.json', { dependencies: { '@acme/ui': '1.0.0' } })];
    const head = [manifest('package.json', { dependencies: { '@acme/ui': 'workspace:*' } })];

    const [change] = collectDependencyChanges(base, head, fields);
    expect(change).toMatchObject({
      to: 'workspace:*',
      toComparable: 'workspace:*',
      changeType: 'unknown',
    });
  });

  it('classifies workspace:^1.2.3 from the range after the protocol', () => {
    const base = [manifest('apps/web/package.json', { dependencies: { '@acme/ui': 'workspace:^1.0.0' } })];
    const head = [manifest('apps/web/package.json', { dependencies: { '@acme/ui': 'workspace:^1.2.3' } })];

    const [change] = collectDependencyChanges(base, head, fields);
    expect(change).toMatchObject({
      from: 'workspace:^1.0.0 (^1.0.0)',
      to: 'workspace:^1.2.3 (^1.2.3)',
      fromComparable: '^1.0.0',
      toComparable: '^1.2.3',
      changeType: 'minor',
    });
  });

  it('skips file: installs and does not treat a new manifest as a version change', () => {
    const base = [manifest('package.json', { dependencies: { left: 'file:../left' } })];
    const head = [
      manifest('package.json', { dependencies: { left: 'file:../left-next' } }),
      manifest('packages/new/package.json', { dependencies: { zod: '1.0.0' } }),
    ];

    expect(collectDependencyChanges(base, head, fields)).toEqual([]);
  });
});

describe('buildDependencyDiffData', () => {
  function table(base: LoadedManifest[], head: LoadedManifest[]) {
    const changes = collectDependencyChanges(base, head, fields);
    return buildDependencyDiffData(changes, {
      showManifest: isMonorepo([...base, ...head]),
    });
  }

  it('omits the Workspace column when the only package.json is the root', () => {
    const data = table(
      [manifest('package.json', { dependencies: { lodash: '1.0.0' } })],
      [manifest('package.json', { dependencies: { lodash: '1.0.1' } })],
    );
    expect(data.headers).toEqual(['Package', 'From → To', 'Type', 'CVEs']);
  });

  it('omits the Workspace column when the only package.json is nested', () => {
    const data = table(
      [manifest('apps/web/package.json', { dependencies: { react: '18.0.0' } })],
      [manifest('apps/web/package.json', { dependencies: { react: '18.2.0' } })],
    );
    expect(data.headers).toEqual(['Package', 'From → To', 'Type', 'CVEs']);
  });

  it('keeps the Workspace column when a monorepo only changes the root', () => {
    const data = table(
      [
        manifest('package.json', { dependencies: { lodash: '1.0.0' } }),
        manifest('packages/ui/package.json', { dependencies: { react: '18.0.0' } }),
      ],
      [
        manifest('package.json', { dependencies: { lodash: '1.0.1' } }),
        manifest('packages/ui/package.json', { dependencies: { react: '18.0.0' } }),
      ],
    );
    expect(data.headers).toEqual(['Workspace', 'Package', 'From → To', 'Type', 'CVEs']);
    const rows = data.rows as Array<{ cells: Array<{ markdown: string }> }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].cells[0].markdown).toBe('root manifest');
  });

  it('keeps the Workspace column when a monorepo only changes one nested package', () => {
    const data = table(
      [
        manifest('package.json', { dependencies: { lodash: '1.0.0' } }),
        manifest('packages/ui/package.json', { dependencies: { react: '18.0.0' } }),
      ],
      [
        manifest('package.json', { dependencies: { lodash: '1.0.0' } }),
        manifest('packages/ui/package.json', { dependencies: { react: '18.2.0' } }),
      ],
    );
    expect(data.headers).toEqual(['Workspace', 'Package', 'From → To', 'Type', 'CVEs']);
    const rows = data.rows as Array<{ cells: Array<{ markdown: string }> }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].cells[0].markdown).toBe('packages/ui');
  });
});

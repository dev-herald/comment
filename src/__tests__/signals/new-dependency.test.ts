import { describe, it, expect } from 'vitest';
import {
  collectNewDependencies,
  buildNewDependencyData,
} from '../../signals/new-dependency';
import type { LoadedManifest } from '../../signals/utils';

function manifest(path: string, body: Record<string, unknown>): LoadedManifest {
  return { path, manifest: body };
}

const fields = ['dependencies'];

describe('collectNewDependencies', () => {
  it('reports a dependency added in a nested package.json', () => {
    const base = [
      manifest('package.json', { dependencies: { lodash: '1.0.0' } }),
      manifest('apps/web/package.json', { dependencies: {} }),
    ];
    const head = [
      manifest('package.json', { dependencies: { lodash: '1.0.0' } }),
      manifest('apps/web/package.json', { dependencies: { zod: '^3.0.0' } }),
    ];

    expect(collectNewDependencies(base, head, fields)).toEqual([
      expect.objectContaining({
        manifest: 'apps/web',
        name: 'zod',
        version: '^3.0.0',
        comparableVersion: '^3.0.0',
        workspace: false,
      }),
    ]);
  });

  it('reports a new workspace:* dependency and resolves its version', () => {
    const base = [
      manifest('packages/ui/package.json', { name: '@acme/ui', version: '1.2.3' }),
      manifest('apps/web/package.json', { dependencies: {} }),
    ];
    const head = [
      manifest('packages/ui/package.json', { name: '@acme/ui', version: '1.2.3' }),
      manifest('apps/web/package.json', { dependencies: { '@acme/ui': 'workspace:*' } }),
    ];

    expect(collectNewDependencies(base, head, fields)).toEqual([
      expect.objectContaining({
        manifest: 'apps/web',
        name: '@acme/ui',
        version: 'workspace:* (1.2.3)',
        comparableVersion: '1.2.3',
        workspace: true,
      }),
    ]);
  });

  it('keeps an unresolved workspace:* specifier as written', () => {
    const head = [manifest('apps/web/package.json', { dependencies: { '@acme/missing': 'workspace:*' } })];

    const [dep] = collectNewDependencies([], head, fields);
    expect(dep).toMatchObject({
      version: 'workspace:*',
      comparableVersion: 'workspace:*',
      workspace: true,
    });
  });

  it('uses the range after workspace: for an explicit specifier', () => {
    const head = [manifest('apps/web/package.json', { dependencies: { '@acme/ui': 'workspace:^1.2.3' } })];

    const [dep] = collectNewDependencies([], head, fields);
    expect(dep).toMatchObject({
      version: 'workspace:^1.2.3 (^1.2.3)',
      comparableVersion: '^1.2.3',
      workspace: true,
    });
  });

  it('skips file: installs and dependencies that already existed', () => {
    const base = [manifest('package.json', { dependencies: { lodash: '1.0.0' } })];
    const head = [manifest('package.json', {
      dependencies: { lodash: '2.0.0', local: 'file:../local' },
    })];

    expect(collectNewDependencies(base, head, fields)).toEqual([]);
  });

  it('includes every dependency from a package.json that did not exist on base', () => {
    const head = [manifest('packages/new/package.json', {
      dependencies: { zod: '1.0.0', local: 'link:../local' },
    })];

    const deps = collectNewDependencies([], head, fields);
    expect(deps.map((d) => d.name)).toEqual(['zod']);
    expect(deps[0].manifest).toBe('packages/new');
  });
});

describe('buildNewDependencyData', () => {
  it('omits the Manifest column when every addition is in the root', () => {
    const deps = collectNewDependencies(
      [],
      [manifest('package.json', { dependencies: { zod: '1.0.0' } })],
      fields,
    );
    const data = buildNewDependencyData(deps);
    expect(data.headers).toEqual(['Package', 'Version', 'CVEs', 'Weekly DL', 'Last Release']);
  });

  it('adds a Manifest column for a nested package.json', () => {
    const deps = collectNewDependencies(
      [],
      [manifest('apps/web/package.json', { dependencies: { zod: '1.0.0' } })],
      fields,
    );
    const data = buildNewDependencyData(deps);
    expect(data.headers).toEqual(['Manifest', 'Package', 'Version', 'CVEs', 'Weekly DL', 'Last Release']);
    const rows = data.rows as Array<{ cells: Array<{ markdown: string }> }>;
    expect(rows[0].cells[0].markdown).toBe('apps/web');
  });
});

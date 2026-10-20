"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const new_dependency_1 = require("../../signals/new-dependency");
function manifest(path, body) {
    return { path, manifest: body };
}
const fields = ['dependencies'];
(0, vitest_1.describe)('collectNewDependencies', () => {
    (0, vitest_1.it)('reports a dependency added in a nested package.json', () => {
        const base = [
            manifest('package.json', { dependencies: { lodash: '1.0.0' } }),
            manifest('apps/web/package.json', { dependencies: {} }),
        ];
        const head = [
            manifest('package.json', { dependencies: { lodash: '1.0.0' } }),
            manifest('apps/web/package.json', { dependencies: { zod: '^3.0.0' } }),
        ];
        (0, vitest_1.expect)((0, new_dependency_1.collectNewDependencies)(base, head, fields)).toEqual([
            vitest_1.expect.objectContaining({
                manifest: 'apps/web',
                name: 'zod',
                version: '^3.0.0',
                comparableVersion: '^3.0.0',
                workspace: false,
            }),
        ]);
    });
    (0, vitest_1.it)('reports a new workspace:* dependency and resolves its version', () => {
        const base = [
            manifest('packages/ui/package.json', { name: '@acme/ui', version: '1.2.3' }),
            manifest('apps/web/package.json', { dependencies: {} }),
        ];
        const head = [
            manifest('packages/ui/package.json', { name: '@acme/ui', version: '1.2.3' }),
            manifest('apps/web/package.json', { dependencies: { '@acme/ui': 'workspace:*' } }),
        ];
        (0, vitest_1.expect)((0, new_dependency_1.collectNewDependencies)(base, head, fields)).toEqual([
            vitest_1.expect.objectContaining({
                manifest: 'apps/web',
                name: '@acme/ui',
                version: 'workspace:* (1.2.3)',
                comparableVersion: '1.2.3',
                workspace: true,
            }),
        ]);
    });
    (0, vitest_1.it)('keeps an unresolved workspace:* specifier as written', () => {
        const head = [manifest('apps/web/package.json', { dependencies: { '@acme/missing': 'workspace:*' } })];
        const [dep] = (0, new_dependency_1.collectNewDependencies)([], head, fields);
        (0, vitest_1.expect)(dep).toMatchObject({
            version: 'workspace:*',
            comparableVersion: 'workspace:*',
            workspace: true,
        });
    });
    (0, vitest_1.it)('uses the range after workspace: for an explicit specifier', () => {
        const head = [manifest('apps/web/package.json', { dependencies: { '@acme/ui': 'workspace:^1.2.3' } })];
        const [dep] = (0, new_dependency_1.collectNewDependencies)([], head, fields);
        (0, vitest_1.expect)(dep).toMatchObject({
            version: 'workspace:^1.2.3 (^1.2.3)',
            comparableVersion: '^1.2.3',
            workspace: true,
        });
    });
    (0, vitest_1.it)('skips file: installs and dependencies that already existed', () => {
        const base = [manifest('package.json', { dependencies: { lodash: '1.0.0' } })];
        const head = [manifest('package.json', {
                dependencies: { lodash: '2.0.0', local: 'file:../local' },
            })];
        (0, vitest_1.expect)((0, new_dependency_1.collectNewDependencies)(base, head, fields)).toEqual([]);
    });
    (0, vitest_1.it)('includes every dependency from a package.json that did not exist on base', () => {
        const head = [manifest('packages/new/package.json', {
                dependencies: { zod: '1.0.0', local: 'link:../local' },
            })];
        const deps = (0, new_dependency_1.collectNewDependencies)([], head, fields);
        (0, vitest_1.expect)(deps.map((d) => d.name)).toEqual(['zod']);
        (0, vitest_1.expect)(deps[0].manifest).toBe('packages/new');
    });
});
(0, vitest_1.describe)('buildNewDependencyData', () => {
    (0, vitest_1.it)('omits the Manifest column when every addition is in the root', () => {
        const deps = (0, new_dependency_1.collectNewDependencies)([], [manifest('package.json', { dependencies: { zod: '1.0.0' } })], fields);
        const data = (0, new_dependency_1.buildNewDependencyData)(deps);
        (0, vitest_1.expect)(data.headers).toEqual(['Package', 'Version', 'CVEs', 'Weekly DL', 'Last Release']);
    });
    (0, vitest_1.it)('adds a Manifest column for a nested package.json', () => {
        const deps = (0, new_dependency_1.collectNewDependencies)([], [manifest('apps/web/package.json', { dependencies: { zod: '1.0.0' } })], fields);
        const data = (0, new_dependency_1.buildNewDependencyData)(deps);
        (0, vitest_1.expect)(data.headers).toEqual(['Manifest', 'Package', 'Version', 'CVEs', 'Weekly DL', 'Last Release']);
        const rows = data.rows;
        (0, vitest_1.expect)(rows[0].cells[0].markdown).toBe('apps/web');
    });
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const vitest_1 = require("vitest");
/**
 * GitHub Actions runner 2.335.1+ parses ${{ }} in action.yml at load time,
 * before the github context exists — so expressions there break every consumer.
 */
(0, vitest_1.describe)('action.yml', () => {
    (0, vitest_1.it)('does not contain workflow expressions that break action manifest loading', () => {
        const actionYml = (0, node_fs_1.readFileSync)((0, node_path_1.resolve)(__dirname, '../../action.yml'), 'utf8');
        (0, vitest_1.expect)(actionYml).not.toMatch(/\$\{\{/);
    });
});

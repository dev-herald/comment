"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const github = __importStar(require("@actions/github"));
const vitest_1 = require("vitest");
const dependency_diff_1 = require("../../signals/dependency-diff");
const new_dependency_1 = require("../../signals/new-dependency");
const utils_1 = require("../../signals/utils");
const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
};
function git(cwd, args) {
    return (0, child_process_1.execFileSync)('git', args, {
        cwd,
        encoding: 'utf8',
        env: gitEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}
function manifestAt(cwd, sha) {
    const raw = git(cwd, ['show', `${sha}:package.json`]);
    return [{ path: 'package.json', manifest: JSON.parse(raw) }];
}
(0, vitest_1.describe)('getComparisonShas', () => {
    const originalPayload = github.context.payload;
    const originalBaseRef = process.env.GITHUB_BASE_REF;
    let dir;
    (0, vitest_1.afterEach)(() => {
        github.context.payload = originalPayload;
        if (originalBaseRef === undefined)
            delete process.env.GITHUB_BASE_REF;
        else
            process.env.GITHUB_BASE_REF = originalBaseRef;
        if (dir)
            (0, fs_1.rmSync)(dir, { recursive: true, force: true });
        dir = undefined;
    });
    (0, vitest_1.it)('ignores a dependency added on the base branch after the PR diverged', () => {
        const root = path_1.default.join(process.cwd(), 'src/__tests__/test-data');
        (0, fs_1.mkdirSync)(root, { recursive: true });
        dir = (0, fs_1.mkdtempSync)(path_1.default.join(root, 'comparison-shas-'));
        git(dir, ['init', '-b', 'main']);
        (0, fs_1.writeFileSync)(path_1.default.join(dir, 'package.json'), '{"dependencies":{"react":"18.0.0"}}\n');
        git(dir, ['add', 'package.json']);
        git(dir, ['commit', '-m', 'init']);
        const fork = git(dir, ['rev-parse', 'HEAD']);
        git(dir, ['checkout', '-b', 'pr']);
        git(dir, ['commit', '--allow-empty', '-m', 'pr work']);
        const head = git(dir, ['rev-parse', 'HEAD']);
        git(dir, ['checkout', 'main']);
        (0, fs_1.writeFileSync)(path_1.default.join(dir, 'package.json'), '{"dependencies":{"react":"18.0.0","zod":"1.0.0"}}\n');
        git(dir, ['add', 'package.json']);
        git(dir, ['commit', '-m', 'main adds zod']);
        const baseTip = git(dir, ['rev-parse', 'HEAD']);
        github.context.payload = {
            pull_request: { base: { sha: baseTip }, head: { sha: head } },
        };
        const shas = (0, utils_1.getComparisonShas)('NEW_DEPENDENCY', dir);
        (0, vitest_1.expect)(shas).toEqual({ baseSha: fork, headSha: head });
        (0, vitest_1.expect)((0, new_dependency_1.collectNewDependencies)(manifestAt(dir, shas.baseSha), manifestAt(dir, shas.headSha), ['dependencies'])).toEqual([]);
        (0, vitest_1.expect)((0, dependency_diff_1.collectDependencyChanges)(manifestAt(dir, shas.baseSha), manifestAt(dir, shas.headSha), ['dependencies'])).toEqual([]);
    });
    (0, vitest_1.it)('still reports a dependency this PR added', () => {
        const root = path_1.default.join(process.cwd(), 'src/__tests__/test-data');
        (0, fs_1.mkdirSync)(root, { recursive: true });
        dir = (0, fs_1.mkdtempSync)(path_1.default.join(root, 'comparison-shas-'));
        git(dir, ['init', '-b', 'main']);
        (0, fs_1.writeFileSync)(path_1.default.join(dir, 'package.json'), '{"dependencies":{}}\n');
        git(dir, ['add', 'package.json']);
        git(dir, ['commit', '-m', 'init']);
        git(dir, ['checkout', '-b', 'pr']);
        (0, fs_1.writeFileSync)(path_1.default.join(dir, 'package.json'), '{"dependencies":{"zod":"3.0.0"}}\n');
        git(dir, ['add', 'package.json']);
        git(dir, ['commit', '-m', 'pr adds zod']);
        const head = git(dir, ['rev-parse', 'HEAD']);
        git(dir, ['checkout', 'main']);
        const baseTip = git(dir, ['rev-parse', 'HEAD']);
        github.context.payload = {
            pull_request: { base: { sha: baseTip }, head: { sha: head } },
        };
        const shas = (0, utils_1.getComparisonShas)('NEW_DEPENDENCY', dir);
        const added = (0, new_dependency_1.collectNewDependencies)(manifestAt(dir, shas.baseSha), manifestAt(dir, shas.headSha), ['dependencies']);
        (0, vitest_1.expect)(added).toEqual([vitest_1.expect.objectContaining({ name: 'zod', version: '3.0.0' })]);
    });
    (0, vitest_1.it)('still reports a version change this PR made', () => {
        const root = path_1.default.join(process.cwd(), 'src/__tests__/test-data');
        (0, fs_1.mkdirSync)(root, { recursive: true });
        dir = (0, fs_1.mkdtempSync)(path_1.default.join(root, 'comparison-shas-'));
        git(dir, ['init', '-b', 'main']);
        (0, fs_1.writeFileSync)(path_1.default.join(dir, 'package.json'), '{"dependencies":{"react":"18.0.0"}}\n');
        git(dir, ['add', 'package.json']);
        git(dir, ['commit', '-m', 'init']);
        git(dir, ['checkout', '-b', 'pr']);
        (0, fs_1.writeFileSync)(path_1.default.join(dir, 'package.json'), '{"dependencies":{"react":"19.0.0"}}\n');
        git(dir, ['add', 'package.json']);
        git(dir, ['commit', '-m', 'pr bumps react']);
        const head = git(dir, ['rev-parse', 'HEAD']);
        git(dir, ['checkout', 'main']);
        const baseTip = git(dir, ['rev-parse', 'HEAD']);
        github.context.payload = {
            pull_request: { base: { sha: baseTip }, head: { sha: head } },
        };
        const shas = (0, utils_1.getComparisonShas)('DEPENDENCY_DIFF', dir);
        const changes = (0, dependency_diff_1.collectDependencyChanges)(manifestAt(dir, shas.baseSha), manifestAt(dir, shas.headSha), ['dependencies']);
        (0, vitest_1.expect)(changes).toEqual([
            vitest_1.expect.objectContaining({ name: 'react', from: '18.0.0', to: '19.0.0', changeType: 'major' }),
        ]);
    });
    (0, vitest_1.it)('throws when the event has no pull request and no base ref', () => {
        github.context.payload = {};
        delete process.env.GITHUB_BASE_REF;
        (0, vitest_1.expect)(() => (0, utils_1.getComparisonShas)('NEW_DEPENDENCY')).toThrow(/pull_request event/);
    });
});

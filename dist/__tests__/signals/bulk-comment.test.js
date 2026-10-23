"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const parse_signals_1 = require("../../signals/parse-signals");
const bulk_comment_1 = require("../../bulk-comment");
(0, vitest_1.describe)('parseSignalsInput', () => {
    (0, vitest_1.it)('parses a YAML list in order and allows quotes', () => {
        const signals = (0, parse_signals_1.parseSignalsInput)(`
      # sections
      - DEPENDENCY_DIFF
      - "BUNDLE_ANALYSIS"
      - 'TEST_RESULTS'
    `);
        (0, vitest_1.expect)(signals).toEqual(['DEPENDENCY_DIFF', 'BUNDLE_ANALYSIS', 'TEST_RESULTS']);
    });
    (0, vitest_1.it)('throws when the list is empty', () => {
        (0, vitest_1.expect)(() => (0, parse_signals_1.parseSignalsInput)('   \n# comment only')).toThrow('Could not parse any signals');
    });
    (0, vitest_1.it)('throws when a name is not a known signal', () => {
        (0, vitest_1.expect)(() => (0, parse_signals_1.parseSignalsInput)('- DEPENDENCY_DIFF\n- NOPE')).toThrow('Unknown signal "NOPE"');
    });
    (0, vitest_1.it)('throws when a signal is listed twice', () => {
        (0, vitest_1.expect)(() => (0, parse_signals_1.parseSignalsInput)('- NEW_DEPENDENCY\n- NEW_DEPENDENCY')).toThrow('Duplicate signal "NEW_DEPENDENCY"');
    });
});
(0, vitest_1.describe)('renderCustomTable', () => {
    (0, vitest_1.it)('renders a heading, header row, and cells', () => {
        const markdown = (0, bulk_comment_1.renderCustomTable)({
            title: '📦 Dependency changes (1)',
            headers: ['Package', 'From → To'],
            rows: [{ cells: [{ markdown: 'left-pad' }, { markdown: '1.0.0 → 2.0.0' }] }],
            showTimestamp: true,
        });
        (0, vitest_1.expect)(markdown).toBe([
            '## 📦 Dependency changes (1)',
            '',
            '| Package | From → To |',
            '| --- | --- |',
            '| left-pad | 1.0.0 → 2.0.0 |',
        ].join('\n'));
        (0, vitest_1.expect)(markdown).not.toContain('Updated');
    });
    (0, vitest_1.it)('escapes pipes and newlines inside cells', () => {
        const markdown = (0, bulk_comment_1.renderCustomTable)({
            title: 'Notes',
            headers: ['Cell'],
            rows: [{ cells: [{ markdown: 'a|b\nc' }] }],
        });
        (0, vitest_1.expect)(markdown).toContain('| a\\|b c |');
    });
});
(0, vitest_1.describe)('stripUpdatedFooter', () => {
    (0, vitest_1.it)('removes a trailing updated line and leaves the section body', () => {
        const stripped = (0, bulk_comment_1.stripUpdatedFooter)('## 📦 Bundle size\n\nNo bundle size changes detected vs baseline.\n\n<sub>Updated 2026-10-15 01:35 UTC</sub>');
        (0, vitest_1.expect)(stripped).toBe('## 📦 Bundle size\n\nNo bundle size changes detected vs baseline.');
    });
});
(0, vitest_1.describe)('buildBulkComment', () => {
    const timestamp = '15 Oct 2026 • 01:35 UTC';
    (0, vitest_1.it)('keeps section order, omits skips, and appends one timestamp', () => {
        const outcomes = [
            { action: 'skip', commentLog: 'skip dep', sectionLog: 'omit dep' },
            {
                action: 'table',
                data: {
                    title: 'Bundle size',
                    headers: ['Chunk', 'Delta'],
                    rows: [{ cells: [{ markdown: 'app' }, { markdown: '+1 KB' }] }],
                },
            },
            {
                action: 'comment',
                markdown: '## 🧪 Test Results\n\nNo test suites found in the provided result files.',
            },
        ];
        const comment = (0, bulk_comment_1.buildBulkComment)(outcomes, timestamp);
        (0, vitest_1.expect)(comment).toBe([
            '## Bundle size',
            '',
            '| Chunk | Delta |',
            '| --- | --- |',
            '| app | +1 KB |',
            '',
            '## 🧪 Test Results',
            '',
            'No test suites found in the provided result files.',
            '',
            '<sub>Updated 15 Oct 2026 • 01:35 UTC</sub>',
        ].join('\n'));
        (0, vitest_1.expect)(comment?.match(/<sub>Updated/g)).toHaveLength(1);
    });
    (0, vitest_1.it)('includes bundle no-changes prose without its own timestamp', () => {
        const outcomes = [
            { action: 'skip', commentLog: 'baseline', sectionLog: 'omit baseline' },
            {
                action: 'comment',
                markdown: '## 📦 Bundle size\n\nNo bundle size changes detected vs baseline.\n\n<sub>Updated 2026-10-15 01:00 UTC</sub>',
            },
        ];
        const comment = (0, bulk_comment_1.buildBulkComment)(outcomes, timestamp);
        (0, vitest_1.expect)(comment).toContain('No bundle size changes detected vs baseline.');
        (0, vitest_1.expect)(comment).not.toContain('2026-10-15 01:00 UTC');
        (0, vitest_1.expect)(comment).toContain('<sub>Updated 15 Oct 2026 • 01:35 UTC</sub>');
    });
    (0, vitest_1.it)('returns null when every section is skipped', () => {
        const outcomes = [
            { action: 'skip', commentLog: 'no deps', sectionLog: 'omit deps' },
            { action: 'skip', commentLog: 'baseline', sectionLog: 'omit baseline' },
        ];
        (0, vitest_1.expect)((0, bulk_comment_1.buildBulkComment)(outcomes, timestamp)).toBeNull();
    });
    (0, vitest_1.it)('omits a cleared dependency section and keeps the remaining table', () => {
        const outcomes = [
            { action: 'clear', commentLog: 'no deps', sectionLog: 'omit deps' },
            {
                action: 'table',
                data: {
                    title: 'Bundle size',
                    headers: ['Chunk'],
                    rows: [{ cells: [{ markdown: 'app' }] }],
                },
            },
        ];
        const comment = (0, bulk_comment_1.buildBulkComment)(outcomes, timestamp);
        (0, vitest_1.expect)(comment).toContain('## Bundle size');
        (0, vitest_1.expect)(comment).not.toContain('omit deps');
        (0, vitest_1.expect)((0, bulk_comment_1.decideCommentAction)(outcomes)).toBe('post');
    });
});
(0, vitest_1.describe)('decideCommentAction', () => {
    const clear = { action: 'clear', commentLog: 'empty', sectionLog: 'omit' };
    const skip = { action: 'skip', commentLog: 'missing', sectionLog: 'omit' };
    const prose = { action: 'comment', markdown: '## Tests\n\nNo suites.' };
    (0, vitest_1.it)('deletes when every section was checked and empty', () => {
        (0, vitest_1.expect)((0, bulk_comment_1.decideCommentAction)([clear, clear])).toBe('delete');
    });
    (0, vitest_1.it)('preserves when a check could not run', () => {
        (0, vitest_1.expect)((0, bulk_comment_1.decideCommentAction)([clear, skip])).toBe('preserve');
        (0, vitest_1.expect)((0, bulk_comment_1.decideCommentAction)([skip])).toBe('preserve');
        (0, vitest_1.expect)((0, bulk_comment_1.decideCommentAction)([])).toBe('preserve');
    });
    (0, vitest_1.it)('posts when any section still has content', () => {
        (0, vitest_1.expect)((0, bulk_comment_1.decideCommentAction)([clear, prose])).toBe('post');
        (0, vitest_1.expect)((0, bulk_comment_1.decideCommentAction)([skip, prose])).toBe('post');
    });
});

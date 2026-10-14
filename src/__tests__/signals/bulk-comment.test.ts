import { describe, it, expect } from 'vitest';
import { parseSignalsInput } from '../../signals/parse-signals';
import { buildBulkComment, renderCustomTable, stripUpdatedFooter, type SignalOutcome } from '../../bulk-comment';

describe('parseSignalsInput', () => {
  it('parses a YAML list in order and allows quotes', () => {
    const signals = parseSignalsInput(`
      # sections
      - DEPENDENCY_DIFF
      - "BUNDLE_ANALYSIS"
      - 'TEST_RESULTS'
    `);
    expect(signals).toEqual(['DEPENDENCY_DIFF', 'BUNDLE_ANALYSIS', 'TEST_RESULTS']);
  });

  it('throws when the list is empty', () => {
    expect(() => parseSignalsInput('   \n# comment only')).toThrow('Could not parse any signals');
  });

  it('throws when a name is not a known signal', () => {
    expect(() => parseSignalsInput('- DEPENDENCY_DIFF\n- NOPE')).toThrow('Unknown signal "NOPE"');
  });

  it('throws when a signal is listed twice', () => {
    expect(() => parseSignalsInput('- NEW_DEPENDENCY\n- NEW_DEPENDENCY')).toThrow(
      'Duplicate signal "NEW_DEPENDENCY"'
    );
  });
});

describe('renderCustomTable', () => {
  it('renders a heading, header row, and cells', () => {
    const markdown = renderCustomTable({
      title: '📦 Dependency changes (1)',
      headers: ['Package', 'From → To'],
      rows: [{ cells: [{ markdown: 'left-pad' }, { markdown: '1.0.0 → 2.0.0' }] }],
      showTimestamp: true,
    });

    expect(markdown).toBe(
      [
        '## 📦 Dependency changes (1)',
        '',
        '| Package | From → To |',
        '| --- | --- |',
        '| left-pad | 1.0.0 → 2.0.0 |',
      ].join('\n')
    );
    expect(markdown).not.toContain('Updated');
  });

  it('escapes pipes and newlines inside cells', () => {
    const markdown = renderCustomTable({
      title: 'Notes',
      headers: ['Cell'],
      rows: [{ cells: [{ markdown: 'a|b\nc' }] }],
    });
    expect(markdown).toContain('| a\\|b c |');
  });
});

describe('stripUpdatedFooter', () => {
  it('removes a trailing updated line and leaves the section body', () => {
    const stripped = stripUpdatedFooter(
      '## 📦 Bundle size\n\nNo bundle size changes detected vs baseline.\n\n<sub>Updated 2026-10-15 01:35 UTC</sub>'
    );
    expect(stripped).toBe('## 📦 Bundle size\n\nNo bundle size changes detected vs baseline.');
  });
});

describe('buildBulkComment', () => {
  const timestamp = '15 Oct 2026 • 01:35 UTC';

  it('keeps section order, omits skips, and appends one timestamp', () => {
    const outcomes: SignalOutcome[] = [
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

    const comment = buildBulkComment(outcomes, timestamp);

    expect(comment).toBe(
      [
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
      ].join('\n')
    );
    expect(comment?.match(/<sub>Updated/g)).toHaveLength(1);
  });

  it('includes bundle no-changes prose without its own timestamp', () => {
    const outcomes: SignalOutcome[] = [
      { action: 'skip', commentLog: 'baseline', sectionLog: 'omit baseline' },
      {
        action: 'comment',
        markdown:
          '## 📦 Bundle size\n\nNo bundle size changes detected vs baseline.\n\n<sub>Updated 2026-10-15 01:00 UTC</sub>',
      },
    ];

    const comment = buildBulkComment(outcomes, timestamp);
    expect(comment).toContain('No bundle size changes detected vs baseline.');
    expect(comment).not.toContain('2026-10-15 01:00 UTC');
    expect(comment).toContain('<sub>Updated 15 Oct 2026 • 01:35 UTC</sub>');
  });

  it('returns null when every section is skipped', () => {
    const outcomes: SignalOutcome[] = [
      { action: 'skip', commentLog: 'no deps', sectionLog: 'omit deps' },
      { action: 'skip', commentLog: 'baseline', sectionLog: 'omit baseline' },
    ];
    expect(buildBulkComment(outcomes, timestamp)).toBeNull();
  });
});

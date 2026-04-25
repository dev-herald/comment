import { describe, it, expect } from 'vitest';
import { runTestResultsSignal } from '../../signals/test-results';

describe('runTestResultsSignal', () => {
  it('uses markdown link in the first cell when suite.link is set', () => {
    const out = runTestResultsSignal({
      summary: '1 passed',
      showTimestamp: true,
      testSuites: [
        {
          name: 'Unit Tests',
          passed: 27,
          failed: 0,
          skipped: 0,
          duration: '28ms',
          link: 'https://github.com/owner/repo/actions/runs/1',
        },
      ],
    });
    expect(out.hasResults).toBe(true);
    const data = out.data as {
      rows: { cells: { markdown: string }[] }[];
    };
    expect(data.rows[0].cells[0].markdown).toBe(
      '[Unit Tests](https://github.com/owner/repo/actions/runs/1)'
    );
    expect(data.rows[0].cells[1].markdown).toBe('27');
  });

  it('uses plain suite name when link is absent', () => {
    const out = runTestResultsSignal({
      summary: '1 passed',
      showTimestamp: true,
      testSuites: [{ name: 'Unit Tests', passed: 2, failed: 0 }],
    });
    const data = out.data as { rows: { cells: { markdown: string }[] }[] };
    expect(data.rows[0].cells[0].markdown).toBe('Unit Tests');
  });
});

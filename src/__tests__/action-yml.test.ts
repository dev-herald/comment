import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * GitHub Actions runner 2.335.1+ parses ${{ }} in action.yml at load time,
 * before the github context exists — so expressions there break every consumer.
 */
describe('action.yml', () => {
  it('does not contain workflow expressions that break action manifest loading', () => {
    const actionYml = readFileSync(resolve(__dirname, '../../action.yml'), 'utf8');
    expect(actionYml).not.toMatch(/\$\{\{/);
  });
});

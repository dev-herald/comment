import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    root: path.join(__dirname, '..'),
    include: ['sample-tests/tests/vitest.all-passing.test.ts'],
    reporters: ['json'],
    outputFile: path.join(__dirname, '../src/__tests__/test-data/vitest/all-passing.json'),
  },
});

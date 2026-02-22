import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: path.join(__dirname, 'tests'),
  testMatch: ['**/all-passing.spec.ts'],
  reporter: [
    ['json', {
      outputFile: path.join(__dirname, '../src/__tests__/test-data/playwright/all-passing.json')
    }]
  ],
  use: {
    headless: true,
  },
});

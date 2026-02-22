import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: path.join(__dirname, 'tests'),
  testMatch: ['**/with-failures.spec.ts'],
  reporter: [
    ['json', {
      outputFile: path.join(__dirname, '../src/__tests__/test-data/playwright/with-failures.json')
    }]
  ],
  use: {
    headless: true,
  },
});

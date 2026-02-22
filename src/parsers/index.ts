import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { isPlaywrightReport, parsePlaywrightReport } from './playwright';
import type { ParsedTestResults } from './types';

export type { ParsedTestResults, TestSuite } from './types';

/**
 * Reads a test result file from disk, auto-detects its format, and returns
 * a normalized ParsedTestResults object ready to pass as template data.
 *
 * Supported formats:
 *  - Playwright JSON reporter (`--reporter=json`)
 *
 * @param filePath - Absolute or relative path to the results JSON file.
 */
export async function parseResultFile(filePath: string): Promise<ParsedTestResults> {
  if (!existsSync(filePath)) {
    throw new Error(
      `❌ Result file not found: "${filePath}"\n\n` +
      '💡 Make sure your test step runs before this action and the result file path is correct.\n' +
      '   Example: result-location: playwright-report/results.json'
    );
  }

  let raw: unknown;
  try {
    const contents = await readFile(filePath, 'utf-8');
    raw = JSON.parse(contents);
  } catch (error) {
    throw new Error(
      `❌ Failed to read or parse result file "${filePath}": ${error instanceof Error ? error.message : String(error)}\n\n` +
      '💡 Ensure the file is valid JSON produced by your test runner.'
    );
  }

  if (isPlaywrightReport(raw)) {
    return parsePlaywrightReport(raw);
  }

  throw new Error(
    `❌ Unrecognized test result format in "${filePath}".\n\n` +
    '💡 Currently supported formats:\n' +
    '   - Playwright JSON reporter (set reporter: json in playwright.config.ts)\n\n' +
    '   Example playwright.config.ts:\n' +
    '     reporter: [["json", { outputFile: "playwright-report/results.json" }]]'
  );
}

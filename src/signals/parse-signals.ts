import { SIGNAL_TYPES, signalTypeSchema, type SignalType } from '../signal-type';

function unquote(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Parses the YAML-like `signals` input into an ordered list of signal names.
 *
 * Expected format:
 * ```yaml
 * signals: |
 *   - DEPENDENCY_DIFF
 *   - BUNDLE_ANALYSIS
 *   - TEST_RESULTS
 * ```
 */
export function parseSignalsInput(input: string): SignalType[] {
  const names: string[] = [];

  for (const line of input.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const raw = trimmed.startsWith('- ')
      ? trimmed.slice(2)
      : trimmed.replace(/^-/, '');
    const name = unquote(raw);
    if (!name) continue;
    names.push(name);
  }

  if (names.length === 0) {
    throw new Error(
      '❌ Could not parse any signals from "signals" input.\n\n' +
      '💡 Expected format:\n' +
      '    signals: |\n' +
      '      - DEPENDENCY_DIFF\n' +
      '      - BUNDLE_ANALYSIS\n' +
      '      - TEST_RESULTS'
    );
  }

  const parsed: SignalType[] = [];
  for (const name of names) {
    const result = signalTypeSchema.safeParse(name);
    if (!result.success) {
      throw new Error(
        `❌ Unknown signal "${name}".\n\n` +
        `💡 Allowed values: ${SIGNAL_TYPES.join(', ')}`
      );
    }
    parsed.push(result.data);
  }

  const seen = new Set<string>();
  for (const name of parsed) {
    if (seen.has(name)) {
      throw new Error(
        `❌ Duplicate signal "${name}" in "signals". Each signal can only appear once.`
      );
    }
    seen.add(name);
  }

  return parsed;
}

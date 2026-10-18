"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSignalsInput = parseSignalsInput;
const signal_type_1 = require("../signal-type");
function unquote(raw) {
    const trimmed = raw.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
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
function parseSignalsInput(input) {
    const names = [];
    for (const line of input.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const raw = trimmed.startsWith('- ')
            ? trimmed.slice(2)
            : trimmed.replace(/^-/, '');
        const name = unquote(raw);
        if (!name)
            continue;
        names.push(name);
    }
    if (names.length === 0) {
        throw new Error('❌ Could not parse any signals from "signals" input.\n\n' +
            '💡 Expected format:\n' +
            '    signals: |\n' +
            '      - DEPENDENCY_DIFF\n' +
            '      - BUNDLE_ANALYSIS\n' +
            '      - TEST_RESULTS');
    }
    const parsed = [];
    for (const name of names) {
        const result = signal_type_1.signalTypeSchema.safeParse(name);
        if (!result.success) {
            throw new Error(`❌ Unknown signal "${name}".\n\n` +
                `💡 Allowed values: ${signal_type_1.SIGNAL_TYPES.join(', ')}`);
        }
        parsed.push(result.data);
    }
    const seen = new Set();
    for (const name of parsed) {
        if (seen.has(name)) {
            throw new Error(`❌ Duplicate signal "${name}" in "signals". Each signal can only appear once.`);
        }
        seen.add(name);
    }
    return parsed;
}

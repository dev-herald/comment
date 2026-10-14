import { z } from 'zod';

/**
 * Valid signal types.
 * Validated eagerly so unknown signals fail with an allowed-values error
 * before a signal handler runs.
 */
export const SIGNAL_TYPES = ['DEPENDENCY_DIFF', 'TEST_RESULTS', 'NEW_DEPENDENCY', 'BUNDLE_ANALYSIS'] as const;

export const signalTypeSchema = z.enum(SIGNAL_TYPES);
export type SignalType = z.infer<typeof signalTypeSchema>;

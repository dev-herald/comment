"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signalTypeSchema = exports.SIGNAL_TYPES = void 0;
const zod_1 = require("zod");
/**
 * Valid signal types.
 * Validated eagerly so unknown signals fail with an allowed-values error
 * before a signal handler runs.
 */
exports.SIGNAL_TYPES = ['DEPENDENCY_DIFF', 'TEST_RESULTS', 'NEW_DEPENDENCY', 'BUNDLE_ANALYSIS'];
exports.signalTypeSchema = zod_1.z.enum(exports.SIGNAL_TYPES);

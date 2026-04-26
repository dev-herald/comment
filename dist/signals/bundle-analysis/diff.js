"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatBytes = formatBytes;
exports.formatDelta = formatDelta;
exports.computeDiff = computeDiff;
/**
 * Formats bytes to human-readable string (e.g. 4096 -> "4 KB").
 */
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 B';
    const abs = Math.abs(bytes);
    const sign = bytes < 0 ? '-' : '';
    if (abs >= 1024 * 1024)
        return `${sign}${(abs / (1024 * 1024)).toFixed(1)} MB`;
    if (abs >= 1024)
        return `${sign}${(abs / 1024).toFixed(1)} KB`;
    return `${sign}${abs} B`;
}
/**
 * Formats delta with + prefix for positive.
 */
function formatDelta(bytes) {
    if (bytes > 0)
        return `+${formatBytes(bytes)}`;
    return formatBytes(bytes);
}
/**
 * Builds a chunk key for comparison. Same label + source = same chunk.
 */
function chunkKey(c) {
    return c.source ? `${c.source}:${c.label}` : c.label;
}
/**
 * Computes diff between baseline and current bundle reports.
 */
function computeDiff(baseline, current, options) {
    const baselineMap = new Map();
    for (const c of baseline.chunks) {
        baselineMap.set(chunkKey(c), c);
    }
    const currentMap = new Map();
    for (const c of current.chunks) {
        currentMap.set(chunkKey(c), c);
    }
    const rows = [];
    let netDeltaBytes = 0;
    // Added: in current, not in baseline
    for (const [key, curr] of currentMap) {
        if (!baselineMap.has(key)) {
            rows.push({
                label: curr.label,
                changeType: 'added',
                deltaBytes: curr.parsedSize,
                newSizeBytes: curr.parsedSize,
                source: curr.source,
            });
            netDeltaBytes += curr.parsedSize;
        }
    }
    // Removed: in baseline, not in current
    for (const [key, base] of baselineMap) {
        if (!currentMap.has(key)) {
            rows.push({
                label: base.label,
                changeType: 'removed',
                deltaBytes: -base.parsedSize,
                newSizeBytes: 0,
                oldSizeBytes: base.parsedSize,
                source: base.source,
            });
            netDeltaBytes -= base.parsedSize;
        }
    }
    // Changed: same chunk, different size
    for (const [key, curr] of currentMap) {
        const base = baselineMap.get(key);
        if (base && base.parsedSize !== curr.parsedSize) {
            const delta = curr.parsedSize - base.parsedSize;
            rows.push({
                label: curr.label,
                changeType: 'changed',
                deltaBytes: delta,
                newSizeBytes: curr.parsedSize,
                oldSizeBytes: base.parsedSize,
                source: curr.source,
            });
            netDeltaBytes += delta;
        }
    }
    // Sort: added first, then changed (by abs delta desc), then removed
    rows.sort((a, b) => {
        const order = { added: 0, changed: 1, removed: 2 };
        const o = order[a.changeType] - order[b.changeType];
        if (o !== 0)
            return o;
        return Math.abs(b.deltaBytes) - Math.abs(a.deltaBytes);
    });
    const limited = rows.slice(0, options.maxChanges);
    if (limited.length === 0) {
        return {
            hasChanges: false,
            rows: [],
            netDeltaBytes: 0,
            noChangesComment: `## \uD83D\uDCE6 Bundle size\n\n` +
                `No bundle size changes detected vs baseline.\n\n` +
                `<sub>Updated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</sub>`,
        };
    }
    const prefix = (r) => {
        if (r.changeType === 'added')
            return `+ ${r.label}`;
        if (r.changeType === 'removed')
            return `- ${r.label}`;
        return r.label;
    };
    const data = {
        title: `\uD83D\uDCE6 Bundle size (${limited.length} change${limited.length === 1 ? '' : 's'}) · Net: ${formatDelta(netDeltaBytes)}`,
        headers: ['Chunk', 'Delta', 'New Size'],
        rows: limited.map((r) => ({
            cells: [
                { markdown: prefix(r) },
                { markdown: formatDelta(r.deltaBytes) },
                { markdown: r.changeType === 'removed' ? '\u2014' : formatBytes(r.newSizeBytes) },
            ],
        })),
        showTimestamp: true,
    };
    return {
        hasChanges: true,
        rows: limited,
        netDeltaBytes,
        data,
    };
}

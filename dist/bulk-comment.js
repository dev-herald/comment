"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomTable = renderCustomTable;
exports.stripUpdatedFooter = stripUpdatedFooter;
exports.buildBulkComment = buildBulkComment;
/** Trailing timestamp the bundle "no changes" string already includes. */
const UPDATED_FOOTER = /\n*<sub>Updated [\s\S]*?<\/sub>\s*$/;
function escapeCell(value) {
    return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
/**
 * Renders a CUSTOM_TABLE payload as a markdown section.
 * showTimestamp is ignored — bulk comments add one footer for the whole body.
 */
function renderCustomTable(data) {
    const title = typeof data.title === 'string' ? data.title : '';
    const headers = Array.isArray(data.headers) ? data.headers.map((header) => String(header)) : [];
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const headerLine = `| ${headers.map((header) => escapeCell(header)).join(' | ')} |`;
    const separator = `| ${headers.map(() => '---').join(' | ')} |`;
    const body = rows.map((row) => {
        const cells = Array.isArray(row.cells) ? row.cells : [];
        return `| ${cells.map((cell) => escapeCell(cell.markdown ?? '')).join(' | ')} |`;
    });
    return [`## ${title}`, '', headerLine, separator, ...body].join('\n');
}
/** Drops a trailing `<sub>Updated ...</sub>` so the bulk comment can add one footer. */
function stripUpdatedFooter(markdown) {
    return markdown.replace(UPDATED_FOOTER, '').trimEnd();
}
/**
 * Joins rendered sections with a single timestamp footer.
 * Returns null when every section was skipped, so the caller does not post.
 */
function buildBulkComment(outcomes, timestamp) {
    const sections = [];
    for (const outcome of outcomes) {
        if (outcome.action === 'skip')
            continue;
        if (outcome.action === 'table') {
            sections.push(renderCustomTable(outcome.data));
            continue;
        }
        const prose = stripUpdatedFooter(outcome.markdown).trim();
        if (prose)
            sections.push(prose);
    }
    if (sections.length === 0)
        return null;
    return `${sections.join('\n\n')}\n\n<sub>Updated ${timestamp}</sub>`;
}

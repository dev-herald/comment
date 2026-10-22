/**
 * One signal's contribution to a comment.
 * skip: section is omitted because the check could not produce a result (missing bundle baseline).
 * clear: section was checked and has nothing to report (empty dependency diff).
 * table: CUSTOM_TABLE payload rendered locally in bulk mode.
 * comment: short markdown string posted as its own section.
 */
export type SignalOutcome =
  | { action: 'skip'; commentLog: string; sectionLog: string }
  | { action: 'clear'; commentLog: string; sectionLog: string }
  | { action: 'table'; data: Record<string, unknown> }
  | { action: 'comment'; markdown: string };

/** What the step should do after every signal has run. */
export type CommentDecision = 'post' | 'delete' | 'preserve';

interface TableCell {
  markdown?: string;
}

interface TableRow {
  cells?: TableCell[];
}

/** Trailing timestamp the bundle "no changes" string already includes. */
const UPDATED_FOOTER = /\n*<sub>Updated [\s\S]*?<\/sub>\s*$/;

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * Renders a CUSTOM_TABLE payload as a markdown section.
 * showTimestamp is ignored — bulk comments add one footer for the whole body.
 */
export function renderCustomTable(data: Record<string, unknown>): string {
  const title = typeof data.title === 'string' ? data.title : '';
  const headers = Array.isArray(data.headers) ? data.headers.map((header) => String(header)) : [];
  const rows = Array.isArray(data.rows) ? (data.rows as TableRow[]) : [];

  const headerLine = `| ${headers.map((header) => escapeCell(header)).join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => {
    const cells = Array.isArray(row.cells) ? row.cells : [];
    return `| ${cells.map((cell) => escapeCell(cell.markdown ?? '')).join(' | ')} |`;
  });

  return [`## ${title}`, '', headerLine, separator, ...body].join('\n');
}

/** Drops a trailing `<sub>Updated ...</sub>` so the bulk comment can add one footer. */
export function stripUpdatedFooter(markdown: string): string {
  return markdown.replace(UPDATED_FOOTER, '').trimEnd();
}

/**
 * Post when any section has content.
 * Delete when every section was checked and empty.
 * Preserve when nothing is reportable and at least one check could not run.
 */
export function decideCommentAction(outcomes: SignalOutcome[]): CommentDecision {
  if (outcomes.some((outcome) => outcome.action === 'table' || outcome.action === 'comment')) {
    return 'post';
  }
  if (outcomes.some((outcome) => outcome.action === 'skip')) return 'preserve';
  if (outcomes.some((outcome) => outcome.action === 'clear')) return 'delete';
  return 'preserve';
}

/**
 * Joins rendered sections with a single timestamp footer.
 * Returns null when every section was omitted, so the caller does not post.
 */
export function buildBulkComment(outcomes: SignalOutcome[], timestamp: string): string | null {
  const sections: string[] = [];

  for (const outcome of outcomes) {
    if (outcome.action === 'skip' || outcome.action === 'clear') continue;
    if (outcome.action === 'table') {
      sections.push(renderCustomTable(outcome.data));
      continue;
    }
    const prose = stripUpdatedFooter(outcome.markdown).trim();
    if (prose) sections.push(prose);
  }

  if (sections.length === 0) return null;

  return `${sections.join('\n\n')}\n\n<sub>Updated ${timestamp}</sub>`;
}

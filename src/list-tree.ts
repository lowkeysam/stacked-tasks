/**
 * Parsing of Markdown list structure.
 *
 * Everything in here is a pure function over `string[]`, deliberately. The move
 * engine never touches the Obsidian API, which means the interesting behaviour
 * can be unit tested without mocking a vault.
 */

/** A single Markdown list item, with its position in the document. */
export interface ListItem {
  /** Zero-based line number in the source document. */
  lineNum: number;
  /** Indentation measured in columns, with tabs expanded. */
  indent: number;
  /** The untouched source line. */
  raw: string;
  /** The bullet token: `-`, `*`, `+`, or an ordered marker like `1.` / `2)`. */
  bullet: string;
  /** True when the bullet is an ordered marker. Drives sequential subtasks. */
  ordered: boolean;
  /** The character between the brackets, or null when this is not a task. */
  checkbox: string | null;
  /** Everything after the bullet and checkbox. */
  text: string;
}

const LIST_ITEM_RE =
  /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(?:\[([^\]])\](?:[ \t]+|$))?(.*)$/;

const HEADING_RE = /^ {0,3}#{1,6}(?:\s|$)/;

export const isBlank = (line: string): boolean => line.trim() === '';

export const isHeading = (line: string): boolean => HEADING_RE.test(line);

/** Width of a whitespace prefix in columns, expanding tabs to the next stop. */
export const indentWidth = (prefix: string, tabSize: number): number => {
  let width = 0;
  for (const ch of prefix) {
    width += ch === '\t' ? tabSize - (width % tabSize) : 1;
  }
  return width;
};

/** Indentation of any line, list item or not. */
export const contentIndent = (line: string, tabSize: number): number =>
  indentWidth(line.slice(0, line.length - line.trimStart().length), tabSize);

export const parseListItem = (
  line: string,
  lineNum: number,
  tabSize: number,
): ListItem | null => {
  const m = LIST_ITEM_RE.exec(line);
  if (!m) {
    return null;
  }

  const [, prefix, bullet, checkbox, text] = m;
  return {
    lineNum,
    indent: indentWidth(prefix, tabSize),
    raw: line,
    bullet,
    ordered: !/^[-*+]$/.test(bullet),
    checkbox: checkbox ?? null,
    text,
  };
};

export const isTask = (item: ListItem): boolean => item.checkbox !== null;

export const isComplete = (item: ListItem): boolean =>
  item.checkbox === 'x' || item.checkbox === 'X';

const nextNonBlank = (
  lines: string[],
  from: number,
  limit: number,
): number => {
  for (let i = from; i < limit; i++) {
    if (!isBlank(lines[i])) {
      return i;
    }
  }
  return -1;
};

/**
 * Exclusive end index of an item's subtree: the item's own line plus every
 * line nested beneath it.
 *
 * Blank lines are included when more deeply indented content follows, so loose
 * lists survive a move intact. Trailing blank lines are never included.
 */
export const subtreeEnd = (
  lines: string[],
  item: ListItem,
  tabSize: number,
  limit: number = lines.length,
): number => {
  let end = item.lineNum + 1;
  let i = item.lineNum + 1;

  while (i < limit) {
    if (isBlank(lines[i])) {
      const next = nextNonBlank(lines, i, limit);
      if (next === -1 || contentIndent(lines[next], tabSize) <= item.indent) {
        break;
      }
      i = next;
      continue;
    }

    if (contentIndent(lines[i], tabSize) <= item.indent) {
      break;
    }

    i++;
    end = i;
  }

  return end;
};

/**
 * The chain of list items enclosing `item`, outermost first.
 *
 * This is the piece Slated never had: it is what lets a subtask carry its
 * parents to another note instead of arriving as an orphaned indented bullet.
 */
export const ancestorsOf = (
  lines: string[],
  item: ListItem,
  tabSize: number,
): ListItem[] => {
  const out: ListItem[] = [];
  let childIndent = item.indent;

  for (let i = item.lineNum - 1; i >= 0 && childIndent > 0; i--) {
    const line = lines[i];

    if (isBlank(line)) {
      continue;
    }
    if (isHeading(line)) {
      break;
    }

    const parsed = parseListItem(line, i, tabSize);
    if (!parsed) {
      // A continuation paragraph belonging to some list item. Only keep
      // walking if it is itself indented; otherwise the list has ended.
      if (contentIndent(line, tabSize) > 0) {
        continue;
      }
      break;
    }

    if (parsed.indent < childIndent) {
      out.unshift(parsed);
      childIndent = parsed.indent;
    }
  }

  return out;
};

/** Sibling items that appear after `item` under the same parent. */
export const followingSiblings = (
  lines: string[],
  item: ListItem,
  tabSize: number,
  limit: number = lines.length,
): ListItem[] => {
  const out: ListItem[] = [];
  let i = subtreeEnd(lines, item, tabSize, limit);

  while (i < limit) {
    if (isBlank(lines[i])) {
      i++;
      continue;
    }
    if (isHeading(lines[i])) {
      break;
    }

    const parsed = parseListItem(lines[i], i, tabSize);
    if (!parsed) {
      if (contentIndent(lines[i], tabSize) > item.indent) {
        i++;
        continue;
      }
      break;
    }

    if (parsed.indent < item.indent) {
      break;
    }

    if (parsed.indent === item.indent) {
      out.push(parsed);
      i = subtreeEnd(lines, parsed, tabSize, limit);
      continue;
    }

    i++;
  }

  return out;
};

/** Direct children of `item` — used to find where a scaffold parent's kids end. */
export const childrenOf = (
  lines: string[],
  item: ListItem,
  tabSize: number,
  limit: number = lines.length,
): ListItem[] => {
  const out: ListItem[] = [];
  const end = subtreeEnd(lines, item, tabSize, limit);
  let childIndent: number | null = null;
  let i = item.lineNum + 1;

  while (i < end) {
    if (isBlank(lines[i])) {
      i++;
      continue;
    }

    const parsed = parseListItem(lines[i], i, tabSize);
    if (!parsed || parsed.indent <= item.indent) {
      i++;
      continue;
    }

    if (childIndent === null) {
      childIndent = parsed.indent;
    }

    if (parsed.indent === childIndent) {
      out.push(parsed);
      i = subtreeEnd(lines, parsed, tabSize, end);
      continue;
    }

    i++;
  }

  return out;
};

/** True when the document indents its lists with tabs rather than spaces. */
export const usesTabs = (lines: string[]): boolean =>
  lines.some((line) => /^\t+[-*+\d]/.test(line));

/** Build an indentation prefix of the given column width. */
export const makeIndent = (
  columns: number,
  tabSize: number,
  tabs: boolean,
): string =>
  tabs ? '\t'.repeat(Math.round(columns / tabSize)) : ' '.repeat(columns);

/** Re-emit a line at a new indentation, preserving its content exactly. */
export const reindent = (
  line: string,
  fromIndent: number,
  toIndent: number,
  tabSize: number,
  tabs: boolean,
): string => {
  const delta = toIndent - fromIndent;
  const current = contentIndent(line, tabSize);
  const target = Math.max(0, current + delta);
  return makeIndent(target, tabSize, tabs) + line.trimStart();
};

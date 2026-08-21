/**
 * The move engine.
 *
 * `moveItem` is a pure function: it takes the lines of two notes and returns
 * the lines they should become. No Obsidian API, no file IO, no vault mock
 * required to test it.
 */

import {
  ListItem,
  ancestorsOf,
  childrenOf,
  followingSiblings,
  isBlank,
  isComplete,
  isHeading,
  makeIndent,
  parseListItem,
  reindent,
  subtreeEnd,
  usesTabs,
} from './list-tree';
import {
  OriginStyle,
  appendDestinationLink,
  appendOriginLink,
  normalizeForMatch,
  renumber,
  setCheckbox,
  stripBlockId,
  stripOriginLinks,
} from './task-text';

/**
 * How to decide whether a subtask list is sequential.
 *
 * A numbered list implies order — you cannot do step three before step two —
 * so moving one item carries the items after it. Plain bullets are unordered,
 * and each moves on its own.
 */
export type SequentialMode = 'ordered-lists' | 'always' | 'never';

export interface MoveOptions {
  /** Heading the tasks live under, e.g. `## Tasks`. Empty = whole note. */
  tasksHeader: string;
  blankLineAfterHeader: boolean;
  /** Rebuild parent items around a moved subtask. */
  recreateAncestors: boolean;
  /** Nest under an existing matching parent instead of duplicating it. */
  mergeWithExisting: boolean;
  sequentialMode: SequentialMode;
  /** Leave already-completed siblings behind when cascading. */
  cascadeSkipCompleted: boolean;
  /** Mark the source with `movedMarker` instead of deleting it. */
  markSourceAsMoved: boolean;
  movedMarker: string;
  /** Alias for the destination link written on a kept-in-place source line. */
  destinationAlias: string;
  /** Remove a parent left with no children after its last child moved out. */
  pruneEmptyAncestors: boolean;
  originStyle: OriginStyle;
  originAlias: string;
  renumberOrdered: boolean;
  tabSize: number;
}

export interface MoveResult {
  source: string[];
  target: string[];
  /** Number of top-level items moved (excludes their nested children). */
  movedItems: number;
  /** Parent items written fresh into the destination. */
  createdAncestors: string[];
  /** Parent items already present in the destination that were reused. */
  mergedAncestors: string[];
}

interface Range {
  item: ListItem;
  start: number;
  end: number;
}

const trimTrailingBlanks = (
  lines: string[],
  start: number,
  end: number,
): number => {
  let e = end;
  while (e > start && isBlank(lines[e - 1])) {
    e--;
  }
  return e;
};

const headingDepth = (line: string): number => {
  const t = line.trimStart();
  let d = 0;
  while (d < t.length && t[d] === '#') {
    d++;
  }
  return d;
};

/**
 * Locate the tasks heading, appending it when missing. Returns -1 when no
 * heading is configured, meaning the whole note is the target region.
 */
const ensureTasksHeader = (lines: string[], opts: MoveOptions): number => {
  const wanted = opts.tasksHeader.trim();
  if (!wanted) {
    return -1;
  }

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === wanted) {
      return i;
    }
  }

  // Not present — append it at the end of the note.
  if (lines.length === 1 && lines[0] === '') {
    lines[0] = opts.tasksHeader;
    return 0;
  }

  const needsGap = lines.length > 0 && !isBlank(lines[lines.length - 1]);
  if (needsGap) {
    lines.push('');
  }
  lines.push(opts.tasksHeader);
  return lines.length - 1;
};

/** The [start, end) region owned by the tasks heading. */
const sectionWindow = (
  lines: string[],
  headerIdx: number,
): { winStart: number; winEnd: number } => {
  if (headerIdx === -1) {
    return { winStart: 0, winEnd: trimTrailingBlanks(lines, 0, lines.length) };
  }

  const depth = headingDepth(lines[headerIdx]);
  let end = lines.length;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (isHeading(lines[i]) && headingDepth(lines[i]) <= depth) {
      end = i;
      break;
    }
  }

  const start = headerIdx + 1;
  return { winStart: start, winEnd: trimTrailingBlanks(lines, start, end) };
};

/** Find an item in [start, end) at `indent` whose text matches `wanted`. */
const findMatch = (
  lines: string[],
  start: number,
  end: number,
  indent: number,
  wanted: ListItem,
  tabSize: number,
): ListItem | null => {
  const key = normalizeForMatch(wanted.text);
  if (!key) {
    return null;
  }

  for (let i = start; i < end; i++) {
    if (isBlank(lines[i]) || isHeading(lines[i])) {
      continue;
    }
    const parsed = parseListItem(lines[i], i, tabSize);
    if (!parsed) {
      continue;
    }
    if (parsed.indent < indent) {
      break;
    }
    if (parsed.indent === indent && normalizeForMatch(parsed.text) === key) {
      return parsed;
    }
  }

  return null;
};

/**
 * A parent recreated in the destination. It is always written unchecked and
 * stripped of block IDs and origin links, so it reads as a fresh container
 * rather than a half-copied task with stale anchors.
 */
const scaffoldLine = (
  anc: ListItem,
  indent: number,
  tabSize: number,
  tabs: boolean,
): string => {
  const text = stripOriginLinks(stripBlockId(anc.text)).trimEnd();
  const box = anc.checkbox !== null ? '[ ] ' : '';
  return `${makeIndent(indent, tabSize, tabs)}${anc.bullet} ${box}${text}`;
};

/** Prepare a moved task's own line: reset a stale marker, add the origin link. */
const decorateMoved = (
  line: string,
  sourceNoteName: string,
  opts: MoveOptions,
): string => {
  let out = stripOriginLinks(line).trimEnd();
  if (/\[[>]\]/.test(out)) {
    out = setCheckbox(out, ' ');
  }
  return appendOriginLink(out, sourceNoteName, opts.originStyle, opts.originAlias);
};

const insertLines = (
  lines: string[],
  toAdd: string[],
  at: number,
  opts: MoveOptions,
): void => {
  const block = toAdd.slice();
  if (opts.blankLineAfterHeader && at > 0 && isHeading(lines[at - 1])) {
    block.unshift('');
  }
  lines.splice(at, 0, ...block);
};

/** Highest ordered marker already used among items at `indent` in the window. */
const highestOrdinal = (
  lines: string[],
  start: number,
  end: number,
  indent: number,
  tabSize: number,
): number => {
  let max = 0;
  for (let i = start; i < end; i++) {
    const parsed = parseListItem(lines[i], i, tabSize);
    if (!parsed || parsed.indent !== indent || !parsed.ordered) {
      continue;
    }
    const n = parseInt(parsed.bullet, 10);
    if (!Number.isNaN(n)) {
      max = Math.max(max, n);
    }
  }
  return max;
};

/** Re-find an ancestor after the source has been spliced. */
const findItemLike = (
  lines: string[],
  anc: ListItem,
  tabSize: number,
): ListItem | null => {
  const key = normalizeForMatch(anc.text);
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseListItem(lines[i], i, tabSize);
    if (
      parsed &&
      parsed.indent === anc.indent &&
      normalizeForMatch(parsed.text) === key
    ) {
      return parsed;
    }
  }
  return null;
};

/** Renumber the ordered children of a parent so they read 1..n again. */
const renumberChildren = (
  lines: string[],
  parent: ListItem | null,
  tabSize: number,
): void => {
  const kids = parent
    ? childrenOf(lines, parent, tabSize)
    : topLevelItems(lines, tabSize);

  let n = 1;
  for (const kid of kids) {
    if (kid.ordered) {
      lines[kid.lineNum] = renumber(lines[kid.lineNum], n++);
    }
  }
};

const topLevelItems = (lines: string[], tabSize: number): ListItem[] => {
  const out: ListItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseListItem(lines[i], i, tabSize);
    if (parsed && parsed.indent === 0) {
      out.push(parsed);
    }
  }
  return out;
};

/**
 * Move the task on `lineNum` of `sourceLines` into `targetLines`.
 *
 * Returns null when the cursor is not on a list item.
 */
export const moveItem = (
  sourceLines: string[],
  targetLines: string[],
  lineNum: number,
  sourceNoteName: string,
  opts: MoveOptions,
  targetNoteName = '',
): MoveResult | null => {
  const item = parseListItem(sourceLines[lineNum] ?? '', lineNum, opts.tabSize);
  if (!item) {
    return null;
  }

  // --- 1. Which items travel together? ------------------------------------
  const sequential =
    opts.sequentialMode === 'always' ||
    (opts.sequentialMode === 'ordered-lists' && item.ordered);

  let group: ListItem[] = [item];
  if (sequential) {
    const after = followingSiblings(sourceLines, item, opts.tabSize);
    group = [
      item,
      ...(opts.cascadeSkipCompleted ? after.filter((s) => !isComplete(s)) : after),
    ];
  }

  const ranges: Range[] = group.map((g) => ({
    item: g,
    start: g.lineNum,
    end: subtreeEnd(sourceLines, g, opts.tabSize),
  }));

  // --- 2. Parent chain ----------------------------------------------------
  const ancestors = opts.recreateAncestors
    ? ancestorsOf(sourceLines, item, opts.tabSize)
    : [];
  const base = ancestors.length > 0 ? ancestors[0].indent : item.indent;

  // --- 3. Build the destination ------------------------------------------
  const target = targetLines.slice();
  const tabs = usesTabs(target) || usesTabs(sourceLines);
  const headerIdx = ensureTasksHeader(target, opts);
  let { winStart, winEnd } = sectionWindow(target, headerIdx);

  const createdAncestors: string[] = [];
  const mergedAncestors: string[] = [];

  for (const anc of ancestors) {
    const indent = anc.indent - base;
    const match = opts.mergeWithExisting
      ? findMatch(target, winStart, winEnd, indent, anc, opts.tabSize)
      : null;

    if (match) {
      mergedAncestors.push(anc.text);
      const end = subtreeEnd(target, match, opts.tabSize, winEnd);
      winStart = match.lineNum + 1;
      winEnd = trimTrailingBlanks(target, winStart, end);
    } else {
      createdAncestors.push(anc.text);
      const scaffold = [scaffoldLine(anc, indent, opts.tabSize, tabs)];
      if (
        opts.blankLineAfterHeader &&
        winEnd > 0 &&
        isHeading(target[winEnd - 1])
      ) {
        scaffold.unshift('');
      }
      target.splice(winEnd, 0, ...scaffold);
      winStart = winEnd + scaffold.length;
      winEnd = winStart;
    }
  }

  const movedIndent = item.indent - base;
  let ordinal =
    highestOrdinal(target, winStart, winEnd, movedIndent, opts.tabSize) + 1;

  const block: string[] = [];
  for (const r of ranges) {
    for (let i = r.start; i < r.end; i++) {
      let line = reindent(sourceLines[i], base, 0, opts.tabSize, tabs);
      if (i === r.start) {
        line = decorateMoved(line, sourceNoteName, opts);
        if (opts.renumberOrdered && r.item.ordered) {
          line = renumber(line, ordinal++);
        }
      }
      block.push(line);
    }
  }

  insertLines(target, block, winEnd, opts);

  // --- 4. Update the source ----------------------------------------------
  const source = sourceLines.slice();
  for (const r of [...ranges].reverse()) {
    if (opts.markSourceAsMoved) {
      // The whole subtree travelled, so every incomplete task in it gets the
      // marker — a child left as `[ ]` would read as still waiting here.
      // Completed children keep their `[x]` as the record of when they were
      // done.
      for (let i = r.start; i < r.end; i++) {
        const parsed = parseListItem(source[i], i, opts.tabSize);
        if (parsed && parsed.checkbox !== null && !isComplete(parsed)) {
          source[i] = setCheckbox(source[i], opts.movedMarker);
        }
      }
      source[r.start] = appendDestinationLink(
        source[r.start],
        targetNoteName,
        opts.originStyle,
        opts.destinationAlias,
      );
    } else {
      source.splice(r.start, r.end - r.start);
    }
  }

  if (!opts.markSourceAsMoved) {
    const parent = ancestors.length > 0 ? ancestors[ancestors.length - 1] : null;

    if (opts.pruneEmptyAncestors) {
      for (let k = ancestors.length - 1; k >= 0; k--) {
        const found = findItemLike(source, ancestors[k], opts.tabSize);
        if (!found) {
          continue;
        }
        if (childrenOf(source, found, opts.tabSize).length === 0) {
          const end = subtreeEnd(source, found, opts.tabSize);
          source.splice(found.lineNum, end - found.lineNum);
        }
      }
    }

    if (opts.renumberOrdered && item.ordered) {
      const stillThere = parent ? findItemLike(source, parent, opts.tabSize) : null;
      if (!parent || stillThere) {
        renumberChildren(source, stillThere, opts.tabSize);
      }
    }
  }

  return {
    source,
    target,
    movedItems: group.length,
    createdAncestors,
    mergedAncestors,
  };
};

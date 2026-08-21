/**
 * Rewriting and comparing the text of a task line.
 *
 * The important function here is `normalizeForMatch`. When a subtask is moved
 * into a note that already contains its parent, we need to recognise the
 * existing parent and nest underneath it rather than adding a duplicate. That
 * comparison has to see through checkbox state, block IDs, origin links and
 * Tasks-plugin metadata.
 */

/** Trailing `^block-id`. */
const BLOCK_ID_RE = /\s+\^[a-zA-Z0-9-]+\s*$/;

/** Origin markers this plugin writes, plus the older Slated `<`/`>` forms. */
const ORIGIN_LINK_RE = /\s*[<>]{1,2}\[\[[^\]]+\]\]/g;
const ALIASED_ORIGIN_RE = /\s*\[\[[^\]]*\|\s*[←→<>][^\]]*\]\]/g;

/** Destination markers only: `>[[note]]` (Slated) and `[[note|→ …]]` (ours). */
const DEST_LINK_RE = /\s*>{1,2}\[\[[^\]]+\]\]/g;
const ALIASED_DEST_RE = /\s*\[\[[^\]]*\|\s*→[^\]]*\]\]/g;

/** Emoji metadata used by the Tasks plugin, with its trailing value. */
const TASKS_FIELD_RE = /\s*[➕🛫⏳📅✅❌🔁🆔⛔]️?\s*\S*/gu;
/** Bare priority emoji, which carry no value. */
const TASKS_PRIORITY_RE = /\s*[⏫🔼🔽🔺⏬]️?/gu;

/** `[[note|alias]]` -> `alias`, `[[note]]` -> `note`. */
const unwrapWikilinks = (text: string): string =>
  text.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, target, alias) =>
    (alias ?? target).trim(),
  );

export const stripBlockId = (text: string): string =>
  text.replace(BLOCK_ID_RE, '');

export const stripOriginLinks = (text: string): string =>
  text.replace(ALIASED_ORIGIN_RE, '').replace(ORIGIN_LINK_RE, '');

/**
 * Reduce a task's text to a comparable identity. Two lines that normalize to
 * the same string are treated as the same task for merge purposes.
 */
export const normalizeForMatch = (text: string): string => {
  let out = stripBlockId(text);
  out = stripOriginLinks(out);
  out = out.replace(TASKS_FIELD_RE, '').replace(TASKS_PRIORITY_RE, '');
  out = unwrapWikilinks(out);
  return out.replace(/\s+/g, ' ').trim().toLowerCase();
};

/** Replace the checkbox character on a task line, leaving everything else. */
export const setCheckbox = (raw: string, state: string): string =>
  raw.replace(/\[[^\]]\]/, `[${state}]`);

export type OriginStyle = 'none' | 'plain' | 'aliased';

/**
 * Append a link back to the note a task came from. This is the behaviour
 * Slated shipped up to 0.2.2 and dropped in 0.3.0; it is restored here as an
 * explicit setting because it is the reason the workflow is legible weeks later.
 */
export const appendOriginLink = (
  raw: string,
  sourceNoteName: string,
  style: OriginStyle,
  alias: string,
): string => {
  if (style === 'none' || !sourceNoteName) {
    return raw;
  }

  const blockIdMatch = BLOCK_ID_RE.exec(raw);
  const blockId = blockIdMatch ? blockIdMatch[0] : '';
  const body = stripOriginLinks(stripBlockId(raw)).trimEnd();

  const link =
    style === 'aliased'
      ? `[[${sourceNoteName}|${alias}]]`
      : `[[${sourceNoteName}]]`;

  return `${body} ${link}${blockId}`;
};

/**
 * Append a link to the note a task was moved to. Written on the source line
 * when moved tasks are kept in place, so the original note answers "where did
 * this go?" without a search. Replaces any previous destination link, but
 * leaves origin links alone — a line can carry both directions.
 */
export const appendDestinationLink = (
  raw: string,
  targetNoteName: string,
  style: OriginStyle,
  alias: string,
): string => {
  if (style === 'none' || !targetNoteName) {
    return raw;
  }

  const blockIdMatch = BLOCK_ID_RE.exec(raw);
  const blockId = blockIdMatch ? blockIdMatch[0] : '';
  const body = stripBlockId(raw)
    .replace(ALIASED_DEST_RE, '')
    .replace(DEST_LINK_RE, '')
    .trimEnd();

  const link =
    style === 'aliased'
      ? `[[${targetNoteName}|${alias}]]`
      : `[[${targetNoteName}]]`;

  return `${body} ${link}${blockId}`;
};

/** True when the line already carries an origin link. */
export const hasOriginLink = (raw: string): boolean =>
  stripOriginLinks(raw) !== raw;

/**
 * Renumber an ordered list item. Unordered items are returned untouched, so
 * this is safe to map over a mixed block.
 */
export const renumber = (raw: string, n: number): string =>
  raw.replace(/^(\s*)(\d{1,9})([.)])/, (_, indent, __, delim) =>
    `${indent}${n}${delim}`,
  );

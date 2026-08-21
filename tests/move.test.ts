import { describe, expect, it } from 'vitest';
import { MoveOptions, moveItem } from '../src/move';
import { DEFAULT_SETTINGS } from '../src/settings.defaults';

const opts = (over: Partial<MoveOptions> = {}): MoveOptions => ({
  ...DEFAULT_SETTINGS,
  tabSize: 4,
  ...over,
});

const lines = (s: string): string[] => s.split('\n');
const EMPTY = [''];

const SOURCE = '2026-08-14';

describe('moving a subtask on its own', () => {
  const source = lines(
    [
      '## Tasks',
      '',
      '- [ ] Writing',
      '  - [ ] First AI article',
      '  - [ ] Second AI article',
    ].join('\n'),
  );

  it('rebuilds the parent in an empty destination', () => {
    const r = moveItem(source, EMPTY, 4, SOURCE, opts())!;

    expect(r.target).toEqual([
      '## Tasks',
      '',
      '- [ ] Writing',
      '  - [ ] Second AI article [[2026-08-14|← from]]',
    ]);
    expect(r.createdAncestors).toEqual(['Writing']);
  });

  it('leaves the sibling and the parent behind', () => {
    const r = moveItem(source, EMPTY, 4, SOURCE, opts())!;

    expect(r.source).toEqual([
      '## Tasks',
      '',
      '- [ ] Writing',
      '  - [ ] First AI article',
    ]);
  });

  it('nests under an existing parent rather than duplicating it', () => {
    const target = lines(
      ['## Tasks', '', '- [ ] Writing', '  - [ ] Third AI article'].join('\n'),
    );

    const r = moveItem(source, target, 4, SOURCE, opts())!;

    expect(r.target).toEqual([
      '## Tasks',
      '',
      '- [ ] Writing',
      '  - [ ] Third AI article',
      '  - [ ] Second AI article [[2026-08-14|← from]]',
    ]);
    expect(r.mergedAncestors).toEqual(['Writing']);
    expect(r.createdAncestors).toEqual([]);
  });

  it('carries the subtask\'s own children with it', () => {
    const nested = lines(
      [
        '## Tasks',
        '',
        '- [ ] Writing',
        '  - [ ] Second AI article',
        '    - [ ] Research',
        '    - [ ] Draft',
      ].join('\n'),
    );

    const r = moveItem(nested, EMPTY, 3, SOURCE, opts())!;

    expect(r.target).toEqual([
      '## Tasks',
      '',
      '- [ ] Writing',
      '  - [ ] Second AI article [[2026-08-14|← from]]',
      '    - [ ] Research',
      '    - [ ] Draft',
    ]);
  });

  it('rebuilds a multi-level parent chain', () => {
    const deep = lines(
      [
        '## Tasks',
        '',
        '- [ ] Writing',
        '  - [ ] AI series',
        '    - [ ] Second AI article',
      ].join('\n'),
    );

    const r = moveItem(deep, EMPTY, 4, SOURCE, opts())!;

    expect(r.target).toEqual([
      '## Tasks',
      '',
      '- [ ] Writing',
      '  - [ ] AI series',
      '    - [ ] Second AI article [[2026-08-14|← from]]',
    ]);
    expect(r.createdAncestors).toEqual(['Writing', 'AI series']);
  });
});

describe('sequential vs independent subtasks', () => {
  const numbered = lines(
    [
      '## Tasks',
      '',
      '- [ ] Writing',
      '  1. [ ] Outline',
      '  2. [ ] Draft',
      '  3. [ ] Edit',
    ].join('\n'),
  );

  const bulleted = lines(
    [
      '## Tasks',
      '',
      '- [ ] Writing',
      '  - [ ] Outline',
      '  - [ ] Draft',
      '  - [ ] Edit',
    ].join('\n'),
  );

  it('cascades to later steps in a numbered list', () => {
    const r = moveItem(numbered, EMPTY, 4, SOURCE, opts())!;

    expect(r.movedItems).toBe(2);
    expect(r.target).toEqual([
      '## Tasks',
      '',
      '- [ ] Writing',
      '  1. [ ] Draft [[2026-08-14|← from]]',
      '  2. [ ] Edit [[2026-08-14|← from]]',
    ]);
  });

  it('renumbers what is left behind', () => {
    const r = moveItem(numbered, EMPTY, 4, SOURCE, opts())!;

    expect(r.source).toEqual([
      '## Tasks',
      '',
      '- [ ] Writing',
      '  1. [ ] Outline',
    ]);
  });

  it('moves only the one task in a bullet list', () => {
    const r = moveItem(bulleted, EMPTY, 4, SOURCE, opts())!;

    expect(r.movedItems).toBe(1);
    expect(r.target).toEqual([
      '## Tasks',
      '',
      '- [ ] Writing',
      '  - [ ] Draft [[2026-08-14|← from]]',
    ]);
    expect(r.source).toEqual([
      '## Tasks',
      '',
      '- [ ] Writing',
      '  - [ ] Outline',
      '  - [ ] Edit',
    ]);
  });

  it('leaves completed later steps behind when cascading', () => {
    const mixed = lines(
      [
        '## Tasks',
        '',
        '- [ ] Writing',
        '  1. [ ] Draft',
        '  2. [x] Edit',
        '  3. [ ] Publish',
      ].join('\n'),
    );

    const r = moveItem(mixed, EMPTY, 3, SOURCE, opts())!;

    expect(r.movedItems).toBe(2);
    expect(r.source).toEqual([
      '## Tasks',
      '',
      '- [ ] Writing',
      '  1. [x] Edit',
    ]);
  });

  it('honours "never" mode on a numbered list', () => {
    const r = moveItem(
      numbered,
      EMPTY,
      4,
      SOURCE,
      opts({ sequentialMode: 'never' }),
    )!;

    expect(r.movedItems).toBe(1);
  });

  it('honours "always" mode on a bullet list', () => {
    const r = moveItem(
      bulleted,
      EMPTY,
      4,
      SOURCE,
      opts({ sequentialMode: 'always' }),
    )!;

    expect(r.movedItems).toBe(2);
  });

  it('continues numbering from tasks already in the destination', () => {
    const target = lines(
      ['## Tasks', '', '- [ ] Writing', '  1. [ ] Earlier step'].join('\n'),
    );

    const r = moveItem(numbered, target, 5, SOURCE, opts())!;

    expect(r.target).toEqual([
      '## Tasks',
      '',
      '- [ ] Writing',
      '  1. [ ] Earlier step',
      '  2. [ ] Edit [[2026-08-14|← from]]',
    ]);
  });
});

describe('top-level tasks', () => {
  it('moves without any scaffolding', () => {
    const source = lines(['## Tasks', '', '- [ ] Call the bank'].join('\n'));
    const r = moveItem(source, EMPTY, 2, SOURCE, opts())!;

    expect(r.target).toEqual([
      '## Tasks',
      '',
      '- [ ] Call the bank [[2026-08-14|← from]]',
    ]);
    expect(r.createdAncestors).toEqual([]);
  });

  it('appends after existing tasks in the destination', () => {
    const source = lines(['- [ ] Call the bank'].join('\n'));
    const target = lines(['## Tasks', '', '- [ ] Existing'].join('\n'));
    const r = moveItem(source, target, 0, SOURCE, opts())!;

    expect(r.target).toEqual([
      '## Tasks',
      '',
      '- [ ] Existing',
      '- [ ] Call the bank [[2026-08-14|← from]]',
    ]);
  });

  it('creates the tasks heading when the destination lacks one', () => {
    const source = lines(['- [ ] Call the bank'].join('\n'));
    const target = lines(['# Journal', '', 'Some prose.'].join('\n'));
    const r = moveItem(source, target, 0, SOURCE, opts())!;

    expect(r.target).toEqual([
      '# Journal',
      '',
      'Some prose.',
      '',
      '## Tasks',
      '',
      '- [ ] Call the bank [[2026-08-14|← from]]',
    ]);
  });

  it('inserts into the tasks section, not the end of the note', () => {
    const source = lines(['- [ ] Call the bank'].join('\n'));
    const target = lines(
      ['## Tasks', '', '- [ ] Existing', '', '## Notes', '', 'Prose.'].join(
        '\n',
      ),
    );
    const r = moveItem(source, target, 0, SOURCE, opts())!;

    expect(r.target).toEqual([
      '## Tasks',
      '',
      '- [ ] Existing',
      '- [ ] Call the bank [[2026-08-14|← from]]',
      '',
      '## Notes',
      '',
      'Prose.',
    ]);
  });
});

describe('options', () => {
  const source = lines(
    ['## Tasks', '', '- [ ] Writing', '  - [ ] Second AI article'].join('\n'),
  );

  it('can mark the source instead of deleting it', () => {
    const r = moveItem(
      source,
      EMPTY,
      3,
      SOURCE,
      opts({ markSourceAsMoved: true }),
    )!;

    expect(r.source).toEqual([
      '## Tasks',
      '',
      '- [ ] Writing',
      '  - [>] Second AI article',
    ]);
  });

  it('marks the whole subtree when a parent is kept in place', () => {
    const src = lines(
      [
        '## Tasks',
        '',
        '- [ ] [[Toku]]',
        '  - [ ] Get Eric to remit the cash',
        '  - [x] Personal shares sold',
      ].join('\n'),
    );

    const r = moveItem(
      src,
      EMPTY,
      2,
      SOURCE,
      opts({ markSourceAsMoved: true }),
      '2026-08-24',
    )!;

    expect(r.source).toEqual([
      '## Tasks',
      '',
      '- [>] [[Toku]] [[2026-08-24|→ to]]',
      '  - [>] Get Eric to remit the cash',
      '  - [x] Personal shares sold',
    ]);
    expect(r.target).toEqual([
      '## Tasks',
      '',
      '- [ ] [[Toku]] [[2026-08-14|← from]]',
      '  - [ ] Get Eric to remit the cash',
      '  - [x] Personal shares sold',
    ]);
  });

  it('replaces a previous destination link rather than stacking them', () => {
    const src = lines(
      ['## Tasks', '', '- [>] Ship it [[2026-08-20|→ to]]'].join('\n'),
    );

    const r = moveItem(
      src,
      EMPTY,
      2,
      SOURCE,
      opts({ markSourceAsMoved: true }),
      '2026-08-24',
    )!;

    expect(r.source.at(-1)).toBe('- [>] Ship it [[2026-08-24|→ to]]');
    expect(r.target.at(-1)).toBe('- [ ] Ship it [[2026-08-14|← from]]');
  });

  it('keeps origin history and block IDs beside the destination link', () => {
    const src = lines(
      ['## Tasks', '', '- [ ] Ship it [[2026-08-12|← from]] ^task-ship'].join(
        '\n',
      ),
    );

    const r = moveItem(
      src,
      EMPTY,
      2,
      SOURCE,
      opts({ markSourceAsMoved: true }),
      '2026-08-24',
    )!;

    expect(r.source.at(-1)).toBe(
      '- [>] Ship it [[2026-08-12|← from]] [[2026-08-24|→ to]] ^task-ship',
    );
  });

  it('can prune a parent left with no children', () => {
    const r = moveItem(
      source,
      EMPTY,
      3,
      SOURCE,
      opts({ pruneEmptyAncestors: true }),
    )!;

    expect(r.source).toEqual(['## Tasks', '']);
  });

  it('can skip parent rebuilding entirely', () => {
    const r = moveItem(
      source,
      EMPTY,
      3,
      SOURCE,
      opts({ recreateAncestors: false }),
    )!;

    expect(r.target).toEqual([
      '## Tasks',
      '',
      '- [ ] Second AI article [[2026-08-14|← from]]',
    ]);
  });

  it('can duplicate rather than merge parents', () => {
    const target = lines(['## Tasks', '', '- [ ] Writing'].join('\n'));
    const r = moveItem(
      source,
      target,
      3,
      SOURCE,
      opts({ mergeWithExisting: false }),
    )!;

    expect(r.target).toEqual([
      '## Tasks',
      '',
      '- [ ] Writing',
      '- [ ] Writing',
      '  - [ ] Second AI article [[2026-08-14|← from]]',
    ]);
  });

  it('can omit the origin link', () => {
    const r = moveItem(source, EMPTY, 3, SOURCE, opts({ originStyle: 'none' }))!;

    expect(r.target.at(-1)).toBe('  - [ ] Second AI article');
  });

  it('writes a plain origin link', () => {
    const r = moveItem(source, EMPTY, 3, SOURCE, opts({ originStyle: 'plain' }))!;

    expect(r.target.at(-1)).toBe('  - [ ] Second AI article [[2026-08-14]]');
  });
});

describe('repeated moves', () => {
  it('replaces the previous origin link rather than stacking them', () => {
    const source = lines(
      ['## Tasks', '', '- [ ] Ship it [[2026-08-12|← from]]'].join('\n'),
    );
    const r = moveItem(source, EMPTY, 2, '2026-08-14', opts())!;

    expect(r.target.at(-1)).toBe('- [ ] Ship it [[2026-08-14|← from]]');
  });

  it('resets a task previously marked as moved', () => {
    const source = lines(['## Tasks', '', '- [>] Ship it'].join('\n'));
    const r = moveItem(source, EMPTY, 2, SOURCE, opts())!;

    expect(r.target.at(-1)).toBe('- [ ] Ship it [[2026-08-14|← from]]');
  });
});

describe('guards', () => {
  it('returns null when the line is not a list item', () => {
    const source = lines(['## Tasks', '', 'Just prose.'].join('\n'));
    expect(moveItem(source, EMPTY, 2, SOURCE, opts())).toBeNull();
  });

  it('handles tabs as indentation', () => {
    const source = lines(
      ['## Tasks', '', '- [ ] Writing', '\t- [ ] Second AI article'].join('\n'),
    );
    const r = moveItem(source, EMPTY, 3, SOURCE, opts())!;

    expect(r.target).toEqual([
      '## Tasks',
      '',
      '- [ ] Writing',
      '\t- [ ] Second AI article [[2026-08-14|← from]]',
    ]);
  });
});

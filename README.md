# Stacked Tasks

Move tasks between daily notes in Obsidian — and, unlike every other plugin
that does this, move a **subtask on its own** without stranding it.

Say today's note looks like this:

```markdown
## Tasks

- [ ] Writing
  - [ ] First AI article
  - [ ] Second AI article
```

You want to tackle the first article today and push the second one to next
week. Put the cursor on it, run **Move task forward one week**, and next
week's note gets:

```markdown
## Tasks

- [ ] Writing
  - [ ] Second AI article [[2026-08-14|← from]]
```

The parent comes with it. Move a third subtask to the same day later and it
nests under the *existing* `Writing` rather than adding a second copy.

## Sequential vs independent subtasks

Some subtask lists have an order and some don't. Stacked Tasks reads that from
the list marker you already use:

| List style | Meaning | Moving one item |
| --- | --- | --- |
| `- [ ]` bullets | Independent | Moves that item alone |
| `1. [ ]` numbers | Sequential | Also carries the steps after it |

You cannot reconcile the accounts before gathering the receipts, so moving
step 2 of a numbered list takes step 3 with it. Completed steps stay behind as
a record of the day they were finished, and both notes are renumbered so the
lists still read 1, 2, 3.

## Commands

| Command | What it does |
| --- | --- |
| Move task to a date… | Opens a picker with quick options |
| Move task to tomorrow | |
| Move task forward one week | |
| Move task to next Monday | |
| Move all incomplete tasks in this note to today | Bulk rollover |

None ship with a default hotkey — bind whichever you use in
**Settings → Hotkeys**.

## Settings

- **Tasks heading** — where tasks are filed in the destination, created if
  missing. Leave empty to append to the end of the note.
- **Rebuild parent tasks** — recreate the enclosing tasks around a moved
  subtask.
- **Merge with existing parents** — nest under a matching parent instead of
  duplicating it. Matching sees through checkbox state, block IDs, origin
  links and Tasks-plugin metadata.
- **Remove parents left empty** — delete a container whose last child moved out.
- **Treat as sequential** — numbered lists only (default), all lists, or never.
- **Link back to the original note** — aliased, plain, or off.
- **Keep moved tasks in place** — mark the original `[>]` instead of deleting
  it. The marker is applied to the whole moved subtree (completed children keep
  their `[x]`), and a link to the destination note (`[[2026-08-24|→ to]]`) is
  appended so the original note shows where the task went.

## Compatibility

Works with the core **Daily notes** plugin and with **Periodic Notes** (which
takes precedence when enabled). Origin links and Tasks-plugin metadata such as
`📅 2026-08-20` are preserved through a move.

## Development

```bash
npm install
npm test                                    # 26 unit tests, no vault needed
npm run dev                                 # watch build
npm run build                               # typecheck + production bundle
npm run install-local -- /path/to/vault     # copy into a vault to try it
```

The move engine in `src/move.ts` is a pure function over `string[]` — it takes
the lines of two notes and returns the lines they should become. That is why
the test suite needs no Obsidian mock, and it is the main structural
difference from the plugin that inspired this one.

## Credit

Stacked Tasks owes its existence to
[Slated](https://github.com/tgrosinger/slated-obsidian) by Tony Grosinger,
which pioneered this workflow and was archived in 2021. The cross-note origin
links Slated shipped up to 0.2.2 — and dropped in 0.3.0 — are restored here as
an explicit setting, because knowing how long a task has been rolling over is
half the value of rolling it over at all.

This is a fresh implementation rather than a fork, but it is unmistakably a
descendant, and it is GPL-3.0 for the same reason Slated was.

I wrote to Tony before publishing rather than after. He gave his permission and
asked for two things: a new plugin ID, so that lingering Slated installations
could not pick up my builds, and a new name, so that it was clear this is a
separate plugin. Both were done before the first release — the ID is
`stacked-tasks` and the name is "Stacked Tasks". He also pointed me toward
[TaskNotes](https://community.obsidian.md/plugins/tasknotes), which is where he
has since moved his own task list; it takes a file-per-task approach and is
worth a look if the plain-markdown model here is not what you are after.

## Licence

GPL-3.0. See [LICENSE](LICENSE).

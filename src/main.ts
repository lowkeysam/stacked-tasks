import { Editor, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { Moment, moment } from './moment';

import { getOrCreateDailyNote, getTabSize } from './daily-notes';
import { parseListItem } from './list-tree';
import { MoveOptions, MoveResult, moveItem } from './move';
import {
  DEFAULT_SETTINGS,
  StackedTasksSettingTab,
  StackedTasksSettings,
} from './settings';
import { MoveDateModal, nextWeekday } from './ui/move-modal';

const MAX_BULK_MOVES = 500;

export default class StackedTasksPlugin extends Plugin {
  public settings: StackedTasksSettings = { ...DEFAULT_SETTINGS };

  public async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new StackedTasksSettingTab(this.app, this));

    this.addCommand({
      id: 'move-task-to-date',
      name: 'Move task to a date…',
      editorCheckCallback: (checking, editor, view) => {
        if (!this.cursorOnListItem(editor)) {
          return false;
        }
        if (checking) {
          return true;
        }
        this.openMoveModal(editor, view as MarkdownView);
        return true;
      },
    });

    this.addCommand({
      id: 'move-task-tomorrow',
      name: 'Move task to tomorrow',
      editorCheckCallback: (checking, editor, view) =>
        this.quickMove(checking, editor, view as MarkdownView, () =>
          moment().add(1, 'day').startOf('day'),
        ),
    });

    this.addCommand({
      id: 'move-task-next-week',
      name: 'Move task forward one week',
      editorCheckCallback: (checking, editor, view) =>
        this.quickMove(checking, editor, view as MarkdownView, () =>
          moment().add(7, 'days').startOf('day'),
        ),
    });

    this.addCommand({
      id: 'move-task-next-monday',
      name: 'Move task to next Monday',
      editorCheckCallback: (checking, editor, view) =>
        this.quickMove(checking, editor, view as MarkdownView, () =>
          nextWeekday(1),
        ),
    });

    this.addCommand({
      id: 'move-incomplete-to-today',
      name: 'Move all incomplete tasks in this note to today',
      editorCheckCallback: (checking, editor, view) => {
        if (checking) {
          return true;
        }
        void this.moveAllIncomplete(editor, view as MarkdownView);
        return true;
      },
    });
  }

  public async loadSettings(): Promise<void> {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<StackedTasksSettings> | null,
    );
  }

  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private tabSize(): number {
    return getTabSize(this.app);
  }

  private moveOptions(): MoveOptions {
    return { ...this.settings, tabSize: this.tabSize() };
  }

  private cursorOnListItem(editor: Editor): boolean {
    const line = editor.getLine(editor.getCursor().line);
    return parseListItem(line, 0, this.tabSize()) !== null;
  }

  private quickMove(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
    resolveDate: () => Moment,
  ): boolean {
    if (!this.cursorOnListItem(editor)) {
      return false;
    }
    if (checking) {
      return true;
    }
    void this.performMove(editor, view, resolveDate());
    return true;
  }

  private openMoveModal(editor: Editor, view: MarkdownView): void {
    const line = editor.getLine(editor.getCursor().line);
    const item = parseListItem(line, 0, this.tabSize());
    const summary = item ? item.text.trim() : line.trim();

    new MoveDateModal(this.app, summary, async (date) => {
      await this.performMove(editor, view, date);
    }).open();
  }

  private async resolveTarget(
    view: MarkdownView,
    date: Moment,
  ): Promise<TFile | null> {
    const source = view.file;
    if (!source) {
      new Notice('Stacked Tasks: no file is open.');
      return null;
    }

    let target: TFile;
    try {
      target = await getOrCreateDailyNote(this.app, date);
    } catch (err) {
      console.error('Stacked Tasks: could not open daily note', err);
      new Notice('Stacked Tasks: could not create the destination daily note.');
      return null;
    }

    if (target.path === source.path) {
      new Notice('Stacked Tasks: that task is already in this note.');
      return null;
    }

    return target;
  }

  private async performMove(
    editor: Editor,
    view: MarkdownView,
    date: Moment,
  ): Promise<void> {
    const source = view.file;
    const target = await this.resolveTarget(view, date);
    if (!source || !target) {
      return;
    }

    const cursor = editor.getCursor();
    const sourceLines = editor.getValue().split('\n');
    const targetLines = (await this.app.vault.read(target)).split('\n');

    const result = moveItem(
      sourceLines,
      targetLines,
      cursor.line,
      source.basename,
      this.moveOptions(),
      target.basename,
    );

    if (!result) {
      new Notice('Stacked Tasks: the cursor is not on a task.');
      return;
    }

    await this.applyResult(editor, target, result, cursor.line);
    new Notice(this.describe(result, target.basename));
  }

  private async moveAllIncomplete(
    editor: Editor,
    view: MarkdownView,
  ): Promise<void> {
    const source = view.file;
    const today = moment().startOf('day');
    const target = await this.resolveTarget(view, today);
    if (!source || !target) {
      return;
    }

    const opts = this.moveOptions();
    let sourceLines = editor.getValue().split('\n');
    let targetLines = (await this.app.vault.read(target)).split('\n');
    let moved = 0;

    for (let guard = 0; guard < MAX_BULK_MOVES; guard++) {
      const idx = this.firstIncompleteTopLevel(sourceLines);
      if (idx === -1) {
        break;
      }

      const result = moveItem(
        sourceLines,
        targetLines,
        idx,
        source.basename,
        opts,
        target.basename,
      );
      if (!result) {
        break;
      }

      sourceLines = result.source;
      targetLines = result.target;
      moved += result.movedItems;
    }

    if (moved === 0) {
      new Notice('Stacked Tasks: no incomplete tasks to move.');
      return;
    }

    await this.applyResult(
      editor,
      target,
      { source: sourceLines, target: targetLines } as MoveResult,
      editor.getCursor().line,
    );

    new Notice(
      `Stacked Tasks: moved ${moved} task${moved === 1 ? '' : 's'} to ${target.basename}.`,
    );
  }

  private firstIncompleteTopLevel(lines: string[]): number {
    const tabSize = this.tabSize();
    for (let i = 0; i < lines.length; i++) {
      const item = parseListItem(lines[i], i, tabSize);
      if (item && item.indent === 0 && item.checkbox === ' ') {
        return i;
      }
    }
    return -1;
  }

  private async applyResult(
    editor: Editor,
    target: TFile,
    result: Pick<MoveResult, 'source' | 'target'>,
    cursorLine: number,
  ): Promise<void> {
    await this.app.vault.process(target, () => result.target.join('\n'));

    editor.setValue(result.source.join('\n'));
    const line = Math.min(Math.max(cursorLine, 0), editor.lastLine());
    editor.setCursor({ line, ch: editor.getLine(line).length });
  }

  private describe(result: MoveResult, targetName: string): string {
    const parts: string[] = [];
    parts.push(
      result.movedItems === 1
        ? `Moved to ${targetName}`
        : `Moved ${result.movedItems} sequential tasks to ${targetName}`,
    );

    if (result.mergedAncestors.length > 0) {
      parts.push(`nested under existing "${result.mergedAncestors.at(-1)}"`);
    } else if (result.createdAncestors.length > 0) {
      parts.push(`rebuilt "${result.createdAncestors.join(' › ')}"`);
    }

    return `Stacked Tasks: ${parts.join(', ')}.`;
  }
}

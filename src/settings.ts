import { App, PluginSettingTab, Setting } from 'obsidian';
import type { SequentialMode } from './move';
import type { OriginStyle } from './task-text';
import type StackedTasksPlugin from './main';

export {
  DEFAULT_SETTINGS,
  type StackedTasksSettings,
} from './settings.defaults';

export class StackedTasksSettingTab extends PluginSettingTab {
  private readonly plugin: StackedTasksPlugin;

  constructor(app: App, plugin: StackedTasksPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  public display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const save = async (): Promise<void> => {
      await this.plugin.saveSettings();
    };

    new Setting(containerEl)
      .setName('Tasks heading')
      .setDesc(
        'Heading in the destination note that tasks are filed under. Created if missing. Leave empty to append to the end of the note.',
      )
      .addText((t) =>
        t
          .setPlaceholder('## Tasks')
          .setValue(this.plugin.settings.tasksHeader)
          .onChange(async (v) => {
            this.plugin.settings.tasksHeader = v;
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('Blank line after heading')
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.blankLineAfterHeader)
          .onChange(async (v) => {
            this.plugin.settings.blankLineAfterHeader = v;
            await save();
          }),
      );

    new Setting(containerEl).setName('Subtasks').setHeading();

    new Setting(containerEl)
      .setName('Rebuild parent tasks')
      .setDesc(
        'When moving a subtask on its own, recreate the tasks it was nested under in the destination note.',
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.recreateAncestors)
          .onChange(async (v) => {
            this.plugin.settings.recreateAncestors = v;
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('Merge with existing parents')
      .setDesc(
        'If the destination already contains a matching parent task, nest underneath it instead of adding a duplicate.',
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.mergeWithExisting)
          .onChange(async (v) => {
            this.plugin.settings.mergeWithExisting = v;
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('Remove parents left empty')
      .setDesc(
        'When the last subtask moves out, delete the parent it leaves behind rather than keeping an empty container.',
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.pruneEmptyAncestors)
          .onChange(async (v) => {
            this.plugin.settings.pruneEmptyAncestors = v;
            await save();
          }),
      );

    new Setting(containerEl).setName('Sequential subtasks').setHeading();

    new Setting(containerEl)
      .setName('Treat as sequential')
      .setDesc(
        'Sequential subtasks depend on the ones before them, so moving one also moves the ones after it. By default a numbered list is sequential and a bullet list is not.',
      )
      .addDropdown((d) =>
        d
          .addOption('ordered-lists', 'Numbered lists only')
          .addOption('always', 'All subtask lists')
          .addOption('never', 'Never — always move one at a time')
          .setValue(this.plugin.settings.sequentialMode)
          .onChange(async (v) => {
            this.plugin.settings.sequentialMode = v as SequentialMode;
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('Leave completed siblings behind')
      .setDesc(
        'When a sequential move cascades, completed tasks stay in the original note as a record of the day they were finished.',
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.cascadeSkipCompleted)
          .onChange(async (v) => {
            this.plugin.settings.cascadeSkipCompleted = v;
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('Renumber ordered lists')
      .setDesc(
        'Keep numbered lists reading 1, 2, 3 in both notes after a move.',
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.renumberOrdered)
          .onChange(async (v) => {
            this.plugin.settings.renumberOrdered = v;
            await save();
          }),
      );

    new Setting(containerEl).setName('Origin tracking').setHeading();

    new Setting(containerEl)
      .setName('Link back to the original note')
      .setDesc(
        'Append a link to the note a task was moved from, so you can see how long it has been rolling over.',
      )
      .addDropdown((d) =>
        d
          .addOption('aliased', 'Aliased link')
          .addOption('plain', 'Plain link')
          .addOption('none', 'No link')
          .setValue(this.plugin.settings.originStyle)
          .onChange(async (v) => {
            this.plugin.settings.originStyle = v as OriginStyle;
            await save();
            this.display();
          }),
      );

    if (this.plugin.settings.originStyle === 'aliased') {
      new Setting(containerEl)
        .setName('Link alias')
        .addText((t) =>
          t
            .setPlaceholder('← from')
            .setValue(this.plugin.settings.originAlias)
            .onChange(async (v) => {
              this.plugin.settings.originAlias = v;
              await save();
            }),
        );
    }

    new Setting(containerEl).setName('Original note').setHeading();

    new Setting(containerEl)
      .setName('Keep moved tasks in place')
      .setDesc(
        'Instead of deleting the task from the original note, mark it and its subtasks so the note still records that the work was planned that day. A link to the destination note is appended, using the origin-tracking link style.',
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.markSourceAsMoved)
          .onChange(async (v) => {
            this.plugin.settings.markSourceAsMoved = v;
            await save();
            this.display();
          }),
      );

    if (this.plugin.settings.markSourceAsMoved) {
      new Setting(containerEl)
        .setName('Marker character')
        .setDesc('The character placed between the brackets, e.g. [>].')
        .addText((t) =>
          t
            .setPlaceholder('>')
            .setValue(this.plugin.settings.movedMarker)
            .onChange(async (v) => {
              this.plugin.settings.movedMarker = v.slice(0, 1) || '>';
              await save();
            }),
        );

      if (this.plugin.settings.originStyle === 'aliased') {
        new Setting(containerEl)
          .setName('Destination link alias')
          .setDesc(
            'Alias for the link appended to the kept task, pointing at the note it moved to.',
          )
          .addText((t) =>
            t
              .setPlaceholder('→ to')
              .setValue(this.plugin.settings.destinationAlias)
              .onChange(async (v) => {
                this.plugin.settings.destinationAlias = v;
                await save();
              }),
          );
      }
    }
  }
}

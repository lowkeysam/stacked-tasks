import { App, Modal, Setting } from 'obsidian';
import { Moment, moment } from '../moment';

type Picked = (date: Moment) => void | Promise<void>;

/** Next occurrence of a weekday (1 = Monday), always in the future. */
export const nextWeekday = (isoWeekday: number, from?: Moment): Moment => {
  const base = (from ?? moment()).clone().startOf('day');
  const candidate = base.clone().isoWeekday(isoWeekday);
  return candidate.isAfter(base) ? candidate : candidate.add(7, 'days');
};

export class MoveDateModal extends Modal {
  private readonly summary: string;
  private readonly onPick: Picked;
  private selected: Moment;

  constructor(app: App, summary: string, onPick: Picked) {
    super(app);
    this.summary = summary;
    this.onPick = onPick;
    this.selected = moment().add(1, 'day').startOf('day');
  }

  public onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText('Move task');

    contentEl.createEl('p', {
      text: this.summary,
      cls: 'stacked-tasks-summary',
    });

    const quick: Array<[string, () => Moment]> = [
      ['Tomorrow', () => moment().add(1, 'day').startOf('day')],
      ['Next Monday', () => nextWeekday(1)],
      ['In a week', () => moment().add(7, 'days').startOf('day')],
      ['In a month', () => moment().add(1, 'month').startOf('day')],
    ];

    const row = contentEl.createDiv({ cls: 'stacked-tasks-quick' });
    for (const [label, resolve] of quick) {
      const btn = row.createEl('button', { text: label });
      btn.addEventListener('click', () => {
        void this.commit(resolve());
      });
    }

    new Setting(contentEl)
      .setName('Or pick a date')
      .addText((text) => {
        text.inputEl.type = 'date';
        text.inputEl.value = this.selected.format('YYYY-MM-DD');
        text.onChange((v) => {
          const parsed = moment(v, 'YYYY-MM-DD', true);
          if (parsed.isValid()) {
            this.selected = parsed.startOf('day');
          }
        });
        text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void this.commit(this.selected);
          }
        });
      })
      .addButton((b) =>
        b
          .setButtonText('Move')
          .setCta()
          .onClick(() => {
            void this.commit(this.selected);
          }),
      );
  }

  private async commit(date: Moment): Promise<void> {
    this.close();
    await this.onPick(date);
  }

  public onClose(): void {
    this.contentEl.empty();
  }
}

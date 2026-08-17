/**
 * Daily-note resolution.
 *
 * Deliberately dependency-free. The usual choice here is
 * `obsidian-daily-notes-interface`, but that package is itself unmaintained,
 * and this plugin exists precisely because depending on unmaintained code
 * eventually costs you. Reading the core plugin's own settings is ~60 lines.
 */

import { App, TFile, TFolder, normalizePath } from 'obsidian';
import type { Moment } from 'moment';

export interface DailyNoteConfig {
  folder: string;
  format: string;
  template: string;
}

interface InternalPluginInstance {
  options?: { folder?: string; format?: string; template?: string };
}

type InternalApp = App & {
  internalPlugins?: {
    getPluginById(id: string): { instance?: InternalPluginInstance } | null;
  };
  plugins?: {
    getPlugin(id: string): {
      settings?: {
        daily?: {
          enabled?: boolean;
          folder?: string;
          format?: string;
          template?: string;
        };
      };
    } | null;
  };
};

export const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';

/** Periodic Notes wins when it is enabled, matching every other plugin. */
export const getDailyNoteConfig = (app: App): DailyNoteConfig => {
  const internal = app as InternalApp;

  const periodic = internal.plugins?.getPlugin('periodic-notes')?.settings?.daily;
  if (periodic?.enabled) {
    return {
      folder: periodic.folder ?? '',
      format: periodic.format || DEFAULT_DATE_FORMAT,
      template: periodic.template ?? '',
    };
  }

  const core =
    internal.internalPlugins?.getPluginById('daily-notes')?.instance?.options ??
    {};

  return {
    folder: core.folder ?? '',
    format: core.format || DEFAULT_DATE_FORMAT,
    template: core.template ?? '',
  };
};

export const dailyNotePath = (config: DailyNoteConfig, date: Moment): string => {
  const name = date.format(config.format);
  const folder = config.folder.replace(/\/+$/, '');
  return normalizePath(`${folder ? `${folder}/` : ''}${name}.md`);
};

/** Find a daily note without creating it. */
export const findDailyNote = (app: App, date: Moment): TFile | null => {
  const path = dailyNotePath(getDailyNoteConfig(app), date);
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile ? file : null;
};

const ensureFolder = async (app: App, filePath: string): Promise<void> => {
  const dir = filePath.split('/').slice(0, -1).join('/');
  if (!dir) {
    return;
  }
  const existing = app.vault.getAbstractFileByPath(dir);
  if (existing instanceof TFolder) {
    return;
  }
  await app.vault.createFolder(dir).catch(() => undefined);
};

const renderTemplate = async (
  app: App,
  templatePath: string,
  date: Moment,
  title: string,
): Promise<string> => {
  if (!templatePath) {
    return '';
  }

  const path = templatePath.endsWith('.md')
    ? templatePath
    : `${templatePath}.md`;
  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  if (!(file instanceof TFile)) {
    return '';
  }

  const raw = await app.vault.cachedRead(file);

  // Core-style tokens only. Templater and friends run their own pass on
  // creation when the user has enabled it.
  return raw
    .replace(/{{\s*title\s*}}/gi, title)
    .replace(/{{\s*date\s*:([^}]+)}}/gi, (_, fmt: string) =>
      date.format(fmt.trim()),
    )
    .replace(/{{\s*time\s*:([^}]+)}}/gi, (_, fmt: string) =>
      date.format(fmt.trim()),
    )
    .replace(/{{\s*date\s*}}/gi, date.format(DEFAULT_DATE_FORMAT))
    .replace(/{{\s*time\s*}}/gi, date.format('HH:mm'));
};

/** Get the daily note for `date`, creating it from the template if needed. */
export const getOrCreateDailyNote = async (
  app: App,
  date: Moment,
): Promise<TFile> => {
  const config = getDailyNoteConfig(app);
  const path = dailyNotePath(config, date);

  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    return existing;
  }

  await ensureFolder(app, path);
  const title = date.format(config.format).split('/').pop() ?? '';
  const contents = await renderTemplate(app, config.template, date, title);
  return app.vault.create(path, contents);
};

/** Editor indentation settings, used to interpret tabs consistently. */
export const getTabSize = (app: App): number => {
  const getConfig = (app.vault as unknown as { getConfig?(k: string): unknown })
    .getConfig;
  const size = getConfig?.call(app.vault, 'tabSize');
  return typeof size === 'number' && size > 0 ? size : 4;
};

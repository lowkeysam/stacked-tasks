/**
 * Settings shape and defaults, kept free of any `obsidian` import so the move
 * engine and its tests can use them without loading the app.
 */

import type { SequentialMode } from './move';
import type { OriginStyle } from './task-text';

export interface StackedTasksSettings {
  tasksHeader: string;
  blankLineAfterHeader: boolean;
  recreateAncestors: boolean;
  mergeWithExisting: boolean;
  sequentialMode: SequentialMode;
  cascadeSkipCompleted: boolean;
  markSourceAsMoved: boolean;
  movedMarker: string;
  pruneEmptyAncestors: boolean;
  originStyle: OriginStyle;
  originAlias: string;
  renumberOrdered: boolean;
}

export const DEFAULT_SETTINGS: StackedTasksSettings = {
  tasksHeader: '## Tasks',
  blankLineAfterHeader: true,
  recreateAncestors: true,
  mergeWithExisting: true,
  sequentialMode: 'ordered-lists',
  cascadeSkipCompleted: true,
  markSourceAsMoved: false,
  movedMarker: '>',
  pruneEmptyAncestors: false,
  originStyle: 'aliased',
  originAlias: '← from',
  renumberOrdered: true,
};

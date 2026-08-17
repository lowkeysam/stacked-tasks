/**
 * Obsidian re-exports moment on its API surface, but types it as
 * `typeof import('moment')`. Under TypeScript 7 — where `esModuleInterop` can
 * no longer be turned off — that resolves to the module namespace object,
 * which is not callable. Re-type it once here rather than casting at every
 * call site.
 *
 * Runtime behaviour is unchanged: this is still the app's own moment instance,
 * so the user's locale and week-start settings apply and nothing extra is
 * bundled.
 */

import { moment as obsidianMoment } from 'obsidian';
import type { Moment, MomentFormatSpecification, MomentInput } from 'moment';

interface MomentFactory {
  (
    input?: MomentInput,
    format?: MomentFormatSpecification,
    strict?: boolean,
  ): Moment;
}

export const moment = obsidianMoment as unknown as MomentFactory;
export type { Moment };

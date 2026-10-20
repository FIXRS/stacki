import { object, text } from '../core/boundary';
import { DEFAULT_LIMITS, type DefaultsSnapshot } from './componentDefaults';

export const CANVAS_DIRECTORY = '.stacki/canvas/';
export function isDefaultsCanvas(file: string): boolean {
  return /^\.stacki\/canvas\/[a-f0-9-]{36}\.astro$/.test(file);
}
export function isCanvasPage(file: string): boolean {
  return file.startsWith('src/pages/') || isDefaultsCanvas(file);
}
export function defaultsCanvasFile(input: unknown): string {
  const file = text(input);
  if (!isDefaultsCanvas(file)) {
    throw new Error('Invalid component defaults canvas path');
  }
  return file;
}
export function defaultsCanvasSource(input: unknown): string {
  const source = text(input);
  if (source.length > DEFAULT_LIMITS.sourceCharsMax) {
    throw new Error('Component defaults canvas exceeds 256 KiB');
  }
  return source;
}
export const parseCanvasCreate = object({ file: defaultsCanvasFile, source: defaultsCanvasSource });
export const parseCanvasFile = object({ file: defaultsCanvasFile });
export function defaultsCanvasRoute(file: string): string {
  return '/__avb/preview?defaults=' + defaultsCanvasFile(file).slice(CANVAS_DIRECTORY.length, -6);
}
export interface DefaultsCanvasSession {
  readonly file: string;
  readonly component: string;
  readonly targetPath: string;
  readonly context: string;
  readonly snapshot: DefaultsSnapshot;
}

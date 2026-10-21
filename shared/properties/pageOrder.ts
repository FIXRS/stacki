// Shared ordering uses page-relative paths, with a trailing slash identifying folders.
import { record } from '../core/boundary';

export const PAGE_ORDER_LIMITS = { entriesMax: 20_000, pathCharsMax: 1024 } as const;
export interface PageOrder {
  readonly version: 1;
  readonly entries: readonly string[];
}
export const EMPTY_PAGE_ORDER: PageOrder = { version: 1, entries: [] };
export type PageDropPosition = 'before' | 'after';

export function pageOrderKey(input: unknown): string | undefined {
  if (typeof input !== 'string' || input.length === 0) {
    return undefined;
  }
  if (input.length > PAGE_ORDER_LIMITS.pathCharsMax || /[\\\u0000-\u001f]/.test(input)) {
    return undefined;
  }
  const path = input.endsWith('/') ? input.slice(0, -1) : input;
  if (path.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    return undefined;
  }
  if (!input.endsWith('/') && !/\.(astro|mdx?)$/i.test(input)) {
    return undefined;
  }
  return input;
}

export function parsePageOrder(input: unknown): PageOrder {
  const value = record(input);
  if (value['version'] !== 1) {
    throw new Error('Unsupported page order version');
  }
  const entries = value['entries'];
  if (!Array.isArray(entries) || entries.length > PAGE_ORDER_LIMITS.entriesMax) {
    throw new Error('Invalid page order entries');
  }
  const keys = entries.map((entry: unknown) => {
    const key = pageOrderKey(entry);
    if (key === undefined) {
      throw new Error('Invalid page order path');
    }
    return key;
  });
  if (new Set(keys).size !== keys.length) {
    throw new Error('Duplicate page order path');
  }
  return { version: 1, entries: keys };
}

export function pageOrderParent(key: string): string {
  const path = key.endsWith('/') ? key.slice(0, -1) : key;
  return path.slice(0, path.lastIndexOf('/') + 1);
}

export function reorderPageEntries(
  order: PageOrder,
  siblings: readonly string[],
  move: { readonly source: string; readonly target: string; readonly position: PageDropPosition },
): PageOrder {
  const { source, target, position } = move;
  if (source === target || !siblings.includes(source) || !siblings.includes(target)) {
    return order;
  }
  const parent = pageOrderParent(source);
  if (siblings.some((key) => pageOrderParent(key) !== parent)) {
    return order;
  }
  const next = siblings.filter((key) => key !== source);
  next.splice(next.indexOf(target) + (position === 'after' ? 1 : 0), 0, source);
  // Keep other folders' ordering, and remove stale siblings when that folder is reordered.
  return parsePageOrder({
    version: 1,
    entries: [...order.entries.filter((key) => pageOrderParent(key) !== parent), ...next],
  });
}

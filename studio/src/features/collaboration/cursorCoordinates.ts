import type { CursorPosition } from './cursorPresence';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function cursorAt(x: number, y: number, target: Element | null): CursorPosition {
  const root = document.documentElement;
  const anchor = cursorAnchor(x, y, target);
  return {
    x: clamp((x + scrollX) / Math.max(1, root.scrollWidth)),
    y: clamp((y + scrollY) / Math.max(1, root.scrollHeight)),
    ...(anchor ? { anchor } : {}),
  };
}
function cursorAnchor(x: number, y: number, target: Element | null): CursorPosition['anchor'] {
  for (let element = target; element; element = element.parentElement) {
    const path = element
      .getAttribute('data-avb-p')
      ?.split(' ')
      .filter((id) => /^\d+(\.\d+)*$/.test(id))
      .at(-1);
    if (!path) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }
    const elements = [...document.querySelectorAll(`[data-avb-p~="${path}"]`)];
    return {
      path,
      occurrence: Math.max(0, elements.indexOf(element)),
      x: clamp((x - rect.left) / rect.width),
      y: clamp((y - rect.top) / rect.height),
    };
  }
  return undefined;
}
export function cursorPoint(cursor: CursorPosition): { readonly x: number; readonly y: number } {
  if (cursor.anchor) {
    const { path, occurrence, x, y } = cursor.anchor;
    const element = document.querySelectorAll(`[data-avb-p~="${path}"]`)[occurrence];
    const rect = element?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      return { x: rect.left + rect.width * x, y: rect.top + rect.height * y };
    }
  }
  return {
    x: cursor.x * document.documentElement.scrollWidth - scrollX,
    y: cursor.y * document.documentElement.scrollHeight - scrollY,
  };
}

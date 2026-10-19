import { runsOf, elementsWithPath } from '../../../vendor/stacki/electron/preload/frameRegions';
import { record, string } from '../../shared/validation';
const pending = new Map<string, { text: string; before: string; parent: string }>();
function decodeText(text: string) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text.replaceAll('<', '&lt;');
  return textarea.value;
}
export function receiveLiveText(input: unknown) {
  try {
    const data = record(input);
    if (data['type'] !== 'studio:live-text' || !Array.isArray(data['changes'])) {
      return;
    }
    if (data['reset'] === true) {
      pending.clear();
    }
    for (const input of data['changes'].slice(0, 500)) {
      const change = record(input);
      const path = string(change['path'], 1000);
      if (pending.size < 500 || pending.has(path)) {
        pending.set(path, {
          text: decodeText(string(change['text'], 100_000)),
          before: decodeText(string(change['before'], 100_000)),
          parent: string(change['parent'], 1000),
        });
      }
    }
    applyLiveText(false);
  } catch {
    /* Invalid preview messages cannot modify the page. */
  }
}
export function applyLiveText(reconcile = true) {
  for (const [path, change] of pending) {
    const { text } = change;
    const runs = runsOf(path) ?? literalRuns(change);
    if (!runs?.length) {
      continue;
    }
    let caughtUp = true;
    for (const run of runs) {
      const texts = run.filter((node): node is Text => node instanceof Text);
      // Never rewrite a component's DOM or an expression. Only a region
      // containing one literal text node is eligible for this fast path.
      if (texts.length !== 1 || run.some((node) => node instanceof Element)) {
        continue;
      }
      const node = texts[0];
      if (node && node.data !== text) {
        caughtUp = false;
        node.data = text;
      }
    }
    if (reconcile && caughtUp) {
      pending.delete(path);
    }
  }
}

function literalRuns(change: { text: string; before: string; parent: string }): Node[][] {
  if (!change.parent) {
    return [];
  }
  return elementsWithPath(change.parent).flatMap((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const matches: Text[] = [];
    let node: Node | null;
    let count = 0;
    while ((node = walker.nextNode()) && count++ < 1000) {
      if (
        node instanceof Text &&
        (node.data.trim() === change.before.trim() || node.data.trim() === change.text.trim())
      ) {
        matches.push(node);
      }
    }
    return matches.length === 1 ? [matches] : [];
  });
}

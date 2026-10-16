// Inline text has no path attribute, and slot helpers can remove its comment
// markers. Only a known text selection may explicitly ask its rendered parent
// for style values; selector matching and edit identity keep the original path.
import { findNode, getHost } from './host';

export function textStyleContext(path: string): { readonly textParentPath?: string } {
  const host = getHost();
  const selected = host.selectedId ? findNode(host.nodes, host.selectedId) : undefined;
  if (selected?.kind !== 'text') {
    return {};
  }
  if (host.pathOf?.(selected.id) !== path) {
    return {};
  }
  if (!selected.value?.trim()) {
    return {};
  }
  const separator = path.lastIndexOf('.');
  if (separator <= path.lastIndexOf('|')) {
    return {};
  }
  return { textParentPath: path.slice(0, separator) };
}

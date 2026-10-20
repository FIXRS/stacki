import { isCanvasPage } from '../../../vendor/stacki/shared/properties/defaultsCanvas';
import { useLayoutEffect, useRef } from 'react';
import { flatten, type ParserNode } from '../source/source';
import { pathFor } from '../project/previewSelection';
import type { usePreview } from './usePreview';
// The server still owns rendering. Literal text can reach the existing text
// region immediately while Astro compiles the authoritative page in parallel.
export function useLiveText(
  file: string,
  nodes: readonly ParserNode[],
  preview: ReturnType<typeof usePreview>,
) {
  const previous = useRef<readonly ParserNode[]>([]);
  const previousFile = useRef(file);
  const send = useRef(preview.send);
  send.current = preview.send;
  useLayoutEffect(() => {
    if (previousFile.current !== file) {
      previous.current = [];
      previousFile.current = file;
    }
    const before = flatten(previous.current);
    const after = flatten(nodes);
    previous.current = nodes;
    const structure = (list: readonly ParserNode[]) =>
      list.map((node) => [node.id, node.kind, node.name]);
    if (JSON.stringify(structure(before)) !== JSON.stringify(structure(after))) {
      send.current({ type: 'studio:live-text', reset: true, changes: [] });
      return;
    }
    const changes = after
      .flatMap((node, index) =>
        node.kind === 'text' && node.id && before[index]?.value !== node.value
          ? [
              {
                path: (isCanvasPage(file) ? '' : file + '|') + pathFor(node.id),
                text: node.value,
                before: before[index]?.value ?? '',
                parent: soleTextParent(after, node.id, file),
              },
            ]
          : [],
      )
      .slice(0, 500);
    if (changes.length) {
      send.current({ type: 'studio:live-text', changes });
    }
  }, [file, nodes]);
}

function soleTextParent(nodes: readonly ParserNode[], id: string, file: string) {
  const parent = nodes.find(
    (parent) => parent.children?.length === 1 && parent.children[0]?.id === id,
  );
  return parent?.id ? (isCanvasPage(file) ? '' : file + '|') + pathFor(parent.id) : '';
}

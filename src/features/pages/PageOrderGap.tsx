import { TreeDropGap } from '../../ui/TreeDragDrop';
import type { PageOrderDrag } from './usePageOrderDrag';

export function PageOrderGap({
  reorder,
  parent,
  depth,
  siblings,
  index,
}: {
  readonly reorder: PageOrderDrag;
  readonly parent: string;
  readonly depth: number;
  readonly siblings: readonly string[];
  readonly index: number;
}) {
  return (
    <TreeDropGap
      layout="overlay"
      interactive={reorder.enabled && reorder.parent === parent}
      parent={parent}
      depth={depth}
      index={index}
      behavior={{
        active: reorder.target?.parent === parent && reorder.target.index === index,
        accepts: (event) => reorder.accepts(event, parent),
        enter: () => reorder.enter(parent, index),
        drop: (event) => reorder.drop(event, siblings, index),
      }}
    />
  );
}

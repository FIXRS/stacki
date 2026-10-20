import { assert } from '../../shared/core/assert';
import { LIMITS } from '../../shared/core/limits';
import type { PageNode } from '../../shared/page/pageNode';
import { canContainTag } from './elementSchemas';
import { findWithParent } from './treeSelection';
import { treeBudget, type TreeView } from './treeView';
import { findEditorNodeById } from './pageState';

export type WrapperTag = 'div' | 'a';

/** Check both sides of the new wrapper so browsers do not repair invalid nesting. */
export function canWrapNode(nodes: readonly PageNode[], nodeId: string, name: WrapperTag): boolean {
  const found = findWithParent(nodes, nodeId);
  if (!found) {
    return false;
  }
  const node = findEditorNodeById(nodes, nodeId);
  assert(node !== undefined, 'A located node is present in the same tree');
  if (node.chunkFile || node.kind === 'chunk-group' || node.kind === 'branch') {
    return false;
  }
  if (node.kind !== 'element' && node.kind !== 'component') {
    return false;
  }
  if (node.name === 'html' || node.name === 'head' || node.name === 'body') {
    return false;
  }
  if (found.parent?.kind === 'element') {
    if (!canContainTag(found.parent.name, name)) {
      return false;
    }
  }
  if (node.kind === 'element') {
    if (!canContainTag(name, node.name)) {
      return false;
    }
  }
  if (name === 'a') {
    return !containsLinkContent(node);
  }
  return true;
}

function containsLinkContent(node: TreeView): boolean {
  const visit = treeBudget();
  const walk = (current: TreeView, depth: number): boolean => {
    assert(depth <= LIMITS.treeDepthMax, 'Link content stays within the tree depth limit');
    visit(depth);
    if (current.kind === 'element') {
      if (current.name === 'a' || current.name === 'button' || current.props?.['tabindex']) {
        return true;
      }
    }
    return (current.children ?? []).some((child) => walk(child, depth + 1));
  };
  return walk(node, 0);
}

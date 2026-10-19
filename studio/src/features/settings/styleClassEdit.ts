import { hasClass, withClass } from '../../../vendor/stacki/src/editor/classAttr';
import { parsePageNode } from '../../../vendor/stacki/shared/page/pageNode';
import { nodeAt } from '../source/source';
import { setAttributes } from './settingsEdits';

export function addStyleClass(source: string, id: string, name: string): string {
  if (!name || name.length > 256 || /[\s"'`<>\\{}]/.test(name)) {
    throw new Error('Enter a single class name.');
  }
  const node = parsePageNode(nodeAt(source, id));
  if (!('props' in node)) {
    throw new Error('Select an element to add a class.');
  }
  if (hasClass(node.props, name)) {
    return source;
  }
  const edit = withClass(node.props, name);
  if (!edit) {
    throw new Error(
      'Add this class in Settings — its class comes from code that cannot be extended safely.',
    );
  }
  return setAttributes(source, id, { [edit.key]: edit.value });
}

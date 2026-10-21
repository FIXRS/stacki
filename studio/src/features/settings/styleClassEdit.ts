import { hasClass, withClass } from '../../../vendor/stacki/src/editor/classAttr';
import { parsePageNode } from '../../../vendor/stacki/shared/page/pageNode';
import { applyEdits, attributeEdit, nodeAt } from '../source/source';
import { assert } from '../../../vendor/stacki/shared/core/assert';
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
    throw new Error('Stacki couldn’t add this class. Check the class name and retry.');
  }
  if (edit.remove !== undefined) {
    assert(edit.key === 'class:list', 'Computed classes migrate to class:list');
    assert(edit.value.type === 'expr', 'A migrated class keeps its expression');
    const replaced = attributeEdit(source, id, edit.remove, edit.value.value, true);
    const text = `${edit.key}={${edit.value.value}}`;
    return applyEdits(source, [{ ...replaced, text }]);
  }
  return setAttributes(source, id, { [edit.key]: edit.value });
}

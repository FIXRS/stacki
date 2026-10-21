// Goal: adding a class preserves authored expressions and surrounding source.
// Method: real source edits across static and computed attributes, plus invalid names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addStyleClass } from '../src/features/settings/styleClassEdit';
import { flatten, nodesOf, nodeId } from '../src/features/source/source';

for (const [before, after] of [
  ['class="one"', 'class="one two"'],
  ['class:list={["one", dynamic]}', 'class:list={["one", dynamic, "two"]}'],
  ['class:list={classes}', 'class:list={[classes, "two"]}'],
  ['class={`one ${dynamic}`}', 'class={`one ${dynamic} two`}'],
  ['class={cx(a, b)}', 'class:list={[(cx(a, b)), "two"]}'],
] as const) {
  test(`adding a selector preserves surrounding source with ${before}`, () => {
    const source = `---\nconst dynamic = 'other';\n---\n<!-- preserve -->\n<p id="target" ${before}>Text</p>\n<style>p { color: red; }</style>\n`;
    const node = flatten(nodesOf(source)).find((node) => node.name === 'p');
    assert.ok(node);
    const result = addStyleClass(source, nodeId(node), 'two');
    assert.equal(result, source.replace(before, after));
    assert.equal(addStyleClass(result, nodeId(node), 'two'), result);
  });
}
test('invalid names fail without rewriting source', () => {
  const source = '<p class={cx(a, b)}>Text</p>';
  const node = flatten(nodesOf(source)).find((node) => node.name === 'p');
  assert.ok(node);
  for (const name of ['', 'two classes', '"injected"', '`expression`']) {
    assert.throws(() => addStyleClass(source, nodeId(node), name), /single class name/);
  }
});

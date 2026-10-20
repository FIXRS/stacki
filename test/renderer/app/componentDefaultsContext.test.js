// Exercise contextual defaults with the real Astro parser. Preserve ancestors and siblings,
// rebase module imports, capture edits to the owned subtree, and reject outside edits.
const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { repoPath } = require('../../helpers/sources.js');
const { parsePage } = require('#dist/electron/parse/astroParser.js');
const bundle = repoPath('node_modules/.stacki-test/defaults-context.cjs');
esbuild.buildSync({
  stdin: {
    contents: `export * from './src/features/componentDefaults/defaultsCanvasContext';
    export * from './src/features/componentDefaults/defaultsCanvasModel';`,
    resolveDir: require('node:path').dirname(repoPath('package.json')),
  },
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'cjs',
});
const { prepareDefaultsCanvas, recipeFromCanvas } = require(bundle);
const wrapper = 'src/components/Wrapper.astro';
const heading = 'src/components/Heading.astro';
const catalog = [wrapper, heading].map((file) => ({
  file,
  name: file.split('/').at(-1).replace('.astro', ''),
  slots: ['default'],
  props: [],
  slotText: true,
}));
const source = `---
import Layout from '../layouts/Layout.astro';
import Wrapper from '../components/Wrapper.astro';
import Heading from '../components/Heading.astro';
import '../styles/global.css';
const note = "import './not-a-module'";
const lazy = () => import('../data/items.json');
---
<Layout theme="dark"><section><p>Before</p><Wrapper variant="existing">
<Heading>Instance</Heading></Wrapper><p>After</p></section></Layout>`;
function model(text) {
  const parsed = parsePage(text, { locs: true });
  assert.ok(parsed.editable);
  return parsed.model;
}
function prepare(recipe) {
  return prepareDefaultsCanvas(
    '.stacki/canvas/12345678-1234-1234-1234-123456789012.astro',
    {
      catalog,
      config: { version: 1, components: { [wrapper]: recipe } },
    },
    { file: 'src/pages/index.astro', source, model: model(source), path: '0.0.1' },
  );
}
test('defaults keep the current ancestors and siblings while replacing instance content', () => {
  const prepared = prepare({
    props: { count: 3, hidden: false },
    children: [
      { literal: 'Before <literal> {code}' },
      { element: 'span', props: { title: 'A "quote"' }, text: 'Native' },
      { component: heading, props: { level: 4 }, text: 'Heading' },
    ],
  });
  assert.match(prepared.source, /<Layout theme="dark"><section><p>Before<\/p>/);
  assert.match(prepared.source, /<p>After<\/p><\/section><\/Layout>/);
  assert.doesNotMatch(prepared.source, /variant="existing"|>Instance</);
  assert.match(prepared.source, /import "\.\.\/\.\.\/src\/styles\/global.css"/);
  assert.match(prepared.source, /import\("\.\.\/\.\.\/src\/data\/items.json"\)/);
  assert.match(prepared.source, /import '\.\/not-a-module'/);
  const captured = recipeFromCanvas(model(prepared.source), prepared.session);
  assert.deepEqual(captured.props, { count: 3, hidden: false });
  assert.equal(captured.children[0].literal, 'Before <literal> {code}');
  assert.equal(captured.children[1].props.title, 'A "quote"');
  assert.equal(captured.children[2].component, heading);
  assert.equal(captured.children[2].inherit, false);
  const changed = prepared.source.replace('count={3}', 'count={37}').replace('>Heading<', '>New<');
  const updated = recipeFromCanvas(model(changed), prepared.session);
  assert.equal(updated.props.count, 37);
  assert.equal(updated.children[2].text, 'New');
});
test('outside edits, missing root, and dynamic defaults cannot be saved', () => {
  const prepared = prepare({ text: 'Example' });
  for (const changed of [
    prepared.source.replace('theme="dark"', 'theme="light"'),
    prepared.source.replace('>After<', '>Changed<'),
    prepared.source.replace('<Wrapper>Example</Wrapper>', ''),
    prepared.source.replace('<Wrapper>', '<Wrapper count={user.count}>'),
  ]) {
    assert.throws(() => recipeFromCanvas(model(changed), prepared.session));
  }
});
test('unconfigured defaults clear instance overrides; empty paired content remains empty', () => {
  const prepared = prepare({ children: [] });
  assert.deepEqual(recipeFromCanvas(model(prepared.source), prepared.session), {
    props: {},
    children: [],
  });
});

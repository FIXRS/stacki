import { serializeNodes } from '../../../vendor/stacki/electron/parse/astroSerialize';
import { HTML_TAGS, VOID_TAGS } from '../../../vendor/stacki/src/editor/elementSchemas';
import { PLACEHOLDER_PROPS } from '../../../vendor/stacki/src/features/palette/astroAssets';
import { record, string } from '../../shared/validation';
import { insertFragment, parsePage, type Edit, type ParserNode, type TreeAction } from './source';

export type InsertContent =
  | { readonly type: 'element'; readonly tag: string }
  | { readonly type: 'astroAsset'; readonly name: 'Image' | 'Picture' }
  | {
      readonly type: 'map' | 'cond' | 'text' | 'comment' | 'expr' | 'doctype' | 'style' | 'script';
    };

export function parseInsertContent(input: unknown): InsertContent {
  const value = record(input);
  const type = string(value['type'], 20);
  if (type === 'element') {
    const tag = string(value['tag'], 30);
    if (!HTML_TAGS.includes(tag) && tag !== 'slot') {
      throw new Error('Invalid HTML element');
    }
    return { type, tag };
  }
  if (type === 'astroAsset' && (value['name'] === 'Image' || value['name'] === 'Picture')) {
    return { type, name: value['name'] };
  }
  if (
    type === 'map' ||
    type === 'cond' ||
    type === 'text' ||
    type === 'comment' ||
    type === 'expr' ||
    type === 'doctype' ||
    type === 'style' ||
    type === 'script'
  ) {
    return { type };
  }
  throw new Error('Invalid insert choice');
}

export function contentInsertionEdits(
  source: string,
  action: Extract<TreeAction, { kind: 'insert-content' }>,
): Edit[] {
  const content = parseInsertContent(action.content);
  const parsed = parsePage(source);
  if (!parsed.editable) {
    throw new Error(parsed.reason);
  }
  const imports = parsed.model.imports;
  const existing =
    content.type === 'astroAsset'
      ? imports.find(
          (item) =>
            item.path === 'astro:assets' && item.imported === content.name && !item.typeOnly,
        )
      : undefined;
  let name = existing?.name ?? (content.type === 'astroAsset' ? content.name : '');
  if (content.type === 'astroAsset' && !existing && imports.some((item) => item.name === name)) {
    name = `Astro${content.name}`;
    if (imports.some((item) => item.name === name)) {
      throw new Error('Import name conflict');
    }
  }
  const node =
    content.type === 'astroAsset'
      ? { kind: 'component' as const, name, props: { ...PLACEHOLDER_PROPS }, children: undefined }
      : insertedContentNode(content);
  const fragment = serializeNodes([node]);
  const edits = [insertFragment(source, action, fragment, parsed.model.nodes.length === 0)];
  if (content.type === 'astroAsset' && !existing) {
    const imported = content.name === name ? name : `${content.name} as ${name}`;
    const statement = `import { ${imported} } from 'astro:assets';`;
    const eol = parsed.model.eol;
    const start = source.startsWith('---') ? 3 + eol.length : 0;
    edits.push({
      start,
      end: start,
      text: start ? statement + eol : `---${eol}${statement}${eol}---${eol}`,
    });
  }
  return edits;
}

function insertedContentNode(
  content: Exclude<InsertContent, { readonly type: 'astroAsset' }>,
): ParserNode {
  switch (content.type) {
    case 'element': {
      const text = /^h[1-6]$/.test(content.tag) ? 'Heading' : content.tag === 'p' ? PARAGRAPH : '';
      return {
        kind: 'element',
        name: content.tag,
        props: {},
        children: VOID_TAGS.has(content.tag)
          ? undefined
          : text
            ? [{ kind: 'text', value: text }]
            : [],
      };
    }
    case 'map':
      return { kind: 'map', head: '[].map((item) => (', children: [] };
    case 'cond':
      return {
        kind: 'cond',
        op: '&&',
        test: 'true',
        children: [{ kind: 'branch', name: 'then', children: [] }],
      };
    case 'text':
      return { kind: 'text', value: 'Text' };
    case 'comment':
      return { kind: 'comment', value: ' Comment ' };
    case 'expr':
      return { kind: 'expr', value: '{/* code */}' };
    case 'doctype':
      return { kind: 'raw-line', value: '<!doctype html>' };
    case 'style':
    case 'script':
      return { kind: 'raw', name: content.type, props: {}, inner: '' };
  }
}
const PARAGRAPH =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse varius ' +
  'enim in eros elementum tristique. Duis cursus, mi quis viverra ornare, eros ' +
  'dolor interdum nulla, ut commodo diam libero vitae erat. Aenean faucibus nibh ' +
  'et justo cursus id rutrum lorem imperdiet. Nunc ut sem vitae risus tristique ' +
  'posuere.';

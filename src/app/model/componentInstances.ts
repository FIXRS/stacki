// Insertion presets belong to page instances. Component schemas and source
// defaults stay authored by the project, so existing instances never change.
import { assert } from '../../../shared/core/assert';
import { LIMITS } from '../../../shared/core/limits';
import type { Attr, ImportDecl } from '../../../shared/page/pageNode';
import type { ScanComponent } from '../../../shared/properties/projectScan';
import { namesInScope } from '../../editor/dataSuggest';
import type { EditorModel, EditorNode } from '../../editor/pageView';
import type { ImportPaths } from '../../ipc/appBridge';
import { newId } from './nodeFactory';
import { chooseImportPath } from './pageGestures';

export const INSTANCE_HEADING = 'Lorem ipsum dolor sit amet elit';
export const INSTANCE_PARAGRAPH =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ' +
  'ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ' +
  'ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in ' +
  'reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.';

// The deepest preset is ContentWrapper > ButtonWrapper > Button > text.
const INSTANCE_DEPTH_MAX = 4;
const INSTANCE_COMPONENTS_MAX = 8;

export interface ComponentInstance {
  readonly node: EditorNode;
  readonly components: readonly ScanComponent[];
}

export interface InstanceImport {
  readonly component: ScanComponent;
  readonly paths: ImportPaths;
}

export function componentInstance(
  component: ScanComponent,
  available: readonly ScanComponent[],
  depth = 0,
): ComponentInstance {
  assert(depth <= LIMITS.treeDepthMax, 'Component instance exceeds the page tree depth');
  assert(depth <= INSTANCE_DEPTH_MAX, 'Component instance preset exceeds its depth limit');
  const content = componentInstanceContent(component);
  const childNames = component.slots?.includes('default')
    ? componentInstanceChildren(component.name)
    : [];
  const children = childNames.flatMap((name) => {
    const child = available.find((candidate) => candidate.name === name);
    // A partial library must never create a reference to a missing component.
    return child ? [componentInstance(child, available, depth + 1)] : [];
  });
  const components = [
    ...new Map([
      [component.path, component] as const,
      ...children.flatMap((child) => child.components.map((item) => [item.path, item] as const)),
    ]).values(),
  ];
  assert(components.length <= INSTANCE_COMPONENTS_MAX, 'Component instance import limit exceeded');
  return {
    components,
    node: {
      id: newId(),
      kind: 'component',
      name: component.name,
      props: componentInstanceProps(component),
      children:
        children.length > 0
          ? children.map((child) => child.node)
          : content === undefined
            ? undefined
            : [{ id: newId(), kind: 'text', value: content }],
    },
  };
}

export function componentInstancePlacement(
  model: EditorModel,
  instance: ComponentInstance,
  resolved: readonly InstanceImport[],
): { readonly node: EditorNode; readonly imports: readonly ImportDecl[] } {
  assert(resolved.length === instance.components.length, 'Every instance dependency is resolved');
  assert(resolved.length <= INSTANCE_COMPONENTS_MAX, 'Instance imports exceed the preset limit');
  const imports = [...model.imports];
  const taken = namesInScope(model.extraFrontmatter ?? '', imports);
  const names = new Map<string, string>();
  for (const { component, paths } of resolved) {
    const importPath = chooseImportPath(model, paths);
    const existing = imports.find(
      (item) => item.path === importPath || item.path === paths.relative,
    );
    if (existing) {
      names.set(component.name, existing.name);
    } else {
      const name = componentInstanceName(component.name, taken);
      taken.add(name);
      names.set(component.name, name);
      imports.push({ name, path: importPath, quote: "'" });
    }
  }
  return { node: componentInstanceRename(instance.node, names, 0), imports };
}

function componentInstanceContent(component: ScanComponent): string | undefined {
  if (!component.slots?.includes('default')) {
    return undefined;
  }
  switch (component.name) {
    case 'Heading':
      return INSTANCE_HEADING;
    case 'Paragraph':
      return INSTANCE_PARAGRAPH;
    case 'Button':
      return 'Button Text';
    default:
      return component.slotText ? 'Text' : undefined;
  }
}

function componentInstanceChildren(name: string): readonly string[] {
  switch (name) {
    case 'ButtonWrapper':
      return ['Button'];
    case 'ContentWrapper':
      return ['Heading', 'Paragraph', 'ButtonWrapper'];
    case 'Grid':
      return ['Card', 'Card', 'Card'];
    case 'Slider':
      return ['Card', 'Card'];
    default:
      return [];
  }
}

function componentInstanceProps(component: ScanComponent): Readonly<Record<string, Attr>> {
  let defaults: Readonly<Record<string, Attr>>;
  switch (component.name) {
    case 'Grid':
      defaults = { small: { type: 'expr', value: '2' }, medium: { type: 'expr', value: '3' } };
      break;
    case 'Slider':
      defaults = { small: { type: 'expr', value: '1.4' } };
      break;
    case 'Card':
      defaults = {
        heading: { type: 'string', value: INSTANCE_HEADING },
        text: { type: 'string', value: INSTANCE_PARAGRAPH },
      };
      break;
    default:
      return {};
  }
  // Identically named components in other projects may expose a different API.
  return Object.fromEntries(
    Object.entries(defaults).filter(([name]) =>
      component.schema?.some((field) => field.name === name),
    ),
  );
}

function componentInstanceName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  // With N occupied names, one of N + 1 numbered candidates must be free.
  for (let suffix = 2; suffix <= taken.size + 2; suffix += 1) {
    const candidate = `${base}${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  throw new Error('Unable to allocate an instance import name');
}

function componentInstanceRename(
  node: EditorNode,
  names: ReadonlyMap<string, string>,
  depth: number,
): EditorNode {
  assert(depth <= LIMITS.treeDepthMax, 'Instance rename exceeds the page tree depth');
  assert(depth <= INSTANCE_DEPTH_MAX, 'Instance rename exceeds the preset depth');
  if (node.kind !== 'component') {
    return node;
  }
  const name = names.get(node.name);
  assert(name !== undefined, 'Every inserted component has an import binding');
  return {
    ...node,
    name,
    children: node.children?.map((child) => componentInstanceRename(child, names, depth + 1)),
  };
}

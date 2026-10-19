import type { ParserNode } from './source';

export const HEADING_TEXT = 'Lorem ipsum dolor sit amet elit';
export const PARAGRAPH_TEXT =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.';
const files = {
  Heading: 'src/components/typography/Heading.astro',
  Paragraph: 'src/components/typography/Paragraph.astro',
  Button: 'src/components/Button.astro',
  ButtonWrapper: 'src/components/wrapper/ButtonWrapper.astro',
  ContentWrapper: 'src/components/wrapper/ContentWrapper.astro',
  Grid: 'src/components/wrapper/Grid.astro',
  Slider: 'src/components/interactive/Slider.astro',
  Card: 'src/components/item/Card.astro',
} as const;
type ComponentName = keyof typeof files;
interface Template {
  readonly component: ComponentName;
  readonly text?: string;
  readonly props?: Readonly<Record<string, string | number>>;
  readonly children?: readonly Template[];
}
const heading: Template = { component: 'Heading', text: HEADING_TEXT };
const paragraph: Template = { component: 'Paragraph', text: PARAGRAPH_TEXT };
const button: Template = { component: 'Button', text: 'Button Text' };
const buttons: Template = { component: 'ButtonWrapper', children: [button] };
const card: Template = {
  component: 'Card',
  props: { heading: HEADING_TEXT, text: PARAGRAPH_TEXT },
};
const templates: Readonly<Record<ComponentName, Template>> = {
  Heading: heading,
  Paragraph: paragraph,
  Button: button,
  ButtonWrapper: buttons,
  ContentWrapper: { component: 'ContentWrapper', children: [heading, paragraph, buttons] },
  Grid: { component: 'Grid', props: { small: 2, medium: 3 }, children: [card, card, card] },
  Slider: { component: 'Slider', props: { small: 1.4 }, children: [card, card] },
  Card: card,
};

// These are new-instance recipes in Stacki, never defaults in the component's
// Props type or implementation. Existing instances retain their authored values.
export function defaultInstance(
  file: string | undefined,
  resolve: (file: string, name: string) => string,
): ParserNode | undefined {
  const name = (Object.keys(files) as ComponentName[]).find((name) => files[name] === file);
  return name ? instanceNode(templates[name], resolve) : undefined;
}
function instanceNode(
  template: Template,
  resolve: (file: string, name: string) => string,
): ParserNode {
  return {
    kind: 'component',
    name: resolve(files[template.component], template.component),
    props: Object.fromEntries(
      Object.entries(template.props ?? {}).map(([name, value]) => [
        name,
        { type: typeof value === 'number' ? 'expr' : 'string', value: String(value) },
      ]),
    ),
    children:
      template.text !== undefined
        ? [{ kind: 'text', value: template.text }]
        : template.children?.map((child) => instanceNode(child, resolve)),
  };
}

import { parseNumericBindings, type NumericStyleBinding } from '../preview/numericStyleProtocol';
import { responseError, StudioRequestError } from './responseError';
import { parseField, type PropField } from '../../../vendor/stacki/shared/properties/propSchema';
import { beginOperation } from '../session/activity';
import { record, string, filePath } from '../../shared/validation';

export interface Component {
  readonly numericStyles?: readonly NumericStyleBinding[];
  readonly renderTag?: { readonly tag?: string; readonly prop?: string };
  readonly file: string;
  readonly name: string;
  readonly fields: PropField[];
  readonly slots: string[];
  readonly slotText?: boolean;
}
export interface Project {
  readonly name: string;
  readonly pages: string[];
  readonly collections: string[];
  readonly assets: string[];
  readonly components: Component[];
  readonly classes: string[];
}
export async function request(url: string, options?: RequestInit): Promise<unknown> {
  const finish = beginOperation();
  try {
    const response = await fetch(url, {
      ...options,
      signal: options?.signal ?? AbortSignal.timeout(240_000),
    });
    if (!response.headers.get('Content-Type')?.includes('application/json')) {
      throw responseError(response);
    }
    const data: unknown = await response.json();
    if (!response.ok) {
      throw new StudioRequestError(
        string(record(data)['error'] ?? responseError(response).message),
        response.status,
      );
    }
    return data;
  } catch (error) {
    if (
      error instanceof TypeError ||
      (error instanceof DOMException && error.name === 'TimeoutError')
    ) {
      throw new StudioRequestError(
        'The connection to Studio was interrupted. Please retry shortly.',
        0,
      );
    }
    throw error;
  } finally {
    finish();
  }
}
function strings(input: unknown): string[] {
  if (!Array.isArray(input) || input.length > 20_000) {
    throw new Error('Invalid list');
  }
  return input.map((item) => string(item));
}
export async function loadProject(signal?: AbortSignal): Promise<Project> {
  const data = record(await request('/studio/api/project', signal ? { signal } : undefined));
  if (!Array.isArray(data['components'])) {
    throw new Error('Missing components');
  }
  const components = data['components'].map((input) => {
    const item = record(input);
    if (!Array.isArray(item['fields'])) {
      throw new Error('Invalid fields');
    }
    if (item['slotText'] !== undefined && typeof item['slotText'] !== 'boolean') {
      throw new Error('Invalid default slot type');
    }
    return {
      file: filePath(item['file']),
      name: string(item['name']),
      fields: item['fields'].map((field) => parseField(field, 'component')),
      slots: strings(item['slots']),
      numericStyles: parseNumericBindings(item['numericStyles']),
      slotText: item['slotText'] === true,
      ...parseRenderTag(item['renderTag']),
    };
  });
  return {
    name: string(data['name']),
    pages: strings(data['pages']),
    collections: strings(data['collections']),
    assets: strings(data['assets']),
    classes: strings(data['classes']),
    components,
  };
}
function parseRenderTag(input: unknown): Pick<Component, 'renderTag'> {
  if (input === undefined) {
    return {};
  }
  const value = record(input);
  return {
    renderTag: {
      ...(value['tag'] === undefined ? {} : { tag: string(value['tag'], 100) }),
      ...(value['prop'] === undefined ? {} : { prop: string(value['prop'], 100) }),
    },
  };
}
export function routeFor(file: string) {
  if (isDefaultsCanvas(file)) {
    return defaultsCanvasRoute(file);
  }
  const relative = file
    .replace(/^src\/pages\//, '')
    .replace(/\.(astro|md|mdx)$/, '')
    .replace(/(^|\/)index$/, '');
  return '/' + relative;
}
import {
  isDefaultsCanvas,
  defaultsCanvasRoute,
} from '../../../vendor/stacki/shared/properties/defaultsCanvas';

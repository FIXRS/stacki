import { record, string, sourcePath, MAX_SOURCE } from '../../shared/validation';

export interface VariantRequest {
  readonly gzip?: boolean;
  readonly request: string;
  readonly path: string;
  readonly file: string;
  readonly node: string;
  readonly component: string;
  readonly source: string;
  readonly prop: string;
  readonly values: readonly (string | number | null)[];
}
export function parseVariantRequest(input: unknown): VariantRequest {
  const data = record(input);
  const values = data['values'];
  if (!Array.isArray(values) || !values.length || values.length > 32) {
    throw new Error('Invalid variant options');
  }
  const prop = string(data['prop'], 100);
  if (!/^[a-zA-Z][\w-]*$/.test(prop) || ['constructor', 'prototype'].includes(prop)) {
    throw new Error('Invalid variant property');
  }
  return {
    ...(data['encoding'] === 'gzip' ? { gzip: true } : {}),
    request: string(data['request'], 100),
    path: string(data['path'], 2000),
    file: sourcePath(data['file']),
    node: string(data['node'], 500),
    component: sourcePath(data['component']),
    source: string(data['source'], MAX_SOURCE),
    prop,
    values: values.map((value: unknown) => {
      if (value === null || (typeof value === 'number' && Number.isFinite(value))) {
        return value;
      }
      return string(value, 500);
    }),
  };
}

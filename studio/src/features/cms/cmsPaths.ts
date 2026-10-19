import path from 'node:path';
import { filePath, sourcePath } from '../../shared/validation';
// Desktop handlers trusted their IPC registrar. HTTP must enforce the same scope.
export function cmsSourcePath(root: string, relative: string) {
  return path.join(root, sourcePath(relative));
}
export function cmsDirectoryPath(root: string, relative: string) {
  const normalized = relative.replace(/^\.\//, '').replace(/\/$/, '');
  if (normalized !== 'src' && normalized !== 'public') {
    filePath(normalized);
  }
  return path.join(root, normalized);
}
export function validateCmsPayload(operation: string, input: Readonly<Record<string, unknown>>) {
  if (typeof input['rel'] === 'string') {
    sourcePath('src/' + input['rel'].split('#')[0]);
  }
  if (input['entry'] && typeof input['entry'] === 'object' && 'file' in input['entry']) {
    sourcePath(input['entry'].file);
  }
  if (operation === 'cms:assetRef') {
    filePath(input['assetRel']);
  }
}

export const cmsIncludesGeneral = (_relative: string): boolean => true;

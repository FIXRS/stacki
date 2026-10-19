import { assert } from '../core/assert';
import { count, object, pathText } from '../core/boundary';

export type ImageFormat = 'webp' | 'avif';
export const IMAGE_BATCH_MAX = 100;
export function parseImageFormat(input: unknown): ImageFormat {
  if (input !== 'webp' && input !== 'avif') {
    throw new Error('Image format must be webp or avif.');
  }
  return input;
}
export function parseImagePath(input: unknown): string {
  const value = pathText(input);
  if (
    !/^(public|src)\/.+\.(png|jpe?g|webp|avif|tiff?)$/i.test(value) ||
    value.split('/').some((part) => part === '..' || part === '.' || part === '') ||
    value.includes('\\')
  ) {
    throw new Error('Choose a raster image inside public/ or src/.');
  }
  assert(!value.startsWith('/'), 'Image parser produces a project-relative path');
  assert(value.split('/').length >= 2, 'Image parser preserves the asset root');
  return value;
}
export const parseConversionResult = object({
  rel: parseImagePath,
  references: count,
  bytesBefore: count,
  bytesAfter: count,
});
export type ConversionResult = ReturnType<typeof parseConversionResult>;

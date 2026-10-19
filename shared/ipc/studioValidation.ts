import { record } from '../core/boundary';
export { record };

export function string(value: unknown, maximum = 1_000_000): string {
  if (typeof value !== 'string' || value.length > maximum) {
    throw new Error('Invalid string');
  }
  return value;
}

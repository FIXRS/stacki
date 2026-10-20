// Standalone primitives let assembly run before the generated vendor tree exists.
export const MAX_SOURCE = 1_000_000;
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected object');
  }
  return value as Record<string, unknown>;
}
export function string(value: unknown, maximum = MAX_SOURCE): string {
  if (typeof value !== 'string' || value.length > maximum) {
    throw new Error('Invalid string');
  }
  return value;
}

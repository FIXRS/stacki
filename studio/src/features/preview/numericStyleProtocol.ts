export interface NumericStyleBinding {
  readonly prop: string;
  readonly variable: string;
  readonly unit: string;
  readonly marker: string;
}
export function parseNumericBindings(input: unknown): readonly NumericStyleBinding[] {
  if (input === undefined) {
    return [];
  }
  if (!Array.isArray(input) || input.length > 20) {
    throw new Error('Invalid style bindings');
  }
  return input.map((value: unknown) => {
    if (
      !value ||
      typeof value !== 'object' ||
      !('prop' in value) ||
      !('variable' in value) ||
      !('unit' in value) ||
      !('marker' in value) ||
      typeof value.prop !== 'string' ||
      !/^[\w$]{1,100}$/.test(value.prop) ||
      typeof value.variable !== 'string' ||
      !/^--[\w-]{1,100}$/.test(value.variable) ||
      typeof value.unit !== 'string' ||
      !/^(ch|px|rem|em|%|vw|vh)$/.test(value.unit) ||
      typeof value.marker !== 'string' ||
      !/^[\w.:-]{1,500}$/.test(value.marker)
    ) {
      throw new Error('Invalid style binding');
    }
    return { prop: value.prop, variable: value.variable, unit: value.unit, marker: value.marker };
  });
}

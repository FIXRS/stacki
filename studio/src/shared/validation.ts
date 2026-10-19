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
export function filePath(value: unknown): string {
  const path = string(value, 500);
  if (
    !/^(src|public)\/[\w./ -]+$/.test(path) ||
    path.split('/').some((part) => part === '..' || part.startsWith('.'))
  ) {
    throw new Error('Invalid project path');
  }
  return path;
}
export function sourcePath(value: unknown): string {
  const path = filePath(value);
  if (
    !/\.(astro|json|md|mdx|mdoc|markdown|css|scss|sass|less|[cm]?[jt]sx?|yaml|yml|toml|csv|ndjson)$/i.test(
      path,
    )
  ) {
    throw new Error('Unsupported source file');
  }
  return path;
}
export function textChange(before: string, after: string) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start++;
  }
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end++;
  }
  return {
    start,
    remove: before.length - start - end,
    insert: after.slice(start, after.length - end),
  };
}

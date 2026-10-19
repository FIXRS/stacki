import { MAX_SOURCE, record, sourcePath, string } from '../../shared/validation';

export interface NodeClipboard {
  readonly file: string;
  readonly fragment: string;
  readonly frontmatter: string;
}
export function parseClipboard(input: unknown): NodeClipboard {
  const value = record(input);
  const fragment = string(value['fragment']);
  const frontmatter = string(value['frontmatter']);
  if (!fragment.trim() || fragment.length + frontmatter.length > MAX_SOURCE) {
    throw new Error('Copied content exceeds the source limit');
  }
  return { file: sourcePath(value['file']), fragment, frontmatter };
}

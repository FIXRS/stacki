import { createHash } from 'node:crypto';
import type { RepositoryFile } from './github';
import { treeFiles } from './treeChanges';
import { filePath } from '../../shared/validation';

// A snapshot includes every source and asset, but GitHub should receive writes
// only for changed files. Re-uploading the entire site can trigger rate limits.
export function changedPublishFiles(files: readonly RepositoryFile[], tree: unknown) {
  const existing = treeFiles(tree);
  const seen = new Set<string>();
  return files.filter((file) => {
    filePath(file.path);
    if (seen.has(file.path)) {
      throw new Error('Duplicate publish path');
    }
    seen.add(file.path);
    const before = existing.get(file.path);
    if (before && (before.type !== 'blob' || !['100644', '100755'].includes(before.mode))) {
      throw new Error('Publishing cannot replace a repository link or submodule');
    }
    if (file.deleted) {
      return !!before;
    }
    const bytes = Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8');
    const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    return before?.sha !== hash;
  });
}

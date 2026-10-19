import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Bundled integration and source tests resolve the same shipped upstream workers.
export function contentWorkerPath(name: string) {
  if (!/^[a-zA-Z]+\.mjs$/.test(name)) {
    throw new Error('Invalid content worker');
  }
  const candidates = [
    new URL(`../vendor/stacki/electron/content/workers/${name}`, import.meta.url),
    new URL(`../../../vendor/stacki/electron/content/workers/${name}`, import.meta.url),
  ];
  const found = candidates.find((url) => existsSync(url));
  if (!found) {
    throw new Error('Content worker is missing');
  }
  return fileURLToPath(found);
}

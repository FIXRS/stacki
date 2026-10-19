import path from 'node:path';
import type { ViteDevServer } from 'vite';

// Accepted edits already have an exact disk revision. Start Astro's render now,
// instead of waiting for filesystem notification and the HMR reload round trip.
// Invalidate every environment so SSR cannot reuse the old page or an importer.
export function pushWrittenSource(
  server: ViteDevServer,
  root: string,
  file: string,
  render: () => void,
) {
  const absolute = path.join(root, file);
  for (const environment of Object.values(server.environments)) {
    environment.moduleGraph.onFileChange(absolute);
  }
  render();
}

import { access, readdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export async function writeStudioConfig(root: string, packageRoot: string, port: number) {
  const files = await readdir(root);
  const configuration = files.find((file) => /^astro\.config\.(ts|mts|cts|js|mjs|cjs)$/.test(file));
  const integration = pathToFileURL(path.join(packageRoot, 'dist/integration.mjs')).href;
  const hosts = [process.env['STUDIO_PARENT_ORIGIN'], process.env['STUDIO_PREVIEW_ORIGIN']]
    .filter((value): value is string => !!value)
    .map((value) => new URL(value).hostname);
  const content = `${configuration ? `import config from './${configuration}';` : 'const config = {};'}
import studio from ${JSON.stringify(integration)};
export default { ...config, ${hosts.length ? `server: { ...config.server, allowedHosts: ${JSON.stringify(hosts)} },` : ''} devToolbar: { enabled: false }, integrations: [...(config.integrations ?? []), studio(${JSON.stringify({ root, assets: path.join(packageRoot, 'dist'), port })})] };
`;
  await writeFile(path.join(root, 'astro.studio.config.ts'), content);
}
export async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

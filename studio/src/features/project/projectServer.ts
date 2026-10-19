import { numericStyleBindings } from '../preview/numericStyleBindings';
import { readdir, readFile, realpath, stat, mkdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { componentSchema } from '../components/componentSchema';
import {
  parseSlots,
  rootTag,
  defaultSlotInline,
} from '../../../vendor/stacki/electron/parse/astroComponentApi';
import { sourcePath, filePath, MAX_SOURCE } from '../../shared/validation';

export async function safePath(root: string, relative: string): Promise<string> {
  filePath(relative);
  const absolute = path.resolve(root, relative);
  const canonicalRoot = await realpath(root);
  // Walk existing ancestors before creating anything. Reject symlinks rather than
  // allowing an uploaded/project-authored link to redirect a later write.
  let current = canonicalRoot;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error('Symbolic links are not editable');
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        break;
      }
      throw error;
    }
  }
  try {
    const actual = await realpath(absolute);
    if (!actual.startsWith(canonicalRoot + path.sep)) {
      throw new Error('Path is outside the project');
    }
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }
  return absolute;
}
export async function preparePath(root: string, relative: string) {
  const absolute = await safePath(root, relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  return safePath(root, relative);
}
export async function readSource(root: string, relative: string): Promise<string> {
  sourcePath(relative);
  const absolute = await safePath(root, relative);
  if ((await stat(absolute)).size > MAX_SOURCE) {
    throw new Error('File exceeds 1 MB limit');
  }
  return readFile(absolute, 'utf8');
}
export async function walk(root: string, directory: string): Promise<string[]> {
  const queue = [directory];
  const files: string[] = [];
  for (let index = 0; index < queue.length && index < 1_000; index++) {
    const current = queue[index];
    if (!current) {
      break;
    }
    let entries;
    try {
      entries = await readdir(path.join(root, current), { withFileTypes: true });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) {
        continue;
      }
      const relative = `${current}/${entry.name}`;
      if (entry.isDirectory()) {
        queue.push(relative);
      } else if (entry.isFile()) {
        files.push(relative);
      }
      if (files.length > 10_000) {
        throw new Error('Project file limit exceeded');
      }
    }
  }
  return files.sort();
}
export async function scanProject(root: string) {
  const files = [...(await walk(root, 'src')), ...(await walk(root, 'public'))];
  const componentFiles = files.filter(
    (file) => file.endsWith('.astro') && !file.startsWith('src/pages/'),
  );
  const components = await Promise.all(
    componentFiles.map(async (file) => {
      const source = await readSource(root, file);
      return {
        file,
        name: path.basename(file, '.astro'),
        fields: await componentSchema(file, source, (candidate) => readSource(root, candidate)),
        slots: parseSlots(source),
        numericStyles: numericStyleBindings(source),
        slotText: defaultSlotInline(source),
        renderTag: rootTag(source),
      };
    }),
  );
  const classes = new Set<string>();
  for (const file of files.filter((file) => /\.(css|astro)$/.test(file))) {
    const source = await readSource(root, file);
    const styles = file.endsWith('.astro')
      ? [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join('\n')
      : source;
    for (const match of styles.matchAll(/\.([a-zA-Z_][\w-]*)/g)) {
      if (match[1]) {
        classes.add(match[1]);
      }
    }
  }
  return {
    name: path.basename(root) === 'workspace' ? 'Example site' : path.basename(root),
    pages: files.filter((file) => /^src\/pages\/.+\.(astro|md|mdx)$/.test(file)),
    collections: files.filter(
      (file) =>
        /^src\/(content|data)\/.+\.(json|md|mdx)$/.test(file) &&
        !/\/studio-cms-(schema|deleted)\.json$/.test(file),
    ),
    assets: files.filter((file) => /\.(svg|png|jpe?g|gif|webp|avif|mp4|pdf|woff2?)$/i.test(file)),
    components,
    classes: [...classes].sort(),
  };
}

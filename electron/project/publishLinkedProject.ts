import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseTOML } from 'smol-toml';
import { parseConfigFileTextToJson } from 'typescript';
import { record } from '../../shared/core/boundary';
import {
  discoveryIdentifier,
  type DiscoveryProvider,
  type PublishProject,
} from '../../shared/properties/publishDiscovery';
import {
  cloudflareProjects,
  cloudflareAccounts,
  cloudflareWorkers,
} from './publishDiscoveryCloudflare';

// Read existing links only: discovery never creates or relinks a remote project.
export async function linkedPublishProject(
  root: string,
  provider: DiscoveryProvider,
): Promise<readonly PublishProject[]> {
  if (provider === 'vercel') {
    const source = await linkedSource(root, '.vercel/project.json');
    if (source === undefined) {
      return [];
    }
    const input: unknown = JSON.parse(source);
    const value = record(input);
    return [
      {
        name: 'Linked Vercel project',
        hosting: {
          provider: 'vercel',
          organizationId: discoveryIdentifier(value['orgId']),
          projectId: discoveryIdentifier(value['projectId']),
        },
      },
    ];
  }
  if (provider === 'cloudflare' || provider === 'cloudflare-workers' || provider === 'linked') {
    for (const filename of ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml']) {
      const source = await linkedSource(root, filename);
      if (source !== undefined) {
        const projects = await linkedCloudflare(root, filename, source);
        return provider === 'linked' || provider === 'cloudflare'
          ? projects
          : projects.filter((project) => project.hosting.provider === provider);
      }
    }
  }
  return [];
}

async function linkedCloudflare(
  root: string,
  filename: string,
  source: string,
): Promise<readonly PublishProject[]> {
  // TypeScript is already a runtime dependency and parses JSONC without executing project code.
  const parsed = filename.endsWith('.toml')
    ? { config: parseTOML(source), error: undefined }
    : parseConfigFileTextToJson(filename, source);
  if (parsed.error) {
    throw new Error('Cannot read existing Wrangler configuration.');
  }
  const value = record(parsed.config);
  if (!value['name']) {
    return [];
  }
  const name = discoveryIdentifier(value['name']);
  if (!value['pages_build_output_dir']) {
    const accountId = value['account_id']
      ? discoveryIdentifier(value['account_id'])
      : await linkedWorkerAccount(root, name);
    return [{ name, hosting: { provider: 'cloudflare-workers', accountId, project: name } }];
  }
  const account = value['account_id']
    ? discoveryIdentifier(value['account_id'])
    : await singleCloudflareAccount(root);
  if (!account) {
    return [];
  }
  const pages = value['pages_build_output_dir'];
  const projects = await cloudflareProjects(root, account);
  const project = projects.find((item) => item.name === name);
  if (!project) {
    return [];
  }
  if (project.hosting.provider === 'cloudflare') {
    return [
      {
        ...project,
        hosting: {
          ...project.hosting,
          directory: discoveryDirectory(pages),
        },
      },
    ];
  }
  return [project];
}

async function linkedSource(root: string, filename: string): Promise<string | undefined> {
  const file = path.join(root, filename);
  try {
    const metadata = await stat(file);
    if (metadata.size > 65_536) {
      throw new Error('Provider configuration exceeds 64 KiB.');
    }
    const source = await readFile(file, 'utf8');
    if (source.length > 65_536) {
      throw new Error('Provider configuration exceeds 64 KiB.');
    }
    return source;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function singleCloudflareAccount(root: string): Promise<string | undefined> {
  const accounts = await cloudflareAccounts(root);
  // Never guess between accounts: require an explicit account_id when more than one is available.
  return accounts.length === 1 ? accounts[0]?.id : undefined;
}
function discoveryDirectory(input: unknown): string {
  if (typeof input !== 'string') {
    throw new Error('Wrangler output directory must be a string.');
  }
  return input.replace(/^\.\//, '');
}

async function linkedWorkerAccount(root: string, name: string): Promise<string> {
  try {
    const accounts = await cloudflareAccounts(root);
    if (accounts.length > 5) {
      return '';
    }
    const matches = await Promise.allSettled(
      accounts.map(async (account) => {
        const workers = await cloudflareWorkers(root, account.id);
        return workers.some((worker) => worker.name === name) ? account.id : undefined;
      }),
    );
    const found = matches.flatMap((match) =>
      match.status === 'fulfilled' && match.value ? [match.value] : [],
    );
    return found.length === 1 ? (found[0] ?? '') : '';
  } catch {
    return '';
  }
}

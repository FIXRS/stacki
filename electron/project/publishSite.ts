import { boolean, record, text } from '../../shared/core/boundary';
import type { Hosting } from '../../shared/properties/publishConfig';
import { discoveryList } from '../../shared/properties/publishDiscovery';
import { parsePublishedSiteURL } from '../../shared/properties/publishSite';
import { cloudflareHeaders, cloudflareRequest } from './publishDiscoveryCloudflare';
import { discoveryCommand } from './publishDiscoveryCommand';
import { vercelPages } from './publishDiscoveryVercel';

export async function publishedSiteURL(
  root: string,
  hosting: Hosting,
): Promise<string | undefined> {
  switch (hosting.provider) {
    case 'none':
      return undefined;
    case 'vercel':
      return vercelSiteURL(root, hosting);
    case 'cloudflare':
    case 'cloudflare-workers': {
      const credentials = record(
        await discoveryCommand(root, 'wrangler', ['auth', 'token', '--json']),
      );
      const headers = cloudflareHeaders(credentials);
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${hosting.accountId}`;
      const read = async (suffix: string): Promise<unknown> => {
        const value = record(await cloudflareRequest(`${endpoint}${suffix}`, headers));
        if (value['success'] !== true) {
          throw new Error('Could not discover the published site.');
        }
        return value['result'];
      };
      if (hosting.provider === 'cloudflare') {
        const project = record(await read(`/pages/projects/${hosting.project}`));
        return preferredSiteDomain([
          ...discoveryList(project['domains'] ?? []),
          ...(project['subdomain'] === undefined ? [] : [project['subdomain']]),
        ]);
      }
      return workerSiteURL(hosting.project, read);
    }
  }
}

async function workerSiteURL(
  project: string,
  read: (suffix: string) => Promise<unknown>,
): Promise<string | undefined> {
  // Domain permissions can be narrower than Worker permissions; still try workers.dev.
  const domains = await read(`/workers/domains?service=${project}&environment=production`)
    .then((input) =>
      discoveryList(input).flatMap((entry) => {
        const value = record(entry);
        if (value['service'] !== project) {
          return [];
        }
        if (value['environment'] !== 'production') {
          return [];
        }
        // Older API responses omit enabled; those domains were always routable.
        const enabled = value['enabled'] === undefined ? true : boolean(value['enabled']);
        return enabled ? [value['hostname']] : [];
      }),
    )
    .catch(() => []);
  const custom = preferredSiteDomain(domains);
  if (custom !== undefined) {
    return custom;
  }
  const enabled = record(await read(`/workers/scripts/${project}/subdomain`));
  if (enabled['enabled'] !== true) {
    return undefined;
  }
  const account = record(await read('/workers/subdomain'));
  return preferredSiteDomain([`${project}.${text(account['subdomain'])}.workers.dev`]);
}

async function vercelSiteURL(
  root: string,
  hosting: Extract<Hosting, { readonly provider: 'vercel' }>,
): Promise<string | undefined> {
  const entries = await vercelPages(
    root,
    `/v9/projects/${hosting.projectId}/domains`,
    'domains',
    hosting.organizationId,
  );
  const domains = entries.flatMap((entry) => {
    const value = record(entry);
    if (value['verified'] !== true) {
      return [];
    }
    if (value['gitBranch']) {
      return [];
    }
    // A redirect is an alias, not the project's canonical public domain.
    return value['redirect'] ? [] : [value['name']];
  });
  return preferredSiteDomain(domains);
}

export function preferredSiteDomain(input: readonly unknown[]): string | undefined {
  const domains = discoveryList(input).map((entry) => {
    const domain = text(entry).toLowerCase();
    if (domain.length > 253) {
      throw new Error('Published domain exceeds limit.');
    }
    if (!/^[a-z0-9.-]+$/.test(domain)) {
      throw new Error('Invalid published domain.');
    }
    return parsePublishedSiteURL(`https://${domain}`);
  });
  const ordered = [...domains].sort((left, right) => {
    const rank = (url: string) =>
      Number(['.workers.dev', '.pages.dev', '.vercel.app'].some((suffix) => url.endsWith(suffix)));
    return rank(left) - rank(right) || left.localeCompare(right);
  });
  return ordered[0];
}

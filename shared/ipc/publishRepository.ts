import { boolean, list, record, text } from '../core/boundary';
import type { Result } from '../core/result';
import { parseGitHubRepository } from './githubRepository';

export type RepositoryRequest =
  | { readonly action: 'list'; readonly account: string }
  | {
      readonly action: 'connect';
      readonly account: string;
      readonly repository: string;
      readonly revision: string;
    }
  | {
      readonly action: 'create';
      readonly account: string;
      readonly name: string;
      readonly private: boolean;
    };
export interface PublishingRepositories {
  readonly connected: string;
  readonly revision: string;
  readonly repositories: readonly string[];
  readonly mode: 'editable' | 'managed';
  readonly notice: string;
}
export type RepositoryResult = Result<PublishingRepositories, string>;
export const REPOSITORIES_MAX = 500;

export function parseRepositoryRequest(input: unknown): RepositoryRequest {
  const value = record(input);
  const account = text(value['account']);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(account)) {
    throw new Error('Choose a signed-in GitHub account.');
  }
  switch (value['action']) {
    case 'list':
      return { action: 'list', account };
    case 'connect':
      return {
        action: 'connect',
        account,
        repository: parseGitHubRepository(value['repository']),
        revision: revision(value['revision']),
      };
    case 'create': {
      const name = text(value['name']);
      parseGitHubRepository(`${account}/${name}`);
      return { action: 'create', account, name, private: boolean(value['private']) };
    }
    default:
      throw new Error('Unknown repository action.');
  }
}

export function parseRepositoryResult(input: unknown): RepositoryResult {
  const result = record(input);
  if (!boolean(result['ok'])) {
    return { ok: false, error: message(result['error']) };
  }
  const value = record(result['value']);
  const connected = text(value['connected']);
  const repositories = list(parseGitHubRepository)(value['repositories']);
  if (repositories.length > REPOSITORIES_MAX) {
    throw new Error('Repository list exceeds 500 entries.');
  }
  const mode = value['mode'];
  if (mode !== 'editable' && mode !== 'managed') {
    throw new Error('Invalid repository connection mode.');
  }
  return {
    ok: true,
    value: {
      connected: connected ? parseGitHubRepository(connected) : '',
      revision: revision(value['revision']),
      repositories,
      mode,
      notice: message(value['notice']),
    },
  };
}
function revision(input: unknown): string {
  const value = text(input);
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('Invalid repository connection revision.');
  }
  return value;
}
function message(input: unknown): string {
  const value = text(input);
  if (value.length > 1000) {
    throw new Error('Repository message exceeds its limit.');
  }
  return value;
}

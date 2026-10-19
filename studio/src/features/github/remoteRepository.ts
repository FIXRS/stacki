import { GitHubChangedError } from './githubErrors';
import type { RepositoryAccess, RepositoryFile, IncomingChanges } from './github';
import { record, string, sourcePath } from '../../shared/validation';

export class RemoteRepository implements RepositoryAccess {
  constructor(
    readonly backend: string,
    readonly token: string,
  ) {}
  async incoming(base: string): Promise<IncomingChanges> {
    const result = await this.call('/incoming', { base });
    const files = result['files'];
    if (!Array.isArray(files) || files.length > 100_000) {
      throw new Error('Invalid GitHub changes');
    }
    return {
      sha: string(result['sha'], 64),
      files: files.map((value) => {
        const item = record(value);
        return {
          file: sourcePath(item['file']),
          before: item['before'] === null ? null : string(item['before']),
          after: item['after'] === null ? null : string(item['after']),
        };
      }),
    };
  }
  async acceptBase(sha: string) {
    await this.call('/base', { sha });
  }
  private async call(route: string, body: unknown) {
    const response = await fetch(this.backend + '/studio/internal' + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-studio-token': this.token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    const result = record(await response.json());
    if (!response.ok) {
      throw new Error(string(result['error'] ?? 'GitHub request failed'));
    }
    return result;
  }
  async commit(files: readonly RepositoryFile[], expectedHead: string, message: string) {
    const response = await fetch(this.backend + '/studio/internal/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-studio-token': this.token },
      body: JSON.stringify({ files, expectedHead, message }),
      signal: AbortSignal.timeout(180_000),
    });
    const result = record(await response.json());
    if (!response.ok) {
      if (result['code'] === 'github_changed') {
        throw new GitHubChangedError();
      }
      throw new Error(string(result['error'] ?? 'GitHub publish failed'));
    }
    return { sha: string(result['sha'], 64), url: string(result['url'], 1000) };
  }
}

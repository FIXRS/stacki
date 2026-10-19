export class GitHubChangedError extends Error {
  constructor() {
    super('GitHub advanced during publishing. Refreshing the latest revision is required.');
  }
}
export class GitHubRequestError extends Error {
  constructor(readonly status: number) {
    super(`GitHub request failed (${status}); check app permissions and repository access.`);
  }
}

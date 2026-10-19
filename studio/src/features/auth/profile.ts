import { record, string } from '../../shared/validation';

export interface GitHubProfile {
  readonly id: number;
  readonly login: string;
}
export function parseProfile(value: unknown): GitHubProfile {
  const data = record(value);
  const id = data['id'];
  const login = string(data['login'], 100);
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || !/^[\w-]+$/.test(login)) {
    throw new Error('Invalid GitHub profile');
  }
  return { id, login };
}
export function avatarURL(id: number) {
  return `https://avatars.githubusercontent.com/u/${id}?s=64`;
}

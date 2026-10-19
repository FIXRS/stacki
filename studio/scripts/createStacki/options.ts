export interface CreateOptions {
  readonly directory: string;
  readonly yes: boolean;
  readonly mode: 'install' | 'help' | 'version' | 'agent';
}

export function parseOptions(args: readonly string[]): CreateOptions {
  if (args.length > 8 || args.some((arg) => arg.length > 4096)) {
    throw new Error('Too many or oversized arguments');
  }
  let directory = '.';
  let hasDirectory = false;
  let yes = false;
  let mode: CreateOptions['mode'] = 'install';
  for (const arg of args) {
    if (arg === '--yes' || arg === '-y') {
      yes = true;
    } else if (arg === '--help' || arg === '-h') {
      mode = 'help';
    } else if (arg === '--version' || arg === '-v') {
      mode = 'version';
    } else if (arg === '--agent') {
      mode = 'agent';
    } else if (arg.startsWith('-')) {
      throw new Error('Unknown option: ' + arg);
    } else if (hasDirectory) {
      throw new Error('Specify only one existing project directory');
    } else {
      directory = arg;
      hasDirectory = true;
    }
  }
  return { directory, yes, mode };
}

export function requireSupportedNode(version: string): void {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  const major = Number(parts?.[1]);
  const minor = Number(parts?.[2]);
  if (!parts || major < 22 || (major === 22 && minor < 19)) {
    throw new Error('Stacki Studio needs Node.js 22.19.0 or newer');
  }
}

// Pushes must run the same clean build and regression gate as CI. Compiling
// the runner first avoids relying on stale dist/ output after a checkout.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const PUSH_TIMEOUT_MS = 30 * 60 * 1_000;

export function runPushChecks(root: string): number {
  // Desktop agent terminals can inherit this variable. Electron probes need
  // the real browser process, so the gate always clears it in its children.
  const environment = { ...process.env };
  delete environment['ELECTRON_RUN_AS_NODE'];
  const commands: readonly (readonly string[])[] = [
    [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      '--project',
      'scripts/tsconfig.build.json',
    ],
    [path.join(root, 'dist/scripts/gate/runTests.js')],
  ];
  console.log('pre-push: running the full CI gate locally; this can take several minutes.');
  for (const argumentsList of commands) {
    const result = spawnSync(process.execPath, argumentsList, {
      cwd: root,
      env: environment,
      stdio: 'inherit',
      shell: false,
      timeout: PUSH_TIMEOUT_MS,
      windowsHide: true,
    });
    if (result.error !== undefined) {
      console.error(`pre-push: ${result.error.message}`);
      return 1;
    }
    if (result.status !== 0) {
      console.error('pre-push: fix the failed local gate before pushing.');
      return 1;
    }
  }
  return 0;
}

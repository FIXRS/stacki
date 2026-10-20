import PublishModal from './PublishModal';
import type { PublishRequest } from './PublishModal';
import { initializeGit, readGitInfo } from './gitChipBridge';
import { publishGitProject } from './gitPublishWorkflow';
import { openExternalURL } from '../../ipc/appBridge';
import { cleanError } from '../../lib/cleanError';
import type { Result } from '../../../shared/core/result';

export function PublishRepositorySetup({
  projectPath,
  close,
  flushSave,
}: {
  readonly projectPath: string;
  readonly close: () => void;
  readonly flushSave: () => Promise<unknown>;
}) {
  async function configure(request: PublishRequest): Promise<Result<string | undefined, string>> {
    try {
      await flushSave();
      const info = await readGitInfo(projectPath);
      if (!info.ok) {
        return info;
      }
      if (!info.value.isRepo) {
        const initialized = await initializeGit(projectPath);
        if (!initialized.ok) {
          return initialized;
        }
      }
      return await publishGitProject(projectPath, request);
    } catch (error: unknown) {
      return { ok: false, error: cleanError(error) };
    }
  }
  return (
    <PublishModal
      projectPath={projectPath}
      defaultName={projectPath.split(/[/\\]/).at(-1) ?? 'website'}
      branch="current branch"
      onClose={close}
      onPublish={configure}
      openExternal={(url) => {
        void openExternalURL(url);
      }}
    />
  );
}

import { publishingRepositories } from '../project/publishRepositories';
import { discoverPublishing } from '../project/publishDiscovery';
import { ensureToolPath } from '../lib/nodeTools';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import type { MainHost } from './mainHost';
import { DesktopPublisher } from '../project/publisher';

export function registerPublishHandlers(host: Pick<MainHost, 'ipcMain' | 'assertInProject'>): void {
  const publisher = new DesktopPublisher();
  host.ipcMain.handle('publish:discover', async (_event, input) => {
    const project = root(input.projectPath);
    await ensureToolPath();
    return discoverPublishing(project, input.request);
  });
  const root = (projectPath: string) => {
    const canonical = realpathSync(projectPath);
    host.assertInProject(path.join(canonical, '.stacki', 'publish.json'));
    return canonical;
  };
  host.ipcMain.handle('publish:repository', async (_event, input) => {
    const project = root(input.projectPath);
    await ensureToolPath();
    if (input.request.action !== 'list' && publisher.state(project).kind === 'running') {
      return { ok: false, error: 'Wait for publishing to finish before changing repositories.' };
    }
    return publishingRepositories(project, input.request);
  });
  host.ipcMain.handle('publish:start', (_event, input) =>
    publisher.start(root(input.projectPath), input.target),
  );
  host.ipcMain.handle('publish:state', (_event, projectPath) => publisher.state(root(projectPath)));
}

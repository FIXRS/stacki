import { parseIpcPayload } from '../../../shared/ipc/ipcPayloads';
import type { PublishTarget } from '../../../shared/properties/publishConfig';
import { parseDesktopPublishState } from '../../../shared/properties/publishState';

export async function startPublish(projectPath: string, target: PublishTarget) {
  const input = parseIpcPayload('publish:start', { projectPath, target });
  return parseDesktopPublishState(await window.avb.publishStart(input));
}

export async function readPublishState(projectPath: string) {
  const input = parseIpcPayload('publish:state', projectPath);
  return parseDesktopPublishState(await window.avb.publishState(input));
}

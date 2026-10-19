import { useSyncExternalStore } from 'react';
import { parsePublishState } from './publishClient';
import type { PublishState } from './publish';
import { beginOperation } from '../session/activity';

let current: PublishState = { kind: 'idle' };
let finish: (() => void) | undefined;
const listeners = new Set<() => void>();
export function receiveSharedPublish(value: unknown) {
  const next = parsePublishState(value);
  if (JSON.stringify(next) === JSON.stringify(current)) {
    return;
  }
  current = next;
  if (next.kind === 'building') {
    finish ??= beginOperation();
  } else {
    finish?.();
    finish = undefined;
  }
  for (const listener of listeners) {
    listener();
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const snapshot = () => current;
export function useSharedPublish() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

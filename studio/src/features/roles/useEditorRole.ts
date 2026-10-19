import { useSyncExternalStore } from 'react';
import { getEditorRole, subscribeRole } from './roleStore';
export function useEditorRole() {
  return useSyncExternalStore(subscribeRole, getEditorRole, () => 'designer' as const);
}

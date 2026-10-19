import { setSoundEnabled, soundEnabled } from '../../../vendor/stacki/src/ui/sound';

const storageKey = 'studio-sound-effects';
const listeners = new Set<() => void>();

function readPreference(): boolean {
  try {
    return localStorage.getItem(storageKey) !== 'false';
  } catch {
    return true;
  }
}

setSoundEnabled(readPreference());

export const getSoundPreference = soundEnabled;

export function setSoundPreference(enabled: boolean): void {
  setSoundEnabled(enabled);
  try {
    localStorage.setItem(storageKey, String(enabled));
  } catch {
    // Keep the toggle usable when browser storage is unavailable.
  }
  for (const listener of listeners) {
    listener();
  }
}

function syncPreference(event: StorageEvent): void {
  if (event.key !== storageKey && event.key !== null) {
    return;
  }
  setSoundEnabled(readPreference());
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeSoundPreference(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener('storage', syncPreference);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('storage', syncPreference);
    }
  };
}

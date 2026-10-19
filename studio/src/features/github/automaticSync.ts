import type { RepositorySync } from './sync';

// One poller per workspace, only while an editor is connected. It never overlaps
// a publish and does not keep an idle container alive.
export function automaticSync(sync: RepositorySync, enabled: () => boolean, interval = 15000) {
  let running = false;
  const check = async () => {
    if (running || !enabled()) {
      return;
    }
    running = true;
    try {
      await sync.latest();
    } catch {
      /* Status endpoint retains the actionable error. */
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void check(), interval);
  timer.unref();
  return { check, stop: () => clearInterval(timer) };
}

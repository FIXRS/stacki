// Read by the idle timer so a build, upload, or save is never interrupted.
const pending = new Set<symbol>();
export function beginOperation() {
  const token = Symbol('operation');
  pending.add(token);
  return () => pending.delete(token);
}
export function hasPendingOperations() {
  return pending.size > 0;
}
export function mayPause(lastActivity: number, now: number, busy: boolean) {
  return !busy && now - lastActivity >= 300_000;
}

import type { useDefaultsCanvas } from './useDefaultsCanvas';
import './componentDefaults.css';

// Errors remain visible and recoverable without bringing back a second editing toolbar.
export function DefaultsCanvasBar({
  canvas,
}: {
  readonly canvas: ReturnType<typeof useDefaultsCanvas>;
}) {
  const state = canvas.state;
  if (state.kind === 'idle' || (!state.message && canvas.isOpen)) {
    return undefined;
  }
  return (
    <div className="defaults-canvas-bar" role="alert">
      <span>{state.message}</span>
      {!canvas.isOpen && (
        <button onClick={() => void canvas.run('resume')}>Return to defaults</button>
      )}
      <button disabled={state.kind === 'saving'} onClick={() => void canvas.run('discard')}>
        Discard changes
      </button>
    </div>
  );
}

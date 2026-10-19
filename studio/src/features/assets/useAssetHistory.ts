import { useCallback, useEffect, useRef } from 'react';
import type { AssetUndo } from '../../../vendor/stacki/src/features/assets/AssetsPanel';

export function useAssetHistory(report: (error: unknown) => void) {
  const past = useRef<AssetUndo[]>([]);
  const future = useRef<AssetUndo[]>([]);
  const busy = useRef(false);
  const record = useCallback((command: AssetUndo) => {
    past.current = [...past.current.slice(-49), command];
    future.current = [];
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !['z', 'y'].includes(event.key.toLowerCase())) {
        return;
      }
      // Asset history owns these shortcuts while the panel is open. Keep native
      // input undo, and never undo an unrelated canvas edit behind this panel.
      event.stopImmediatePropagation();
      if (event.target instanceof Element && event.target.closest('input, textarea')) {
        return;
      }
      event.preventDefault();
      if (busy.current) {
        return;
      }
      const redo = event.shiftKey || event.key.toLowerCase() === 'y';
      const source = redo ? future : past;
      const destination = redo ? past : future;
      const command = source.current.at(-1);
      if (!command) {
        return;
      }
      busy.current = true;
      void (redo ? command.redo() : command.undo())
        .then(() => {
          source.current.pop();
          destination.current.push(command);
        })
        .catch(report)
        .finally(() => {
          busy.current = false;
        });
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [report]);
  return record;
}

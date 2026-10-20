import { useCallback, useEffect, useRef, useState } from 'react';

export const POPUP_MOTION_MS = 160;
export type PopupPhase = 'opening' | 'open' | 'closing' | 'closed';

export function usePopupLifecycle({ open }: { readonly open: boolean }, onClose: () => void) {
  const [phase, setPhase] = useState<PopupPhase>(open ? 'opening' : 'closed');
  const completion = useRef<(() => void) | undefined>(undefined);
  const callback = useRef(onClose);
  callback.current = onClose;
  const finish = useCallback((action: () => void): void => {
    if (completion.current) {
      return;
    }
    completion.current = action;
    setPhase('closing');
  }, []);
  const close = useCallback(() => finish(() => callback.current()), [finish]);
  useEffect(() => {
    completion.current = undefined;
    setPhase((current) => (open ? 'opening' : current === 'closed' ? 'closed' : 'closing'));
  }, [open]);
  useEffect(() => {
    if (phase === 'opening') {
      let frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => {
          // An Escape or outside press can arrive before the opening frame paints.
          setPhase((current) => (current === 'opening' ? 'open' : current));
        });
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (phase !== 'closing') {
      return undefined;
    }
    const done = (): void => {
      const action = completion.current;
      completion.current = undefined;
      setPhase('closed');
      action?.();
    };
    // Keep content mounted through exit; reduced-motion users get immediate dismissal.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced) {
      let active = true;
      queueMicrotask(() => {
        if (active) {
          done();
        }
      });
      return () => {
        active = false;
      };
    }
    const timer = window.setTimeout(done, POPUP_MOTION_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);
  return { phase, close, finish } as const;
}

import { useCallback, useState } from 'react';

export const TOAST_LIMIT = 5;
export type ToastKind = 'info' | 'success' | 'error';
export interface ToastNotice {
  readonly id: string;
  readonly message: string;
  readonly kind: ToastKind;
}

// Keep the newest notices visible and bound both mounted cards and their timers.
export function useToastStack<Notice extends ToastNotice>() {
  const [notices, setNotices] = useState<readonly Notice[]>([]);
  const push = useCallback((notice: Notice) => {
    setNotices((current) =>
      [notice, ...current.filter((item) => item.message !== notice.message)].slice(0, TOAST_LIMIT),
    );
  }, []);
  const dismiss = useCallback((id: string) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);
  return { notices, push, dismiss };
}

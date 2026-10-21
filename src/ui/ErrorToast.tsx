import { useEffect, useRef } from 'react';
import { dismissErrorToast, reportErrorToast, type ToastRecovery } from './errorNotices';

interface ErrorToastProps {
  readonly message: string | undefined;
  readonly recovery?: readonly ToastRecovery[];
}

// Error states report once per message transition, without adding content to their panel.
// Recovery callbacks read the latest render so a toast cannot retry obsolete form values.
export function ErrorToast({ message, recovery = [] }: ErrorToastProps) {
  const current = useRef(recovery);
  current.current = recovery;
  const recoveryKey = recovery.map((action) => action.label).join('\n');
  useEffect(() => {
    if (message) {
      const id = reportErrorToast(
        message,
        current.current.map((action, index) => ({
          label: action.label,
          run: () => current.current[index]?.run(),
        })),
      );
      // Resolved/unmounted states must not leave an obsolete recovery command behind.
      return () => {
        if (id && recoveryKey) {
          dismissErrorToast(id);
        }
      };
    }
    return undefined;
  }, [message, recoveryKey]);
  return undefined;
}

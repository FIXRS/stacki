import { useEffect, useState } from 'react';

// Keep the dialog in the top layer until its exit and backdrop animations finish.
export function useDialogClose(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (!closing) {
      return;
    }
    const timer = setTimeout(onClose, 160);
    return () => clearTimeout(timer);
  }, [closing, onClose]);
  const close = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
    } else {
      setClosing(true);
    }
  };
  return { closing, close };
}

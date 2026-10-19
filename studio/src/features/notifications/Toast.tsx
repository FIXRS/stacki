import { useEffect, useState } from 'react';
import './toast.css';
import { Avatar } from '../auth/Avatar';
import type { NoticeDetails } from './notice';

export function Toast({
  message,
  dismiss,
  details,
  performAction,
}: {
  readonly message: string;
  readonly dismiss: () => void;
  readonly details?: NoticeDetails | undefined;
  readonly performAction?: () => void;
}) {
  const [shown, setShown] = useState(message);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (message) {
      setShown(message);
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const timer = setTimeout(() => setShown(''), 180);
    return () => clearTimeout(timer);
  }, [message]);
  if (!shown) {
    return null;
  }
  return (
    <div key={shown} role="alert" className="studio-toast stacki-toast" data-leaving={leaving}>
      {details?.person && (
        <span className="studio-toast-avatar" aria-label={details.person.name}>
          <Avatar key={details.person.id ?? details.person.name} {...details.person} />
        </span>
      )}
      <div className="studio-toast-content">
        <span className="stacki-toast-message">{shown}</span>
        {details?.action && (
          <button type="button" className="studio-toast-action" onClick={performAction}>
            {details.action.label}
          </button>
        )}
      </div>
      <button className="stacki-toast-close" aria-label="Dismiss notification" onClick={dismiss}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="m4 4 8 8m0-8-8 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { hasPendingOperations, mayPause } from './activity';

export function useIdleSession(canPause: boolean) {
  const [paused, setPaused] = useState(false);
  const lastActivity = useRef(Date.now());
  const safe = useRef(canPause);
  safe.current = canPause;
  useEffect(() => {
    const activity = () => {
      lastActivity.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'studio:interaction'] as const;
    for (const event of events) {
      window.addEventListener(event, activity, { passive: true });
    }
    const timer = setInterval(() => {
      if (mayPause(lastActivity.current, Date.now(), !safe.current || hasPendingOperations())) {
        setPaused(true);
      }
    }, 10_000);
    return () => {
      clearInterval(timer);
      for (const event of events) {
        window.removeEventListener(event, activity);
      }
    };
  }, []);
  return {
    paused,
    resume: () => {
      lastActivity.current = Date.now();
      setPaused(false);
    },
  };
}

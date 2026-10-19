import { useCallback, useState } from 'react';
import { ActionableNotice, type NoticeDetails } from './notice';

export function useNotifications() {
  const [messages, setMessages] = useState<readonly (NoticeDetails & { message: string })[]>([]);
  const report = useCallback((problem: unknown) => {
    const message = problem instanceof Error ? problem.message : String(problem);
    if (message) {
      const notice = { message, ...(problem instanceof ActionableNotice ? problem.details : {}) };
      setMessages((current) =>
        current.some((item) => item.message === message)
          ? current.map((item) => (item.message === message ? notice : item))
          : [...current.slice(0, 99), notice],
      );
    }
  }, []);
  const dismiss = useCallback(() => setMessages((current) => current.slice(1)), []);
  const notice = messages[0];
  const performAction = () => {
    if (notice?.action) {
      dismiss();
      void Promise.resolve().then(notice.action.run).catch(report);
    }
  };
  return { message: notice?.message ?? '', details: notice, performAction, report, dismiss };
}

import { ErrorToast } from '../../../vendor/stacki/src/ui/ErrorToast';
import type { ActionableNotice } from '../notifications/notice';

export function LockedSettings({
  notice,
  report,
}: {
  readonly notice: ActionableNotice;
  readonly report: (error: unknown) => void;
}) {
  const action = notice.details.action;
  return (
    <div className="panel-section grow">
      <div className="panel-header">
        <h2>Settings</h2>
      </div>
      <ErrorToast
        message={notice.message}
        recovery={
          action
            ? [
                {
                  label: action.label,
                  run: () => Promise.resolve().then(action.run).catch(report),
                },
              ]
            : []
        }
      />
    </div>
  );
}

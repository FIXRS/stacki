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
      <div className="props-empty">
        <p>{notice.message}</p>
        {action && (
          <button
            type="button"
            onClick={() => void Promise.resolve().then(action.run).catch(report)}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

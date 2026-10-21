import { reportErrorToast } from '../../../vendor/stacki/src/ui/errorNotices';
import { useState } from 'react';
import { RefreshIcon } from '../../../vendor/stacki/src/ui/Icons';
import { request } from '../project/projectClient';
import { record, string } from '../../shared/validation';
import { byteSize, parseReport, type CleanupReport } from './cleanupTypes';

export function StoragePanel({ refresh }: { readonly refresh: () => void }) {
  const model = useCleanup(refresh);
  return (
    <section className="storage-panel" aria-label="Storage and cleanup">
      <button
        className="storage-toggle"
        onClick={() => void model.scan()}
        disabled={model.busy}
        aria-busy={model.busy}
        aria-label={model.report ? 'Refresh storage scan' : undefined}
        title={model.report ? 'Refresh storage scan' : undefined}
      >
        {model.report ? (
          <RefreshIcon size={14} />
        ) : model.busy ? (
          'Checking storage…'
        ) : (
          'Storage & cleanup'
        )}
      </button>
      {model.report && <StorageUsage report={model.report} />}
      {model.report && <CleanupChoices model={model} />}
      {model.message && (
        <p role="status" className="storage-message">
          {model.message}
        </p>
      )}
    </section>
  );
}
function useCleanup(refresh: () => void) {
  const [report, setReport] = useState<CleanupReport>();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  async function scan() {
    setBusy(true);
    setMessage('');
    setSelected(new Set());
    setConfirming(false);
    try {
      setReport(parseReport(await request('/studio/api/storage')));
    } catch (error) {
      setReport(undefined);
      reportErrorToast(error instanceof Error ? error.message : 'Storage scan failed');
    } finally {
      setBusy(false);
    }
  }
  async function clean() {
    if (!report || !selected.size) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const result = record(
        await request('/studio/api/storage/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidates: report.candidates.filter((item) => selected.has(item.file)),
          }),
        }),
      );
      const warning = result['warning'] ? string(result['warning']) : '';
      setReport(parseReport(result['report']));
      setMessage(
        `Removed ${byteSize(result['removed'])} stored copies · freed ${formatBytes(byteSize(result['freedBytes']))}.`,
      );
      if (warning) {
        reportErrorToast(warning);
      }
      refresh();
      window.dispatchEvent(new Event('studio:assets-changed'));
    } catch (error) {
      reportErrorToast(error instanceof Error ? error.message : 'Cleanup failed');
    } finally {
      setBusy(false);
      setConfirming(false);
      setSelected(new Set());
    }
  }
  return {
    report,
    selected,
    busy,
    confirming,
    message,
    scan,
    clean,
    setConfirming,
    toggle: (file: string) => {
      setConfirming(false);
      setSelected((previous) => toggleSelected(previous, file));
    },
  };
}
function toggleSelected(previous: ReadonlySet<string>, file: string) {
  const next = new Set(previous);
  if (next.has(file)) {
    next.delete(file);
  } else {
    next.add(file);
  }
  return next;
}
function StorageUsage({ report }: { readonly report: CleanupReport }) {
  return (
    <>
      <p className="storage-total">
        {formatBytes(report.totalBytes)}{' '}
        <span>in {report.location === 'r2' ? 'this R2 bucket' : 'local draft storage'}</span>
      </p>
      <dl className="storage-usage">
        <dt>Uploads</dt>
        <dd>{formatBytes(report.assetBytes)}</dd>
        <dt>Collaboration drafts</dt>
        <dd>{formatBytes(report.draftBytes)}</dd>
        <dt>Other stored data</dt>
        <dd>{formatBytes(report.otherBytes)}</dd>
      </dl>
      <p className="storage-note">
        {report.count} stored objects. This is stored size, not a billing estimate. Drafts are
        retained for recovery.
      </p>
    </>
  );
}
function CleanupChoices({ model }: { readonly model: ReturnType<typeof useCleanup> }) {
  const candidates = model.report?.candidates ?? [];
  const selected = candidates.filter((item) => model.selected.has(item.file));
  const unused = selected.filter((item) => item.kind === 'unreferenced').length;
  if (!candidates.length) {
    return <p className="storage-note">No cleanup candidates in this scan.</p>;
  }
  return (
    <>
      <p className="storage-note">
        Published copies can leave draft storage while remaining in your project. Uploads with no
        detected references require review for dynamic URLs and external links.
      </p>
      <div className="cleanup-list">
        {candidates.map((item) => (
          <label key={item.file}>
            <input
              type="checkbox"
              aria-label={`Clean ${item.file}`}
              checked={model.selected.has(item.file)}
              disabled={model.busy}
              onChange={() => model.toggle(item.file)}
            />
            <span>
              <strong>{item.file.slice(7)}</strong>
              <small>
                {formatBytes(item.size)} ·{' '}
                {item.kind === 'published' ? 'Identical copy in GitHub' : 'No references detected'}
              </small>
            </span>
          </label>
        ))}
      </div>
      {model.confirming ? (
        <div className="cleanup-confirm">
          <p>
            Remove {selected.length} stored {selected.length === 1 ? 'copy' : 'copies'} (
            {formatBytes(selected.reduce((sum, item) => sum + item.size, 0))})?
            {unused
              ? ` This permanently deletes ${unused} unpublished ${unused === 1 ? 'upload' : 'uploads'} from the project.`
              : ' Project files stay available.'}
          </p>
          <button disabled={model.busy} onClick={() => void model.clean()}>
            Confirm cleanup
          </button>
          <button disabled={model.busy} onClick={() => model.setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button disabled={model.busy || !selected.length} onClick={() => model.setConfirming(true)}>
          Review cleanup ({selected.length})
        </button>
      )}
    </>
  );
}
export function formatBytes(bytes: number) {
  if (bytes < 1000) {
    return `${bytes} B`;
  }
  if (bytes < 1_000_000) {
    return `${(bytes / 1000).toFixed(1)} KB`;
  }
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

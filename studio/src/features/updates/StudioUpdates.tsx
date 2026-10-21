import { ErrorToast } from '../../../vendor/stacki/src/ui/ErrorToast';
import { useState } from 'react';
import { record, string } from '../../shared/validation';
import { isNewerRelease, releaseVersion } from './release';
import release from '../../shared/release.json';

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'available'; readonly version: string }
  | { readonly kind: 'message'; readonly text: string }
  | { readonly kind: 'error'; readonly text: string }
  | { readonly kind: 'prepared'; readonly url: string };

function useStudioUpdates() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [accepted, setAccepted] = useState(false);
  const check = async () => {
    setState({ kind: 'loading' });
    try {
      const response = await fetch('/studio/api/updates');
      const result = record(await response.json());
      if (!response.ok) {
        throw new Error(string(result['error']));
      }
      const latest = result['latest'];
      const version = latest ? releaseVersion(record(latest)['version']) : undefined;
      setAccepted(false);
      setState(
        version && isNewerRelease(version, release.version)
          ? { kind: 'available', version }
          : { kind: 'message', text: 'No newer Studio release is available.' },
      );
    } catch (error) {
      setState({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Could not check updates.',
      });
    }
  };
  const prepare = async (version: string) => {
    if (!accepted) {
      return;
    }
    setState({ kind: 'loading' });
    try {
      const response = await fetch('/studio/api/updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, current: release.version, replaceCustomizations: true }),
      });
      const result = record(await response.json());
      if (!response.ok) {
        throw new Error(string(result['error']));
      }
      const url = new URL(string(result['url'], 1000));
      if (url.origin !== 'https://github.com') {
        throw new Error('Unexpected update review URL');
      }
      setState({ kind: 'prepared', url: url.href });
    } catch (error) {
      setState({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Update preparation failed.',
      });
    }
  };
  return { state, setState, accepted, setAccepted, check, prepare };
}

export function StudioUpdates() {
  const { state, setState, accepted, setAccepted, check, prepare } = useStudioUpdates();
  return (
    <section aria-label="Studio updates" className="studio-updates">
      <span>Stacki Studio {release.version}</span>
      <button disabled={state.kind === 'loading'} onClick={() => void check()}>
        Check for updates
      </button>
      {state.kind === 'loading' && <p role="status">Checking Stacki…</p>}
      {state.kind === 'message' && <p role="status">{state.text}</p>}
      {state.kind === 'error' && <ErrorToast message={state.text} />}
      {state.kind === 'available' && (
        <>
          <p>
            Version {state.version} is available. Updating replaces all Studio customizations.
            Website files, connection settings and drafts are preserved.
          </p>
          <label>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            Replace Studio customizations
          </label>
          <button disabled={!accepted} onClick={() => void prepare(state.version)}>
            Prepare update for review
          </button>
          <button onClick={() => setState({ kind: 'idle' })}>Keep current version</button>
        </>
      )}
      {state.kind === 'prepared' && (
        <p>
          An update branch is ready.{' '}
          <a href={state.url} target="_blank" rel="noreferrer">
            Review the update on GitHub
          </a>
          , then merge and deploy when ready.
        </p>
      )}
    </section>
  );
}

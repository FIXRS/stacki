import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import StudioSetup from '../../features/studioSetup/StudioSetup';
import { cleanError } from '../../lib/cleanError';
import { readPreferences, savePreference } from './preferencesBridge';
import './settings.css';
import { InfoLabel } from '../../ui/InfoLabel';
import { useDialogClose } from '../../ui/useDialogClose';

interface Props {
  readonly projectPath: string | undefined;
  readonly previewURL: string | undefined;
}

export default function Settings(props: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => window.avb.onMenu('settings', () => setOpen(true)), []);
  return open
    ? createPortal(<SettingsDialog {...props} onClose={() => setOpen(false)} />, document.body)
    : undefined;
}

function SettingsDialog(props: Props & { readonly onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  const { closing, close } = useDialogClose(props.onClose);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`app-settings${closing ? ' is-closing' : ''}`}
      aria-labelledby="app-settings-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onPointerDown={(event) => {
        backdropPress.current = outsideDialog(event);
      }}
      onClick={(event) => {
        if (backdropPress.current && outsideDialog(event)) {
          close();
        }
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header>
        <h2 id="app-settings-title">Settings</h2>
        <button aria-label="Close settings" onClick={close}>
          ×
        </button>
      </header>
      <div className="app-settings-content">
        <Preferences />
        {props.projectPath ? (
          <StudioSetup
            key={props.projectPath}
            projectPath={props.projectPath}
            previewURL={props.previewURL}
            onOpen={() => {
              // Hide Settings without unmounting the Studio flow it owns.
              dialog.current?.close();
            }}
            onClose={props.onClose}
          />
        ) : (
          <p>Open a project to add Stacki Studio.</p>
        )}
      </div>
      <footer>
        <button onClick={close}>Done</button>
      </footer>
    </dialog>
  );
}

function usePreferences() {
  const [value, setValue] = useState<Awaited<ReturnType<typeof readPreferences>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void readPreferences().then(
      (result) => {
        if (active) {
          setValue(result);
        }
      },
      (failure: unknown) => {
        if (active) {
          setError(cleanError(failure));
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);
  const change = async (input: Parameters<typeof savePreference>[0]) => {
    setBusy(true);
    setError('');
    try {
      const result = await savePreference(input);
      setValue(result);
      if (!result.saved) {
        setError('Applied for this session, but could not save. Check disk space and try again.');
      }
    } catch (failure: unknown) {
      setError(cleanError(failure));
    } finally {
      setBusy(false);
    }
  };
  return { value, busy, error, change };
}

function Preferences() {
  const { value, busy, error, change } = usePreferences();
  return (
    <section className="app-preferences" aria-label="App preferences">
      <PreferenceToggle
        label="Interface sounds"
        description="Play subtle sounds as you use the editor."
        checked={value?.sound ?? false}
        disabled={!value || busy}
        onToggle={() => void change({ setting: 'sound', enabled: !value?.sound })}
      />
      <PreferenceToggle
        label="Anonymous usage counts"
        description={
          'Send one count on days you open a project. No project names, file contents, ' +
          'device identifier, or activity history are sent. Daily totals are kept on ' +
          'Cloudflare for up to 366 days. Its network sees your connection IP; ' +
          'the usage database does not store it.'
        }
        checked={value?.usageCountsEnabled ?? false}
        disabled={!value || busy}
        onToggle={() =>
          void change({
            setting: 'usageCountsEnabled',
            enabled: !value?.usageCountsEnabled,
          })
        }
      />
      {!value && !error && <p role="status">Loading preferences…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function PreferenceToggle(props: {
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <div className="app-preference-row">
      <InfoLabel label={props.label} description={props.description} />
      <button
        type="button"
        className="app-preference-toggle"
        role="switch"
        aria-label={props.label}
        aria-checked={props.checked}
        disabled={props.disabled}
        onClick={props.onToggle}
      >
        <span />
      </button>
    </div>
  );
}

function outsideDialog(event: {
  readonly target: EventTarget;
  readonly currentTarget: HTMLDialogElement;
  readonly clientX: number;
  readonly clientY: number;
}): boolean {
  if (event.target !== event.currentTarget) {
    return false;
  }
  const bounds = event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  );
}

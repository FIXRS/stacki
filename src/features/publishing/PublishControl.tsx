import { useRef, useState } from 'react';
import type { PublishTarget } from '../../../shared/properties/publishConfig';
import { parsePublishSource } from '../../../shared/properties/publishConfig';
import { readMetadata } from '../../ipc/projectMetadataBridge';
import Popup from '../../ui/Popup';
import { PublishSettings } from './PublishSettings';
import { PublishMenuOptions } from './PublishMenuOptions';
import './publishing.css';

interface Props {
  readonly projectPath: string;
  readonly busy: boolean;
  readonly publish: (target: PublishTarget) => void;
}

export function PublishControl({ projectPath, busy, publish }: Props) {
  const [open, setOpen] = useState(false);
  const { settings, setSettings, checking, prepare } = usePublishSetup(projectPath, publish);
  const container = useRef<HTMLDivElement>(null);
  const run = (target: PublishTarget) => {
    setOpen(false);
    void prepare(target);
  };
  return (
    <div
      className="stacki-publish-control"
      ref={container}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
        }
      }}
    >
      <div className="stacki-publish-split">
        <button className="primary" disabled={busy || checking} onClick={() => void run('all')}>
          {busy ? 'Publishing…' : 'Publish'}
        </button>
        <button
          className="primary stacki-publish-arrow"
          aria-label="More publish options"
          aria-expanded={open}
          disabled={busy || checking}
          onClick={() => setOpen(!open)}
        >
          <svg width="6" height="4" viewBox="0 0 10 6" aria-hidden="true">
            <path d="M0 0h10L5 6z" fill="currentColor" />
          </svg>
        </button>
      </div>
      <Popup
        mode="popover"
        portal={false}
        open={open}
        anchor={container.current ?? undefined}
        onClose={() => setOpen(false)}
        className="stacki-publish-menu"
        label="Publish options"
      >
        <PublishMenuOptions
          key={projectPath}
          projectPath={projectPath}
          publish={run}
          openSettings={() => {
            setOpen(false);
            setSettings(true);
          }}
        />
      </Popup>
      {settings && (
        <PublishSettings
          key={projectPath}
          projectPath={projectPath}
          close={() => setSettings(false)}
        />
      )}
    </div>
  );
}

function usePublishSetup(projectPath: string, publish: Props['publish']) {
  const [settings, setSettings] = useState(false);
  const [checking, setChecking] = useState(false);
  const pending = useRef(false);
  const prepare = async (target: PublishTarget) => {
    if (pending.current) {
      return;
    }
    pending.current = true;
    setChecking(true);
    try {
      const file = await readMetadata(projectPath, 'publish');
      const config = parsePublishSource(file.source);
      if (
        file.source === undefined ||
        (target === 'hosting' && config.hosting.provider === 'none')
      ) {
        setSettings(true);
      } else {
        publish(target);
      }
    } catch {
      // The setup dialog reports load errors and offers a retry instead of starting a job.
      setSettings(true);
    } finally {
      pending.current = false;
      setChecking(false);
    }
  };
  return { settings, setSettings, checking, prepare };
}

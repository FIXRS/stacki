import { useEffect, useRef, useState } from 'react';
import type { PublishTarget } from '../../../shared/properties/publishConfig';
import type { DesktopPublishState } from '../../../shared/properties/publishState';
import { PublishControl } from '../../features/publishing/PublishControl';
import { startPublish, readPublishState } from '../../features/publishing/publishBridge';
import { cleanError } from '../../lib/cleanError';
import { readGitInfo } from '../../features/git/gitChipBridge';
import { PublishRepositorySetup } from '../../features/git/PublishRepositorySetup';
import { createPortal } from 'react-dom';

interface Props {
  readonly projectPath: string;
  readonly flushSave: () => Promise<unknown>;
  readonly refresh: () => Promise<unknown>;
}

export function DesktopPublishButton(props: Props) {
  return <DesktopPublishSession key={props.projectPath} {...props} />;
}

function DesktopPublishSession({ projectPath, flushSave, refresh }: Props) {
  const [state, setState] = useState<DesktopPublishState>({ kind: 'idle' });
  const [starting, setStarting] = useState(false);
  const [visible, setVisible] = useState(false);
  const [repositorySetup, setRepositorySetup] = useState(false);
  const running = useRef(false);
  const active = usePublishLifetime();
  usePublishPolling(projectPath, state, setState, refresh);
  async function publish(target: PublishTarget) {
    if (running.current || state.kind === 'running') {
      return;
    }
    running.current = true;
    setStarting(true);
    setVisible(true);
    try {
      await flushSave();
      if (target !== 'hosting') {
        const repository = await readGitInfo(projectPath);
        if (!repository.ok) {
          throw new Error(repository.error);
        }
        if (!repository.value.isRepo || !repository.value.remote) {
          setRepositorySetup(true);
          setVisible(false);
          return;
        }
      }
      const next = await startPublish(projectPath, target);
      if (active.current) {
        setState(next);
      }
      await refresh();
    } catch (error: unknown) {
      if (active.current) {
        setState({ kind: 'failed', message: cleanError(error), github: false, hosting: false });
      }
    } finally {
      running.current = false;
      if (active.current) {
        setStarting(false);
      }
    }
  }
  return (
    <div className="stacki-publish-control">
      <PublishControl
        projectPath={projectPath}
        busy={starting || state.kind === 'running'}
        publish={(target) => void publish(target)}
      />
      {(visible || state.kind === 'running') && (
        <PublishStatus state={state} close={() => setVisible(false)} />
      )}
      {repositorySetup &&
        createPortal(
          <PublishRepositorySetup
            projectPath={projectPath}
            flushSave={flushSave}
            close={() => setRepositorySetup(false)}
          />,
          document.body,
        )}
    </div>
  );
}

function PublishStatus({
  state,
  close,
}: {
  readonly state: DesktopPublishState;
  readonly close: () => void;
}) {
  const message =
    state.kind === 'running'
      ? state.step
      : state.kind === 'failed'
        ? state.message
        : state.kind === 'done'
          ? 'Publish completed.'
          : 'Preparing…';
  return (
    <section className="desktop-publish-status" role="status" aria-live="polite">
      <p>{message}</p>
      {(state.kind === 'done' || state.kind === 'failed') && (
        <>
          {state.github && <p>Saved to GitHub.</p>}
          {state.hosting && <p>Hosting deployment completed.</p>}
          <button onClick={close}>Dismiss</button>
        </>
      )}
    </section>
  );
}

function usePublishPolling(
  projectPath: string,
  state: DesktopPublishState,
  setState: (state: DesktopPublishState) => void,
  refresh: () => Promise<unknown>,
) {
  useEffect(() => {
    let disposed = false;
    void readPublishState(projectPath)
      .then((next) => {
        if (!disposed) {
          setState(next);
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [projectPath, setState]);
  useEffect(() => {
    if (state.kind !== 'running') {
      return undefined;
    }
    let disposed = false;
    const poll = async () => {
      try {
        const next = await readPublishState(projectPath);
        if (!disposed) {
          setState(next);
          if (next.kind !== 'running') {
            await refresh();
          }
        }
      } catch (error: unknown) {
        if (!disposed) {
          setState({ kind: 'failed', message: cleanError(error), github: false, hosting: false });
        }
      }
    };
    // Each response schedules the next effect; requests never overlap.
    const timer = setTimeout(() => {
      void poll();
    }, 2000);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [projectPath, state, setState, refresh]);
}

function usePublishLifetime() {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return active;
}

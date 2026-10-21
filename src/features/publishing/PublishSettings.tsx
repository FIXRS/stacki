import { ErrorToast } from '../../ui/ErrorToast';
import { discoverPublishing } from '../../ipc/publishDiscoveryBridge';
import { PublishRepositories } from './PublishRepositories';
import { publishingRepositories } from '../../ipc/publishRepositoryBridge';
import type { RepositoryRequest } from '../../../shared/ipc/publishRepository';
import Popup from '../../ui/Popup';
import Dropdown from '../../ui/Dropdown';
import { PublishProviderIcon } from './PublishProviderIcon';
import { PublishConnections } from './PublishConnections';
import { useEffect, useState } from 'react';
import { readMetadata, writeMetadata } from '../../ipc/projectMetadataBridge';
import {
  DEFAULT_PUBLISH_CONFIG,
  parsePublishConfig,
  parsePublishSource,
  type PublishConfig,
  type Hosting,
} from '../../../shared/properties/publishConfig';
import { cleanError } from '../../lib/cleanError';

interface Props {
  readonly projectPath: string;
  readonly close: () => void;
}
type SettingsState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly base: string | undefined; readonly config: PublishConfig };

export function PublishSettings(props: Props) {
  const [state, setState] = useState<SettingsState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void readMetadata(props.projectPath, 'publish')
      .then(async (file) => {
        const config = await initialSettings(props.projectPath, file.source);
        if (active) {
          setState({ kind: 'ready', base: file.source, config });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ kind: 'error', message: cleanError(error) });
        }
      });
    return () => {
      active = false;
    };
  }, [props.projectPath, attempt]);
  return (
    <Popup
      className="modal publish-settings"
      label="Publish settings"
      onClose={props.close}
      dismissible={true}
    >
      {({ close }) => (
        <>
          <div className="modal-header" aria-busy={state.kind === 'loading'}>
            Publish settings
          </div>
          <span
            className="publish-settings-loading mini-spinner"
            role="status"
            aria-label="Loading publish settings"
          />
          {state.kind === 'ready' ? (
            <PublishSettingsForm {...props} close={close} stored={state} />
          ) : state.kind === 'loading' ? (
            <PublishSettingsSkeleton close={close} />
          ) : (
            <div className="modal-body publish-fields">
              <ErrorToast message={settingsErrorMessage(state.message)} />
              <button
                onClick={() => {
                  setState({ kind: 'loading' });
                  setAttempt((value) => value + 1);
                }}
              >
                Try again
              </button>
              <button onClick={close}>Close</button>
            </div>
          )}
        </>
      )}
    </Popup>
  );
}

function PublishSettingsSkeleton({ close }: Pick<Props, 'close'>) {
  return (
    <>
      <fieldset className="modal-body publish-fields" disabled aria-busy="true">
        {['GitHub account', 'GitHub repository', 'Hosting provider', 'Hosting project'].map(
          (label) => (
            <div className="publish-field" key={label}>
              <span className="publish-label">{label}</span>
              <button className="dd-trigger" aria-label={label} disabled>
                <span className="dd-label">Loading…</span>
              </button>
            </div>
          ),
        )}
        <details className="publish-advanced">
          <summary aria-disabled="true" onClick={(event) => event.preventDefault()}>
            Advanced
          </summary>
        </details>
      </fieldset>
      <div className="modal-footer">
        <button onClick={close}>Cancel</button>
        <button className="primary" disabled>
          Save
        </button>
      </div>
    </>
  );
}

function settingsErrorMessage(message: string): string {
  if (message.includes('No handler registered')) {
    return (
      'Desktop needs to reload its new publishing support. ' +
      'Use View → Reload All Code, then open Publish settings to configure your provider.'
    );
  }
  return message;
}
function PublishSettingsForm({
  projectPath,
  close,
  stored,
}: Props & {
  readonly stored: Extract<SettingsState, { kind: 'ready' }>;
}) {
  const [config, setConfig] = useState(stored.config);
  const [base, setBase] = useState(stored.base);
  const [repository, setRepository] = useState<Extract<RepositoryRequest, { action: 'connect' }>>();
  const [repositoryBusy, setRepositoryBusy] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const validated = validateSettings(config);
      const written = await writeMetadata(projectPath, {
        kind: 'publish',
        source: JSON.stringify(validated, undefined, 2) + '\n',
        ...(base === undefined ? {} : { base }),
      });
      setBase(written.source);
      if (repository?.account === config.githubAccount) {
        const result = await publishingRepositories(projectPath, repository);
        if (!result.ok) {
          setError(`Settings saved. ${result.error}`);
          return;
        }
      }
      close();
    } catch (failure: unknown) {
      setError(cleanError(failure));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <fieldset className="modal-body publish-fields" disabled={saving || repositoryBusy}>
        <PublishConnections
          projectPath={projectPath}
          provider="github"
          value={config.githubAccount}
          change={(githubAccount) => setConfig({ ...config, githubAccount })}
        />
        <PublishRepositories
          projectPath={projectPath}
          account={config.githubAccount}
          selection={repository}
          change={setRepository}
          busy={setRepositoryBusy}
        />
        <HostingFields
          projectPath={projectPath}
          hosting={config.hosting}
          change={(hosting) => setConfig({ ...config, hosting })}
        />
        <AdvancedFields config={config} setConfig={setConfig} />
        {error && <ErrorToast message={error} />}
      </fieldset>
      <SettingsFooter busy={saving || repositoryBusy} saving={saving} close={close} save={save} />
    </>
  );
}

function HostingFields({
  projectPath,
  hosting,
  change,
}: {
  readonly projectPath: string;
  readonly hosting: Hosting;
  readonly change: (value: Hosting) => void;
}) {
  return (
    <>
      <div className="publish-field">
        <span className="publish-label">Hosting provider</span>
        <Dropdown<Hosting['provider']>
          ariaLabel="Hosting provider"
          options={[
            {
              value: 'none',
              label: 'None (GitHub only)',
              icon: <PublishProviderIcon provider="none" />,
            },
            {
              value: 'cloudflare',
              label: 'Cloudflare',
              icon: <PublishProviderIcon provider="cloudflare" />,
            },
            { value: 'vercel', label: 'Vercel', icon: <PublishProviderIcon provider="vercel" /> },
          ]}
          menuClassName="publish-dropdown"
          livePreview={false}
          value={hosting.provider === 'cloudflare-workers' ? 'cloudflare' : hosting.provider}
          onChange={(provider) => change(emptyHosting(provider))}
        />
      </div>
      {hosting.provider === 'none' ? (
        <div className="publish-field">
          <span className="publish-label">Hosting project</span>
          <button className="dd-trigger" aria-label="Hosting project" disabled>
            <span className="dd-label dim">Choose a hosting provider first</span>
          </button>
        </div>
      ) : (
        <PublishConnections
          key={hosting.provider === 'cloudflare-workers' ? 'cloudflare' : hosting.provider}
          projectPath={projectPath}
          provider={hosting.provider === 'cloudflare-workers' ? 'cloudflare' : hosting.provider}
          value={hosting}
          change={change}
        />
      )}
    </>
  );
}

function TextField({
  label,
  value,
  change,
}: {
  readonly label: string;
  readonly value: string;
  readonly change: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input value={value} maxLength={256} onChange={(event) => change(event.target.value)} />
    </label>
  );
}

function ScriptField({
  label,
  values,
  change,
}: {
  readonly label: string;
  readonly values: readonly string[];
  readonly change: (values: readonly string[]) => void;
}) {
  const [draft, setDraft] = useState(values.join(', '));
  return (
    <label>
      {label}
      <input
        value={draft}
        maxLength={808}
        onChange={(event) => {
          const value = event.target.value;
          setDraft(value);
          change(
            value
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean),
          );
        }}
      />
    </label>
  );
}

function AdvancedFields({
  config,
  setConfig,
}: {
  readonly config: PublishConfig;
  readonly setConfig: (config: PublishConfig) => void;
}) {
  return (
    <details className="publish-advanced">
      <summary>Advanced</summary>
      <div className="publish-advanced-fields">
        <TextField
          label="GitHub username"
          value={config.githubAccount}
          change={(githubAccount) => setConfig({ ...config, githubAccount })}
        />
        <ManualHosting
          hosting={config.hosting}
          change={(hosting) => setConfig({ ...config, hosting })}
        />
        <TextField
          label="Build script"
          value={config.buildScript}
          change={(buildScript) => setConfig({ ...config, buildScript })}
        />
        <ScriptField
          label="Before publish"
          values={config.beforePublish}
          change={(beforePublish) => setConfig({ ...config, beforePublish })}
        />
        <ScriptField
          label="After publish"
          values={config.afterPublish}
          change={(afterPublish) => setConfig({ ...config, afterPublish })}
        />
        <p className="hint-text">Use npm script names, separated by commas.</p>
      </div>
    </details>
  );
}

function CloudflareFields({
  hosting,
  change,
}: {
  readonly hosting: Extract<Hosting, { provider: 'cloudflare' }>;
  readonly change: (hosting: Hosting) => void;
}) {
  return (
    <>
      <TextField
        label="Cloudflare account ID"
        value={hosting.accountId}
        change={(accountId) => change({ ...hosting, accountId })}
      />
      <TextField
        label="Pages project name"
        value={hosting.project}
        change={(project) => change({ ...hosting, project })}
      />
      <TextField
        label="Production branch"
        value={hosting.branch}
        change={(branch) => change({ ...hosting, branch })}
      />
      <TextField
        label="Build output directory"
        value={hosting.directory}
        change={(directory) => change({ ...hosting, directory })}
      />
    </>
  );
}

function ManualHosting({
  hosting,
  change,
}: {
  readonly hosting: Hosting;
  readonly change: (hosting: Hosting) => void;
}) {
  return (
    <>
      {hosting.provider === 'cloudflare' && <CloudflareFields hosting={hosting} change={change} />}
      {hosting.provider === 'cloudflare-workers' && (
        <>
          <TextField
            label="Cloudflare account ID"
            value={hosting.accountId}
            change={(accountId) => change({ ...hosting, accountId })}
          />
          <TextField
            label="Worker name"
            value={hosting.project}
            change={(project) => change({ ...hosting, project })}
          />
        </>
      )}
      {hosting.provider === 'vercel' && (
        <>
          <TextField
            label="Vercel organization / team ID"
            value={hosting.organizationId}
            change={(organizationId) => change({ ...hosting, organizationId })}
          />
          <TextField
            label="Vercel project ID"
            value={hosting.projectId}
            change={(projectId) => change({ ...hosting, projectId })}
          />
        </>
      )}
    </>
  );
}

function SettingsFooter({
  busy,
  saving,
  close,
  save,
}: {
  readonly busy: boolean;
  readonly saving: boolean;
  readonly close: () => void;
  readonly save: () => Promise<void>;
}) {
  return (
    <div className="modal-footer">
      <button disabled={busy} onClick={close}>
        Cancel
      </button>
      <button className="primary" disabled={busy} onClick={() => void save()}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

async function initialSettings(
  projectPath: string,
  source: string | undefined,
): Promise<PublishConfig> {
  const config = parsePublishSource(source);
  if (source !== undefined) {
    return config;
  }
  // Saved choices win; only a single configured destination can prefill a new configuration.
  const discovered = await discoverPublishing(projectPath, {
    provider: 'linked',
    account: '',
  }).catch(() => undefined);
  const linked =
    discovered?.kind === 'ready' && discovered.projects.length === 1
      ? discovered.projects[0]
      : undefined;
  return linked ? { ...config, hosting: linked.hosting } : config;
}

function emptyHosting(provider: Hosting['provider']): Hosting {
  switch (provider) {
    case 'none':
      return DEFAULT_PUBLISH_CONFIG.hosting;
    case 'cloudflare':
      return { provider, accountId: '', project: '', branch: 'main', directory: 'dist' };
    case 'cloudflare-workers':
      return { provider, accountId: '', project: '' };
    case 'vercel':
      return { provider, organizationId: '', projectId: '' };
  }
}

function validateSettings(config: PublishConfig): PublishConfig {
  if (config.hosting.provider === 'cloudflare-workers' && !config.hosting.accountId) {
    throw new Error('Choose the Worker under its Cloudflare account before saving.');
  }
  return parsePublishConfig(config);
}

import { ErrorToast } from '../../ui/ErrorToast';
import { useEffect, useState } from 'react';
import { RefreshIcon } from '../../ui/Icons';
import Dropdown, { type DropdownOption } from '../../ui/Dropdown';
import { discoverPublishing } from '../../ipc/publishDiscoveryBridge';
import type {
  PublishAccount,
  PublishDiscovery,
  PublishProject,
} from '../../../shared/properties/publishDiscovery';
import type { Hosting } from '../../../shared/properties/publishConfig';

type Props = { readonly projectPath: string } & (
  | {
      readonly provider: 'github';
      readonly value: string;
      readonly change: (account: string) => void;
    }
  | {
      readonly provider: 'cloudflare' | 'vercel';
      readonly value: Hosting;
      readonly change: (hosting: Hosting) => void;
    }
);
type ConnectionState =
  PublishDiscovery | { readonly kind: 'loading'; readonly previous: PublishDiscovery | undefined };

export function PublishConnections(props: Props) {
  const [state, setState] = useState<ConnectionState>({ kind: 'loading', previous: undefined });
  const [attempt, setAttempt] = useState(0);
  const { projectPath, provider } = props;
  useEffect(() => {
    let active = true;
    setState((previous) => ({
      kind: 'loading',
      previous: previous.kind === 'loading' ? previous.previous : previous,
    }));
    void discoverPublishing(projectPath, { provider, account: '' })
      .then((result) => {
        if (active) {
          setState(result);
        }
      })
      .catch(() => {
        if (active) {
          setState({ kind: 'failed', message: 'Connection unavailable.' });
        }
      });
    return () => {
      active = false;
    };
  }, [projectPath, provider, attempt]);
  const displayed = state.kind === 'loading' ? state.previous : state;
  const accounts = displayed?.kind === 'ready' ? displayed.accounts : [];
  const projects = displayed?.kind === 'ready' ? displayed.projects : [];
  const busy = state.kind === 'loading';
  return (
    <div className="publish-connections" aria-busy={busy}>
      {props.provider === 'github' ? (
        <GitHubChoice
          {...props}
          accounts={accounts}
          busy={busy}
          refresh={() => setAttempt(attempt + 1)}
        />
      ) : (
        <ProjectChoice
          {...props}
          accounts={accounts}
          projects={projects}
          busy={busy}
          refresh={() => setAttempt(attempt + 1)}
        />
      )}
      {displayed?.kind === 'failed' && (
        <ErrorToast
          message="Connection unavailable. Refresh or check sign-in."
          recovery={[{ label: 'Refresh connection', run: () => setAttempt(attempt + 1) }]}
        />
      )}
      {displayed?.kind === 'ready' && displayed.notice && (
        <p className="hint-text">{displayed.notice}</p>
      )}
      {displayed?.kind === 'failed' && <ConnectionHelp provider={provider} />}
    </div>
  );
}

function GitHubChoice(
  props: Extract<Props, { provider: 'github' }> & {
    readonly accounts: readonly PublishAccount[];
    readonly busy: boolean;
    readonly refresh: () => void;
  },
) {
  useEffect(() => {
    if (props.value === '' && props.accounts[0]) {
      // Persist a concrete username; other projects may switch the global CLI account.
      props.change(props.accounts[0].id);
    }
  }, [props]);
  const accounts =
    props.accounts.some((account) => account.id === props.value) || !props.value
      ? props.accounts
      : [...props.accounts, { id: props.value, name: props.value }];
  return (
    <div className="publish-field">
      <RefreshLabel label="GitHub account" busy={props.busy} refresh={props.refresh} />
      <Dropdown
        ariaLabel="GitHub account"
        value={props.value}
        options={accounts.map((account) => ({
          value: account.id,
          label: account.name,
          icon: <GitHubAvatar key={account.id} login={account.id} />,
        }))}
        placeholder={props.busy ? 'Loading accounts…' : 'No connected accounts'}
        disabled={accounts.length === 0}
        onChange={props.change}
        menuClassName="publish-dropdown"
        livePreview={false}
        searchable={accounts.length > 6}
      />
    </div>
  );
}

function ProjectChoice(
  props: Extract<Props, { readonly value: Hosting }> & {
    readonly accounts: readonly PublishAccount[];
    readonly projects: readonly PublishProject[];
    readonly busy: boolean;
    readonly refresh: () => void;
  },
) {
  const selected = hostingKey(props.value);
  useEffect(() => {
    if (props.value.provider === 'cloudflare-workers' && !props.value.accountId) {
      const name = props.value.project;
      const matches = props.projects.filter(
        (project) =>
          project.hosting.provider === 'cloudflare-workers' &&
          project.hosting.accountId &&
          project.hosting.project === name,
      );
      if (matches.length === 1 && matches[0]) {
        props.change(matches[0].hosting);
      }
    }
  }, [props]);
  const options = projectOptions(props.projects, props.accounts);
  if (selected && !options.some((option) => option.value === selected)) {
    options.unshift({
      value: selected,
      label: hostingName(props.value),
      group: hostingAccount(props.value)
        ? 'Saved connection'
        : 'From Wrangler · account unverified',
    });
  }
  return (
    <div className="publish-field">
      <RefreshLabel label="Hosting project" busy={props.busy} refresh={props.refresh} />
      <Dropdown
        ariaLabel="Hosting project"
        value={selected}
        options={options}
        placeholder={props.busy ? 'Loading projects…' : 'Choose project…'}
        menuClassName="publish-dropdown"
        livePreview={false}
        searchable={true}
        searchPlaceholder="Find project or account…"
        onChange={(value) => {
          const project = props.projects.find((entry) => hostingKey(entry.hosting) === value);
          if (project) {
            props.change(project.hosting);
          }
        }}
      />
    </div>
  );
}

function projectOptions(
  projects: readonly PublishProject[],
  accounts: readonly PublishAccount[],
): DropdownOption<string>[] {
  return projects
    .map((project) => {
      const account = hostingAccount(project.hosting);
      const group =
        accounts.find((entry) => entry.id === account)?.name ||
        account ||
        'From Wrangler · account unverified';
      const kind =
        project.hosting.provider === 'cloudflare'
          ? 'Pages'
          : project.hosting.provider === 'cloudflare-workers'
            ? 'Worker'
            : '';
      return {
        value: hostingKey(project.hosting),
        label: project.name,
        group,
        hint: kind,
        ...(kind ? { description: kind } : {}),
      };
    })
    .sort(
      (left, right) =>
        left.group.localeCompare(right.group) || left.label.localeCompare(right.label),
    );
}
function RefreshLabel(props: {
  readonly label: string;
  readonly busy: boolean;
  readonly refresh: () => void;
}) {
  return (
    <div className="publish-field-heading publish-label-refresh">
      <span className="publish-label">{props.label}</span>
      <button
        type="button"
        className="publish-refresh publish-refresh-icon"
        disabled={props.busy}
        aria-label={`Refresh ${props.label.toLowerCase()}`}
        onClick={props.refresh}
      >
        <RefreshIcon size={13} />
      </button>
    </div>
  );
}
function GitHubAvatar({ login }: { readonly login: string }) {
  const [image, setImage] = useState<'loading' | 'ready' | 'failed'>('loading');
  return (
    <span className="publish-avatar" aria-hidden="true">
      {login.slice(0, 1).toUpperCase()}
      {image !== 'failed' && (
        <img
          src={`https://github.com/${encodeURIComponent(login)}.png?size=48`}
          alt=""
          width={20}
          height={20}
          referrerPolicy="no-referrer"
          data-state={image}
          onLoad={() => setImage('ready')}
          onError={() => setImage('failed')}
        />
      )}
    </span>
  );
}

function ConnectionHelp({ provider }: { readonly provider: Props['provider'] }) {
  const command = { github: 'gh auth login', cloudflare: 'wrangler login', vercel: 'vercel login' };
  return (
    <details className="publish-connection-help">
      <summary>Connection help</summary>
      <p>
        Run <code>{command[provider]}</code>, then refresh.
      </p>
    </details>
  );
}
function hostingAccount(hosting: Hosting): string {
  switch (hosting.provider) {
    case 'none':
      return '';
    case 'cloudflare':
    case 'cloudflare-workers':
      return hosting.accountId;
    case 'vercel':
      return hosting.organizationId;
  }
}
function hostingKey(hosting: Hosting): string {
  switch (hosting.provider) {
    case 'none':
      return '';
    case 'cloudflare':
    case 'cloudflare-workers':
      return hosting.project ? `${hosting.provider}/${hosting.accountId}/${hosting.project}` : '';
    case 'vercel':
      return hosting.projectId ? `vercel/${hosting.organizationId}/${hosting.projectId}` : '';
  }
}
function hostingName(hosting: Hosting): string {
  switch (hosting.provider) {
    case 'none':
      return '';
    case 'cloudflare':
    case 'cloudflare-workers':
      return hosting.project;
    case 'vercel':
      return 'Saved Vercel project';
  }
}

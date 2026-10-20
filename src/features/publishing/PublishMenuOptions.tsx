import { useEffect, useState } from 'react';
import {
  parsePublishSource,
  type Hosting,
  type PublishTarget,
} from '../../../shared/properties/publishConfig';
import { readMetadata } from '../../ipc/projectMetadataBridge';
import { GearIcon, UploadCloudIcon } from '../../ui/Icons';
import { PublishProviderIcon } from './PublishProviderIcon';

interface Props {
  readonly projectPath: string;
  readonly publish: (target: PublishTarget) => void;
  readonly openSettings: () => void;
}

export function PublishMenuOptions({ projectPath, publish, openSettings }: Props) {
  return (
    <>
      <button onClick={() => publish('github')}>
        <PublishProviderIcon provider="github" />
        <span>Push to GitHub only</span>
      </button>
      <button onClick={() => publish('hosting')}>
        <PublishHostingIcon projectPath={projectPath} />
        <span>Deploy to hosting only</span>
      </button>
      <hr />
      <button onClick={openSettings}>
        <GearIcon />
        <span>Publish settings…</span>
      </button>
    </>
  );
}

function PublishHostingIcon({ projectPath }: { readonly projectPath: string }) {
  const [provider, setProvider] = useState<Hosting['provider']>('none');
  useEffect(() => {
    let active = true;
    // Read on each menu opening so saved settings and external edits refresh the logo.
    void readMetadata(projectPath, 'publish')
      .then((file) => {
        const config = parsePublishSource(file.source);
        if (active) {
          setProvider(config.hosting.provider);
        }
      })
      .catch(() => {
        // Keep a neutral hosting icon; the publish setup flow reports configuration errors.
        if (active) {
          setProvider('none');
        }
      });
    return () => {
      active = false;
    };
  }, [projectPath]);
  return provider === 'none' ? <UploadCloudIcon /> : <PublishProviderIcon provider={provider} />;
}

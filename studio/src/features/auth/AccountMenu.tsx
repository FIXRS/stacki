import { StudioUpdates } from '../updates/StudioUpdates';
import { StoragePanel } from '../storage/StoragePanel';
import type { Session } from './useSession';
import { StackiLogo } from '../../shared/ui/StackiLogo';
import { useRef, useState } from 'react';
import Popup from '../../../vendor/stacki/src/ui/Popup';
import { RoleMenu } from '../roles/RoleMenu';
import { SoundToggle } from '../settings/SoundToggle';

export function AccountMenu({ saved, session }: { saved: boolean; session: Session | undefined }) {
  const menu = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <div className="account-menu">
      <button
        ref={menu}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="studio-brand"
        aria-label="Stacki account menu"
        title="Stacki account menu"
      >
        <StackiLogo />
      </button>
      <Popup
        mode="popover"
        portal={false}
        className="account-popover"
        open={open}
        onClose={close}
        anchor={menu.current ?? undefined}
        label="Stacki account"
      >
        <RoleMenu saved={saved} close={close} />
        <SoundToggle />
        {session?.kind === 'github' && <StudioUpdates />}
        {session?.kind === 'github' ? (
          <>
            <strong>@{session.login}</strong>
            <form method="post" action="/studio/auth/logout">
              <button
                disabled={!saved}
                title={saved ? 'Sign out of this studio' : 'Wait for your edits to finish saving'}
              >
                Sign out
              </button>
            </form>
          </>
        ) : (
          <span className="local-session">
            {session?.kind === 'local'
              ? 'Local development · no sign-in required'
              : 'Loading account…'}
          </span>
        )}
        <StoragePanel refresh={() => window.dispatchEvent(new Event('studio:assets-changed'))} />
      </Popup>
    </div>
  );
}

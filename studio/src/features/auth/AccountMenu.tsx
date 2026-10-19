import { StudioUpdates } from '../updates/StudioUpdates';
import { StoragePanel } from '../storage/StoragePanel';
import type { Session } from './useSession';
import { StackiLogo } from '../../shared/ui/StackiLogo';
import { useRef } from 'react';
import useDismiss from '../../../vendor/stacki/src/ui/useDismiss';
import { RoleMenu } from '../roles/RoleMenu';
import { SoundToggle } from '../settings/SoundToggle';

export function AccountMenu({ saved, session }: { saved: boolean; session: Session | undefined }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (menu.current) {
      menu.current.open = false;
    }
  };
  useDismiss(menu, { active: true }, close);
  return (
    <details
      className="account-menu"
      ref={menu}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && menu.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          close();
          menu.current.querySelector('summary')?.focus();
        }
      }}
    >
      <summary
        className="studio-brand"
        aria-label="Stacki account menu"
        title="Stacki account menu"
      >
        <StackiLogo />
      </summary>
      <div className="account-popover">
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
      </div>
    </details>
  );
}

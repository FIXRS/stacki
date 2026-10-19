import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDownIcon } from '../../ui/Icons';
import useDismiss from '../../ui/useDismiss';

interface WelcomeSplitButtonProps {
  readonly className: string;
  readonly label: string;
  readonly menuLabel: string;
  readonly menuTitle: string;
  readonly onClick: () => void;
  readonly onMenuSelect: () => void;
}

export default function WelcomeSplitButton(props: WelcomeSplitButtonProps) {
  const { open, setOpen, groupRef, triggerRef, itemRef } = useSplitMenu();
  const menuId = useId();
  return (
    <div
      className="welcome-split-button"
      ref={groupRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button className={props.className} onClick={props.onClick}>
        {props.label}
      </button>
      <button
        ref={triggerRef}
        className={`welcome-split-arrow ${props.className}`}
        aria-label={props.menuTitle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((previous) => !previous)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <ChevronDownIcon size={13} />
      </button>
      {open && (
        <div className="welcome-split-menu" role="menu" id={menuId}>
          <SplitMenuItem
            itemRef={itemRef}
            label={props.menuLabel}
            onSelect={() => {
              setOpen(false);
              props.onMenuSelect();
            }}
          />
        </div>
      )}
    </div>
  );
}

function SplitMenuItem({
  label,
  itemRef,
  onSelect,
}: {
  readonly label: string;
  readonly itemRef: React.RefObject<HTMLButtonElement>;
  readonly onSelect: () => void;
}) {
  return (
    <button ref={itemRef} role="menuitem" onClick={onSelect}>
      {label}
    </button>
  );
}

function useSplitMenu() {
  const [open, setOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);
  useDismiss(groupRef, { active: open }, () => setOpen(false));
  useEffect(() => {
    if (open) {
      itemRef.current?.focus();
    }
  }, [open]);
  return { open, setOpen, groupRef, triggerRef, itemRef };
}

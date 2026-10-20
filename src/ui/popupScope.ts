import { createContext, useContext, useId, useLayoutEffect, useMemo } from 'react';
import type { RefObject } from 'react';
import type { PopupProps } from './Popup';
import { registerPopupLayer } from './popupOwnership';

interface PopupScope {
  readonly root: string;
  readonly depth: number;
}
export const PopupScopeContext = createContext<PopupScope | undefined>(undefined);

export function usePopupScope(
  surface: RefObject<HTMLDivElement>,
  {
    active,
    anchor,
    role,
  }: Pick<PopupProps, 'anchor'> & {
    readonly active: boolean;
    readonly role: PopupProps['role'];
  },
): PopupScope {
  const parent = useContext(PopupScopeContext);
  const id = useId();
  const root = parent?.root ?? id;
  const depth = (parent?.depth ?? -1) + 1;
  const scope = useMemo(() => ({ root, depth }), [root, depth]);
  useLayoutEffect(() => {
    if (active && role !== 'tooltip') {
      return registerPopupLayer(surface.current ?? undefined, anchor, scope);
    }
    return undefined;
  }, [active, anchor, role, scope, surface]);
  return scope;
}

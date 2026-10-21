import type { ToastRecovery } from './errorNotices';
export const TOAST_LIMIT = 5;
export type ToastKind = 'info' | 'success' | 'error';
export interface ToastNotice {
  readonly id: string;
  readonly message: string;
  readonly kind: ToastKind;
  readonly recovery?: readonly ToastRecovery[];
}

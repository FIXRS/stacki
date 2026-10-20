import { boolean, object, record, text } from '../core/boundary';

export type DesktopPublishState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly step: string }
  | {
      readonly kind: 'done';
      readonly github: boolean;
      readonly hosting: boolean;
    }
  | {
      readonly kind: 'failed';
      readonly message: string;
      readonly github: boolean;
      readonly hosting: boolean;
    };

export function parseDesktopPublishState(input: unknown): DesktopPublishState {
  const value = record(input);
  switch (value['kind']) {
    case 'idle':
      return { kind: 'idle' };
    case 'running':
      return { kind: 'running', step: text(value['step']) };
    case 'done':
      return { kind: 'done', ...object({ github: boolean, hosting: boolean })(value) };
    case 'failed':
      return {
        kind: 'failed',
        ...object({ message: text, github: boolean, hosting: boolean })(value),
      };
    default:
      throw new Error('Invalid publish status.');
  }
}

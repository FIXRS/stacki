import { setModifiers } from '../../../vendor/stacki/src/editor/heldModifiers';

export function forwardStyleModifiers(post: (message: unknown) => void) {
  let shiftKey = false;
  let altKey = false;
  const update = (event: { readonly shiftKey: boolean; readonly altKey: boolean }) => {
    if (event.shiftKey === shiftKey && event.altKey === altKey) {
      return;
    }
    ({ shiftKey, altKey } = event);
    post({ type: 'avb:modifiers', shiftKey, altKey });
  };
  window.addEventListener('keydown', update, true);
  window.addEventListener('keyup', update, true);
  window.addEventListener('blur', () => update({ shiftKey: false, altKey: false }));
}

export function receiveStyleModifiers(input: unknown) {
  if (
    input &&
    typeof input === 'object' &&
    'type' in input &&
    input.type === 'avb:modifiers' &&
    'shiftKey' in input &&
    typeof input.shiftKey === 'boolean' &&
    'altKey' in input &&
    typeof input.altKey === 'boolean'
  ) {
    setModifiers({ shiftKey: input.shiftKey, altKey: input.altKey });
  }
}

// Selection is local UI state. Server replies still arbitrate editing ownership,
// but an older edit/selection reply must not pull the inspector back after a click.
export class SelectionIntent {
  private latest = 0;
  next() {
    return ++this.latest;
  }
  accepts(request: unknown) {
    return typeof request === 'number' && request === this.latest;
  }
}

export function selectionRequest(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

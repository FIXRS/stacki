export interface NoticeDetails {
  readonly person?: { readonly id: number | undefined; readonly name: string };
  readonly action?: { readonly label: string; readonly run: () => void | Promise<void> };
}

export class ActionableNotice extends Error {
  constructor(
    message: string,
    readonly details: NoticeDetails,
  ) {
    super(message);
  }
}

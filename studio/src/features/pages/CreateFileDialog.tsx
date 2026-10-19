import { useEffect, useRef, useState } from 'react';

interface Props {
  readonly create: (name: string, duplicate: boolean) => Promise<void>;
  readonly collection: boolean;
  readonly busy: boolean;
  readonly failure: string;
  readonly close: () => void;
}
export function CreateFileDialog({ create, collection, busy, failure, close }: Props) {
  const [name, setName] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal studio-file-dialog"
      aria-label={collection ? 'New item' : 'New Page'}
      onCancel={(event) => {
        if (busy) {
          event.preventDefault();
        }
      }}
      onClose={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void create(name.trim(), false);
        }}
      >
        <div className="modal-header">{collection ? 'New item' : 'New Page'}</div>
        <div className="modal-body">
          <label htmlFor="studio-file-name">
            {collection ? 'Item path' : 'Page name (e.g. “about” or “blog/post-1”)'}
          </label>
          <input
            id="studio-file-name"
            autoFocus
            required
            maxLength={512}
            aria-label="New file name"
            placeholder={collection ? 'posts/hello.md' : 'about'}
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          {failure && (
            <p role="alert" className="error-text">
              {failure}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void create(name.trim(), true)}
          >
            Duplicate current
          </button>
          <button className="primary" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : collection ? 'Create item' : 'Create Page'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

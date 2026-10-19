import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { SharedDocument } from '../src/features/collaboration/useDocument';
import { PublishButton } from '../src/features/publishing/PublishButton';

function TestEditor() {
  const [source, setSource] = useState('');
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    const file = new URL(location.href).searchParams.get('file') ?? 'src/pages/index.astro';
    const shared = new SharedDocument(file);
    const unsubscribe = shared.subscribe(() => {
      setSource(shared.text.toString());
      setReady(shared.ready);
    });
    const changed = () => setRevision((value) => value + 1);
    window.addEventListener('studio:project-changed', changed);
    return () => {
      unsubscribe();
      shared.close();
      window.removeEventListener('studio:project-changed', changed);
    };
  }, []);
  return (
    <main>
      <span data-testid="ready">{ready ? 'Ready' : 'Connecting'}</span>
      <pre data-testid="source">{source}</pre>
      <span data-testid="revision">{revision}</span>
      <PublishButton report={(error) => setError(String(error))} />
      <p role="alert">{error}</p>
    </main>
  );
}
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<TestEditor />);
}

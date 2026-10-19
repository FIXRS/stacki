import { useEffect, useState } from 'react';
import { readRepositories } from '../ipc/repositoryBridge';

// A manual owner/name also reaches repositories beyond the bounded recent list.
export default function RepositoryPicker(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled: boolean;
}) {
  const [repositories, setRepositories] = useState<readonly string[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    void readRepositories().then((result) => {
      if (active) {
        if (result.ok) {
          setRepositories(result.value);
        } else {
          setError(result.error);
        }
      }
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <label>Existing GitHub repository</label>
      <select
        aria-label="Recent GitHub repositories"
        value=""
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="">Choose a repository…</option>
        {repositories.map((repository) => (
          <option key={repository}>{repository}</option>
        ))}
      </select>
      <input
        aria-label="Repository owner/name"
        placeholder="owner/repository"
        maxLength={140}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {error && (
        <div className="error-text">
          {error} Install GitHub CLI and run <code>gh auth login</code>.
        </div>
      )}
    </>
  );
}

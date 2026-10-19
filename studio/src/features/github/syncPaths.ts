// Deployment configuration and the embedded CMS are deployed independently of
// the editable Astro draft. Advancing its baseline must not copy these files.
export function independentlyDeployed(file: string): boolean {
  return file.startsWith('studio/') || /^wrangler\.(jsonc?|toml)$/.test(file);
}

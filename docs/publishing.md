# Publishing from Desktop and Studio

The Publish button builds the project, saves to GitHub, and deploys to the configured host.
The attached arrow also offers **Push to GitHub only**, **Deploy to hosting only**, and
**Publish settings**. GitHub-only still builds before committing. Hosting-only never creates
a GitHub commit or advances Studio's published GitHub baseline.

Settings live in the tracked `.stacki/publish.json` file. Desktop and Studio read the same
versioned schema, and Studio includes it in its GitHub commits and incoming synchronization.
Save settings before publishing. A settings conflict requires reloading rather than overwriting
someone else's changes.

## GitHub accounts

Connect a repository from Publish settings or Desktop's branch menu. Install GitHub CLI and run `gh auth login`
once for each account. In Publish settings, choose the account to use for this project.
Stacki obtains that account's existing credential using `gh auth token --user`; it never calls
`gh auth switch` or changes global Git configuration. The credential is passed only to the
Git/GitHub child processes. A pinned account also applies to the branch menu's Push, Create,
and Connect operations. The publish repository picker uses the selected account's credential.

Without a pinned account, normal Git authentication applies, including SSH. Studio continues
to use its repository's GitHub App installation; personal Desktop credentials are never copied
to Studio or committed to the project.

## Hosting

Cloudflare Pages needs an existing Pages project, account ID, production branch, and build
output directory (usually `dist`). Install Wrangler in the site's development dependencies or
on the publishing machine. Run `wrangler login` once locally, or provide
`CLOUDFLARE_API_TOKEN` in the server environment. The account ID is explicitly supplied on every
deployment, so another project's account choice does not change this project's target.

Vercel needs an existing project ID and organization/team ID. These are available in
`.vercel/project.json` after linking. Install the Vercel CLI in the site's development dependencies
or on the publishing machine. Use `vercel login` locally or provide `VERCEL_TOKEN` on the server.
Stacki supplies `VERCEL_PROJECT_ID` and `VERCEL_ORG_ID` for every production deployment.
Vercel performs its own deployment build after Stacki's local validation build.

Hosted Studio passes the optional Worker secrets `PUBLISH_CLOUDFLARE_API_TOKEN` and
`PUBLISH_VERCEL_TOKEN` to its publishing container. Its image includes Wrangler; add Vercel
to the site's development dependencies and rebuild the Studio image when selecting Vercel.
Credentials must be provisioned independently on each machine. They do not belong in
`.stacki/publish.json`. No CLI is silently downloaded during a publish.

“GitHub only” skips Stacki's direct deploy command. If Cloudflare, Vercel, or GitHub Actions
already deploys on push, that automation still runs. Disable the provider's automatic builds
when using direct publishing to avoid duplicate deployments. Leave the provider set to
“GitHub only / existing automation” to retain an existing Git-triggered deployment.

## Advanced automation

Choose a build script and up to eight package.json scripts before and after publishing:

```json
{
  "version": 1,
  "githubAccount": "my-account",
  "hosting": {
    "provider": "cloudflare",
    "accountId": "your-account-id",
    "project": "my-site",
    "branch": "main",
    "directory": "dist"
  },
  "buildScript": "build",
  "beforePublish": ["check"],
  "afterPublish": ["search:index", "cache:purge"]
}
```

Scripts run sequentially inside the publish snapshot using `npm run`. A failed command stops
subsequent commands. After scripts run only after all selected actions succeed, including
GitHub-only and hosting-only actions. `STACKI_PUBLISH_TARGET` tells hooks which action was
selected. Use hooks for tasks such as Workers deployments, search indexing, or cache purging.
Write idempotent hooks: Studio may rebuild a snapshot when GitHub changes concurrently.
Generated source inside the temporary snapshot is not written back to the editor or GitHub.

Desktop snapshots tracked and unignored project files through a separate Git index. Ignored
files, including local `.env` files, are not automatically copied; supply build secrets through
the publishing process environment. Desktop checks the source tree again before committing and
pushes the exact built commit. If source changes during the build, publishing stops for a retry.
Studio builds its existing isolated draft snapshot while collaborators may continue editing.

Each command has a ten-minute timeout and a 1 MiB output limit. Commands run without interactive
input. GitHub and hosting are separate external operations: if hosting or an after hook fails
after a successful push, the GitHub commit remains. Inspect the reported completed actions and
use hosting-only when retrying a deployment. Publishing never force-pushes or rolls back a host.

Provider setup references: [GitHub account tokens](https://cli.github.com/manual/gh_auth_token),
[Cloudflare direct upload](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/),
and [Vercel CLI project settings](https://vercel.com/docs/cli/global-options).

## Discovering connected accounts and projects

Publish settings lists hosting projects grouped by connected account. Selecting a
Cloudflare Pages project fills its account ID, project name, production branch and build directory.
Vercel discovery groups team projects and fills both IDs. Existing `.vercel/project.json`
links can be imported even before signing in on that machine. Wrangler JSON, JSONC and TOML project
configuration is also recognized; Cloudflare supplies the actual production branch. Manual
configuration remains available for unusual layouts, restricted tokens and older CLI versions.

Install current Wrangler, Vercel CLI or GitHub CLI and sign in once on the publishing machine.
GitHub discovery lists healthy saved accounts; selecting one pins that username for this project.
Discovery never switches the globally active GitHub account or Vercel team. Hosted Studio uses the
server's provider connection; it cannot read a visitor's laptop credentials. Studio still uses its
GitHub App for publishing. This is built into Stacki; no Codex connector is required.

Provider reads are bounded to 30 seconds per request, 1 MiB per response and 500 projects across at
most twenty accounts (fifty Pages pages or five Vercel pages per account). Over-limit or unauthenticated responses show a retry/manual-setup path. Credentials
and raw provider logs are never returned through IPC or HTTP, or written into project metadata.
Wrangler's authenticated token is used only in server memory for the Cloudflare project lookup.
Vercel's [authenticated API command](https://vercel.com/docs/cli/api) and GitHub's
[account status command](https://cli.github.com/manual/gh_auth_status) reuse CLI sign-ins.

Repository settings show the current Git origin separately from the selected authentication account.
Choose another writable repository and save to change the origin. Add repo creates an empty private
repository by default; saving connects it, and Publish uploads files. No global GitHub account switch
is needed. Hosted Studio shows its deployment-managed repository without allowing it to be changed.

Refreshing connections keeps the current fields in place and shows a spinner in the header.

Cloudflare Workers use the existing Wrangler configuration and `wrangler deploy --name`, retaining
routes, bindings, and asset settings. A first-time settings panel detects root Wrangler files and
prefills their Worker name. When the file omits `account_id`, discovery checks up to five connected
accounts for a unique matching Worker. An unavailable or ambiguous account remains unselected;
saving requires choosing the Worker from its account group. Existing saved provider preferences always take precedence.

The provider picker presents Cloudflare once. Its project list includes Pages and Workers, grouped
by account, with a small deployment-type label. Choosing a project selects its account implicitly;
there is no separate hosting-account picker. Search matches both account and project names.

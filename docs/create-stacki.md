# Publishing create-stacki

`npm create stacki@latest` resolves to the `create-stacki` package. Its CLI and the desktop wizard
share the same release parser and transactional installer. The npm artifact bundles the Studio
source release so a GitHub release does not have to exist first.

## Build and inspect

Keep `packages/create-stacki/package.json` at the same version as root `package.json`.
After installing root and Studio dependencies:

```sh
npm run create-stacki:build
npm pack ./packages/create-stacki --pack-destination /tmp
```

The tarball contains only the CLI, the allowlisted Studio source bundle, license, readme, and package
manifest. The release collector excludes local `.env`, `.dev.vars`, `.studio`, `.wrangler`, project
files, and configured `cloudflare/` files. It includes unconfigured templates instead.

Test the tarball against a disposable Astro project:

```sh
npm exec --yes --package=/tmp/create-stacki-0.1.48.tgz -- create-stacki /path/to/test-site --yes
```

## First publication

The package must exist before configuring an npm trusted publisher. Sign in to the intended npm
account locally; never paste tokens or passwords into source or chat.

```sh
npm login
npm whoami
npm publish ./packages/create-stacki --access public
```

Only publish after inspecting the artifact and completing the project checks. npm versions cannot
be republished. Once published, verify from a disposable Astro project with
`npm create stacki@latest`.

## Subsequent publications

In the npm package settings, add a GitHub Actions trusted publisher:

- Organization/user: `flowtricks`
- Repository: `stacki`
- Workflow filename: `publish-create-stacki.yml`
- Allowed actions: enable direct publishing with `npm publish`.

Push the reviewed source, bump the matching versions for the next release, and manually run the
workflow from that revision. The workflow builds and checks the source and package before publishing.
It requires GitHub-hosted runners and npm 11.5.1 or later. No long-lived npm token is needed.
This workflow publishes only the npm installer; desktop releases have their own workflow.

References: [npm init](https://docs.npmjs.com/cli/v11/commands/npm-init/) and
[npm trusted publishers](https://docs.npmjs.com/trusted-publishers/).

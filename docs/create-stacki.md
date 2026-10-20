# Publishing create-stacki

For the combined Desktop and Studio release, see [release checks and recovery notes](./releases.md).

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

## Completion checks

A green `Check` workflow does not publish anything. A pushed version tag starts the Desktop
release, but `Publish create-stacki` must also be dispatched from that tag. Keep the root, Studio,
Studio release manifest, and `create-stacki` versions aligned.

Do not report that `npm create stacki@latest` is updated until the registry confirms it:

```sh
npm view create-stacki dist-tags.latest
npm exec --yes --package=create-stacki@latest -- create-stacki --version
```

Both commands must report the intended release version. Separately verify that the Desktop release
is published, not a draft, and includes the Studio bundle and every platform's update metadata.
Stay with both workflows until they finish; queued jobs and passing tests are not a live release.

## npm authentication failures

The 0.1.64 workflow passed all tests and built its package, then npm rejected the publish with
`E404` on `PUT https://registry.npmjs.org/create-stacki`. An existing package can return this error
when publishing is unauthorized. It does not mean the build failed or the package should be renamed.
Earlier workflow attempts also failed, so do not assume trusted publishing is configured merely
because the workflow exists.

Before the next automated release, check the package's npm trusted-publisher settings against the
owner, repository, workflow filename, and direct-publishing permission listed above. Do not weaken
tests, commit credentials, or repeatedly bump versions to work around an authentication error.

If the workflow cannot authenticate, a signed-in maintainer can publish the tested artifact locally:

1. Use an isolated checkout of the exact tested release tag. Other tasks may be editing the main
   working directory; their unfinished changes must not enter the package.
2. Build and inspect the package using the commands above, then install its tarball into a disposable
   Astro project to verify dependency installation, type checks, and the Studio build.
3. Run `npm whoami`, then publish that tarball with `npm publish /path/to/create-stacki-VERSION.tgz
   --access public --tag latest`.
4. Complete npm's browser sign-in/passkey confirmation when prompted. `npm whoami` succeeding does
   not guarantee publication can finish without this step. Keep the publishing process running while
   the maintainer authenticates; never ask for a password, token, or one-time code in chat.
5. Verify both registry commands above. A failed workflow may remain red even after a successful
   local publication; the registry is the source of truth for what users receive.

References: [npm init](https://docs.npmjs.com/cli/v11/commands/npm-init/) and
[npm trusted publishers](https://docs.npmjs.com/trusted-publishers/).

# Releasing Desktop, Studio, and create-stacki

These are separate publication paths. A successful `Check` run publishes nothing:

- A version tag starts `.github/workflows/release.yml`. Desktop installers, Linux install checks,
  and the Studio browser test must finish before the draft release becomes public.
- `.github/workflows/publish-create-stacki.yml` is manually dispatched from the same tested tag.
  See [create-stacki publication](./create-stacki.md) for authentication and registry verification.

Run the fast checks and complete regression suite locally before pushing. Also run Studio's
`npm run verify` and `npm run test:browser` against a disposable fixture workspace before tagging:
the Desktop regression gate does not run that separate Studio browser scenario.

Use an isolated checkout when other tasks are editing the working directory. Match the root,
Studio, Studio release manifest, and npm starter versions. Never move an existing release tag to
include later changes.

## Browser tests and animated popups

Shared popups remain mounted while their close animation runs, and consume outside clicks during
that time. After closing a popup, wait for that popup to detach before clicking another control.
Do not use an arbitrary sleep or weaken the assertion.

In the 0.1.64 release, the Studio browser scenario closed the account menu and immediately clicked
`Expand all`. The closing popup consumed that click, leaving the navigator collapsed. The test
then timed out looking for Heading, even though the component existed. Waiting for
`.account-popover` to detach fixed the scenario.

## 0.1.64 recovery record

The tested release tag points to `6903fb2825006cd79eff99bfbacae2fd51a3b38c`. All three platform
builds, Linux installation checks, and Studio's compilation, lint, formatting, and unit tests passed
in GitHub Actions. The browser scenario reproduced locally against that exact source. After the
test-only popup wait was added, the complete browser scenario passed against the same release.

The existing Desktop installers were preserved. The Studio bundle built from the tested tag was
uploaded, all platform update metadata and installer assets were verified, and the draft was
published as the latest release. No application code or published version tag was changed.

The npm workflow separately failed authentication after passing its tests and building the package.
The maintainer authenticated a local publication of the exact-tag package after a fresh installation
smoke test. The registry's package checksum matched the tested tarball, and both `dist-tags.latest`
and the downloaded CLI reported 0.1.64.

The original failed workflow runs remain red; publishing manually does not rewrite their history.
Confirm live availability through the latest GitHub release and npm registry, rather than inferring
it from workflow badges. Do not bypass an unresolved application failure to publish a draft.

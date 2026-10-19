# Desktop browser runtime

Stacki pins Electron 44.9.0, including Chromium 152. This enables modern CSS
such as `text-box`, `text-box-trim`, and `text-box-edge` inside the preview.
The authored-style regression test verifies both computed values and actual
line-box trimming in Electron, so a browser downgrade cannot silently remove it.

Electron now downloads its executable on demand. `fix:install` explicitly runs
`install-electron` during `npm ci` because Linux CI must configure Chromium's
sandbox helper before running any browser tests.

## macOS compatibility

Electron 44 requires macOS 13 or newer. The packaged application's
`minimumSystemVersion` declares `13.0.0`. Before publishing, the release workflow
adds `minimumSystemVersion: 22.0.0` to `latest-mac.yml` because electron-updater
compares Darwin kernel versions, not macOS marketing versions. Existing clients
already honor this field and keep their working installation on older systems.

The release remains a draft until this metadata upload and every platform's
build and installation checks succeed. When upgrading Electron again, review
both the macOS requirement and its matching Darwin version together.

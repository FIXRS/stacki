# create-stacki

Add Stacki Studio to an existing Astro project without installing the desktop app.
Requires Node.js 22.19.0 or newer and an Astro project using npm with a lockfile.
If the project has no npm lockfile yet, run `npm install` in it first.

From your project root:

```sh
npm create stacki@latest
```

Or pass a project directory:

```sh
npm create stacki@latest ./my-site
```

The installer asks for confirmation, installs `/studio`, checks its types, and builds it before
activating it. It does not change your website source or root package manifest. Each npm release
contains a specific Studio source release; commit `/studio` to keep that version with your project.
Installation needs internet access to download Studio's locked npm dependencies.

Start the local editor from your project root:

```sh
npm --prefix studio run dev
```

Follow `studio/docs/cloudflare.md` for hosted editing. To get a prompt for your coding agent:

```sh
npm create stacki@latest -- --agent
```

For scripts, explicitly confirm installation with:

```sh
npm create stacki@latest -- --yes
```

Existing Studio installations are detected and left untouched. Update through Studio's version
management when ready; updates replace editor customizations while retaining project configuration
and runtime state. Website source stays outside that replacement. Save customizations in Git first.

Installation uses `.stacki-studio/` for staging and locking. A failed validation keeps the staging
folder for diagnosis and does not activate Studio. It can be removed after checking the failure.
Cloudflare deployment and authentication are separate setup steps; this command does not create
cloud resources or deploy your site.

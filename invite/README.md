# Invite microsite (`/invite/[code]`)

This repo is a static site. The invite page lives at `invite/index.html` and **reads the invite code from the URL**.

To support the target URL structure:

- `https://www.kamisocial.com/invite/benji`

configure your host to rewrite:

- `/invite/*` → `/invite/index.html`

This is the standard SPA fallback pattern and is required for “dynamic routes” on static hosting.


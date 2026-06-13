# Security Policy — Olympaws

## Reporting a vulnerability

This is a personal project. If you find a security issue, please open a private
report (GitHub Security Advisory) or contact the maintainer directly rather than
filing a public issue. Expect a best-effort response.

## Security model (summary)

A full analysis lives in [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md). The
short version:

- **The app is a PWA shipped from GitHub Pages with one third-party service in
  scope: Supabase.** It uses Supabase for authentication (magic-link with OTP
  fallback), for single-document state synchronisation between the two phones
  in the household, and for Web Push delivery (via a Supabase Edge Function).
- **No secrets in the client.** The Supabase anon JWT (`SB_ANON`) embedded in
  `index.html` is the project's public anonymous key — gating access via
  Row Level Security, not via secrecy. There is no service-role key, no API
  key, and no third-party CDN script loaded.
- **Content-Security-Policy** restricts `connect-src` to the project's Supabase
  origin only. Inline scripts are limited to the served `index.html` itself;
  no third-party `<script>` can load.
- **Local-first storage.** State is held in `localStorage` and synchronised
  through Supabase. A 4-slot weekly snapshot ring buffer in `localStorage` gives
  a one-tap rollback if a sync conflict or accidental reset destroys progress.
- **Client hardening.** The app builds its DOM with `textContent` / typed
  element creation — no `innerHTML` for dynamic content. The Service Worker
  caches only same-origin GETs; cross-origin requests bypass it entirely.

The single biggest assumption: **Supabase Row Level Security is correctly
configured** on `household_state` and `push_subscriptions`. This must be
verified in the Supabase dashboard; the client code cannot prove it.

## Privacy notice

The chore data you enter (task names, schedules, completion history, the two
configured display names, the email you sign in with) is held both on your
device (in `localStorage`) and in your household's row in Supabase. It is not
shared with any other service. The maintainer does not have access to the
running Supabase project's data.

Push notification endpoints — opaque URLs the browser exposes when you tap
"Enable notifications" — are stored in Supabase so the scheduled Edge Function
can deliver reminder pushes to each phone.

## Secrets

The client doesn't carry a secret. Secret-scanning (gitleaks) runs both as a
pre-commit hook (`.githooks/pre-commit`, install with
`scripts/install-hooks.sh`) and in CI (`.github/workflows/secret-scan.yml`) as
general hygiene.

## Smoke testing

A second CI workflow (`.github/workflows/smoke.yml`) runs `scripts/smoke.js`,
which parse-checks the inline `<script>` in `index.html` and mock-runs the
IIFE through stubbed browser globals. This catches the class of bug where a
syntax error or a ReferenceError on initial render would white-screen the app.
The same script runs locally as part of the pre-commit hook so a broken commit
can't reach the remote in the first place.

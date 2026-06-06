# Security Policy — Nuestro Hogar

## Reporting a vulnerability

This is a personal project. If you find a security issue, please open a private
report (GitHub Security Advisory) or contact the maintainer directly rather than
filing a public issue. Expect a best-effort response.

## Security model (summary)

A full analysis lives in [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md). The
short version:

- **The app is fully static and offline.** It is served as static files from
  GitHub Pages and makes **zero network requests** at runtime — its
  Content-Security-Policy is `default-src 'none'`.
- **No secrets, no server, no third parties.** There is no API key, no backend
  proxy, and no external service. (The AI feature that would have required these
  was deliberately dropped — see `docs/DESIGN_NOTES.md` → D3.)
- **All data stays on your device** in the browser's `localStorage`.
- **Client hardening:** strict CSP, output encoding (no raw HTML injection), and
  a zero-dependency self-contained app (no third-party CDN scripts to trust).

## Privacy notice

**Nothing you enter ever leaves your device.** Chore names, the two configured
names, schedules, and completion history are stored only in your browser's
`localStorage`. The app makes no network calls, so there is no server — ours or
anyone else's — that receives your data.

## Secrets

The app needs none. As general hygiene, the repository still runs secret
scanning (gitleaks) in CI and as a local pre-commit hook, so no credential can be
committed by accident even though the app doesn't use one.

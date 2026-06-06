# Security Policy — Nuestro Hogar

## Reporting a vulnerability

This is a personal project. If you find a security issue, please open a private
report (GitHub Security Advisory) or contact the maintainer directly rather than
filing a public issue. Expect a best-effort response.

## Security model (summary)

A full analysis lives in [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md). The
short version:

- **The Anthropic API key is the most sensitive asset.** It is **never** shipped
  in client-side code. All AI requests go through a server-side proxy that holds
  the key as an environment secret. Static hosting (GitHub Pages) holds **no**
  secrets.
- **The three core tabs (Hoy / Semana / Historial) make no external calls.** They
  work fully offline. Only the **✨ IA** tab sends data off-device.
- **AI output is treated as untrusted.** Every action returned by the model is
  validated against a strict schema before it is applied to app state.
- **Client hardening:** Content-Security-Policy, output encoding (no raw HTML
  injection), and Subresource Integrity (SRI) with pinned versions for any CDN
  dependency.

## Privacy notice

When you use the **✨ IA** tab, the text you type **and your current task/alarm
state** (chore names, the two configured names, schedules) are sent to the
Anthropic API to generate a response. The three core tabs do not transmit any
data — everything stays in your browser's `localStorage`.

If you do not use the AI tab, no personal data ever leaves your device.

## Secrets

- API keys and other secrets live only in environment variables / the proxy's
  secret store, never in the repository.
- `.env` files are git-ignored, and commits are scanned for leaked secrets.

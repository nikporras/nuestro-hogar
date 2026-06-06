# Threat Model — Nuestro Hogar

> Status: **Current**
> Last updated: 2026-06-06
> Owner: Nicolás
> Method: STRIDE + data-flow analysis.

> **Scope decision (2026-06-06):** the AI feature was **dropped** (see
> `docs/DESIGN_NOTES.md` → D3). The app is now a **fully static, offline PWA with
> no backend, no secrets, and no external calls.** This removes the entire class
> of risk that previously dominated this document (a client-exposed API key, a
> proxy to host, third-party data sharing). What remains is a small client-side
> surface.

---

## 1. What the app is now

A two-person household-chore PWA served as static files (GitHub Pages). All data
lives in the browser's `localStorage`. The app makes **zero network requests** at
runtime — its Content-Security-Policy is `default-src 'none'`, so nothing can be
fetched or exfiltrated even if a bug tried to.

There is **no API key, no server, no proxy, and no third party** in the picture.

---

## 2. Assets (what we protect, ranked)

| # | Asset | Sensitivity | Why it matters |
|---|-------|-------------|----------------|
| A1 | Client integrity (the served HTML/JS/SW) | High | Tampering here is the only way to subvert a static app. |
| A2 | Deployment pipeline & repo | High | CI/CD or repo compromise = altered code shipped to the device. |
| A3 | User task data + names (`chores`, `names`, `doneLog`, `alarms`) | Low | Personal but low-stakes; stays on-device, never transmitted. |

There is no high-value secret asset anymore — that's the whole point of dropping
the AI.

---

## 3. Trust boundaries & data flow

```
[ User device / browser ]
   |  (1) static assets over HTTPS, once
   v
[ GitHub Pages (static, NO secrets) ]
```

That's the entire diagram. After load, the app runs entirely on-device:

- **B1 — Browser ↔ static host:** public assets; holds no secret. HTTPS-only (Pages-provided).
- **B2 — localStorage:** readable by any JS on the origin; only as safe as our XSS posture.

There is no app↔AI boundary and no browser↔proxy boundary — both were deleted
with the AI feature.

---

## 4. STRIDE analysis

### Spoofing
- Not applicable in a meaningful way — there is no auth, no server, and no
  identity to spoof. The app is single-device and local.

### Tampering
- **T1** — Modified client assets (MITM, compromised CDN). *Mitigation:* HTTPS;
  the app has **no third-party CDN** (zero-dependency, self-contained `index.html`),
  so there is no external script to tamper with or to need SRI for.
- **T2** — Service Worker cache poisoning. *Mitigation:* versioned cache, tight
  scope, same-origin GETs only (see `sw.js`).

### Repudiation
- Not applicable — single-user-device app, no shared server state, no audit need.

### Information disclosure
- **I1** — Privacy. **Nothing leaves the device.** With no AI and CSP
  `default-src 'none'`, there is no network path for data to escape. localStorage
  data is unencrypted on-device (accepted — see §6).

### Denial of service
- Not applicable — no server or quota to exhaust; the app is local.

### Elevation of privilege
- **E1 — XSS** via user-entered task names rendered unsafely. *Mitigation:* the
  app builds the DOM with `textContent` / typed element creation (no
  `innerHTML`/`dangerouslySetInnerHTML` for dynamic content), and **CSP
  `default-src 'none'`** means even a successful injection has nowhere to send
  data and no external script to load. This is the one residual surface worth
  staying disciplined about.

---

## 5. Control summary (prioritized)

| Priority | Control | Addresses |
|----------|---------|-----------|
| P1 | **CSP `default-src 'none'`** — no network, no external scripts | I1, E1 |
| P1 | Output encoding / no raw HTML injection for dynamic content | E1 |
| P1 | Service Worker: scoped, versioned cache, same-origin GET only | T2 |
| P2 | HTTPS delivery (GitHub Pages default) | T1 |
| P2 | Secret-scanning in CI + pre-commit (general hygiene) | A2 |

Secret-scanning is kept as cheap, general repo hygiene — not because the app has
a secret, but because it's good insurance against one ever being committed by
accident.

---

## 6. Residual risks / accepted

- **localStorage is unencrypted on-device** — accepted, given Low sensitivity (A3)
  and a single-user-device model.
- **No user authentication on a public Pages URL** — accepted, because the URL
  serves only static code; all *data* is device-local and never uploaded.

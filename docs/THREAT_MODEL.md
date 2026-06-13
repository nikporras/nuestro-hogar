# Threat Model — Olympaws (formerly Nuestro Hogar)

> Status: **Current**
> Last updated: 2026-06-13
> Owner: Nicolás
> Method: STRIDE + data-flow analysis.

> **Scope change (2026-06-13):** the app is no longer the static, offline-only
> PWA the previous version of this document described. It now has:
> 1. **Supabase Auth** (magic-link with OTP fallback) — accounts identified by
>    email.
> 2. **Single-document cloud sync** — the whole household state lives in a
>    Supabase `household_state` row, pulled every 10s while visible and pushed
>    debounced after writes.
> 3. **Web Push** — each phone subscribes to a Supabase-managed push channel
>    (endpoints stored in a `push_subscriptions` table). An Edge Function (out
>    of this repo) delivers reminder pushes.
>
> The previous document described an app with `default-src 'none'` and zero
> network calls. That is no longer accurate. This rewrite supersedes it.

---

## 1. What the app is now

A two-person household-chore PWA shipped from GitHub Pages. The browser still
holds the working state in `localStorage`, but the same state is synchronised
to Supabase so the two phones see each other's changes. Notifications fire via
Web Push initiated by a Supabase Edge Function.

There is **one third-party service in scope: Supabase**. The trust boundary is
Supabase's Row Level Security on the two relevant tables.

---

## 2. Assets (what we protect, ranked)

| # | Asset | Sensitivity | Why it matters |
|---|-------|-------------|----------------|
| A1 | Client integrity (the served HTML/JS/SW) | High | Tampering here is the only way to subvert a static app. |
| A2 | Deployment pipeline & repo | High | CI/CD or repo compromise = altered code shipped to the device. |
| A3 | User chore data + names (`chores`, `names`, `occurrences`, `doneLog`, `balances`, `badges`, `streaks`, `reminders`) | Low–Medium | Personal but low-stakes; lives both on-device and in Supabase. |
| A4 | Supabase access tokens (`access_token`, `refresh_token`) | Medium | If exfiltrated, an attacker can read & overwrite this household's row until tokens expire. |
| A5 | Push subscription endpoints | Low | Per-device URLs that can receive arbitrary notifications until the subscription is revoked. |

The Supabase **anon JWT** baked into the client (`SB_ANON`) is **not a secret** —
it's the public anonymous key meant to be embedded, gating access via RLS only.

---

## 3. Trust boundaries & data flow

```
[ User device / browser (PWA) ]
   |  (1) static assets over HTTPS, once
   v
[ GitHub Pages — static, no secrets ]

   |  (2) auth + sync + push subscription
   v
[ Supabase project (3rd party) ]
   - GoTrue Auth        (magic-link / OTP)
   - REST: household_state, push_subscriptions
   - Edge Function: reminder push scheduler
```

In-browser the app makes calls to **only one origin** outside its own:
`https://<project>.supabase.co`. This is enforced by the CSP `connect-src`
allowlist in `index.html`.

---

## 4. STRIDE analysis

### Spoofing
- **S1** — Impersonating another user. *Mitigation:* identity is "whoever
  controls the email inbox" (Supabase Auth magic-link). Accepted; this is
  standard for password-less auth.

### Tampering
- **T1** — Modified client assets (MITM, compromised CDN). *Mitigation:* HTTPS;
  no third-party CDN scripts loaded (zero-dependency single-file app).
- **T2** — Service Worker cache poisoning. *Mitigation:* versioned cache name,
  same-origin GETs only, cross-origin requests bypass the SW entirely (see
  `sw.js`).
- **T3** — Tampering with the synced doc by another household. *Mitigation:*
  Supabase Row Level Security on `household_state`. **This must be verified in
  the Supabase dashboard** — RLS policy bugs here are the single biggest
  unknown in this model.

### Repudiation
- Not addressed. With one household and two trusted users, audit logging is
  out of scope.

### Information disclosure
- **I1** — Sync doc readable by an unauthorised user. *Mitigation:* RLS policies
  scoped to `auth.uid()`/email. Verify these are in place; without them, the
  anon key + endpoint URL are enough to read the row.
- **I2** — Push endpoints readable by an unauthorised user. Same RLS dependency.
- **I3** — Email is the user identifier. Accepted; standard for Auth.
- **I4** — localStorage / device theft. Unencrypted on-device; accepted given A3
  sensitivity. Both halves of a stolen-phone scenario (Supabase tokens + local
  state) yield equal access.

### Denial of service
- Not applicable in a meaningful way — Supabase rate-limits per project, but
  the app has a two-user audience.

### Elevation of privilege
- **E1 — XSS** via user-entered task names rendered unsafely. *Mitigation:* the
  DOM is built with `textContent` / typed element creation (no `innerHTML`
  for dynamic content); CSP forbids loading any external script. A successful
  injection has nowhere to exfiltrate to except Supabase (in scope per CSP).
- **E2 — Sync conflicts (last-write-wins).** Not a security issue per se but a
  silent-data-loss vector. Accepted with the two-user audience.

---

## 5. Control summary (prioritized)

| Priority | Control | Addresses |
|----------|---------|-----------|
| P1 | **Supabase RLS on `household_state` and `push_subscriptions`** scoped to authenticated user | T3, I1, I2 |
| P1 | CSP — `connect-src` allowlists ONLY the project's Supabase origin | T1, E1 |
| P1 | Output encoding / no raw HTML injection for dynamic content | E1 |
| P1 | Service Worker: scoped, versioned cache, same-origin GET only, cross-origin requests bypass | T2 |
| P2 | HTTPS delivery (GitHub Pages default) | T1 |
| P2 | Secret-scanning in CI + pre-commit (gitleaks) | A2 |
| P2 | Smoke test in CI + pre-commit (parse + mock-run of inline `<script>`) | A1 |
| P3 | Refresh-token rotation (Supabase default) | A4 |
| P3 | Versioned local backups (`takeWeeklySnapshot`, 4-slot ring buffer) — rollback if a sync conflict or accidental Reset destroys state | data-loss recovery |

---

## 6. Residual risks / accepted

- **RLS verification is out-of-band.** The single largest assumption in this
  model is "Supabase RLS is correctly configured." This document cannot prove
  it — the dashboard can. Re-verify when adding any new table.
- **localStorage + sync doc are unencrypted at rest** — accepted given A3.
- **Single-document, last-write-wins sync** — silent data loss possible if both
  users edit the same field simultaneously. Mitigated socially (two users).
- **Push notification endpoints are stored server-side.** If an attacker
  obtains a row, they can send any notification to that device until the
  subscription is revoked (browser-side). Low impact (text content only;
  same-origin click-through).
- **Magic-link email is the trust root.** Anyone with email-inbox access is the
  user.

---

## 7. Items to re-check on every material change

- Adding any new Supabase table → verify RLS policies before merging.
- Changing the CSP `connect-src` → re-justify the new origin.
- Adding a third-party CDN script → reintroduces T1 surface; document.
- Schema bumps on the synced doc → migration paths so older clients don't blow
  away progress (see `applyDoc` defensively-typed reads).

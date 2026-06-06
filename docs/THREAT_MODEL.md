# Threat Model — Nuestro Hogar

> Status: **Draft / pre-implementation**
> Last updated: 2026-06-06
> Owner: Nicolás
> Method: STRIDE + data-flow analysis, scoped to the deployed PWA (not the Claude artifact sandbox).

This document is written **before** feature code so the architecture is shaped
by it, rather than retrofitted. It is a living document — update it whenever a
new data flow, dependency, or trust boundary is introduced.

---

## 1. Scope & purpose

"Nuestro Hogar" is a two-person household-chore PWA with an optional AI tab that
talks to the Anthropic API. The app is intended for **GitHub Pages** (static
hosting) and stores data in **localStorage**.

The original design doc assumes the browser calls the Anthropic API directly,
with auth "handled by the Claude artifact." **That assumption does not hold
outside the artifact sandbox** and is the origin of this model's top risk.

---

## 2. Assets (what we protect, ranked)

| # | Asset | Sensitivity | Why it matters |
|---|-------|-------------|----------------|
| A1 | **Anthropic API key** | **Critical** | A leaked key allows unauthorized spend and account abuse under the owner's identity. |
| A2 | AI proxy availability / quota | High | An open or unthrottled proxy can be drained, causing cost + denial of service. |
| A3 | Deployment pipeline & repo secrets | High | CI/CD compromise = arbitrary code shipped to users. |
| A4 | User task data + names (`chores`, `names`, `doneLog`, `alarms`) | Low–Medium | Personal but low-stakes; privacy matters, financial/identity impact is minimal. |
| A5 | Client integrity (served JS/HTML/SW) | High | Tampering here undermines every other control. |

The **API key (A1) is the crown jewel.** Most controls below exist to protect it.

---

## 3. Trust boundaries & data flow

```
[ User device / browser ]
   |  (1) static assets over HTTPS
   v
[ GitHub Pages (static, NO secrets) ]  --- trust boundary ---
   |  (2) AI request (user text + app state)
   v
[ Proxy: serverless function ]  <-- holds API key (A1)
   |  (3) server-to-server, key attached
   v
[ Anthropic API ]
```

Key boundaries:
- **B1 — Browser ↔ static host:** anything served here is public; it can hold **no** secret.
- **B2 — Browser ↔ proxy:** the only place client input crosses into trusted code. Validate, authenticate-by-origin, and rate-limit here.
- **B3 — App ↔ AI output:** the model's JSON response is **untrusted input** to the app. `applyActions` sits on this boundary.
- **B4 — localStorage:** readable by any JS on the origin; only as safe as our XSS posture.

---

## 4. STRIDE analysis

### Spoofing
- **S1** — Forged requests to the proxy impersonating the app.
  *Mitigation:* strict CORS allow-list (own origin only), optional shared app token; never rely on CORS alone for authz.

### Tampering
- **T1** — Modified client assets (MITM, compromised CDN). *Mitigation:* HTTPS (Pages-provided), **SRI hashes** + pinned versions on all CDN `<script>`/`<link>`.
- **T2** — Malicious AI action mutating state unexpectedly (e.g. `delete` by *partial name* nuking the wrong chore). *Mitigation:* strict schema validation + exact-id/confirmation before destructive actions (see §5, B3).
- **T3** — Service Worker cache poisoning. *Mitigation:* versioned cache, tight SW scope, never cache proxy/API responses, validate push payloads.

### Repudiation
- **R1** — No audit trail of AI-driven changes. *Low priority* for a 2-person app; consider a local change log if disputes arise.

### Information disclosure
- **I1 — API key exposure (the headline risk).** Direct browser→Anthropic calls require shipping the key client-side → trivially extractable. *Mitigation:* **never** put the key in client code; move all AI calls behind the proxy (A1/B2).
- **I2** — Secret leaked via commit. *Mitigation:* `.gitignore` for `.env`, gitleaks pre-commit + CI, no keys in repo ever.
- **I3** — Privacy: task data + names are sent to Anthropic when the AI tab is used. *Mitigation:* disclose in `SECURITY.md`/privacy note; keep the 3 core tabs fully functional with **no** external calls.

### Denial of service
- **D1** — Proxy/key drained by abuse or runaway client. *Mitigation:* per-IP rate limiting, daily spend/request cap, server-enforced `max_tokens` and model (client cannot override), request-size limits.

### Elevation of privilege
- **E1 — XSS** via user-entered task names or AI `message` text rendered unsafely (esp. the vanilla-JS `index.html` build). *Mitigation:* output-encode everything; no `innerHTML`/`dangerouslySetInnerHTML` for dynamic content; **CSP** with locked `connect-src`/`script-src`.
- **E2** — Prompt injection steering the model into unwanted actions. *Mitigation:* sanitize user text entering the system prompt; constrain effects to the six known action types; schema-gate all actions before applying.

---

## 5. Control summary (prioritized)

| Priority | Control | Addresses |
|----------|---------|-----------|
| P0 | No secret in client; **serverless proxy** holds the key | I1, A1 |
| P0 | Proxy: CORS allow-list + rate limit + spend cap + server-set model/max_tokens | S1, D1, A2 |
| P0 | Secret hygiene: `.gitignore` `.env`, gitleaks pre-commit + CI | I2 |
| P1 | Strict schema validation of AI actions; no partial-match deletes without confirm | T2, E2, B3 |
| P1 | **CSP** + output encoding; no raw HTML injection | E1 |
| P1 | **SRI** + pinned CDN versions | T1 |
| P2 | Service Worker: scoped, versioned cache, no caching of AI responses | T3 |
| P2 | Privacy disclosure for AI-tab data sharing | I3 |

---

## 6. Build-order implication

Because only the **AI tab** touches a secret, the safe sequencing is:

1. **Phase 1 — static, secret-free frontend** (Hoy / Semana / Historial). Zero external calls, fully offline-capable, shippable to Pages immediately. Risk surface: E1, T1, T3, B4 only.
2. **Phase 2 — AI tab + proxy**, with P0/P1 controls built in from the first commit, never bolted on.

---

## 7. Residual risks / accepted

- localStorage data is unencrypted on-device — **accepted** given Low–Medium sensitivity (A4) and no multi-tenant boundary.
- No user authentication on a public Pages URL — **accepted** because data is device-local; revisit if any server-side persistence is added.
- Reliance on a third-party CDN for React — mitigated by SRI but not eliminated; revisit if self-hosting becomes feasible.

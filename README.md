# 🏠 Nuestro Hogar

A two-person household-chore PWA (installable on Android/iOS, works offline),
with an optional AI assistant. Built security-first: the core app ships **zero
secrets** and makes **zero external calls**.

## Status

| Phase | Scope | State |
|-------|-------|-------|
| **Phase 1** | Static, secret-free app: `Hoy` · `Semana` · `Mes` · `Logros` + installable PWA | ✅ Done |
| **Phase 2** | `IA` tab via a serverless proxy that holds the Anthropic key | ⏳ Planned |

The `IA` tab is currently a placeholder — see [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md)
for why the AI feature requires a backend proxy and cannot ship the key in the
browser.

## Features (Phase 1)

- **Hoy / Semana / Mes** — the same schedule at three zoom levels (day → week →
  month). A single `isDue(chore, date)` function drives all three, so a chore's
  frequency and its schedule can never contradict each other.
- **Logros** — two-person comparison from the local completion log: % per person,
  🏆/🤝 badge, and a day-by-day breakdown.
- **Frequencies** — Diario, Semanal (per-weekday), Quincenal (every 2 weeks from
  an anchor date), Mensual (a day of the month).
- **Offline-first PWA** — installable, works with no connection, data stored in
  `localStorage` on the device.

## Run locally

It's a static site. Because the Service Worker only registers over `http(s)`,
serve it rather than opening the file directly:

```bash
# any static server works, e.g.
npx serve .
# or
python3 -m http.server 8080
```

Then open the printed URL. (Opening `index.html` straight from disk also works —
the app runs, only the Service Worker is skipped.)

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: _Deploy from a branch_.**
3. Select your branch and the **`/ (root)`** folder, then **Save**.
4. Wait for the green deployment, then open `https://<user>.github.io/<repo>/`.
5. On a phone: open that URL in Chrome/Safari → **Add to Home Screen** to install.

> GitHub Pages serves over HTTPS, which the Service Worker and PWA install
> require — no extra config needed.

## Regenerate icons

The app icons are generated with a dependency-free Node script:

```bash
node scripts/generate-icons.js   # writes icons/icon-192.png and icon-512.png
```

## Security

See [`SECURITY.md`](SECURITY.md) and [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).
Highlights: no secret ever lives in client code, the AI tab will sit behind a
rate-limited proxy, and CI scans every push for leaked secrets.

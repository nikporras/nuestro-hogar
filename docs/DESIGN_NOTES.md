# Design Notes — Nuestro Hogar

> Decisions agreed during planning. Supersedes parts of the original context
> doc (`NuestroHogarClaudeCode.docx`) where they differ.

---

## D1 — Navigation: three time zoom-levels + comparison

The original design had overlapping concepts ("Hoy" vs "Semana" views, plus a
`freq` label *and* a `days[]` schedule that could contradict each other). We
collapse this to a single, non-redundant model:

**Tabs:** `Hoy` · `Semana` · `Mes` · `Logros`  _(the `IA` tab was dropped — see D3)_

- `Hoy`, `Semana`, `Mes` are **the same data at three zoom levels** (day → week →
  month), not independent feature sets.
- The old **`Historial`** tab's *month-overview* role is subsumed by `Mes`. Its
  other role — the two-person **"who completed more" comparison** — moves to its
  own dedicated tab, **`Logros`** (working name; the trophy/ranking view).

| Tab | Shows |
|-----|-------|
| Hoy | Tasks due **today**. |
| Semana | The current week, day-by-day; which tasks fall on each day. |
| Mes | The current month overview; which tasks fall on each day / this month. |
| Logros | Two-person comparison from `doneLog`: % completed per person, trophy / tie badge, day-by-day breakdown. (Pure local data, no scheduling logic.) |

A daily task naturally appears in all three views; a monthly task appears in
`Mes`, and in `Semana`/`Hoy` only on its due day. There is no "Today vs Week"
duplication — `Hoy` is just `Semana` zoomed to one day.

## D2 — One scheduling field (single source of truth)

`freq` and `days[]` will **not** coexist as two competing "when" definitions.
There is **one** recurrence definition per chore, and one function derives
everything:

```
isDue(chore, date) -> bool      // the ONLY thing that decides if a task shows
```

Each view is built purely from `isDue`:
- `Hoy`   = `isDue(chore, today)`
- `Semana`= for each day in the current week: `isDue(chore, day)`
- `Mes`   = for each day in the current month: `isDue(chore, day)`

### Recurrence model

`freq` stays as the source of truth, with the **minimal anchor each frequency
actually needs** so every frequency "works as intended":

| `freq` | Anchor field(s) | Meaning |
|--------|-----------------|---------|
| `Diario` | — | Every day. |
| `Semanal` | `weekdays: number[]` (0=Dom…6=Sáb) | Those weekdays, every week. |
| `Quincenal` | `startDate` | Every 2 weeks from the anchor date. |
| `Mensual` | `dayOfMonth: number` (or `startDate`) | That day each month. |

This fixes the latent bug in the original doc: `days[]` (weekday-only) **cannot**
express `Quincenal`/`Mensual`, so those frequencies need a date anchor. With this
model they schedule correctly instead of silently behaving like weekly tasks.

### Resolved
- The two-person "who completed more" comparison is **kept**, in its own
  dedicated `Logros` tab (decided 2026-06-06). It reads from `doneLog` and
  contains no scheduling logic, so it does not affect the `isDue` model.

---

---

## D3 — Drop the AI feature entirely

Decided 2026-06-06. The original concept centered an "✨ IA" tab that called an
LLM. We removed it.

**Rationale.** The four core tabs already deliver the whole product. The AI tab
was the *only* thing that would have required:

- a backend proxy to host (a static site can't hold a secret);
- an API key to protect, rotate, and never leak;
- ongoing cost / rate-limit / abuse exposure;
- sending chore data + names to a third party (a privacy regression).

For two people and a handful of recurring chores — set up once via the add/edit
modal — that is a large amount of cost, attack surface, and maintenance for a
few seconds of occasional convenience. Dropping it keeps the app a **pure static,
offline, secret-free PWA**, which collapses almost the entire threat model.

A lightweight **on-device natural-language parser** (no LLM, no network) was
considered as a middle ground and left on the shelf; it could be added later
without reintroducing any backend or secret if the "just type it" UX is wanted.

## Impact on the threat model
`isDue` is pure/local, and `Logros` reads only local `doneLog` data. With the AI
removed, **all four tabs make zero external calls** and the app holds no secret.
The CSP is `default-src 'none'` — there is no network path at all. See
`docs/THREAT_MODEL.md` (rewritten to match this reality).

# Design Notes — Nuestro Hogar

> Decisions agreed during planning. Supersedes parts of the original context
> doc (`NuestroHogarClaudeCode.docx`) where they differ.

---

## D1 — Navigation: three time zoom-levels + AI

The original design had overlapping concepts ("Hoy" vs "Semana" views, plus a
`freq` label *and* a `days[]` schedule that could contradict each other). We
collapse this to a single, non-redundant model:

**Tabs:** `Hoy` · `Semana` · `Mes` · `IA`

- `Hoy`, `Semana`, `Mes` are **the same data at three zoom levels** (day → week →
  month), not independent feature sets.
- The old **`Historial`** tab is **removed**; the month view subsumes the
  "overview" role. (The who-did-more comparison can live inside `Mes` if we still
  want it — open question, see below.)

| Tab | Shows |
|-----|-------|
| Hoy | Tasks due **today**. |
| Semana | The current week, day-by-day; which tasks fall on each day. |
| Mes | The current month overview; which tasks fall on each day / this month. |
| IA | Natural-language management (Phase 2, behind the proxy). |

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

### Open question
- Keep the two-person "who completed more" comparison? If yes, it folds into the
  `Mes` view (no separate history tab). If not, drop it entirely.

---

## Impact on the threat model
No new trust boundaries. `isDue` is pure/local; the three core tabs still make
**zero** external calls (Phase 1 stays secret-free). Only `IA` crosses the proxy
boundary in Phase 2.

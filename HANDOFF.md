# Olympaws — Handoff for New Chat

> **Status:** mid-redesign. Wizard works (v88 currently shipped). About to rip it out and replace with a three-surface model. **Pick up at the section "Where we left off" below.**

---

## Where we left off

We were finalising a UX redesign that replaces the modal Wizard. Final picture: **three surfaces, each with one clear job.**

### 1. Task editor (recurring definition)
Lives in **Tasks tab → tap a chore template**.

- Name, icon, effort, schedule (weekdays / anchor / day-of-month), **fixed-assignee toggle**, linked-after, delete
- **No** date, **no** assignee-for-today, **no** skip
- Lists "Used this week: Tue 9 Jun · Caro" type info as read-only so you can navigate to the occurrence

### 2. Occurrence sheet (one instance)
Lives in **Today / Week / Month → tap any chore card**.

- Header: chore name + date (e.g. "Vacuum · Tue 9 Jun")
- ✓ Mark done / ↺ Undo done
- Assignee: **Nico / Caro / Anyone** (changes just this date)
- Move day: 7-day picker within that week
- × Skip this day (tombstone)
- Footer link: "Edit the task →" → opens the Task editor (above)

### 3. Planning sheet (bulk-assign one week)
Lives in **Tasks tab → top of screen → 🔀 Plan this week** (and a sibling **Plan next week** chip that appears once this week is fully assigned).

- **Header:** live workload split — `Nico 8 pt | Caro 10 pt` updating as rows change
- **This / Next** toggle if both weeks are in scope
- **Rows:** every chore due that week (one per natural-due date — Mon+Thu chore = two rows). Each row stays visible regardless of state (no disappearing). Each row has: day-picker + Nico / Caro / Anyone + ×.
- Save on each tap (no Save button). **Close** button at the bottom.
- Default assignee per row: **carry forward last week's choice**; if first time or after Start fresh / Wipe all progress, default to **Anyone**.

### Side effects of this redesign

- Wizard modal + auto-balance go away entirely (rip out `openWizard`, `modalWizard`, `autoBalanceWizard`, `cascadeWizardDate`, `saveWizard`, `wizardDraft`).
- `ensureOccurrences` stops auto-fill of next-period unassigned slots. The Planning sheet is the **only** thing that writes pinned occurrences.
- **Calendar shows only what's been explicitly assigned.** No infinite forward, no ghost cards. Beyond a planned week is blank.
- Roll-over: when Monday rolls, "next week" becomes "this week" and a fresh empty "Plan next week" chip appears.

### Confirmed decisions

- ✅ Tasks tab is the entry point for the Planning sheet (not Week tab)
- ✅ Week tab stays read-only — a view of the assigned plan
- ✅ Multi-day chores (Mon+Thu) get **two separate rows** in the Planning sheet
- ✅ Today screen unchanged — tapping a card now opens the Occurrence sheet instead of cycling assignee
- ✅ Live save (no Save button); Close at the bottom
- ✅ Carry-forward default assignee (Anyone on first time / after reset)
- ✅ Three surfaces with one clear job each

### Open questions to confirm before coding

- For roll-over: does the prior week's planned state stay visible in some "history" view, or does it just become "the past" (still visible on Today / Week / Month for those past days, but no special UI)?
- The cats (Atena / Thor / Rum) and their popup phrases — keep as is (badge / redemption / Purr-milestone). User confirmed phrases should be in-character. **Note: user reported that phrases didn't show up — verified the code is correct on v88, the user was on a stale PWA cache. Tell them to force-close the app and reopen.**

---

## Project overview

**Olympaws** is a private 2-person household chores PWA (Nico & Caro). Web app, no build step, single `index.html` (~3000 lines of vanilla ES5) + `sw.js` + `manifest.json`. Backed by Supabase for cross-device sync.

### Tech
- Plain `<script>` block in `index.html`. Tiny `h(tag, attrs, ...children)` DOM helper. Full re-render on every state change.
- State lives on a global `S` object; persisted to localStorage AND synced to a single Supabase `household_state` jsonb row.
- Auth: Supabase magic-link with 6-digit OTP fallback (iOS PWA can't deep-link magic links).
- PWA: `manifest.json` for install, `sw.js` for offline + push notifications. Cache version bumped on every change (currently **v88**).
- Push notifications via Supabase Edge Function + Gmail SMTP / Resend.

### Files
- `/home/user/nuestro-hogar/index.html` — the whole app
- `/home/user/nuestro-hogar/sw.js` — service worker (cache version + push handler)
- `/home/user/nuestro-hogar/manifest.json` — PWA manifest
- `/home/user/nuestro-hogar/icons/` — app icons + cat avatars (Atena, Thor, Rum)

### Branch
- All development on `claude/eloquent-ramanujan-wSWVf`, merged to `main` after each commit.
- Repo: `nikporras/nuestro-hogar`

---

## Architecture & key concepts

### State (`S` object)
Loaded from localStorage on startup, synced to Supabase. Top-level keys:

| Key | Purpose |
|-----|---------|
| `chores` | Chore templates (the "mother" definitions). Each has `id`, `name`, `icon`, `effort`, `assignee` (default), `freq`, `weekdays`, `startDate`, `dayOfMonth`, `linkedAfter`, `pinned`, `schedule` |
| `names` | `["Nico", "Caro"]` |
| `doneLog` | Legacy + current per-completion log keyed `"<choreId>_<YYYY-MM-DD>"` → `0` or `1` (assignee idx) |
| `occurrences` | Per-occurrence records keyed `"<choreId>_<YYYY-MM-DD>"` → `{ assignee, done, doneAt, pinned }` OR `{ tombstone: true }` |
| `reminders` | Per-task time-based reminders for push notifications |
| `balances` | `[NicoPurrs, CaroPurrs]` |
| `rewards` | Reward catalog (user-defined, name + cost + createdAt) |
| `redemptions` | Ledger of redeemed rewards |
| `badges` | `{badgeId: unlockedAt-ISO}` — 50 defined badges |
| `maxStreaks` | `[NicoMax, CaroMax]` — streak personal bests |
| `badgeBaselineDate` / `badgeBaselineAt` | Cutoff used to filter stats since the last `resetBadgeProgress` |
| `badgeBaselineBalances` | Balance snapshot at baseline so `maxBalance` is incremental |
| `scheduleClearedAt` | **Persistent** timestamp of last "Start fresh" — used by calendar to hide pre-clear grey history dots |
| `suppressInitialMaterialisation` | **Boolean gate** set by Start fresh, cleared on first wizard save. While true, `ensureOccurrences` skips default materialisation for dates ≥ clearedYmd |
| `rumMilestonesHit` | `{"0":[], "1":[]}` — which Purr milestones (`[10, 25, 50, 100, 250, 500, 1000]`) each person has crossed (so Rum doesn't refire on undo+redo or sync) |
| `badgeStats` | Cached, incrementally maintained via `recordEvent`. `invalidateBadgeStats()` nulls it so next `computeBadgeStats` rebuilds via `buildBadgeStats` |

### Discriminated-union schedule
Every consumer reads `getSchedule(c)` instead of the legacy fields:
- `{kind: "daily", days: [0,1,...,6] | null}` — daily, optionally restricted to weekdays
- `{kind: "weekly", days: [0,...,6]}` — recurring on those weekdays
- `{kind: "biweekly", anchor: "YYYY-MM-DD"}` — every 14 days from anchor
- `{kind: "monthly_cycle", anchor: "YYYY-MM-DD"}` — every 28 days
- `{kind: "monthly_dom", dayOfMonth: 1..31}` — calendar-month day-of-month
- `{kind: "after", parentId, days}` — N days after a parent chore is due

Every switch on `sch.kind` covers all six. Adding a new kind = touching `getSchedule` + each consumer's switch.

### Periods (current + next)
`periodRangeFor(c, when)` / `periodRanges(c)` return:
- **daily / weekly:** Mon-Sun of the week containing `when`
- **biweekly:** 14-day cycle starting at anchor
- **monthly_cycle:** 28-day cycle from anchor
- **monthly_dom:** calendar month
- **after:** parent's period shifted by N days

Two-period materialisation = each chore should have its current-period assignments + next-period unassigned slots visible. **This goes away in the redesign** — the Planning sheet becomes the only writer; nothing is auto-materialised beyond what the user planned.

### Per-occurrence model
`S.occurrences` is the source of truth for what's planned. Records are either:
- `{assignee, done, doneAt, pinned}` — real occurrence (a wizard pin, an auto-fill null, or a doneLog re-materialisation)
- `{tombstone: true}` — user said "this date doesn't happen" (skip × or wizard moved away)

Helpers:
- `occKey(choreId, date)` → `"id_YYYY-MM-DD"`
- `occ(ch, date)` → record or undefined
- `isDone(ch, date)` → reads `o.done` or falls back to `doneLog`
- `occAssignee(ch, date)` → reads `o.assignee`, falls back to doneLog or `c.assignee`
- `isDueDepth(c, d, depth)` — template-due check, honouring tombstones (cascades for "after" chores). **Tombstones suppress at every depth.**
- `isDue(c, d)` — convenience wrapper, depth=0
- `showsOnDay(c, d)` — combines: tombstone? no. occurrence? yes. doneLog hit? yes (history visibility). Then a "materialisation window" cap: only template-fallback for `[startOfWeek(TODAY)-7, ranges.next.end]`. Beyond that = no card.

### Service worker
`sw.js` versioned by `CACHE` constant. Cache-first for static assets, network-first for navigation. On install, `addAll(SHELL)` + `skipWaiting()`. On activate, purge old caches + `clients.claim()`. Push handler shows notifications with the household icon.

**To force a PWA update:** swipe the app out of recents (don't just background) and reopen. The SW updates on a real navigation request.

### Sync
- `pushState(immediate)` → debounced 1.2 s → `pushNow()` → PATCH the `household_state` row
- `pullState()` runs every 10 s while visible, on visibility-changed, and on online events. If `remoteAt > lastSyncedAt`, applies the remote doc.
- `applyDoc(d)` merges fields onto `S`, invalidates badge stats, regenerates per-occurrence data from `plannedWeeks` if a phone on the old build pushed.

---

## Recent commit history (most recent first)

| SW | SHA | Title |
|----|-----|-------|
| v88 | `1bc84b9` | Cat popups: give each cat their own voice (Atena/Thor/Rum phrase pools) |
| v87 | `391722d` | Rum popups on Purr-balance milestones `[10, 25, 50, 100, 250, 500, 1000]` |
| v86 | `5ff7825` | Cat popups: Atena for badge unlocks, Thor for redemptions |
| v85 | `72d8891` | Badges: use precise `badgeBaselineAt` for reward/redemption filter |
| v84 | `fa0d8ee` | Wizard: clear beyond-week pins on save so points stop inflating |
| v83 | `239d563` | Wizard: pull beyond-week first occurrences in so auto-shuffle covers them |
| v82 | `f5799dd` | Workload fix + Wipe all progress |
| v81 | `6d7a458` | Workload + history: per-occurrence points, persistent hide-pre-clear |
| v80 | `9f3cbda` | Wizard: render after Save the week so the modal closes |
| v79 | `cfe15f8` | Wizard: keep moved-off-natural-day rows + resume next-period auto-fill |

Earlier highlights: Phase 1 occurrences, Phase 4 streaks, Phase 5 badges, Phase 7 weekly shuffle wizard, Phase 8 linked tasks, Phase 9 discriminated-union schedule + tombstones replacing plannedWeeks.

---

## Current features (as of v88)

- Chores: weekly / biweekly / monthly cycle / monthly day-of-month / daily / "after another chore" linked
- Today / Week / Month / Tasks / Stats tabs
- Wizard ("Plan this week"): modal with auto-balance — **about to be removed in redesign**
- Per-occurrence skip × button on cards
- Reminders (set time per chore → push notification on Edge Function cron, hourly re-fire 24 h cap, daily 9 am digest)
- Per-person calendar export (ICS) + 8-day export
- Auth: Supabase OTP code (6-digit, iOS PWA-safe)
- Dark mode auto-follow
- Session never auto-logs out
- 50 badges across Completion / Streak / Effort / Helping / Rewards categories
- Couple level "Olympaws House" cooperative XP (incremental level shown on Stats)
- Monthly leaderboard with month nav
- Streak personal-best per person + Olympaws House combined
- Purrs (currency) + reward catalog + redemption flow + badge-baseline-aware filtering
- Floating Purrs/Streak HUD chip top-right
- "Meet the Olympaws" decorative card (Atena/Thor/Rum) on Stats with tap-to-zoom
- **Cat popups** (v86–v88): Atena fires on badge unlock, Thor on redemption, Rum on Purr-milestone crossing; each cat has a 5-phrase rotation
- Settings: Reset badge progress, Start fresh (clear all occurrences), Wipe all progress (clears doneLog/Purrs/badges/streaks/redemptions, keeps chores), Sign out

---

## Important design decisions made earlier in this chat

1. **`scheduleClearedAt` is persistent** (never cleared until next Start fresh). Used by calendar dot rendering to keep hiding pre-clear grey history dots forever.
2. **`suppressInitialMaterialisation` is the gate** (boolean, cleared on first wizard save) for `ensureOccurrences`'s default fill and `showsOnDay`'s template fallback for dates ≥ clearedYmd.
3. **`assignedPoints` counts per-occurrence** in `[today, today+13d]`, not template defaults. Pre-indexed by stringified id because keys are strings but `c.id` is a number — `findChore` strict-eq would fail.
4. **`saveWizard` step 1 clears beyond-week pinned occurrences** too (not just in-week), so prior wizard's pass-2 first-occurrence pins get replaced cleanly instead of accumulating and inflating points each shuffle.
5. **`openWizard` pass 2** pulls each chore's first upcoming natural-due date when the chore has no presence this week (typical biweekly with anchor next week).
6. **`autoBalance` keeps beyond-week rows on their natural date** (only assignee changes). Otherwise round-robin pulls them into this week and breaks the plan.
7. **Cat popups** queue outside `S` (transient device-local) — `catPopupQueue` array. `queueCatPopup(catName, body)` pushes; `dismissCatPopup` pops and re-renders.
8. **Rum milestone hits stored in `S.rumMilestonesHit`** so popup doesn't refire on undo+redo, sync, or app reopen. Reset by both Reset badges and Wipe all progress.
9. **Wipe all progress** ≠ Start fresh. Start fresh wipes occurrences (schedule reset). Wipe all progress wipes doneLog / balances / redemptions / badges / streaks / baselines and un-marks done occurrences. Chores, rewards, current plan, reminders stay.
10. **Cat popups need force-close to update.** PWA caches the SW; user must swipe the app out of recents (not just background) and reopen to pick up new SW versions.

---

## Pending issue noted (might not need action, but worth checking)

User reported "resetting badges and unlocking doesn't bring them back." Code path was verified:
- `resetBadgeProgress` → `S.badges = {}`, sets baselines, `invalidateBadgeStats()`, `save()`
- `save()` → `evaluateBadges()` → empty stats → no unlocks (correct)
- User completes a task → `recordEvent("task_done", ...)` filters by `doneAt < baselineAt` (correct, current doneAt > baselineAt → not filtered)
- `applyDoneToStats` increments stats
- Next `save()` in `toggleDone` → `evaluateBadges` → checks predicates → `firstSpark` (totalDone ≥ 1) should unlock

**Conclusion:** code is correct on v85+. Likely the user was on stale PWA cache. If new chat picks this up: ask the user to confirm app version (e.g. by force-close + reopen) before debugging.

---

## What the redesign build needs to do

### Add
1. **Occurrence sheet** — new modal type, opens when a chore card is tapped on Today/Week/Month. Replaces the current tap-to-cycle-assignee on cards. UI: mark done/undo, assignee toggle, day-picker (current week only), skip ×, footer "Edit the task →" link.
2. **Planning sheet** — new modal opened from a 🔀 button at the top of the Tasks tab. UI: live points header, This/Next toggle, persistent rows with day-picker + assignee toggle + ×. **Live save** on each tap. Default assignee carry-forward (last week → this week), else Anyone.
3. **Fixed-assignee toggle** on the Task editor for the "I always do this" pattern. When set: Planning sheet shows the chore as locked to that person, can still skip with ×.

### Remove / replace
- `openWizard`, `modalWizard`, `autoBalanceWizard`, `cascadeWizardDate`, `saveWizard`, `wizardDraft` — the whole wizard module
- The "Plan this week" banner on Today (it was a wizard entry point — replace with a smaller cue: "X chores need a person → tap to plan")
- `ensureOccurrences`'s default materialisation for current+next period (the Planning sheet is the only writer now). Keep the past-week tombstone / doneLog re-materialisation logic.
- `showsOnDay`'s template fallback can probably be tightened further (calendar already only shows planned occurrences).

### Migration
- Existing wizard-pinned occurrences should keep working as Planning-sheet-pinned occurrences (same `{assignee, done, doneAt, pinned}` shape).
- `S.suppressInitialMaterialisation` can probably stay for the past-fresh-clear behaviour but isn't strictly needed if nothing auto-fills anyway.
- `S.scheduleClearedAt` stays for the calendar history-dot suppression.

### Keep
- Cat popups, Rum milestones, badges, streaks, Purrs, reward catalog, redemptions, OTP auth, sync, reminders, ICS export, the Stats tab leaderboard / level / "Meet the Olympaws", chore templates, the calendar/month/week/today/tasks tab structure.

---

## Quick start commands for the new chat

```bash
# Working tree is at:
/home/user/nuestro-hogar/

# Latest commit:
git log --oneline -1

# Active branch:
claude/eloquent-ramanujan-wSWVf  (synced to main)

# Parse-check the inline JS:
node -e "
const fs=require('fs');
const m=fs.readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/);
try{ new Function(m[1]); console.log('OK'); }catch(e){ console.error(e.message); process.exit(1); }
"

# Bump SW version (sw.js, ~line 13) every time index.html changes.
```

---

## Things the next chat should ask the user

1. Confirm the three-surface redesign plan as laid out at the top of this doc.
2. Decide on the open question: does the prior week's plan stay browseable somewhere, or just live as past dates on the calendar?
3. Confirm whether the cat popup phrases (Atena / Thor / Rum) should stay as the placeholder lines shipped in v88 or if the user wants to provide their own list.
4. Confirm Rum milestone list `[10, 25, 50, 100, 250, 500, 1000]` is final.
5. Confirm the in-flight badge unlock concern was a stale-cache thing — user should force-close + reopen the PWA, complete a task, and report whether First Spark unlocks.

---

*Generated end of session. Pick up at the "Where we left off" section.*

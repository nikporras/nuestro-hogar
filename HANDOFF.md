# Olympaws — Handoff for a new chat

Read this first, then `index.html`. Current app version: **v157** (Edge Function updated separately, see §6).

## 1. What it is
"Olympaws" (repo `nikporras/nuestro-hogar`) — a household chore PWA for **two people: Nico (index 0, porras456@hotmail.com, Android) and Caro (index 1, carolina.montecchi@gmail.com, iPhone)**. Served from **GitHub Pages off `main`**. Each phone sets "This phone is used by" in Settings (`S.deviceUser`).

## 2. Workflow (important)
- Dev branch: `claude/epic-ramanujan-yxjw7o` (v150 was built on `ccr-f8afecab-50yqqe`). After every change: commit → push branch → `git checkout main && git merge --ff-only <branch> && git push origin main` → back to branch. Pages deploys from `main`.
- **Every shipped change bumps `APP_VERSION` in `index.html` AND `CACHE` in `sw.js`** (e.g. v149 → v150). The Settings footer shows the version.
- Run `node scripts/smoke.js` before committing (parse + mock boot). Pre-commit hook runs it too. CI runs it (`.github/workflows/smoke.yml`).
- Users update via the **↻ button** at the top of the app (force update: unregisters SW, clears caches, reloads). A plain refresh is not enough.
- User style: often on mobile; terse messages; wants changes discussed before big changes ("dont start just asking" = discuss only). Hates being doubted on observations — trust screenshots. Constraint repeated many times: **never lose progress/history**.

## 3. Architecture
- **Single file `index.html`** (~4600 lines): inline CSS (tokens on `:root`, light/dark) + one vanilla ES5 IIFE. DOM built with `h(tag, attrs, ...children)` (`text:` = textContent; no innerHTML of user data). One `render()` rebuilds `#root`.
- `sw.js` caches app shell (versioned), network-first navigation, push + notificationclick handlers (icon = `icons/icon-192.png`, badge = `icons/badge-mono.png` monochrome paw).
- **Supabase**: magic-link/OTP auth; state in ONE row `household_state` (id=1, `data` JSON); `push_subscriptions` table (endpoint, email, p256dh, auth, tz, **digest**); dedup tables `sent_notifications`, `sent_redemptions`, `sent_digests_v2`; Cron job (pg_cron, Integrations → Cron → Jobs, active) calls the Edge Function.
- **Edge Function** source is versioned at `supabase/functions/reminder-scheduler/index.ts` but **deployed manually** by pasting into the Supabase dashboard.

## 4. Data model (S)
- `chores` = templates `{id, name, icon, effort 1–3, freq Daily|Weekly|Biweekly|Monthly, assignee 0|1|null, rotate (Alternate), pinned (Fixed), weekdays[], startDate, recurrenceMode "calendar"|"afterCompletion", linkedAfter {taskId, days}, kind "oneTime", archived, notes}`.
- `occurrences` map keyed `"choreId_YYYY-MM-DD"` → `{assignee, done, doneAt, pinned, tombstone, cover, wasCover, balanced, manual, rolled, lm}`. **The board reads only occurrences** (`showsOnDay`/`isDue`). `doneLog` is legacy.
- Also: balances (Purrs), rewards, redemptions, badges `{"0":{id:ts},"1":{}}` (per person), maxStreaks, badgeBaseline*, `holiday:[bool,bool]` (per person), `biweeklyModeMigrated` (doc-level flag), reminders, rumMilestonesHit.

## 5. Key behaviours (all live)
- `ensureOccurrences()` passes in order: `materialiseSeries` (weekly/daily 56 days ahead) → `syncAfterChores` (linked-after orphan-drop + backfill) → `rollForwardOverdueLinked` (overdue linked tasks roll to today until done) → `applyHolidayCover` → `maybeMonthRolloverRebalance` → `pruneOldTombstones`.
- **Biweekly/Monthly default to after-completion**: one card only; next is scheduled when done; skip (×) advances the cycle; self-heals if a task has no card.
- **Move day** in occurrence sheet: "Only this day" vs "This + future days" (rewrites weekday/anchor). Moved cards get `manual:true`.
- **Assignment**: Alternate / Fixed / Anyone. Monthly **rebalance** (auto on month rollover + ↔ button with preview) flips Alternate occurrences to even task COUNTS; skips Fixed/Anyone/manual/linked/cover.
- **Holiday per person** ("pause + optional cover"): that person's upcoming tasks get `cover`, excluded from their streak/workload/rollovers; partner sees "🏖 cover for X" and can complete for credit; undo returns it; both on = everything hidden.
- **Streak**: a day counts if every owed (non-cover) task assigned to you is done. Stats has a "Your streak" card naming the day/task that broke it with "Go to" button.
- **Stats**: Workload split (‹› per month, tasks + points), Month-by-month bars (oldest left → newest right, scrollable, tap month → "who did what" detail with points), badges per person.
- **Sync = merge-on-receive** (`applyDoc(d, replace)`): occurrences union with `lm` last-modified stamps; redemptions/badges/maxStreaks/doneLog merged; chores/rewards/reminders/balances/names last-writer-wins (so deletions propagate). `replace=true` only for snapshot/backup restore. `pullState` defers while a push is pending; `pushNow` captures the doc synchronously.
- Other: past dates selectable when creating tasks; "📌 Extra day of a task"; Settings → "Restore full schedule"; weekly 4-slot local snapshots; full-state JSON backup (v2).
- Notifications client: Settings shows ✅ only when truly armed (`pushArmed`); auto re-subscribes on open; "Daily task summary" selector Off/9 AM/6 PM/Both stored per phone and PATCHed as `digest` on the subscription row.

## 6. Edge Function (deployed, current)
Sends (a) reminders to the assigned person, repeating per the reminder's `repeat` field (v157: `once` | `1h` | `3h` | `daily`; missing = once; 24h cap, 7 days for daily; a moved `remindAt` fires again); (b) per-phone digest at 9/18 local built from the **occurrences map**; (c) redemption notice to the other person. All dedup is **claim-before-send / fail-closed** (fixed a spam bug where Caro got pushes every ~6 min). Cron runs every few minutes; that is checking frequency, not send frequency.
- Open item to verify: Nico (Android) hadn't received the 9 AM digest — likely his subscription row lacked `tz`; re-opening the app re-subscribes with tz. Confirm Caro's spam stopped.

## 7. Known/deferred
- Purr-farming: unmark→remark after spending can mint Purrs (refund clamped at 0). Not fixed (user didn't prioritise).
- Cross-device clock skew in `lastSyncedAt` (client timestamps); future-dated completion credits Purrs before badge stats; `Date.now()` ids (theoretical collision).
- Google Calendar: only one-off `.ics` export exists ("Send to calendar"); a subscribed feed via Edge Function was discussed, not built.
- Ideas the user liked but not built: date-hashed daily bonus chore, streak multipliers, time-estimate tags, "catch-up" (least-completed) assignment mode.

## 8. v150 redesign
- Visual re-skin only: "Playful" sticker style (thick ink outlines, hard offset shadows, done cards press in) in the purple palette. Same screens and logic.
- Fonts: Pixel Operator for text, Pixel Operator 8 for the "Olympaws" title, section headings and sheet titles (CC0, by Jayvee Enaguas; user supplied). TTFs in `fonts/`, in the SW shell; CSP gained `font-src 'self'`. The Pixel Operator @font-face uses `size-adjust:120%` so its small x-height reads like the old sans sizes (inline styles included) without inflating emoji; don't use `font-size-adjust` (it scales the emoji fallback too). Pixel Operator 8 elements use 16/24px. Fixed tasks show a drawn padlock (`lockIcon()`), not the 🔒 emoji. Date headings between ‹ › (`.section-title[style*="margin:0"]`) stay in Pixel Operator because the 8px face is too wide.
- Tags now take their hue from a `--c` CSS variable (tinted outlined pills), not inline `background`.
- Bottom menu uses inline line icons (`ICON_SVG`), no emoji.
- Header shows a daily cat line (`CAT_SAYS`, 30 lines): cat rotates Atena, Thor, Rum by date; line depends on board state (none/some/rolled/all/holiday). Personalities: Atena food obsessed, Thor only wants Caro (`S.names[1]`) in bed, Rum a silly orange cat.

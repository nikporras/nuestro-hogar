// Olympaws reminder / digest / redemption push scheduler (Supabase Edge Function).
//
// Deploy: paste this into your existing scheduled function (keep its slug/name)
// and redeploy. Schedule it to run every ~15 minutes (so the 9am/6pm digest
// windows and the hourly reminder re-fire are caught promptly).
//
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, (optional) VAPID_SUBJECT.
//
// Schema this version needs (run both in the SQL editor):
//   -- per-phone digest preference ('off' | '9am' | '6pm' | 'both'; null = '9am')
//   alter table push_subscriptions add column if not exists digest text default '9am';
//   -- dedicated, TEXT-keyed digest dedup table (the old sent_task_digests.day
//   -- column may be a DATE, which rejected the "YYYY-MM-DD#hour" slot key and
//   -- caused a re-send-every-run loop). This one is always safe.
//   create table if not exists sent_digests_v2 (
//     endpoint text not null,
//     slot_key text not null,
//     sent_at  timestamptz default now(),
//     primary key (endpoint, slot_key)
//   );
// All three sections now CLAIM the dedup row before sending (fail-closed):
// if the row can't be written, nothing is sent — a broken table never spams.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:porras456@hotmail.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const REPEAT_GAP_MS = 55 * 60 * 1000;        // re-fire a reminder every ~hour
const REPEAT_CAP_MS = 24 * 60 * 60 * 1000;   // …but stop 24h after remindAt
const ROLLOVER_DAYS = 14;                    // overdue window, mirrors the app

// digest preference → which local hours to send at.
const DIGEST_HOURS: Record<string, number[]> = {
  "off": [],
  "9am": [9],
  "6pm": [18],
  "both": [9, 18],
};

const EMAIL_TO_INDEX: Record<string, number> = {
  "porras456@hotmail.com": 0,
  "carolina.montecchi@gmail.com": 1,
};

function ymd(d: Date): string {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}
function localParts(tz: string): { day: string; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: parseInt(parts.hour, 10),
  };
}
function localDateForTz(tz: string): Date {
  const [y, m, d] = localParts(tz).day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

async function sendPush(sub: any, payload: string): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    return true;
  } catch (e: any) {
    if (e?.statusCode === 404 || e?.statusCode === 410) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    } else {
      console.warn("push failed", e?.statusCode, e?.message);
    }
    return false;
  }
}

Deno.serve(async () => {
  const { data: hs } = await supabase
    .from("household_state").select("data").eq("id", 1).single();
  const state: any = hs?.data ?? {};
  const reminders: any[] = Array.isArray(state.reminders) ? state.reminders : [];
  const chores: any[] = Array.isArray(state.chores) ? state.chores : [];
  const occ: Record<string, any> = (state.occurrences && typeof state.occurrences === "object") ? state.occurrences : {};
  const redemptions: any[] = Array.isArray(state.redemptions) ? state.redemptions : [];
  const names: string[] = Array.isArray(state.names) ? state.names : ["Nico", "Caro"];
  const choreById: Record<string, any> = {};
  for (const c of chores) choreById[String(c.id)] = c;

  const now = Date.now();

  // ---- 1) Reminder pushes (re-fire hourly until done, 24h cap) ----
  // Only the assigned person is notified (null assignee → both).
  const { data: sentRows } = await supabase
    .from("sent_notifications").select("reminder_id, sent_at");
  const lastSent = new Map<string, number>(
    (sentRows ?? []).map((r: any) => [String(r.reminder_id), new Date(r.sent_at).getTime()]),
  );

  const dueReminders = reminders.filter((r) => {
    if (!r || r.done || !r.remindAt) return false;
    const t = new Date(r.remindAt).getTime();
    if (isNaN(t) || t > now) return false;
    if (now - t > REPEAT_CAP_MS) return false;
    const last = lastSent.get(String(r.id));
    return !last || now - last >= REPEAT_GAP_MS;
  });

  let reminderPushes = 0;
  if (dueReminders.length > 0) {
    const { data: subs } = await supabase.from("push_subscriptions").select("*");
    for (const r of dueReminders) {
      // Record the send FIRST, so a failed write can't trigger a re-send loop.
      // (The 55-min gap check reads this timestamp next run.)
      const { error: recErr } = await supabase.from("sent_notifications").upsert({
        reminder_id: String(r.id), sent_at: new Date().toISOString(),
      });
      if (recErr) continue;
      const payload = JSON.stringify({
        title: "Olympaws", body: "🔔 " + r.text, url: "./", tag: "reminder-" + r.id,
      });
      for (const s of subs ?? []) {
        // Target the assigned person only; a reminder with no assignee goes to both.
        if (r.assignee === 0 || r.assignee === 1) {
          const sidx = EMAIL_TO_INDEX[String(s.email ?? "").toLowerCase()];
          if (sidx !== r.assignee) continue;
        }
        await sendPush(s, payload);
      }
      reminderPushes++;
    }
  }

  // ---- 2) Task digest, per phone, at the hour(s) that phone chose ----
  // Built from the OCCURRENCES map — the same source of truth as the app's
  // board — not from the retired template schedule. Lists this person's
  // undone, non-tombstone, non-cover tasks for today, plus an overdue count.
  const { data: allSubs } = await supabase.from("push_subscriptions").select("*");
  let digests = 0;
  for (const s of allSubs ?? []) {
    if (!s.tz || !s.email) continue;
    const pref = (s.digest ?? "9am");
    const hours = DIGEST_HOURS[pref] ?? [9];
    const { day, hour } = localParts(s.tz);
    if (!hours.includes(hour)) continue;

    // Claim this (phone, day, hour) slot up-front with a unique insert. If it's
    // already claimed (duplicate) OR the row can't be written, SKIP — never
    // re-send in a loop. Uses a dedicated TEXT-keyed table so no date-typed
    // column can reject the slot key (that was the every-6-minutes spam).
    const slotKey = day + "#" + hour;
    const { error: claimErr } = await supabase
      .from("sent_digests_v2").insert({ endpoint: s.endpoint, slot_key: slotKey });
    if (claimErr) continue;

    const userIdx = EMAIL_TO_INDEX[String(s.email).toLowerCase()];
    const today = localDateForTz(s.tz);
    const todayStr = ymd(today);
    const floorStr = ymd(addDays(today, -ROLLOVER_DAYS));

    const todays: any[] = [];
    let overdue = 0;
    const seenToday: Record<string, boolean> = {};
    const seenOver: Record<string, boolean> = {};
    for (const key of Object.keys(occ)) {
      const o = occ[key];
      if (!o || o.tombstone || o.done || o.cover != null) continue;
      const dash = key.indexOf("_"); if (dash < 0) continue;
      const chId = key.slice(0, dash);
      const dStr = key.slice(dash + 1);
      const c = choreById[chId]; if (!c) continue;
      const who = (o.assignee === 0 || o.assignee === 1) ? o.assignee : null;
      if (userIdx !== undefined && who != null && who !== userIdx) continue;
      if (dStr === todayStr) {
        if (!seenToday[chId]) { seenToday[chId] = true; todays.push(c); }
      } else if (dStr < todayStr && dStr >= floorStr) {
        if (!seenToday[chId] && !seenOver[chId]) { seenOver[chId] = true; overdue++; }
      }
    }

    if (todays.length === 0 && overdue === 0) continue; // nothing to say (slot already claimed)

    const list = todays.map((c) => (c.icon ? c.icon + " " : "") + c.name).slice(0, 6).join(", ");
    const more = todays.length > 6 ? " +" + (todays.length - 6) + " more" : "";
    const overStr = overdue > 0 ? (todays.length ? " · " : "") + overdue + " overdue" : "";
    const title = todays.length > 0
      ? (hour >= 12 ? "Still to do (" + todays.length + ")" : "Today's tasks (" + todays.length + ")")
      : overdue + " overdue task" + (overdue === 1 ? "" : "s");
    const payload = JSON.stringify({
      title, body: (list + more + overStr) || "Nothing scheduled.", url: "./", tag: "digest-" + slotKey,
    });

    if (await sendPush(s, payload)) digests++;
  }

  // ---- 3) Redemption pushes — notify the OTHER person ----
  let redPushes = 0;
  if (redemptions.length > 0) {
    const { data: sentRedRows } = await supabase
      .from("sent_redemptions").select("redemption_id");
    const sentRed = new Set((sentRedRows ?? []).map((r: any) => String(r.redemption_id)));
    const newReds = redemptions.filter((r: any) => r && r.id != null && !sentRed.has(String(r.id)));

    if (newReds.length > 0) {
      const indexToEmail: Record<number, string> = {};
      for (const [em, idx] of Object.entries(EMAIL_TO_INDEX)) indexToEmail[idx] = em;
      const { data: allSubs2 } = await supabase.from("push_subscriptions").select("*");

      for (const red of newReds) {
        // Claim FIRST (unique insert). If already recorded or the write fails,
        // skip — so a redemption can't be re-announced every run.
        const { error: claimErr } = await supabase
          .from("sent_redemptions").insert({ redemption_id: String(red.id) });
        if (claimErr) continue;
        const who = (red.by === 0 || red.by === 1) ? red.by : 0;
        const redeemerEmail = (indexToEmail[who] || "").toLowerCase();
        const payload = JSON.stringify({
          title: "Olympaws",
          body: `${names[who] ?? "Someone"} redeemed '${red.rewardName}' for ${red.rewardCost} Purrs.`,
          url: "./", tag: "redemption-" + red.id,
        });
        for (const s of allSubs2 ?? []) {
          if (s.email && s.email.toLowerCase() === redeemerEmail) continue;
          if (await sendPush(s, payload)) redPushes++;
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ reminders: reminderPushes, digests, redemptions: redPushes }),
    { headers: { "Content-Type": "application/json" } },
  );
});

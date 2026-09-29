// The daily sync, on the platform queue.
//
// Each run books the next, so the cadence survives redeploys without any cron
// config in the template. That chain has two ways to break: nothing starts it
// on a fresh deployment, and anything that stops a run reaching its booking (an
// exception, a delivery that ran out of attempts, a queue outage) ends it
// silently. Both are covered by keeping the booking in `sync_schedule` and
// letting the request path act as the watchdog: GET /api/status books the first
// run once an account is chosen, and re-books when a booking is overdue and the
// queue no longer holds its job.

import { get, run } from "./db.js";
import type { Bindings } from "./env.js";

/** Hour (UTC) the daily sync runs: late enough that GitHub has closed yesterday. */
const SYNC_HOUR_UTC = 3;
/** How late a booking may run before the watchdog asks the queue about it. */
const OVERDUE_GRACE_MS = 15 * 60 * 1000;

export interface Booking {
  jobId: string;
  runAt: string;
}

export async function currentBooking(): Promise<Booking | null> {
  const row = await get<{ job_id: string; run_at: string }>("SELECT job_id, run_at FROM sync_schedule WHERE id = 1");
  return row ? { jobId: row.job_id, runAt: row.run_at } : null;
}

export function nextSlot(from = new Date()): Date {
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(SYNC_HOUR_UTC, 0, 0, 0);
  return next;
}

/**
 * Book a delivery to the queue route at `runAt`.
 *
 * The idempotency key is the app's host plus `tag`: two requests that notice
 * the same gap collapse to one job, and the host is in it because the queue
 * dedupes per org, so two copies of this app in one org never share a booking.
 * `origin` comes from the incoming request, so the template carries no slug.
 */
export async function book(env: Bindings, origin: string, runAt: Date, tag: string): Promise<Booking | null> {
  try {
    const { enqueueJob } = await import("@clawnify/queue");
    const job = await enqueueJob(env, {
      targetUrl: `${origin}/api/queue/sync`,
      runAt,
      idempotencyKey: `star-sync-${new URL(origin).host}-${tag}`,
      maxAttempts: 3,
    });
    const booking = { jobId: job.id, runAt: runAt.toISOString() };
    await run(
      `INSERT INTO sync_schedule (id, job_id, run_at, booked_at) VALUES (1, ?, ?, datetime('now'))
       ON CONFLICT (id) DO UPDATE SET job_id = excluded.job_id, run_at = excluded.run_at, booked_at = excluded.booked_at`,
      [booking.jobId, booking.runAt],
    );
    return booking;
  } catch (err) {
    // A missing or unavailable queue must not fail the request that noticed
    // the gap; the next request tries again.
    console.error("queue booking failed", err);
    return null;
  }
}

async function jobAlive(env: Bindings, jobId: string): Promise<boolean> {
  try {
    const { getJob } = await import("@clawnify/queue");
    const job = await getJob(env, jobId);
    return job.status === "pending" || job.status === "queued";
  } catch {
    return false;
  }
}

/**
 * Make sure a sync is booked. Costs one D1 read on the healthy path; the queue
 * is only asked when the booking looks wrong. Off the platform (no
 * CLAWNIFY_TOKEN) there is no queue, and the Refresh button is the scheduler.
 */
export async function ensureScheduled(env: Bindings, origin: string): Promise<Booking | null> {
  if (!env.CLAWNIFY_TOKEN) return null;
  const booking = await currentBooking();
  const now = Date.now();
  if (booking && Date.parse(booking.runAt) > now) return booking;
  if (booking) {
    if (now - Date.parse(booking.runAt) < OVERDUE_GRACE_MS) return booking;
    if (await jobAlive(env, booking.jobId)) return booking;
  }
  const at = new Date();
  return book(env, origin, at, `recover-${at.toISOString().slice(0, 16)}`);
}

/**
 * After a scheduled step: continue at once while repos remain, otherwise book
 * tomorrow. Always books something, so a failed step cannot end the chain.
 */
export async function afterStep(env: Bindings, origin: string, remaining: number, progressed: boolean): Promise<Booking | null> {
  if (!env.CLAWNIFY_TOKEN) return null;
  if (remaining > 0 && progressed) {
    // `remaining` is in the key so each continuation is a new job, while a
    // retried delivery of the same step dedupes onto the one already booked.
    const at = new Date();
    return book(env, origin, at, `continue-${at.toISOString().slice(0, 10)}-${remaining}`);
  }
  if (remaining > 0) {
    // Nothing moved: almost always GitHub's hourly limit. Come back after it resets.
    const at = new Date(Date.now() + 60 * 60 * 1000);
    return book(env, origin, at, `retry-${at.toISOString().slice(0, 13)}`);
  }
  const next = nextSlot();
  return book(env, origin, next, `daily-${next.toISOString().slice(0, 10)}`);
}

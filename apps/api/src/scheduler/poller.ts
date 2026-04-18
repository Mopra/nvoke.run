import { findDueSchedules, claimSchedule } from "../queries/schedules.js";
import { nextRunAfter } from "./cron.js";
import { runSchedule } from "./execute.js";

type Logger = (
  level: "info" | "warn" | "error",
  msg: string,
  meta?: unknown,
) => void;

const POLL_INTERVAL_MS = 15_000;
const BATCH_LIMIT = 25;

export function startPoller(log: Logger): () => void {
  let stopped = false;
  let activeTick: Promise<void> = Promise.resolve();

  async function tick() {
    if (stopped) return;
    try {
      const due = await findDueSchedules(BATCH_LIMIT);
      for (const schedule of due) {
        if (stopped) return;
        let next: Date;
        try {
          next = nextRunAfter(
            schedule.cron_expression,
            schedule.timezone,
            new Date(),
          );
        } catch (e) {
          log("error", "invalid cron on due schedule, disabling in memory", {
            scheduleId: schedule.id,
            error: e instanceof Error ? e.message : String(e),
          });
          // Advance far into future to avoid hot loop; user must fix cron.
          next = new Date(Date.now() + 24 * 60 * 60 * 1000);
        }

        const claimed = await claimSchedule(schedule.id, schedule.next_run_at, next);
        if (!claimed) continue;

        // Fire and forget — but await so the poller doesn't overrun itself
        // and to keep billing concurrency accurate.
        try {
          await runSchedule(schedule, log);
        } catch (e) {
          log("error", "schedule execution threw", {
            scheduleId: schedule.id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    } catch (e) {
      log("error", "scheduler poll failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const interval = setInterval(() => {
    activeTick = activeTick.then(tick);
  }, POLL_INTERVAL_MS);
  interval.unref?.();

  // Kick off immediately on start.
  activeTick = activeTick.then(tick);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}

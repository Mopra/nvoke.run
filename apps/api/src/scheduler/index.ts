import { tryBecomeLeader } from "./leader.js";
import { startPoller } from "./poller.js";

type Logger = (
  level: "info" | "warn" | "error",
  msg: string,
  meta?: unknown,
) => void;

const LEADER_RETRY_MS = 30_000;

export async function startScheduler(log: Logger): Promise<() => void> {
  let stopPoller: (() => void) | null = null;
  let stopped = false;

  async function attempt() {
    if (stopped) return;
    try {
      const handle = await tryBecomeLeader();
      if (!handle) {
        setTimeout(attempt, LEADER_RETRY_MS).unref?.();
        return;
      }
      log("info", "scheduler is leader");
      stopPoller = startPoller(log);
    } catch (e) {
      log("error", "scheduler leader election failed", {
        error: e instanceof Error ? e.message : String(e),
      });
      setTimeout(attempt, LEADER_RETRY_MS).unref?.();
    }
  }

  void attempt();

  return () => {
    stopped = true;
    stopPoller?.();
  };
}

export { validateCron, nextRunAfter } from "./cron.js";

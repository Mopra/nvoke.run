import cronParser from "cron-parser";

export interface ValidCron {
  ok: true;
  nextRunAt: Date;
}

export interface InvalidCron {
  ok: false;
  error: string;
}

export function validateCron(
  expression: string,
  timezone: string,
): ValidCron | InvalidCron {
  try {
    const iter = cronParser.parseExpression(expression, { tz: timezone });
    return { ok: true, nextRunAt: iter.next().toDate() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function nextRunAfter(
  expression: string,
  timezone: string,
  after: Date,
): Date {
  const iter = cronParser.parseExpression(expression, {
    tz: timezone,
    currentDate: after,
  });
  return iter.next().toDate();
}

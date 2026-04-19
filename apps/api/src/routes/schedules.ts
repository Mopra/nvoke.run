import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clerkAuth } from "../auth.js";
import { getFunction } from "../queries/functions.js";
import * as Q from "../queries/schedules.js";
import { listTriggerEvents } from "../queries/trigger-events.js";
import { validateCron, nextRunAfter } from "../scheduler/cron.js";
import { runSchedule } from "../scheduler/execute.js";
import { SUPPORTED_METHODS } from "../queries/functions.js";

const HttpMethodEnum = z.enum(SUPPORTED_METHODS);

const IdParams = z.object({ id: z.string().uuid() });
const FunctionIdParams = z.object({ id: z.string().uuid() });

const HeadersShape = z.record(z.string(), z.string()).default({});

const CreateBody = z.object({
  name: z.string().min(1).max(200),
  cron_expression: z.string().min(1).max(200),
  timezone: z.string().min(1).max(64).default("UTC"),
  request_method: HttpMethodEnum.default("POST"),
  request_headers: HeadersShape,
  request_body: z.string().max(64_000).nullable().default(null),
  enabled: z.boolean().default(true),
});

const UpdateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  cron_expression: z.string().min(1).max(200).optional(),
  timezone: z.string().min(1).max(64).optional(),
  request_method: HttpMethodEnum.optional(),
  request_headers: HeadersShape.optional(),
  request_body: z.string().max(64_000).nullable().optional(),
  enabled: z.boolean().optional(),
});

export async function schedulesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", clerkAuth);

  app.get("/api/functions/:id/schedules", async (req, reply) => {
    const { id } = FunctionIdParams.parse(req.params);
    const fn = await getFunction(id, req.user!.id);
    if (!fn)
      return reply.code(404).send({ error: "not_found", message: "function not found" });
    const schedules = await Q.listSchedules(id, req.user!.id);
    return { schedules };
  });

  app.post("/api/functions/:id/schedules", async (req, reply) => {
    const { id } = FunctionIdParams.parse(req.params);
    const body = CreateBody.parse(req.body);
    const fn = await getFunction(id, req.user!.id);
    if (!fn)
      return reply.code(404).send({ error: "not_found", message: "function not found" });
    const cron = validateCron(body.cron_expression, body.timezone);
    if (!cron.ok)
      return reply
        .code(400)
        .send({ error: "invalid_cron", message: cron.error });
    const schedule = await Q.createSchedule({
      function_id: id,
      user_id: req.user!.id,
      name: body.name,
      cron_expression: body.cron_expression,
      timezone: body.timezone,
      request_method: body.request_method,
      request_headers: body.request_headers,
      request_body: body.request_body,
      enabled: body.enabled,
      next_run_at: cron.nextRunAt,
    });
    return reply.code(201).send({ schedule });
  });

  app.patch("/api/schedules/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const patch = UpdateBody.parse(req.body);
    const existing = await Q.getSchedule(id, req.user!.id);
    if (!existing)
      return reply.code(404).send({ error: "not_found", message: "schedule not found" });

    let nextRunAt: Date | null | undefined;
    const cronChanged =
      patch.cron_expression !== undefined || patch.timezone !== undefined;
    const enabledChanged = patch.enabled !== undefined;
    if (cronChanged || (enabledChanged && patch.enabled === true)) {
      const expr = patch.cron_expression ?? existing.cron_expression;
      const tz = patch.timezone ?? existing.timezone;
      const cron = validateCron(expr, tz);
      if (!cron.ok)
        return reply.code(400).send({ error: "invalid_cron", message: cron.error });
      nextRunAt = cron.nextRunAt;
    } else if (enabledChanged && patch.enabled === false) {
      nextRunAt = null;
    }

    const schedule = await Q.updateSchedule(id, req.user!.id, {
      name: patch.name,
      cron_expression: patch.cron_expression,
      timezone: patch.timezone,
      request_method: patch.request_method,
      request_headers: patch.request_headers,
      request_body: patch.request_body,
      enabled: patch.enabled,
      next_run_at: nextRunAt,
    });
    if (!schedule)
      return reply.code(404).send({ error: "not_found", message: "schedule not found" });
    return { schedule };
  });

  app.delete("/api/schedules/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await Q.deleteSchedule(id, req.user!.id);
    return reply.code(204).send();
  });

  app.post("/api/schedules/:id/run", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const schedule = await Q.getSchedule(id, req.user!.id);
    if (!schedule)
      return reply.code(404).send({ error: "not_found", message: "schedule not found" });
    // Compute and advance next_run_at so the poller won't double-fire immediately.
    try {
      const next = nextRunAfter(schedule.cron_expression, schedule.timezone, new Date());
      await Q.updateSchedule(id, req.user!.id, { next_run_at: next });
    } catch {
      /* cron invalid — ignore for manual run */
    }
    const { invocation } = await runSchedule(
      {
        id: schedule.id,
        function_id: schedule.function_id,
        user_id: schedule.user_id,
        cron_expression: schedule.cron_expression,
        timezone: schedule.timezone,
        request_method: schedule.request_method,
        request_headers: schedule.request_headers,
        request_body: schedule.request_body,
      },
      (level, msg, meta) => {
        if (level === "error") req.log.error(meta ?? {}, msg);
        else if (level === "warn") req.log.warn(meta ?? {}, msg);
        else req.log.info(meta ?? {}, msg);
      },
    );
    const updated = await Q.getSchedule(id, req.user!.id);
    return { schedule: updated, invocation };
  });

  app.get("/api/functions/:id/trigger-events", async (req, reply) => {
    const { id } = FunctionIdParams.parse(req.params);
    const fn = await getFunction(id, req.user!.id);
    if (!fn)
      return reply.code(404).send({ error: "not_found", message: "function not found" });
    const limit = Math.min(
      200,
      Math.max(1, Number((req.query as { limit?: string }).limit ?? 50)),
    );
    const events = await listTriggerEvents(id, req.user!.id, { limit });
    return { events };
  });
}

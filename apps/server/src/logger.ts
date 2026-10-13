import { pino, type Logger } from 'pino';
import { loadEnv } from './env.js';

/** A named pino logger for scripts and the worker. The API uses Fastify's own. */
export function logger(name: string): Logger {
  return pino({ name, level: loadEnv().LOG_LEVEL });
}

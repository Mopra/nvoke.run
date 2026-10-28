import { z } from 'zod';
import { flag } from './helpers.js';

/** Email verification: SMTP probes, their rate limits and relays. */
export const verify = {
  SMTP_HELO_NAME: z.string().min(1).default('nvoke.run'),
  SMTP_PROBE_FROM: z.email().default('probe@nvoke.run'),
  SMTP_PROBE_ENABLED: flag('true'),
  // SMTP sessions per minute over IPv4, across the worker. Hostinger cuts
  // IPv4 port 25 off after bursts past about 5 a minute (IPv6 is not
  // throttled). 0 means no limit.
  SMTP_PROBES_PER_MINUTE: z.coerce.number().int().min(0).default(5),
  // SMTP sessions per minute in all (IPv4 and IPv6), and to any one mail
  // provider (Google, Microsoft 365, else the MX domain). 0 means no limit.
  SMTP_SESSIONS_PER_MINUTE: z.coerce.number().int().min(0).default(60),
  SMTP_SESSIONS_PER_PROVIDER_PER_MINUTE: z.coerce.number().int().min(0).default(20),
  // Other servers to probe through over IPv4, each with its own
  // SMTP_PROBES_PER_MINUTE: SOCKS proxies (ssh -D tunnels) as
  // "host:port=helo name", comma separated. The HELO name must match the
  // relay's reverse DNS. Empty means this machine only.
  SMTP_RELAYS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(
      z.array(
        z
          .string()
          .regex(/^[^:=\s]+:\d+=\S+$/, 'expected host:port=helo name')
          .transform((s) => {
            const [proxy, heloName] = s.split('=') as [string, string];
            const [host, port] = proxy.split(':') as [string, string];
            return { socks: { host, port: Number(port) }, heloName };
          }),
      ),
    ),
  // Probe over IPv6 when the MX host has an AAAA record, IPv4 otherwise or on failure.
  SMTP_PREFER_IPV6: flag('true'),
};

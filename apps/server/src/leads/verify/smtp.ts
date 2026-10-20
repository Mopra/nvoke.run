// A minimal SMTP client that asks a mail server whether it would accept a
// recipient, without sending anything: banner, EHLO, MAIL FROM, RCPT TO for
// each address, QUIT. No DATA command is ever issued.

import * as net from 'node:net';
import { RelayDownError } from './socks.js';

export interface SmtpReply {
  code: number;
  /** Enhanced status code such as "5.1.1", when the server sends one. */
  enhanced: string | null;
  message: string;
}

export interface SmtpProbeOptions {
  /** A host name, or an IP address (an IPv6 address of the MX host, say). */
  host: string;
  port?: number;
  /** Address family for a host name: 4 forces IPv4. Default lets the OS pick. */
  family?: 4 | 6;
  heloName: string;
  mailFrom: string;
  recipients: string[];
  /**
   * Picks each next recipient from the replies so far, instead of
   * `recipients`: null ends the session. Lets a caller stop at the first
   * accepted address or skip ahead after a catch-all answer. `answered` is
   * one array for the whole session, so a caller that keeps it also sees a
   * last reply that ended the session (421) or replies before a failure.
   */
  nextRecipient?: (answered: SmtpProbeResult['recipients']) => string | null;
  connectTimeoutMs?: number;
  commandTimeoutMs?: number;
  signal?: AbortSignal;
  /** Injectable for tests. */
  connect?: (port: number, host: string) => net.Socket;
  /** Opens the connection another way (through a relay), resolving once it is ready. Wins over `connect`. */
  open?: (port: number, host: string, timeoutMs: number) => Promise<net.Socket>;
}

export interface SmtpProbeResult {
  banner: SmtpReply;
  /** One reply per recipient, in order. */
  recipients: Array<{ address: string; reply: SmtpReply }>;
}

export type SmtpStage = 'connect' | 'banner' | 'helo' | 'mail' | 'rcpt';

export class SmtpProbeError extends Error {
  constructor(
    readonly stage: SmtpStage,
    message: string,
    readonly reply?: SmtpReply,
  ) {
    super(message);
    this.name = 'SmtpProbeError';
  }
}

/** Reads complete (possibly multiline) replies from a socket. */
class ReplyReader {
  private buffer = '';
  private lines: string[] = [];
  private pending: SmtpReply[] = [];
  private waiter: { resolve: (r: SmtpReply) => void; reject: (e: Error) => void } | null = null;
  private failure: Error | null = null;

  constructor(socket: net.Socket) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => this.push(chunk));
    socket.on('error', (err) => this.fail(err));
    socket.on('close', () => this.fail(new Error('connection closed')));
    // A socket handed over by a relay arrives paused.
    socket.resume();
  }

  private push(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > 64_000) {
      this.fail(new Error('reply too long'));
      return;
    }
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nl).replace(/\r$/, '');
      this.buffer = this.buffer.slice(nl + 1);
      this.lines.push(line);
      // "250-..." continues, "250 ..." (or a bare "250") ends the reply.
      if (/^\d{3}(?: |$)/.test(line)) this.complete();
    }
  }

  private complete(): void {
    const lines = this.lines;
    this.lines = [];
    const last = lines[lines.length - 1] ?? '';
    const code = Number(last.slice(0, 3));
    const message = lines.map((l) => l.slice(4)).join(' ').trim();
    const enhanced = /^([245]\.\d{1,3}\.\d{1,3})\b/.exec(message)?.[1] ?? null;
    const reply = { code, enhanced, message };
    const w = this.waiter;
    this.waiter = null;
    if (w) w.resolve(reply);
    else this.pending.push(reply);
  }

  private fail(err: Error): void {
    if (this.failure) return;
    this.failure = err;
    const w = this.waiter;
    this.waiter = null;
    w?.reject(err);
  }

  next(timeoutMs: number): Promise<SmtpReply> {
    const ready = this.pending.shift();
    if (ready) return Promise.resolve(ready);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new Error('timed out waiting for reply'));
      }, timeoutMs);
      this.waiter = {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
    });
  }
}

function connectSocket(opts: SmtpProbeOptions, port: number, timeoutMs: number): Promise<net.Socket> {
  if (opts.open) {
    return opts.open(port, opts.host, timeoutMs).catch((err: unknown) => {
      if (err instanceof RelayDownError) throw err;
      throw new SmtpProbeError('connect', `connect to ${opts.host}:${port} failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
  return new Promise((resolve, reject) => {
    const socket = (opts.connect ?? ((p, h) => net.connect({ port: p, host: h, family: opts.family })))(port, opts.host);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new SmtpProbeError('connect', `connect to ${opts.host}:${port} timed out`));
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      socket.destroy();
      reject(new SmtpProbeError('connect', `connect to ${opts.host}:${port} failed: ${err.message}`));
    });
  });
}

/** Rejects addresses that would let a caller inject SMTP commands. */
function safeAddress(address: string): string {
  if (/[\r\n<>\s]/.test(address)) throw new Error(`refusing unsafe address ${JSON.stringify(address)}`);
  return address;
}

export async function smtpProbe(opts: SmtpProbeOptions): Promise<SmtpProbeResult> {
  const port = opts.port ?? 25;
  const commandTimeout = opts.commandTimeoutMs ?? 15_000;
  // A job aborted while waiting for its turn opens no connection at all.
  if (opts.signal?.aborted) throw new SmtpProbeError('connect', 'aborted before connect');
  const socket = await connectSocket(opts, port, opts.connectTimeoutMs ?? 10_000);
  const onAbort = () => socket.destroy(new Error('aborted'));
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  const reader = new ReplyReader(socket);

  const send = async (line: string, stage: SmtpStage): Promise<SmtpReply> => {
    socket.write(`${line}\r\n`);
    try {
      return await reader.next(commandTimeout);
    } catch (err) {
      throw new SmtpProbeError(stage, `${stage}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  try {
    let banner: SmtpReply;
    try {
      banner = await reader.next(commandTimeout);
    } catch (err) {
      throw new SmtpProbeError('banner', `banner: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (banner.code !== 220) throw new SmtpProbeError('banner', `banner ${banner.code} ${banner.message}`, banner);

    let helo = await send(`EHLO ${opts.heloName}`, 'helo');
    if (helo.code !== 250) helo = await send(`HELO ${opts.heloName}`, 'helo');
    if (helo.code !== 250) throw new SmtpProbeError('helo', `HELO rejected: ${helo.code} ${helo.message}`, helo);

    const mail = await send(`MAIL FROM:<${safeAddress(opts.mailFrom)}>`, 'mail');
    if (mail.code !== 250) throw new SmtpProbeError('mail', `MAIL FROM rejected: ${mail.code} ${mail.message}`, mail);

    const recipients: SmtpProbeResult['recipients'] = [];
    const queue = [...opts.recipients];
    for (;;) {
      const address = opts.nextRecipient ? opts.nextRecipient(recipients) : queue.shift();
      if (address == null) break;
      const reply = await send(`RCPT TO:<${safeAddress(address)}>`, 'rcpt');
      recipients.push({ address, reply });
      // A server that hangs up mid-session (421) has answered everything it will.
      if (reply.code === 421) break;
    }

    socket.write('QUIT\r\n');
    await reader.next(2_000).catch(() => undefined);
    return { banner, recipients };
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
    // Wait for the close, so a caller holding a per-MX lock really has one connection at a time.
    const closed = new Promise<void>((resolve) => {
      if (socket.closed) resolve();
      else socket.once('close', () => resolve());
    });
    socket.end();
    await Promise.race([closed, new Promise<void>((resolve) => setTimeout(resolve, 2_000).unref())]);
    socket.destroy();
  }
}

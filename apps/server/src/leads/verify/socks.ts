// A minimal SOCKS5 client (RFC 1928, no authentication, CONNECT to an IPv4
// address) for SMTP probes sent out through a relay: the worker reaches
// another server's port 25 through `ssh -D`, so each server's own IPv4 cap
// adds up (deploy/README.md, "SMTP relay").

import * as net from 'node:net';

export interface SocksProxy {
  host: string;
  port: number;
}

/** The proxy itself could not be reached or refused us: the relay is down, not the mail server. */
export class RelayDownError extends Error {}

/**
 * A socket connected through the proxy to `ip:port`, ready for the mail
 * server's banner. Rejects with RelayDownError when the proxy is down, and
 * with a plain Error when the proxy could not reach the target.
 */
export function socksConnect(proxy: SocksProxy, ip: string, port: number, timeoutMs: number): Promise<net.Socket> {
  if (!net.isIPv4(ip)) return Promise.reject(new Error(`socks: ${ip} is not an IPv4 address`));
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: proxy.host, port: proxy.port });
    let stage: 'proxy' | 'greeting' | 'connect' = 'proxy';
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => fail(new Error(`connect to ${ip}:${port} through the relay timed out`)), timeoutMs);
    const fail = (err: Error) => {
      clearTimeout(timer);
      socket.removeAllListeners('data');
      socket.destroy();
      reject(err);
    };
    socket.once('error', (err) =>
      fail(stage === 'proxy' ? new RelayDownError(`relay ${proxy.host}:${proxy.port}: ${err.message}`) : err),
    );
    // ssh closes the channel without a reply when the target is refused or not allowed.
    socket.once('close', () => fail(new Error(`relay closed the connection to ${ip}:${port}`)));
    socket.once('connect', () => {
      stage = 'greeting';
      socket.write(Buffer.from([0x05, 0x01, 0x00]));
    });
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (stage === 'greeting') {
        if (buffer.length < 2) return;
        if (buffer[0] !== 0x05 || buffer[1] !== 0x00) return fail(new RelayDownError('relay refused the SOCKS greeting'));
        buffer = buffer.subarray(2);
        stage = 'connect';
        const request = Buffer.alloc(10);
        request.set([0x05, 0x01, 0x00, 0x01]);
        request.set(ip.split('.').map(Number), 4);
        request.writeUInt16BE(port, 8);
        socket.write(request);
      }
      if (stage === 'connect') {
        if (buffer.length < 5) return;
        if (buffer[1] !== 0x00) return fail(new Error(`relay could not connect to ${ip}:${port} (SOCKS reply ${buffer[1]})`));
        // The bound address: IPv4, a length prefixed name or IPv6, then the port.
        const atyp = buffer[3];
        const length = 4 + (atyp === 0x01 ? 4 : atyp === 0x04 ? 16 : 1 + buffer[4]!) + 2;
        if (buffer.length < length) return;
        clearTimeout(timer);
        // Paused so nothing is lost before the SMTP reader attaches (it resumes the socket).
        socket.pause();
        socket.removeAllListeners('data');
        socket.removeAllListeners('close');
        socket.removeAllListeners('error');
        // Bytes past the reply are the start of the mail server's banner.
        if (buffer.length > length) socket.unshift(buffer.subarray(length));
        resolve(socket);
      }
    });
  });
}

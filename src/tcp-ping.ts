import { createConnection } from 'net';
import type { TcpPingResult } from './types.js';

export function tcpPing(
  hostname: string,
  port: number = 443,
  timeout: number = 10000,
): Promise<TcpPingResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = createConnection({ host: hostname, port }, () => {
      const end = performance.now();
      socket.destroy();
      resolve({ time: end - start });
    });

    socket.setTimeout(timeout);
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ time: performance.now() - start, error: 'timeout' });
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      socket.destroy();
      if (err.code === 'ECONNREFUSED') {
        resolve({ time: performance.now() - start, error: 'Connection refused' });
      } else if (err.code === 'ENOTFOUND') {
        resolve({ time: performance.now() - start, error: 'DNS lookup failed' });
      } else {
        resolve({ time: performance.now() - start, error: err.message });
      }
    });
  });
}

import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import type { HttpTimingResult } from './types.js';

export function measureHttpTiming(
  url: string,
  timeout: number = 15000,
): Promise<HttpTimingResult> {
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (e) {
      resolve({
        dnsTime: 0,
        tcpTime: 0,
        tlsTime: -1,
        ttfb: 0,
        totalTime: 0,
        statusCode: 0,
        error: `Invalid URL: ${(e as Error).message}`,
      });
      return;
    }

    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;

    const result: HttpTimingResult = {
      dnsTime: 0,
      tcpTime: 0,
      tlsTime: -1,
      ttfb: 0,
      totalTime: 0,
      statusCode: 0,
    };

    const startTime = process.hrtime.bigint();
    let dnsEndTime = 0n;
    let tcpEndTime = 0n;
    let tlsEndTime = 0n;
    let ttfbTime: bigint | null = null;
    let totalEndTime = 0n;
    let resolved = false;

    const toMs = (ns: bigint): number => Number(ns) / 1e6;

    const finish = () => {
      if (resolved) return;
      resolved = true;

      const dnsStart = dnsEndTime > 0n ? dnsEndTime : startTime;
      result.dnsTime = dnsEndTime > 0n ? Math.max(0, toMs(dnsEndTime - startTime)) : 0;
      result.tcpTime =
        tcpEndTime > 0n ? Math.max(0, toMs(tcpEndTime - dnsStart)) : 0;
      if (isHttps && tlsEndTime > 0n) {
        result.tlsTime = Math.max(
          0,
          toMs(tlsEndTime - (tcpEndTime || dnsEndTime || startTime)),
        );
      }
      result.ttfb =
        ttfbTime !== null ? Math.max(0, toMs(ttfbTime - startTime)) : 0;
      const endTime =
        totalEndTime ||
        tlsEndTime ||
        tcpEndTime ||
        dnsEndTime ||
        process.hrtime.bigint();
      result.totalTime = Math.max(0, toMs(endTime - startTime));

      resolve(result);
    };

    const options: http.RequestOptions & {
      lookup?: (
        hostname: string,
        opts: any,
        cb: (
          err: NodeJS.ErrnoException | null,
          address: string,
          family: number,
        ) => void,
      ) => void;
    } = {
      lookup(hostname, opts, cb) {
        dns.lookup(hostname, opts, (err, address, family) => {
          dnsEndTime = process.hrtime.bigint();
          if (err) {
            result.error = `DNS lookup failed: ${err.message}`;
            finish();
            return;
          }
          cb(null, address, family);
        });
      },
    };

    const req = mod.get(url, options, (res) => {
      result.statusCode = res.statusCode ?? 0;
      result.protocol = res.httpVersion;

      res.once('data', () => {
        if (ttfbTime === null) {
          ttfbTime = process.hrtime.bigint();
        }
      });

      res.on('end', () => {
        totalEndTime = process.hrtime.bigint();
        finish();
      });
    });

    req.setTimeout(timeout);

    req.on('socket', (socket) => {
      socket.once('connect', () => {
        tcpEndTime = process.hrtime.bigint();
      });

      if (isHttps) {
        socket.once('secureConnect', () => {
          tlsEndTime = process.hrtime.bigint();
        });
      }
    });

    req.on('timeout', () => {
      result.error = 'Connection timeout';
      req.destroy();
      finish();
    });

    req.on('error', (err) => {
      if (!result.error) {
        const msg = err.message ?? '';
        const code = (err as any).code ?? '';
        if (
          msg.includes('TLS') ||
          msg.includes('SSL') ||
          msg.includes('tls') ||
          msg.includes('ssl') ||
          code.includes('SSL') ||
          code.includes('TLS')
        ) {
          result.error = `TLS error: ${msg}`;
        } else {
          result.error = msg;
        }
      }
      finish();
    });
  });
}

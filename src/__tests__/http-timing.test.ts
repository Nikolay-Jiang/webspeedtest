import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ── Hoisted mock functions ──────────────────────────────────────────
const { mockHttpGet, mockHttpsGet, mockDnsLookup } = vi.hoisted(() => ({
  mockHttpGet: vi.fn(),
  mockHttpsGet: vi.fn(),
  mockDnsLookup: vi.fn(),
}));

vi.mock('node:http', () => ({ default: { get: mockHttpGet } }));
vi.mock('node:https', () => ({ default: { get: mockHttpsGet } }));
vi.mock('node:dns', () => ({ default: { lookup: mockDnsLookup } }));

import { measureHttpTiming } from '../http-timing.js';

// ── Helpers ─────────────────────────────────────────────────────────
function createMockReq() {
  const req = new EventEmitter() as any;
  req.setTimeout = vi.fn().mockReturnThis();
  req.end = vi.fn();
  req.destroy = vi.fn();
  return req;
}

function createMockRes(statusCode: number, httpVersion = '1.1') {
  const res = new EventEmitter() as any;
  res.statusCode = statusCode;
  res.httpVersion = httpVersion;
  return res;
}

// Simulates a normal HTTPS flow: lookup → connect → secureConnect → data → end
function mockHttpsSuccess(statusCode = 200) {
  mockHttpsGet.mockImplementation(
    (_url: string, options: any, callback: (res: any) => void) => {
      const req = createMockReq();
      setImmediate(() => {
        options.lookup('host', { family: 4 }, (_err: any, _addr: string, _fam: number) => {
          const socket = new EventEmitter();
          req.emit('socket', socket);
          socket.emit('connect');
          socket.emit('secureConnect');
          const res = createMockRes(statusCode);
          callback(res);
          res.emit('data', Buffer.from('OK'));
          setImmediate(() => res.emit('end'));
        });
      });
      return req;
    },
  );
}

// Simulates a normal HTTP flow: lookup → connect → data → end
function mockHttpSuccess(statusCode = 200) {
  mockHttpGet.mockImplementation(
    (_url: string, options: any, callback: (res: any) => void) => {
      const req = createMockReq();
      setImmediate(() => {
        options.lookup('host', { family: 4 }, (_err: any, _addr: string, _fam: number) => {
          const socket = new EventEmitter();
          req.emit('socket', socket);
          socket.emit('connect');
          const res = createMockRes(statusCode);
          callback(res);
          res.emit('data', Buffer.from('OK'));
          setImmediate(() => res.emit('end'));
        });
      });
      return req;
    },
  );
}

// ── Tests ───────────────────────────────────────────────────────────
describe('measureHttpTiming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: DNS always succeeds
    mockDnsLookup.mockImplementation(
      (_hostname: string, _opts: any, cb: Function) => {
        cb(null, '1.2.3.4', 4);
      },
    );
  });

  // ── Test 1 ──
  it('HTTPS request → all timing fields >= 0, statusCode=200', async () => {
    mockHttpsSuccess(200);

    const result = await measureHttpTiming('https://example.com');

    expect(result.dnsTime).toBeGreaterThanOrEqual(0);
    expect(result.tcpTime).toBeGreaterThanOrEqual(0);
    expect(result.tlsTime).toBeGreaterThanOrEqual(0);
    expect(result.ttfb).toBeGreaterThanOrEqual(0);
    expect(result.totalTime).toBeGreaterThanOrEqual(0);
    expect(result.statusCode).toBe(200);
    expect(result.error).toBeUndefined();
  });

  // ── Test 2 ──
  it('HTTP (non-HTTPS) → tlsTime=-1', async () => {
    mockHttpSuccess(200);

    const result = await measureHttpTiming('http://example.com');

    expect(result.tlsTime).toBe(-1);
    expect(result.dnsTime).toBeGreaterThanOrEqual(0);
    expect(result.tcpTime).toBeGreaterThanOrEqual(0);
    expect(result.ttfb).toBeGreaterThanOrEqual(0);
    expect(result.totalTime).toBeGreaterThanOrEqual(0);
    expect(result.statusCode).toBe(200);
  });

  // ── Test 3 ──
  it('DNS failure → error contains "DNS"', async () => {
    // Override DNS mock to fail
    mockDnsLookup.mockImplementation(
      (_hostname: string, _opts: any, cb: Function) => {
        cb(new Error('getaddrinfo ENOTFOUND example.com'), null, 0);
      },
    );

    mockHttpGet.mockImplementation(
      (_url: string, options: any, _callback: any) => {
        const req = createMockReq();
        setImmediate(() => {
          options.lookup('host', { family: 4 }, () => {
            // This cb should never be called on DNS failure
          });
        });
        return req;
      },
    );

    const result = await measureHttpTiming('http://example.com');

    expect(result.error).toBeDefined();
    expect(result.error!.toLowerCase()).toContain('dns');
  });

  // ── Test 4 ──
  it('Connection timeout → error contains "timeout"', async () => {
    mockHttpGet.mockImplementation(
      (_url: string, _options: any, _callback: any) => {
        const req = createMockReq();
        // Never call lookup — emit timeout instead
        setImmediate(() => req.emit('timeout'));
        return req;
      },
    );

    const result = await measureHttpTiming('http://example.com');

    expect(result.error).toBeDefined();
    expect(result.error!.toLowerCase()).toContain('timeout');
  });

  // ── Test 5 ──
  it('TLS error → error contains "TLS"', async () => {
    mockHttpsGet.mockImplementation(
      (_url: string, options: any, _callback: any) => {
        const req = createMockReq();
        setImmediate(() => {
          options.lookup('host', { family: 4 }, () => {
            req.emit('error', new Error('TLS handshake failed: certificate expired'));
          });
        });
        return req;
      },
    );

    const result = await measureHttpTiming('https://example.com');

    expect(result.error).toBeDefined();
    expect(result.error!.toLowerCase()).toContain('tls');
  });

  // ── Test 6 ──
  it('4xx/5xx response → statusCode recorded, timing valid', async () => {
    mockHttpsSuccess(500);

    const result = await measureHttpTiming('https://example.com');

    expect(result.statusCode).toBe(500);
    expect(result.dnsTime).toBeGreaterThanOrEqual(0);
    expect(result.tcpTime).toBeGreaterThanOrEqual(0);
    expect(result.tlsTime).toBeGreaterThanOrEqual(0);
    expect(result.ttfb).toBeGreaterThanOrEqual(0);
    expect(result.totalTime).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });
});

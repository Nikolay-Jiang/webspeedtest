import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UrlRecord, PingResult, TcpPingResult, HttpTimingResult } from '../types.js';

// ── Hoisted mock functions ──────────────────────────────────────────
const { mockIcmpPing, mockTcpPing, mockMeasureHttpTiming } = vi.hoisted(() => ({
  mockIcmpPing: vi.fn(),
  mockTcpPing: vi.fn(),
  mockMeasureHttpTiming: vi.fn(),
}));

vi.mock('../icmp-ping.js', () => ({
  icmpPing: mockIcmpPing,
}));
vi.mock('../tcp-ping.js', () => ({
  tcpPing: mockTcpPing,
}));
vi.mock('../http-timing.js', () => ({
  measureHttpTiming: mockMeasureHttpTiming,
}));

import { runTest } from '../orchestrator.js';

// ── Helpers ─────────────────────────────────────────────────────────
function makeUrl(overrides: Partial<UrlRecord> = {}): UrlRecord {
  return {
    raw: 'https://example.com',
    normalized: 'https://example.com',
    originalIndex: 0,
    ...overrides,
  };
}

function successPing(avg = 15): PingResult {
  return { min: 10, max: 20, avg, stddev: 3, loss: 0 };
}

function unavailablePing(): PingResult {
  return { min: -1, max: -1, avg: -1, stddev: -1, loss: 100 };
}

function successTcp(time = 25): TcpPingResult {
  return { time };
}

function successHttp(statusCode = 200, totalTime = 100): HttpTimingResult {
  return {
    dnsTime: 5, tcpTime: 10, tlsTime: 3, ttfb: 50, totalTime, statusCode,
  };
}

function failedHttp(error: string): HttpTimingResult {
  return {
    dnsTime: 0, tcpTime: 0, tlsTime: -1, ttfb: 0, totalTime: 0, statusCode: 0, error,
  };
}

// ── Tests ───────────────────────────────────────────────────────────
describe('runTest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Test 1 ──
  it('all 3 rounds succeed → correct averages, failure=null', async () => {
    const consoleSpy = vi.spyOn(console, 'log');

    mockIcmpPing.mockResolvedValue(successPing(15));
    mockTcpPing.mockResolvedValue(successTcp(25));
    mockMeasureHttpTiming.mockResolvedValue(successHttp(200, 100));

    const url = makeUrl();
    const promise = runTest(url, { count: 3 });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.rounds).toHaveLength(3);
    expect(result.failure).toBeNull();

    expect(result.averages.ping).toBeCloseTo(15);
    expect(result.averages.tcpPing).toBeCloseTo(25);
    expect(result.averages.dnsTime).toBeCloseTo(5);
    expect(result.averages.tcpTime).toBeCloseTo(10);
    expect(result.averages.tlsTime).toBeCloseTo(3);
    expect(result.averages.ttfb).toBeCloseTo(50);
    expect(result.averages.totalTime).toBeCloseTo(100);
    expect(result.averages.statusCode).toBe(200);

    expect(consoleSpy).toHaveBeenCalledTimes(3);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✓'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[1/3]'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[2/3]'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[3/3]'));
    consoleSpy.mockRestore();
  });

  // ── Test 2 ──
  it('1/3 rounds fail → averages from successful rounds, failure notes partial', async () => {
    const consoleSpy = vi.spyOn(console, 'log');

    mockIcmpPing.mockResolvedValue(successPing(15));
    mockTcpPing.mockResolvedValue(successTcp(25));
    mockMeasureHttpTiming
      .mockResolvedValueOnce(successHttp(200, 100))
      .mockResolvedValueOnce(failedHttp('timeout'))
      .mockResolvedValue(successHttp(200, 300));

    const url = makeUrl();
    const promise = runTest(url, { count: 3 });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.rounds).toHaveLength(3);
    expect(result.failure).toBe('1/3 rounds failed');

    expect(result.averages.ping).toBeCloseTo(15);
    expect(result.averages.tcpPing).toBeCloseTo(25);
    expect(result.averages.dnsTime).toBeCloseTo(5);
    expect(result.averages.tcpTime).toBeCloseTo(10);
    expect(result.averages.tlsTime).toBeCloseTo(3);
    expect(result.averages.ttfb).toBeCloseTo(50);
    expect(result.averages.totalTime).toBeCloseTo(200);
    expect(result.averages.statusCode).toBe(200);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[1/3] example.com ✓'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[2/3] example.com ✗'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[3/3] example.com ✓'));
    consoleSpy.mockRestore();
  });

  // ── Test 3 ──
  it('all rounds fail → all averages -1, failure non-empty', async () => {
    const consoleSpy = vi.spyOn(console, 'log');

    mockIcmpPing.mockResolvedValue(successPing(15));
    mockTcpPing.mockResolvedValue(successTcp(25));
    mockMeasureHttpTiming.mockResolvedValue(failedHttp('timeout'));

    const url = makeUrl();
    const promise = runTest(url, { count: 3 });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.rounds).toHaveLength(3);
    expect(result.averages.ping).toBe(-1);
    expect(result.averages.tcpPing).toBe(-1);
    expect(result.averages.dnsTime).toBe(-1);
    expect(result.averages.tcpTime).toBe(-1);
    expect(result.averages.tlsTime).toBe(-1);
    expect(result.averages.ttfb).toBe(-1);
    expect(result.averages.totalTime).toBe(-1);
    expect(result.averages.statusCode).toBe(-1);
    expect(result.failure).toBeTruthy();
    expect(typeof result.failure).toBe('string');
    expect((result.failure as string).length).toBeGreaterThan(0);

    expect(consoleSpy).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i++) {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✗'));
    }
    consoleSpy.mockRestore();
  });

  // ── Test 4 ──
  it('ICMP unavailable (avg=-1) → HTTP metrics still computed normally', async () => {
    mockIcmpPing.mockResolvedValue(unavailablePing());
    mockTcpPing.mockResolvedValue(successTcp(30));
    mockMeasureHttpTiming.mockResolvedValue(successHttp(200, 120));

    const url = makeUrl();
    const promise = runTest(url, { count: 2 });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.rounds).toHaveLength(2);
    expect(result.failure).toBeNull();

    expect(result.averages.ping).toBe(-1);
    expect(result.averages.tcpPing).toBeCloseTo(30);
    expect(result.averages.dnsTime).toBeCloseTo(5);
    expect(result.averages.tcpTime).toBeCloseTo(10);
    expect(result.averages.tlsTime).toBeCloseTo(3);
    expect(result.averages.ttfb).toBeCloseTo(50);
    expect(result.averages.totalTime).toBeCloseTo(120);
    expect(result.averages.statusCode).toBe(200);
  });

  // ── Test 5 ──
  it('single round (count=1) → returns single values, no delay needed', async () => {
    const consoleSpy = vi.spyOn(console, 'log');

    mockIcmpPing.mockResolvedValue(successPing(20));
    mockTcpPing.mockResolvedValue(successTcp(35));
    mockMeasureHttpTiming.mockResolvedValue(successHttp(200, 150));

    const url = makeUrl();
    const promise = runTest(url, { count: 1 });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.rounds).toHaveLength(1);
    expect(result.failure).toBeNull();
    expect(result.averages.ping).toBeCloseTo(20);
    expect(result.averages.tcpPing).toBeCloseTo(35);
    expect(result.averages.dnsTime).toBeCloseTo(5);
    expect(result.averages.tcpTime).toBeCloseTo(10);
    expect(result.averages.tlsTime).toBeCloseTo(3);
    expect(result.averages.ttfb).toBeCloseTo(50);
    expect(result.averages.totalTime).toBeCloseTo(150);
    expect(result.averages.statusCode).toBe(200);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[1/1]'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✓'));
    consoleSpy.mockRestore();
  });
});

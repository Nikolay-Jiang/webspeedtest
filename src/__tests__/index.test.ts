import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UrlRecord, TestResult, CliOptions, ReportData } from '../types.js';

// ── Hoisted mock functions ──────────────────────────────────────────
const {
  mockParseArgs,
  mockParseCsv,
  mockNormalizeUrl,
  mockRunTest,
  mockGenerateReport,
} = vi.hoisted(() => ({
  mockParseArgs: vi.fn(),
  mockParseCsv: vi.fn(),
  mockNormalizeUrl: vi.fn(),
  mockRunTest: vi.fn(),
  mockGenerateReport: vi.fn(),
}));

vi.mock('../cli.js', () => ({ parseArgs: mockParseArgs }));
vi.mock('../csv-parser.js', () => ({ parseCsv: mockParseCsv }));
vi.mock('../url-normalizer.js', () => ({ normalizeUrl: mockNormalizeUrl }));
vi.mock('../orchestrator.js', () => ({ runTest: mockRunTest }));
vi.mock('../report-generator.js', () => ({ generateReport: mockGenerateReport }));

// ── Import after mocks ──────────────────────────────────────────────
import { main } from '../index.js';

// ── Helpers ─────────────────────────────────────────────────────────
function makeCliOptions(overrides: Partial<CliOptions> = {}): CliOptions {
  return {
    csvPath: '/tmp/test.csv',
    count: 3,
    outputPath: '/tmp/report.html',
    help: false,
    ...overrides,
  };
}

function makeUrlRecord(raw: string, normalized: string): UrlRecord {
  return { raw, normalized, originalIndex: 0 };
}

function makeTestResult(
  url: UrlRecord,
  failure: string | null = null,
  totalTime = 100,
): TestResult {
  // Include at least one round so determineExitCode treats this as a tested URL
  const hasRounds = failure === null ? [{ round: 1, ping: { min: 10, max: 20, avg: 15, stddev: 3, loss: 0 }, tcpPing: { time: 25 }, http: { dnsTime: 5, tcpTime: 10, tlsTime: 3, ttfb: 50, totalTime, statusCode: 200 } }] : [{ round: 1, ping: { min: -1, max: -1, avg: -1, stddev: -1, loss: 100 }, tcpPing: { time: -1 }, http: { dnsTime: 0, tcpTime: 0, tlsTime: -1, ttfb: 0, totalTime: 0, statusCode: 0, error: failure } }];
  return {
    url,
    rounds: hasRounds,
    averages: {
      ping: 15, tcpPing: 25, dnsTime: 5, tcpTime: 10, tlsTime: 3,
      ttfb: 50, totalTime, statusCode: 200,
    },
    failure,
  };
}

// ── Tests ───────────────────────────────────────────────────────────
describe('main()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Prevent process.exit from crashing the test runner
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Test 1: Full end-to-end with mock data ─────────────────────────
  it('full e2e — all modules called, exit 0, report generated', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log');
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const exitSpy = vi.spyOn(process, 'exit');

    const cliOpts = makeCliOptions();
    mockParseArgs.mockReturnValue(cliOpts);

    const urls = [
      makeUrlRecord('google.com', 'https://google.com/'),
      makeUrlRecord('github.com', 'https://github.com/'),
    ];
    mockParseCsv.mockReturnValue(urls);

    mockNormalizeUrl.mockImplementation((raw: string) => {
      if (raw === 'google.com') return { normalized: 'https://google.com/', valid: true };
      if (raw === 'github.com') return { normalized: 'https://github.com/', valid: true };
      return { normalized: '', valid: false, error: 'bad url' };
    });

    mockRunTest.mockResolvedValueOnce(makeTestResult(urls[0], null, 80));
    mockRunTest.mockResolvedValueOnce(makeTestResult(urls[1], null, 120));

    try {
      await main();
    } catch (e) {
      // process.exit throws in mock
    }

    // Check all modules were called
    expect(mockParseArgs).toHaveBeenCalledTimes(1);
    expect(mockParseCsv).toHaveBeenCalledWith('/tmp/test.csv');
    expect(mockNormalizeUrl).toHaveBeenCalledTimes(2);
    expect(mockRunTest).toHaveBeenCalledTimes(2);
    expect(mockGenerateReport).toHaveBeenCalledTimes(1);

    const reportData: ReportData = mockGenerateReport.mock.calls[0][0] as ReportData;
    expect(reportData.results).toHaveLength(2);
    expect(reportData.options).toBe(cliOpts);
    expect(reportData.timestamp).toBeDefined();

    expect(exitSpy).toHaveBeenCalledWith(0);

    // Summary logged
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Report generated:'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Success: 2'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Failed: 0'));

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ── Test 2: --help → exit 0, no CSV/runTest called ─────────────────
  it('--help flag → exit 0, prints help, no other modules called', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log');
    const exitSpy = vi.spyOn(process, 'exit');

    mockParseArgs.mockReturnValue(makeCliOptions({ help: true }));

    try { await main(); } catch (_) { /* exit throws */ }

    expect(mockParseArgs).toHaveBeenCalledTimes(1);
    expect(mockParseCsv).not.toHaveBeenCalled();
    expect(mockNormalizeUrl).not.toHaveBeenCalled();
    expect(mockRunTest).not.toHaveBeenCalled();
    expect(mockGenerateReport).not.toHaveBeenCalled();

    // Help text should be logged
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));

    expect(exitSpy).toHaveBeenCalledWith(0);
    consoleLogSpy.mockRestore();
  });

  // ── Test 3: Invalid URL in CSV → marked as failure ─────────────────
  it('invalid URL → marked as failure result, report still generated', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log');
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const exitSpy = vi.spyOn(process, 'exit');

    mockParseArgs.mockReturnValue(makeCliOptions());
    const urls = [
      makeUrlRecord('good.com', 'good.com'),
      makeUrlRecord('!!!bad!!!', '!!!bad!!!'),
    ];
    mockParseCsv.mockReturnValue(urls);

    mockNormalizeUrl.mockImplementation((raw: string) => {
      if (raw === 'good.com') return { normalized: 'https://good.com/', valid: true };
      return { normalized: '', valid: false, error: 'Invalid URL' };
    });

    mockRunTest.mockResolvedValueOnce(makeTestResult(urls[0], null, 50));

    try { await main(); } catch (_) { /* exit throws */ }

    // runTest only called once for the valid URL
    expect(mockRunTest).toHaveBeenCalledTimes(1);
    expect(mockGenerateReport).toHaveBeenCalledTimes(1);

    const reportData: ReportData = mockGenerateReport.mock.calls[0][0] as ReportData;
    expect(reportData.results).toHaveLength(2);

    // First result is valid URL, second is the failure for invalid URL
    const failureResult = reportData.results[1];
    expect(failureResult.failure).not.toBeNull();
    expect(failureResult.url.raw).toBe('!!!bad!!!');

    // No URLs had connection failures (invalid URL is pre-normalization failure)
    expect(exitSpy).toHaveBeenCalledWith(0);

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ── Test 4: Duplicate URLs → deduplicated, warning printed ─────────
  it('duplicate normalized URLs → skip duplicates, warning via console.error', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log');
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const exitSpy = vi.spyOn(process, 'exit');

    mockParseArgs.mockReturnValue(makeCliOptions());
    const urls = [
      makeUrlRecord('google.com', 'google.com'),
      makeUrlRecord('www.google.com', 'www.google.com'),
    ];
    mockParseCsv.mockReturnValue(urls);

    let normalizeCallCount = 0;
    mockNormalizeUrl.mockImplementation((_raw: string) => {
      normalizeCallCount++;
      // Both normalize to the same URL
      return { normalized: 'https://google.com/', valid: true };
    });

    mockRunTest.mockResolvedValueOnce(makeTestResult(urls[0], null, 100));

    try { await main(); } catch (_) { /* exit throws */ }

    // Only one runTest call since second URL is a duplicate
    expect(mockRunTest).toHaveBeenCalledTimes(1);

    // Duplicate warning printed
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Duplicate URL skipped'));

    expect(mockGenerateReport).toHaveBeenCalledTimes(1);
    const reportData: ReportData = mockGenerateReport.mock.calls[0][0] as ReportData;
    expect(reportData.results).toHaveLength(1);

    expect(exitSpy).toHaveBeenCalledWith(0);

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ── Test 5: Partial failure → exit 1, report generated ─────────────
  it('partial connection failure → exit 1, report still generated', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log');
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const exitSpy = vi.spyOn(process, 'exit');

    mockParseArgs.mockReturnValue(makeCliOptions());
    const urls = [
      makeUrlRecord('good.com', 'good.com'),
      makeUrlRecord('bad.com', 'bad.com'),
    ];
    mockParseCsv.mockReturnValue(urls);

    mockNormalizeUrl.mockImplementation((raw: string) => {
      if (raw === 'good.com') return { normalized: 'https://good.com/', valid: true };
      return { normalized: 'https://bad.com/', valid: true };
    });

    mockRunTest
      .mockResolvedValueOnce(makeTestResult(urls[0], null, 50))
      .mockResolvedValueOnce(makeTestResult(urls[1], 'Connection refused'));

    try { await main(); } catch (_) { /* exit throws */ }

    expect(mockRunTest).toHaveBeenCalledTimes(2);
    expect(mockGenerateReport).toHaveBeenCalledTimes(1);

    const reportData: ReportData = mockGenerateReport.mock.calls[0][0] as ReportData;
    expect(reportData.results).toHaveLength(2);

    expect(exitSpy).toHaveBeenCalledWith(1);

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ── Test 6: All fail (connection-level) → exit 1 ───────────────────
  it('all URLs have connection failure → exit 1', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log');
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const exitSpy = vi.spyOn(process, 'exit');

    mockParseArgs.mockReturnValue(makeCliOptions());
    const urls = [makeUrlRecord('bad.com', 'bad.com')];
    mockParseCsv.mockReturnValue(urls);

    mockNormalizeUrl.mockReturnValue({ normalized: 'https://bad.com/', valid: true });
    mockRunTest.mockResolvedValueOnce(makeTestResult(urls[0], 'Connection timeout'));

    try { await main(); } catch (_) { /* exit throws */ }

    expect(mockRunTest).toHaveBeenCalledTimes(1);
    expect(mockGenerateReport).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ── Test 7: No valid URLs → exit 2 ────────────────────────────────
  it('all URLs invalid (normalization failure) → exit 2', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log');
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const exitSpy = vi.spyOn(process, 'exit');

    mockParseArgs.mockReturnValue(makeCliOptions());
    const urls = [
      makeUrlRecord('!!!bad!!!', '!!!bad!!!'),
      makeUrlRecord('!!!alsobad!!!', '!!!alsobad!!!'),
    ];
    mockParseCsv.mockReturnValue(urls);

    mockNormalizeUrl.mockReturnValue({ normalized: '', valid: false, error: 'Invalid URL' });

    try { await main(); } catch (_) { /* exit throws */ }

    // No URLs were valid, so no runTest calls
    expect(mockRunTest).not.toHaveBeenCalled();

    // Report still generated
    expect(mockGenerateReport).toHaveBeenCalledTimes(1);

    const reportData: ReportData = mockGenerateReport.mock.calls[0][0] as ReportData;
    expect(reportData.results).toHaveLength(2);

    expect(exitSpy).toHaveBeenCalledWith(2);

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ── Test 8: Progress output printed per-URL ────────────────────────
  it('prints per-URL progress lines', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log');
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const exitSpy = vi.spyOn(process, 'exit');

    mockParseArgs.mockReturnValue(makeCliOptions());
    const urls = [
      makeUrlRecord('a.com', 'a.com'),
      makeUrlRecord('b.com', 'b.com'),
    ];
    mockParseCsv.mockReturnValue(urls);

    mockNormalizeUrl.mockImplementation((raw: string) => ({
      normalized: `https://${raw}/`, valid: true,
    }));

    mockRunTest
      .mockResolvedValueOnce(makeTestResult(urls[0], null, 50))
      .mockResolvedValueOnce(makeTestResult(urls[1], null, 100));

    try { await main(); } catch (_) { /* exit throws */ }

    // IT IS CRITICAL that you check mock function calls first, not spy
    // The progress markers are console.log calls
    const allLogs = consoleLogSpy.mock.calls.map(c => c[0] as string).join('\n');
    expect(allLogs).toContain('--- Testing 1/2 ---');
    expect(allLogs).toContain('--- Testing 2/2 ---');

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});

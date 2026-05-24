import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateReport } from '../report-generator.js';
import type { ReportData, TestResult, UrlRecord, CliOptions } from '../types.js';
import * as fs from 'fs';
import * as path from 'path';

const TEST_OUTPUT = '/tmp/test-report.html';

function makeUrl(raw: string, normalized: string): UrlRecord {
  return { raw, normalized, originalIndex: 0 };
}

function makeSuccessResult(url: string, totalTime: number, ttfb: number, dnsTime: number, tcpTime: number, tlsTime: number, ping: number, tcpPing: number, statusCode: number): TestResult {
  return {
    url: makeUrl(url, `https://${url}/`),
    rounds: [],
    averages: { ping, tcpPing, dnsTime, tcpTime, tlsTime, ttfb, totalTime, statusCode },
    failure: null,
  };
}

function makeFailureResult(url: string, reason: string): TestResult {
  return {
    url: makeUrl(url, `https://${url}/`),
    rounds: [],
    averages: { ping: -1, tcpPing: -1, dnsTime: -1, tcpTime: -1, tlsTime: -1, ttfb: -1, totalTime: -1, statusCode: -1 },
    failure: reason,
  };
}

function makeCliOptions(): CliOptions {
  return { csvPath: 'test.csv', count: 3, outputPath: TEST_OUTPUT, help: false };
}

describe('generateReport', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_OUTPUT)) {
      fs.unlinkSync(TEST_OUTPUT);
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_OUTPUT)) {
      fs.unlinkSync(TEST_OUTPUT);
    }
  });

  it('creates the HTML file at the specified output path', () => {
    const data: ReportData = {
      timestamp: '2026-05-24T10:00:00.000Z',
      results: [],
      options: makeCliOptions(),
    };
    generateReport(data, TEST_OUTPUT);
    expect(fs.existsSync(TEST_OUTPUT)).toBe(true);
  });

  it('contains a <table> element', () => {
    const data: ReportData = {
      timestamp: '2026-05-24T10:00:00.000Z',
      results: [makeSuccessResult('google.com', 150.3, 80.1, 20.0, 30.0, 10.0, 5.0, 15.0, 200)],
      options: makeCliOptions(),
    };
    generateReport(data, TEST_OUTPUT);
    const html = fs.readFileSync(TEST_OUTPUT, 'utf-8');
    expect(html).toContain('<table');
    expect(html).toContain('</table>');
  });

  it('contains test URLs in the table', () => {
    const data: ReportData = {
      timestamp: '2026-05-24T10:00:00.000Z',
      results: [
        makeSuccessResult('google.com', 150.3, 80.1, 20.0, 30.0, 10.0, 5.0, 15.0, 200),
        makeSuccessResult('github.com', 200.5, 100.2, 25.0, 35.0, 15.0, 8.0, 20.0, 200),
      ],
      options: makeCliOptions(),
    };
    generateReport(data, TEST_OUTPUT);
    const html = fs.readFileSync(TEST_OUTPUT, 'utf-8');
    expect(html).toContain('google.com');
    expect(html).toContain('github.com');
  });

  it('success rows have numeric values (not "—")', () => {
    const data: ReportData = {
      timestamp: '2026-05-24T10:00:00.000Z',
      results: [makeSuccessResult('google.com', 150.3, 80.1, 20.0, 30.0, 10.0, 5.0, 15.0, 200)],
      options: makeCliOptions(),
    };
    generateReport(data, TEST_OUTPUT);
    const html = fs.readFileSync(TEST_OUTPUT, 'utf-8');
    // Should contain numeric TTFB value like "80.1"
    expect(html).toMatch(/80\.1/);
    // Should contain numeric Total value like "150.3"
    expect(html).toMatch(/150\.3/);
  });

  it('failure rows show error reason in red and "—" for numeric columns', () => {
    const data: ReportData = {
      timestamp: '2026-05-24T10:00:00.000Z',
      results: [makeFailureResult('bad-domain.invalid', 'DNS lookup failed')],
      options: makeCliOptions(),
    };
    generateReport(data, TEST_OUTPUT);
    const html = fs.readFileSync(TEST_OUTPUT, 'utf-8');
    // Error reason should be present
    expect(html).toContain('DNS lookup failed');
    // Numeric columns should show "—"
    expect(html).toContain('—');
  });

  it('sorts results by Total Time ascending (fastest first)', () => {
    const data: ReportData = {
      timestamp: '2026-05-24T10:00:00.000Z',
      results: [
        makeSuccessResult('slow.com', 500.0, 200.0, 50.0, 80.0, 30.0, 10.0, 25.0, 200),
        makeSuccessResult('fast.com', 100.0, 50.0, 10.0, 20.0, 5.0, 3.0, 8.0, 200),
        makeSuccessResult('medium.com', 300.0, 150.0, 30.0, 50.0, 20.0, 7.0, 15.0, 200),
      ],
      options: makeCliOptions(),
    };
    generateReport(data, TEST_OUTPUT);
    const html = fs.readFileSync(TEST_OUTPUT, 'utf-8');
    // Find positions of URLs in the HTML
    const fastIdx = html.indexOf('fast.com');
    const mediumIdx = html.indexOf('medium.com');
    const slowIdx = html.indexOf('slow.com');
    // fast should appear before medium, medium before slow
    expect(fastIdx).toBeLessThan(mediumIdx);
    expect(mediumIdx).toBeLessThan(slowIdx);
  });

  it('includes timestamp in report header', () => {
    const data: ReportData = {
      timestamp: '2026-05-24T10:00:00.000Z',
      results: [],
      options: makeCliOptions(),
    };
    generateReport(data, TEST_OUTPUT);
    const html = fs.readFileSync(TEST_OUTPUT, 'utf-8');
    expect(html).toMatch(/2026.*05.*24/);
  });

  it('includes summary statistics (total, success, failure, average)', () => {
    const data: ReportData = {
      timestamp: '2026-05-24T10:00:00.000Z',
      results: [
        makeSuccessResult('google.com', 150.0, 80.0, 20.0, 30.0, 10.0, 5.0, 15.0, 200),
        makeFailureResult('bad.com', 'Connection refused'),
      ],
      options: makeCliOptions(),
    };
    generateReport(data, TEST_OUTPUT);
    const html = fs.readFileSync(TEST_OUTPUT, 'utf-8');
    expect(html).toMatch(/Total URLs:.*2/);
    expect(html).toMatch(/Success:.*1/);
    expect(html).toMatch(/Failed:.*1/);
  });

  it('includes Chart.js CDN script reference', () => {
    const data: ReportData = {
      timestamp: '2026-05-24T10:00:00.000Z',
      results: [makeSuccessResult('google.com', 150.0, 80.0, 20.0, 30.0, 10.0, 5.0, 15.0, 200)],
      options: makeCliOptions(),
    };
    generateReport(data, TEST_OUTPUT);
    const html = fs.readFileSync(TEST_OUTPUT, 'utf-8');
    expect(html).toContain('cdn.jsdelivr.net/npm/chart.js');
  });

  it('has 9 columns in thead: URL, Status, DNS, TCP, TLS, TTFB, Total, ICMP, TCP Ping', () => {
    const data: ReportData = {
      timestamp: '2026-05-24T10:00:00.000Z',
      results: [makeSuccessResult('google.com', 150.0, 80.0, 20.0, 30.0, 10.0, 5.0, 15.0, 200)],
      options: makeCliOptions(),
    };
    generateReport(data, TEST_OUTPUT);
    const html = fs.readFileSync(TEST_OUTPUT, 'utf-8');
    expect(html).toContain('URL');
    expect(html).toContain('Status');
    expect(html).toContain('DNS');
    expect(html).toContain('TCP');
    expect(html).toContain('TLS');
    expect(html).toContain('TTFB');
    expect(html).toContain('Total');
    expect(html).toContain('ICMP');
    expect(html).toContain('TCP Ping');
  });

  it('formats numeric values with 1 decimal place', () => {
    const data: ReportData = {
      timestamp: '2026-05-24T10:00:00.000Z',
      results: [makeSuccessResult('google.com', 150, 80, 20, 30, 10, 5, 15, 200)],
      options: makeCliOptions(),
    };
    generateReport(data, TEST_OUTPUT);
    const html = fs.readFileSync(TEST_OUTPUT, 'utf-8');
    // Should have ".0" decimal format
    expect(html).toMatch(/150\.0/);
    expect(html).toMatch(/80\.0/);
    expect(html).toMatch(/20\.0/);
  });

  it('handles mixed success/failure with 2 success + 1 failure', () => {
    const data: ReportData = {
      timestamp: '2026-05-24T10:00:00.000Z',
      results: [
        makeSuccessResult('google.com', 150.0, 80.0, 20.0, 30.0, 10.0, 5.0, 15.0, 200),
        makeFailureResult('bad.com', 'Connection timeout'),
        makeSuccessResult('github.com', 200.0, 100.0, 25.0, 35.0, 15.0, 8.0, 20.0, 200),
      ],
      options: makeCliOptions(),
    };
    generateReport(data, TEST_OUTPUT);
    const html = fs.readFileSync(TEST_OUTPUT, 'utf-8');
    // Should have 3 data rows (tbody tr elements)
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    expect(tbodyMatch).not.toBeNull();
    const trCount = (tbodyMatch![1].match(/<tr\s/g) || []).length;
    expect(trCount).toBe(3);
  });
});

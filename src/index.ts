import { parseArgs } from './cli.js';
import { parseCsv } from './csv-parser.js';
import { normalizeUrl } from './url-normalizer.js';
import { runTest } from './orchestrator.js';
import { generateReport } from './report-generator.js';
import { fileURLToPath } from 'url';
import type { UrlRecord, TestResult, CliOptions, ReportData, AverageMetrics } from './types.js';

const HELP_TEXT = `Usage: webspeedtest --csv <path> [--count <n>] [--output <path>] [--help]

Website speed testing tool.

Options:
  --csv <path>     Path to CSV file containing URLs (required)
  --count <n>      Number of test rounds per URL (default: 3)
  --output <path>  Output HTML report path (default: ./report.html)
  --help           Show this help message
`;

function createFailureResult(url: UrlRecord, failure: string): TestResult {
  const failureAverages: AverageMetrics = {
    ping: -1,
    tcpPing: -1,
    dnsTime: -1,
    tcpTime: -1,
    tlsTime: -1,
    ttfb: -1,
    totalTime: -1,
    statusCode: -1,
  };
  return {
    url,
    rounds: [],
    averages: failureAverages,
    failure,
  };
}

function helpAndExit(): never {
  console.log(HELP_TEXT);
  process.exit(0);
}

function printSummary(outputPath: string, results: TestResult[]): void {
  const successCount = results.filter((r) => r.failure === null).length;
  const failedCount = results.length - successCount;
  console.log(`Report generated: ${outputPath} | Success: ${successCount} | Failed: ${failedCount}`);
}

function determineExitCode(results: TestResult[], testedCount: number): number {
  if (testedCount === 0) return 2;
  const hasConnectionFailure = results.some(
    (r) => r.failure !== null && r.rounds.length > 0,
  );
  return hasConnectionFailure ? 1 : 0;
}

export async function main(): Promise<void> {
  const options: CliOptions = parseArgs(process.argv.slice(2));

  if (options.help) {
    helpAndExit();
  }

  const rawUrls: UrlRecord[] = parseCsv(options.csvPath);

  const seenNormalized = new Set<string>();
  const results: TestResult[] = [];
  let testedCount = 0;

  for (const rawUrl of rawUrls) {
    const normalized = normalizeUrl(rawUrl.raw);

    if (!normalized.valid) {
      results.push(createFailureResult(rawUrl, normalized.error ?? 'Invalid URL'));
      continue;
    }

    if (seenNormalized.has(normalized.normalized)) {
      console.error(`Duplicate URL skipped: ${rawUrl.raw} (normalized: ${normalized.normalized})`);
      continue;
    }
    seenNormalized.add(normalized.normalized);

    const urlWithNormalized: UrlRecord = {
      ...rawUrl,
      normalized: normalized.normalized,
    };

    const current = results.length + 1;
    const total = rawUrls.length;
    console.log(`--- Testing ${current}/${total} ---`);

    const result = await runTest(urlWithNormalized, { count: options.count });
    testedCount++;
    results.push(result);
  }

  const reportData: ReportData = {
    timestamp: new Date().toISOString(),
    results,
    options,
  };
  generateReport(reportData, options.outputPath);

  printSummary(options.outputPath, results);
  process.exit(determineExitCode(results, testedCount));
}

const thisFile = fileURLToPath(import.meta.url);
const entryPoint = process.argv[1];
if (entryPoint && (entryPoint === thisFile || entryPoint === `src/index.ts`)) {
  main();
}

export interface UrlRecord {
  raw: string;
  normalized: string;
  originalIndex: number;
}

export interface PingResult {
  min: number;
  max: number;
  avg: number;
  stddev: number;
  loss: number;
  rawOutput?: string;
}

export interface TcpPingResult {
  time: number;
  error?: string;
}

export interface HttpTimingResult {
  dnsTime: number;
  tcpTime: number;
  tlsTime: number;
  ttfb: number;
  totalTime: number;
  statusCode: number;
  protocol?: string;
  error?: string;
}

export interface AverageMetrics {
  ping: number;
  tcpPing: number;
  dnsTime: number;
  tcpTime: number;
  tlsTime: number;
  ttfb: number;
  totalTime: number;
  statusCode: number;
}

export interface TestRound {
  round: number;
  ping: PingResult;
  tcpPing: TcpPingResult;
  http: HttpTimingResult;
}

export interface TestResult {
  url: UrlRecord;
  rounds: TestRound[];
  averages: AverageMetrics;
  failure: string | null;
}

export interface CliOptions {
  csvPath: string;
  count: number;
  outputPath: string;
  help: boolean;
}

export interface ReportData {
  timestamp: string;
  results: TestResult[];
  options: CliOptions;
}

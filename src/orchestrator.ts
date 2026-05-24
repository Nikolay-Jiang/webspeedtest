import { icmpPing } from './icmp-ping.js';
import { tcpPing } from './tcp-ping.js';
import { measureHttpTiming } from './http-timing.js';
import type { UrlRecord, TestResult, TestRound, AverageMetrics } from './types.js';

function mode(values: number[]): number {
  const freq = new Map<number, number>();
  for (const v of values) {
    freq.set(v, (freq.get(v) ?? 0) + 1);
  }
  let best = values[0];
  let bestCount = 0;
  for (const [v, c] of freq) {
    if (c > bestCount || (c === bestCount && v > best)) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

export async function runTest(
  url: UrlRecord,
  options: { count: number },
): Promise<TestResult> {
  const rounds: TestRound[] = [];
  const parsed = new URL(url.normalized);
  const hostname = parsed.hostname;

  for (let i = 1; i <= options.count; i++) {
    const ping = await icmpPing(hostname);
    const tcp = await tcpPing(hostname, 443);
    const http = await measureHttpTiming(url.normalized);

    rounds.push({ round: i, ping, tcpPing: tcp, http });

    const httpError = http.error;
    if (httpError === undefined || httpError === null) {
      console.log(`[${i}/${options.count}] ${hostname} ✓ ${http.totalTime.toFixed(1)}ms`);
    } else {
      console.log(`[${i}/${options.count}] ${hostname} ✗ ${httpError}`);
    }

    if (i < options.count) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const successful = rounds.filter((r) => {
    const err = r.http.error;
    return err === undefined || err === null;
  });

  const failedCount = rounds.length - successful.length;
  let failure: string | null = null;
  let averages: AverageMetrics;

  if (successful.length === 0) {
    averages = {
      ping: -1,
      tcpPing: -1,
      dnsTime: -1,
      tcpTime: -1,
      tlsTime: -1,
      ttfb: -1,
      totalTime: -1,
      statusCode: -1,
    };
    failure = `All ${rounds.length} rounds failed`;
  } else {
    const n = successful.length;
    averages = {
      ping: successful.reduce((s, r) => s + r.ping.avg, 0) / n,
      tcpPing: successful.reduce((s, r) => s + r.tcpPing.time, 0) / n,
      dnsTime: successful.reduce((s, r) => s + r.http.dnsTime, 0) / n,
      tcpTime: successful.reduce((s, r) => s + r.http.tcpTime, 0) / n,
      tlsTime: successful.reduce((s, r) => s + r.http.tlsTime, 0) / n,
      ttfb: successful.reduce((s, r) => s + r.http.ttfb, 0) / n,
      totalTime: successful.reduce((s, r) => s + r.http.totalTime, 0) / n,
      statusCode: mode(successful.map((r) => r.http.statusCode)),
    };

    if (failedCount > 0) {
      failure = `${failedCount}/${rounds.length} rounds failed`;
    }
  }

  return { url, rounds, averages, failure };
}

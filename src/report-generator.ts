import * as fs from 'fs';
import type { ReportData, TestResult } from './types.js';

const CHARTJS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js';

function formatMs(value: number): string {
  if (value < 0) return '—';
  return value.toFixed(1);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateSummary(results: TestResult[]): string {
  const total = results.length;
  const successCount = results.filter(r => r.failure === null).length;
  const failureCount = total - successCount;

  return `
    <div class="summary">
      <div class="summary-item"><span class="summary-label">Total URLs:</span><span class="summary-value">${total}</span></div>
      <div class="summary-item"><span class="summary-label">Success:</span><span class="summary-value success">${successCount}</span></div>
      <div class="summary-item"><span class="summary-label">Failed:</span><span class="summary-value failure">${failureCount}</span></div>
    </div>
  `;
}

function generateTableRow(result: TestResult): string {
  const url = escapeHtml(result.url.raw);
  const isFailed = result.failure !== null;

  if (isFailed) {
    const errorText = escapeHtml(result.failure!);
    return `
      <tr class="failure-row">
        <td class="url-cell">${url}</td>
        <td class="status-cell error">${errorText}</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
      </tr>
    `;
  }

  const { averages } = result;
  return `
    <tr class="success-row">
      <td class="url-cell">${url}</td>
      <td class="status-cell">${averages.statusCode}</td>
      <td class="numeric">${formatMs(averages.dnsTime)}</td>
      <td class="numeric">${formatMs(averages.tcpTime)}</td>
      <td class="numeric">${formatMs(averages.tlsTime)}</td>
      <td class="numeric">${formatMs(averages.ttfb)}</td>
      <td class="numeric">${formatMs(averages.totalTime)}</td>
      <td class="numeric">${formatMs(averages.ping)}</td>
      <td class="numeric">${formatMs(averages.tcpPing)}</td>
    </tr>
  `;
}

function generateTable(results: TestResult[]): string {
  const sorted = [...results].sort((a, b) => {
    const aTime = a.failure === null ? a.averages.totalTime : Infinity;
    const bTime = b.failure === null ? b.averages.totalTime : Infinity;
    return aTime - bTime;
  });

  const rows = sorted.map(r => generateTableRow(r)).join('');

  return `
    <table>
      <thead>
        <tr>
          <th>URL</th>
          <th>Status</th>
          <th>DNS (ms)</th>
          <th>TCP (ms)</th>
          <th>TLS (ms)</th>
          <th>TTFB (ms)</th>
          <th>Total (ms)</th>
          <th>ICMP (ms)</th>
          <th>TCP Ping (ms)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function generateChartScript(results: TestResult[]): string {
  const successResults = results
    .filter(r => r.failure === null)
    .sort((a, b) => a.averages.totalTime - b.averages.totalTime);

  const labels = successResults.map(r => r.url.raw);
  const totalTimes = successResults.map(r => r.averages.totalTime);
  const ttfbTimes = successResults.map(r => r.averages.ttfb);
  const dnsTimes = successResults.map(r => r.averages.dnsTime);

  return `
    <script>
      (function() {
        try {
          var ctx = document.getElementById('speedChart');
          if (!ctx) return;
          new Chart(ctx, {
            type: 'bar',
            data: {
              labels: ${JSON.stringify(labels)},
              datasets: [
                { label: 'Total (ms)', data: ${JSON.stringify(totalTimes)}, backgroundColor: 'rgba(59, 130, 246, 0.7)' },
                { label: 'TTFB (ms)', data: ${JSON.stringify(ttfbTimes)}, backgroundColor: 'rgba(16, 185, 129, 0.7)' },
                { label: 'DNS (ms)', data: ${JSON.stringify(dnsTimes)}, backgroundColor: 'rgba(245, 158, 11, 0.7)' }
              ]
            },
            options: {
              responsive: true,
              scales: { y: { beginAtZero: true, title: { display: true, text: 'Time (ms)' } } },
              plugins: { legend: { position: 'top' } }
            }
          });
        } catch (e) {
          console.warn('Chart.js failed to initialize:', e);
        }
      })();
    </script>
  `;
}

function generateHtml(data: ReportData): string {
  const { timestamp, results } = data;
  const formattedDate = new Date(timestamp).toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Website Speed Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #1e293b; padding: 2rem; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem; color: #0f172a; }
    .github-link { font-size: 0.875rem; color: #3b82f6; margin-bottom: 0.25rem; }
    .github-link a { color: #3b82f6; text-decoration: none; }
    .github-link a:hover { text-decoration: underline; }
    .timestamp { font-size: 0.875rem; color: #64748b; margin-bottom: 1.5rem; }
    .summary { display: flex; gap: 2rem; padding: 1rem 1.5rem; background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 1.5rem; flex-wrap: wrap; }
    .summary-item { display: flex; flex-direction: column; }
    .summary-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .summary-value { font-size: 1.25rem; font-weight: 600; color: #0f172a; }
    .summary-value.success { color: #059669; }
    .summary-value.failure { color: #dc2626; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 1.5rem; }
    thead { background: #f1f5f9; }
    th { padding: 0.75rem 1rem; text-align: left; font-size: 0.75rem; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; }
    th.numeric { text-align: right; }
    td { padding: 0.75rem 1rem; font-size: 0.875rem; border-top: 1px solid #e2e8f0; }
    td.numeric { text-align: right; font-family: 'SF Mono', 'Fira Code', monospace; }
    .url-cell { font-weight: 500; color: #0f172a; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .status-cell { font-weight: 600; }
    .status-cell.error { color: #dc2626; }
    .failure-row { background: #fef2f2; }
    .success-row:hover { background: #f8fafc; }
    .chart-container { background: #fff; border-radius: 8px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .chart-container h2 { font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem; color: #0f172a; }
    canvas { max-height: 400px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Website Speed Test Report</h1>
    <p class="github-link"><a href="https://github.com/Nikolay-Jiang/webspeedtest" target="_blank" rel="noopener noreferrer">GitHub: Nikolay-Jiang/webspeedtest</a></p>
    <p class="timestamp">Generated: ${escapeHtml(formattedDate)}</p>
    ${generateSummary(results)}
    ${generateTable(results)}
    <div class="chart-container">
      <h2>Performance Comparison</h2>
      <canvas id="speedChart"></canvas>
    </div>
  </div>
  <script src="${CHARTJS_CDN}"></script>
  ${generateChartScript(results)}
</body>
</html>`;
}

export function generateReport(data: ReportData, outputPath: string): void {
  const html = generateHtml(data);
  fs.writeFileSync(outputPath, html, 'utf-8');
}

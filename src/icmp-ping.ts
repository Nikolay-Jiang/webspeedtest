import { execFile } from 'child_process'
import type { PingResult } from './types.js'

/**
 * Run an ICMP ping via the system `ping` command and parse the result.
 *
 * Returns a PingResult with parsed metrics. On failure (command not found,
 * 100% loss) returns -1 for numeric fields rather than throwing.
 */
export async function icmpPing(
  hostname: string,
  count: number = 3,
): Promise<PingResult> {
  const timeoutMs = count * 5000 + 5000

  return new Promise<PingResult>((resolve) => {
    execFile(
      'ping',
      ['-c', `${count}`, '-W', '5', hostname],
      { timeout: timeoutMs },
      (error, stdout) => {
        const output = stdout?.toString() ?? ''

        // Command not found → return unavailable signal
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          resolve({
            min: -1,
            max: -1,
            avg: -1,
            stddev: -1,
            loss: 100,
            rawOutput: output,
          } as PingResult)
          return
        }

        const lossMatch = output.match(/(\d+)% packet loss/)
        const loss = lossMatch ? Number(lossMatch[1]) : 100

        // Parse RTT line: rtt min/avg/max/mdev = 11.900/12.433/13.100/0.490 ms
        const rttMatch = output.match(
          /rtt min\/avg\/max\/mdev = ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+) ms/,
        )

        if (rttMatch) {
          resolve({
            min: Number(rttMatch[1]),
            avg: Number(rttMatch[2]),
            max: Number(rttMatch[3]),
            stddev: Number(rttMatch[4]),
            loss,
            rawOutput: output,
          })
        } else {
          resolve({
            min: -1,
            max: -1,
            avg: -1,
            stddev: -1,
            loss,
            rawOutput: output,
          })
        }
      },
    )
  })
}

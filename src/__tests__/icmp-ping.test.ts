import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFile } from 'child_process'
import { icmpPing } from '../icmp-ping.js'
import type { PingResult } from '../types.js'

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

describe('icmpPing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return valid RTT values for a reachable host', async () => {
    const mockOutput = [
      'PING 8.8.8.8 (8.8.8.8) 56(84) bytes of data.',
      '64 bytes from 8.8.8.8: icmp_seq=1 ttl=118 time=12.3 ms',
      '64 bytes from 8.8.8.8: icmp_seq=2 ttl=118 time=13.1 ms',
      '64 bytes from 8.8.8.8: icmp_seq=3 ttl=118 time=11.9 ms',
      '',
      '--- 8.8.8.8 ping statistics ---',
      '3 packets transmitted, 3 received, 0% packet loss, time 2004ms',
      'rtt min/avg/max/mdev = 11.900/12.433/13.100/0.490 ms',
    ].join('\n')

    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, mockOutput, '')
      return {} as any
    })

    const result = await icmpPing('8.8.8.8')
    expect(result.min).toBeCloseTo(11.9)
    expect(result.max).toBeCloseTo(13.1)
    expect(result.avg).toBeCloseTo(12.433)
    expect(result.stddev).toBeCloseTo(0.49)
    expect(result.loss).toBe(0)
    expect(result.rawOutput).toBe(mockOutput)
  })

  it('should parse RTT values for a domain name', async () => {
    const mockOutput = [
      'PING example.com (93.184.216.34) 56(84) bytes of data.',
      '64 bytes from 93.184.216.34: icmp_seq=1 ttl=118 time=45.2 ms',
      '64 bytes from 93.184.216.34: icmp_seq=2 ttl=118 time=44.8 ms',
      '64 bytes from 93.184.216.34: icmp_seq=3 ttl=118 time=46.1 ms',
      '',
      '--- example.com ping statistics ---',
      '3 packets transmitted, 3 received, 0% packet loss, time 2004ms',
      'rtt min/avg/max/mdev = 44.800/45.367/46.100/0.661 ms',
    ].join('\n')

    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, mockOutput, '')
      return {} as any
    })

    const result = await icmpPing('example.com')
    expect(result.min).toBeCloseTo(44.8)
    expect(result.max).toBeCloseTo(46.1)
    expect(result.avg).toBeCloseTo(45.367)
    expect(result.stddev).toBeCloseTo(0.661)
    expect(result.loss).toBe(0)
  })

  it('should return loss=100 and avg=-1 for an unreachable host', async () => {
    const mockOutput = [
      'PING 192.0.2.1 (192.0.2.1) 56(84) bytes of data.',
      '',
      '--- 192.0.2.1 ping statistics ---',
      '3 packets transmitted, 0 received, 100% packet loss, time 2004ms',
    ].join('\n')

    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      // ping exits with code 1 on 100% loss
      const error = new Error('ping failure') as any
      error.code = 1
      cb(error, mockOutput, '')
      return {} as any
    })

    const result = await icmpPing('192.0.2.1')
    expect(result.loss).toBe(100)
    expect(result.avg).toBe(-1)
  })

  it('should not throw when ping command is not found', async () => {
    const error = new Error('spawn ENOENT') as any
    error.code = 'ENOENT'

    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(error, '', '')
      return {} as any
    })

    const result = await icmpPing('8.8.8.8')
    expect(result.avg).toBe(-1)
    expect(result.loss).toBe(100)
  })
})

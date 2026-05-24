import { describe, it, expect } from 'vitest'
import { parseArgs } from '../cli.js'
import type { CliOptions } from '../types.js'

describe('parseArgs', () => {
  it('no args → throws', () => {
    expect(() => parseArgs([])).toThrow()
  })

  it('--help → returns help=true, no error', () => {
    const res = parseArgs(['--help'])
    // Expect a boolean help flag and no exception
    expect(res).toHaveProperty('help', true)
  })

  it('--csv test.csv → csvPath=test.csv, defaults', () => {
    const res = parseArgs(['--csv', 'test.csv'])
    expect(res.csvPath).toBe('test.csv')
    expect(res.count).toBe(3)
    expect(res.outputPath).toBe('./report.html')
    expect(res.help).toBe(false)
  })

  it('--csv test.csv --count 5 --output out.html → all custom values', () => {
    const res = parseArgs(['--csv', 'test.csv', '--count', '5', '--output', 'out.html'])
    expect(res.csvPath).toBe('test.csv')
    expect(res.count).toBe(5)
    expect(res.outputPath).toBe('out.html')
    expect(res.help).toBe(false)
  })

  it('--count 0 → throws', () => {
    expect(() => parseArgs(['--count', '0', '--csv', 'test.csv'])).toThrow()
  })

  it('--count -1 → throws', () => {
    expect(() => parseArgs(['--count', '-1', '--csv', 'test.csv'])).toThrow()
  })

  it('--csv test.csv --count abc → throws', () => {
    expect(() => parseArgs(['--csv', 'test.csv', '--count', 'abc'])).toThrow()
  })

  it('unknown arg --foo → throws', () => {
    expect(() => parseArgs(['--foo'])).toThrow()
  })
})

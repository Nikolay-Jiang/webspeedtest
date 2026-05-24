import { CliOptions } from './types.js'

// Simple, dependency-free CLI argument parser
// Supports:
// --csv <path> (required unless --help)
// --count <n> (optional, default 3, must be positive integer)
// --output <path> (optional, default ./report.html)
// --help (returns help=true, no error)
export function parseArgs(args: string[]): CliOptions {
  const used = new Set<string>()
  let csvPath: string | undefined
  let count = 3
  let outputPath = './report.html'
  let help = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`)
    }
    if (used.has(arg)) {
      throw new Error(`Duplicate argument: ${arg}`)
    }
    used.add(arg)

    switch (arg) {
      case '--help':
        help = true
        break
      case '--csv': {
        const val = args[i + 1]
        if (val === undefined || val.startsWith('--')) {
          throw new Error('Missing value for --csv')
        }
        csvPath = val
        i++
        break
      }
      case '--count': {
        const val = args[i + 1]
        if (val === undefined || val.startsWith('--')) {
          throw new Error('Missing value for --count')
        }
        const n = Number(val)
        if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
          throw new Error('Invalid value for --count')
        }
        count = n
        i++
        break
      }
      case '--output': {
        const val = args[i + 1]
        if (val === undefined || val.startsWith('--')) {
          throw new Error('Missing value for --output')
        }
        outputPath = val
        i++
        break
      }
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (help) {
    // Return a help object. csvPath may be empty string until user decides.
    return { csvPath: csvPath ?? '', count, outputPath, help }
  }

  if (!csvPath) {
    throw new Error('Missing required --csv argument')
  }

  return { csvPath, count, outputPath, help }
}

export default parseArgs

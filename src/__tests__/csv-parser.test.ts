import { describe, it, expect } from 'vitest';
import { parseCsv } from '../csv-parser.js';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function createTempCsv(content: string): string {
  const path = join(tmpdir(), `test-${Date.now()}.csv`);
  writeFileSync(path, content, 'utf-8');
  return path;
}

describe('parseCsv', () => {
  it('empty file → throws', () => {
    const path = createTempCsv('');
    expect(() => parseCsv(path)).toThrow();
    unlinkSync(path);
  });

  it('only comments and blank lines → throws', () => {
    const path = createTempCsv('# comment\n\n  \n# another');
    expect(() => parseCsv(path)).toThrow();
    unlinkSync(path);
  });

  it('single column URLs (no header) → parses correctly', () => {
    const path = createTempCsv('google.com\ngithub.com\nstackoverflow.com');
    const result = parseCsv(path);
    expect(result).toHaveLength(3);
    expect(result[0].raw).toBe('google.com');
    expect(result[1].raw).toBe('github.com');
    expect(result[2].raw).toBe('stackoverflow.com');
    expect(result[0].originalIndex).toBe(1);
    expect(result[1].originalIndex).toBe(2);
    expect(result[2].originalIndex).toBe(3);
    unlinkSync(path);
  });

  it('CSV with header (url as first row) → skips header', () => {
    const path = createTempCsv('url\ngoogle.com\ngithub.com');
    const result = parseCsv(path);
    expect(result).toHaveLength(2);
    expect(result[0].raw).toBe('google.com');
    expect(result[1].raw).toBe('github.com');
    unlinkSync(path);
  });

  it('mixed empty lines, comments, URLs → filters correctly', () => {
    const path = createTempCsv('# header\n\ngoogle.com\n\n# comment\ngithub.com');
    const result = parseCsv(path);
    expect(result).toHaveLength(2);
    expect(result[0].raw).toBe('google.com');
    expect(result[1].raw).toBe('github.com');
    unlinkSync(path);
  });

  it('BOM header file → parses correctly', () => {
    const path = join(tmpdir(), `test-bom-${Date.now()}.csv`);
    writeFileSync(path, '\uFEFFgoogle.com\ngithub.com', 'utf-8');
    const result = parseCsv(path);
    expect(result).toHaveLength(2);
    expect(result[0].raw).toBe('google.com');
    unlinkSync(path);
  });

  it('file not found → throws', () => {
    expect(() => parseCsv('/nonexistent/path/file.csv')).toThrow();
  });
});

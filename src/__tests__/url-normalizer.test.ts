import { describe, it, expect } from 'vitest';
import { normalizeUrl } from '../url-normalizer.js';

describe('normalizeUrl', () => {
  it('normalizes plain host without scheme (google.com)', () => {
    const res = normalizeUrl('google.com');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('https://google.com/');
  });

  it('keeps existing absolute URL with trailing slash', () => {
    const res = normalizeUrl('https://github.com');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('https://github.com/');
  });

  it('preserves ports and scheme', () => {
    const res = normalizeUrl('http://example.com:8080');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('http://example.com:8080/');
  });

  it('strips user credentials from URL', () => {
    const res = normalizeUrl('https://user:pass@example.com');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('https://example.com/');
  });

  it('invalid input becomes invalid', () => {
    const res = normalizeUrl('not a url!!!');
    expect(res.valid).toBe(false);
  });

  it('trims whitespace and normalizes', () => {
    const res = normalizeUrl('  example.com  ');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('https://example.com/');
  });

  it('preserves full path and query', () => {
    const res = normalizeUrl('https://sub.domain.com/path?q=1');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('https://sub.domain.com/path?q=1');
  });
});

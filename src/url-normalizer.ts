export type NormalizeResult = {
  normalized: string;
  valid: boolean;
  error?: string;
};

/**
 * Normalize a user-provided URL string.
 *
 * Rules (in order):
 * 1) Trim whitespace
 * 2) If missing a scheme, prepend https://
 * 3) Validate via new URL()
 * 4) Strip credentials from the URL for security
 * 5) Preserve port and path
 * 6) Return { normalized, valid, error? }
 */
export function normalizeUrl(raw: string): NormalizeResult {
  const trimmed = raw.trim();
  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    // Strip any credentials for security
    url.username = '';
    url.password = '';
    // Use the URL's canonical string representation
    const normalized = url.toString();
    return { normalized, valid: true };
  } catch (e) {
    const err = (e as Error)?.message ?? 'Invalid URL';
    return { normalized: '', valid: false, error: err };
  }
}

/**
 * SSRF Protection and Base URL validation for external DeyeCloud endpoints
 */

const ALLOWED_DEYE_HOSTS = new Set([
  'api.deyecloud.com',
  'eu1-developer.deyecloud.com',
  'us1-developer.deyecloud.com',
  'india-developer.deyecloud.com',
  'developer.deyecloud.com',
]);

const PRIVATE_IP_REGEX = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.|0\.|localhost|::1|fc00:|fe80:)/i;

/**
 * Validates whether a provided external API base URL is permitted.
 * Blocks private networks, AWS/GCP/Azure metadata services, localhost, and non-HTTPS protocols.
 */
export function isValidDeyeBaseUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;

  try {
    const parsed = new URL(rawUrl.trim());

    // Only allow HTTPS protocol
    if (parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check against allowed host allowlist or *.deyecloud.com domain
    if (ALLOWED_DEYE_HOSTS.has(hostname) || hostname.endsWith('.deyecloud.com')) {
      return true;
    }

    // Check if hostname matches any private IP pattern
    if (PRIVATE_IP_REGEX.test(hostname)) {
      return false;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Sanitize or fallback a base URL to a known safe default
 */
export function sanitizeDeyeBaseUrl(rawUrl?: string): string {
  if (rawUrl && isValidDeyeBaseUrl(rawUrl)) {
    return rawUrl.trim().replace(/\/+$/, '');
  }
  return 'https://eu1-developer.deyecloud.com';
}

/**
 * Validates whether a provided Directus base URL is permitted.
 * Blocks cloud metadata (169.254.169.254), non-HTTP(S) protocols, and enforces HTTPS in production.
 */
export function isValidDirectusBaseUrl(rawUrl: string, isProduction: boolean = false): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;

  try {
    const parsed = new URL(rawUrl.trim());

    // In production, enforce HTTPS
    if (isProduction && parsed.protocol !== 'https:') {
      return false;
    }

    // Must be HTTP or HTTPS
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // In production, prohibit private IP ranges and cloud metadata services
    if (isProduction && PRIVATE_IP_REGEX.test(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize Directus base URL, removing trailing slashes
 */
export function sanitizeDirectusBaseUrl(rawUrl?: string, isProduction: boolean = false): string {
  if (rawUrl && isValidDirectusBaseUrl(rawUrl, isProduction)) {
    return rawUrl.trim().replace(/\/+$/, '');
  }
  return isProduction ? 'https://directus.internal' : 'http://localhost:8056';
}

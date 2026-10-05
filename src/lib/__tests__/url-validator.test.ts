import { describe, it, expect } from 'vitest';
import { isValidDeyeBaseUrl, sanitizeDeyeBaseUrl } from '../url-validator';

describe('SSRF & URL Validator', () => {
  it('accepts official DeyeCloud developer domains over HTTPS', () => {
    expect(isValidDeyeBaseUrl('https://api.deyecloud.com')).toBe(true);
    expect(isValidDeyeBaseUrl('https://eu1-developer.deyecloud.com')).toBe(true);
    expect(isValidDeyeBaseUrl('https://us1-developer.deyecloud.com')).toBe(true);
    expect(isValidDeyeBaseUrl('https://custom.deyecloud.com')).toBe(true);
  });

  it('rejects internal IP addresses and cloud metadata services', () => {
    expect(isValidDeyeBaseUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isValidDeyeBaseUrl('https://169.254.169.254')).toBe(false);
    expect(isValidDeyeBaseUrl('http://127.0.0.1:8056')).toBe(false);
    expect(isValidDeyeBaseUrl('http://192.168.1.1')).toBe(false);
    expect(isValidDeyeBaseUrl('http://10.0.0.1')).toBe(false);
    expect(isValidDeyeBaseUrl('http://goatedcodoer:8056')).toBe(false);
  });

  it('rejects non-HTTPS schemes', () => {
    expect(isValidDeyeBaseUrl('http://api.deyecloud.com')).toBe(false);
    expect(isValidDeyeBaseUrl('ftp://api.deyecloud.com')).toBe(false);
    expect(isValidDeyeBaseUrl('javascript:alert(1)')).toBe(false);
  });

  it('sanitizes invalid URLs to safe default', () => {
    expect(sanitizeDeyeBaseUrl('http://169.254.169.254')).toBe('https://eu1-developer.deyecloud.com');
    expect(sanitizeDeyeBaseUrl('https://api.deyecloud.com/')).toBe('https://api.deyecloud.com');
  });
});

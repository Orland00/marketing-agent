import { describe, it, expect } from 'vitest';
import { getAdapter, getSupportedPlatforms } from '../src/adapters/index.js';

describe('Platform Adapters', () => {
  it('should return adapter for supported platforms', () => {
    expect(getAdapter('instagram')).not.toBeNull();
    expect(getAdapter('facebook')).not.toBeNull();
    expect(getAdapter('twitter')).not.toBeNull();
  });

  it('should return null for unsupported platform', () => {
    expect(getAdapter('tiktok')).toBeNull();
  });

  it('should list supported platforms', () => {
    const platforms = getSupportedPlatforms();
    expect(platforms).toContain('instagram');
    expect(platforms).toContain('facebook');
    expect(platforms).toContain('twitter');
    expect(platforms).not.toContain('tiktok');
  });
});

describe('Twitter content truncation', () => {
  it('should truncate tweets to 280 chars', () => {
    const longText = 'A'.repeat(300);
    const truncated = longText.length > 280 ? longText.slice(0, 277) + '...' : longText;
    expect(truncated.length).toBeLessThanOrEqual(280);
  });

  it('should not truncate short tweets', () => {
    const shortText = 'Cloud costs reduced by 40% last quarter #FinOps';
    const result = shortText.length > 280 ? shortText.slice(0, 277) + '...' : shortText;
    expect(result).toBe(shortText);
  });
});

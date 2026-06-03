import { describe, it, expect } from 'vitest';
import { percentEncode, hmacSha1, generateOAuthHeader } from '../src/adapters/twitter.js';

describe('Twitter OAuth 1.0a', () => {
  describe('percentEncode', () => {
    it('should encode spaces as %20', () => {
      expect(percentEncode('hello world')).toBe('hello%20world');
    });

    it('should encode special characters per RFC 3986', () => {
      expect(percentEncode('Ladies + Gentlemen')).toBe('Ladies%20%2B%20Gentlemen');
    });

    it('should encode exclamation marks', () => {
      expect(percentEncode('test!')).toBe('test%21');
    });

    it('should not encode unreserved characters', () => {
      expect(percentEncode('abcABC123-._~')).toBe('abcABC123-._~');
    });

    it('should encode forward slashes', () => {
      expect(percentEncode('https://example.com/path')).toBe('https%3A%2F%2Fexample.com%2Fpath');
    });
  });

  describe('hmacSha1', () => {
    it('should produce correct HMAC-SHA1 signature', async () => {
      // Known test vector: HMAC-SHA1("key", "The quick brown fox jumps over the lazy dog")
      // Expected: de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9 (hex)
      // In base64: 3nybhbi3iqa8ino29wqQcBydtNk=
      const result = await hmacSha1('key', 'The quick brown fox jumps over the lazy dog');
      expect(result).toBe('3nybhbi3iqa8ino29wqQcBydtNk=');
    });

    it('should produce consistent signature for same inputs', async () => {
      const result1 = await hmacSha1('key', 'test message');
      const result2 = await hmacSha1('key', 'test message');
      expect(result1).toBe(result2);
    });
  });

  describe('generateOAuthHeader', () => {
    it('should produce a valid OAuth header format', async () => {
      const header = await generateOAuthHeader(
        'POST',
        'https://api.twitter.com/2/tweets',
        {},
        {
          apiKey: 'testConsumerKey',
          apiSecret: 'testConsumerSecret',
          accessToken: 'testAccessToken',
          accessSecret: 'testAccessSecret',
        }
      );

      expect(header).toMatch(/^OAuth /);
      expect(header).toContain('oauth_consumer_key="testConsumerKey"');
      expect(header).toContain('oauth_signature_method="HMAC-SHA1"');
      expect(header).toContain('oauth_token="testAccessToken"');
      expect(header).toContain('oauth_version="1.0"');
      expect(header).toContain('oauth_signature=');
      expect(header).toContain('oauth_nonce=');
      expect(header).toContain('oauth_timestamp=');
    });

    it('should include query params in signature base string', async () => {
      const header1 = await generateOAuthHeader(
        'GET',
        'https://api.twitter.com/2/tweets/123',
        { 'tweet.fields': 'public_metrics' },
        {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessSecret: 'tokenSecret',
        }
      );

      const header2 = await generateOAuthHeader(
        'GET',
        'https://api.twitter.com/2/tweets/123',
        {},
        {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessSecret: 'tokenSecret',
        }
      );

      // Different params should produce different signatures
      const sig1 = header1.match(/oauth_signature="([^"]+)"/)?.[1];
      const sig2 = header2.match(/oauth_signature="([^"]+)"/)?.[1];
      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for GET vs POST', async () => {
      const creds = {
        apiKey: 'key',
        apiSecret: 'secret',
        accessToken: 'token',
        accessSecret: 'tokenSecret',
      };

      const getHeader = await generateOAuthHeader('GET', 'https://api.twitter.com/2/tweets', {}, creds);
      const postHeader = await generateOAuthHeader('POST', 'https://api.twitter.com/2/tweets', {}, creds);

      const getSig = getHeader.match(/oauth_signature="([^"]+)"/)?.[1];
      const postSig = postHeader.match(/oauth_signature="([^"]+)"/)?.[1];
      expect(getSig).not.toBe(postSig);
    });
  });
});

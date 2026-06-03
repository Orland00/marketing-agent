import type {
  PlatformAdapter,
  PlatformAccounts,
  PlatformPost,
  PostMetrics,
  PublishResult,
} from '../types.js';

const TWITTER_API = 'https://api.twitter.com/2';

interface OAuthCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

// RFC 3986 percent-encoding (stricter than encodeURIComponent)
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

// HMAC-SHA1 using Web Crypto API (available in CF Workers)
async function hmacSha1(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  // Convert ArrayBuffer to base64
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function generateOAuthHeader(
  method: string,
  url: string,
  params: Record<string, string>,
  credentials: OAuthCredentials
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID().replace(/-/g, '');

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: credentials.accessToken,
    oauth_version: '1.0',
  };

  // Combine OAuth params + request params for signature base string
  const allParams = { ...params, ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join('&');

  // Strip query string from URL for base string
  const baseUrl = url.split('?')[0];

  const baseString = [
    method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(paramString),
  ].join('&');

  const signingKey = `${percentEncode(credentials.apiSecret)}&${percentEncode(credentials.accessSecret)}`;

  const signature = await hmacSha1(signingKey, baseString);
  oauthParams.oauth_signature = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(', ');

  return `OAuth ${headerParts}`;
}

// Exported for testing
export { hmacSha1, percentEncode, generateOAuthHeader };

export class TwitterAdapter implements PlatformAdapter {
  platform = 'twitter' as const;

  async publish(
    post: PlatformPost,
    accounts: PlatformAccounts
  ): Promise<PublishResult> {
    const tw = accounts.twitter;
    if (!tw) return { success: false, error: 'Twitter account not configured' };

    try {
      // Build tweet text with hashtags, respecting 280 char limit
      let text = post.text;
      if (post.hashtags?.length) {
        const hashtagStr = post.hashtags.join(' ');
        const maxTextLen = 280 - hashtagStr.length - 1;
        if (text.length > maxTextLen) {
          text = text.slice(0, maxTextLen - 3) + '...';
        }
        text = `${text} ${hashtagStr}`;
      }
      if (text.length > 280) {
        text = text.slice(0, 277) + '...';
      }

      const url = `${TWITTER_API}/tweets`;
      const authHeader = await generateOAuthHeader('POST', url, {}, {
        apiKey: tw.api_key,
        apiSecret: tw.api_secret,
        accessToken: tw.access_token,
        accessSecret: tw.access_secret,
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      const data = (await res.json()) as {
        data?: { id: string };
        errors?: Array<{ message: string }>;
      };

      if (data.errors?.length) {
        return { success: false, error: data.errors[0].message };
      }

      const tweetId = data.data?.id;
      return {
        success: true,
        platformPostId: tweetId,
        postUrl: tweetId ? `https://twitter.com/i/web/status/${tweetId}` : undefined,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  async getMetrics(
    platformPostId: string,
    accounts: PlatformAccounts
  ): Promise<PostMetrics> {
    const tw = accounts.twitter;
    if (!tw) throw new Error('Twitter account not configured');

    const url = `${TWITTER_API}/tweets/${platformPostId}?tweet.fields=public_metrics`;
    const authHeader = await generateOAuthHeader('GET', url.split('?')[0], { 'tweet.fields': 'public_metrics' }, {
      apiKey: tw.api_key,
      apiSecret: tw.api_secret,
      accessToken: tw.access_token,
      accessSecret: tw.access_secret,
    });

    const res = await fetch(url, {
      headers: { Authorization: authHeader },
    });

    const data = (await res.json()) as {
      data?: {
        public_metrics?: {
          impression_count?: number;
          like_count?: number;
          reply_count?: number;
          retweet_count?: number;
          bookmark_count?: number;
        };
      };
    };

    const m = data.data?.public_metrics;
    return {
      impressions: m?.impression_count || 0,
      reach: m?.impression_count || 0,
      likes: m?.like_count || 0,
      comments: m?.reply_count || 0,
      shares: m?.retweet_count || 0,
      saves: m?.bookmark_count || 0,
      clicks: 0,
    };
  }
}

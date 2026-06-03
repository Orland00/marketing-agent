import { describe, it, expect } from 'vitest';
import {
  validateRequired,
  validateSlug,
  validateLength,
  validateEnum,
  validateFutureDate,
  validatePlatforms,
  validateProduct,
  validateGenerateRequest,
  validateApproveRequest,
} from '../src/lib/validation.js';

describe('validateRequired', () => {
  it('returns error for null', () => expect(validateRequired(null, 'x')).not.toBeNull());
  it('returns error for undefined', () => expect(validateRequired(undefined, 'x')).not.toBeNull());
  it('returns error for empty string', () => expect(validateRequired('', 'x')).not.toBeNull());
  it('returns null for valid value', () => expect(validateRequired('hello', 'x')).toBeNull());
  it('returns null for number 0', () => expect(validateRequired(0, 'x')).toBeNull());
});

describe('validateSlug', () => {
  it('accepts valid slug', () => expect(validateSlug('demo')).toBeNull());
  it('accepts single word', () => expect(validateSlug('acme')).toBeNull());
  it('rejects uppercase', () => expect(validateSlug('DemoBrand')).not.toBeNull());
  it('rejects spaces', () => expect(validateSlug('demo brand')).not.toBeNull());
  it('rejects too short', () => expect(validateSlug('a')).not.toBeNull());
  it('rejects special chars', () => expect(validateSlug('demo_brand!')).not.toBeNull());
  it('rejects leading hyphen', () => expect(validateSlug('-demo')).not.toBeNull());
});

describe('validateLength', () => {
  it('accepts within range', () => expect(validateLength('hello', 'f', 1, 10)).toBeNull());
  it('rejects too short', () => expect(validateLength('', 'f', 1, 10)).not.toBeNull());
  it('rejects too long', () => expect(validateLength('x'.repeat(11), 'f', 1, 10)).not.toBeNull());
});

describe('validateEnum', () => {
  it('accepts valid value', () => expect(validateEnum('es', 'f', ['es', 'en'])).toBeNull());
  it('rejects invalid value', () => expect(validateEnum('fr', 'f', ['es', 'en'])).not.toBeNull());
});

describe('validateFutureDate', () => {
  it('accepts future date', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(validateFutureDate(future, 'f')).toBeNull();
  });
  it('rejects past date', () => {
    expect(validateFutureDate('2020-01-01T00:00:00Z', 'f')).not.toBeNull();
  });
  it('rejects invalid date string', () => {
    expect(validateFutureDate('not-a-date', 'f')).not.toBeNull();
  });
});

describe('validatePlatforms', () => {
  it('accepts valid platforms', () => expect(validatePlatforms(['instagram', 'facebook'])).toBeNull());
  it('rejects invalid platform', () => expect(validatePlatforms(['instagram', 'myspace'])).not.toBeNull());
  it('rejects non-array', () => expect(validatePlatforms('instagram')).not.toBeNull());
  it('accepts empty array', () => expect(validatePlatforms([])).toBeNull());
});

describe('validateProduct', () => {
  it('accepts valid create', () => {
    expect(validateProduct({
      slug: 'test-brand',
      name: 'Test Brand',
      brand_voice: 'Friendly',
      target_audience: 'Everyone',
    }, true)).toBeNull();
  });

  it('rejects create without slug', () => {
    expect(validateProduct({ name: 'Test' }, true)).not.toBeNull();
  });

  it('accepts update without slug', () => {
    expect(validateProduct({ name: 'New Name' }, false)).toBeNull();
  });

  it('rejects invalid language', () => {
    expect(validateProduct({ default_language: 'fr' }, false)).not.toBeNull();
  });
});

describe('validateGenerateRequest', () => {
  it('accepts valid request', () => {
    expect(validateGenerateRequest({ topic: 'coffee promo', platforms: ['instagram'] })).toBeNull();
  });

  it('rejects missing topic', () => {
    expect(validateGenerateRequest({ platforms: ['instagram'] })).not.toBeNull();
  });

  it('rejects invalid platform', () => {
    expect(validateGenerateRequest({ topic: 'test', platforms: ['snapchat'] })).not.toBeNull();
  });
});

describe('validateApproveRequest', () => {
  it('accepts empty body', () => {
    expect(validateApproveRequest({})).toBeNull();
  });

  it('accepts valid future date', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(validateApproveRequest({ scheduled_at: future })).toBeNull();
  });

  it('rejects past date', () => {
    expect(validateApproveRequest({ scheduled_at: '2020-01-01T00:00:00Z' })).not.toBeNull();
  });
});

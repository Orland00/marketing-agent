const VALID_PLATFORMS = ['instagram', 'facebook', 'twitter', 'tiktok'];
const VALID_POST_STATUSES = [
  'draft', 'pending_approval', 'approved', 'scheduled',
  'publishing', 'published', 'failed', 'cancelled',
];
const VALID_CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'completed'];
const VALID_LANGUAGES = ['es', 'en'];

export function validateRequired(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') {
    return `${field} is required`;
  }
  return null;
}

export function validateSlug(value: unknown): string | null {
  if (typeof value !== 'string') return 'slug must be a string';
  if (value.length < 2 || value.length > 50) return 'slug must be 2-50 characters';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) {
    return 'slug must be lowercase alphanumeric with hyphens (e.g., demo)';
  }
  return null;
}

export function validateLength(
  value: unknown,
  field: string,
  min: number,
  max: number
): string | null {
  if (typeof value !== 'string') return `${field} must be a string`;
  if (value.length < min) return `${field} must be at least ${min} characters`;
  if (value.length > max) return `${field} must be at most ${max} characters`;
  return null;
}

export function validateEnum(
  value: unknown,
  field: string,
  allowed: string[]
): string | null {
  if (typeof value !== 'string') return `${field} must be a string`;
  if (!allowed.includes(value)) {
    return `${field} must be one of: ${allowed.join(', ')}`;
  }
  return null;
}

export function validateFutureDate(value: unknown, field: string): string | null {
  if (typeof value !== 'string') return `${field} must be an ISO date string`;
  const date = new Date(value);
  if (isNaN(date.getTime())) return `${field} is not a valid date`;
  if (date <= new Date()) return `${field} must be in the future`;
  return null;
}

export function validatePlatforms(value: unknown): string | null {
  if (!Array.isArray(value)) return 'platforms must be an array';
  for (const p of value) {
    if (!VALID_PLATFORMS.includes(p)) {
      return `invalid platform: ${p}. Valid: ${VALID_PLATFORMS.join(', ')}`;
    }
  }
  return null;
}

// Validate product creation/update
export function validateProduct(body: Record<string, unknown>, isCreate: boolean): string | null {
  if (isCreate) {
    const slugErr = validateSlug(body.slug);
    if (slugErr) return slugErr;

    const nameErr = validateRequired(body.name, 'name');
    if (nameErr) return nameErr;

    const voiceErr = validateRequired(body.brand_voice, 'brand_voice');
    if (voiceErr) return voiceErr;

    const audErr = validateRequired(body.target_audience, 'target_audience');
    if (audErr) return audErr;
  }

  if (body.name !== undefined) {
    const err = validateLength(body.name, 'name', 1, 100);
    if (err) return err;
  }

  if (body.brand_voice !== undefined) {
    const err = validateLength(body.brand_voice, 'brand_voice', 1, 2000);
    if (err) return err;
  }

  if (body.default_language !== undefined) {
    const err = validateEnum(body.default_language, 'default_language', VALID_LANGUAGES);
    if (err) return err;
  }

  return null;
}

// Validate post generation request
export function validateGenerateRequest(body: Record<string, unknown>): string | null {
  const topicErr = validateRequired(body.topic, 'topic');
  if (topicErr) return topicErr;

  if (typeof body.topic === 'string' && body.topic.length > 500) {
    return 'topic must be at most 500 characters';
  }

  if (body.platforms !== undefined) {
    const err = validatePlatforms(body.platforms);
    if (err) return err;
  }

  return null;
}

// Validate approve request
export function validateApproveRequest(body: Record<string, unknown>): string | null {
  if (body.scheduled_at !== undefined && body.scheduled_at !== null) {
    const err = validateFutureDate(body.scheduled_at, 'scheduled_at');
    if (err) return err;
  }
  return null;
}

export {
  VALID_PLATFORMS,
  VALID_POST_STATUSES,
  VALID_CAMPAIGN_STATUSES,
  VALID_LANGUAGES,
};

import { Hono } from 'hono';
import type { Env, PlatformAccounts } from '../types.js';
import { createSupabaseClient } from '../lib/supabase.js';

const settingsApi = new Hono<{ Bindings: Env }>();

// GET /:slug — Return product config with connection status (no tokens)
settingsApi.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const supabase = createSupabaseClient(c.env);

  const { data, error } = await supabase
    .from('mkt_products')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !data) return c.json({ error: `Product "${slug}" not found` }, 404);

  const accounts: PlatformAccounts = data.accounts ?? {};

  return c.json({
    data: {
      slug: data.slug,
      name: data.name,
      brand_voice: data.brand_voice,
      target_audience: data.target_audience,
      default_language: data.default_language,
      hashtags: data.hashtags,
      visual_style: data.visual_style,
      posting_frequency: data.posting_frequency,
      active: data.active,
      has_instagram: !!accounts.instagram,
      has_facebook: !!accounts.facebook,
      has_twitter: !!accounts.twitter,
    },
  });
});

// GET /:slug/detail — Config detail including non-secret page_ids
settingsApi.get('/:slug/detail', async (c) => {
  const slug = c.req.param('slug');
  const supabase = createSupabaseClient(c.env);

  const { data, error } = await supabase
    .from('mkt_products')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !data) return c.json({ error: `Product "${slug}" not found` }, 404);

  const accounts: PlatformAccounts = data.accounts ?? {};

  return c.json({
    data: {
      slug: data.slug,
      name: data.name,
      brand_voice: data.brand_voice,
      target_audience: data.target_audience,
      default_language: data.default_language,
      hashtags: data.hashtags,
      visual_style: data.visual_style,
      posting_frequency: data.posting_frequency,
      active: data.active,
      has_instagram: !!accounts.instagram,
      has_facebook: !!accounts.facebook,
      has_twitter: !!accounts.twitter,
      instagram_page_id: accounts.instagram?.page_id ?? null,
      facebook_page_id: accounts.facebook?.page_id ?? null,
    },
  });
});

// PUT /:slug — Update brand config fields
settingsApi.put('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const supabase = createSupabaseClient(c.env);

  let body: {
    brand_voice?: string;
    target_audience?: string;
    default_language?: string;
    hashtags?: string[];
    visual_style?: string;
    posting_frequency?: Record<string, number>;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.brand_voice !== undefined) updates.brand_voice = body.brand_voice;
  if (body.target_audience !== undefined) updates.target_audience = body.target_audience;
  if (body.default_language !== undefined) updates.default_language = body.default_language;
  if (body.hashtags !== undefined) updates.hashtags = body.hashtags;
  if (body.visual_style !== undefined) updates.visual_style = body.visual_style;
  if (body.posting_frequency !== undefined) updates.posting_frequency = body.posting_frequency;

  const { error } = await supabase
    .from('mkt_products')
    .update(updates)
    .eq('slug', slug);

  if (error) return c.json({ error: error.message }, 500);

  return c.json({ ok: true });
});

// PUT /:slug/accounts — Update platform credentials
settingsApi.put('/:slug/accounts', async (c) => {
  const slug = c.req.param('slug');
  const supabase = createSupabaseClient(c.env);

  let body: {
    platform: 'instagram' | 'facebook' | 'twitter';
    page_id?: string;
    access_token: string;
    api_key?: string;
    api_secret?: string;
    access_secret?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { platform, page_id, access_token, api_key, api_secret, access_secret } = body;

  if (!platform || !['instagram', 'facebook', 'twitter'].includes(platform)) {
    return c.json({ error: 'Invalid platform' }, 400);
  }
  if (!access_token) {
    return c.json({ error: 'access_token is required' }, 400);
  }

  const { data: existing, error: fetchError } = await supabase
    .from('mkt_products')
    .select('accounts')
    .eq('slug', slug)
    .single();

  if (fetchError || !existing) return c.json({ error: `Product "${slug}" not found` }, 404);

  const accounts: PlatformAccounts = existing.accounts ?? {};

  if (platform === 'instagram') {
    accounts.instagram = { page_id: page_id ?? '', access_token };
  } else if (platform === 'facebook') {
    accounts.facebook = { page_id: page_id ?? '', access_token };
  } else if (platform === 'twitter') {
    if (!api_key || !api_secret || !access_secret) {
      return c.json({ error: 'api_key, api_secret, and access_secret are required for Twitter' }, 400);
    }
    accounts.twitter = { api_key, api_secret, access_token, access_secret };
  }

  const { error: updateError } = await supabase
    .from('mkt_products')
    .update({ accounts, updated_at: new Date().toISOString() })
    .eq('slug', slug);

  if (updateError) return c.json({ error: updateError.message }, 500);

  return c.json({ ok: true, platform, connected: true });
});

// DELETE /:slug/accounts/:platform — Disconnect a platform
settingsApi.delete('/:slug/accounts/:platform', async (c) => {
  const slug = c.req.param('slug');
  const platform = c.req.param('platform') as keyof PlatformAccounts;
  const supabase = createSupabaseClient(c.env);

  if (!['instagram', 'facebook', 'twitter', 'tiktok'].includes(platform)) {
    return c.json({ error: 'Invalid platform' }, 400);
  }

  const { data: existing, error: fetchError } = await supabase
    .from('mkt_products')
    .select('accounts')
    .eq('slug', slug)
    .single();

  if (fetchError || !existing) return c.json({ error: `Product "${slug}" not found` }, 404);

  const accounts: PlatformAccounts = existing.accounts ?? {};
  delete accounts[platform];

  const { error: updateError } = await supabase
    .from('mkt_products')
    .update({ accounts, updated_at: new Date().toISOString() })
    .eq('slug', slug);

  if (updateError) return c.json({ error: updateError.message }, 500);

  return c.json({ ok: true, platform, connected: false });
});

// GET / — list all products
settingsApi.get('/', async (c) => {
  const supabase = createSupabaseClient(c.env);

  const { data, error } = await supabase
    .from('mkt_products')
    .select('slug, name, active, default_language, hashtags')
    .order('name');

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data });
});

export default settingsApi;

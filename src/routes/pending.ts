import { Hono } from 'hono';
import type { Env } from '../types.js';
import { createSupabaseClient } from '../lib/supabase.js';
import { resolveProduct } from '../lib/product.js';
import { generateContent } from '../lib/ai.js';
import { log } from '../lib/logger.js';

const pending = new Hono<{ Bindings: Env }>();

// GET /:slug — list pending posts for a product
pending.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const db = createSupabaseClient(c.env);

  const product = await resolveProduct(c.env, slug);
  if (!product) return c.json({ error: `Product "${slug}" not found` }, 404);

  const { data, error } = await db
    .from('mkt_posts')
    .select('*')
    .eq('product_id', product.id)
    .eq('status', 'pending_approval')
    .order('scheduled_at', { ascending: true });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// POST /:slug/:id/approve — approve a pending post
pending.post('/:slug/:id/approve', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  const db = createSupabaseClient(c.env);

  const product = await resolveProduct(c.env, slug);
  if (!product) return c.json({ error: `Product "${slug}" not found` }, 404);

  const body: { scheduled_at?: string } = await c.req
    .json<{ scheduled_at?: string }>()
    .catch(() => ({ scheduled_at: undefined }));

  // Fetch the post
  const { data: post, error: fetchErr } = await db
    .from('mkt_posts')
    .select('*')
    .eq('id', id)
    .eq('product_id', product.id)
    .single();

  if (fetchErr || !post) {
    return c.json({ error: 'Post not found' }, 404);
  }

  // Generate caption if empty
  let caption = (post.caption as string | null) ?? '';

  if (!caption.trim()) {
    const topic =
      (post.image_path as string | null)?.split('/').pop()?.replace(/\.[^.]+$/, '') ||
      (post.category as string | null) ||
      'new post';

    const { content } = await generateContent(
      c.env,
      product,
      null,
      topic,
      ['instagram'],
      'claude-haiku-4-5-20251001'
    );

    caption = content.instagram?.text ?? '';
    log('pending_approve_ai_caption', { id, slug, topic });
  }

  const scheduledAt = body.scheduled_at || new Date().toISOString();

  // Update post to scheduled (include both IG and FB content)
  const { error: updateErr } = await db
    .from('mkt_posts')
    .update({
      status: 'scheduled',
      caption,
      hashtags: product.hashtags || [],
      content: {
        instagram: { text: caption, hashtags: product.hashtags },
        facebook: { text: caption },
      },
      image_urls: post.image_url ? [post.image_url] : [],
      scheduled_at: scheduledAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateErr) {
    return c.json({ error: updateErr.message }, 500);
  }

  // Insert into unified publish queue for both platforms
  const { error: queueErr } = await db.from('mkt_publish_queue').insert([
    { post_id: id, platform: 'instagram', status: 'pending' },
    { post_id: id, platform: 'facebook', status: 'pending' },
  ]);

  if (queueErr) {
    log('pending_approve_queue_error', { id, error: queueErr.message });
  }

  log('pending_approve', { id, slug, platforms: ['instagram', 'facebook'] });

  return c.json({ ok: true, post_id: id });
});

// POST /:slug/:id/reject — reject a pending post
pending.post('/:slug/:id/reject', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  const db = createSupabaseClient(c.env);

  const product = await resolveProduct(c.env, slug);
  if (!product) return c.json({ error: `Product "${slug}" not found` }, 404);

  const { error } = await db
    .from('mkt_posts')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('product_id', product.id);

  if (error) return c.json({ error: error.message }, 500);

  log('pending_reject', { id, slug });
  return c.json({ ok: true });
});

// GET /:slug/all — list ALL posts for the calendar view
pending.get('/:slug/all', async (c) => {
  const slug = c.req.param('slug');
  const db = createSupabaseClient(c.env);

  const product = await resolveProduct(c.env, slug);
  if (!product) return c.json({ error: `Product "${slug}" not found` }, 404);

  const { data, error } = await db
    .from('mkt_posts')
    .select('*')
    .eq('product_id', product.id)
    .order('scheduled_at', { ascending: false })
    .limit(100);

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// PUT /:slug/:id — edit a post
pending.put('/:slug/:id', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  const db = createSupabaseClient(c.env);

  const product = await resolveProduct(c.env, slug);
  if (!product) return c.json({ error: `Product "${slug}" not found` }, 404);

  type EditBody = { caption?: string; hashtags?: string[]; scheduled_at?: string; platform?: string };
  const body: EditBody = await c.req
    .json<EditBody>()
    .catch(() => ({} as EditBody));

  const { data: post, error: fetchErr } = await db
    .from('mkt_posts')
    .select('*')
    .eq('id', id)
    .eq('product_id', product.id)
    .single();

  if (fetchErr || !post) {
    return c.json({ error: 'Post not found' }, 404);
  }

  const allowedStatuses = ['pending_approval', 'approved', 'scheduled'];
  if (!allowedStatuses.includes(post.status as string)) {
    return c.json({ error: 'Only pending, approved, or scheduled posts can be edited' }, 400);
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.caption !== undefined) {
    updates.caption = body.caption;
    // Also update content for the publish pipeline
    const content = (post.content as Record<string, unknown>) || {};
    const platform = (post.platform as string) || 'instagram';
    content[platform] = { text: body.caption, hashtags: body.hashtags || post.hashtags };
    updates.content = content;
  }
  if (body.hashtags !== undefined) updates.hashtags = body.hashtags;
  if (body.scheduled_at !== undefined) updates.scheduled_at = body.scheduled_at;

  const { data: updated, error: updateErr } = await db
    .from('mkt_posts')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (updateErr) return c.json({ error: updateErr.message }, 500);

  if (post.status === 'scheduled' && body.scheduled_at !== undefined) {
    await db
      .from('mkt_publish_queue')
      .update({ updated_at: new Date().toISOString() })
      .eq('post_id', id)
      .eq('status', 'pending');
  }

  log('pending_edit', { id, slug, fields: Object.keys(updates) });

  return c.json({ data: updated });
});

export default pending;

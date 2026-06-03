import { Hono } from 'hono';
import type { Env, Post, Platform } from '../types.js';
import { createSupabaseClient } from '../lib/supabase.js';
import { generateContent } from '../lib/ai.js';
import { validateGenerateRequest, validateApproveRequest } from '../lib/validation.js';

const posts = new Hono<{ Bindings: Env }>();

posts.get('/', async (c) => {
  const db = createSupabaseClient(c.env);
  const product = c.req.query('product');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50');

  let query = db
    .from('mkt_posts')
    .select('*, mkt_products(slug, name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (product) {
    const { data: prod } = await db
      .from('mkt_products')
      .select('id')
      .eq('slug', product)
      .single();
    if (prod) query = query.eq('product_id', prod.id);
  }
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

posts.get('/:id', async (c) => {
  const db = createSupabaseClient(c.env);
  const { data, error } = await db
    .from('mkt_posts')
    .select('*, mkt_products(slug, name), mkt_post_analytics(*)')
    .eq('id', c.req.param('id'))
    .single();
  if (error) return c.json({ error: error.message }, 404);
  return c.json(data);
});

posts.post('/', async (c) => {
  const db = createSupabaseClient(c.env);
  const body = await c.req.json<Partial<Post>>();
  const { data, error } = await db.from('mkt_posts').insert(body).select().single();
  if (error) return c.json({ error: error.message }, 400);
  return c.json(data, 201);
});

posts.put('/:id', async (c) => {
  const db = createSupabaseClient(c.env);
  const body = await c.req.json<Partial<Post>>();
  const { data, error } = await db
    .from('mkt_posts')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', c.req.param('id'))
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 400);
  return c.json(data);
});

// Generate AI content for a post
posts.post('/:id/generate', async (c) => {
  const db = createSupabaseClient(c.env);
  const body = await c.req.json<Record<string, unknown>>();

  const validationErr = validateGenerateRequest(body);
  if (validationErr) return c.json({ error: validationErr }, 400);

  const { topic, platforms, model } = body as {
    topic: string;
    platforms?: Platform[];
    model?: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-5-20250514';
  };

  // Get the post with product info
  const { data: post, error: postErr } = await db
    .from('mkt_posts')
    .select('*, mkt_products(*)')
    .eq('id', c.req.param('id'))
    .single();
  if (postErr || !post) return c.json({ error: 'Post not found' }, 404);

  const product = post.mkt_products;
  const targetPlatforms = platforms || Object.keys(post.content || {}) as Platform[] || ['instagram', 'facebook'];

  // Get template if linked
  let template = null;
  if (post.template_id) {
    const { data: tmpl } = await db
      .from('mkt_templates')
      .select('*')
      .eq('id', post.template_id)
      .single();
    template = tmpl;
  }

  const { content, prompt } = await generateContent(
    c.env,
    product,
    template,
    topic,
    targetPlatforms,
    model
  );

  // Update post with generated content
  const { data: updated, error: updateErr } = await db
    .from('mkt_posts')
    .update({
      content,
      ai_prompt: prompt,
      ai_model: model || 'claude-haiku-4-5-20251001',
      status: 'pending_approval',
      updated_at: new Date().toISOString(),
    })
    .eq('id', c.req.param('id'))
    .select()
    .single();

  if (updateErr) return c.json({ error: updateErr.message }, 500);
  return c.json(updated);
});

// Approve a post
posts.post('/:id/approve', async (c) => {
  const db = createSupabaseClient(c.env);
  const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));

  const validationErr = validateApproveRequest(body);
  if (validationErr) return c.json({ error: validationErr }, 400);

  const scheduled_at = body.scheduled_at as string | undefined;
  const newStatus = scheduled_at ? 'scheduled' : 'approved';

  const { data, error } = await db
    .from('mkt_posts')
    .update({
      status: newStatus,
      scheduled_at: scheduled_at || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', c.req.param('id'))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);

  // If scheduled, create publish queue entries
  if (scheduled_at && data) {
    const platforms = Object.keys(data.content || {}) as Platform[];
    const queueEntries = platforms.map((platform) => ({
      post_id: data.id,
      platform,
      status: 'pending',
    }));
    await db.from('mkt_publish_queue').insert(queueEntries);
  }

  return c.json(data);
});

// Publish immediately
posts.post('/:id/publish', async (c) => {
  const db = createSupabaseClient(c.env);

  const { data, error } = await db
    .from('mkt_posts')
    .update({
      status: 'scheduled',
      scheduled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', c.req.param('id'))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);

  // Create publish queue entries for immediate publishing
  const platforms = Object.keys(data.content || {}) as Platform[];
  const queueEntries = platforms.map((platform) => ({
    post_id: data.id,
    platform,
    status: 'pending',
  }));
  await db.from('mkt_publish_queue').insert(queueEntries);

  return c.json(data);
});

// Cancel a post
posts.post('/:id/cancel', async (c) => {
  const db = createSupabaseClient(c.env);
  const { data, error } = await db
    .from('mkt_posts')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', c.req.param('id'))
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 400);

  // Remove from publish queue
  await db.from('mkt_publish_queue').delete().eq('post_id', c.req.param('id'));

  return c.json(data);
});

posts.delete('/:id', async (c) => {
  const db = createSupabaseClient(c.env);
  const { error } = await db
    .from('mkt_posts')
    .delete()
    .eq('id', c.req.param('id'))
    .eq('status', 'draft');
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ ok: true });
});

export default posts;

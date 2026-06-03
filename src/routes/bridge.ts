import { Hono } from 'hono';
import type { Env, MarketingProduct, Platform } from '../types.js';
import { createSupabaseClient } from '../lib/supabase.js';
import { resolveProduct } from '../lib/product.js';
import { generateContent } from '../lib/ai.js';
import { log } from '../lib/logger.js';

const bridge = new Hono<{ Bindings: Env }>();

// POST /:slug/sync — Bridge approved mkt_posts into mkt_publish_queue
bridge.post('/:slug/sync', async (c) => {
  const slug = c.req.param('slug');
  const db = createSupabaseClient(c.env);

  const product = await resolveProduct(c.env, slug);
  if (!product) return c.json({ error: `Product "${slug}" not found` }, 404);

  const { data: posts, error: postsErr } = await db
    .from('mkt_posts')
    .select('*')
    .eq('product_id', product.id)
    .eq('status', 'approved');

  if (postsErr) {
    log('bridge_sync_error', { slug, error: postsErr.message });
    return c.json({ error: postsErr.message }, 500);
  }

  if (!posts?.length) return c.json({ bridged: 0, captions_generated: 0 });

  let bridged = 0;
  let captions_generated = 0;

  for (const post of posts) {
    try {
      let caption = (post.caption as string | null) ?? '';

      if (!caption.trim()) {
        const topic = post.image_path?.split('/').pop()?.replace(/\.[^.]+$/, '') || post.category || 'general post';
        const { content } = await generateContent(c.env, product, null, topic, ['instagram'], 'claude-haiku-4-5-20251001');
        caption = content.instagram?.text || '';
        if (content.instagram?.hashtags?.length) {
          caption += '\n\n' + content.instagram.hashtags.map((h: string) => `#${h}`).join(' ');
        }
        captions_generated++;
      }

      const { error: updateErr } = await db
        .from('mkt_posts')
        .update({
          status: 'scheduled',
          caption,
          content: { instagram: { text: caption, hashtags: product.hashtags } },
          image_urls: post.image_url ? [post.image_url] : [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id);

      if (updateErr) { log('bridge_post_update_error', { post_id: post.id, error: updateErr.message }); continue; }

      const { error: queueErr } = await db.from('mkt_publish_queue').insert({
        post_id: post.id,
        platform: 'instagram' as Platform,
        status: 'pending',
      });

      if (queueErr) log('bridge_queue_insert_error', { post_id: post.id, error: queueErr.message });

      bridged++;
    } catch (err) {
      log('bridge_post_error', { post_id: post.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  log('bridge_sync_complete', { slug, bridged, captions_generated });
  return c.json({ bridged, captions_generated });
});

// POST /:slug/generate-captions — Generate AI captions for posts with empty captions
bridge.post('/:slug/generate-captions', async (c) => {
  const slug = c.req.param('slug');
  const db = createSupabaseClient(c.env);

  const product = await resolveProduct(c.env, slug);
  if (!product) return c.json({ error: `Product "${slug}" not found` }, 404);

  const { data: posts, error: postsErr } = await db
    .from('mkt_posts')
    .select('*')
    .eq('product_id', product.id)
    .in('status', ['pending_approval', 'approved'])
    .or('caption.is.null,caption.eq.')
    .limit(10);

  if (postsErr) return c.json({ error: postsErr.message }, 500);
  if (!posts?.length) return c.json({ generated: 0, remaining: 0 });

  const { count: totalCount } = await db
    .from('mkt_posts')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', product.id)
    .in('status', ['pending_approval', 'approved'])
    .or('caption.is.null,caption.eq.');

  const remaining = Math.max(0, (totalCount ?? 0) - posts.length);
  let generated = 0;

  for (const post of posts) {
    try {
      const topic = post.image_path?.split('/').pop()?.replace(/\.[^.]+$/, '') || post.category || 'general post';
      const { content } = await generateContent(c.env, product, null, topic, ['instagram'], 'claude-haiku-4-5-20251001');

      let caption = content.instagram?.text || '';
      if (content.instagram?.hashtags?.length) {
        caption += '\n\n' + content.instagram.hashtags.map((h: string) => `#${h}`).join(' ');
      }

      const { error: updateErr } = await db
        .from('mkt_posts')
        .update({ caption, updated_at: new Date().toISOString() })
        .eq('id', post.id);

      if (updateErr) { log('bridge_caption_update_error', { post_id: post.id, error: updateErr.message }); continue; }
      generated++;
    } catch (err) {
      log('bridge_caption_gen_error', { post_id: post.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return c.json({ generated, remaining });
});

// Legacy: POST /sync (defaults to demo)
bridge.post('/sync', (c) => {
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace('/sync', '/demo/sync');
  return c.redirect(url.toString(), 307);
});

export default bridge;

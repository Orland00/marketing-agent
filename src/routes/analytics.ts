import { Hono } from 'hono';
import type { Env } from '../types.js';
import { createSupabaseClient } from '../lib/supabase.js';

const analytics = new Hono<{ Bindings: Env }>();

analytics.get('/overview', async (c) => {
  const db = createSupabaseClient(c.env);
  const days = parseInt(c.req.query('days') || '7');
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // Total posts published in period
  const { count: publishedCount } = await db
    .from('mkt_posts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')
    .gte('published_at', since);

  // Total posts scheduled
  const { count: scheduledCount } = await db
    .from('mkt_posts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'scheduled');

  // Aggregate engagement
  const { data: metrics } = await db
    .from('mkt_post_analytics')
    .select('impressions, reach, likes, comments, shares, saves')
    .gte('fetched_at', since);

  const totals = (metrics || []).reduce(
    (acc, m) => ({
      impressions: acc.impressions + (m.impressions || 0),
      reach: acc.reach + (m.reach || 0),
      likes: acc.likes + (m.likes || 0),
      comments: acc.comments + (m.comments || 0),
      shares: acc.shares + (m.shares || 0),
      saves: acc.saves + (m.saves || 0),
    }),
    { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0 }
  );

  return c.json({
    period_days: days,
    published: publishedCount || 0,
    scheduled: scheduledCount || 0,
    engagement: totals,
  });
});

analytics.get('/product/:slug', async (c) => {
  const db = createSupabaseClient(c.env);
  const days = parseInt(c.req.query('days') || '7');
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data: product } = await db
    .from('mkt_products')
    .select('id, name, slug')
    .eq('slug', c.req.param('slug'))
    .single();

  if (!product) return c.json({ error: 'Product not found' }, 404);

  const { data: posts } = await db
    .from('mkt_posts')
    .select('id, status, published_at, content, mkt_post_analytics(*)')
    .eq('product_id', product.id)
    .eq('status', 'published')
    .gte('published_at', since)
    .order('published_at', { ascending: false });

  return c.json({
    product,
    period_days: days,
    posts: posts || [],
    total_published: posts?.length || 0,
  });
});

analytics.get('/best-posts', async (c) => {
  const db = createSupabaseClient(c.env);
  const limit = parseInt(c.req.query('limit') || '10');

  const { data, error } = await db
    .from('mkt_post_analytics')
    .select('*, mkt_posts(id, content, product_id, published_at, mkt_products(slug, name))')
    .order('engagement_rate', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

analytics.get('/best-times', async (c) => {
  const db = createSupabaseClient(c.env);

  // Get published posts with analytics, group by hour of day
  const { data: posts } = await db
    .from('mkt_posts')
    .select('published_at, mkt_post_analytics(platform, engagement_rate)')
    .eq('status', 'published')
    .not('published_at', 'is', null);

  if (!posts?.length) return c.json({ message: 'No published posts yet' });

  // Aggregate by hour
  const hourlyEngagement: Record<string, { total: number; count: number }> = {};
  for (const post of posts) {
    if (!post.published_at) continue;
    const hour = new Date(post.published_at).getUTCHours();
    const key = `${hour}:00`;
    if (!hourlyEngagement[key]) hourlyEngagement[key] = { total: 0, count: 0 };

    const analytics = post.mkt_post_analytics as Array<{ engagement_rate: number | null }>;
    for (const a of analytics) {
      if (a.engagement_rate) {
        hourlyEngagement[key].total += a.engagement_rate;
        hourlyEngagement[key].count++;
      }
    }
  }

  const bestTimes = Object.entries(hourlyEngagement)
    .map(([hour, { total, count }]) => ({
      hour_utc: hour,
      avg_engagement: count > 0 ? total / count : 0,
      sample_size: count,
    }))
    .sort((a, b) => b.avg_engagement - a.avg_engagement);

  return c.json(bestTimes);
});

export default analytics;

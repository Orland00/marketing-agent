import { Hono } from 'hono';
import type { Env, Campaign } from '../types.js';
import { createSupabaseClient } from '../lib/supabase.js';

const campaigns = new Hono<{ Bindings: Env }>();

campaigns.get('/', async (c) => {
  const db = createSupabaseClient(c.env);
  const { data, error } = await db
    .from('mkt_campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

campaigns.post('/', async (c) => {
  const db = createSupabaseClient(c.env);
  const body = await c.req.json<Partial<Campaign>>();
  const { data, error } = await db.from('mkt_campaigns').insert(body).select().single();
  if (error) return c.json({ error: error.message }, 400);
  return c.json(data, 201);
});

campaigns.put('/:id', async (c) => {
  const db = createSupabaseClient(c.env);
  const body = await c.req.json<Partial<Campaign>>();
  const { data, error } = await db
    .from('mkt_campaigns')
    .update(body)
    .eq('id', c.req.param('id'))
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 400);
  return c.json(data);
});

campaigns.get('/:id/posts', async (c) => {
  const db = createSupabaseClient(c.env);
  const { data, error } = await db
    .from('mkt_posts')
    .select('*')
    .eq('campaign_id', c.req.param('id'))
    .order('scheduled_at');
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

export default campaigns;

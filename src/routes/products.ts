import { Hono } from 'hono';
import type { Env, MarketingProduct } from '../types.js';
import { createSupabaseClient } from '../lib/supabase.js';
import { validateProduct } from '../lib/validation.js';

const products = new Hono<{ Bindings: Env }>();

products.get('/', async (c) => {
  const db = createSupabaseClient(c.env);
  const { data, error } = await db
    .from('mkt_products')
    .select('*')
    .order('name');
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

products.get('/:slug', async (c) => {
  const db = createSupabaseClient(c.env);
  const { data, error } = await db
    .from('mkt_products')
    .select('*')
    .eq('slug', c.req.param('slug'))
    .single();
  if (error) return c.json({ error: error.message }, 404);
  return c.json(data);
});

products.post('/', async (c) => {
  const db = createSupabaseClient(c.env);
  const body = await c.req.json<Partial<MarketingProduct>>();

  const validationErr = validateProduct(body as Record<string, unknown>, true);
  if (validationErr) return c.json({ error: validationErr }, 400);

  const { data, error } = await db.from('mkt_products').insert(body).select().single();
  if (error) return c.json({ error: error.message }, 400);
  return c.json(data, 201);
});

products.put('/:slug', async (c) => {
  const db = createSupabaseClient(c.env);
  const body = await c.req.json<Partial<MarketingProduct>>();

  const validationErr = validateProduct(body as Record<string, unknown>, false);
  if (validationErr) return c.json({ error: validationErr }, 400);

  const { data, error } = await db
    .from('mkt_products')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('slug', c.req.param('slug'))
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 400);
  return c.json(data);
});

export default products;

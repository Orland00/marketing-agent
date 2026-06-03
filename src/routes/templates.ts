import { Hono } from 'hono';
import type { Env, PostTemplate } from '../types.js';
import { createSupabaseClient } from '../lib/supabase.js';

const templates = new Hono<{ Bindings: Env }>();

templates.get('/', async (c) => {
  const db = createSupabaseClient(c.env);
  const product = c.req.query('product');

  let query = db.from('mkt_templates').select('*').order('name');

  if (product) {
    const { data: prod } = await db
      .from('mkt_products')
      .select('id')
      .eq('slug', product)
      .single();
    if (prod) {
      // Get product-specific + global templates
      query = query.or(`product_id.eq.${prod.id},product_id.is.null`);
    }
  }

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

templates.post('/', async (c) => {
  const db = createSupabaseClient(c.env);
  const body = await c.req.json<Partial<PostTemplate>>();
  const { data, error } = await db.from('mkt_templates').insert(body).select().single();
  if (error) return c.json({ error: error.message }, 400);
  return c.json(data, 201);
});

templates.put('/:id', async (c) => {
  const db = createSupabaseClient(c.env);
  const body = await c.req.json<Partial<PostTemplate>>();
  const { data, error } = await db
    .from('mkt_templates')
    .update(body)
    .eq('id', c.req.param('id'))
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 400);
  return c.json(data);
});

templates.delete('/:id', async (c) => {
  const db = createSupabaseClient(c.env);
  const { error } = await db.from('mkt_templates').delete().eq('id', c.req.param('id'));
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ ok: true });
});

export default templates;

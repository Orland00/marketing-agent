import { Hono } from 'hono';
import type { Env } from '../types.js';

const images = new Hono<{ Bindings: Env }>();

images.post('/upload', async (c) => {
  if (!c.env.IMAGES_BUCKET) return c.json({ error: 'R2 not configured' }, 503);
  const contentType = c.req.header('content-type') || '';

  if (!contentType.includes('multipart/form-data') && !contentType.includes('application/octet-stream')) {
    return c.json({ error: 'Must send multipart/form-data or binary body' }, 400);
  }

  let imageData: ArrayBuffer;
  let filename: string;
  let mime: string;

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const file = formData.get('image') as File | null;
    if (!file) return c.json({ error: 'No image field in form data' }, 400);
    imageData = await file.arrayBuffer();
    filename = file.name || `upload-${Date.now()}.jpg`;
    mime = file.type || 'image/jpeg';
  } else {
    imageData = await c.req.arrayBuffer();
    filename = c.req.header('x-filename') || `upload-${Date.now()}.jpg`;
    mime = contentType || 'image/jpeg';
  }

  const key = `posts/${Date.now()}-${filename}`;

  await c.env.IMAGES_BUCKET.put(key, imageData, {
    httpMetadata: { contentType: mime },
  });

  // Public URL served via Worker route /images/:key
  // Replace with a custom domain if configured
  const host = c.req.header('host') || 'marketing-agent.example.workers.dev';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const url = `${protocol}://${host}/images/${key}`;

  return c.json({ key, url, size: imageData.byteLength }, 201);
});

images.delete('/:key{.+}', async (c) => {
  if (!c.env.IMAGES_BUCKET) return c.json({ error: 'R2 not configured' }, 503);
  const key = c.req.param('key');
  await c.env.IMAGES_BUCKET.delete(key);
  return c.json({ ok: true });
});

export default images;

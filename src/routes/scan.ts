import { Hono } from 'hono';
import type { Env } from '../types.js';
import { createSupabaseClient } from '../lib/supabase.js';
import { getProductId } from '../lib/product.js';
import { log } from '../lib/logger.js';

const scan = new Hono<{ Bindings: Env }>();

const BUCKET = 'marketing-assets';
const STORAGE_BASE_URL = 'https://your-project.supabase.co/storage/v1/object/public';

function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+\d+$/, '')
    .trim();
}

function addDays(isoStr: string, days: number): Date {
  const d = new Date(isoStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Recursively list all files under a folder in the Supabase storage bucket. */
async function listAllFiles(
  db: ReturnType<typeof createSupabaseClient>,
  folder: string
): Promise<string[]> {
  const paths: string[] = [];

  const { data, error } = await db.storage.from(BUCKET).list(folder, {
    limit: 1000,
    offset: 0,
  });

  if (error || !data) return paths;

  for (const item of data) {
    if (item.id === null) {
      const subfolder = folder ? `${folder}/${item.name}` : item.name;
      const subPaths = await listAllFiles(db, subfolder);
      paths.push(...subPaths);
    } else {
      const filePath = folder ? `${folder}/${item.name}` : item.name;
      paths.push(filePath);
    }
  }

  return paths;
}

// POST /:slug — Scan storage for a specific product
scan.post('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const db = createSupabaseClient(c.env);

  const productId = await getProductId(c.env, slug);
  if (!productId) {
    return c.json({ error: `Product "${slug}" not found` }, 404);
  }

  // Each product's assets live under marketing-assets/<slug>/
  const folder = slug;

  log('scan.start', { slug, folder });

  const allFiles = await listAllFiles(db, folder);
  const scanned = allFiles.length;

  log('scan.files_found', { slug, scanned });

  if (scanned === 0) {
    return c.json({ scanned: 0, new_images: 0 });
  }

  // Fetch existing image_paths for this product
  const { data: existingRows, error: fetchError } = await db
    .from('mkt_posts')
    .select('image_path')
    .eq('product_id', productId)
    .not('image_path', 'is', null);

  if (fetchError) {
    log('scan.fetch_error', { error: fetchError.message });
    return c.json({ error: fetchError.message }, 500);
  }

  const existingPaths = new Set((existingRows ?? []).map((r) => r.image_path));
  const newFiles = allFiles.filter((p) => !existingPaths.has(p));

  if (newFiles.length === 0) {
    log('scan.no_new_images', { slug });
    return c.json({ scanned, new_images: 0 });
  }

  // Determine next scheduled date
  const { data: lastPost } = await db
    .from('mkt_posts')
    .select('scheduled_at')
    .eq('product_id', productId)
    .order('scheduled_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const today = new Date();
  let nextDate: Date = lastPost?.scheduled_at
    ? addDays(lastPost.scheduled_at, 1)
    : today;

  const inserts = newFiles.map((filePath) => {
    const filename = filePath.split('/').pop() || filePath;
    const title = titleFromFilename(filename);
    const parts = filePath.split('/');
    const category = parts.length >= 3 ? parts[parts.length - 2] : null;
    const imageUrl = `${STORAGE_BASE_URL}/${BUCKET}/${filePath}`;

    const row = {
      product_id: productId,
      image_path: filePath,
      image_url: imageUrl,
      image_urls: [imageUrl],
      caption: '',
      category,
      status: 'pending_approval',
      content: {},
      scheduled_at: nextDate.toISOString(),
      created_by: 'scan',
    };

    nextDate = addDays(nextDate.toISOString(), 1);
    return row;
  });

  const { error: insertError } = await db.from('mkt_posts').insert(inserts);

  if (insertError) {
    log('scan.insert_error', { error: insertError.message });
    return c.json({ error: insertError.message }, 500);
  }

  log('scan.done', { slug, scanned, new_images: inserts.length });

  return c.json({ scanned, new_images: inserts.length });
});

// POST / — legacy (defaults to demo)
scan.post('/', async (c) => {
  // Redirect to slug-based route
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/\/$/, '') + '/demo';
  return c.redirect(url.toString(), 307);
});

export default scan;

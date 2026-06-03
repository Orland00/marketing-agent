import { Hono } from 'hono';
import type { Env } from '../types.js';
import { createSupabaseClient } from '../lib/supabase.js';
import { getProductTheme, getAllProductSlugs } from '../lib/product.js';

const statsUi = new Hono<{ Bindings: Env }>();

function esc(val: unknown): string {
  const s = val == null ? '' : String(val);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s: string, maxLen: number): string {
  return s.length <= maxLen ? s : s.slice(0, maxLen) + '\u2026';
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '\u2014';
  try { return new Date(d).toISOString().slice(0, 10); }
  catch { return '\u2014'; }
}

function statusClass(status: string): string {
  switch (status) {
    case 'published': return 'green';
    case 'scheduled': return 'yellow';
    case 'failed': return 'red';
    default: return '';
  }
}

async function renderStats(c: { env: Env; req: { param: (k: string) => string } }, slug: string) {
  const db = createSupabaseClient(c.env);
  const theme = getProductTheme(slug);
  const allSlugs = getAllProductSlugs();

  // Resolve product_id
  const { data: product } = await db
    .from('mkt_products')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (!product) {
    return `<html><body><h1>Product "${slug}" not found</h1></body></html>`;
  }

  // Fetch posts with analytics
  const { data: mktPosts } = await db
    .from('mkt_posts')
    .select('*, mkt_post_analytics(*)')
    .eq('product_id', product.id)
    .in('status', ['published', 'scheduled', 'failed'])
    .order('scheduled_at', { ascending: false })
    .limit(50);

  // Count by status
  const { data: allPosts } = await db
    .from('mkt_posts')
    .select('status')
    .eq('product_id', product.id);

  const counts = { pending_approval: 0, approved: 0, scheduled: 0, published: 0 };
  for (const row of allPosts || []) {
    const s = row.status as keyof typeof counts;
    if (s in counts) counts[s]++;
  }

  // Total engagement from analytics
  let totalEngagement = 0;
  for (const post of mktPosts || []) {
    const analytics = (post.mkt_post_analytics as Array<{ likes?: number; comments?: number; shares?: number }> | null) || [];
    for (const a of analytics) {
      totalEngagement += (a.likes || 0) + (a.comments || 0) + (a.shares || 0);
    }
  }

  const productOptions = allSlugs
    .map((s) => {
      const t = getProductTheme(s);
      return `<option value="${s}"${s === slug ? ' selected' : ''}>${esc(t.name)}</option>`;
    })
    .join('');

  const postRows = (mktPosts || []).map((post) => {
    const content = post.content as Record<string, { text?: string }> | null;
    const rawCaption =
      post.caption ||
      content?.instagram?.text ||
      content?.facebook?.text ||
      Object.values(content || {})[0]?.text ||
      '';
    const caption = truncate(rawCaption, 60);

    const analytics = (post.mkt_post_analytics as Array<{
      impressions?: number; likes?: number; comments?: number;
    }> | null) || [];
    const impressions = analytics.reduce((s, a) => s + (a.impressions || 0), 0);
    const likes = analytics.reduce((s, a) => s + (a.likes || 0), 0);
    const comments = analytics.reduce((s, a) => s + (a.comments || 0), 0);

    const cls = statusClass(post.status as string);
    return `<tr>
      <td>${esc(fmtDate(post.scheduled_at))}</td>
      <td>${esc(caption)}</td>
      <td><span class="${esc(cls)}">${esc(post.status)}</span></td>
      <td>${esc(impressions)}</td>
      <td>${esc(likes)}</td>
      <td>${esc(comments)}</td>
    </tr>`;
  }).join('');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(theme.name)} — Marketing Stats</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0a0a0a;
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 24px 16px;
      min-height: 100vh;
    }
    header { margin-bottom: 28px; display: flex; align-items: center; gap: 12px; }
    h1 { font-size: 22px; font-weight: 700; }
    .subtitle { color: #888; font-size: 13px; margin-top: 4px; }
    #product-select {
      background: ${esc(theme.bg)};
      color: #fafafa;
      border: 2px solid ${esc(theme.accent)};
      border-radius: 12px;
      padding: 8px 12px;
      font-size: 14px;
      font-weight: 700;
      font-family: inherit;
      color-scheme: dark;
      cursor: pointer;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 32px;
    }
    .stat-card {
      background: #151515;
      border-radius: 14px;
      padding: 18px 16px;
    }
    .stat-value { font-size: 24px; font-weight: 700; line-height: 1; }
    .stat-label { font-size: 12px; color: #888; margin-top: 6px; }
    section { margin-bottom: 36px; }
    section h2 { font-size: 15px; font-weight: 600; margin-bottom: 12px; color: #ccc; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th { color: #666; font-weight: 500; text-align: left; padding: 6px 8px; border-bottom: 1px solid #1a1a1a; }
    tbody tr { border-bottom: 1px solid #111; }
    tbody td { padding: 8px 8px; vertical-align: top; }
    .green { color: #44ff44; }
    .red { color: #ff4444; }
    .yellow { color: #ffaa00; }
    .empty { color: #555; font-size: 13px; padding: 12px 0; }
  </style>
</head>
<body>
  <header>
    <select id="product-select">${productOptions}</select>
    <div>
      <div class="subtitle">Marketing Stats</div>
    </div>
  </header>

  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-value">${esc(counts.pending_approval)}</div>
      <div class="stat-label">Pendientes</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${esc(counts.scheduled)}</div>
      <div class="stat-label">Programados</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${esc(counts.published)}</div>
      <div class="stat-label">Publicados</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${esc(totalEngagement)}</div>
      <div class="stat-label">Engagement Total</div>
    </div>
  </div>

  <section>
    <h2>Pipeline de Posts</h2>
    <div class="table-wrap">
      ${
        (mktPosts || []).length === 0
          ? `<p class="empty">Sin posts en pipeline.</p>`
          : `<table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Caption</th>
            <th>Estado</th>
            <th>Impresiones</th>
            <th>Likes</th>
            <th>Comentarios</th>
          </tr>
        </thead>
        <tbody>${postRows}</tbody>
      </table>`
      }
    </div>
  </section>

  <script>
    document.getElementById('product-select').addEventListener('change', function() {
      window.location.href = '/stats/' + this.value + window.location.hash;
    });
  </script>
</body>
</html>`;
}

statsUi.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  return c.html(await renderStats(c, slug));
});

statsUi.get('/', async (c) => {
  return c.html(await renderStats(c, 'demo'));
});

export default statsUi;

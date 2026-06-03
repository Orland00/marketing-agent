import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, TelegramUpdate } from './types.js';
import products from './routes/products.js';
import posts from './routes/posts.js';
import templates from './routes/templates.js';
import campaigns from './routes/campaigns.js';
import analyticsRoutes from './routes/analytics.js';
import images from './routes/images.js';
import statsUi from './routes/stats-ui.js';
import scan from './routes/scan.js';
import bridge from './routes/bridge.js';
import pending from './routes/pending.js';
import acceptUi from './routes/accept-ui.js';
import settingsApi from './routes/settings-api.js';
import settingsUi from './routes/settings-ui.js';
import { handleTelegramUpdate } from './telegram/handler.js';
import { processPublishQueue, sendDailyBrief, pullAnalytics } from './lib/publisher.js';

const app = new Hono<{ Bindings: Env }>();

// --- Middleware ---

app.use('/api/*', cors({
  origin: [
    'https://example.com',
    'https://www.example.com',
    'https://app.example.com',
    'http://localhost:5173',
    'http://localhost:4173',
  ],
}));

// Admin auth for API routes
app.use('/api/*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth || auth !== `Bearer ${c.env.ADMIN_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// --- Routes ---

app.get('/health', (c) => {
  return c.json({
    ok: true,
    service: 'marketing-agent',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT,
  });
});

// Telegram webhook
app.post('/webhooks/telegram', async (c) => {
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ error: 'Invalid secret' }, 403);
  }

  const update = await c.req.json<TelegramUpdate>();
  c.executionCtx.waitUntil(handleTelegramUpdate(update, c.env));
  return c.json({ ok: true });
});

// Public R2 image serving
app.get('/images/:key{.+}', async (c) => {
  if (!c.env.IMAGES_BUCKET) return c.json({ error: 'R2 not configured' }, 503);
  const key = c.req.param('key');
  const obj = await c.env.IMAGES_BUCKET.get(key);
  if (!obj) return c.notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { headers });
});

// API routes (all multi-tenant via /:slug/ params)
app.route('/api/products', products);
app.route('/api/posts', posts);
app.route('/api/templates', templates);
app.route('/api/campaigns', campaigns);
app.route('/api/analytics', analyticsRoutes);
app.route('/api/images', images);
app.route('/api/scan', scan);
app.route('/api/bridge', bridge);
app.route('/api/pending', pending);
app.route('/api/settings', settingsApi);

// UI routes (multi-tenant with /:slug param, default to demo)
app.route('/accept', acceptUi);
app.route('/stats', statsUi);
app.route('/settings', settingsUi);

// --- Cron handler ---

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    switch (event.cron) {
      case '*/30 * * * *':
        // Unified publish queue handles ALL products
        ctx.waitUntil(processPublishQueue(env));
        break;
      case '0 12 * * *': // 6 AM CST = 12:00 UTC
        ctx.waitUntil(sendDailyBrief(env));
        ctx.waitUntil(pullAnalytics(env));
        break;
    }
  },
};

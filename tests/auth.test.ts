import { describe, it, expect, vi } from 'vitest';

// Supabase simulado: producto inexistente (suficiente para renderizar /stats sin red)
vi.mock('../src/lib/supabase.js', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain;
  chain.single = async () => ({ data: null });
  return { createSupabaseClient: () => chain };
});

import worker from '../src/index.js';
import { buildHtml } from '../src/routes/accept-ui.js';
import { secretEquals, isAdminAuthorized } from '../src/lib/auth.js';

const SECRET = 'admin-secret-test';
const TG = 'tg-secret-test';
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function call(path: string, env: Record<string, unknown>, init?: RequestInit) {
  return worker.fetch(new Request(`http://localhost${path}`, init), env as never, ctx);
}
const bearer = (s: string) => ({ headers: { Authorization: `Bearer ${s}` } });

describe('secretEquals', () => {
  it('iguales -> true', async () => expect(await secretEquals('abc', 'abc')).toBe(true));
  it('distintos y distinta longitud -> false', async () => {
    expect(await secretEquals('abc', 'abd')).toBe(false);
    expect(await secretEquals('abc', 'abcd')).toBe(false);
  });
  it('vacío / ausente -> false', async () => {
    expect(await secretEquals('', '')).toBe(false);
    expect(await secretEquals(undefined, 'x')).toBe(false);
    expect(await secretEquals('x', undefined)).toBe(false);
  });
  it('isAdminAuthorized exige Bearer exacto', async () => {
    expect(await isAdminAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(await isAdminAuthorized(SECRET, SECRET)).toBe(false);
    expect(await isAdminAuthorized(`Bearer ${SECRET}`, '')).toBe(false);
  });
});

describe.each(['/api/products', '/stats/demo', '/stats/', '/stats'])('auth admin en %s', (path) => {
  it('401 sin ADMIN_SECRET configurado (aunque se envíe Bearer vacío)', async () => {
    expect((await call(path, {})).status).toBe(401);
    expect((await call(path, {}, bearer(''))).status).toBe(401);
    expect((await call(path, { ADMIN_SECRET: '' }, bearer(''))).status).toBe(401);
  });
  it('401 sin cabecera', async () => expect((await call(path, { ADMIN_SECRET: SECRET })).status).toBe(401));
  it('401 con secreto incorrecto', async () => {
    expect((await call(path, { ADMIN_SECRET: SECRET }, bearer('mal'))).status).toBe(401);
  });
  it('pasa el middleware con secreto correcto', async () => {
    const res = await call(path, { ADMIN_SECRET: SECRET }, bearer(SECRET));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe('/stats con secreto correcto', () => {
  it('200 y escapa el slug en HTML', async () => {
    const res = await call('/stats/%3Cscript%3Ealert(1)%3C%2Fscript%3E', { ADMIN_SECRET: SECRET }, bearer(SECRET));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('webhook Telegram', () => {
  const post = (env: Record<string, unknown>, header?: string) =>
    call('/webhooks/telegram', env, {
      method: 'POST',
      headers: header === undefined ? {} : { 'X-Telegram-Bot-Api-Secret-Token': header },
      body: JSON.stringify({ update_id: 1 }),
    });
  it('403 sin secreto configurado', async () => {
    expect((await post({}, '')).status).toBe(403);
    expect((await post({})).status).toBe(403);
  });
  it('403 con secreto incorrecto', async () => {
    expect((await post({ TELEGRAM_WEBHOOK_SECRET: TG }, 'mal')).status).toBe(403);
  });
  it('200 con secreto correcto', async () => {
    expect((await post({ TELEGRAM_WEBHOOK_SECRET: TG }, TG)).status).toBe(200);
  });
});

describe('escape del slug en accept-ui', () => {
  it('el script usa JSON.stringify con < escapado', () => {
    const html = buildHtml('x</script><img src=x onerror=alert(1)>');
    expect(html).toContain('var currentSlug = "x\\u003c/script>\\u003cimg src=x onerror=alert(1)>";');
    expect(html).not.toContain('var currentSlug = "x</script>');
  });
});

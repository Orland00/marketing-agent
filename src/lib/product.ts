import type { Env, MarketingProduct } from '../types.js';
import { createSupabaseClient } from './supabase.js';

const PRODUCT_COLORS: Record<string, { accent: string; bg: string; name: string }> = {
  'demo': { accent: '#6B2F9D', bg: '#1a0f25', name: 'Demo Brand' },
  'acme': { accent: '#2563eb', bg: '#0f1a2e', name: 'Acme Co' },
  'globex': { accent: '#16a34a', bg: '#0f1f15', name: 'Globex' },
  'zeropadel': { accent: '#ea580c', bg: '#1f150f', name: 'ZeroPadel' },
};

export function getProductTheme(slug: string) {
  return PRODUCT_COLORS[slug] || { accent: '#888', bg: '#1a1a1a', name: slug };
}

export function getAllProductSlugs(): string[] {
  return Object.keys(PRODUCT_COLORS);
}

/** Resolve a product slug to a full MarketingProduct row. */
export async function resolveProduct(
  env: Env,
  slug: string
): Promise<MarketingProduct | null> {
  const db = createSupabaseClient(env);
  const { data, error } = await db
    .from('mkt_products')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !data) return null;
  return data as MarketingProduct;
}

/** Get product_id from slug. Returns null if not found. */
export async function getProductId(
  env: Env,
  slug: string
): Promise<string | null> {
  const db = createSupabaseClient(env);
  const { data } = await db
    .from('mkt_products')
    .select('id')
    .eq('slug', slug)
    .single();
  return data?.id ?? null;
}

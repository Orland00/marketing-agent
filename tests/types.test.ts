import { describe, it, expect } from 'vitest';
import type {
  MarketingProduct,
  Post,
  PostTemplate,
  Platform,
  PlatformContent,
  PostStatus,
} from '../src/types.js';

describe('Type definitions', () => {
  it('should allow valid Platform values', () => {
    const platforms: Platform[] = ['instagram', 'facebook', 'twitter', 'tiktok'];
    expect(platforms).toHaveLength(4);
  });

  it('should allow valid PostStatus values', () => {
    const statuses: PostStatus[] = [
      'draft',
      'pending_approval',
      'approved',
      'scheduled',
      'publishing',
      'published',
      'failed',
      'cancelled',
    ];
    expect(statuses).toHaveLength(8);
  });

  it('should structure PlatformContent correctly', () => {
    const content: PlatformContent = {
      instagram: { text: 'Hello IG', hashtags: ['#test'] },
      facebook: { text: 'Hello FB' },
    };
    expect(content.instagram?.text).toBe('Hello IG');
    expect(content.facebook?.text).toBe('Hello FB');
    expect(content.twitter).toBeUndefined();
  });

  it('should structure a Post correctly', () => {
    const post: Partial<Post> = {
      status: 'draft',
      content: {
        instagram: { text: 'Test post', hashtags: ['#cafe'] },
      },
      image_urls: [],
      created_by: 'telegram',
    };
    expect(post.status).toBe('draft');
    expect(post.content?.instagram?.text).toBe('Test post');
  });

  it('should structure a MarketingProduct correctly', () => {
    const product: Partial<MarketingProduct> = {
      slug: 'demo',
      name: 'Demo Brand',
      brand_voice: 'Friendly and warm',
      target_audience: 'Young urban professionals',
      default_language: 'es',
      hashtags: ['#DemoBrand'],
      accounts: {
        instagram: { page_id: '123', access_token: 'tok' },
      },
    };
    expect(product.slug).toBe('demo');
    expect(product.accounts?.instagram?.page_id).toBe('123');
  });
});

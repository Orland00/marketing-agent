import type { Platform, PlatformAdapter } from '../types.js';
import { InstagramAdapter, FacebookAdapter } from './meta.js';
import { TwitterAdapter } from './twitter.js';

const adapters: Record<string, PlatformAdapter> = {
  instagram: new InstagramAdapter(),
  facebook: new FacebookAdapter(),
  twitter: new TwitterAdapter(),
};

export function getAdapter(platform: Platform): PlatformAdapter | null {
  return adapters[platform] || null;
}

export function getSupportedPlatforms(): Platform[] {
  return Object.keys(adapters) as Platform[];
}

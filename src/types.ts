// --- Environment bindings ---

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_ADMIN_CHAT_ID: string;
  ANTHROPIC_API_KEY: string;
  META_PAGE_ACCESS_TOKEN: string;
  META_INSTAGRAM_BUSINESS_ID: string;
  META_FACEBOOK_PAGE_ID: string;
  TWITTER_API_KEY: string;
  TWITTER_API_SECRET: string;
  TWITTER_ACCESS_TOKEN: string;
  TWITTER_ACCESS_SECRET: string;
  ADMIN_SECRET: string;
  ENVIRONMENT: string;
  IMAGES_BUCKET?: R2Bucket;
}

// --- Database types ---

export interface MarketingProduct {
  id: string;
  slug: string;
  name: string;
  brand_voice: string;
  target_audience: string;
  default_language: 'es' | 'en';
  hashtags: string[];
  visual_style: string | null;
  posting_frequency: Record<string, number>;
  accounts: PlatformAccounts;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlatformAccounts {
  instagram?: { page_id: string; access_token: string };
  facebook?: { page_id: string; access_token: string };
  twitter?: {
    api_key: string;
    api_secret: string;
    access_token: string;
    access_secret: string;
  };
  tiktok?: { open_id: string; access_token: string };
}

export interface PostTemplate {
  id: string;
  product_id: string | null;
  name: string;
  description: string | null;
  prompt_template: string;
  platforms: Platform[];
  default_hashtags: string[];
  example_output: string | null;
  created_at: string;
}

export type Platform = 'instagram' | 'facebook' | 'twitter' | 'tiktok';

export type PostStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled';

export interface Post {
  id: string;
  product_id: string;
  template_id: string | null;
  campaign_id: string | null;
  status: PostStatus;
  content: PlatformContent;
  image_urls: string[];
  video_url: string | null;
  ai_prompt: string | null;
  ai_model: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  publish_results: Record<string, PublishResult>;
  error: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type PlatformContent = Partial<
  Record<Platform, { text: string; hashtags?: string[] }>
>;

export interface Campaign {
  id: string;
  product_id: string | null;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: 'draft' | 'active' | 'paused' | 'completed';
  goal: string | null;
  total_posts: number;
  created_at: string;
}

export interface PostAnalytics {
  id: string;
  post_id: string;
  platform: Platform;
  platform_post_id: string | null;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  engagement_rate: number | null;
  raw_data: Record<string, unknown>;
  fetched_at: string;
}

export interface PublishQueueItem {
  id: string;
  post_id: string;
  platform: Platform;
  status: 'pending' | 'publishing' | 'published' | 'failed';
  attempts: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_error: string | null;
  published_at: string | null;
  created_at: string;
}

// --- Platform adapter interface ---

export interface PlatformPost {
  text: string;
  imageUrls?: string[];
  videoUrl?: string;
  hashtags?: string[];
  linkUrl?: string;
}

export interface PublishResult {
  success: boolean;
  platformPostId?: string;
  postUrl?: string;
  error?: string;
}

export interface PostMetrics {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
}

export interface PlatformAdapter {
  platform: Platform;
  publish(post: PlatformPost, accounts: PlatformAccounts): Promise<PublishResult>;
  getMetrics(
    platformPostId: string,
    accounts: PlatformAccounts
  ): Promise<PostMetrics>;
}

// --- Telegram types ---

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  photo?: TelegramPhotoSize[];
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUser {
  id: number;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface ScheduledPost {
  id: string;
  image_path: string;
  image_url: string;
  title: string | null;
  caption: string;
  category: string | null;
  platform: string;
  scheduled_date: string;
  status: 'pending' | 'approved' | 'rejected' | 'published';
  brand: string;
  created_at: string;
  updated_at: string;
}

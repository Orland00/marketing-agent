import type { Env, Platform, PublishQueueItem, PlatformPost, PlatformAccounts, MarketingProduct } from '../types.js';
import { createSupabaseClient } from './supabase.js';
import { getAdapter } from '../adapters/index.js';
import { TelegramClient } from './telegram.js';
import { log } from './logger.js';

export async function processPublishQueue(env: Env): Promise<void> {
  const db = createSupabaseClient(env);
  const now = new Date().toISOString();

  // Get pending queue items where the post is scheduled for now or earlier
  const { data: queueItems } = await db
    .from('mkt_publish_queue')
    .select(`
      *,
      mkt_posts!inner(
        id, content, image_urls, image_url, video_url, status, scheduled_at,
        mkt_products(*)
      )
    `)
    .eq('status', 'pending')
    .lte('mkt_posts.scheduled_at', now)
    .eq('mkt_posts.status', 'scheduled')
    .limit(10);

  log('cron', { type: 'publish_queue', items_found: queueItems?.length || 0 });
  if (!queueItems?.length) return;

  const bot = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const adminChatId = parseInt(env.TELEGRAM_ADMIN_CHAT_ID);

  for (const item of queueItems) {
    const post = item.mkt_posts as {
      id: string;
      content: Record<string, { text: string; hashtags?: string[] }>;
      image_urls: string[];
      image_url: string | null;
      video_url: string | null;
      mkt_products: MarketingProduct;
    };

    const product = post.mkt_products;
    const platform = item.platform as Platform;
    const adapter = getAdapter(platform);

    if (!adapter) {
      await db
        .from('mkt_publish_queue')
        .update({ status: 'failed', last_error: `No adapter for ${platform}` })
        .eq('id', item.id);
      continue;
    }

    // Mark as publishing
    await db
      .from('mkt_publish_queue')
      .update({ status: 'publishing', attempts: item.attempts + 1 })
      .eq('id', item.id);

    const platformContent = post.content[platform];
    if (!platformContent) {
      await db
        .from('mkt_publish_queue')
        .update({ status: 'failed', last_error: `No content for ${platform}` })
        .eq('id', item.id);
      continue;
    }

    const platformPost: PlatformPost = {
      text: platformContent.text,
      hashtags: platformContent.hashtags,
      imageUrls: post.image_urls?.length
        ? post.image_urls
        : post.image_url
          ? [post.image_url]
          : undefined,
      videoUrl: post.video_url || undefined,
    };

    const result = await adapter.publish(platformPost, product.accounts);
    log('publish', { post_id: post.id, platform, status: result.success ? 'success' : 'failed', error: result.error });

    if (result.success) {
      await db
        .from('mkt_publish_queue')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      // Update post publish_results
      const { data: currentPost } = await db
        .from('mkt_posts')
        .select('publish_results')
        .eq('id', post.id)
        .single();

      const results = (currentPost?.publish_results || {}) as Record<string, unknown>;
      results[platform] = {
        platformPostId: result.platformPostId,
        postUrl: result.postUrl,
      };

      await db
        .from('mkt_posts')
        .update({ publish_results: results })
        .eq('id', post.id);
    } else {
      const shouldRetry = item.attempts + 1 < (item.max_attempts || 3);
      const retryDelay = Math.pow(4, item.attempts + 1) * 15 * 60 * 1000; // 15min, 1hr, 4hr

      await db
        .from('mkt_publish_queue')
        .update({
          status: shouldRetry ? 'pending' : 'failed',
          last_error: result.error || 'Unknown error',
          next_retry_at: shouldRetry
            ? new Date(Date.now() + retryDelay).toISOString()
            : null,
        })
        .eq('id', item.id);

      if (!shouldRetry) {
        await bot.sendMessage(
          adminChatId,
          `❌ Failed to publish to ${platform}: ${result.error}`
        );
      }
    }

    // Check if all platforms for this post are done
    const { data: remaining } = await db
      .from('mkt_publish_queue')
      .select('status')
      .eq('post_id', post.id);

    const allDone = remaining?.every(
      (r) => r.status === 'published' || r.status === 'failed'
    );
    const anyPublished = remaining?.some((r) => r.status === 'published');

    if (allDone) {
      const postStatus = anyPublished ? 'published' : 'failed';
      await db
        .from('mkt_posts')
        .update({
          status: postStatus,
          published_at: anyPublished ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id);

      if (anyPublished) {
        const publishedPlatforms = remaining
          ?.filter((r) => r.status === 'published')
          .map(() => '✅')
          .join('');
        await bot.sendMessage(
          adminChatId,
          `${publishedPlatforms} Post published successfully!`
        );
      }
    }
  }
}

// processPnPublishQueue removed — all products now use the unified mkt_publish_queue via processPublishQueue

export async function sendDailyBrief(env: Env): Promise<void> {
  const db = createSupabaseClient(env);
  const bot = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const adminChatId = parseInt(env.TELEGRAM_ADMIN_CHAT_ID);

  const yesterday = new Date(Date.now() - 86400000);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);

  // Monday of this week for week-to-date
  const monday = new Date(today);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  // Yesterday's results with per-product breakdown
  const { data: yesterdayPosts } = await db
    .from('mkt_posts')
    .select('status, mkt_products(name)')
    .eq('status', 'published')
    .gte('published_at', yesterday.toISOString())
    .lt('published_at', today.toISOString());

  // Per-product count for yesterday
  const productCounts: Record<string, number> = {};
  for (const post of yesterdayPosts || []) {
    const name = (post.mkt_products as unknown as { name: string })?.name || 'Unknown';
    productCounts[name] = (productCounts[name] || 0) + 1;
  }

  // Today's schedule
  const { data: todayPosts } = await db
    .from('mkt_posts')
    .select('scheduled_at, status, content, mkt_products(name)')
    .in('status', ['scheduled', 'approved'])
    .gte('scheduled_at', today.toISOString())
    .lt('scheduled_at', tomorrow.toISOString())
    .order('scheduled_at');

  // Week-to-date published count
  const { count: weekPublished } = await db
    .from('mkt_posts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')
    .gte('published_at', monday.toISOString());

  // Failed posts
  const { data: failedPosts } = await db
    .from('mkt_posts')
    .select('id')
    .eq('status', 'failed');

  // Stale pending (>24h old)
  const staleThreshold = new Date(Date.now() - 24 * 3600000).toISOString();
  const { data: stalePending } = await db
    .from('mkt_posts')
    .select('id')
    .eq('status', 'pending_approval')
    .lt('created_at', staleThreshold);

  // Pending approval count
  const { count: pendingCount } = await db
    .from('mkt_posts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending_approval');

  // Build message
  let brief = '📊 <b>Daily Brief</b>\n\n';

  // Yesterday
  brief += `<b>Ayer:</b> ${yesterdayPosts?.length || 0} posts publicados\n`;
  for (const [name, count] of Object.entries(productCounts)) {
    brief += `  ${name}: ${count}\n`;
  }

  // Today
  brief += `\n<b>Hoy:</b> ${todayPosts?.length || 0} posts programados\n`;
  if (todayPosts?.length) {
    for (const post of todayPosts) {
      const time = new Date(post.scheduled_at!).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const product = post.mkt_products as unknown as { name: string };
      const platforms = Object.keys(post.content || {}).join(', ');
      brief += `  ${time} — ${product.name} [${platforms}]\n`;
    }
  }

  // Week progress
  const weekTarget = 15; // 15 posts/week target
  const weekPct = weekPublished ? Math.round((weekPublished / weekTarget) * 100) : 0;
  brief += `\n<b>Semana:</b> ${weekPublished || 0}/${weekTarget} (${weekPct}%)\n`;

  // Warnings
  if (failedPosts?.length) {
    brief += `\n❌ ${failedPosts.length} posts fallidos — usa /retry para reintentar\n`;
  }

  if (stalePending?.length) {
    brief += `\n⚠️ ${stalePending.length} posts pendientes >24h — usa /pending\n`;
  } else if (pendingCount) {
    brief += `\n📝 ${pendingCount} posts por aprobar — /pending\n`;
  }

  log('cron', { type: 'daily_brief', yesterday_published: yesterdayPosts?.length || 0, today_scheduled: todayPosts?.length || 0 });
  await bot.sendMessage(adminChatId, brief);
}

export async function pullAnalytics(env: Env): Promise<void> {
  const db = createSupabaseClient(env);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Get published posts from last 7 days with their platform results
  const { data: posts } = await db
    .from('mkt_posts')
    .select('id, publish_results, mkt_products(*)')
    .eq('status', 'published')
    .gte('published_at', weekAgo);

  if (!posts?.length) return;

  for (const post of posts) {
    const results = post.publish_results as Record<
      string,
      { platformPostId?: string }
    >;
    const product = post.mkt_products as unknown as MarketingProduct;

    for (const [platform, result] of Object.entries(results)) {
      if (!result.platformPostId) continue;

      const adapter = getAdapter(platform as Platform);
      if (!adapter) continue;

      try {
        const metrics = await adapter.getMetrics(
          result.platformPostId,
          product.accounts
        );

        const engagementRate =
          metrics.reach > 0
            ? (metrics.likes + metrics.comments + metrics.shares) / metrics.reach
            : null;

        await db.from('mkt_post_analytics').upsert(
          {
            post_id: post.id,
            platform,
            platform_post_id: result.platformPostId,
            impressions: metrics.impressions,
            reach: metrics.reach,
            likes: metrics.likes,
            comments: metrics.comments,
            shares: metrics.shares,
            saves: metrics.saves,
            clicks: metrics.clicks,
            engagement_rate: engagementRate,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: 'post_id,platform' }
        );
      } catch {
        // Silently skip — metrics may not be available yet
      }
    }
  }
}

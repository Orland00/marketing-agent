import type {
  PlatformAdapter,
  PlatformAccounts,
  PlatformPost,
  PostMetrics,
  PublishResult,
} from '../types.js';

const GRAPH_API = 'https://graph.facebook.com/v24.0';

async function graphPost(
  url: string,
  body: Record<string, string>
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

async function graphGet(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  return (await res.json()) as Record<string, unknown>;
}

export class InstagramAdapter implements PlatformAdapter {
  platform = 'instagram' as const;

  async publish(
    post: PlatformPost,
    accounts: PlatformAccounts
  ): Promise<PublishResult> {
    const ig = accounts.instagram;
    if (!ig) return { success: false, error: 'Instagram account not configured' };

    const caption = post.hashtags
      ? `${post.text}\n\n${post.hashtags.join(' ')}`
      : post.text;

    try {
      // Step 1: Create media container
      const containerParams: Record<string, string> = {
        caption,
        access_token: ig.access_token,
      };

      if (post.imageUrls?.[0]) {
        containerParams.image_url = post.imageUrls[0];
      } else if (post.videoUrl) {
        containerParams.video_url = post.videoUrl;
        containerParams.media_type = 'REELS';
      } else {
        return { success: false, error: 'Instagram requires an image or video' };
      }

      const container = await graphPost(
        `${GRAPH_API}/${ig.page_id}/media`,
        containerParams
      );

      if (container.error) {
        const err = container.error as { message?: string };
        return { success: false, error: err.message || 'Container creation failed' };
      }

      const containerId = container.id as string;

      // Step 2: Publish the container
      const result = await graphPost(`${GRAPH_API}/${ig.page_id}/media_publish`, {
        creation_id: containerId,
        access_token: ig.access_token,
      });

      if (result.error) {
        const err = result.error as { message?: string };
        return { success: false, error: err.message || 'Publish failed' };
      }

      const postId = result.id as string;
      return {
        success: true,
        platformPostId: postId,
        postUrl: `https://www.instagram.com/p/${postId}/`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  async getMetrics(
    platformPostId: string,
    accounts: PlatformAccounts
  ): Promise<PostMetrics> {
    const ig = accounts.instagram;
    if (!ig) throw new Error('Instagram account not configured');

    const url = `${GRAPH_API}/${platformPostId}/insights?metric=impressions,reach,likes,comments,shares,saved&access_token=${ig.access_token}`;
    const data = await graphGet(url);
    const metrics = (data.data || []) as Array<{
      name: string;
      values: Array<{ value: number }>;
    }>;

    const get = (name: string) =>
      metrics.find((m) => m.name === name)?.values?.[0]?.value || 0;

    return {
      impressions: get('impressions'),
      reach: get('reach'),
      likes: get('likes'),
      comments: get('comments'),
      shares: get('shares'),
      saves: get('saved'),
      clicks: 0,
    };
  }
}

export class FacebookAdapter implements PlatformAdapter {
  platform = 'facebook' as const;

  async publish(
    post: PlatformPost,
    accounts: PlatformAccounts
  ): Promise<PublishResult> {
    const fb = accounts.facebook;
    if (!fb) return { success: false, error: 'Facebook account not configured' };

    try {
      const params: Record<string, string> = {
        message: post.text,
        access_token: fb.access_token,
      };

      let endpoint = `${GRAPH_API}/${fb.page_id}/feed`;

      if (post.imageUrls?.[0]) {
        endpoint = `${GRAPH_API}/${fb.page_id}/photos`;
        params.url = post.imageUrls[0];
      }

      if (post.linkUrl) {
        params.link = post.linkUrl;
      }

      const result = await graphPost(endpoint, params);

      if (result.error) {
        const err = result.error as { message?: string };
        return { success: false, error: err.message || 'Facebook post failed' };
      }

      const postId = (result.id || result.post_id) as string;
      return {
        success: true,
        platformPostId: postId,
        postUrl: `https://www.facebook.com/${postId}`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  async getMetrics(
    platformPostId: string,
    accounts: PlatformAccounts
  ): Promise<PostMetrics> {
    const fb = accounts.facebook;
    if (!fb) throw new Error('Facebook account not configured');

    const url = `${GRAPH_API}/${platformPostId}/insights?metric=post_impressions,post_engaged_users,post_reactions_like_total,post_comments,post_shares&access_token=${fb.access_token}`;
    const data = await graphGet(url);
    const metrics = (data.data || []) as Array<{
      name: string;
      values: Array<{ value: number }>;
    }>;

    const get = (name: string) =>
      metrics.find((m) => m.name === name)?.values?.[0]?.value || 0;

    return {
      impressions: get('post_impressions'),
      reach: get('post_engaged_users'),
      likes: get('post_reactions_like_total'),
      comments: get('post_comments'),
      shares: get('post_shares'),
      saves: 0,
      clicks: 0,
    };
  }
}

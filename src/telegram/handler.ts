import type {
  Env,
  TelegramUpdate,
  TelegramMessage,
  TelegramCallbackQuery,
  Platform,
  Post,
  InlineKeyboardButton,
  MarketingProduct,
} from '../types.js';
import { TelegramClient } from '../lib/telegram.js';
import { createSupabaseClient } from '../lib/supabase.js';
import { generateContent } from '../lib/ai.js';
import { parseSpanishDate } from '../lib/date-parser.js';
import { log } from '../lib/logger.js';
import { processPublishQueue } from '../lib/publisher.js';

// Simple in-memory rate limiter (resets on deploy/cold start — fine for single user)
const lastCommand = new Map<number, number>();
const RATE_LIMIT_MS = 2000;

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  env: Env
): Promise<void> {
  const bot = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const adminChatId = parseInt(env.TELEGRAM_ADMIN_CHAT_ID);

  // Rate limit check
  const userId = update.message?.from?.id || update.callback_query?.from.id;
  if (userId) {
    const last = lastCommand.get(userId) || 0;
    if (Date.now() - last < RATE_LIMIT_MS) {
      return; // Silently drop rapid duplicate
    }
    lastCommand.set(userId, Date.now());
  }

  try {
    if (update.message) {
      const cmd = update.message.text?.split(/\s+/)[0] || '(photo/other)';
      log('telegram_command', { command: cmd, user_id: update.message.from?.id });
      await handleMessage(update.message, bot, env, adminChatId);
    } else if (update.callback_query) {
      log('telegram_callback', { data: update.callback_query.data, user_id: update.callback_query.from.id });
      await handleCallback(update.callback_query, bot, env, adminChatId);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
    log('telegram_error', { error: errorMsg, update_id: update.update_id });
    try {
      await bot.sendMessage(adminChatId, `❌ Error: ${errorMsg}`);
    } catch {
      // Can't even send error message — log and give up
      log('telegram_error_notify_failed', { error: errorMsg });
    }
  }
}

async function handleMessage(
  msg: TelegramMessage,
  bot: TelegramClient,
  env: Env,
  adminChatId: number
): Promise<void> {
  // Admin-only check
  if (msg.chat.id !== adminChatId) {
    await bot.sendMessage(msg.chat.id, 'This bot is private.');
    return;
  }

  // Handle photo messages
  if (msg.photo?.length) {
    await handlePhoto(msg, bot, env, adminChatId);
    return;
  }

  const text = msg.text?.trim() || '';
  const [command, ...args] = text.split(/\s+/);

  switch (command) {
    case '/start':
    case '/help':
      await sendHelp(bot, adminChatId);
      break;

    case '/newpost':
      await startNewPost(bot, env, adminChatId, args[0]);
      break;

    case '/draft':
      await quickDraft(bot, env, adminChatId, args[0], args.slice(1).join(' '));
      break;

    case '/calendar':
      await showCalendar(bot, env, adminChatId);
      break;

    case '/today':
      await showToday(bot, env, adminChatId);
      break;

    case '/pending':
      await showPending(bot, env, adminChatId);
      break;

    case '/preview': {
      await showPreview(bot, env, adminChatId, args[0]);
      break;
    }

    case '/stats':
      await showStats(bot, env, adminChatId, args[0]);
      break;

    case '/products':
      await listProducts(bot, env, adminChatId);
      break;

    case '/photo':
      await startPhotoAttach(bot, env, adminChatId, args[0]);
      break;

    case '/retry':
      await retryPost(bot, env, adminChatId, args[0]);
      break;

    case '/flush':
      await flushQueue(bot, env, adminChatId);
      break;

    default:
      // Check if we're in a conversation state (awaiting topic input)
      await handleFreeText(msg, bot, env, adminChatId);
  }
}

async function handleCallback(
  query: TelegramCallbackQuery,
  bot: TelegramClient,
  env: Env,
  adminChatId: number
): Promise<void> {
  if (query.from.id !== adminChatId) {
    await bot.answerCallbackQuery(query.id, 'Not authorized');
    return;
  }

  const data = query.data || '';
  const parts = data.split(':');
  const action = parts[0];

  await bot.answerCallbackQuery(query.id);

  switch (action) {
    case 'product':
      // User selected a product for new post
      await showTemplateSelection(bot, env, adminChatId, parts[1], query.message?.message_id);
      break;

    case 'template':
      // User selected a template — ask for topic
      await askForTopic(bot, env, adminChatId, parts[1], parts[2], query.message?.message_id);
      break;

    case 'approve':
      await approvePost(bot, env, adminChatId, parts[1]);
      break;

    case 'reject':
      await rejectPost(bot, env, adminChatId, parts[1]);
      break;

    case 'regen':
      await regeneratePost(bot, env, adminChatId, parts[1]);
      break;

    case 'schedule':
      await promptSchedule(bot, env, adminChatId, parts[1]);
      break;

    case 'publishnow':
      await publishNow(bot, env, adminChatId, parts[1]);
      break;
  }
}

// --- Photo handlers ---

async function handlePhoto(
  msg: TelegramMessage,
  bot: TelegramClient,
  env: Env,
  chatId: number
): Promise<void> {
  const db = createSupabaseClient(env);
  const photos = msg.photo!;
  // Take highest resolution (last in array)
  const photo = photos[photos.length - 1];

  try {
    // Download from Telegram
    const imageData = await bot.downloadFile(photo.file_id);

    if (imageData.byteLength > 10 * 1024 * 1024) {
      await bot.sendMessage(chatId, 'Imagen muy grande. Máximo 10MB.');
      return;
    }

    // Upload to R2
    if (!env.IMAGES_BUCKET) {
      await bot.sendMessage(chatId, 'R2 storage no configurado.');
      return;
    }
    const key = `posts/${Date.now()}-${photo.file_unique_id}.jpg`;
    await env.IMAGES_BUCKET.put(key, imageData, {
      httpMetadata: { contentType: 'image/jpeg' },
    });

    const host = 'marketing-agent.example.workers.dev';
    const imageUrl = `https://${host}/images/${key}`;

    // Check if we're in a pending state
    const { data: pending } = await db
      .from('mkt_pending_actions')
      .select('*')
      .eq('chat_id', chatId)
      .single();

    if (pending?.action === 'awaiting_photo') {
      // Attach to existing post
      const postId = (pending.data as { post_id: string }).post_id;
      await db.from('mkt_pending_actions').delete().eq('chat_id', chatId);

      const { data: post } = await db
        .from('mkt_posts')
        .select('image_urls')
        .eq('id', postId)
        .single();

      const currentUrls = (post?.image_urls || []) as string[];
      currentUrls.push(imageUrl);

      await db
        .from('mkt_posts')
        .update({ image_urls: currentUrls, updated_at: new Date().toISOString() })
        .eq('id', postId);

      await bot.sendMessage(chatId, `📸 Imagen adjuntada al post.\nURL: <code>${imageUrl}</code>`);
    } else if (pending?.action === 'awaiting_topic' && msg.text) {
      // Photo + caption while awaiting topic — use caption as topic
      // This case is rare (Telegram sends photos with captions in the text field)
      await bot.sendMessage(chatId, `📸 Imagen guardada.\nURL: <code>${imageUrl}</code>\nEnvía el tema para el post.`);
    } else {
      // No pending state — just store the image
      await bot.sendMessage(chatId, `📸 Imagen guardada.\nURL: <code>${imageUrl}</code>\n\nPara adjuntar a un post: <code>/photo POST_ID</code> y luego envía la foto.`);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
    await bot.sendMessage(chatId, `❌ Error al procesar imagen: ${errorMsg}`);
  }
}

async function startPhotoAttach(
  bot: TelegramClient,
  env: Env,
  chatId: number,
  postId?: string
): Promise<void> {
  if (!postId) {
    await bot.sendMessage(chatId, 'Uso: <code>/photo POST_ID</code>');
    return;
  }

  const db = createSupabaseClient(env);

  // Verify post exists
  const { data: post } = await db
    .from('mkt_posts')
    .select('id')
    .eq('id', postId)
    .single();

  if (!post) {
    await bot.sendMessage(chatId, 'Post no encontrado.');
    return;
  }

  await db.from('mkt_pending_actions').upsert({
    chat_id: chatId,
    action: 'awaiting_photo',
    data: { post_id: postId },
    updated_at: new Date().toISOString(),
  });

  await bot.sendMessage(chatId, 'Envía la foto para adjuntar al post.');
}

// --- Command handlers ---

async function sendHelp(bot: TelegramClient, chatId: number): Promise<void> {
  await bot.sendMessage(
    chatId,
    `<b>Marketing Agent</b>

<b>Content:</b>
/newpost &lt;product&gt; — Create new post (guided)
/draft &lt;product&gt; &lt;topic&gt; — Quick AI draft
/pending — Posts awaiting approval

<b>Calendar:</b>
/calendar — Next 7 days
/today — Today's posts

<b>Analytics:</b>
/stats — Overview (all products)
/stats &lt;product&gt; — Product stats

<b>Products:</b>
/products — List registered brands`
  );
}

async function startNewPost(
  bot: TelegramClient,
  env: Env,
  chatId: number,
  productSlug?: string
): Promise<void> {
  const db = createSupabaseClient(env);
  const { data: products } = await db
    .from('mkt_products')
    .select('slug, name')
    .eq('active', true)
    .order('name');

  if (!products?.length) {
    await bot.sendMessage(chatId, 'No products registered. Add one first.');
    return;
  }

  // If product specified and valid, skip to template selection
  if (productSlug) {
    const match = products.find((p) => p.slug === productSlug);
    if (match) {
      await showTemplateSelection(bot, env, chatId, productSlug);
      return;
    }
  }

  // Show product selection
  const keyboard: InlineKeyboardButton[][] = products.map((p) => [
    { text: p.name, callback_data: `product:${p.slug}` },
  ]);

  await bot.sendMessage(chatId, 'Which product?', {
    replyMarkup: { inline_keyboard: keyboard },
  });
}

async function showTemplateSelection(
  bot: TelegramClient,
  env: Env,
  chatId: number,
  productSlug: string,
  editMessageId?: number
): Promise<void> {
  const db = createSupabaseClient(env);

  const { data: product } = await db
    .from('mkt_products')
    .select('id')
    .eq('slug', productSlug)
    .single();

  const { data: templates } = await db
    .from('mkt_templates')
    .select('id, name')
    .or(`product_id.eq.${product?.id},product_id.is.null`)
    .order('name');

  if (!templates?.length) {
    await bot.sendMessage(chatId, 'No templates found. Create some first.');
    return;
  }

  const keyboard: InlineKeyboardButton[][] = templates.map((t) => [
    { text: t.name, callback_data: `template:${productSlug}:${t.id}` },
  ]);
  keyboard.push([{ text: 'Custom (no template)', callback_data: `template:${productSlug}:custom` }]);

  const text = `Post for <b>${productSlug}</b> — pick a template:`;

  if (editMessageId) {
    await bot.editMessage(chatId, editMessageId, text, {
      replyMarkup: { inline_keyboard: keyboard },
    });
  } else {
    await bot.sendMessage(chatId, text, {
      replyMarkup: { inline_keyboard: keyboard },
    });
  }
}

async function askForTopic(
  bot: TelegramClient,
  env: Env,
  chatId: number,
  productSlug: string,
  templateId: string,
  editMessageId?: number
): Promise<void> {
  const db = createSupabaseClient(env);

  // Store pending state in KV-like mechanism (use a temp DB row)
  await db.from('mkt_pending_actions').upsert({
    chat_id: chatId,
    action: 'awaiting_topic',
    data: { product_slug: productSlug, template_id: templateId },
    updated_at: new Date().toISOString(),
  });

  const text = 'What should the post be about? Send the topic:';
  if (editMessageId) {
    await bot.editMessage(chatId, editMessageId, text);
  } else {
    await bot.sendMessage(chatId, text);
  }
}

async function handleFreeText(
  msg: TelegramMessage,
  bot: TelegramClient,
  env: Env,
  chatId: number
): Promise<void> {
  const db = createSupabaseClient(env);

  // Check for pending action
  const { data: pending } = await db
    .from('mkt_pending_actions')
    .select('*')
    .eq('chat_id', chatId)
    .single();

  if (!pending) {
    await bot.sendMessage(chatId, 'Use /help to see available commands.');
    return;
  }

  // Handle schedule input
  if (pending.action === 'awaiting_schedule') {
    await handleScheduleInput(msg, bot, env, chatId, pending.data as { post_id: string });
    return;
  }

  if (pending.action !== 'awaiting_topic') {
    await bot.sendMessage(chatId, 'Use /help to see available commands.');
    return;
  }

  const topic = msg.text || '';
  const { product_slug, template_id } = pending.data as {
    product_slug: string;
    template_id: string;
  };

  // Clear pending action
  await db.from('mkt_pending_actions').delete().eq('chat_id', chatId);

  // Generate content
  await bot.sendMessage(chatId, 'Generating content...');

  const { data: product } = await db
    .from('mkt_products')
    .select('*')
    .eq('slug', product_slug)
    .single();

  if (!product) {
    await bot.sendMessage(chatId, 'Product not found.');
    return;
  }

  let template = null;
  if (template_id !== 'custom') {
    const { data: tmpl } = await db
      .from('mkt_templates')
      .select('*')
      .eq('id', template_id)
      .single();
    template = tmpl;
  }

  const platforms: Platform[] = ['instagram', 'facebook'];

  try {
    const { content, prompt } = await generateContent(
      env,
      product,
      template,
      topic,
      platforms
    );

    // Create post in DB
    const { data: post } = await db
      .from('mkt_posts')
      .insert({
        product_id: product.id,
        template_id: template_id !== 'custom' ? template_id : null,
        status: 'pending_approval',
        content,
        ai_prompt: prompt,
        ai_model: 'claude-haiku-4-5-20251001',
        created_by: 'telegram',
      })
      .select()
      .single();

    if (!post) {
      await bot.sendMessage(chatId, 'Failed to create post.');
      return;
    }

    // Send preview with action buttons
    await sendPostPreview(bot, chatId, post, product);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    await bot.sendMessage(chatId, `Generation failed: ${errorMsg}`);
  }
}

async function sendPostPreview(
  bot: TelegramClient,
  chatId: number,
  post: Post,
  product: MarketingProduct
): Promise<void> {
  let preview = `<b>New post for ${product.name}</b>\n\n`;

  for (const [platform, data] of Object.entries(post.content)) {
    const platformData = data as { text: string; hashtags?: string[] };
    const icon =
      platform === 'instagram' ? '📱' :
      platform === 'facebook' ? '📘' :
      platform === 'twitter' ? '🐦' : '🎵';
    preview += `${icon} <b>${platform}</b>:\n`;
    preview += `<i>${platformData.text}</i>\n`;
    if (platformData.hashtags?.length) {
      preview += platformData.hashtags.join(' ') + '\n';
    }
    preview += '\n';
  }

  const keyboard: InlineKeyboardButton[][] = [
    [
      { text: 'Approve', callback_data: `approve:${post.id}` },
      { text: 'Regenerate', callback_data: `regen:${post.id}` },
    ],
    [
      { text: 'Schedule', callback_data: `schedule:${post.id}` },
      { text: 'Publish Now', callback_data: `publishnow:${post.id}` },
    ],
    [{ text: 'Reject', callback_data: `reject:${post.id}` }],
  ];

  await bot.sendMessage(chatId, preview, {
    replyMarkup: { inline_keyboard: keyboard },
  });
}

async function quickDraft(
  bot: TelegramClient,
  env: Env,
  chatId: number,
  productSlug?: string,
  topic?: string
): Promise<void> {
  if (!productSlug || !topic) {
    await bot.sendMessage(chatId, 'Usage: /draft &lt;product-slug&gt; &lt;topic&gt;');
    return;
  }

  const db = createSupabaseClient(env);
  const { data: product } = await db
    .from('mkt_products')
    .select('*')
    .eq('slug', productSlug)
    .single();

  if (!product) {
    await bot.sendMessage(chatId, `Product "${productSlug}" not found.`);
    return;
  }

  await bot.sendMessage(chatId, 'Generating draft...');

  try {
    const platforms: Platform[] = ['instagram', 'facebook'];
    const { content, prompt } = await generateContent(env, product, null, topic, platforms);

    const { data: post } = await db
      .from('mkt_posts')
      .insert({
        product_id: product.id,
        status: 'pending_approval',
        content,
        ai_prompt: prompt,
        ai_model: 'claude-haiku-4-5-20251001',
        created_by: 'telegram',
      })
      .select()
      .single();

    if (post) await sendPostPreview(bot, chatId, post, product);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    await bot.sendMessage(chatId, `Draft failed: ${errorMsg}`);
  }
}

async function showCalendar(
  bot: TelegramClient,
  env: Env,
  chatId: number
): Promise<void> {
  const db = createSupabaseClient(env);
  const now = new Date();
  const weekLater = new Date(now.getTime() + 7 * 86400000);

  const { data: posts } = await db
    .from('mkt_posts')
    .select('id, status, scheduled_at, content, mkt_products(slug, name)')
    .in('status', ['scheduled', 'approved'])
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', weekLater.toISOString())
    .order('scheduled_at');

  if (!posts?.length) {
    await bot.sendMessage(chatId, 'No posts scheduled for the next 7 days.');
    return;
  }

  let text = '<b>Calendar — Next 7 Days</b>\n\n';
  for (const post of posts) {
    const date = new Date(post.scheduled_at!).toLocaleDateString('es-MX', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const product = post.mkt_products as unknown as { slug: string; name: string };
    const platforms = Object.keys(post.content || {}).join(', ');
    text += `${date} — <b>${product.name}</b> [${platforms}] (${post.status})\n`;
  }

  await bot.sendMessage(chatId, text);
}

async function showToday(
  bot: TelegramClient,
  env: Env,
  chatId: number
): Promise<void> {
  const db = createSupabaseClient(env);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const { data: posts } = await db
    .from('mkt_posts')
    .select('id, status, scheduled_at, published_at, content, mkt_products(slug, name)')
    .or(
      `and(scheduled_at.gte.${startOfDay.toISOString()},scheduled_at.lte.${endOfDay.toISOString()}),and(published_at.gte.${startOfDay.toISOString()},published_at.lte.${endOfDay.toISOString()})`
    )
    .order('scheduled_at');

  if (!posts?.length) {
    await bot.sendMessage(chatId, 'No posts for today.');
    return;
  }

  let text = '<b>Today\'s Posts</b>\n\n';
  for (const post of posts) {
    const time = new Date(post.scheduled_at || post.published_at || '').toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const product = post.mkt_products as unknown as { slug: string; name: string };
    const statusIcon =
      post.status === 'published' ? '✅' :
      post.status === 'scheduled' ? '⏰' :
      post.status === 'failed' ? '❌' : '📝';
    text += `${statusIcon} ${time} — ${product.name} (${post.status})\n`;
  }

  await bot.sendMessage(chatId, text);
}

async function showPending(
  bot: TelegramClient,
  env: Env,
  chatId: number
): Promise<void> {
  const db = createSupabaseClient(env);
  const { data: posts } = await db
    .from('mkt_posts')
    .select('id, content, created_at, mkt_products(slug, name)')
    .eq('status', 'pending_approval')
    .order('created_at');

  if (!posts?.length) {
    await bot.sendMessage(chatId, 'No posts pending approval.');
    return;
  }

  for (const post of posts) {
    const product = post.mkt_products as unknown as MarketingProduct;
    await sendPostPreview(bot, chatId, post as unknown as Post, product);
  }
}

async function showPreview(
  bot: TelegramClient,
  env: Env,
  chatId: number,
  postId?: string
): Promise<void> {
  if (!postId) {
    await bot.sendMessage(chatId, 'Usage: /preview &lt;post_id&gt;');
    return;
  }

  const db = createSupabaseClient(env);
  const { data: post } = await db
    .from('mkt_posts')
    .select('*, mkt_products(*)')
    .eq('id', postId)
    .single();

  if (!post) {
    await bot.sendMessage(chatId, 'Post not found.');
    return;
  }

  await sendPostPreview(bot, chatId, post as Post, post.mkt_products as unknown as MarketingProduct);
}

async function showStats(
  bot: TelegramClient,
  env: Env,
  chatId: number,
  productSlug?: string
): Promise<void> {
  const db = createSupabaseClient(env);
  const since = new Date(Date.now() - 7 * 86400000).toISOString();

  let query = db
    .from('mkt_posts')
    .select('id, status, published_at')
    .gte('created_at', since);

  if (productSlug) {
    const { data: product } = await db
      .from('mkt_products')
      .select('id, name')
      .eq('slug', productSlug)
      .single();
    if (!product) {
      await bot.sendMessage(chatId, `Product "${productSlug}" not found.`);
      return;
    }
    query = query.eq('product_id', product.id);
  }

  const { data: posts } = await query;

  const published = posts?.filter((p) => p.status === 'published').length || 0;
  const scheduled = posts?.filter((p) => p.status === 'scheduled').length || 0;
  const drafts = posts?.filter((p) => p.status === 'draft' || p.status === 'pending_approval').length || 0;

  let text = `<b>Stats — Last 7 Days</b>${productSlug ? ` (${productSlug})` : ''}\n\n`;
  text += `✅ Published: ${published}\n`;
  text += `⏰ Scheduled: ${scheduled}\n`;
  text += `📝 Drafts: ${drafts}\n`;
  text += `📊 Total: ${posts?.length || 0}`;

  await bot.sendMessage(chatId, text);
}

async function listProducts(
  bot: TelegramClient,
  env: Env,
  chatId: number
): Promise<void> {
  const db = createSupabaseClient(env);
  const { data: products } = await db
    .from('mkt_products')
    .select('slug, name, active, default_language')
    .order('name');

  if (!products?.length) {
    await bot.sendMessage(chatId, 'No products registered.');
    return;
  }

  let text = '<b>Registered Products</b>\n\n';
  for (const p of products) {
    const status = p.active ? '🟢' : '🔴';
    text += `${status} <b>${p.name}</b> (${p.slug}) [${p.default_language}]\n`;
  }

  await bot.sendMessage(chatId, text);
}

// --- Callback action handlers ---

async function approvePost(
  bot: TelegramClient,
  env: Env,
  chatId: number,
  postId: string
): Promise<void> {
  const db = createSupabaseClient(env);
  await db
    .from('mkt_posts')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', postId);

  await bot.sendMessage(chatId, `Post approved. Use /schedule or /publishnow to publish.`);
}

async function rejectPost(
  bot: TelegramClient,
  env: Env,
  chatId: number,
  postId: string
): Promise<void> {
  const db = createSupabaseClient(env);
  await db
    .from('mkt_posts')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', postId);

  await bot.sendMessage(chatId, 'Post rejected.');
}

async function regeneratePost(
  bot: TelegramClient,
  env: Env,
  chatId: number,
  postId: string
): Promise<void> {
  const db = createSupabaseClient(env);
  const { data: post } = await db
    .from('mkt_posts')
    .select('*, mkt_products(*)')
    .eq('id', postId)
    .single();

  if (!post?.ai_prompt) {
    await bot.sendMessage(chatId, 'Cannot regenerate — no original prompt found.');
    return;
  }

  await bot.sendMessage(chatId, 'Regenerating...');

  const product = post.mkt_products as unknown as MarketingProduct;
  const platforms = Object.keys(post.content || {}) as Platform[];
  // Extract topic from the original prompt
  const topicMatch = post.ai_prompt.match(/about: (.+)/);
  const topic = topicMatch ? topicMatch[1] : 'the same topic';

  try {
    const { content, prompt } = await generateContent(env, product, null, topic, platforms);

    await db
      .from('mkt_posts')
      .update({
        content,
        ai_prompt: prompt,
        status: 'pending_approval',
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId);

    const updatedPost = { ...post, content } as Post;
    await sendPostPreview(bot, chatId, updatedPost, product);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    await bot.sendMessage(chatId, `Regeneration failed: ${errorMsg}`);
  }
}

async function handleScheduleInput(
  msg: TelegramMessage,
  bot: TelegramClient,
  env: Env,
  chatId: number,
  data: { post_id: string }
): Promise<void> {
  const db = createSupabaseClient(env);
  const text = msg.text || '';

  // Clear pending action
  await db.from('mkt_pending_actions').delete().eq('chat_id', chatId);

  const scheduledDate = parseSpanishDate(text);
  if (!scheduledDate) {
    await bot.sendMessage(
      chatId,
      'No entendí la fecha. Usa formato: <code>2026-04-01 10:00</code> o <code>manana 10:00</code> o <code>viernes 14:00</code>'
    );
    return;
  }

  // Verify post exists and has content
  const { data: post } = await db
    .from('mkt_posts')
    .select('id, content, status')
    .eq('id', data.post_id)
    .single();

  if (!post) {
    await bot.sendMessage(chatId, 'Post no encontrado.');
    return;
  }

  if (post.status === 'published') {
    await bot.sendMessage(chatId, 'Este post ya fue publicado.');
    return;
  }

  if (post.status === 'cancelled') {
    await bot.sendMessage(chatId, 'Este post fue cancelado.');
    return;
  }

  // Update post to scheduled
  await db
    .from('mkt_posts')
    .update({
      status: 'scheduled',
      scheduled_at: scheduledDate.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.post_id);

  // Create publish queue entries
  const platforms = Object.keys(post.content || {}) as Platform[];
  if (platforms.length > 0) {
    const queueEntries = platforms.map((platform) => ({
      post_id: data.post_id,
      platform,
      status: 'pending' as const,
    }));
    await db.from('mkt_publish_queue').insert(queueEntries);
  }

  const dateStr = scheduledDate.toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  });

  const platformIcons = platforms.map((p) => {
    const icon = p === 'instagram' ? '📱' : p === 'facebook' ? '📘' : p === 'twitter' ? '🐦' : '🎵';
    return `${icon} ${p}`;
  }).join(', ');

  await bot.sendMessage(
    chatId,
    `✅ Programado para <b>${dateStr}</b>\nPlataformas: ${platformIcons}`
  );
}

async function promptSchedule(
  bot: TelegramClient,
  env: Env,
  chatId: number,
  postId: string
): Promise<void> {
  const db = createSupabaseClient(env);

  await db.from('mkt_pending_actions').upsert({
    chat_id: chatId,
    action: 'awaiting_schedule',
    data: { post_id: postId },
    updated_at: new Date().toISOString(),
  });

  await bot.sendMessage(
    chatId,
    `¿Cuándo publicar?\n\nFormatos aceptados:\n• <code>2026-04-01 10:00</code>\n• <code>hoy 18:00</code>\n• <code>manana 10:00</code>\n• <code>viernes 14:00</code>\n• <code>lunes 9am</code>`
  );
}

async function publishNow(
  bot: TelegramClient,
  env: Env,
  chatId: number,
  postId: string
): Promise<void> {
  const db = createSupabaseClient(env);

  const { data: post } = await db
    .from('mkt_posts')
    .select('content')
    .eq('id', postId)
    .single();

  if (!post) {
    await bot.sendMessage(chatId, 'Post not found.');
    return;
  }

  // Set to scheduled with current time so cron picks it up immediately
  await db
    .from('mkt_posts')
    .update({
      status: 'scheduled',
      scheduled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId);

  // Create queue entries
  const platforms = Object.keys(post.content || {}) as Platform[];
  const queueEntries = platforms.map((platform) => ({
    post_id: postId,
    platform,
    status: 'pending' as const,
  }));
  await db.from('mkt_publish_queue').insert(queueEntries);

  await bot.sendMessage(
    chatId,
    `Post queued for immediate publishing to: ${platforms.join(', ')}`
  );
}

async function retryPost(
  bot: TelegramClient,
  env: Env,
  chatId: number,
  postId?: string
): Promise<void> {
  if (!postId) {
    await bot.sendMessage(chatId, 'Uso: <code>/retry POST_ID</code>');
    return;
  }

  const db = createSupabaseClient(env);

  const { data: post } = await db
    .from('mkt_posts')
    .select('id, status')
    .eq('id', postId)
    .single();

  if (!post) {
    await bot.sendMessage(chatId, 'Post no encontrado.');
    return;
  }

  if (post.status !== 'failed') {
    await bot.sendMessage(chatId, `Este post no necesita reintento. Estado: ${post.status}`);
    return;
  }

  // Reset queue entries
  await db
    .from('mkt_publish_queue')
    .update({ status: 'pending', attempts: 0, last_error: null })
    .eq('post_id', postId);

  // Reset post status
  await db
    .from('mkt_posts')
    .update({ status: 'scheduled', scheduled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', postId);

  log('retry_post', { post_id: postId });
  await bot.sendMessage(chatId, 'Post reintentado. Se publicará en los próximos 15 minutos.');
}

async function flushQueue(
  bot: TelegramClient,
  env: Env,
  chatId: number
): Promise<void> {
  await bot.sendMessage(chatId, 'Procesando cola de publicación...');
  await processPublishQueue(env);
  log('flush_queue', {});
  await bot.sendMessage(chatId, '✅ Cola procesada.');
}

import Anthropic from '@anthropic-ai/sdk';
import { log } from './logger.js';
import type {
  Env,
  MarketingProduct,
  Platform,
  PlatformContent,
  PostTemplate,
} from '../types.js';

const PLATFORM_RULES: Record<Platform, string> = {
  instagram:
    'Instagram: max 2200 chars. Include hashtags at end. Use line breaks for readability. Visual-first platform — reference the image.',
  facebook:
    'Facebook: conversational tone. Can be longer. Minimal hashtags (2-3 max). Include a call to action.',
  twitter:
    'Twitter/X: max 280 chars total including hashtags. Punchy, direct. 1-2 hashtags max. No fluff.',
  tiktok:
    'TikTok: casual, trend-aware. Include relevant hashtags. Keep it short and engaging. Reference the video.',
};

function buildPrompt(
  product: MarketingProduct,
  template: PostTemplate | null,
  topic: string,
  platforms: Platform[]
): string {
  const platformInstructions = platforms
    .map((p) => `- ${PLATFORM_RULES[p]}`)
    .join('\n');

  const templateSection = template
    ? `\nPost type: ${template.name}\n${template.description || ''}\n${
        template.example_output
          ? `Example of this style:\n${template.example_output}`
          : ''
      }`
    : '';

  return `Create a social media post about: ${topic}
${templateSection}

Write a separate version for EACH platform:
${platformInstructions}

Default hashtags to consider: ${product.hashtags.join(' ')}

Respond in valid JSON format:
{
  "instagram": { "text": "...", "hashtags": ["..."] },
  "facebook": { "text": "..." },
  "twitter": { "text": "..." },
  "tiktok": { "text": "..." }
}

Only include platforms requested. Each "text" field should contain the complete post text.`;
}

export async function generateContent(
  env: Env,
  product: MarketingProduct,
  template: PostTemplate | null,
  topic: string,
  platforms: Platform[],
  model: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-5-20250514' = 'claude-haiku-4-5-20251001'
): Promise<{ content: PlatformContent; prompt: string }> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are a social media copywriter for ${product.name}.

Brand voice: ${product.brand_voice}
Target audience: ${product.target_audience}
Language: ${product.default_language === 'es' ? 'Spanish' : 'English'}
Visual style context: ${product.visual_style || 'Modern and clean'}

Rules:
- Sound human, local, authentic. Never generic AI language.
- Never use phrases like "en un mundo donde...", "descubre el poder de...", "te invitamos a..."
- Include a clear call to action appropriate for the platform.
- Respect character limits strictly.
- Output ONLY valid JSON, no markdown fences.`;

  const userPrompt = buildPrompt(product, template, topic, platforms);

  const start = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const duration_ms = Date.now() - start;

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '';

  log('ai_generate', {
    product: product.slug,
    topic,
    model,
    platforms,
    duration_ms,
    input_tokens: response.usage?.input_tokens,
    output_tokens: response.usage?.output_tokens,
  });

  // Parse JSON from response — handle potential markdown fences
  const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(jsonStr) as PlatformContent;

  return { content: parsed, prompt: userPrompt };
}

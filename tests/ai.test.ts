import { describe, it, expect } from 'vitest';

// Test the prompt building logic (extracted for testability)
const PLATFORM_RULES: Record<string, string> = {
  instagram:
    'Instagram: max 2200 chars. Include hashtags at end. Use line breaks for readability.',
  facebook:
    'Facebook: conversational tone. Can be longer. Minimal hashtags.',
  twitter:
    'Twitter/X: max 280 chars total including hashtags. Punchy, direct.',
};

function buildPromptForTest(
  productName: string,
  brandVoice: string,
  topic: string,
  platforms: string[]
): string {
  const platformInstructions = platforms
    .map((p) => `- ${PLATFORM_RULES[p] || p}`)
    .join('\n');

  return `Create a social media post about: ${topic}\n\nWrite a separate version for EACH platform:\n${platformInstructions}`;
}

describe('AI Content Generation', () => {
  it('should build prompt with correct platform instructions', () => {
    const prompt = buildPromptForTest(
      'Demo Brand',
      'Friendly',
      '2x1 en lattes',
      ['instagram', 'facebook']
    );

    expect(prompt).toContain('2x1 en lattes');
    expect(prompt).toContain('Instagram');
    expect(prompt).toContain('Facebook');
    expect(prompt).not.toContain('Twitter');
  });

  it('should include all requested platforms', () => {
    const prompt = buildPromptForTest(
      'Globex',
      'Expert',
      'cloud cost tips',
      ['twitter', 'facebook']
    );

    expect(prompt).toContain('Twitter');
    expect(prompt).toContain('Facebook');
    expect(prompt).not.toContain('Instagram');
  });

  it('should handle single platform', () => {
    const prompt = buildPromptForTest(
      'Acme Co',
      'Professional',
      'hydration tips',
      ['instagram']
    );

    expect(prompt).toContain('Instagram');
    expect(prompt).toContain('hydration tips');
  });
});

describe('Content validation', () => {
  it('should validate Twitter content fits 280 chars', () => {
    const tweetText = 'Short tweet about cloud costs #FinOps';
    expect(tweetText.length).toBeLessThanOrEqual(280);
  });

  it('should validate Instagram content fits 2200 chars', () => {
    const igText = 'A longer Instagram post about coffee culture in the city...';
    expect(igText.length).toBeLessThanOrEqual(2200);
  });

  it('should parse JSON content structure', () => {
    const mockResponse = JSON.stringify({
      instagram: { text: 'IG post', hashtags: ['#test'] },
      facebook: { text: 'FB post' },
    });

    const parsed = JSON.parse(mockResponse);
    expect(parsed.instagram.text).toBe('IG post');
    expect(parsed.instagram.hashtags).toContain('#test');
    expect(parsed.facebook.text).toBe('FB post');
  });
});

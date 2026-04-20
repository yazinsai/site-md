import type { BotCategory } from "./types";

export const BOT_CATEGORIES: Record<BotCategory, RegExp> = {
  training:
    /GPTBot|Bytespider|CCBot|meta-externalagent|Google-Extended|Applebot-Extended|Amazonbot|FacebookBot/i,
  search: /OAI-SearchBot|PerplexityBot|YouBot/i,
  userAgent: /ChatGPT-User|Perplexity-User|Claude-SearchTool/i,
};

export function mergeBotPatterns(input: {
  additionalPatterns?: Partial<Record<BotCategory, RegExp>>;
  overridePatterns?: Partial<Record<BotCategory, RegExp>>;
}): Record<BotCategory, RegExp> {
  const out: Record<BotCategory, RegExp> = {
    ...BOT_CATEGORIES,
  };

  for (const key of Object.keys(out) as BotCategory[]) {
    const override = input.overridePatterns?.[key];
    if (override) {
      out[key] = override;
      continue;
    }

    const add = input.additionalPatterns?.[key];
    if (add) {
      out[key] = new RegExp(`${out[key].source}|${add.source}`, out[key].flags);
    }
  }

  return out;
}

export function detectBotCategory(
  userAgent: string,
  patterns: Record<BotCategory, RegExp>,
): BotCategory | undefined {
  for (const category of Object.keys(patterns) as BotCategory[]) {
    if (patterns[category].test(userAgent)) {
      return category;
    }
  }
  return undefined;
}

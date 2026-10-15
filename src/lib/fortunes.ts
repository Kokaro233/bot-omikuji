import type { FortuneDefinition, FortuneStats } from "@/src/types";

// Display names and verses live in src/i18n/*/fortunes.json. `name` is the internal
// catalog label shared with the backend (supabase/functions/_shared/fortuneCatalog.ts).
export const FORTUNES: FortuneDefinition[] = [
  { id: 0, kanji: "大吉", name: "Great Blessing", rarity: "SSR", weight: 5, career: 5, love: 5, wealth: 5, theme: "gold" },
  { id: 1, kanji: "中吉", name: "Rising Fortune", rarity: "SR", weight: 12, career: 4, love: 4, wealth: 4, theme: "rose" },
  { id: 2, kanji: "小吉", name: "Gentle Blessing", rarity: "SR", weight: 18, career: 4, love: 3, wealth: 3, theme: "violet" },
  { id: 3, kanji: "吉", name: "Good Fortune", rarity: "R", weight: 25, career: 3, love: 4, wealth: 3, theme: "blue" },
  { id: 4, kanji: "末吉", name: "Future Fortune", rarity: "R", weight: 20, career: 3, love: 3, wealth: 2, theme: "slate" },
  { id: 5, kanji: "凶", name: "Caution", rarity: "R", weight: 15, career: 2, love: 2, wealth: 2, theme: "red" },
  { id: 6, kanji: "大凶", name: "Great Caution", rarity: "R", weight: 5, career: 1, love: 2, wealth: 1, theme: "red" },
];

export function getFortune(id: number) {
  return FORTUNES.find((fortune) => fortune.id === id) ?? FORTUNES[3];
}

export function drawWeightedFortune(random = Math.random() * 100) {
  let cursor = 0;
  for (const fortune of FORTUNES) {
    cursor += fortune.weight;
    if (random < cursor) return fortune;
  }
  return FORTUNES[3];
}

export function stars(value: number) {
  return `${"★".repeat(value)}${"☆".repeat(5 - value)}`;
}

const STAT_RULES: Record<number, { total: number; min: number; max: number }> = {
  0: { total: 15, min: 5, max: 5 },
  1: { total: 13, min: 4, max: 5 },
  2: { total: 11, min: 3, max: 4 },
  3: { total: 10, min: 3, max: 4 },
  4: { total: 9, min: 2, max: 4 },
  5: { total: 7, min: 2, max: 3 },
  6: { total: 5, min: 1, max: 2 },
};

function seededNumber(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function fortuneStats(fortuneId: number, seed: string): FortuneStats {
  const rule = STAT_RULES[fortuneId] ?? STAT_RULES[3];
  const keys = ["career", "love", "wealth"] as const;
  const stats: FortuneStats = { career: rule.min, love: rule.min, wealth: rule.min };
  let remaining = rule.total - rule.min * keys.length;
  let cursor = seededNumber(`${fortuneId}:${seed || "omikuji"}`);

  while (remaining > 0) {
    const key = keys[cursor % keys.length];
    if (stats[key] < rule.max) {
      stats[key] += 1;
      remaining -= 1;
    }
    cursor = Math.imul(cursor ^ 0x9e3779b9, 2654435761) >>> 0;
  }

  return stats;
}

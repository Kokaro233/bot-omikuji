// [type, rarity, message] per on-chain fortune id. Must stay aligned with src/lib/fortunes.ts
// (enforced by tests/fortuneCatalog.test.ts).
export const FORTUNE_CATALOG = [
  ["Great Blessing", "SSR", "Great things are coming your way."],
  ["Rising Fortune", "SR", "A patient heart opens the gate."],
  ["Gentle Blessing", "SR", "Small joys gather into light."],
  ["Good Fortune", "R", "A kind encounter awaits."],
  ["Future Fortune", "R", "Your season will come."],
  ["Caution", "R", "Move gently today."],
  ["Great Caution", "R", "Even the darkest night passes."],
] as const;

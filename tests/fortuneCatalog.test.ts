import { describe, expect, it } from "vitest";
import { FORTUNE_COUNT } from "@/supabase/functions/_shared/botchain.ts";
import { FORTUNE_CATALOG } from "@/supabase/functions/_shared/fortuneCatalog.ts";
import { FORTUNES } from "@/src/lib/fortunes";

describe("fortune catalog", () => {
  it("keeps the seven fortunes identical between frontend, backend and contract", () => {
    expect(FORTUNES).toHaveLength(FORTUNE_COUNT);
    expect(FORTUNE_CATALOG).toHaveLength(FORTUNE_COUNT);
    FORTUNES.forEach((fortune, id) => {
      expect(fortune.id).toBe(id);
      expect(FORTUNE_CATALOG[id][0]).toBe(fortune.name);
      expect(FORTUNE_CATALOG[id][1]).toBe(fortune.rarity);
    });
  });

  it("matches the contract's roll weights (5/12/18/25/20/15/5)", () => {
    expect(FORTUNES.map((fortune) => fortune.weight)).toEqual([5, 12, 18, 25, 20, 15, 5]);
  });
});

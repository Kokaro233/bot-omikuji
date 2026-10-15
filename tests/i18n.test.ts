import { describe, expect, it } from "vitest";
import { detectLanguage, resources } from "@/src/i18n";
import { FORTUNES } from "@/src/lib/fortunes";

type Tree = { [key: string]: string | string[] | Tree };
const PLURAL = /_(zero|one|two|few|many|other)$/;

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((out, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else if (Array.isArray(value)) value.forEach((item, index) => { out[`${path}.${index}`] = item; });
    else Object.assign(out, flatten(value, path));
    return out;
  }, {});
}

const zh = flatten(resources["zh-CN"] as unknown as Tree);
const en = flatten(resources.en as unknown as Tree);
const baseKeys = (strings: Record<string, string>) => new Set(Object.keys(strings).map((key) => key.replace(PLURAL, "")));
const vars = (text: string) => [...text.matchAll(/{{(\w+)}}/g)].map((match) => match[1]).sort();

// Strings allowed to stay empty in one language (the kami gloss is for English readers only).
const OPTIONAL = new Set(["draw.kamiNote"]);
// English strings that intentionally contain Chinese (the language switch to Chinese).
const EN_CJK_ALLOWED = new Set(["common.language.switchTo", "common.language.label"]);

describe("translations", () => {
  it("have the same keys in Chinese and English", () => {
    expect([...baseKeys(en)].sort()).toEqual([...baseKeys(zh)].sort());
  });

  it("use the same placeholders in both languages", () => {
    for (const key of Object.keys(en)) {
      const zhText = zh[key] ?? zh[key.replace(PLURAL, "")];
      expect(vars(en[key]).filter((name) => name !== "count"), key).toEqual(vars(zhText).filter((name) => name !== "count"));
    }
  });

  it("leave no string empty except the documented ones", () => {
    for (const [key, value] of [...Object.entries(zh), ...Object.entries(en)]) {
      if (!OPTIONAL.has(key)) expect(value.trim(), key).not.toBe("");
    }
    expect(en["draw.kamiNote"]).toMatch(/kami/i);
  });

  it("cover every on-chain fortune with a name and verse", () => {
    for (const fortune of FORTUNES) {
      for (const strings of [zh, en]) {
        expect(strings[`fortunes.${fortune.id}.name`]).toBeTruthy();
        expect(strings[`fortunes.${fortune.id}.message`]).toBeTruthy();
      }
    }
    expect(FORTUNES.map((fortune) => en[`fortunes.${fortune.id}.name`])).toEqual([
      "Great Blessing", "Middle Blessing", "Small Blessing", "Blessing", "Blessing Yet to Come", "Misfortune", "Great Misfortune",
    ]);
  });

  it("follow the English style guide", () => {
    for (const [key, value] of Object.entries(en)) {
      if (!EN_CJK_ALLOWED.has(key)) expect(value, key).not.toMatch(/[　-〿一-鿿＀-￯]/);
      expect(value, key).not.toMatch(/\.\.\./);
      expect(value, key).not.toMatch(/\b(gods?|curse[sd]?|luck)\b/i);
      expect(value, key).not.toMatch(/\bomikujis\b/i);
    }
    // Verses and the shrine maiden's lines stay quiet: no exclamation marks.
    for (const [key, value] of Object.entries(en)) {
      if (key.startsWith("fortunes.") || key.startsWith("draw.dialogue.")) expect(value, key).not.toContain("!");
    }
    // Verses stay short enough for the card (style guide §5: at most ~25 words).
    for (const fortune of FORTUNES) expect(en[`fortunes.${fortune.id}.message`].split(/\s+/).length).toBeLessThanOrEqual(25);
  });

  it("keep money and transaction lines explicit", () => {
    expect(en["draw.dialogue.wallet"]).toMatch(/transaction/);
    expect(en["draw.dialogue.wallet"]).toMatch(/gas fee/);
    expect(zh["draw.dialogue.wallet"]).toMatch(/交易/);
    expect(zh["draw.dialogue.wallet"]).toMatch(/Gas/);
    expect(en["profile.account.signInHelp"]).toMatch(/no transaction/);
    expect(en["profile.account.signInHelp"]).toMatch(/no gas/);
  });
});

describe("language detection", () => {
  it("defaults to English and keeps a saved choice", () => {
    expect(detectLanguage(null)).toBe("en");
    expect(detectLanguage("en")).toBe("en");
    expect(detectLanguage("zh-CN")).toBe("zh-CN");
    expect(detectLanguage("fr")).toBe("en");
  });
});

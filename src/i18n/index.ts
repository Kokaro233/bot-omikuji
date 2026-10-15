// Bilingual UI (zh-CN / en). Resources are small and bundled with the app, so the
// shrine renders in the right language on first paint. Add a language by adding a
// folder with the same files (e.g. "ja") and listing it in LANGUAGES.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCollection from "./en/collection.json";
import enCommon from "./en/common.json";
import enDraw from "./en/draw.json";
import enFortunes from "./en/fortunes.json";
import enHome from "./en/home.json";
import enProfile from "./en/profile.json";
import enResult from "./en/result.json";
import zhCollection from "./zh-CN/collection.json";
import zhCommon from "./zh-CN/common.json";
import zhDraw from "./zh-CN/draw.json";
import zhFortunes from "./zh-CN/fortunes.json";
import zhHome from "./zh-CN/home.json";
import zhProfile from "./zh-CN/profile.json";
import zhResult from "./zh-CN/result.json";

export const LANGUAGES = ["zh-CN", "en"] as const;
export type Language = (typeof LANGUAGES)[number];
export const LANGUAGE_KEY = "botchain-omikuji:language";

export const resources = {
  "zh-CN": { common: zhCommon, home: zhHome, draw: zhDraw, result: zhResult, collection: zhCollection, profile: zhProfile, fortunes: zhFortunes },
  en: { common: enCommon, home: enHome, draw: enDraw, result: enResult, collection: enCollection, profile: enProfile, fortunes: enFortunes },
} as const;

/** The visitor's saved choice; otherwise English (the default for every first visit). */
export function detectLanguage(saved: string | null): Language {
  return saved && (LANGUAGES as readonly string[]).includes(saved) ? (saved as Language) : "en";
}

function readSaved() {
  try { return localStorage.getItem(LANGUAGE_KEY); } catch { return null; }
}

function applyDocumentLanguage(language: string) {
  if (typeof document === "undefined") return;
  const t = i18n.getFixedT(language, "common");
  document.documentElement.lang = language;
  document.title = t("meta.title");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.description"));
}

export function setLanguage(language: Language) {
  try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* private mode */ }
  void i18n.changeLanguage(language);
}

void i18n.use(initReactI18next).init({
  resources,
  lng: typeof window === "undefined" ? "en" : detectLanguage(readSaved()),
  fallbackLng: "en",
  supportedLngs: LANGUAGES,
  ns: ["common", "home", "draw", "result", "collection", "profile", "fortunes"],
  defaultNS: "common",
  load: "currentOnly",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", applyDocumentLanguage);
applyDocumentLanguage(i18n.language);

export default i18n;

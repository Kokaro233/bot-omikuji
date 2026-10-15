import { useCallback } from "react";
import { useTranslation } from "react-i18next";

/** Localized level name (English) or subtitle (Chinese), verse and romaji for a fortune id. */
export function useFortuneText() {
  const { t } = useTranslation("fortunes");
  return useCallback((id: number) => ({
    name: t(`${id}.name`),
    message: t(`${id}.message`),
    romaji: t(`${id}.romaji`),
  }), [t]);
}

"use client";

import { motion } from "framer-motion";
import { BadgeCheck, ExternalLink, Heart, RotateCcw, Share2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOmikuji } from "@/src/components/OmikujiApp";
import { useFortuneText } from "@/src/i18n/useFortuneText";
import { fortuneStats, getFortune, stars } from "@/src/lib/fortunes";
import { explorerTx } from "@/src/config/chain";
import { hasChainProof } from "@/src/lib/history";
import { shortAddress } from "@/src/lib/runtime";
import { buildFortuneShareUrl, getSharedFortuneId } from "@/src/lib/share";

export function ResultView() {
  const { lastResult, navigate, toggleFavorite } = useOmikuji();
  const [shared, setShared] = useState<"" | "copied" | "shared">("");
  const { t, i18n } = useTranslation("result");
  const fortuneText = useFortuneText();
  const sharedFortuneId = getSharedFortuneId(window.location.search);
  const isSharedView = sharedFortuneId !== null;
  if (!lastResult && !isSharedView) return <div className="empty-state"><span>?</span><h1>{t("empty.title")}</h1><p>{t("empty.body")}</p><button className="primary-button" onClick={() => navigate("draw")}>{t("empty.cta")}</button></div>;
  const currentResult = isSharedView ? null : lastResult;
  const fortune = getFortune(sharedFortuneId ?? currentResult!.fortuneId);
  const stats = fortuneStats(fortune.id, currentResult?.txHash ?? `shared-${fortune.id}`);
  const text = fortuneText(fortune.id);
  const formatTime = (value: string) => new Date(value).toLocaleString(i18n.language);

  async function copyShareText(value: string) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch { /* Safari and embedded desktop browsers may deny this API */ }
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("clipboard unavailable");
  }

  async function share() {
    const message = t("shareText", { kanji: fortune.kanji, name: text.name });
    const shareUrl = buildFortuneShareUrl(window.location.origin, fortune.id);
    const shareText = `${message} ${shareUrl}`;
    const useNativeShare = Boolean(navigator.share) && window.matchMedia("(pointer: coarse)").matches;
    try {
      if (useNativeShare) {
        await navigator.share({ title: "BOT Omikuji", text: message, url: shareUrl });
        setShared("shared");
      } else {
        await copyShareText(shareText);
        setShared("copied");
      }
    } catch {
      try {
        await copyShareText(shareText);
        setShared("copied");
      } catch { /* clipboard permission denied */ }
    }
  }

  return (
    <div className={`result-layout theme-${fortune.theme}`}>
      <section className="result-card-wrap">
        <div className="fortune-stage">
          <div className="result-rays" aria-hidden="true" />
          <div className="result-label">{isSharedView ? t("label.shared") : t("label.own")}</div>
          <motion.article className="fortune-card" initial={{ rotateY: 90, scale: .7 }} animate={{ rotateY: 0, scale: 1 }} transition={{ type: "spring", stiffness: 90, damping: 13 }}>
            <div className="card-corner top-left">❀</div><div className="card-corner top-right">❀</div>
            <span className="rarity">{fortune.rarity}</span>
            <h1 title={text.romaji}>{fortune.kanji}</h1>
            <h2>{text.name}</h2>
            <div className="divider">✦</div>
            <dl className="stats">
              <div><dt>{t("stats.career")}</dt><dd>{stars(stats.career)}</dd></div>
              <div><dt>{t("stats.love")}</dt><dd>{stars(stats.love)}</dd></div>
              <div><dt>{t("stats.wealth")}</dt><dd>{stars(stats.wealth)}</dd></div>
            </dl>
            <p>{text.message}</p>
            <div className="card-flower">✿</div>
          </motion.article>
        </div>
        <div className="result-actions">
          {isSharedView ? <button className="purple-button" onClick={() => navigate("draw")}><RotateCcw size={17}/> {t("button.drawOwn")}</button> : <>
            <button className="red-button" onClick={share}><Share2 size={17}/>{shared ? t(`button.${shared}`) : t("button.share")}</button>
            <button className="purple-button" onClick={() => navigate("draw")}><RotateCcw size={17}/> {t("button.drawAgain")}</button>
            {lastResult && <button className={`favorite-button ${lastResult.favorite ? "active" : ""}`} aria-label={t("button.favorite")} aria-pressed={lastResult.favorite} onClick={() => toggleFavorite(lastResult.id)}><Heart size={19} fill={lastResult.favorite ? "currentColor" : "none"}/></button>}
          </>}
        </div>
      </section>

      {!isSharedView && lastResult ? <aside className="verification-panel">
        <h2><BadgeCheck/> {lastResult.mode === "live" ? t("proof.liveTitle") : t("proof.guestTitle")}</h2>
        {lastResult.mode === "live"
          ? <dl><div><dt>{t("proof.wallet")}</dt><dd>{shortAddress(lastResult.walletAddress)}</dd></div><div><dt>{t("proof.tx")}</dt><dd>{lastResult.txHash ? shortAddress(lastResult.txHash) : t("proof.loading")}</dd></div><div><dt>{t("proof.record")}</dt><dd>{lastResult.recordIndex !== undefined ? `#${lastResult.recordIndex}` : "—"}</dd></div><div><dt>{t("proof.block")}</dt><dd>{lastResult.blockNumber || "—"}</dd></div><div><dt>{t("proof.time")}</dt><dd>{formatTime(lastResult.createdAt)}</dd></div></dl>
          : <dl><div><dt>{t("proof.source")}</dt><dd>{t("proof.localRandom")}</dd></div><div><dt>{t("proof.time")}</dt><dd>{formatTime(lastResult.createdAt)}</dd></div></dl>}
        {hasChainProof(lastResult) ? <a href={explorerTx(lastResult.txHash)} target="_blank" rel="noreferrer">{t("common:explorer.viewTx")} <ExternalLink size={14}/></a> : <div className="demo-proof">{lastResult.mode === "live" ? t("proof.pendingHash") : t("proof.guestNote")}</div>}
      </aside> : <div className="recorded-note shared-result-note">{t("sharedNote")}</div>}
      {!isSharedView && lastResult && <div className="recorded-note">{lastResult.mode === "live" ? t("recorded.live") : t("recorded.guest")}</div>}
      <div className="result-footer-blessing" aria-label={t("closing.label")}>
        <span>✿</span><p>{t("closing.text")}</p>
        <button onClick={() => navigate("collection")}>{t("closing.toCollection")}</button>
      </div>
    </div>
  );
}

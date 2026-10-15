"use client";

import { motion } from "framer-motion";
import { BadgeCheck, Coins, Gauge, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useReadContract } from "wagmi";
import { fortuneContractAbi } from "@/supabase/functions/_shared/botchain.ts";
import { EcosystemFooter } from "@/src/components/EcosystemFooter";
import { Frame, useOmikuji } from "@/src/components/OmikujiApp";
import { botChain } from "@/src/config/chain";
import { chainEnabled, runtime, runtimeMode } from "@/src/lib/runtime";
import { readGuestDrawCount } from "@/src/lib/supabase";

export function HomeView() {
  const { navigate } = useOmikuji();
  const { t, i18n } = useTranslation("home");
  const [guestDrawCount, setGuestDrawCount] = useState<number | null>(null);
  // The on-chain total is read straight from the contract, not from the backend.
  const { data: totalDraws, isError: countUnavailable } = useReadContract({
    address: runtime.contractAddress ?? undefined,
    abi: fortuneContractAbi,
    functionName: "totalDraws",
    chainId: botChain.id,
    query: { enabled: chainEnabled, refetchInterval: 60_000 },
  });
  const onchainDrawCount = totalDraws === undefined ? null : Number(totalDraws);

  useEffect(() => {
    if (runtimeMode === "demo") return;
    let cancelled = false;
    void readGuestDrawCount().then((count) => { if (!cancelled && count !== null) setGuestDrawCount(count); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const countLabel = t(runtimeMode === "demo" ? "count.demo" : runtimeMode === "unconfigured" ? "count.unconfigured" : countUnavailable ? "count.unavailable" : "count.live");
  const number = (value: number) => value.toLocaleString(i18n.language);
  const steps = t("steps", { returnObjects: true }) as string[];
  const totalDrawCount = onchainDrawCount === null
    ? null
    : onchainDrawCount + (guestDrawCount ?? 0);
  return (
    <div className="home-layout">
      <aside className="home-left">
        <motion.div className="hero-title" initial={{ x: -28, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
          <span className="eyebrow">{t("eyebrow")}</span>
          <h1><small>BOT Chain</small>Omikuji</h1>
          <p>{t("tagline")}</p>
        </motion.div>
        <Frame>
          <h2 className="panel-title"><Sparkles size={16}/> {t("howTo")}</h2>
          <ol className="steps">
            {steps.map((step, index) => <li key={step}><b>{index + 1}</b><span>{step}</span></li>)}
          </ol>
        </Frame>
        <div className="fortune-count">
          <span>{t("countTitle")}</span>
          <strong>{onchainDrawCount === null ? "—" : number(onchainDrawCount)} <i>✿</i></strong>
          <small>{countLabel}</small>
          {guestDrawCount !== null && guestDrawCount > 0 && <em>{totalDrawCount !== null ? t("guestTotal", { total: number(totalDrawCount), guest: number(guestDrawCount) }) : t("guestOnly", { guest: number(guestDrawCount) })}</em>}
        </div>
      </aside>

      <section className="maiden-stage">
        <motion.div className="maiden-character home-character" animate={{ y: [0, -8, 0], scale: [1, 1.008, 1] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
          <img src="/assets/maiden-idle.webp" alt={t("alt.maiden")} className="maiden maiden-idle" />
          <span className="shrine-rune home-rune" aria-label={t("alt.rune")} />
        </motion.div>
        <motion.img src="/assets/fortune-box.webp" alt={t("alt.box")} className="home-fortune-box" animate={{ y: [0, -3, 0] }} transition={{ duration: 2.2, repeat: Infinity }} />
        <button className="primary-button hero-cta" onClick={() => navigate("draw")}><span>✦</span> {t("cta")} <span>✦</span></button>
        <p className="once-note">{t("limitNote")}</p>
      </section>

      <aside className="home-right">
        <Frame>
          <h2 className="panel-title">{t("network.title")}</h2>
          <ul className="network-list">
            <li><Gauge size={16}/> {t("network.fast")}</li>
            <li><Coins size={16}/> {t("network.gas")}</li>
            <li><BadgeCheck size={16}/> {t("network.evm")}</li>
            <li><Sparkles size={16}/> {t("network.verifiable")}</li>
          </ul>
          <EcosystemFooter variant="panel" />
        </Frame>
        <div className="daily-blessing"><span>{t("blessing.title")}</span><p>{t("blessing.line1")} <br/>{t("blessing.line2")}</p></div>
      </aside>
    </div>
  );
}

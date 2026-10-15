"use client";

import { ExternalLink, Heart, Search, SlidersHorizontal, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccount } from "wagmi";
import { useOmikuji } from "@/src/components/OmikujiApp";
import { useFortuneText } from "@/src/i18n/useFortuneText";
import { defaultProfile } from "@/src/lib/storage";
import { getFortune } from "@/src/lib/fortunes";
import { explorerTx } from "@/src/config/chain";
import { collectionItems, hasChainProof } from "@/src/lib/history";
import { chainEnabled, shortAddress } from "@/src/lib/runtime";
import { LAST_RESULT_KEY } from "@/src/lib/storage";
import type { Rarity } from "@/src/types";

export function CollectionView() {
  const { history, toggleFavorite, profile, navigate, cloudSyncing, lastCloudSync, syncCloudHistory, chainHistoryStatus, refreshChainHistory } = useOmikuji();
  const { address } = useAccount();
  const { t, i18n } = useTranslation("collection");
  const fortuneText = useFortuneText();
  const [filter, setFilter] = useState<"ALL" | Rarity | "FAVORITES">("ALL");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  // Only on-chain draws belong in the collection; guest trials never do. With a wallet
  // connected, show that wallet's draws only, so another wallet's records never mix in.
  const owned = useMemo(() => collectionItems(history, address), [history, address]);
  const filtered = useMemo(() => owned.filter((item) => {
    const fortune = getFortune(item.fortuneId);
    const matchesFilter = filter === "ALL" || (filter === "FAVORITES" ? item.favorite : fortune.rarity === filter);
    const text = fortuneText(fortune.id);
    return matchesFilter && `${fortune.kanji} ${text.name} ${text.romaji} ${item.txHash}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => sort === "newest" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)), [owned, filter, query, sort, fortuneText]);

  return (
    <div className="collection-shell">
      <header className="inventory-header"><div><span>{t("eyebrow")}</span><h1>{t("title")}</h1></div><label><SlidersHorizontal size={15}/><select aria-label={t("sort.label")} value={sort} onChange={(event) => setSort(event.target.value as "newest" | "oldest")}><option value="newest">{t("sort.newest")}</option><option value="oldest">{t("sort.oldest")}</option></select></label></header>
      <div className="inventory-body">
        <aside className="profile-sidebar">
          <div className="avatar-medallion"><img src="/assets/maiden-happy.webp" alt={t("aria.avatar")}/></div><h2>{profile.username === defaultProfile.username ? t("common:defaultName") : profile.username}</h2><p><Wallet size={14}/>{address ?? owned[0]?.walletAddress ? shortAddress(address ?? owned[0]?.walletAddress) : t("common:wallet.notConnectedShort")}</p>
          <div className="collection-stats"><div><strong>{owned.length}</strong><span>{t("stats.total")}</span></div><div><strong>{owned.filter((item) => getFortune(item.fortuneId).rarity === "SSR").length}</strong><span>SSR</span></div><div><strong>{owned.filter((item) => item.favorite).length}</strong><span>{t("stats.favorites")}</span></div></div>
          {chainEnabled && address && <button className="collection-sync-button" disabled={chainHistoryStatus === "loading"} onClick={refreshChainHistory}>{t(chainHistoryStatus === "loading" ? "chainSync.loading" : chainHistoryStatus === "error" ? "chainSync.error" : "chainSync.ready")}</button>}
          {profile.signedIn && <button className="collection-sync-button" disabled={cloudSyncing} onClick={() => void syncCloudHistory()}>{t(cloudSyncing ? "cloudSync.loading" : lastCloudSync ? "cloudSync.done" : "cloudSync.idle")}</button>}
          <nav className="filter-list" aria-label={t("filter.label")}>{(["ALL", "SSR", "SR", "R", "FAVORITES"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "ALL" ? t("filter.all") : item === "FAVORITES" ? t("filter.favorites") : `✧ ${item}`}</button>)}</nav>
        </aside>
        <section className="collection-content">
          <label className="search-box"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} aria-label={t("search")}/></label>
          {filtered.length ? <div className="card-grid">{filtered.map((item) => {
            const fortune = getFortune(item.fortuneId);
            return <article className={`mini-card theme-${fortune.theme}`} key={item.id} onClick={() => { localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(item)); window.location.href = "/result"; }}>
              <span className="mini-rarity">{fortune.rarity}</span><h2 title={fortuneText(fortune.id).romaji}>{fortune.kanji}</h2><h3>{fortuneText(fortune.id).name}</h3><p>{new Date(item.createdAt).toLocaleDateString(i18n.language)}</p>
              <button aria-label={t("aria.favorite")} aria-pressed={item.favorite} onClick={(event) => { event.stopPropagation(); toggleFavorite(item.id); }}><Heart size={16} fill={item.favorite ? "currentColor" : "none"}/></button>
              {hasChainProof(item) && <a href={explorerTx(item.txHash)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} aria-label={t("aria.openTx")}><ExternalLink size={14}/></a>}
            </article>;
          })}</div> : <div className="collection-empty"><span>?</span><h2>{t("empty.title")}</h2><p>{t("empty.body")}</p><button className="primary-button" onClick={() => navigate("draw")}>{t("empty.cta")}</button></div>}
        </section>
      </div>
    </div>
  );
}

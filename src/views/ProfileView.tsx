"use client";

import { BookOpen, LogOut, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccount, useSignMessage } from "wagmi";
import { BOTCHAIN_CHAIN_ID } from "@/supabase/functions/_shared/botchain.ts";
import { EcosystemFooter } from "@/src/components/EcosystemFooter";
import { Frame, useOmikuji } from "@/src/components/OmikujiApp";
import { getFortune } from "@/src/lib/fortunes";
import { collectionItems, hasChainProof } from "@/src/lib/history";
import { cloudEnabled, shortAddress } from "@/src/lib/runtime";
import { defaultProfile } from "@/src/lib/storage";
import { recordPublicVerifiedDraw, updateCloudProfile } from "@/src/lib/supabase";
import { signInWithWallet, signOutWallet, WalletAuthError } from "@/src/lib/walletAuth";

/** Message key for a failed wallet sign-in (profile namespace). */
function walletAuthMessage(cause: unknown) {
  const code = (cause as { code?: number | string; cause?: { code?: number } })?.code ?? (cause as { cause?: { code?: number } })?.cause?.code;
  const text = cause instanceof Error ? cause.message.toLowerCase() : "";
  if (code === 4001 || text.includes("user rejected") || text.includes("user denied")) return "authError.rejected";
  if (cause instanceof WalletAuthError) {
    if (cause.code === "invalid_nonce" || cause.code === "expired") return "authError.expired";
    if (cause.code === "wrong_domain") return "authError.wrongDomain";
    if (cause.code === "wallet_mismatch" || cause.code === "bad_signature") return "authError.mismatch";
    if (cause.code === "wallet_taken") return "authError.walletTaken";
    if (cause.code === "not_configured") return "authError.notConfigured";
  }
  if (text.includes("fetch") || text.includes("network")) return "authError.network";
  return "authError.generic";
}

export function ProfileView() {
  const { profile, setProfile, history, navigate, cloudSyncing, lastCloudSync, syncCloudHistory, resetToGuestSession } = useOmikuji();
  const { address, isConnected, chain } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [username, setUsername] = useState(profile.username);
  // Kept as a message key + values so an open notice follows language switches.
  const [notice, setNotice] = useState<{ key: string; count?: number } | null>(null);
  const { t, i18n } = useTranslation("profile");
  const [busy, setBusy] = useState(false);
  const wallet = address?.toLowerCase();
  const signedInHere = profile.signedIn && Boolean(wallet) && profile.wallet === wallet;
  const owned = useMemo(() => (wallet ? collectionItems(history, wallet) : []), [history, wallet]);

  useEffect(() => { setUsername(profile.username); }, [profile.username]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function signIn() {
    if (!address) return;
    setBusy(true);
    try {
      // Make sure draws known on this device are indexed before the account reads them.
      const known = owned.filter(hasChainProof).slice(0, 20).map((item) => item.txHash);
      await Promise.allSettled(known.map((hash) => recordPublicVerifiedDraw(hash)));
      await signInWithWallet(address, (message) => signMessageAsync({ message }));
      const synced = await syncCloudHistory();
      setNotice({ key: "notice.signedIn", count: synced });
    } catch (cause) {
      setNotice({ key: walletAuthMessage(cause) });
    }
    setBusy(false);
  }

  async function signOut() {
    setBusy(true);
    try {
      await signOutWallet();
      setNotice({ key: "notice.signedOut" });
    } catch {
      setNotice({ key: "notice.signOutFailed" });
    }
    resetToGuestSession();
    setBusy(false);
  }

  async function saveUsername() {
    const value = username.trim();
    if (value.length < 2 || value.length > 32) { setNotice({ key: "notice.nicknameLength" }); return; }
    setBusy(true);
    try {
      await updateCloudProfile(value, profile.avatar);
      setProfile({ ...profile, username: value });
      setNotice({ key: "notice.nicknameSaved" });
    } catch {
      setNotice({ key: "notice.nicknameFailed" });
    }
    setBusy(false);
  }

  const onBotChain = chain?.id === BOTCHAIN_CHAIN_ID;
  const ssr = owned.filter((item) => getFortune(item.fortuneId).rarity === "SSR").length;
  const favorites = owned.filter((item) => item.favorite).length;
  const displayName = profile.username === defaultProfile.username ? t("common:defaultName") : profile.username;

  return (
    <div className="profile-layout">
      <section className="profile-hero"><div className="profile-avatar"><img src="/assets/maiden-happy.webp" alt={t("hero.avatarAlt")}/><span>✿</span></div><div><span className="eyebrow">{t("hero.eyebrow")}</span><h1>{signedInHere ? displayName : isConnected ? shortAddress(address) : t("hero.welcome")}</h1><p>{isConnected ? t("hero.connected") : t("hero.disconnected")}</p></div></section>
      <div className="profile-grid">
        <Frame><div className="account-panel">
          <h2><WalletCards/> {t("account.title")}</h2>
          <div className="wallet-record"><span className={isConnected ? "online" : ""}/><div><strong>{isConnected ? shortAddress(address) : t("account.noWallet")}</strong><small>{!isConnected ? t("account.useConnect") : onBotChain ? t("account.onBotChain") : t("account.wrongNetwork")}</small></div></div>
          {isConnected && cloudEnabled && (signedInHere ? <>
            <p className="login-help"><ShieldCheck size={14}/> {t("account.signedIn")}</p>
            <label>{t("account.nickname")}<input value={username === defaultProfile.username ? displayName : username} maxLength={32} onChange={(event) => setUsername(event.target.value)} placeholder={t("account.nicknamePlaceholder")} /></label>
            <button className="primary-button compact" onClick={saveUsername} disabled={busy}>{t("account.saveNickname")}</button>
            <button className="sign-out-button" onClick={signOut} disabled={busy}><LogOut size={16}/> {t("account.signOut")}</button>
          </> : <>
            <p className="login-help">{t("account.signInHelp")}</p>
            <button className="purple-button full" onClick={signIn} disabled={busy}><ShieldCheck/> {busy ? t("account.signing") : t("account.signIn")}</button>
          </>)}
          {!isConnected && <p className="security-note"><ShieldCheck/> {t("account.noEmail")}</p>}
        </div></Frame>
        <Frame><div className="account-panel">
          <h2><BookOpen/> {t("mine.title")}</h2>
          {isConnected ? <>
            <div className="collection-stats"><div><strong>{owned.length}</strong><span>{t("mine.onChain")}</span></div><div><strong>{ssr}</strong><span>SSR</span></div><div><strong>{favorites}</strong><span>{t("mine.favorites")}</span></div></div>
            <button className="purple-button full" onClick={() => navigate("collection")}><Sparkles/> {t("mine.open")}</button>
          </> : <p className="login-help">{t("mine.empty")}</p>}
        </div></Frame>
      </div>
      {signedInHere && <div className="claim-summary"><Sparkles/><div><strong>{t("sync.summary", { count: owned.filter((item) => item.claimed).length })}</strong><span>{lastCloudSync ? t("sync.last", { time: new Date(lastCloudSync).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }) }) : t("sync.never")}</span></div><button className="sync-cloud-button" disabled={cloudSyncing} onClick={async () => { try { const count = await syncCloudHistory(); setNotice({ key: "sync.done", count }); } catch { setNotice({ key: "sync.failed" }); } }}>{cloudSyncing ? t("sync.syncing") : t("sync.now")}</button></div>}
      <div className="profile-footer-blessing" aria-hidden="true">
        <img src="/assets/maiden-praying.webp" alt="" />
        <div><span>{t("blessing.title")}</span><p>{t("blessing.text")}</p></div>
      </div>
      <div className="profile-ecosystem"><EcosystemFooter variant="panel" /></div>
      <p className="profile-made-by">made by Caro</p>
      {notice && <div className="toast-message" role="status">{t(notice.key, notice.count === undefined ? {} : { count: notice.count })}</div>}
    </div>
  );
}

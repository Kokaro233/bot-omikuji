"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, ChevronDown, ChevronUp, CircleUserRound, House, Menu, Sparkles, WalletCards, X } from "lucide-react";
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAccount } from "wagmi";
import { BOTCHAIN_CHAIN_ID } from "@/supabase/functions/_shared/botchain.ts";
import { EcosystemFooter } from "@/src/components/EcosystemFooter";
import { Providers, walletConnectEnabled } from "@/src/components/Providers";
import { needsWalletApp, WalletSheet } from "@/src/components/WalletSheet";
import { mergeChainHistory, mergeCloudHistory, type ChainRecord } from "@/src/lib/history";
import { cloudEnabled, runtime, runtimeMode, shortAddress } from "@/src/lib/runtime";
import { defaultProfile, storage } from "@/src/lib/storage";
import { getCurrentSession, getSupabase, loadCloudAccount, updateCloudFavorite } from "@/src/lib/supabase";
import { sessionWallet, signOutWallet } from "@/src/lib/walletAuth";
import { useChainHistory, type ChainHistoryStatus } from "@/src/lib/useChainHistory";
import type { AppRoute, DemoProfile, DrawResult } from "@/src/types";
import { setLanguage } from "@/src/i18n";
import { HomeView } from "@/src/views/HomeView";
// Route-level code splitting: the home scene loads first, other rooms on demand.
const DrawView = lazy(() => import("@/src/views/DrawView").then((m) => ({ default: m.DrawView })));
const ResultView = lazy(() => import("@/src/views/ResultView").then((m) => ({ default: m.ResultView })));
const CollectionView = lazy(() => import("@/src/views/CollectionView").then((m) => ({ default: m.CollectionView })));
const ProfileView = lazy(() => import("@/src/views/ProfileView").then((m) => ({ default: m.ProfileView })));

interface AppState {
  route: AppRoute;
  navigate: (route: AppRoute) => void;
  history: DrawResult[];
  lastResult: DrawResult | null;
  addResult: (result: DrawResult) => void;
  toggleFavorite: (id: string) => void;
  profile: DemoProfile;
  setProfile: (profile: DemoProfile) => void;
  cloudSyncing: boolean;
  lastCloudSync: string | null;
  syncCloudHistory: () => Promise<number>;
  resetToGuestSession: () => void;
  chainHistoryStatus: ChainHistoryStatus;
  refreshChainHistory: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function useOmikuji() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useOmikuji must be used within OmikujiApp");
  return context;
}

function routeFromPath(path: string): AppRoute {
  const segment = path.split("/").filter(Boolean)[0];
  return (["draw", "result", "collection", "profile"] as AppRoute[]).includes(segment as AppRoute)
    ? (segment as AppRoute)
    : "home";
}

function Petals() {
  return <div className="petals" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties}>✦</i>)}</div>;
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="pixel-frame"><div className="pixel-frame__inner">{children}</div></div>;
}

const routes: { key: AppRoute; icon: typeof House }[] = [
  { key: "home", icon: House },
  { key: "draw", icon: Sparkles },
  { key: "collection", icon: BookOpen },
  { key: "profile", icon: CircleUserRound },
];

function LanguageToggle() {
  const { t, i18n } = useTranslation();
  return <button className="lang-toggle" lang={i18n.language === "en" ? "zh-CN" : "en"} aria-label={t("language.label")} onClick={() => setLanguage(i18n.language === "en" ? "zh-CN" : "en")}>{t("language.switchTo")}</button>;
}

/** Keeps the collection in step with the connected wallet's records in FortuneContract. */
function ChainHistorySync({ onRecords, onStatus, refreshRef }: { onRecords: (records: ChainRecord[]) => void; onStatus: (status: ChainHistoryStatus) => void; refreshRef: React.MutableRefObject<() => void> }) {
  const { address } = useAccount();
  const { records, status, loadedFor, refresh } = useChainHistory(address);
  useEffect(() => { refreshRef.current = refresh; }, [refresh, refreshRef]);
  useEffect(() => { onStatus(status); }, [status, onStatus]);
  useEffect(() => { if (status === "ready" && loadedFor) onRecords(records); }, [records, status, loadedFor, onRecords]);
  return null;
}

function Shell() {
  const { route, navigate, lastResult, profile, resetToGuestSession } = useOmikuji();
  const { address, isConnected, chain, status } = useAccount();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavCollapsed, setMobileNavCollapsed] = useState(false);
  const [walletSheet, setWalletSheet] = useState<null | { openConnectModal: () => void }>(null);
  const { t } = useTranslation();

  // One wallet = one account. When the wallet disconnects or switches to another
  // address, end the private session so the previous wallet's data is never shown.
  const endingSession = useRef(false);
  useEffect(() => {
    if (!profile.signedIn || !profile.wallet || status === "connecting" || status === "reconnecting") return;
    if (status === "connected" && address?.toLowerCase() === profile.wallet) return;
    if (endingSession.current) return;
    endingSession.current = true;
    void signOutWallet().catch(() => undefined).finally(() => { endingSession.current = false; resetToGuestSession(); });
  }, [address, status, profile.signedIn, profile.wallet, resetToGuestSession]);

  return (
    <main className={`game-shell route-${route}`}>
      <Petals />
      <div className="vignette" aria-hidden="true" />
      <header className="topbar">
        <button className="brand" onClick={() => navigate("home")} aria-label={t("brandHome")}>
          <span className="brand__mark" aria-hidden="true"/><span>BOT OMIKUJI</span>
        </button>
        <nav className={`desktop-nav ${menuOpen ? "is-open" : ""}`} aria-label={t("nav.primary")}>
          {routes.map(({ key }) => <button key={key} className={route === key ? "active" : ""} onClick={() => { navigate(key); setMenuOpen(false); }}>{t(`nav.${key}`)}</button>)}
          {lastResult && <button className={route === "result" ? "active" : ""} onClick={() => navigate("result")}>{t("nav.latest")}</button>}
        </nav>
        <div className="wallet-area">
          {runtimeMode === "demo" && <span className="demo-badge">DEMO MODE</span>}
          {runtimeMode === "unconfigured" && <span className="demo-badge" title={t("wallet.contractMissingTitle")}>{t("wallet.contractMissing")}</span>}
          <LanguageToggle />
          <ConnectButton.Custom>
            {({ account, chain: walletChain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
              if (!mounted || !account || !walletChain) return <button className="wallet-button" onClick={() => (needsWalletApp() ? setWalletSheet({ openConnectModal }) : openConnectModal())}><WalletCards size={16} /> {t("wallet.connect")}</button>;
              if (walletChain.unsupported) return <button className="wallet-button warning" onClick={openChainModal}>{t("wallet.switchNetwork")}</button>;
              return <button className="wallet-button" onClick={openAccountModal}><span className="status-dot" />{account.displayName}</button>;
            }}
          </ConnectButton.Custom>
          <button className="menu-button" aria-label={t("nav.toggleMenu")} onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X /> : <Menu />}</button>
        </div>
      </header>

      <section className="scene" data-route={route}>
        <AnimatePresence mode="wait">
          <motion.div key={route} className="view-stage" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .28 }}>
            <Suspense fallback={<div className="route-loading" aria-busy="true" aria-label={t("loading")} />}>
              {route === "home" ? <HomeView /> : route === "draw" ? <DrawView /> : route === "result" ? <ResultView /> : route === "collection" ? <CollectionView /> : <ProfileView />}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </section>

      <div className="connection-pill">
        <span className={isConnected ? "online" : ""} />
        {!isConnected ? t("wallet.notConnected") : chain?.id === BOTCHAIN_CHAIN_ID ? `${shortAddress(address)} · BOT Chain` : `${shortAddress(address)} · ${t("wallet.wrongNetwork")}`}
      </div>
      <EcosystemFooter variant="floating" />
      {walletSheet && <WalletSheet onClose={() => setWalletSheet(null)} onOtherWallets={walletConnectEnabled ? () => { const open = walletSheet.openConnectModal; setWalletSheet(null); open(); } : undefined} />}

      <nav className={`mobile-nav ${mobileNavCollapsed ? "is-collapsed" : ""}`} aria-label={t("nav.mobile")}>
        <button className="mobile-nav-toggle" aria-label={mobileNavCollapsed ? t("nav.expandMobile") : t("nav.collapseMobile")} aria-expanded={!mobileNavCollapsed} onClick={() => setMobileNavCollapsed((value) => !value)}>{mobileNavCollapsed ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button>
        {routes.map(({ key, icon: Icon }) => <button key={key} className={route === key ? "active" : ""} onClick={() => navigate(key)}><Icon size={20}/><span>{t(`nav.${key}`)}</span></button>)}
      </nav>
    </main>
  );
}

export function OmikujiApp() {
  const [route, setRoute] = useState<AppRoute>("home");
  const [history, setHistory] = useState<DrawResult[]>([]);
  const [lastResult, setLastResult] = useState<DrawResult | null>(null);
  const [profile, setProfileState] = useState<DemoProfile>(defaultProfile);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [lastCloudSync, setLastCloudSync] = useState<string | null>(null);
  const [chainHistoryStatus, setChainHistoryStatus] = useState<ChainHistoryStatus>("idle");
  const chainRefreshRef = useRef<() => void>(() => undefined);
  const refreshChainHistory = useCallback(() => chainRefreshRef.current(), []);

  const applyChainRecords = useCallback((records: ChainRecord[]) => {
    const contract = runtime.contractAddress;
    if (!contract || !records.length) return;
    setHistory((current) => {
      const next = mergeChainHistory(current, records, contract);
      storage.saveHistory(next);
      return next;
    });
  }, []);

  const syncSeq = useRef(0);
  const syncCloudHistory = useCallback(async () => {
    if (!cloudEnabled) return 0;
    const seq = ++syncSeq.current;
    setCloudSyncing(true);
    try {
      const account = await loadCloudAccount();
      // Auth events can trigger overlapping syncs (e.g. before and after activation); only the latest wins.
      if (seq !== syncSeq.current) return account?.fortunes.length ?? 0;
      if (!account) {
        // No session, or a session that was never activated: show nothing private.
        setProfileState(defaultProfile);
        storage.saveProfile(defaultProfile);
        return 0;
      }
      const session = await getCurrentSession();
      const nextProfile: DemoProfile = {
        id: account.user.id,
        username: account.profile?.username ?? defaultProfile.username,
        email: account.user.email ?? "",
        avatar: account.profile?.avatar ?? "🌸",
        signedIn: true,
        wallet: sessionWallet(session) ?? undefined,
      };
      setProfileState(nextProfile);
      storage.saveProfile(nextProfile);
      setHistory((current) => {
        const merged = mergeCloudHistory(current, account.fortunes);
        storage.saveHistory(merged);
        return merged;
      });
      setLastCloudSync(new Date().toISOString());
      return account.fortunes.length;
    } finally {
      setCloudSyncing(false);
    }
  }, []);

  const resetToGuestSession = useCallback(() => {
    const guestHistory = storage.resetToDeviceGuestHistory();
    setHistory(guestHistory);
    setProfileState(defaultProfile);
    storage.saveProfile(defaultProfile);
    setLastCloudSync(null);
    // The connected wallet's public records come straight back from the contract.
    chainRefreshRef.current();
  }, []);

  useEffect(() => {
    setRoute(routeFromPath(window.location.pathname));
    setHistory(storage.getHistory());
    setLastResult(storage.getLastResult());
    setProfileState(storage.getProfile());
    const handlePop = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  useEffect(() => {
    if (!cloudEnabled) return;
    let unsubscribe = () => {};
    let cancelled = false;
    // Load the account layer after first paint; the shrine never waits for it.
    void getSupabase().then((supabase) => {
      if (!supabase || cancelled) return;
      void syncCloudHistory().catch(() => undefined);
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session) window.setTimeout(() => void syncCloudHistory().catch(() => undefined), 0);
        else if (event === "SIGNED_OUT") resetToGuestSession();
      });
      unsubscribe = () => subscription.unsubscribe();
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [syncCloudHistory, resetToGuestSession]);

  const navigate = useCallback((next: AppRoute) => {
    const path = next === "home" ? "/" : `/${next}`;
    window.history.pushState({}, "", path);
    setRoute(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const addResult = useCallback((result: DrawResult) => {
    setLastResult(result);
    storage.saveLastResult(result);
    setHistory((current) => {
      const next = [result, ...current.filter((item) => item.id !== result.id)];
      storage.saveHistory(next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setHistory((current) => {
      const target = current.find((item) => item.id === id);
      const favorite = !(target?.favorite ?? false);
      const next = current.map((item) => item.id === id ? { ...item, favorite } : item);
      storage.saveHistory(next);
      if (target?.mode === "live" && target.claimed && profile.signedIn) void updateCloudFavorite(id, favorite).catch(() => undefined);
      if (lastResult?.id === id) {
        const updated = { ...lastResult, favorite };
        setLastResult(updated);
        storage.saveLastResult(updated);
      }
      return next;
    });
  }, [lastResult, profile.signedIn]);

  const setProfile = useCallback((next: DemoProfile) => { setProfileState(next); storage.saveProfile(next); }, []);
  const value = useMemo(() => ({ route, navigate, history, lastResult, addResult, toggleFavorite, profile, setProfile, cloudSyncing, lastCloudSync, syncCloudHistory, resetToGuestSession, chainHistoryStatus, refreshChainHistory }), [route, navigate, history, lastResult, addResult, toggleFavorite, profile, setProfile, cloudSyncing, lastCloudSync, syncCloudHistory, resetToGuestSession, chainHistoryStatus, refreshChainHistory]);

  return <Providers><AppContext.Provider value={value}><ChainHistorySync onRecords={applyChainRecords} onStatus={setChainHistoryStatus} refreshRef={chainRefreshRef} /><Shell /></AppContext.Provider></Providers>;
}

export { Frame };

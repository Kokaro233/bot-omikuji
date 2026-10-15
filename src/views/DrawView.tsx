"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { decodeErrorResult, formatEther, type Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { BOTCHAIN_CHAIN_ID, fortuneContractAbi } from "@/supabase/functions/_shared/botchain.ts";
import { extractFortuneDraws } from "@/supabase/functions/_shared/verifyDraw.ts";
import { useOmikuji } from "@/src/components/OmikujiApp";
import { walletConnectEnabled } from "@/src/components/Providers";
import { needsWalletApp, WalletSheet } from "@/src/components/WalletSheet";
import { botChain, explorerTx } from "@/src/config/chain";
import { drawWeightedFortune } from "@/src/lib/fortunes";
import { chainEnabled, runtime, runtimeMode } from "@/src/lib/runtime";
import { canDrawDemoToday, GUEST_TRIAL_LIMIT, newGuestResultId, storage } from "@/src/lib/storage";
import { recordPublicGuestDraw, recordPublicVerifiedDraw } from "@/src/lib/supabase";
import type { DrawPhase, DrawResult } from "@/src/types";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type DrawMode = "chain" | "guest";

function walletErrorCode(cause: unknown): number | undefined {
  if (!cause || typeof cause !== "object") return undefined;
  const value = cause as { code?: number; cause?: { code?: number } };
  return value.code ?? value.cause?.code;
}

function findHexErrorData(cause: unknown, seen = new Set<unknown>()): Hex | undefined {
  if (typeof cause === "string") {
    const [match] = cause.match(/0x[a-fA-F0-9]{8,}/) ?? [];
    return match as Hex | undefined;
  }
  if (!cause || typeof cause !== "object" || seen.has(cause)) return undefined;
  seen.add(cause);
  const record = cause as Record<string, unknown>;
  for (const key of ["data", "error", "cause", "details", "body"]) {
    const found = findHexErrorData(record[key], seen);
    if (found) return found;
  }
  return undefined;
}

/** An error to show, kept as a message key so it follows language switches. */
type DrawError = { key: string; values?: Record<string, string | number>; resetAt?: number } | null;

function formatLocalResetTimestamp(seconds: number, t: TFunction<"draw">, language: string) {
  return `${new Date(seconds * 1000).toLocaleString(language, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: language.startsWith("zh") ? "2-digit" : "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}${t("timeZoneSuffix")}`;
}

function decodeContractError(cause: unknown): DrawError {
  const data = findHexErrorData(cause);
  if (!data) return null;
  try {
    const decoded = decodeErrorResult({ abi: fortuneContractAbi, data });
    if (decoded.errorName === "DailyLimitReached") {
      const [nextDrawTimestamp] = decoded.args;
      return { key: "error.dailyLimitContract", resetAt: Number(nextDrawTimestamp) };
    }
    return { key: "error.contractError", values: { name: decoded.errorName } };
  } catch {
    return null;
  }
}

function friendlyWalletError(cause: unknown): DrawError {
  const decoded = decodeContractError(cause);
  if (decoded) return decoded;
  const code = walletErrorCode(cause);
  const message = cause instanceof Error ? cause.message.toLowerCase() : "";
  if (code === 4001 || message.includes("user rejected") || message.includes("user denied")) return { key: "error.rejected" };
  if (cause instanceof Error && cause.message.startsWith("INSUFFICIENT_BOT:")) return { key: "error.insufficientEstimate", values: { amount: cause.message.slice(17) } };
  if (message.includes("insufficient funds")) return { key: "error.insufficient" };
  if (message.includes("already drawn") || message.includes("daily")) return { key: "error.dailyLimit" };
  if (message.includes("chain") || message.includes("network") || code === 4902) return { key: "error.network", values: { chainId: BOTCHAIN_CHAIN_ID } };
  if (message.includes("fetch") || message.includes("timeout") || message.includes("http request failed")) return { key: "error.rpc" };
  return { key: "error.generic" };
}

export function DrawView() {
  const { navigate, addResult, profile, refreshChainHistory, syncCloudHistory } = useOmikuji();
  const { t, i18n } = useTranslation("draw");
  const [gasEstimate, setGasEstimate] = useState("");
  const { address, isConnected, connector } = useAccount();
  const publicClient = usePublicClient({ chainId: botChain.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [phase, setPhase] = useState<DrawPhase>("ready");
  const [error, setError] = useState<DrawError>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [pendingTx, setPendingTx] = useState<`0x${string}` | undefined>();
  const [guestTrials, setGuestTrials] = useState(0);
  const [drawMode, setDrawMode] = useState<DrawMode>("chain");
  const { data: receipt, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash, chainId: botChain.id, confirmations: 1, timeout: 120_000 });
  const processing = !["ready", "revealed", "error"].includes(phase);
  const hasConnectedWallet = Boolean(isConnected && address);
  const { data: remainingDraws, refetch: refetchRemaining } = useReadContract({
    address: runtime.contractAddress ?? undefined,
    abi: fortuneContractAbi,
    functionName: "remainingDraws",
    args: address ? [address] : undefined,
    chainId: botChain.id,
    query: { enabled: chainEnabled && Boolean(address) },
  });
  // Off-chain trials: always when the BOT Chain contract is not configured, otherwise when chosen or no wallet is connected.
  const useGuestMode = runtimeMode !== "demo" && (!chainEnabled || !hasConnectedWallet || drawMode === "guest");
  const guestLimitReached = useGuestMode && guestTrials >= GUEST_TRIAL_LIMIT;
  const demoWalletAddress = hasConnectedWallet ? address! : "0xDemoShrineKeeper000000000000000000000001";
  const completedRef = useRef(false);
  const [walletSheet, setWalletSheet] = useState<null | (() => void)>(null);

  useEffect(() => { setGuestTrials(storage.getGuestTrialCount()); }, []);

  async function ensureBotChainNetwork() {
    if (!connector) throw new Error("wallet connector not ready");
    // Ask the wallet itself: useChainId() reports the configured chain even when the wallet is elsewhere.
    if (await connector.getChainId() === botChain.id) return;
    // wagmi asks the wallet to switch and, if the wallet does not know chain 677 yet (4902), to add it.
    await switchChainAsync({ chainId: botChain.id });
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (await connector.getChainId() === botChain.id) return;
      await delay(250);
    }
    throw new Error("wallet network switch did not finish");
  }

  async function preflightDraw() {
    if (!publicClient || !address || !runtime.contractAddress) throw new Error("wallet connector not ready");
    if (await publicClient.getChainId() !== BOTCHAIN_CHAIN_ID) throw new Error("RPC is not BOT Chain Mainnet");
    const request = { address: runtime.contractAddress, abi: fortuneContractAbi, functionName: "drawFortune", account: address } as const;
    await publicClient.simulateContract(request);
    const [gas, gasPrice, balance] = await Promise.all([
      publicClient.estimateContractGas(request),
      publicClient.getGasPrice(),
      publicClient.getBalance({ address }),
    ]);
    const gasLimit = (gas * 12n) / 10n;
    const maxCost = Number(formatEther(gasLimit * gasPrice)).toFixed(4);
    if (balance < gasLimit * gasPrice) throw new Error(`INSUFFICIENT_BOT:${maxCost}`);
    setGasEstimate(maxCost);
    return gasLimit;
  }

  const character = phase === "ready" || phase === "error" ? "/assets/maiden-idle.webp" : phase === "revealed" ? "/assets/maiden-happy.webp" : "/assets/maiden-praying.webp";

  async function completeResult(result: DrawResult) {
    if (completedRef.current) return;
    completedRef.current = true;
    setPhase("paper");
    await delay(1300);
    addResult(result);
    if (result.mode === "demo" && runtimeMode !== "demo") void recordPublicGuestDraw(result).catch(() => undefined);
    setPhase("revealed");
    await delay(650);
    navigate("result");
  }

  // The fortune shown to the user comes only from a successful receipt's FortuneDrawn event.
  useEffect(() => {
    if (!receipt || completedRef.current || !runtime.contractAddress || !address) return;
    setTxHash(undefined);
    if (receipt.status !== "success") {
      setError({ key: "error.reverted" });
      setPhase("error");
      return;
    }
    const [draw] = extractFortuneDraws(receipt, runtime.contractAddress, BOTCHAIN_CHAIN_ID).filter((item) => item.wallet.toLowerCase() === address.toLowerCase());
    if (!draw) {
      setError({ key: "error.noEvent" });
      setPhase("error");
      return;
    }
    setPendingTx(undefined);
    // Index the draw; for a signed-in wallet the database then adds it to the account's collection.
    void recordPublicVerifiedDraw(draw.txHash).then((ok) => { if (ok && profile.signedIn) return syncCloudHistory(); }).catch(() => undefined);
    void refetchRemaining();
    refreshChainHistory();
    void completeResult({
      id: `chain:${draw.contractAddress.toLowerCase()}:${draw.wallet.toLowerCase()}:${draw.recordIndex}`,
      fortuneId: draw.fortuneId,
      walletAddress: draw.wallet.toLowerCase(),
      txHash: draw.txHash,
      blockNumber: draw.blockNumber.toString(),
      createdAt: new Date(draw.timestamp * 1000).toISOString(),
      chainId: BOTCHAIN_CHAIN_ID,
      recordIndex: draw.recordIndex,
      contractAddress: draw.contractAddress.toLowerCase(),
      claimed: false,
      favorite: false,
      mode: "live",
    });
  }, [receipt]);

  useEffect(() => {
    if (!receiptError || completedRef.current) return;
    setTxHash(undefined);
    setError({ key: "error.unconfirmed" });
    setPhase("error");
  }, [receiptError]);

  async function beginRitual() {
    setError(null);
    setPendingTx(undefined);
    setGasEstimate("");
    completedRef.current = false;
    const guestTrial = useGuestMode;
    if (guestTrial && guestTrials >= GUEST_TRIAL_LIMIT) {
      setError({ key: chainEnabled ? (hasConnectedWallet ? "error.guestLimitWithWallet" : "error.guestLimitNoWallet") : "error.guestLimit" });
      setPhase("error");
      return;
    }
    if (runtimeMode === "demo" && !canDrawDemoToday(demoWalletAddress)) {
      setError({ key: "error.demoLimit" });
      setPhase("error");
      return;
    }
    try {
      setPhase("praying"); await delay(1050);
      setPhase("shaking"); await delay(1800);
      setPhase("stick"); await delay(1100);
      if (runtimeMode === "demo" || guestTrial) {
        const fortune = drawWeightedFortune();
        if (guestTrial) setGuestTrials(storage.useGuestTrial());
        await completeResult({
          id: newGuestResultId(),
          fortuneId: fortune.id,
          walletAddress: guestTrial ? "访客体验" : demoWalletAddress, // internal marker for guest trials, never displayed
          txHash: "",
          createdAt: new Date().toISOString(),
          chainId: 0,
          claimed: true,
          favorite: false,
          mode: "demo",
        });
        return;
      }
      await ensureBotChainNetwork();
      const gas = await preflightDraw();
      setPhase("wallet");
      const hash = await writeContractAsync({ address: runtime.contractAddress!, abi: fortuneContractAbi, functionName: "drawFortune", chainId: botChain.id, gas });
      setPendingTx(hash);
      setTxHash(hash);
      setPhase("confirming");
    } catch (cause) {
      setError(friendlyWalletError(cause));
      setPhase("error");
    }
  }

  const progress = useMemo(() => ({ ready: 0, praying: 18, shaking: 38, stick: 56, wallet: 68, confirming: 78, paper: 92, revealed: 100, error: 0 }[phase]), [phase]);

  return (
    <div className="draw-layout">
      <div className="ritual-heading"><span>{t("heading")}</span><div className="ritual-progress"><i style={{ width: `${progress}%` }} /></div></div>
      {chainEnabled && (
        // Always visible: without a wallet, Guest is active and "On-chain" starts a wallet connection.
        <ConnectButton.Custom>{({ openConnectModal }) => (
          <div className="draw-mode-switch" role="group" aria-label={t("mode.label")}>
            <button type="button" className={!useGuestMode ? "active" : ""} aria-pressed={!useGuestMode} disabled={processing} onClick={() => {
              setDrawMode("chain");
              if (!hasConnectedWallet) { if (needsWalletApp()) setWalletSheet(() => openConnectModal); else openConnectModal(); }
            }}>{t("mode.chain")}</button>
            <button type="button" className={useGuestMode ? "active" : ""} aria-pressed={useGuestMode} disabled={processing} onClick={() => setDrawMode("guest")}>{t("mode.guest")}</button>
          </div>
        )}</ConnectButton.Custom>
      )}
      <section className="ritual-stage">
        <motion.div className="maiden-character draw-character" animate={{ y: [0, -5, 0] }} transition={{ duration: 3, repeat: Infinity }}>
          <motion.img key={character} src={character} className="maiden draw-maiden" alt={t("alt.maiden")} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .25 }} />
          <motion.span className="shrine-rune draw-rune" aria-label={t("alt.rune")} animate={{ opacity: [0.8, 1, 0.8] }} transition={{ duration: 3, repeat: Infinity }} />
        </motion.div>
        <AnimatePresence>
          {(["shaking", "stick", "wallet", "confirming", "paper"] as DrawPhase[]).includes(phase) && (
            <motion.img src="/assets/fortune-box.webp" className="ritual-box" alt={t("alt.box")} initial={{ opacity: 0, scale: .85 }} animate={phase === "shaking" ? { opacity: 1, rotate: [-3, 4, -4, 3, 0], x: [-3, 4, -4, 3, 0] } : { opacity: 1 }} transition={phase === "shaking" ? { duration: .45, repeat: Infinity } : {}} />
          )}
          {(["stick", "wallet", "confirming", "paper"] as DrawPhase[]).includes(phase) && <motion.img src="/assets/fortune-stick.webp" className="ritual-stick" alt={t("alt.stick")} initial={{ opacity: 0, y: 80, rotate: -18 }} animate={{ opacity: 1, y: 0, rotate: 10 }} />}
          {phase === "paper" && <motion.img src="/assets/fortune-paper.webp" className="ritual-paper" alt={t("alt.paper")} initial={{ opacity: 0, scaleY: .05, rotateY: 90 }} animate={{ opacity: 1, scaleY: 1, rotateY: 0 }} transition={{ duration: 1.1 }} />}
        </AnimatePresence>
      </section>
      <div className="dialogue-panel">
        <p>{phase === "confirming" && <LoaderCircle className="spin" size={20}/>} {t(`dialogue.${phase}`)}</p>
        {(phase === "ready" || phase === "praying" || phase === "revealed") && t("kamiNote") && <small className="dialogue-note">{t("kamiNote")}</small>}
        {(phase === "wallet" || phase === "confirming") && gasEstimate && <small>{t("status.gasEstimate", { amount: gasEstimate })}</small>}
        {runtimeMode === "unconfigured" && <small><AlertTriangle size={14}/>{t("status.unconfigured")}</small>}
        {runtimeMode === "demo" && <small>{t("status.demo")}</small>}
        {useGuestMode && guestTrials < GUEST_TRIAL_LIMIT && <small>{t("status.guest", { left: GUEST_TRIAL_LIMIT - guestTrials })}</small>}
        {chainEnabled && hasConnectedWallet && !useGuestMode && <small>{t("status.chain", { remaining: remainingDraws === undefined ? "—" : remainingDraws.toString() })}</small>}
        {pendingTx && <small><a href={explorerTx(pendingTx)} target="_blank" rel="noreferrer">{t("common:explorer.viewTx")} ↗</a></small>}
        {error && <small><AlertTriangle size={14}/>{t(error.key, { ...error.values, ...(error.resetAt !== undefined ? { time: formatLocalResetTimestamp(error.resetAt, t, i18n.language) } : {}) })}</small>}
      </div>
      {guestLimitReached && !hasConnectedWallet && chainEnabled ? <ConnectButton.Custom>{({ openConnectModal }) => <button className="primary-button ritual-button" onClick={() => (needsWalletApp() ? setWalletSheet(() => openConnectModal) : openConnectModal())}><Sparkles/> {t("button.connect")}</button>}</ConnectButton.Custom> : guestLimitReached && chainEnabled ? <button className="primary-button ritual-button" onClick={() => { setDrawMode("chain"); setPhase("ready"); setError(null); }}><Sparkles/> {t("button.backToChain")}</button> : <button className="primary-button ritual-button" onClick={beginRitual} disabled={processing || guestLimitReached}>
        {processing ? <><LoaderCircle className="spin"/> {t("button.processing")}</> : phase === "error" ? <><RotateCcw/> {t("button.retry")}</> : <><Sparkles/> {t("button.begin")}</>}
      </button>}
      {walletSheet && <WalletSheet onClose={() => setWalletSheet(null)} onOtherWallets={walletConnectEnabled ? () => { const open = walletSheet; setWalletSheet(null); open(); } : undefined} />}
    </div>
  );
}

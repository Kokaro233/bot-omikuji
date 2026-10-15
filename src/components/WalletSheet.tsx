import { Copy, ExternalLink, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** True on a phone/tablet browser that has no wallet injected (e.g. Safari or Chrome on iOS/Android). */
export function needsWalletApp() {
  if (typeof window === "undefined") return false;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  return mobile && !(window as unknown as { ethereum?: unknown }).ethereum;
}

// Official "open this site in the wallet's built-in browser" links.
function walletLinks(url: string) {
  const bare = url.replace(/^https?:\/\//, "");
  return [
    { name: "MetaMask", href: `https://metamask.app.link/dapp/${bare}` },
    { name: "OKX Wallet", href: `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}` },
    { name: "TokenPocket", href: `tpdapp://open?params=${encodeURIComponent(JSON.stringify({ url, chain: "ETH", source: "omikuji" }))}` },
    { name: "Trust Wallet", href: `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}` },
  ];
}

export function WalletSheet({ onClose, onOtherWallets }: { onClose: () => void; onOtherWallets?: () => void }) {
  const url = window.location.href;
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* ignore */ }
  }
  return (
    <div className="wallet-sheet" role="dialog" aria-modal="true" aria-labelledby="wallet-sheet-title" onClick={onClose}>
      <div className="wallet-sheet__panel" onClick={(event) => event.stopPropagation()}>
        <button className="wallet-sheet__close" aria-label={t("walletSheet.close")} onClick={onClose}><X size={18}/></button>
        <h2 id="wallet-sheet-title">{t("walletSheet.title")}</h2>
        <p>{t("walletSheet.body")}</p>
        <div className="wallet-sheet__links">
          {walletLinks(url).map((wallet) => <a key={wallet.name} href={wallet.href} rel="noreferrer">{wallet.name} <ExternalLink size={13}/></a>)}
        </div>
        <button className="wallet-sheet__copy" onClick={copy}><Copy size={14}/> {copied ? t("walletSheet.copied") : t("walletSheet.copy")}</button>
        {onOtherWallets && <button className="wallet-sheet__copy" onClick={onOtherWallets}>{t("walletSheet.walletConnect")}</button>}
      </div>
    </div>
  );
}

import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BOTCHAIN_EXPLORER_URL, BOTCHAIN_WEBSITE_URL } from "@/supabase/functions/_shared/botchain.ts";
import { explorerAddress } from "@/src/config/chain";
import { runtime, runtimeMode } from "@/src/lib/runtime";

/**
 * BOT Chain ecosystem credit. "floating" is the slim desktop strip mirroring the
 * connection pill; "panel" sits inside page content and is the one shown on mobile.
 * Wording reflects the real deployment state and never claims a mainnet launch
 * before a contract is configured.
 */
export function EcosystemFooter({ variant }: { variant: "floating" | "panel" }) {
  const { t } = useTranslation();
  const contract = runtime.contractAddress;
  const status = runtimeMode === "live" && contract
    ? <a href={explorerAddress(contract)} target="_blank" rel="noreferrer">{t("footer.contract", { address: `${contract.slice(0, 6)}…${contract.slice(-4)}` })} <ExternalLink size={11} /></a>
    : <span className="ecosystem__pending">{runtimeMode === "demo" ? t("footer.demo") : t("footer.pending")}</span>;

  if (variant === "floating") {
    return (
      <footer className="ecosystem-strip" aria-label="BOT Chain ecosystem">
        <span className="ecosystem__mark" aria-hidden="true" />
        <span>Powered by <b>BOT Chain</b></span>
        <a href={BOTCHAIN_WEBSITE_URL} target="_blank" rel="noreferrer">botchain.ai</a>
        <a href={BOTCHAIN_EXPLORER_URL} target="_blank" rel="noreferrer">scan.botchain.ai</a>
      </footer>
    );
  }

  return (
    <footer className="ecosystem-panel" aria-label="BOT Chain ecosystem">
      <p className="ecosystem-panel__title"><span className="ecosystem__mark" aria-hidden="true" /> Powered by <b>BOT Chain</b></p>
      <div className="ecosystem-panel__links">
        <a href={BOTCHAIN_WEBSITE_URL} target="_blank" rel="noreferrer">botchain.ai <ExternalLink size={11} /></a>
        <a href={BOTCHAIN_EXPLORER_URL} target="_blank" rel="noreferrer">scan.botchain.ai <ExternalLink size={11} /></a>
      </div>
      <small>{status}</small>
    </footer>
  );
}

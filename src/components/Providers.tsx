"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { connectorsForWallets, RainbowKitProvider, darkTheme, type WalletList } from "@rainbow-me/rainbowkit";
import {
  bitgetWallet,
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  rabbyWallet,
  tokenPocketWallet,
  trustWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { createConfig, http, WagmiProvider } from "wagmi";
import { botChain } from "@/src/config/chain";
import { runtime } from "@/src/lib/runtime";

/** WalletConnect (QR codes, mobile deep links from desktop) needs a real Reown project id. */
export const walletConnectEnabled = Boolean(runtime.walletConnectProjectId);

// Without a project id, offer only wallets that are actually injected into this
// browser (extensions, in-app wallet browsers, plus EIP-6963 discovery). Listing
// WalletConnect-backed wallets without a valid id would produce broken QR codes.
const wallets: WalletList = walletConnectEnabled
  ? [
      { groupName: "Popular", wallets: [metaMaskWallet, okxWallet, bitgetWallet, tokenPocketWallet, trustWallet, walletConnectWallet] },
      { groupName: "More", wallets: [rabbyWallet, coinbaseWallet, injectedWallet] },
    ]
  : [{ groupName: "Installed", wallets: [injectedWallet] }];

const connectors = connectorsForWallets(wallets, {
  appName: "BOT Omikuji",
  appDescription: "Draw a daily shrine fortune recorded on BOT Chain Mainnet.",
  appUrl: typeof window === "undefined" ? undefined : window.location.origin,
  projectId: runtime.walletConnectProjectId || "walletconnect-not-configured",
});

// BOT Chain Mainnet is the only chain: any other wallet network is reported as
// unsupported and the UI offers a switch (wagmi adds chain 677 to the wallet if needed).
const config = createConfig({
  connectors,
  chains: [botChain],
  transports: { [botChain.id]: http(runtime.rpcUrl, { retryCount: 2, timeout: 20_000 }) },
  ssr: false,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const { i18n } = useTranslation();
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider locale={i18n.language === "en" ? "en-US" : "zh-CN"} initialChain={botChain} theme={darkTheme({ accentColor: "#8d2bd0", accentColorForeground: "white", borderRadius: "small" })}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

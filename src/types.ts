export type RuntimeMode = "demo" | "live" | "unconfigured";
/** live = verified BOT Chain draw; demo = off-chain guest/demo result with no transaction. */
export type ResultMode = "demo" | "live";
export type Rarity = "SSR" | "SR" | "R";
export type DrawPhase =
  | "ready"
  | "praying"
  | "shaking"
  | "stick"
  | "wallet"
  | "confirming"
  | "paper"
  | "revealed"
  | "error";

export interface FortuneDefinition {
  id: number;
  kanji: string;
  /** Internal catalog label (backend), not shown in the UI. */
  name: string;
  rarity: Rarity;
  weight: number;
  career: number;
  love: number;
  wealth: number;
  theme: "gold" | "rose" | "violet" | "blue" | "slate" | "red";
}

export interface FortuneStats {
  career: number;
  love: number;
  wealth: number;
}

export interface DrawResult {
  id: string;
  fortuneId: number;
  walletAddress: `0x${string}` | string;
  /** Empty for off-chain results, or for chain records whose transaction hash is not known yet. */
  txHash: `0x${string}` | string;
  blockNumber?: string;
  createdAt: string;
  /** 677 for BOT Chain draws, 0 for off-chain guest/demo results. */
  chainId: number;
  /** BOT Chain draws: index in FortuneContract.getFortuneAt(wallet, index). */
  recordIndex?: number;
  contractAddress?: string;
  claimed: boolean;
  favorite: boolean;
  mode: ResultMode;
}

export interface WalletRecord {
  id: string;
  address: string;
  chainId: number;
  isPrimary: boolean;
  createdAt: string;
}

export type FortuneRecord = DrawResult;

export interface DemoProfile {
  id: string;
  username: string;
  email: string;
  avatar: string;
  /** True only for an activated wallet session (or a legacy email session). */
  signedIn: boolean;
  /** Lower-case wallet the session was signed for; private data belongs to this wallet only. */
  wallet?: string;
}

export type AppRoute = "home" | "draw" | "result" | "collection" | "profile";

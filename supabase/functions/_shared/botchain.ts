// Single source of truth for BOT Chain Mainnet parameters and the Omikuji ABI.
// Imported by the Vite frontend, the Supabase Edge Functions (Deno) and the
// Node scripts, so every layer validates against the same chain and contract.
import { defineChain, getAddress, isAddress } from "viem";

export const BOTCHAIN_CHAIN_ID = 677;
export const BOTCHAIN_CHAIN_ID_HEX = "0x2a5";
export const BOTCHAIN_NAME = "BOT Chain Mainnet";
export const BOTCHAIN_RPC_URL = "https://rpc.botchain.ai";
export const BOTCHAIN_EXPLORER_URL = "https://scan.botchain.ai";
export const BOTCHAIN_WEBSITE_URL = "https://botchain.ai";

export function createBotChain(rpcUrl = BOTCHAIN_RPC_URL, explorerUrl = BOTCHAIN_EXPLORER_URL) {
  return defineChain({
    id: BOTCHAIN_CHAIN_ID,
    name: BOTCHAIN_NAME,
    nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "BOT Chain Scan", url: explorerUrl, apiUrl: `${explorerUrl}/api` } },
  });
}

export const botChainMainnet = createBotChain();

/** Returns a checksummed address, or null when the value is missing, malformed or the zero address. */
export function parseContractAddress(value: string | undefined | null): `0x${string}` | null {
  const trimmed = (value ?? "").trim();
  if (!isAddress(trimmed, { strict: false })) return null;
  if (/^0x0{40}$/i.test(trimmed)) return null;
  return getAddress(trimmed);
}

export const explorerTxUrl = (hash: string, explorerUrl = BOTCHAIN_EXPLORER_URL) => `${explorerUrl}/tx/${hash}`;
export const explorerAddressUrl = (address: string, explorerUrl = BOTCHAIN_EXPLORER_URL) => `${explorerUrl}/address/${address}`;

const fortuneRecordComponents = [
  { name: "wallet", type: "address" },
  { name: "fortuneId", type: "uint256" },
  { name: "timestamp", type: "uint256" },
] as const;

export const fortuneContractAbi = [
  { type: "error", name: "DailyLimitReached", inputs: [{ name: "nextDrawTimestamp", type: "uint256" }] },
  { type: "error", name: "NoFortune", inputs: [] },
  { type: "error", name: "RecordOutOfRange", inputs: [{ name: "index", type: "uint256" }, { name: "length", type: "uint256" }] },
  { type: "function", name: "MAX_DAILY_DRAWS", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "FORTUNE_COUNT", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalDraws", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "drawFortune", stateMutability: "nonpayable", inputs: [], outputs: [{ name: "fortuneId", type: "uint256" }] },
  { type: "function", name: "canDraw", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "remainingDraws", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "currentLocalDay", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "drawsPerDay", stateMutability: "view", inputs: [{ name: "user", type: "address" }, { name: "day", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "getRecordCount", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "getLatestFortune", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "tuple", components: fortuneRecordComponents }] },
  { type: "function", name: "getFortuneAt", stateMutability: "view", inputs: [{ name: "user", type: "address" }, { name: "index", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: fortuneRecordComponents }] },
  { type: "function", name: "getFortunes", stateMutability: "view", inputs: [{ name: "user", type: "address" }, { name: "offset", type: "uint256" }, { name: "limit", type: "uint256" }], outputs: [{ name: "page", type: "tuple[]", components: fortuneRecordComponents }] },
  { type: "function", name: "previewFortuneForRoll", stateMutability: "pure", inputs: [{ name: "roll", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "event",
    name: "FortuneDrawn",
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: true, name: "recordIndex", type: "uint256" },
      { indexed: false, name: "fortuneId", type: "uint256" },
      { indexed: false, name: "timestamp", type: "uint256" },
    ],
  },
] as const;

export const FORTUNE_COUNT = 7;
export const MAX_DAILY_DRAWS = 10;

import { BOTCHAIN_CHAIN_ID } from "@/supabase/functions/_shared/botchain.ts";
import type { DrawResult } from "@/src/types";

/** A record read straight from FortuneContract storage. */
export interface ChainRecord {
  wallet: string;
  recordIndex: number;
  fortuneId: number;
  /** Seconds since epoch, from the contract. */
  timestamp: number;
  txHash?: string;
  blockNumber?: string;
}

export const chainRecordKey = (contract: string, wallet: string, recordIndex: number) =>
  `${contract.toLowerCase()}:${wallet.toLowerCase()}:${recordIndex}`;

const resultKey = (item: DrawResult) =>
  item.mode === "live" && item.contractAddress && item.recordIndex !== undefined
    ? chainRecordKey(item.contractAddress, item.walletAddress, item.recordIndex)
    : null;

/**
 * Reconciles locally cached results with the wallet's records read from the contract.
 * The contract is the source of truth for fortune and time; local/cloud entries only
 * contribute what the chain cannot (tx hash when known, favorite, claim state).
 * Off-chain (demo) results are passed through untouched and never matched to chain records.
 */
export function mergeChainHistory(local: DrawResult[], records: ChainRecord[], contractAddress: string): DrawResult[] {
  const byKey = new Map<string, ChainRecord>();
  for (const record of records) byKey.set(chainRecordKey(contractAddress, record.wallet, record.recordIndex), record);

  const seen = new Set<string>();
  const merged: DrawResult[] = [];
  for (const item of local) {
    const key = resultKey(item);
    if (key && seen.has(key)) continue;
    const record = key ? byKey.get(key) : undefined;
    if (key) seen.add(key);
    if (!record) {
      merged.push(item);
      continue;
    }
    merged.push({
      ...item,
      fortuneId: record.fortuneId,
      createdAt: new Date(record.timestamp * 1000).toISOString(),
      txHash: item.txHash || record.txHash || "",
      blockNumber: item.blockNumber ?? record.blockNumber,
      chainId: BOTCHAIN_CHAIN_ID,
    });
  }

  for (const [key, record] of byKey) {
    if (seen.has(key)) continue;
    merged.push({
      id: `chain:${key}`,
      fortuneId: record.fortuneId,
      walletAddress: record.wallet.toLowerCase(),
      txHash: record.txHash ?? "",
      blockNumber: record.blockNumber,
      createdAt: new Date(record.timestamp * 1000).toISOString(),
      chainId: BOTCHAIN_CHAIN_ID,
      recordIndex: record.recordIndex,
      contractAddress: contractAddress.toLowerCase(),
      claimed: false,
      favorite: false,
      mode: "live",
    });
  }

  return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Combines cloud rows with local results, preferring the cloud copy of the same draw. */
export function mergeCloudHistory(local: DrawResult[], cloud: DrawResult[]): DrawResult[] {
  const cloudKeys = new Set(cloud.flatMap((item) => [resultKey(item), item.txHash ? `tx:${item.txHash.toLowerCase()}` : null, `id:${item.id}`].filter(Boolean)));
  const localOnly = local.filter((item) => {
    const key = resultKey(item);
    if (key && cloudKeys.has(key)) return false;
    if (item.txHash && cloudKeys.has(`tx:${item.txHash.toLowerCase()}`)) return false;
    return !cloudKeys.has(`id:${item.id}`);
  });
  return [...cloud, ...localOnly].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** True for results that represent a verified BOT Chain draw with a known transaction. */
export const hasChainProof = (item: DrawResult) =>
  item.mode === "live" && item.chainId === BOTCHAIN_CHAIN_ID && /^0x[0-9a-fA-F]{64}$/.test(item.txHash);

/** What the collection shows: on-chain draws only, scoped to the connected wallet when there is one. */
export function collectionItems(history: DrawResult[], connectedWallet?: string): DrawResult[] {
  const wallet = connectedWallet?.toLowerCase();
  return history.filter((item) => item.mode === "live" && (!wallet || item.walletAddress.toLowerCase() === wallet));
}

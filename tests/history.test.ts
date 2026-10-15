import { describe, expect, it } from "vitest";
import { collectionItems, hasChainProof, mergeChainHistory, mergeCloudHistory, type ChainRecord } from "@/src/lib/history";
import type { DrawResult } from "@/src/types";

const CONTRACT = "0x1111111111111111111111111111111111111111";
const WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

const live = (recordIndex: number, extra: Partial<DrawResult> = {}): DrawResult => ({
  id: `chain:${CONTRACT}:${WALLET}:${recordIndex}`,
  fortuneId: 3,
  walletAddress: WALLET,
  txHash: tx(recordIndex + 1),
  createdAt: "2026-10-15T00:00:00.000Z",
  chainId: 677,
  recordIndex,
  contractAddress: CONTRACT,
  claimed: false,
  favorite: false,
  mode: "live",
  ...extra,
});

const guest: DrawResult = { id: "guest-12345678", fortuneId: 0, walletAddress: "访客体验", txHash: "", createdAt: "2026-10-16T00:00:00.000Z", chainId: 0, claimed: true, favorite: true, mode: "demo" };
const record = (recordIndex: number, fortuneId: number, timestamp: number): ChainRecord => ({ wallet: WALLET, recordIndex, fortuneId, timestamp });

describe("mergeChainHistory", () => {
  it("restores the full history from contract storage on a fresh device", () => {
    const merged = mergeChainHistory([], [record(0, 1, 1_792_000_000), record(1, 6, 1_792_000_100)], CONTRACT);
    expect(merged.map((item) => [item.recordIndex, item.fortuneId, item.mode, item.chainId])).toEqual([[1, 6, "live", 677], [0, 1, "live", 677]]);
    expect(merged.every((item) => item.txHash === "")).toBe(true);
    expect(merged.some(hasChainProof)).toBe(false);
  });

  it("lets the contract override cached fortune and time but keeps favorites and tx hashes", () => {
    const merged = mergeChainHistory([live(0, { fortuneId: 3, favorite: true })], [record(0, 5, 1_792_000_000)], CONTRACT);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ fortuneId: 5, favorite: true, txHash: tx(1), createdAt: new Date(1_792_000_000_000).toISOString() });
  });

  it("fills a missing tx hash from enriched records without duplicating entries", () => {
    const merged = mergeChainHistory([live(0, { txHash: "" })], [{ ...record(0, 2, 1_792_000_000), txHash: tx(9) }], CONTRACT);
    expect(merged).toHaveLength(1);
    expect(merged[0].txHash).toBe(tx(9));
  });

  it("never matches off-chain guest results to chain records", () => {
    const merged = mergeChainHistory([guest], [record(0, 1, 1_792_000_000)], CONTRACT);
    expect(merged).toHaveLength(2);
    expect(merged.find((item) => item.id === guest.id)).toEqual(guest);
  });

  it("is idempotent across refreshes", () => {
    const records = [record(0, 1, 1_792_000_000), record(1, 2, 1_792_000_100)];
    const once = mergeChainHistory([guest], records, CONTRACT);
    expect(mergeChainHistory(once, records, CONTRACT)).toEqual(once);
  });
});

describe("mergeCloudHistory", () => {
  it("prefers the cloud copy of the same chain draw", () => {
    const cloud = live(0, { id: "uuid-1", claimed: true, favorite: true });
    const merged = mergeCloudHistory([live(0), live(1), guest], [cloud]);
    expect(merged.map((item) => item.id).sort()).toEqual(["guest-12345678", `chain:${CONTRACT}:${WALLET}:1`, "uuid-1"].sort());
  });
});

describe("hasChainProof", () => {
  it("only accepts BOT Chain results with a real transaction hash", () => {
    expect(hasChainProof(live(0))).toBe(true);
    expect(hasChainProof(live(0, { chainId: 56 }))).toBe(false);
    expect(hasChainProof(live(0, { txHash: "" }))).toBe(false);
    expect(hasChainProof(guest)).toBe(false);
  });
});

describe("collectionItems", () => {
  const other = live(0, { id: "other", walletAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" });
  it("never includes guest trials", () => {
    expect(collectionItems([guest, live(0)]).map((item) => item.mode)).toEqual(["live"]);
  });
  it("shows only the connected wallet's draws", () => {
    expect(collectionItems([live(0), other, guest], WALLET.toUpperCase().replace("0X", "0x")).map((item) => item.id)).toEqual([live(0).id]);
    expect(collectionItems([live(0), other, guest])).toHaveLength(2);
  });
});

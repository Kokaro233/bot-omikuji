import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, getAddress, verifyMessage, type TransactionReceipt } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { fortuneContractAbi, parseContractAddress } from "@/supabase/functions/_shared/botchain.ts";
import { recordDraw, walletClaim, type DrawStore, type HandlerDeps, type WalletRow } from "@/supabase/functions/_shared/handlers.ts";
import type { VerifiedDraw } from "@/supabase/functions/_shared/verifyDraw.ts";

const CONTRACT = getAddress("0x1111111111111111111111111111111111111111");
const OTHER_CONTRACT = getAddress("0x2222222222222222222222222222222222222222");
const alice = privateKeyToAccount(generatePrivateKey());
const mallory = privateKeyToAccount(generatePrivateKey());
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;

type FakeDraw = { wallet: `0x${string}`; recordIndex: number; fortuneId: number; timestamp: number; emitter?: `0x${string}`; status?: "success" | "reverted"; storedFortuneId?: number };

function fakeChain(chainId: number, draws: Record<string, FakeDraw>) {
  const storage = new Map<string, { wallet: `0x${string}`; fortuneId: bigint; timestamp: bigint }>();
  for (const draw of Object.values(draws)) {
    if ((draw.status ?? "success") === "success" && (draw.emitter ?? CONTRACT) === CONTRACT) {
      storage.set(`${draw.wallet.toLowerCase()}:${draw.recordIndex}`, { wallet: draw.wallet, fortuneId: BigInt(draw.storedFortuneId ?? draw.fortuneId), timestamp: BigInt(draw.timestamp) });
    }
  }
  const client = {
    getChainId: async () => chainId,
    getTransactionReceipt: async ({ hash: txHash }: { hash: `0x${string}` }) => {
      const draw = draws[txHash];
      if (!draw) throw new Error(`Transaction receipt with hash "${txHash}" could not be found.`);
      const status = draw.status ?? "success";
      const logs = status === "reverted" ? [] : [{
        address: (draw.emitter ?? CONTRACT).toLowerCase(),
        topics: encodeEventTopics({ abi: fortuneContractAbi, eventName: "FortuneDrawn", args: { user: draw.wallet, recordIndex: BigInt(draw.recordIndex) } }),
        data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [BigInt(draw.fortuneId), BigInt(draw.timestamp)]),
        logIndex: 0,
      }];
      return { status, logs, transactionHash: txHash, blockNumber: 100n } as unknown as TransactionReceipt;
    },
    readContract: async ({ args }: { args: readonly [`0x${string}`, bigint] }) => {
      const record = storage.get(`${args[0].toLowerCase()}:${args[1]}`);
      if (!record) throw new Error("RecordOutOfRange");
      return record;
    },
  };
  return client as unknown as HandlerDeps["client"];
}

function memoryStore() {
  const verified = new Map<string, VerifiedDraw>();
  const account = new Map<string, { userId: string; draw: VerifiedDraw }>();
  const nonces: { userId: string; wallet: string; chainId: number; nonce: string; message: string; used: boolean }[] = [];
  const wallets: (WalletRow & { wallet: string; chainId: number })[] = [];
  const store: DrawStore = {
    async upsertVerifiedDraws(draws) { for (const d of draws) if (!verified.has(`${d.txHash}:${d.logIndex}`)) verified.set(`${d.txHash}:${d.logIndex}`, d); },
    async createNonce(row) { nonces.push({ ...row, used: false }); },
    async consumeNonce({ userId, wallet, chainId, nonce }) {
      const row = nonces.find((n) => n.userId === userId && n.wallet === wallet && n.chainId === chainId && n.nonce === nonce && !n.used);
      if (!row) return null;
      row.used = true;
      return { message: row.message };
    },
    async findWallet(chainId, wallet) { return wallets.find((w) => w.chainId === chainId && w.wallet === wallet) ?? null; },
    async insertWallet({ userId, wallet, chainId }) { const row = { id: `w${wallets.length}`, user_id: userId, wallet, chainId }; wallets.push(row); return row; },
    async upsertAccountFortunes(userId, _walletId, draws) { for (const d of draws) account.set(`${d.txHash}:${d.logIndex}`, { userId, draw: d }); },
  };
  return { store, verified, account, wallets };
}

function deps(client: HandlerDeps["client"], store: DrawStore, contractAddress: string | null = CONTRACT): HandlerDeps {
  let n = 0;
  return {
    client,
    store,
    contractAddress,
    verifySignature: (args) => verifyMessage(args),
    newNonce: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    now: () => new Date("2026-10-15T00:00:00Z"),
  };
}

const chainDraws: Record<string, FakeDraw> = {
  [hash(1)]: { wallet: alice.address, recordIndex: 0, fortuneId: 0, timestamp: 1_792_000_000 },
  [hash(2)]: { wallet: alice.address, recordIndex: 1, fortuneId: 5, timestamp: 1_792_000_100, status: "reverted" },
  [hash(3)]: { wallet: alice.address, recordIndex: 0, fortuneId: 2, timestamp: 1_792_000_200, emitter: OTHER_CONTRACT },
  [hash(4)]: { wallet: mallory.address, recordIndex: 0, fortuneId: 1, timestamp: 1_792_000_300 },
  [hash(5)]: { wallet: alice.address, recordIndex: 1, fortuneId: 0, timestamp: 1_792_000_400, storedFortuneId: 6 },
};

describe("record-draw", () => {
  it("indexes a verified BOT Chain draw exactly once", async () => {
    const { store, verified } = memoryStore();
    const d = deps(fakeChain(677, chainDraws), store);
    const first = await recordDraw({ txHash: hash(1) }, d);
    expect(first.status).toBe(200);
    expect(first.body.recorded).toMatchObject([{ fortuneId: 0, recordIndex: 0, chainId: 677 }]);
    await recordDraw({ txHash: hash(1), chainId: 677 }, d);
    expect(verified.size).toBe(1);
  });

  it("refuses to run without a configured BOT Chain contract", async () => {
    expect((await recordDraw({ txHash: hash(1) }, deps(fakeChain(677, chainDraws), memoryStore().store, null))).status).toBe(503);
  });

  it("rejects chain ids other than 677 from the client", async () => {
    const result = await recordDraw({ txHash: hash(1), chainId: 56 }, deps(fakeChain(677, chainDraws), memoryStore().store));
    expect(result).toMatchObject({ status: 400, body: { code: "wrong_chain" } });
  });

  it("rejects an RPC that is not BOT Chain", async () => {
    const result = await recordDraw({ txHash: hash(1) }, deps(fakeChain(56, chainDraws), memoryStore().store));
    expect(result.body.code).toBe("wrong_chain");
  });

  it.each([
    [hash(2), "reverted"],
    [hash(3), "no_event"],
    [hash(5), "state_mismatch"],
    [hash(99), "pending"],
    ["0xnot-a-hash", "invalid_hash"],
  ])("does not store %s (%s)", async (txHash, code) => {
    const { store, verified } = memoryStore();
    const result = await recordDraw({ txHash }, deps(fakeChain(677, chainDraws), store));
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.body.code).toBe(code);
    expect(verified.size).toBe(0);
  });
});

describe("wallet-claim", () => {
  async function bind(d: HandlerDeps, userId: string, signer = alice, txHashes: string[] = []) {
    const nonce = await walletClaim("nonce", userId, { address: alice.address }, d);
    const signature = await signer.signMessage({ message: String(nonce.body.message) });
    return { nonce, result: await walletClaim("verify", userId, { address: alice.address, nonce: nonce.body.nonce, signature, txHashes }, d) };
  }

  it("issues a BOT Chain specific message, binds on a valid signature and claims only verified draws", async () => {
    const { store, account, verified } = memoryStore();
    const d = deps(fakeChain(677, chainDraws), store);
    const { nonce, result } = await bind(d, "user-1", alice, [hash(1), hash(2), hash(3), hash(4), hash(1)]);
    expect(String(nonce.body.message)).toContain("Chain ID: 677 (BOT Chain Mainnet)");
    expect(String(nonce.body.message)).toContain(alice.address.toLowerCase());
    expect(result.status).toBe(200);
    expect(result.body.claimed).toHaveLength(1);
    expect(result.body.rejected).toEqual([
      { txHash: hash(2), code: "reverted" },
      { txHash: hash(3), code: "no_event" },
      { txHash: hash(4), code: "wrong_wallet" },
    ]);
    expect([...account.values()].map((row) => row.draw.txHash)).toEqual([hash(1)]);
    expect(verified.size).toBe(1);
  });

  it("rejects nonce replay and signatures from another key", async () => {
    const { store } = memoryStore();
    const d = deps(fakeChain(677, chainDraws), store);
    const { nonce, result } = await bind(d, "user-1");
    expect(result.status).toBe(200);
    const signature = await alice.signMessage({ message: String(nonce.body.message) });
    const replay = await walletClaim("verify", "user-1", { address: alice.address, nonce: nonce.body.nonce, signature }, d);
    expect(replay.body.code).toBe("invalid_nonce");
    const forged = await bind(d, "user-2", mallory);
    expect(forged.result.body.code).toBe("bad_signature");
  });

  it("keeps a wallet bound to its first account", async () => {
    const { store } = memoryStore();
    const d = deps(fakeChain(677, chainDraws), store);
    await bind(d, "user-1");
    expect((await bind(d, "user-2")).result).toMatchObject({ status: 409, body: { code: "wallet_taken" } });
  });

  it("requires a binding before sync and rejects non-677 wallets", async () => {
    const { store } = memoryStore();
    const d = deps(fakeChain(677, chainDraws), store);
    expect((await walletClaim("sync", "user-1", { address: alice.address, txHashes: [hash(1)] }, d)).body.code).toBe("wallet_binding_required");
    expect((await walletClaim("nonce", "user-1", { address: alice.address, chainId: 56 }, d)).body.code).toBe("wrong_chain");
    await bind(d, "user-1");
    const synced = await walletClaim("sync", "user-1", { address: alice.address, txHashes: [hash(1)] }, d);
    expect(synced.body.claimed).toHaveLength(1);
  });
});

describe("contract address config", () => {
  it("accepts only a well-formed, non-zero contract address", () => {
    expect(parseContractAddress("not-an-address")).toBeNull();
    expect(parseContractAddress("")).toBeNull();
    expect(parseContractAddress("0x0000000000000000000000000000000000000000")).toBeNull();
    expect(parseContractAddress(CONTRACT.toLowerCase())).toBe(CONTRACT);
  });
});

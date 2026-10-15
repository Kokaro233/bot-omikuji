import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { encodeFunctionData, type Hex } from "viem";
import { fortuneContractAbi } from "../supabase/functions/_shared/botchain.ts";
import { DrawVerificationError, extractFortuneDraws, verifyDrawTransaction } from "../supabase/functions/_shared/verifyDraw.ts";

const { viem, networkHelpers } = await network.create();
const publicClient = await viem.getPublicClient();
const HARDHAT_CHAIN_ID = await publicClient.getChainId();

// Reads go through the shared frontend/backend ABI, so the tests also prove that ABI matches the contract.
const readAt = (address: `0x${string}`, user: `0x${string}`, index: bigint) =>
  publicClient.readContract({ address, abi: fortuneContractAbi, functionName: "getFortuneAt", args: [user, index] });
const readPage = (address: `0x${string}`, user: `0x${string}`, offset: bigint, limit: bigint) =>
  publicClient.readContract({ address, abi: fortuneContractAbi, functionName: "getFortunes", args: [user, offset, limit] });

async function deploy() {
  return viem.deployContract("FortuneContract");
}

/** Sends drawFortune with a fixed gas limit so a revert is mined instead of rejected by estimation. */
async function sendRawDraw(contract: `0x${string}`, from: `0x${string}`): Promise<Hex> {
  const [walletClient] = await viem.getWalletClients();
  const before = await publicClient.getBlockNumber();
  try {
    return await walletClient.sendTransaction({ account: from, to: contract, data: encodeFunctionData({ abi: fortuneContractAbi, functionName: "drawFortune" }), gas: 300_000n });
  } catch {
    const block = await publicClient.getBlock({ blockNumber: before + 1n });
    return block.transactions[0];
  }
}

describe("FortuneContract", () => {
  it("maps all weighted roll boundaries to the seven fortune ids", async () => {
    const contract = await deploy();
    const cases: Array<[bigint, bigint]> = [[0n,0n],[4n,0n],[5n,1n],[16n,1n],[17n,2n],[34n,2n],[35n,3n],[59n,3n],[60n,4n],[79n,4n],[80n,5n],[94n,5n],[95n,6n],[99n,6n]];
    for (const [roll, fortuneId] of cases) assert.equal(await contract.read.previewFortuneForRoll([roll]), fortuneId);
    await assert.rejects(contract.read.previewFortuneForRoll([100n]));
  });

  it("emits FortuneDrawn with a sequential recordIndex that matches storage", async () => {
    const contract = await deploy();
    const [owner] = await viem.getWalletClients();
    for (let i = 0; i < 3; i++) {
      const hash = await contract.write.drawFortune();
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const [draw] = extractFortuneDraws(receipt, contract.address, HARDHAT_CHAIN_ID);
      assert.equal(draw.recordIndex, i);
      assert.equal(draw.wallet.toLowerCase(), owner.account.address.toLowerCase());
      const stored = await readAt(contract.address, owner.account.address, BigInt(i));
      assert.equal(Number(stored.fortuneId), draw.fortuneId);
      assert.equal(Number(stored.timestamp), draw.timestamp);
    }
    assert.equal(await contract.read.getRecordCount([owner.account.address]), 3n);
    assert.equal(await contract.read.totalDraws(), 3n);
    const latest = await contract.read.getLatestFortune([owner.account.address]);
    const third = await readAt(contract.address, owner.account.address, 2n);
    assert.deepEqual(latest, third);
  });

  it("blocks the eleventh draw of the day and reopens at the next UTC+8 midnight", async () => {
    const contract = await deploy();
    const [owner] = await viem.getWalletClients();
    for (let i = 0; i < 10; i++) await contract.write.drawFortune();
    assert.equal(await contract.read.canDraw([owner.account.address]), false);
    assert.equal(await contract.read.remainingDraws([owner.account.address]), 0n);
    await viem.assertions.revertWithCustomError(contract.write.drawFortune(), contract, "DailyLimitReached");

    const now = BigInt(await networkHelpers.time.latest());
    const nextLocalMidnight = ((now + 8n * 3600n) / 86400n + 1n) * 86400n - 8n * 3600n;
    await viem.assertions.revertWithCustomErrorWithArgs(contract.write.drawFortune(), contract, "DailyLimitReached", [nextLocalMidnight]);

    await networkHelpers.time.increaseTo(nextLocalMidnight);
    assert.equal(await contract.read.remainingDraws([owner.account.address]), 10n);
    await contract.write.drawFortune();
    assert.equal(await contract.read.getRecordCount([owner.account.address]), 11n);
  });

  it("keeps wallets independent", async () => {
    const contract = await deploy();
    const clients = await viem.getWalletClients();
    await contract.write.drawFortune();
    const second = await viem.getContractAt("FortuneContract", contract.address, { client: { wallet: clients[1] } });
    await second.write.drawFortune();
    await second.write.drawFortune();
    assert.equal(await contract.read.getRecordCount([clients[0].account.address]), 1n);
    assert.equal(await contract.read.getRecordCount([clients[1].account.address]), 2n);
    assert.equal(await contract.read.totalDraws(), 3n);
  });

  it("pages history with getFortunes and rejects out-of-range reads", async () => {
    const contract = await deploy();
    const [owner] = await viem.getWalletClients();
    const user = owner.account.address;
    await viem.assertions.revertWithCustomError(contract.read.getLatestFortune([user]), contract, "NoFortune");
    assert.deepEqual(await readPage(contract.address, user, 0n, 10n), []);
    for (let i = 0; i < 5; i++) await contract.write.drawFortune();
    assert.equal((await readPage(contract.address, user, 0n, 2n)).length, 2);
    assert.equal((await readPage(contract.address, user, 3n, 10n)).length, 2);
    assert.equal((await readPage(contract.address, user, 5n, 10n)).length, 0);
    const all = await readPage(contract.address, user, 0n, 100n);
    for (let i = 0; i < all.length; i++) assert.deepEqual(all[i], await readAt(contract.address, user, BigInt(i)));
    await viem.assertions.revertWithCustomErrorWithArgs(contract.read.getFortuneAt([user, 5n]), contract, "RecordOutOfRange", [5n, 5n]);
  });

  it("produces every fortune id across many draws", async () => {
    const contract = await deploy();
    const clients = await viem.getWalletClients();
    const seen = new Set<number>();
    for (let day = 0; day < 12 && seen.size < 7; day++) {
      for (const client of clients) {
        const asClient = await viem.getContractAt("FortuneContract", contract.address, { client: { wallet: client } });
        for (let i = 0; i < 10; i++) {
          const receipt = await publicClient.waitForTransactionReceipt({ hash: await asClient.write.drawFortune() });
          for (const draw of extractFortuneDraws(receipt, contract.address, HARDHAT_CHAIN_ID)) seen.add(draw.fortuneId);
        }
      }
      await networkHelpers.time.increase(86400);
    }
    assert.equal(seen.size, 7);
  });

  it("stays within the gas budget", async () => {
    const contract = await deploy();
    const first = await publicClient.waitForTransactionReceipt({ hash: await contract.write.drawFortune() });
    const second = await publicClient.waitForTransactionReceipt({ hash: await contract.write.drawFortune() });
    console.log(`      gas: first draw ${first.gasUsed}, repeat draw ${second.gasUsed}`);
    assert.ok(first.gasUsed < 180_000n);
    assert.ok(second.gasUsed < 125_000n);
  });
});

describe("verifyDrawTransaction (shared with Supabase Edge Functions)", () => {
  it("accepts a real draw and cross-checks contract storage", async () => {
    const contract = await deploy();
    const [owner] = await viem.getWalletClients();
    const hash = await contract.write.drawFortune();
    await publicClient.waitForTransactionReceipt({ hash });
    const draws = await verifyDrawTransaction(publicClient, hash, { contractAddress: contract.address, expectedWallet: owner.account.address, expectedChainId: HARDHAT_CHAIN_ID });
    assert.equal(draws.length, 1);
    assert.equal(draws[0].recordIndex, 0);
    assert.equal(draws[0].chainId, HARDHAT_CHAIN_ID);
  });

  it("rejects an RPC that is not BOT Chain by default", async () => {
    const contract = await deploy();
    const hash = await contract.write.drawFortune();
    await assert.rejects(verifyDrawTransaction(publicClient, hash, { contractAddress: contract.address }), (error: unknown) => error instanceof DrawVerificationError && error.code === "wrong_chain");
  });

  it("rejects a reverted (daily-limit) transaction", async () => {
    const contract = await deploy();
    const [owner] = await viem.getWalletClients();
    for (let i = 0; i < 10; i++) await contract.write.drawFortune();
    const hash = await sendRawDraw(contract.address, owner.account.address);
    const receipt = await publicClient.getTransactionReceipt({ hash });
    assert.equal(receipt.status, "reverted");
    await assert.rejects(verifyDrawTransaction(publicClient, hash, { contractAddress: contract.address, expectedChainId: HARDHAT_CHAIN_ID }), (error: unknown) => error instanceof DrawVerificationError && error.code === "reverted");
  });

  it("rejects events from another contract and draws by another wallet", async () => {
    const contract = await deploy();
    const impostor = await deploy();
    const clients = await viem.getWalletClients();
    const hash = await impostor.write.drawFortune();
    await assert.rejects(verifyDrawTransaction(publicClient, hash, { contractAddress: contract.address, expectedChainId: HARDHAT_CHAIN_ID }), (error: unknown) => error instanceof DrawVerificationError && error.code === "no_event");
    const own = await contract.write.drawFortune();
    await assert.rejects(verifyDrawTransaction(publicClient, own, { contractAddress: contract.address, expectedWallet: clients[1].account.address, expectedChainId: HARDHAT_CHAIN_ID }), (error: unknown) => error instanceof DrawVerificationError && error.code === "wrong_wallet");
  });

  it("rejects malformed and unknown hashes", async () => {
    const contract = await deploy();
    await assert.rejects(verifyDrawTransaction(publicClient, "0x1234", { contractAddress: contract.address, expectedChainId: HARDHAT_CHAIN_ID }), (error: unknown) => error instanceof DrawVerificationError && error.code === "invalid_hash");
    await assert.rejects(verifyDrawTransaction(publicClient, `0x${"ab".repeat(32)}`, { contractAddress: contract.address, expectedChainId: HARDHAT_CHAIN_ID }), (error: unknown) => error instanceof DrawVerificationError && error.code === "pending");
  });
});

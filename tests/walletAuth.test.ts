import { describe, expect, it } from "vitest";
import { verifyMessage } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import type { WalletRow } from "@/supabase/functions/_shared/handlers.ts";
import { walletAuthActivate, walletAuthNonce, type SessionUser, type WalletAuthDeps, type WalletAuthStore } from "@/supabase/functions/_shared/walletAuth.ts";

const NOW = new Date("2026-10-16T08:00:00Z");
const DOMAIN = "botchain-omikuji.vercel.app";
const ORIGIN = "https://botchain-omikuji.vercel.app";
const alice = privateKeyToAccount(generatePrivateKey());
const bob = privateKeyToAccount(generatePrivateKey());

function memory() {
  const nonces = new Map<string, { wallet: string; expiresAt: Date; used: boolean }>();
  const wallets: (WalletRow & { wallet: string })[] = [];
  const walletUsers = new Set<string>();
  const sessions: { sessionId: string; userId: string; wallet: string }[] = [];
  const reassigned: string[] = [];
  const store: WalletAuthStore = {
    async purgeExpiredNonces() {},
    async createNonce({ nonce, wallet, expiresAt }) { nonces.set(nonce, { wallet, expiresAt, used: false }); },
    async consumeNonce(nonce, wallet) {
      const row = nonces.get(nonce);
      if (!row || row.used || row.wallet !== wallet || row.expiresAt < NOW) return false;
      row.used = true;
      return true;
    },
    async findWallet(_chain, wallet) { return wallets.find((w) => w.wallet === wallet) ?? null; },
    async insertWallet({ userId, wallet }) { const row = { id: `w${wallets.length}`, user_id: userId, wallet }; wallets.push(row); return row; },
    async isWalletUser(userId) { return walletUsers.has(userId); },
    async reassignWallet(walletId, to) { const w = wallets.find((row) => row.id === walletId)!; w.user_id = to; reassigned.push(walletId); },
    async activateSession(row) { sessions.push(row); },
    async importDraws() { return 2; },
  };
  let counter = 0;
  const deps: WalletAuthDeps = {
    store,
    verifySignature: (args) => verifyMessage(args),
    newNonce: () => `nonce${String(++counter).padStart(12, "0")}`,
    now: () => NOW,
    appDomain: DOMAIN,
    appOrigin: ORIGIN,
  };
  return { deps, wallets, walletUsers, sessions, reassigned };
}

const userFor = (address: string, overrides: Partial<SessionUser> = {}): SessionUser => ({ id: `user-${address.slice(2, 8)}`, sessionId: `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`, provider: "web3", identityAddress: address, ...overrides });

async function signIn(deps: WalletAuthDeps, signer = alice, overrides: Partial<Parameters<typeof createSiweMessage>[0]> = {}) {
  const issued = await walletAuthNonce({ address: signer.address }, deps);
  const message = createSiweMessage({
    address: signer.address, chainId: 677, domain: DOMAIN, uri: ORIGIN, version: "1",
    nonce: String(issued.body.nonce), issuedAt: NOW, expirationTime: new Date(NOW.getTime() + 5 * 60_000),
    statement: "Sign in to Omikuji. This request costs no gas.", ...overrides,
  });
  return { message, signature: await signer.signMessage({ message }) };
}

describe("wallet-auth", () => {
  it("issues a nonce for BOT Chain and activates a matching wallet session", async () => {
    const { deps, sessions, wallets } = memory();
    const nonce = await walletAuthNonce({ address: alice.address }, deps);
    expect(nonce.body).toMatchObject({ chainId: 677, domain: DOMAIN, uri: ORIGIN });
    const signed = await signIn(deps);
    const user = userFor(alice.address);
    const result = await walletAuthActivate(user, signed, deps);
    expect(result).toMatchObject({ status: 200, body: { wallet: alice.address.toLowerCase(), imported: 2 } });
    expect(sessions).toEqual([{ sessionId: user.sessionId, userId: user.id, wallet: alice.address.toLowerCase() }]);
    expect(wallets).toHaveLength(1);
  });

  it("refuses to activate twice with the same signed message (replay)", async () => {
    const { deps, sessions } = memory();
    const signed = await signIn(deps);
    expect((await walletAuthActivate(userFor(alice.address), signed, deps)).status).toBe(200);
    const replay = await walletAuthActivate(userFor(alice.address), signed, deps);
    expect(replay.body.code).toBe("invalid_nonce");
    expect(sessions).toHaveLength(1);
  });

  it.each([
    ["wrong chain", { chainId: 1 }, "wrong_chain"],
    ["foreign domain", { domain: "evil.example", uri: "https://evil.example" }, "wrong_domain"],
    ["same domain, other scheme", { uri: "http://botchain-omikuji.vercel.app" }, "wrong_domain"],
    ["stale message", { issuedAt: new Date(NOW.getTime() - 11 * 60_000), expirationTime: new Date(NOW.getTime() + 60_000) }, "expired"],
    ["no expiration", { expirationTime: undefined }, "expired"],
    ["unissued nonce", { nonce: "madeupnonce1234567" }, "invalid_nonce"],
  ])("rejects %s", async (_label, overrides, code) => {
    const { deps, sessions } = memory();
    const signed = await signIn(deps, alice, overrides as Partial<Parameters<typeof createSiweMessage>[0]>);
    const result = await walletAuthActivate(userFor(alice.address), signed, deps);
    expect(result.body.code).toBe(code);
    expect(sessions).toHaveLength(0);
  });

  it("rejects a session whose Supabase identity is another wallet or not a wallet", async () => {
    const { deps } = memory();
    const signed = await signIn(deps);
    expect((await walletAuthActivate(userFor(bob.address), signed, deps)).body.code).toBe("wallet_mismatch");
    expect((await walletAuthActivate(userFor(alice.address, { provider: "email" }), signed, deps)).body.code).toBe("not_wallet_session");
  });

  it("rejects a signature from a different key", async () => {
    const { deps } = memory();
    const signed = await signIn(deps);
    const forged = await bob.signMessage({ message: signed.message });
    expect((await walletAuthActivate(userFor(alice.address), { message: signed.message, signature: forged }, deps)).body.code).toBe("bad_signature");
  });

  it("takes over a legacy email-account binding of the same wallet, but never another wallet account's", async () => {
    const { deps, wallets, walletUsers, reassigned } = memory();
    wallets.push({ id: "legacy", user_id: "email-user", wallet: alice.address.toLowerCase() });
    expect((await walletAuthActivate(userFor(alice.address), await signIn(deps), deps)).status).toBe(200);
    expect(reassigned).toEqual(["legacy"]);
    expect(wallets[0].user_id).toBe(userFor(alice.address).id);

    wallets[0].user_id = "other-wallet-user";
    walletUsers.add("other-wallet-user");
    expect((await walletAuthActivate(userFor(alice.address), await signIn(deps), deps)).body.code).toBe("wallet_taken");
  });
});

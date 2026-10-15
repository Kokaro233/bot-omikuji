// Wallet-first sign-in, second half. The browser signs a SIWE (EIP-4361) message
// containing a server-issued nonce, exchanges it for a Supabase session with
// signInWithWeb3, then calls `activate`. Activation is what unlocks private data
// (see has_active_wallet_session in the migration): it enforces what Supabase does
// not — a one-time nonce, chain 677 and an exact domain/URI match.
import { isAddress, type Hex } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { BOTCHAIN_CHAIN_ID } from "./botchain.ts";
import type { HandlerResult, WalletRow } from "./handlers.ts";

export const NONCE_TTL_MS = 5 * 60_000;
export const MAX_MESSAGE_AGE_MS = 10 * 60_000;

export interface WalletAuthStore {
  purgeExpiredNonces(): Promise<void>;
  createNonce(row: { nonce: string; wallet: string; expiresAt: Date }): Promise<void>;
  /** Atomically marks an unused, unexpired nonce for this wallet as used. */
  consumeNonce(nonce: string, wallet: string): Promise<boolean>;
  findWallet(chainId: number, wallet: string): Promise<WalletRow | null>;
  insertWallet(row: { userId: string; wallet: string; chainId: number }): Promise<WalletRow>;
  isWalletUser(userId: string): Promise<boolean>;
  /** Moves a legacy (email-account) wallet binding and its collection to the wallet's own account. */
  reassignWallet(walletId: string, toUserId: string): Promise<void>;
  activateSession(row: { sessionId: string; userId: string; wallet: string }): Promise<void>;
  importDraws(walletId: string): Promise<number>;
}

export interface WalletAuthDeps {
  store: WalletAuthStore;
  verifySignature(args: { address: `0x${string}`; message: string; signature: Hex }): Promise<boolean>;
  newNonce(): string;
  now(): Date;
  /** e.g. "botchain-omikuji.vercel.app" */
  appDomain: string;
  /** e.g. "https://botchain-omikuji.vercel.app" */
  appOrigin: string;
}

/** The parts of the authenticated Supabase user/session that activation relies on. */
export interface SessionUser {
  id: string;
  sessionId: string;
  provider: string | undefined;
  /** Address from the user's web3 identity, as recorded by Supabase Auth. */
  identityAddress: string | undefined;
}

const fail = (status: number, error: string, code: string): HandlerResult => ({ status, body: { error, code } });

export async function walletAuthNonce(body: Record<string, unknown>, deps: WalletAuthDeps): Promise<HandlerResult> {
  const address = String(body.address ?? "");
  if (!isAddress(address, { strict: false })) return fail(400, "Invalid wallet address", "invalid_wallet");
  await deps.store.purgeExpiredNonces();
  const nonce = deps.newNonce();
  const expiresAt = new Date(deps.now().getTime() + NONCE_TTL_MS);
  await deps.store.createNonce({ nonce, wallet: address.toLowerCase(), expiresAt });
  return { status: 200, body: { nonce, expiresAt: expiresAt.toISOString(), chainId: BOTCHAIN_CHAIN_ID, domain: deps.appDomain, uri: deps.appOrigin } };
}

export async function walletAuthActivate(user: SessionUser, body: Record<string, unknown>, deps: WalletAuthDeps): Promise<HandlerResult> {
  const message = typeof body.message === "string" ? body.message : "";
  const signature = typeof body.signature === "string" ? body.signature : "";
  if (!message || !/^0x[0-9a-fA-F]+$/.test(signature)) return fail(400, "Missing message or signature", "invalid_request");
  if (user.provider !== "web3" || !user.identityAddress) return fail(403, "Not a wallet session", "not_wallet_session");

  const siwe = parseSiweMessage(message);
  const now = deps.now().getTime();
  if (!siwe.address || !siwe.nonce || !siwe.issuedAt || !siwe.uri || !siwe.domain) return fail(400, "Malformed sign-in message", "invalid_message");
  if (siwe.chainId !== BOTCHAIN_CHAIN_ID) return fail(400, "Sign-in message must be for BOT Chain Mainnet (677)", "wrong_chain");
  if (siwe.domain !== deps.appDomain || new URL(siwe.uri).origin !== deps.appOrigin) return fail(400, "Sign-in message was issued for another site", "wrong_domain");
  const issued = siwe.issuedAt.getTime();
  if (issued > now + 60_000 || now - issued > MAX_MESSAGE_AGE_MS) return fail(400, "Sign-in message is too old", "expired");
  if (!siwe.expirationTime || siwe.expirationTime.getTime() < now || siwe.expirationTime.getTime() - issued > MAX_MESSAGE_AGE_MS) return fail(400, "Sign-in message has no valid expiration", "expired");

  const wallet = siwe.address.toLowerCase();
  if (user.identityAddress.toLowerCase() !== wallet) return fail(403, "Session belongs to a different wallet", "wallet_mismatch");
  const valid = await deps.verifySignature({ address: siwe.address, message, signature: signature as Hex }).catch(() => false);
  if (!valid) return fail(403, "Signature does not match wallet", "bad_signature");
  if (!(await deps.store.consumeNonce(siwe.nonce, wallet))) return fail(400, "Sign-in request expired or was already used", "invalid_nonce");

  let walletRow = await deps.store.findWallet(BOTCHAIN_CHAIN_ID, wallet);
  if (walletRow && walletRow.user_id !== user.id) {
    // The only other possible owner is a legacy email account that proved ownership of
    // this wallet with its own signature; the wallet's account takes the binding over.
    if (await deps.store.isWalletUser(walletRow.user_id)) return fail(409, "Wallet is bound to another wallet account", "wallet_taken");
    await deps.store.reassignWallet(walletRow.id, user.id);
    walletRow = { ...walletRow, user_id: user.id };
  }
  if (!walletRow) walletRow = await deps.store.insertWallet({ userId: user.id, wallet, chainId: BOTCHAIN_CHAIN_ID });

  await deps.store.activateSession({ sessionId: user.sessionId, userId: user.id, wallet });
  const imported = await deps.store.importDraws(walletRow.id);
  return { status: 200, body: { wallet, imported } };
}

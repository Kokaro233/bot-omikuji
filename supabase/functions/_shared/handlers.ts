// Request logic for the record-draw and wallet-claim Edge Functions, kept free of
// Deno and Supabase specifics so it can be unit-tested in Node.
import { isAddress } from "viem";
import { BOTCHAIN_CHAIN_ID, BOTCHAIN_NAME } from "./botchain.ts";
import { DrawVerificationError, isTxHash, verifyDrawTransaction, type VerifiedDraw } from "./verifyDraw.ts";

export const MAX_TX_PER_REQUEST = 20;

export interface WalletRow { id: string; user_id: string }

export interface DrawStore {
  upsertVerifiedDraws(draws: VerifiedDraw[]): Promise<void>;
  createNonce(row: { userId: string; wallet: string; chainId: number; nonce: string; message: string }): Promise<void>;
  /** Atomically marks an unexpired, unused nonce as used and returns its message. */
  consumeNonce(row: { userId: string; wallet: string; chainId: number; nonce: string }): Promise<{ message: string } | null>;
  findWallet(chainId: number, wallet: string): Promise<WalletRow | null>;
  insertWallet(row: { userId: string; wallet: string; chainId: number }): Promise<WalletRow>;
  upsertAccountFortunes(userId: string, walletId: string, draws: VerifiedDraw[]): Promise<void>;
}

export interface HandlerDeps {
  client: Parameters<typeof verifyDrawTransaction>[0];
  store: DrawStore;
  contractAddress: string | null;
  verifySignature(args: { address: `0x${string}`; message: string; signature: `0x${string}` }): Promise<boolean>;
  newNonce(): string;
  now(): Date;
}

export interface HandlerResult { status: number; body: Record<string, unknown> }
const ok = (body: Record<string, unknown>): HandlerResult => ({ status: 200, body });
const fail = (status: number, error: string, code?: string): HandlerResult => ({ status, body: code ? { error, code } : { error } });

const STATUS_FOR_CODE: Record<string, number> = {
  invalid_hash: 400, wrong_chain: 502, pending: 409, reverted: 422, no_event: 422, wrong_wallet: 403, state_mismatch: 422,
};

/** Clients may omit chainId; when present it must be BOT Chain Mainnet. */
function chainIdFromBody(body: Record<string, unknown>) {
  if (body.chainId === undefined || body.chainId === null) return BOTCHAIN_CHAIN_ID;
  return Number(body.chainId);
}

function walletFromBody(body: Record<string, unknown>) {
  const value = String(body.address ?? "");
  return isAddress(value, { strict: false }) ? (value.toLowerCase() as `0x${string}`) : null;
}

export function walletClaimMessage(userId: string, wallet: string, nonce: string, issuedAt: Date) {
  return [
    "Omikuji — BOT Chain Edition wallet binding",
    `Account: ${userId}`,
    `Wallet: ${wallet}`,
    `Chain ID: ${BOTCHAIN_CHAIN_ID} (${BOTCHAIN_NAME})`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    "This signature only proves wallet ownership. It does not authorize any transaction or token spending.",
  ].join("\n");
}

/** Public endpoint: index a draw into the verified public table. Trusts only the tx hash. */
export async function recordDraw(body: Record<string, unknown>, deps: HandlerDeps): Promise<HandlerResult> {
  if (!deps.contractAddress) return fail(503, "BOT Chain contract is not configured", "not_configured");
  if (chainIdFromBody(body) !== BOTCHAIN_CHAIN_ID) return fail(400, "Only BOT Chain Mainnet (677) transactions are accepted", "wrong_chain");
  const txHash = String(body.txHash ?? "");
  if (!isTxHash(txHash)) return fail(400, "Invalid transaction hash", "invalid_hash");
  try {
    const draws = await verifyDrawTransaction(deps.client, txHash, { contractAddress: deps.contractAddress });
    await deps.store.upsertVerifiedDraws(draws);
    return ok({ recorded: draws.map(serializeDraw) });
  } catch (error) {
    return verificationFailure(error);
  }
}

async function claimTransactions(userId: string, wallet: WalletRow, address: string, hashes: unknown, deps: HandlerDeps) {
  const unique = [...new Set((Array.isArray(hashes) ? hashes : []).map((value) => String(value).toLowerCase()))].slice(0, MAX_TX_PER_REQUEST);
  const claimed: VerifiedDraw[] = [];
  const rejected: { txHash: string; code: string }[] = [];
  for (const txHash of unique) {
    try {
      const draws = await verifyDrawTransaction(deps.client, txHash, { contractAddress: deps.contractAddress!, expectedWallet: address });
      await deps.store.upsertVerifiedDraws(draws);
      await deps.store.upsertAccountFortunes(userId, wallet.id, draws);
      claimed.push(...draws);
    } catch (error) {
      if (!(error instanceof DrawVerificationError)) throw error;
      rejected.push({ txHash, code: error.code });
    }
  }
  return { claimed: claimed.map(serializeDraw), rejected };
}

export async function walletClaim(action: string, userId: string, body: Record<string, unknown>, deps: HandlerDeps): Promise<HandlerResult> {
  if (!deps.contractAddress) return fail(503, "BOT Chain contract is not configured", "not_configured");
  const address = walletFromBody(body);
  const chainId = chainIdFromBody(body);
  if (!address) return fail(400, "Invalid wallet address", "invalid_wallet");
  if (chainId !== BOTCHAIN_CHAIN_ID) return fail(400, "Only BOT Chain Mainnet (677) wallets can be bound", "wrong_chain");

  if (action === "nonce") {
    const nonce = deps.newNonce();
    const message = walletClaimMessage(userId, address, nonce, deps.now());
    await deps.store.createNonce({ userId, wallet: address, chainId, nonce, message });
    return ok({ nonce, message, expiresIn: 600 });
  }

  if (action === "sync") {
    const wallet = await deps.store.findWallet(chainId, address);
    if (!wallet || wallet.user_id !== userId) return fail(403, "Wallet must be bound once before automatic sync", "wallet_binding_required");
    return ok({ wallet, ...(await claimTransactions(userId, wallet, address, body.txHashes, deps)) });
  }

  if (action !== "verify") return fail(404, "Unknown action");
  const signature = String(body.signature ?? "");
  if (!/^0x[0-9a-fA-F]+$/.test(signature)) return fail(400, "Invalid signature", "invalid_signature");
  const nonceRow = await deps.store.consumeNonce({ userId, wallet: address, chainId, nonce: String(body.nonce ?? "") });
  if (!nonceRow) return fail(400, "Nonce is invalid, used or expired", "invalid_nonce");
  const valid = await deps.verifySignature({ address, message: nonceRow.message, signature: signature as `0x${string}` }).catch(() => false);
  if (!valid) return fail(403, "Signature does not match wallet", "bad_signature");

  let wallet = await deps.store.findWallet(chainId, address);
  if (wallet && wallet.user_id !== userId) return fail(409, "Wallet already belongs to another account", "wallet_taken");
  if (!wallet) {
    try {
      wallet = await deps.store.insertWallet({ userId, wallet: address, chainId });
    } catch {
      wallet = await deps.store.findWallet(chainId, address);
      if (!wallet || wallet.user_id !== userId) return fail(409, "Wallet already belongs to another account", "wallet_taken");
    }
  }
  return ok({ wallet, ...(await claimTransactions(userId, wallet, address, body.txHashes, deps)) });
}

function serializeDraw(draw: VerifiedDraw) {
  return { ...draw, blockNumber: draw.blockNumber.toString() };
}

function verificationFailure(error: unknown): HandlerResult {
  if (error instanceof DrawVerificationError) return fail(STATUS_FOR_CODE[error.code] ?? 400, error.message, error.code);
  return fail(502, "Unable to reach BOT Chain RPC", "rpc_error");
}

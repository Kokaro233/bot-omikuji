// Wallet-first sign-in (free message signature, no gas):
//   1. ask wallet-auth for a one-time nonce
//   2. the wallet signs an EIP-4361 (SIWE) message for chain 677 and this site
//   3. Supabase signInWithWeb3 turns the signature into a session
//   4. wallet-auth/activate checks the nonce and unlocks private data for that session
// Connecting a wallet alone never grants access to private data.
import type { Session } from "@supabase/supabase-js";
import { createSiweMessage } from "viem/siwe";
import { BOTCHAIN_CHAIN_ID } from "@/supabase/functions/_shared/botchain.ts";
import { runtime } from "@/src/lib/runtime";
import { getSupabase } from "@/src/lib/supabase";

const SIGN_IN_STATEMENT = "Sign in to Omikuji with this wallet. This is a free signature: it sends no transaction and costs no gas.";
const MESSAGE_LIFETIME_MS = 5 * 60_000;

export class WalletAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function callWalletAuth(action: "nonce" | "activate", body: Record<string, unknown>, accessToken?: string) {
  const response = await fetch(`${runtime.supabaseUrl}/functions/v1/wallet-auth/${action}`, {
    method: "POST",
    headers: { apikey: runtime.supabaseAnonKey, "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new WalletAuthError(String(json.code ?? "auth_failed"), String(json.error ?? "Wallet sign-in failed"));
  return json;
}

/** The wallet a Supabase session was created for, from the Web3 identity Supabase verified. */
export function sessionWallet(session: Session | null): string | null {
  const claims = session?.user?.user_metadata?.custom_claims as { address?: string } | undefined;
  return session?.user?.app_metadata?.provider === "web3" && claims?.address ? claims.address.toLowerCase() : null;
}

export async function signInWithWallet(address: string, signMessage: (message: string) => Promise<string>) {
  const supabase = await getSupabase();
  if (!supabase) throw new WalletAuthError("not_configured", "Accounts are not configured");
  const issued = await callWalletAuth("nonce", { address });
  if (issued.chainId !== BOTCHAIN_CHAIN_ID) throw new WalletAuthError("wrong_chain", "Unexpected chain");
  const issuedAt = new Date();
  const message = createSiweMessage({
    address: address as `0x${string}`,
    chainId: BOTCHAIN_CHAIN_ID,
    domain: window.location.host,
    uri: window.location.origin,
    version: "1",
    nonce: String(issued.nonce),
    issuedAt,
    expirationTime: new Date(issuedAt.getTime() + MESSAGE_LIFETIME_MS),
    statement: SIGN_IN_STATEMENT,
  });
  const signature = await signMessage(message);
  const { data, error } = await supabase.auth.signInWithWeb3({ chain: "ethereum", message, signature: signature as `0x${string}` });
  if (error || !data.session) throw new WalletAuthError("supabase_rejected", error?.message ?? "Sign-in was rejected");
  try {
    await callWalletAuth("activate", { message, signature }, data.session.access_token);
  } catch (cause) {
    await supabase.auth.signOut({ scope: "local" });
    throw cause;
  }
  return data.session;
}

export async function signOutWallet() {
  const supabase = await getSupabase();
  if (!supabase) return;
  // Deleting the server session also revokes private-data access for its tokens.
  await supabase.auth.signOut();
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { BOTCHAIN_CHAIN_ID } from "@/supabase/functions/_shared/botchain.ts";
import { cloudEnabled, runtime } from "@/src/lib/runtime";
import type { DrawResult } from "@/src/types";

let clientPromise: Promise<SupabaseClient | null> | null = null;

/**
 * Supabase is loaded on demand (about a fifth of the old entry bundle), after the
 * shrine has rendered. Resolves to null when accounts are not configured.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!cloudEnabled) return Promise.resolve(null);
  clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(runtime.supabaseUrl, runtime.supabaseAnonKey, {
      auth: { persistSession: true, detectSessionInUrl: false, storageKey: "botchain-omikuji:auth" },
    }));
  return clientPromise;
}

interface CloudFortuneRow {
  id: string;
  fortune_id: number;
  tx_hash: string;
  block_number: string | number;
  chain_id: number;
  contract_address: string;
  record_index: number;
  favorite: boolean;
  created_at: string;
  wallets: { wallet_address: string } | { wallet_address: string }[] | null;
}

/**
 * Private account data for the signed-in wallet. Returns null when there is no session
 * or the session was never activated (RLS then hides the profile row).
 */
export async function loadCloudAccount() {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const user = session.user;
  const [profileResponse, fortuneResponse] = await Promise.all([
    supabase.from("profiles").select("username,avatar").eq("id", user.id).maybeSingle(),
    supabase.from("fortunes").select("id,fortune_id,tx_hash,block_number,chain_id,contract_address,record_index,favorite,created_at,wallets(wallet_address)").eq("user_id", user.id).eq("chain_id", BOTCHAIN_CHAIN_ID).order("created_at", { ascending: false }),
  ]);
  if (profileResponse.error) throw profileResponse.error;
  if (fortuneResponse.error) throw fortuneResponse.error;
  if (!profileResponse.data) return null;

  const fortunes = ((fortuneResponse.data ?? []) as CloudFortuneRow[]).map<DrawResult>((row) => {
    const wallet = Array.isArray(row.wallets) ? row.wallets[0] : row.wallets;
    return {
      id: row.id,
      fortuneId: row.fortune_id,
      walletAddress: wallet?.wallet_address ?? "",
      txHash: row.tx_hash,
      blockNumber: String(row.block_number),
      createdAt: row.created_at,
      chainId: row.chain_id,
      recordIndex: row.record_index,
      contractAddress: row.contract_address,
      claimed: true,
      favorite: row.favorite,
      mode: "live",
    };
  });
  return { user, profile: profileResponse.data, fortunes };
}

export async function updateCloudProfile(username: string, avatar = "🌸") {
  const supabase = await getSupabase();
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("not_signed_in");
  const { error } = await supabase.from("profiles").update({ username: username.trim(), avatar }).eq("id", session.user.id);
  if (error) throw error;
}

export async function updateCloudFavorite(id: string, favorite: boolean) {
  const supabase = await getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("fortunes").update({ favorite }).eq("id", id);
  if (error) throw error;
}

/** Asks the backend to index a draw. The backend re-verifies everything on BOT Chain; only the hash is sent. */
export async function recordPublicVerifiedDraw(txHash: string) {
  if (!cloudEnabled) return false;
  const response = await fetch(`${runtime.supabaseUrl}/functions/v1/record-draw`, {
    method: "POST",
    headers: { apikey: runtime.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ txHash, chainId: BOTCHAIN_CHAIN_ID }),
  });
  return response.ok;
}

/** Off-chain guest trial counter; the server rate-limits per client. */
export async function recordPublicGuestDraw(result: DrawResult) {
  if (result.mode !== "demo" || !result.id.startsWith("guest-")) return false;
  const supabase = await getSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("record_guest_draw", { p_local_id: result.id, p_fortune_id: result.fortuneId });
  return !error && data === true;
}

export async function getCurrentSession() {
  const supabase = await getSupabase();
  return supabase ? (await supabase.auth.getSession()).data.session : null;
}

export async function readGuestDrawCount() {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_guest_fortune_count");
  return error ? null : Number(data ?? 0);
}

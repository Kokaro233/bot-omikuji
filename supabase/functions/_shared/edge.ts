// Deno / Supabase wiring shared by the Edge Functions.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createPublicClient, http } from "viem";
import { BOTCHAIN_RPC_URL, createBotChain, parseContractAddress } from "./botchain.ts";
import type { DrawStore, HandlerDeps, HandlerResult } from "./handlers.ts";
import { FORTUNE_CATALOG } from "./fortuneCatalog.ts";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
export const cors = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

export const json = ({ status, body }: HandlerResult) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

function supabaseStore(db: SupabaseClient): DrawStore {
  return {
    async upsertVerifiedDraws(draws) {
      if (!draws.length) return;
      const { error } = await db.from("verified_fortune_draws").upsert(draws.map((draw) => ({
        chain_id: draw.chainId,
        contract_address: draw.contractAddress.toLowerCase(),
        wallet_address: draw.wallet.toLowerCase(),
        record_index: draw.recordIndex,
        fortune_id: draw.fortuneId,
        tx_hash: draw.txHash,
        log_index: draw.logIndex,
        block_number: draw.blockNumber.toString(),
        created_at: new Date(draw.timestamp * 1000).toISOString(),
      })), { onConflict: "chain_id,tx_hash,log_index", ignoreDuplicates: true });
      if (error) throw error;
    },
    async createNonce({ userId, wallet, chainId, nonce, message }) {
      const { error } = await db.from("wallet_nonces").insert({ user_id: userId, wallet_address: wallet, chain_id: chainId, nonce, message });
      if (error) throw error;
    },
    async consumeNonce({ userId, wallet, chainId, nonce }) {
      if (!/^[0-9a-f-]{36}$/i.test(nonce)) return null;
      const { data, error } = await db.from("wallet_nonces")
        .update({ used_at: new Date().toISOString() })
        .eq("user_id", userId).eq("wallet_address", wallet).eq("chain_id", chainId).eq("nonce", nonce)
        .is("used_at", null).gt("expires_at", new Date().toISOString())
        .select("message").maybeSingle();
      if (error) throw error;
      return data;
    },
    async findWallet(chainId, wallet) {
      const { data, error } = await db.from("wallets").select("id,user_id").eq("chain_id", chainId).eq("wallet_address", wallet).maybeSingle();
      if (error) throw error;
      return data;
    },
    async insertWallet({ userId, wallet, chainId }) {
      const { data, error } = await db.from("wallets").insert({ user_id: userId, wallet_address: wallet, chain_id: chainId }).select("id,user_id").single();
      if (error) throw error;
      return data;
    },
    async upsertAccountFortunes(userId, walletId, draws) {
      if (!draws.length) return;
      const { error } = await db.from("fortunes").upsert(draws.map((draw) => {
        const [fortuneType, rarity, message] = FORTUNE_CATALOG[draw.fortuneId];
        return {
          user_id: userId,
          wallet_id: walletId,
          chain_id: draw.chainId,
          contract_address: draw.contractAddress.toLowerCase(),
          record_index: draw.recordIndex,
          fortune_id: draw.fortuneId,
          fortune_type: fortuneType,
          rarity,
          message,
          tx_hash: draw.txHash,
          log_index: draw.logIndex,
          block_number: draw.blockNumber.toString(),
          created_at: new Date(draw.timestamp * 1000).toISOString(),
        };
      }), { onConflict: "chain_id,tx_hash,log_index", ignoreDuplicates: true });
      if (error) throw error;
    },
  };
}

export function createDeps(db: SupabaseClient): HandlerDeps {
  const client = createPublicClient({ chain: createBotChain(Deno.env.get("BOTCHAIN_RPC_URL") ?? BOTCHAIN_RPC_URL), transport: http(Deno.env.get("BOTCHAIN_RPC_URL") ?? BOTCHAIN_RPC_URL) });
  return {
    client,
    store: supabaseStore(db),
    contractAddress: parseContractAddress(Deno.env.get("CONTRACT_ADDRESS")),
    // Supports EOAs and ERC-1271 / ERC-6492 smart-contract wallets via eth_call on BOT Chain.
    verifySignature: (args) => client.verifyMessage(args),
    newNonce: () => crypto.randomUUID(),
    now: () => new Date(),
  };
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

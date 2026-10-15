// Wallet-first sign-in.
//   POST /wallet-auth/nonce     { address }                 → one-time SIWE nonce (5 min)
//   POST /wallet-auth/activate  { message, signature }      (Authorization: wallet session JWT)
import { createPublicClient, http } from "viem";
import { BOTCHAIN_RPC_URL, createBotChain } from "../_shared/botchain.ts";
import { cors, json, readJsonBody, serviceClient } from "../_shared/edge.ts";
import { walletAuthActivate, walletAuthNonce, type WalletAuthDeps, type WalletAuthStore } from "../_shared/walletAuth.ts";

const appOrigin = Deno.env.get("APP_ORIGIN") ?? "https://botchain-omikuji.vercel.app";

function deps(): WalletAuthDeps {
  const db = serviceClient();
  const rpc = Deno.env.get("BOTCHAIN_RPC_URL") ?? BOTCHAIN_RPC_URL;
  const client = createPublicClient({ chain: createBotChain(rpc), transport: http(rpc) });
  const store: WalletAuthStore = {
    async purgeExpiredNonces() {
      await db.from("wallet_auth_nonces").delete().lt("expires_at", new Date(Date.now() - 3_600_000).toISOString());
    },
    async createNonce({ nonce, wallet, expiresAt }) {
      const { error } = await db.from("wallet_auth_nonces").insert({ nonce, wallet_address: wallet, expires_at: expiresAt.toISOString() });
      if (error) throw error;
    },
    async consumeNonce(nonce, wallet) {
      const { data, error } = await db.from("wallet_auth_nonces").update({ used_at: new Date().toISOString() })
        .eq("nonce", nonce).eq("wallet_address", wallet).is("used_at", null).gt("expires_at", new Date().toISOString())
        .select("nonce").maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async findWallet(chainId, wallet) {
      const { data, error } = await db.from("wallets").select("id,user_id").eq("chain_id", chainId).eq("wallet_address", wallet).maybeSingle();
      if (error) throw error;
      return data;
    },
    async insertWallet({ userId, wallet, chainId }) {
      const { data, error } = await db.from("wallets").insert({ user_id: userId, wallet_address: wallet, chain_id: chainId, is_primary: true }).select("id,user_id").single();
      if (error) throw error;
      return data;
    },
    async isWalletUser(userId) {
      const { data, error } = await db.auth.admin.getUserById(userId);
      if (error) throw error;
      return data.user?.app_metadata?.provider === "web3";
    },
    async reassignWallet(walletId, toUserId) {
      const moved = await db.from("fortunes").update({ user_id: toUserId }).eq("wallet_id", walletId);
      if (moved.error) throw moved.error;
      const { error } = await db.from("wallets").update({ user_id: toUserId }).eq("id", walletId);
      if (error) throw error;
    },
    async activateSession({ sessionId, userId, wallet }) {
      const { error } = await db.from("wallet_sessions").upsert({ session_id: sessionId, user_id: userId, wallet_address: wallet });
      if (error) throw error;
    },
    async importDraws(walletId) {
      const { data, error } = await db.rpc("import_wallet_draws", { p_wallet_id: walletId });
      if (error) throw error;
      return Number(data ?? 0);
    },
  };
  return {
    store,
    verifySignature: (args) => client.verifyMessage(args),
    newNonce: () => crypto.randomUUID().replaceAll("-", ""),
    now: () => new Date(),
    appDomain: new URL(appOrigin).host,
    appOrigin,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ status: 405, body: { error: "Method not allowed" } });
  const action = new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
  try {
    if (action === "nonce") return json(await walletAuthNonce(await readJsonBody(request), deps()));
    if (action !== "activate") return json({ status: 404, body: { error: "Unknown action" } });

    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const db = serviceClient();
    const { data: { user }, error } = await db.auth.getUser(token);
    if (error || !user) return json({ status: 401, body: { error: "Authentication required" } });
    // getUser validated the token, so its payload can be read for the session id.
    const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const web3 = user.identities?.find((identity) => identity.provider === "web3");
    const identityAddress = (web3?.identity_data?.custom_claims as { address?: string } | undefined)?.address;
    return json(await walletAuthActivate({ id: user.id, sessionId: String(claims.session_id ?? ""), provider: user.app_metadata?.provider, identityAddress }, await readJsonBody(request), deps()));
  } catch (cause) {
    console.error("wallet-auth failed", cause);
    return json({ status: 500, body: { error: "Wallet sign-in failed" } });
  }
});

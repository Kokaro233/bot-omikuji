// Authenticated wallet binding (nonce + signature) and verified draw claiming.
//   POST /wallet-claim/nonce   { address, chainId? }
//   POST /wallet-claim/verify  { address, chainId?, nonce, signature, txHashes? }
//   POST /wallet-claim/sync    { address, chainId?, txHashes }
import { cors, createDeps, json, readJsonBody, serviceClient } from "../_shared/edge.ts";
import { walletClaim } from "../_shared/handlers.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ status: 405, body: { error: "Method not allowed" } });
  const db = serviceClient();
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return json({ status: 401, body: { error: "Authentication required" } });
  const action = new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
  try {
    return json(await walletClaim(action, user.id, await readJsonBody(request), createDeps(db)));
  } catch (cause) {
    console.error("wallet-claim failed", cause);
    return json({ status: 500, body: { error: "Wallet claim failed" } });
  }
});

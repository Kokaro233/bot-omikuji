// Public indexer: verifies a BOT Chain drawFortune transaction and stores it in
// verified_fortune_draws. Only the tx hash is taken from the client.
import { cors, createDeps, json, readJsonBody, serviceClient } from "../_shared/edge.ts";
import { recordDraw } from "../_shared/handlers.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ status: 405, body: { error: "Method not allowed" } });
  return json(await recordDraw(await readJsonBody(request), createDeps(serviceClient())));
});

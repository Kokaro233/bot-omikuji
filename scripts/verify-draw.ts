// Verifies drawFortune transactions on BOT Chain Mainnet with the same code the
// Supabase Edge Functions run. Useful for launch acceptance evidence.
//   CONTRACT_ADDRESS=0x... node scripts/verify-draw.ts <txHash> [<txHash> ...]
import { createPublicClient, http } from "viem";
import { BOTCHAIN_RPC_URL, botChainMainnet, explorerTxUrl, parseContractAddress } from "../supabase/functions/_shared/botchain.ts";
import { DrawVerificationError, verifyDrawTransaction } from "../supabase/functions/_shared/verifyDraw.ts";

const contractAddress = parseContractAddress(process.env.CONTRACT_ADDRESS);
if (!contractAddress) throw new Error("Set CONTRACT_ADDRESS to the BOT Chain FortuneContract address.");
const hashes = process.argv.slice(2);
if (!hashes.length) throw new Error("Pass at least one transaction hash.");

const client = createPublicClient({ chain: botChainMainnet, transport: http(process.env.BOTCHAIN_RPC_URL ?? BOTCHAIN_RPC_URL) });
for (const hash of hashes) {
  try {
    const draws = await verifyDrawTransaction(client, hash, { contractAddress });
    for (const draw of draws) {
      console.log(JSON.stringify({ ok: true, ...draw, blockNumber: draw.blockNumber.toString(), explorer: explorerTxUrl(draw.txHash) }));
    }
  } catch (error) {
    const code = error instanceof DrawVerificationError ? error.code : "rpc_error";
    console.log(JSON.stringify({ ok: false, txHash: hash, code, message: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  }
}

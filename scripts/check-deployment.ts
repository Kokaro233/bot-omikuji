// Read-only check of a deployed FortuneContract on BOT Chain Mainnet. Sends no transactions.
//   node scripts/check-deployment.ts                 (reads deployments/botchain-mainnet.json)
//   CONTRACT_ADDRESS=0x... node scripts/check-deployment.ts
import { readFile } from "node:fs/promises";
import { createPublicClient, http } from "viem";
import { BOTCHAIN_CHAIN_ID, BOTCHAIN_RPC_URL, botChainMainnet, explorerAddressUrl, fortuneContractAbi, parseContractAddress } from "../supabase/functions/_shared/botchain.ts";

type DeploymentRecord = { contractAddress: string; transactionHash?: string };

async function loadRecord(): Promise<DeploymentRecord | null> {
  try {
    return JSON.parse(await readFile(new URL("../deployments/botchain-mainnet.json", import.meta.url), "utf8"));
  } catch {
    return null;
  }
}

const record = await loadRecord();
const address = parseContractAddress(process.env.CONTRACT_ADDRESS ?? record?.contractAddress);
if (!address) throw new Error("No valid BOT Chain contract address (set CONTRACT_ADDRESS or deploy first).");

const client = createPublicClient({ chain: botChainMainnet, transport: http(process.env.BOTCHAIN_RPC_URL ?? BOTCHAIN_RPC_URL) });
const checks: Record<string, string | boolean> = {};

const chainId = await client.getChainId();
checks.chainId = chainId === BOTCHAIN_CHAIN_ID ? `ok (${chainId})` : `FAIL (${chainId})`;
const code = await client.getCode({ address });
checks.bytecode = code && code !== "0x" ? `ok (${(code.length - 2) / 2} bytes)` : "FAIL (no code)";

if (record?.transactionHash && (!process.env.CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS.toLowerCase() === record.contractAddress.toLowerCase())) {
  const receipt = await client.getTransactionReceipt({ hash: record.transactionHash as `0x${string}` });
  checks.deploymentTx = receipt.status === "success" && receipt.contractAddress?.toLowerCase() === address.toLowerCase()
    ? `ok (block ${receipt.blockNumber})`
    : "FAIL (receipt does not create this contract)";
}

if (!code || code === "0x") {
  console.log(JSON.stringify({ contractAddress: address, explorer: explorerAddressUrl(address), checks }, null, 2));
  process.exit(1);
}

const read = <F extends "MAX_DAILY_DRAWS" | "FORTUNE_COUNT" | "totalDraws">(functionName: F) =>
  client.readContract({ address, abi: fortuneContractAbi, functionName });
const [maxDaily, fortuneCount, totalDraws] = await Promise.all([read("MAX_DAILY_DRAWS"), read("FORTUNE_COUNT"), read("totalDraws")]);
checks.maxDailyDraws = maxDaily === 10n ? "ok (10)" : `FAIL (${maxDaily})`;
checks.fortuneCount = fortuneCount === 7n ? "ok (7)" : `FAIL (${fortuneCount})`;
checks.totalDraws = totalDraws.toString();

console.log(JSON.stringify({ contractAddress: address, explorer: explorerAddressUrl(address), checks }, null, 2));
if (Object.values(checks).some((value) => typeof value === "string" && value.startsWith("FAIL"))) process.exitCode = 1;

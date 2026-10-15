// Verifies a FortuneContract deployment transaction on BOT Chain Mainnet against the
// local production artifact and writes deployments/botchain-mainnet.json. Read-only.
//   node scripts/record-deployment.ts <deploymentTxHash> [expectedDeployer]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createPublicClient, http } from "viem";
import { BOTCHAIN_CHAIN_ID, BOTCHAIN_RPC_URL, botChainMainnet, explorerAddressUrl, explorerTxUrl, fortuneContractAbi } from "../supabase/functions/_shared/botchain.ts";

const [hash, expectedDeployer] = process.argv.slice(2);
if (!/^0x[0-9a-fA-F]{64}$/.test(hash ?? "")) throw new Error("Usage: node scripts/record-deployment.ts <deploymentTxHash> [expectedDeployer]");

const artifact = JSON.parse(await readFile(new URL("../artifacts/contracts/FortuneContract.sol/FortuneContract.json", import.meta.url), "utf8"));
const rpcUrl = process.env.BOTCHAIN_RPC_URL ?? BOTCHAIN_RPC_URL;
// Only the official BOT Chain RPC may produce the mainnet record; any other RPC (e.g. a local rehearsal) writes rehearsal.json.
const isMainnetRpc = new URL(rpcUrl).hostname === new URL(BOTCHAIN_RPC_URL).hostname;
const client = createPublicClient({ chain: botChainMainnet, transport: http(rpcUrl) });

const chainId = await client.getChainId();
if (chainId !== BOTCHAIN_CHAIN_ID) throw new Error(`RPC reports chain ${chainId}, expected ${BOTCHAIN_CHAIN_ID}`);
const [tx, receipt] = await Promise.all([client.getTransaction({ hash: hash as `0x${string}` }), client.getTransactionReceipt({ hash: hash as `0x${string}` })]);
if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("Transaction is not a successful contract creation.");
if (expectedDeployer && tx.from.toLowerCase() !== expectedDeployer.toLowerCase()) throw new Error(`Deployer ${tx.from} does not match ${expectedDeployer}`);
if (tx.input.toLowerCase() !== artifact.bytecode.toLowerCase()) throw new Error("Creation bytecode differs from the local production artifact.");

const address = receipt.contractAddress;
const code = await client.getCode({ address });
if (code?.toLowerCase() !== artifact.deployedBytecode.toLowerCase()) throw new Error("Runtime bytecode differs from the local production artifact.");
const read = (functionName: "MAX_DAILY_DRAWS" | "FORTUNE_COUNT" | "totalDraws") => client.readContract({ address, abi: fortuneContractAbi, functionName });
const [maxDaily, fortuneCount, totalDraws] = await Promise.all([read("MAX_DAILY_DRAWS"), read("FORTUNE_COUNT"), read("totalDraws")]);
if (maxDaily !== 10n || fortuneCount !== 7n) throw new Error("Unexpected contract constants.");
const block = await client.getBlock({ blockNumber: receipt.blockNumber });

const record = {
  network: isMainnetRpc ? "BOT Chain Mainnet" : `rehearsal (${rpcUrl})`,
  chainId,
  contract: "FortuneContract",
  contractAddress: address,
  deployer: tx.from,
  transactionHash: receipt.transactionHash,
  blockNumber: receipt.blockNumber.toString(),
  gasUsed: receipt.gasUsed.toString(),
  effectiveGasPrice: receipt.effectiveGasPrice.toString(),
  solcBuild: artifact.buildInfoId,
  buildProfile: "production",
  deployMethod: "browser wallet (MetaMask) via scripts/metamask-deploy.ts",
  dailyDrawLimit: 10,
  totalDrawsAtRecord: totalDraws.toString(),
  deployedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
  explorer: { contract: explorerAddressUrl(address), transaction: explorerTxUrl(receipt.transactionHash) },
};
await mkdir(new URL("../deployments/", import.meta.url), { recursive: true });
const outFile = new URL(`../deployments/${isMainnetRpc ? "botchain-mainnet" : "rehearsal"}.json`, import.meta.url);
await writeFile(outFile, `${JSON.stringify(record, null, 2)}\n`);
console.log(`Saved ${outFile.pathname}`);
console.log(JSON.stringify(record, null, 2));
console.log(`\nVITE_CONTRACT_ADDRESS=${address}\nVITE_CONTRACT_DEPLOY_BLOCK=${receipt.blockNumber}\nCONTRACT_ADDRESS=${address}`);

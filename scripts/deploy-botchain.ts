// Deploys FortuneContract and records the deployment.
//
//   Dry run (no transaction):
//     npx hardhat run scripts/deploy-botchain.ts --network botchainMainnet --build-profile production
//   Real mainnet deployment (spends BOT):
//     CONFIRM_MAINNET_DEPLOY=deploy-fortune-contract-to-botchain-677 \
//     npx hardhat run scripts/deploy-botchain.ts --network botchainMainnet --build-profile production
//
// The deployer key is read by Hardhat from its encrypted keystore or the
// BOTCHAIN_DEPLOYER_PRIVATE_KEY environment variable; this script never prints it.
import hre, { network } from "hardhat";
import { mkdir, writeFile } from "node:fs/promises";
import { formatEther, formatGwei } from "viem";
import { BOTCHAIN_CHAIN_ID, explorerAddressUrl, explorerTxUrl } from "../supabase/functions/_shared/botchain.ts";

const CONFIRM_PHRASE = "deploy-fortune-contract-to-botchain-677";
const MIN_CONFIRMATIONS = 3;

const connection = await network.create();
const { viem, networkName } = connection;
const isMainnet = networkName === "botchainMainnet";
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
if (!deployer) throw new Error("No deployer account configured for this network.");

const chainId = await publicClient.getChainId();
if (isMainnet && chainId !== BOTCHAIN_CHAIN_ID) throw new Error(`RPC reports chain ${chainId}; refusing to deploy (expected ${BOTCHAIN_CHAIN_ID}).`);
if (isMainnet && hre.globalOptions.buildProfile !== "production") throw new Error("Mainnet deployments must use --build-profile production (optimizer on, reproducible for verification).");

const artifact = await hre.artifacts.readArtifact("FortuneContract");
const [balance, gasPrice, gasEstimate] = await Promise.all([
  publicClient.getBalance({ address: deployer.account.address }),
  publicClient.getGasPrice(),
  publicClient.estimateGas({ account: deployer.account.address, data: artifact.bytecode as `0x${string}` }),
]);
const estimatedCost = gasEstimate * gasPrice;

console.log(JSON.stringify({
  network: networkName,
  chainId,
  buildProfile: hre.globalOptions.buildProfile,
  deployer: deployer.account.address,
  balance: `${formatEther(balance)} BOT`,
  gasEstimate: gasEstimate.toString(),
  gasPrice: `${formatGwei(gasPrice)} gwei`,
  estimatedCost: `${formatEther(estimatedCost)} BOT`,
}, null, 2));

if (balance < (estimatedCost * 12n) / 10n) throw new Error("Deployer balance is below the estimated cost plus a 20% margin.");
if (isMainnet && process.env.CONFIRM_MAINNET_DEPLOY !== CONFIRM_PHRASE) {
  console.log(`\nDry run only. No transaction was sent.\nTo deploy, re-run with CONFIRM_MAINNET_DEPLOY=${CONFIRM_PHRASE}`);
  process.exit(0);
}

const { contract, deploymentTransaction } = await viem.sendDeploymentTransaction("FortuneContract");
console.log(`Deployment transaction sent: ${deploymentTransaction.hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash: deploymentTransaction.hash, confirmations: isMainnet ? MIN_CONFIRMATIONS : 1 });
if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`Deployment reverted: ${deploymentTransaction.hash}`);
if (receipt.contractAddress.toLowerCase() !== contract.address.toLowerCase()) throw new Error("Receipt contract address does not match the predicted address.");

// Post-deployment checks against live chain state.
const code = await publicClient.getCode({ address: contract.address });
if (!code || code.toLowerCase() !== artifact.deployedBytecode.toLowerCase()) throw new Error("On-chain runtime bytecode does not match the compiled artifact.");
const [maxDaily, totalDraws, sampleFortune] = await Promise.all([
  contract.read.MAX_DAILY_DRAWS(),
  contract.read.totalDraws(),
  contract.read.previewFortuneForRoll([0n]),
]);
if (maxDaily !== 10n || totalDraws !== 0n || sampleFortune !== 0n) throw new Error("Deployed contract returned unexpected constants.");

const record = {
  network: isMainnet ? "BOT Chain Mainnet" : networkName,
  chainId,
  contract: "FortuneContract",
  contractAddress: contract.address,
  deployer: deployer.account.address,
  transactionHash: deploymentTransaction.hash,
  blockNumber: receipt.blockNumber.toString(),
  gasUsed: receipt.gasUsed.toString(),
  effectiveGasPrice: receipt.effectiveGasPrice.toString(),
  solcBuild: artifact.buildInfoId,
  buildProfile: hre.globalOptions.buildProfile,
  dailyDrawLimit: 10,
  deployedAt: new Date().toISOString(),
  explorer: {
    contract: isMainnet ? explorerAddressUrl(contract.address) : null,
    transaction: isMainnet ? explorerTxUrl(deploymentTransaction.hash) : null,
  },
};
await mkdir(new URL("../deployments/", import.meta.url), { recursive: true });
const outFile = new URL(`../deployments/${isMainnet ? "botchain-mainnet" : networkName}.json`, import.meta.url);
await writeFile(outFile, `${JSON.stringify(record, null, 2)}\n`);

console.log(JSON.stringify(record, null, 2));
console.log(`\nSaved ${outFile.pathname}\nSet these values in Vercel and Supabase:\n  VITE_CONTRACT_ADDRESS=${contract.address}\n  VITE_CONTRACT_DEPLOY_BLOCK=${receipt.blockNumber}\n  CONTRACT_ADDRESS=${contract.address}`);

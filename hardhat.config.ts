import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

const BOTCHAIN_CHAIN_ID = 677;

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: { version: "0.8.28" },
      production: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 200 } } },
    },
  },
  networks: {
    hardhatMainnet: { type: "edr-simulated", chainType: "l1" },
    // Local JSON-RPC node (`npx hardhat node`) for end-to-end runs of the frontend and scripts.
    localhost: { type: "http", chainType: "l1", url: "http://127.0.0.1:8545" },
    botchainMainnet: {
      type: "http",
      chainType: "l1",
      chainId: BOTCHAIN_CHAIN_ID,
      url: process.env.BOTCHAIN_RPC_URL ?? "https://rpc.botchain.ai",
      // Resolved only when this network is used: from the encrypted Hardhat keystore
      // (`npx hardhat keystore set BOTCHAIN_DEPLOYER_PRIVATE_KEY`) or the environment.
      accounts: [configVariable("BOTCHAIN_DEPLOYER_PRIVATE_KEY")],
    },
  },
  chainDescriptors: {
    [BOTCHAIN_CHAIN_ID]: {
      name: "BOT Chain Mainnet",
      chainType: "l1",
      blockExplorers: {
        blockscout: { name: "BOT Chain Scan", url: "https://scan.botchain.ai", apiUrl: "https://scan.botchain.ai/api" },
      },
    },
  },
  verify: {
    blockscout: { enabled: true },
    etherscan: { enabled: false },
    sourcify: { enabled: false },
  },
});

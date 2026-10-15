import { BOTCHAIN_EXPLORER_URL, BOTCHAIN_RPC_URL, parseContractAddress } from "@/supabase/functions/_shared/botchain.ts";
import type { RuntimeMode } from "@/src/types";

const env = import.meta.env;
const contractAddress = parseContractAddress(env.VITE_CONTRACT_ADDRESS);
const deployBlockValue = env.VITE_CONTRACT_DEPLOY_BLOCK?.trim() ?? "";
const deployBlock = /^\d+$/.test(deployBlockValue) ? BigInt(deployBlockValue) : null;

export const runtime = {
  supabaseUrl: env.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY ?? "",
  /** BOT Chain FortuneContract. Null until configured — there is deliberately no fallback address. */
  contractAddress,
  /** Block the contract was deployed in; bounds the optional log scan used to recover tx hashes. */
  contractDeployBlock: deployBlock,
  rpcUrl: env.VITE_BOTCHAIN_RPC_URL || BOTCHAIN_RPC_URL,
  explorerUrl: env.VITE_BOTCHAIN_EXPLORER_URL || BOTCHAIN_EXPLORER_URL,
  walletConnectProjectId: env.VITE_WALLETCONNECT_PROJECT_ID ?? "",
  forceDemo: env.VITE_DEMO_MODE === "true",
  googleAuth: env.VITE_ENABLE_GOOGLE_AUTH === "true",
};

/** Real BOT Chain draws are possible: a contract is configured and demo mode is off. */
export const chainEnabled = Boolean(runtime.contractAddress) && !runtime.forceDemo;
/** Accounts, wallet binding and cloud favorites. Independent of chain draws. */
export const cloudEnabled = Boolean(runtime.supabaseUrl && runtime.supabaseAnonKey) && !runtime.forceDemo;

/**
 * live:          real BOT Chain draws
 * unconfigured:  no BOT Chain contract yet — only off-chain guest trials, clearly labelled
 * demo:          explicit VITE_DEMO_MODE=true; nothing touches the chain or the cloud
 */
export const runtimeMode: RuntimeMode = runtime.forceDemo ? "demo" : chainEnabled ? "live" : "unconfigured";

export const shortAddress = (address?: string) =>
  address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—";

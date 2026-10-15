import { createBotChain } from "@/supabase/functions/_shared/botchain.ts";
import { runtime } from "@/src/lib/runtime";

export const botChain = createBotChain(runtime.rpcUrl, runtime.explorerUrl);

export const explorerTx = (hash: string) => `${runtime.explorerUrl}/tx/${hash}`;
export const explorerAddress = (address: string) => `${runtime.explorerUrl}/address/${address}`;

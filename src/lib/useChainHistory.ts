import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { getAbiItem } from "viem";
import { fortuneContractAbi } from "@/supabase/functions/_shared/botchain.ts";
import { botChain } from "@/src/config/chain";
import type { ChainRecord } from "@/src/lib/history";
import { chainEnabled, runtime } from "@/src/lib/runtime";

const PAGE_SIZE = 50n;
const LOG_CHUNK = 500_000n;
const fortuneDrawnEvent = getAbiItem({ abi: fortuneContractAbi, name: "FortuneDrawn" });

export type ChainHistoryStatus = "disabled" | "idle" | "loading" | "ready" | "error";

/**
 * Reads a wallet's full fortune history directly from FortuneContract storage
 * (getRecordCount + getFortunes). Transaction hashes are then filled in from
 * FortuneDrawn logs when the RPC allows it; history never depends on that step.
 */
export function useChainHistory(address: `0x${string}` | undefined) {
  const publicClient = usePublicClient({ chainId: botChain.id });
  const [records, setRecords] = useState<ChainRecord[]>([]);
  const [status, setStatus] = useState<ChainHistoryStatus>(chainEnabled ? "idle" : "disabled");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    if (!chainEnabled || !runtime.contractAddress || !publicClient) return;
    if (!address) {
      setRecords([]);
      setLoadedFor(null);
      setStatus("idle");
      return;
    }
    const contract = runtime.contractAddress;
    const client = publicClient;
    let cancelled = false;
    setStatus("loading");

    (async () => {
      const count = await client.readContract({ address: contract, abi: fortuneContractAbi, functionName: "getRecordCount", args: [address] });
      const next: ChainRecord[] = [];
      for (let offset = 0n; offset < count; offset += PAGE_SIZE) {
        const page = await client.readContract({ address: contract, abi: fortuneContractAbi, functionName: "getFortunes", args: [address, offset, PAGE_SIZE] });
        page.forEach((record, i) => next.push({
          wallet: address.toLowerCase(),
          recordIndex: Number(offset) + i,
          fortuneId: Number(record.fortuneId),
          timestamp: Number(record.timestamp),
        }));
      }
      if (cancelled) return;
      setRecords(next);
      setLoadedFor(address.toLowerCase());
      setStatus("ready");

      // Optional enrichment: recover tx hashes for records first seen on this device.
      if (!next.length || runtime.contractDeployBlock === null) return;
      try {
        const latest = await client.getBlockNumber();
        const hashes = new Map<number, { txHash: string; blockNumber: string }>();
        for (let from = runtime.contractDeployBlock; from <= latest && hashes.size < next.length; from += LOG_CHUNK) {
          const to = from + LOG_CHUNK - 1n < latest ? from + LOG_CHUNK - 1n : latest;
          const logs = await client.getLogs({ address: contract, event: fortuneDrawnEvent, args: { user: address }, fromBlock: from, toBlock: to });
          for (const log of logs) {
            if (log.args.recordIndex === undefined || !log.transactionHash) continue;
            hashes.set(Number(log.args.recordIndex), { txHash: log.transactionHash.toLowerCase(), blockNumber: log.blockNumber?.toString() ?? "" });
          }
        }
        if (cancelled || !hashes.size) return;
        setRecords(next.map((record) => ({ ...record, ...hashes.get(record.recordIndex) })));
      } catch {
        /* Log queries are best effort; records above are already authoritative. */
      }
    })().catch(() => {
      if (!cancelled) setStatus("error");
    });

    return () => { cancelled = true; };
  }, [address, publicClient, refreshKey]);

  return { records, status, loadedFor, refresh };
}

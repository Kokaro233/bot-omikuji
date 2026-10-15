// Trustless verification of a drawFortune transaction. The caller only supplies
// a transaction hash; chain, status, emitter, wallet and fortune all come from
// the RPC node and the contract's own storage.
import { decodeEventLog, getAddress, type Hex, type PublicClient, type TransactionReceipt } from "viem";
import { BOTCHAIN_CHAIN_ID, FORTUNE_COUNT, fortuneContractAbi } from "./botchain.ts";

export interface VerifiedDraw {
  chainId: number;
  contractAddress: `0x${string}`;
  wallet: `0x${string}`;
  recordIndex: number;
  fortuneId: number;
  timestamp: number;
  txHash: `0x${string}`;
  logIndex: number;
  blockNumber: bigint;
}

export type VerificationErrorCode =
  | "invalid_hash"
  | "wrong_chain"
  | "pending"
  | "reverted"
  | "no_event"
  | "wrong_wallet"
  | "state_mismatch";

export class DrawVerificationError extends Error {
  readonly code: VerificationErrorCode;
  constructor(code: VerificationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "DrawVerificationError";
  }
}

export const isTxHash = (value: unknown): value is `0x${string}` =>
  typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);

type ReceiptLike = Pick<TransactionReceipt, "status" | "logs" | "transactionHash" | "blockNumber">;

/** Decodes every FortuneDrawn event emitted by `contractAddress` in a successful receipt. */
export function extractFortuneDraws(receipt: ReceiptLike, contractAddress: string, chainId = BOTCHAIN_CHAIN_ID): VerifiedDraw[] {
  if (receipt.status !== "success") throw new DrawVerificationError("reverted", "Transaction did not succeed");
  const contract = getAddress(contractAddress);
  const draws: VerifiedDraw[] = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contract.toLowerCase()) continue;
    let decoded;
    try {
      decoded = decodeEventLog({ abi: fortuneContractAbi, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    if (decoded.eventName !== "FortuneDrawn") continue;
    const fortuneId = Number(decoded.args.fortuneId);
    if (!Number.isInteger(fortuneId) || fortuneId < 0 || fortuneId >= FORTUNE_COUNT) continue;
    draws.push({
      chainId,
      contractAddress: contract,
      wallet: getAddress(decoded.args.user),
      recordIndex: Number(decoded.args.recordIndex),
      fortuneId,
      timestamp: Number(decoded.args.timestamp),
      txHash: receipt.transactionHash.toLowerCase() as `0x${string}`,
      logIndex: Number(log.logIndex),
      blockNumber: receipt.blockNumber,
    });
  }
  return draws;
}

export interface VerifyOptions {
  contractAddress: string;
  /** Only accept draws made by this wallet. */
  expectedWallet?: string;
  /** Chain the RPC must report. Production code must leave the BOT Chain default. */
  expectedChainId?: number;
  /** Cross-check each event against getFortuneAt at the receipt's block. */
  checkState?: boolean;
}

type VerifierClient = Pick<PublicClient, "getChainId" | "getTransactionReceipt" | "readContract">;

export async function verifyDrawTransaction(client: VerifierClient, txHash: string, options: VerifyOptions): Promise<VerifiedDraw[]> {
  if (!isTxHash(txHash)) throw new DrawVerificationError("invalid_hash", "Invalid transaction hash");
  const expectedChainId = options.expectedChainId ?? BOTCHAIN_CHAIN_ID;
  const chainId = await client.getChainId();
  if (chainId !== expectedChainId) {
    throw new DrawVerificationError("wrong_chain", `RPC reports chain ${chainId}, expected ${expectedChainId}`);
  }

  let receipt: TransactionReceipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
  } catch (error) {
    if (error instanceof Error && /not be found|not found/i.test(error.message)) {
      throw new DrawVerificationError("pending", "Transaction is not mined on this chain yet");
    }
    throw error;
  }

  let draws = extractFortuneDraws(receipt, options.contractAddress, chainId);
  if (!draws.length) throw new DrawVerificationError("no_event", "No FortuneDrawn event from the configured contract");
  if (options.expectedWallet) {
    const wallet = options.expectedWallet.toLowerCase();
    draws = draws.filter((draw) => draw.wallet.toLowerCase() === wallet);
    if (!draws.length) throw new DrawVerificationError("wrong_wallet", "Draw belongs to a different wallet");
  }

  if (options.checkState !== false) {
    for (const draw of draws) {
      const record = await client.readContract({
        address: draw.contractAddress,
        abi: fortuneContractAbi,
        functionName: "getFortuneAt",
        args: [draw.wallet, BigInt(draw.recordIndex)],
        blockNumber: receipt.blockNumber,
      });
      if (Number(record.fortuneId) !== draw.fortuneId || Number(record.timestamp) !== draw.timestamp || record.wallet.toLowerCase() !== draw.wallet.toLowerCase()) {
        throw new DrawVerificationError("state_mismatch", "Event does not match contract storage");
      }
    }
  }
  return draws;
}

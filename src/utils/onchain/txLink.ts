import { BlockExplorerParams, LookupType, constructBlockExplorerUrl } from "./index.js";
import terminalLink from "terminal-link";

/**
 * Creates a terminal-friendly link to a transaction on a block explorer.
 * 
 * @param txHash - The hash of the transaction.
 * @param params - Optional parameters for constructing the block explorer URL.
 * @returns A promise that resolves to a string containing the terminal-friendly link.
 */
export async function txLink(txHash: string, params: BlockExplorerParams = {}): Promise<string> {
  const explorerUrl = await constructBlockExplorerUrl(txHash, LookupType.TX, params);
  return terminalLink(txHash, explorerUrl);
}
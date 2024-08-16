import { BlockExplorerParams, LookupType, constructBlockExplorerUrl } from "./index.js";
import terminalLink from "terminal-link";

/**
 * Creates a terminal-friendly link to an address on a block explorer.
 * 
 * @param address - The Ethereum address.
 * @param params - Optional parameters for constructing the block explorer URL.
 * @returns A promise that resolves to a string containing the terminal-friendly link.
 */
export async function addressLink(address: string, params: BlockExplorerParams = {}): Promise<string> {
  const explorerUrl = await constructBlockExplorerUrl(address, LookupType.ADDRESS, params);
  return terminalLink(address, explorerUrl);
}
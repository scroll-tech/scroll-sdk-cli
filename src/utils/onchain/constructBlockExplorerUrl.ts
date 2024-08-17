import { RpcSource } from './index.js';
import { generateProvider } from './generateProvider.js';

/**
 * Enum representing the type of lookup to perform on the block explorer.
 */
export enum LookupType {
  TX = "tx",
  ADDRESS = "address",
  BLOCK = "block"
}

/**
 * Interface for parameters used in constructing a block explorer URL.
 */
export interface BlockExplorerParams {
  chainId?: number;
  blockExplorerURI?: string;
  rpc?: RpcSource;
}

/**
 * A record of known block explorer URLs for different chain IDs.
 */
const blockExplorerList: Record<number, string> = {
  11155111: "https://sepolia.etherscan.io/",
  534351: "https://sepolia.scrollscan.com/"
};

/**
 * Constructs a block explorer URL for a given value and lookup type.
 * 
 * @param value - The value to look up (e.g., transaction hash or address).
 * @param type - The type of lookup to perform.
 * @param params - Optional parameters for constructing the URL.
 * @returns A promise that resolves to the constructed block explorer URL.
 * @throws An error if unable to determine the block explorer URL.
 */
export async function constructBlockExplorerUrl(
  value: string,
  type: LookupType,
  params: BlockExplorerParams = {}
): Promise<string> {
  let baseUrl = params.blockExplorerURI;

  if (!baseUrl && params.chainId) {
    baseUrl = blockExplorerList[params.chainId];
  } else if (!baseUrl && params.rpc) {
    const provider = generateProvider(params.rpc)
    const chainId = Number((await provider.getNetwork()).chainId);
    baseUrl = blockExplorerList[chainId];
  }

  if (!baseUrl) {
    throw new Error("Unable to determine block explorer URL");
  }

  baseUrl = baseUrl.replace(/\/$/, "");
  return `${baseUrl}/${type}/${value}`;
}
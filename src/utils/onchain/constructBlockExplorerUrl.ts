import { RpcSource } from './index.js';
import { generateProvider } from './generateProvider.js';

export enum LookupType {
  TX = "tx",
  ADDRESS = "address"
}

export interface BlockExplorerParams {
  chainId?: number;
  blockExplorerURI?: string;
  rpc?: RpcSource;
}

const blockExplorerList: Record<number, string> = {
  11155111: "https://sepolia.etherscan.io/",
  534351: "https://sepolia.scrollscan.com/"
};

export async function constructBlockExplorerUrl(
  value: string,
  type: LookupType,
  params: BlockExplorerParams = {}
): Promise<string> {
  let baseUrl = params.blockExplorerURI;

  if (!baseUrl && params.chainId) {
    baseUrl = blockExplorerList[params.chainId];
  } else if (!baseUrl && params.rpc){
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
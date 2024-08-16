import { BlockExplorerParams, LookupType, constructBlockExplorerUrl } from "./index.js";
import terminalLink from "terminal-link";

export  async function txLink(txHash: string, params: BlockExplorerParams = {}): Promise<string> {
    const explorerUrl = await constructBlockExplorerUrl(txHash, LookupType.TX, params);
    return terminalLink(txHash, explorerUrl);
  }
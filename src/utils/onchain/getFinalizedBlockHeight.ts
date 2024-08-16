import { RpcSource, generateProvider } from './index.js';

export async function getFinalizedBlockHeight(rpc: RpcSource): Promise<number> {
  const provider = generateProvider(rpc)
  const result = await provider.send("eth_getBlockByNumber", ["finalized", false]);
  return parseInt(result.number, 16);
}
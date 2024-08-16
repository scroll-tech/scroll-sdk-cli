import { RpcSource, generateProvider } from './index.js';

/**
 * Retrieves the height of the most recently finalized block. Doesn't seem to work on Sepolia.
 * 
 * @param rpc - The RPC source to use for querying the blockchain.
 * @returns A promise that resolves to the finalized block height as a number.
 */
export async function getFinalizedBlockHeight(rpc: RpcSource): Promise<number> {
  const provider = generateProvider(rpc)
  const result = await provider.send("eth_getBlockByNumber", ["finalized", false]);
  return parseInt(result.number, 16);
}
import { Contract } from 'ethers';
import { RpcSource, generateProvider } from './index.js';

/**
 * Retrieves the pending queue index from the L1 message queue contract.
 * 
 * @param rpc - The RPC source to use for querying the blockchain.
 * @param l1MessageQueueProxyAddress - The address of the L1 message queue proxy contract.
 * @returns A promise that resolves to the pending queue index as a bigint.
 */
export async function getPendingQueueIndex(rpc: RpcSource, l1MessageQueueProxyAddress: string): Promise<bigint> {
  const provider = generateProvider(rpc)
  const l1MessageQueueABI = [
    "function pendingQueueIndex() view returns (uint256)"
  ];
  const l1MessageQueue = new Contract(l1MessageQueueProxyAddress, l1MessageQueueABI, provider);

  return await l1MessageQueue.pendingQueueIndex();
}
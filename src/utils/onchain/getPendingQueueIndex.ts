import { Contract } from 'ethers';
import { RpcSource, generateProvider } from './index.js';

export async function getPendingQueueIndex(rpc: RpcSource, l1MessageQueueProxyAddress: string): Promise<bigint> {
  const provider = generateProvider(rpc)
  const l1MessageQueueABI = [
    "function pendingQueueIndex() view returns (uint256)"
  ];
  const l1MessageQueue = new Contract(l1MessageQueueProxyAddress, l1MessageQueueABI, provider);

  return await l1MessageQueue.pendingQueueIndex();
}
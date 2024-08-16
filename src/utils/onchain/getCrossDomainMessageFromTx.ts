import { Contract, ethers } from 'ethers';
import { generateProvider, RpcSource } from './index.js';

/**
 * Retrieves cross-domain message information from a transaction.
 * 
 * @param tx - The transaction hash.
 * @param rpc - The RPC source to use for querying the blockchain.
 * @param l1MessageQueueProxyAddress - The address of the L1 message queue proxy contract.
 * @returns A promise that resolves to an object containing the queue index and L2 transaction hash.
 * @throws An error if the transaction is not found or if the QueueTransaction event is not found.
 */
export async function getCrossDomainMessageFromTx(
  tx: string,
  rpc: RpcSource,
  l1MessageQueueProxyAddress: string
): Promise<{ queueIndex: number; l2TxHash: string }> {
  const provider = generateProvider(rpc)
  const receipt = await provider.getTransactionReceipt(tx);
  if (!receipt) throw new Error('Transaction not found');

  const queueTransactionLog = receipt.logs.find(log =>
    log.address.toLowerCase() === l1MessageQueueProxyAddress.toLowerCase()
  );

  if (!queueTransactionLog) throw new Error('QueueTransaction event not found');

  const decodedLog = ethers.AbiCoder.defaultAbiCoder().decode(
    ['uint256', 'uint64', 'uint256', 'bytes'],
    queueTransactionLog.data
  );
  const queueIndex = decodedLog[1];

  const l1MessageQueueABI = [
    "function getCrossDomainMessage(uint256) view returns (bytes32)"
  ];
  const l1MessageQueue = new Contract(l1MessageQueueProxyAddress, l1MessageQueueABI, provider);

  const l2TxHash = await l1MessageQueue.getCrossDomainMessage(queueIndex);

  return { queueIndex, l2TxHash };
}
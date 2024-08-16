import { TransactionReceipt } from 'ethers';
import { RpcSource } from './index.js';
import { generateProvider } from './generateProvider.js';

/**
 * Waits for a transaction to be mined and returns the transaction receipt.
 * 
 * @param txHash - The hash of the transaction to wait for.
 * @param rpc - The RPC source to use for querying the blockchain.
 * @param timeout - The time to wait between checks, in milliseconds. Defaults to 20000ms.
 * @returns A promise that resolves to the TransactionReceipt, or null if the transaction is not found.
 */
export async function awaitTx(txHash: string, rpc: RpcSource, timeout: number = 20000): Promise<TransactionReceipt | null> {
  const provider = generateProvider(rpc);

  let receipt = null;

  while (!receipt) {
    try {
      receipt = await provider.getTransactionReceipt(txHash);
    } catch (error) {
      console.log(`Transaction not found yet. Retrying in ${timeout / 1000} seconds...`);
    }

    if (!receipt) {
      await new Promise(resolve => setTimeout(resolve, timeout));
    }
  }

  return receipt;
}
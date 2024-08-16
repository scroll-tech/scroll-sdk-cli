import { TransactionReceipt } from 'ethers';
import { RpcSource } from './index.js';
import { generateProvider } from './generateProvider.js';

export async function awaitTx(txHash: string, rpc: RpcSource, timeout: number = 20000): Promise<TransactionReceipt | null> {
  const provider = generateProvider(rpc);

  let receipt = null;

  while (!receipt) {
    try {
      receipt = await provider.getTransactionReceipt(txHash);
    } catch (error) {
      console.log(`Transaction not found yet. Retrying in ${timeout/1000} seconds...`);
    }

    if (!receipt) {
      await new Promise(resolve => setTimeout(resolve, timeout));
    }
  }

  return receipt;
}
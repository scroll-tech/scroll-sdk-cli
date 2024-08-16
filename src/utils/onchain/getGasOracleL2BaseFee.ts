import { Contract } from 'ethers';
import { RpcSource, generateProvider } from './index.js';

/**
 * Retrieves the L2 base fee from the gas oracle contract on L1.
 * 
 * @param rpc - The RPC source to use for querying the blockchain.
 * @param l1MessageQueueProxyAddress - The address of the L1 message queue proxy contract.
 * @returns A promise that resolves to the L2 base fee as a bigint.
 */
export async function getGasOracleL2BaseFee(rpc: RpcSource, l1MessageQueueProxyAddress: string): Promise<bigint> {
  const provider = generateProvider(rpc)
  const l2BaseFeeABI = [
    "function l2BaseFee() view returns (uint256)"
  ];
  const gasOracle = new Contract(l1MessageQueueProxyAddress, l2BaseFeeABI, provider);

  return await gasOracle.l2BaseFee();
}
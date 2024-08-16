import { Contract } from 'ethers';
import { RpcSource, generateProvider } from './index.js';

export async function getGasOracleL2BaseFee(rpc: RpcSource, l1MessageQueueProxyAddress: string): Promise<bigint> {
  const provider = generateProvider(rpc)
  const l2BaseFeeABI = [
    "function l2BaseFee() view returns (uint256)"
  ];
  const gasOracle = new Contract(l1MessageQueueProxyAddress, l2BaseFeeABI, provider);

  return await gasOracle.l2BaseFee();
}
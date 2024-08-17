import { Contract, ethers } from 'ethers';
import { generateProvider, l1GatewayRouterABI, RpcSource } from './index.js';

/**
 * Retrieves the L2 token address corresponding to an L1 token address.
 *
 * @param l1TokenAddress - The address of the token on L1.
 * @param rpc - The RPC source for connecting to the network.
 * @param l1GatewayRouterAddress - The address of the L1 Gateway Router contract.
 * @returns A Promise that resolves to the address of the corresponding L2 token.
 * @throws Will throw an error if the L2 token address cannot be retrieved.
 */

export async function getL2TokenFromL1Address(
  l1TokenAddress: string,
  rpc: RpcSource,
  l1GatewayRouterAddress: string
): Promise<string> {
  const provider = generateProvider(rpc)

  const l1GatewayRouter = new Contract(l1GatewayRouterAddress, l1GatewayRouterABI, provider);

  const l2TokenAddress = await l1GatewayRouter.getL2ERC20Address(l1TokenAddress);

  return l2TokenAddress;
}
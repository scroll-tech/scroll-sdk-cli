import { JsonRpcProvider, Wallet } from 'ethers';
export { getFinalizedBlockHeight } from './getFinalizedBlockHeight.js';
export { getCrossDomainMessageFromTx } from './getCrossDomainMessageFromTx.js';
export { getPendingQueueIndex } from './getPendingQueueIndex.js';
export { getGasOracleL2BaseFee } from './getGasOracleL2BaseFee.js';
export { awaitTx } from './awaitTx.js';
export { constructBlockExplorerUrl, LookupType } from './constructBlockExplorerUrl.js';
export type { BlockExplorerParams } from './constructBlockExplorerUrl.js';
export { txLink } from './txLink.js'
export { addressLink } from './addressLink.js'
export { generateProvider } from './generateProvider.js'
export { getUnclaimedWithdrawals } from './getUnclaimedWithdrawals.js'

/**
 * Represents a source for an RPC provider, which can be a JsonRpcProvider, a Wallet, or a string URL.
 */
export type RpcSource = JsonRpcProvider | Wallet | string;

/**
 * ABI for the L1 ETH Gateway contract.
 */
export const l1ETHGatewayABI = [
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "gasLimit",
				"type": "uint256"
			}
		],
		"name": "depositETH",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	}
];

/**
 * ABI for the L2 ETH Gateway contract.
 */
export const l2ETHGatewayABI = [
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "gasLimit",
				"type": "uint256"
			}
		],
		"name": "withdrawETH",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	}
]
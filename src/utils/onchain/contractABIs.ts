/**
 * ABI for the L1 ETH Gateway contract, specifically for depositETH.
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
 * ABI for the L2 ETH Gateway contract. Specifically for withdrawETH.
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

export const l1GatewayRouterABI = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_token",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "_amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "_gasLimit",
				"type": "uint256"
			}
		],
		"name": "depositERC20",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_l1Token",
				"type": "address"
			}
		],
		"name": "getL2ERC20Address",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];

export const l2GatewayRouterWithdrawERC20ABI = [{
	"inputs": [
		{
			"internalType": "address",
			"name": "token",
			"type": "address"
		},
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
	"name": "withdrawERC20",
	"outputs": [],
	"stateMutability": "payable",
	"type": "function"
}]


/**
 * ABI for the relayMessageWithProof function.
 */
export const l1MessengerRelayMessageWithProofABI = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "from",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "value",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "nonce",
				"type": "uint256"
			},
			{
				"internalType": "bytes",
				"name": "message",
				"type": "bytes"
			},
			{
				"components": [
					{
						"internalType": "uint256",
						"name": "batchIndex",
						"type": "uint256"
					},
					{
						"internalType": "bytes",
						"name": "merkleProof",
						"type": "bytes"
					}
				],
				"internalType": "struct L2MessageProof",
				"name": "proof",
				"type": "tuple"
			}
		],
		"name": "relayMessageWithProof",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
];

// ABI for ERC20s created by the bridge
export const scrollERC20ABI = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "account",
				"type": "address"
			}
		],
		"name": "balanceOf",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}, {
		"inputs": [
			{
				"internalType": "address",
				"name": "spender",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "value",
				"type": "uint256"
			}
		],
		"name": "approve",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	}
];
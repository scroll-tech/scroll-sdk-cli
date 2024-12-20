/* eslint-disable perfectionist/sort-objects */
export type DeployedContract = {
  additionalAltGas?: boolean
  address?: string
  bypassedInAltGas?: boolean
  initializes: boolean
  layer: Layer
  name: string
  owned: boolean
}

export enum Layer {
  L1 = 'l1',
  L2 = 'l2',
}
export const contracts: DeployedContract[] = [
  {name: 'L1_WETH_ADDR', initializes: false, owned: false, layer: Layer.L1},
  {name: 'L1_PROXY_ADMIN_ADDR', initializes: false, owned: true, layer: Layer.L1},
  {name: 'L1_PROXY_IMPLEMENTATION_PLACEHOLDER_ADDR', initializes: false, owned: false, layer: Layer.L1},
  {name: 'L1_WHITELIST_ADDR', initializes: true, owned: true, layer: Layer.L1},
  {name: 'L1_SCROLL_CHAIN_IMPLEMENTATION_ADDR', initializes: false, owned: false, layer: Layer.L1},
  {name: 'L1_SCROLL_CHAIN_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L1},
  {name: 'L1_SCROLL_MESSENGER_IMPLEMENTATION_ADDR', initializes: false, owned: false, layer: Layer.L1},
  {name: 'L1_SCROLL_MESSENGER_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L1},
  {name: 'L1_ENFORCED_TX_GATEWAY_IMPLEMENTATION_ADDR', initializes: false, owned: false, layer: Layer.L1},
  {name: 'L1_ENFORCED_TX_GATEWAY_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L1},
  {name: 'L1_ZKEVM_VERIFIER_V2_ADDR', initializes: false, owned: false, layer: Layer.L1},
  {name: 'L1_MULTIPLE_VERSION_ROLLUP_VERIFIER_ADDR', initializes: false, owned: true, layer: Layer.L1},
  {name: 'L1_MESSAGE_QUEUE_IMPLEMENTATION_ADDR', initializes: false, owned: false, layer: Layer.L1},
  {name: 'L1_MESSAGE_QUEUE_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L1},
  {name: 'L1_GATEWAY_ROUTER_IMPLEMENTATION_ADDR', initializes: false, owned: false, layer: Layer.L1},
  {name: 'L1_GATEWAY_ROUTER_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L1},
  {
    name: 'L1_ETH_GATEWAY_IMPLEMENTATION_ADDR',
    initializes: false,
    owned: false,
    layer: Layer.L1,
    bypassedInAltGas: true,
  },
  {name: 'L1_ETH_GATEWAY_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L1, bypassedInAltGas: true},
  {
    name: 'L1_WETH_GATEWAY_IMPLEMENTATION_ADDR',
    initializes: false,
    owned: false,
    layer: Layer.L1,
    bypassedInAltGas: true,
  },
  {name: 'L1_WETH_GATEWAY_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L1, bypassedInAltGas: true},
  {name: 'L1_STANDARD_ERC20_GATEWAY_IMPLEMENTATION_ADDR', initializes: false, owned: false, layer: Layer.L1},
  {name: 'L1_STANDARD_ERC20_GATEWAY_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L1},
  {name: 'L1_CUSTOM_ERC20_GATEWAY_IMPLEMENTATION_ADDR', initializes: false, owned: false, layer: Layer.L1},
  {name: 'L1_CUSTOM_ERC20_GATEWAY_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L1},
  {name: 'L1_ERC721_GATEWAY_IMPLEMENTATION_ADDR', initializes: false, owned: false, layer: Layer.L1},
  {name: 'L1_ERC721_GATEWAY_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L1},
  {name: 'L1_ERC1155_GATEWAY_IMPLEMENTATION_ADDR', initializes: false, owned: false, layer: Layer.L1},
  {name: 'L1_ERC1155_GATEWAY_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L1},
  {name: 'L1_PLONK_VERIFIER_ADDR', initializes: false, owned: false, layer: Layer.L1},

  {name: 'L2_MESSAGE_QUEUE_ADDR', initializes: true, owned: true, layer: Layer.L2},
  {name: 'L1_GAS_PRICE_ORACLE_ADDR', initializes: true, owned: true, layer: Layer.L2},
  {name: 'L2_WHITELIST_ADDR', initializes: true, owned: true, layer: Layer.L2},
  {name: 'L2_WETH_ADDR', initializes: false, owned: false, layer: Layer.L2},
  {name: 'L2_TX_FEE_VAULT_ADDR', initializes: true, owned: true, layer: Layer.L2},
  {name: 'L2_PROXY_ADMIN_ADDR', initializes: false, owned: true, layer: Layer.L2},
  {name: 'L2_PROXY_IMPLEMENTATION_PLACEHOLDER_ADDR', initializes: false, owned: false, layer: Layer.L2},
  {name: 'L2_SCROLL_MESSENGER_IMPLEMENTATION_ADDR', initializes: false, owned: false, layer: Layer.L2},
  {name: 'L2_SCROLL_MESSENGER_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L2},
  {name: 'L2_GATEWAY_ROUTER_IMPLEMENTATION_ADDR', initializes: false, owned: false, layer: Layer.L2},
  {name: 'L2_GATEWAY_ROUTER_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L2},
  {name: 'L2_ETH_GATEWAY_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L2},
  {name: 'L2_WETH_GATEWAY_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L2, bypassedInAltGas: true},
  {name: 'L2_STANDARD_ERC20_GATEWAY_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L2},
  {name: 'L2_CUSTOM_ERC20_GATEWAY_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L2},
  {name: 'L2_ERC721_GATEWAY_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L2},
  {name: 'L2_ERC1155_GATEWAY_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L2},
  {name: 'L2_SCROLL_STANDARD_ERC20_ADDR', initializes: false, owned: false, layer: Layer.L2},
  {name: 'L2_SCROLL_STANDARD_ERC20_FACTORY_ADDR', initializes: true, owned: true, layer: Layer.L2},

  // New contracts with additionalAltGas set to true
  {name: 'L1_GAS_TOKEN_ADDR', initializes: false, owned: false, layer: Layer.L1, additionalAltGas: true},
  {
    name: 'L1_GAS_TOKEN_GATEWAY_IMPLEMENTATION_ADDR',
    initializes: false,
    owned: false,
    layer: Layer.L1,
    additionalAltGas: true,
  },
  {name: 'L1_GAS_TOKEN_GATEWAY_PROXY_ADDR', initializes: true, owned: true, layer: Layer.L1, additionalAltGas: true},
  {name: 'L1_WRAPPED_TOKEN_GATEWAY_ADDR', initializes: true, owned: false, layer: Layer.L1, additionalAltGas: true},
  {name: 'L2_STANDARD_ERC20_GATEWAY_IMPLEMENTATION_ADDR', initializes: false, owned: false, layer: Layer.L2},
  {name: 'L2_ETH_GATEWAY_IMPLEMENTATION_ADDR', initializes: false, owned: false, layer: Layer.L2},
  {
    name: 'L2_WETH_GATEWAY_IMPLEMENTATION_ADDR',
    initializes: false,
    owned: false,
    layer: Layer.L2,
    bypassedInAltGas: true,
  },
  {name: 'L2_CUSTOM_ERC20_GATEWAY_IMPLEMENTATION_ADDR', initializes: false, owned: false, layer: Layer.L2},
  {name: 'L2_ERC721_GATEWAY_IMPLEMENTATION_ADDR', initializes: false, owned: false, layer: Layer.L2},
  {name: 'L2_ERC1155_GATEWAY_IMPLEMENTATION_ADDR', initializes: false, owned: false, layer: Layer.L2},
]

// export const L1Contracts: DeployedContract[] = [
//     { name: "L1_WETH_ADDR", initializes: false, owned: false },
//     { name: "L1_PROXY_ADMIN_ADDR", initializes: false, owned: true },
//     { name: "L1_PROXY_IMPLEMENTATION_PLACEHOLDER_ADDR", initializes: false, owned: false },
//     { name: "L1_WHITELIST_ADDR", initializes: true, owned: true },
//     { name: "L2_GAS_PRICE_ORACLE_IMPLEMENTATION_ADDR", initializes: false, owned: false },
//     { name: "L2_GAS_PRICE_ORACLE_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L1_SCROLL_CHAIN_IMPLEMENTATION_ADDR", initializes: false, owned: false },
//     { name: "L1_SCROLL_CHAIN_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L1_SCROLL_MESSENGER_IMPLEMENTATION_ADDR", initializes: false, owned: false },
//     { name: "L1_SCROLL_MESSENGER_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L1_ENFORCED_TX_GATEWAY_IMPLEMENTATION_ADDR", initializes: false, owned: false },
//     { name: "L1_ENFORCED_TX_GATEWAY_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L1_ZKEVM_VERIFIER_V1_ADDR", initializes: false, owned: false },
//     { name: "L1_MULTIPLE_VERSION_ROLLUP_VERIFIER_ADDR", initializes: false, owned: true },
//     { name: "L1_MESSAGE_QUEUE_IMPLEMENTATION_ADDR", initializes: false, owned: false },
//     { name: "L1_MESSAGE_QUEUE_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L1_GATEWAY_ROUTER_IMPLEMENTATION_ADDR", initializes: false, owned: false },
//     { name: "L1_GATEWAY_ROUTER_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L1_ETH_GATEWAY_IMPLEMENTATION_ADDR", initializes: false, owned: false },
//     { name: "L1_ETH_GATEWAY_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L1_WETH_GATEWAY_IMPLEMENTATION_ADDR", initializes: false, owned: false },
//     { name: "L1_WETH_GATEWAY_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L1_STANDARD_ERC20_GATEWAY_IMPLEMENTATION_ADDR", initializes: false, owned: false },
//     { name: "L1_STANDARD_ERC20_GATEWAY_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L1_CUSTOM_ERC20_GATEWAY_IMPLEMENTATION_ADDR", initializes: false, owned: false },
//     { name: "L1_CUSTOM_ERC20_GATEWAY_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L1_ERC721_GATEWAY_IMPLEMENTATION_ADDR", initializes: false, owned: false },
//     { name: "L1_ERC721_GATEWAY_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L1_ERC1155_GATEWAY_IMPLEMENTATION_ADDR", initializes: false, owned: false },
//     { name: "L1_ERC1155_GATEWAY_PROXY_ADDR", initializes: true, owned: true }
// ]

// export const L2Contracts: DeployedContract[] = [
//     { name: "L2_MESSAGE_QUEUE_ADDR", initializes: true, owned: true },
//     { name: "L1_GAS_PRICE_ORACLE_ADDR", initializes: true, owned: true },
//     { name: "L2_WHITELIST_ADDR", initializes: true, owned: true },
//     { name: "L2_WETH_ADDR", initializes: false, owned: false },
//     { name: "L2_TX_FEE_VAULT_ADDR", initializes: true, owned: true },
//     { name: "L2_PROXY_ADMIN_ADDR", initializes: false, owned: true },
//     { name: "L2_PROXY_IMPLEMENTATION_PLACEHOLDER_ADDR", initializes: false, owned: false },
//     { name: "L2_SCROLL_MESSENGER_IMPLEMENTATION_ADDR", initializes: false, owned: false },
//     { name: "L2_SCROLL_MESSENGER_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L2_GATEWAY_ROUTER_IMPLEMENTATION_ADDR", initializes: false, owned: false },
//     { name: "L2_GATEWAY_ROUTER_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L2_ETH_GATEWAY_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L2_WETH_GATEWAY_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L2_STANDARD_ERC20_GATEWAY_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L2_CUSTOM_ERC20_GATEWAY_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L2_ERC721_GATEWAY_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L2_ERC1155_GATEWAY_PROXY_ADDR", initializes: true, owned: true },
//     { name: "L2_SCROLL_STANDARD_ERC20_ADDR", initializes: false, owned: false },
//     { name: "L2_SCROLL_STANDARD_ERC20_FACTORY_ADDR", initializes: true, owned: true }
// ]

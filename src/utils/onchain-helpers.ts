import { JsonRpcProvider, Wallet, Contract, ethers } from 'ethers';
import terminalLink from 'terminal-link';

type RpcSource = JsonRpcProvider | Wallet | string;

export class OnchainHelpers {
  private provider: JsonRpcProvider;

  constructor(rpcSource: RpcSource) {
    this.provider = this.generateProvider(rpcSource);
  }

  private generateProvider(rpcSource: RpcSource): JsonRpcProvider {
    if (typeof rpcSource === 'string') {
      return new JsonRpcProvider(rpcSource);
    } else if (rpcSource instanceof Wallet && rpcSource.provider instanceof JsonRpcProvider) {
      return rpcSource.provider;
    } else if (rpcSource instanceof JsonRpcProvider) {
      return rpcSource;
    }
    throw new Error('Invalid rpcSource. Expected Provider, Wallet with JsonRpcProvider, or string with RPC Url.');
  }

  async getFinalizedBlockHeight(): Promise<number> {
    const result = await this.provider.send("eth_getBlockByNumber", ["finalized", false]);
    return parseInt(result.number, 16);
  }

  async getCrossDomainMessageFromTx(tx: string, l1MessageQueueProxyAddress: string): Promise<{ queueIndex: number, l2TxHash: string }> {
    const receipt = await this.provider.getTransactionReceipt(tx);
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
    const l1MessageQueue = new Contract(l1MessageQueueProxyAddress, l1MessageQueueABI, this.provider);

    const l2TxHash = await l1MessageQueue.getCrossDomainMessage(queueIndex);

    return { queueIndex, l2TxHash };
  }

  async getPendingQueueIndex(l1MessageQueueProxyAddress: string): Promise<number> {
    const l1MessageQueueABI = [
      "function pendingQueueIndex() view returns (uint256)"
    ];
    const l1MessageQueue = new Contract(l1MessageQueueProxyAddress, l1MessageQueueABI, this.provider);

    return await l1MessageQueue.pendingQueueIndex();
  }

  async getGasOracleL2BaseFee(l1MessageQueueProxyAddress: string): Promise<bigint> {
    const l2BaseFeeABI = [
      "function l2BaseFee() view returns (uint256)"
    ];
    const gasOracle = new Contract(l1MessageQueueProxyAddress, l2BaseFeeABI, this.provider);

    return await gasOracle.l2BaseFee();
  }

  async awaitTx(txHash: string, timeout: number = 20000): Promise<ethers.TransactionReceipt | null> {
    let receipt = null;

    while (!receipt) {
      try {
        receipt = await this.provider.getTransactionReceipt(txHash);
      } catch (error) {
        console.log(`Transaction not found yet. Retrying in ${timeout/1000} seconds...`);
      }

      if (!receipt) {
        await new Promise(resolve => setTimeout(resolve, timeout));
      }
    }

    return receipt;
  }

  async constructBlockExplorerUrl(value: string, type: LookupType, params: BlockExplorerParams = {}): Promise<string> {
    let baseUrl = params.blockExplorerURI;

    if (!baseUrl) {
      const chainId = params.chainId || Number((await this.provider.getNetwork()).chainId);
      baseUrl = blockExplorerList[chainId];
    }

    if (!baseUrl) {
      throw new Error("Unable to determine block explorer URL");
    }

    baseUrl = baseUrl.replace(/\/$/, "");
    return `${baseUrl}/${type}/${value}`;
  }

  async txLink(txHash: string, params: BlockExplorerParams = {}): Promise<string> {
    const explorerUrl = await this.constructBlockExplorerUrl(txHash, LookupType.TX, params);
    return terminalLink(txHash, explorerUrl);
  }

  async addressLink(address: string, params: BlockExplorerParams = {}): Promise<string> {
    const explorerUrl = await this.constructBlockExplorerUrl(address, LookupType.ADDRESS, params);
    return terminalLink(address, explorerUrl);
  }
}

export enum LookupType {
  TX = "tx",
  ADDRESS = "address"
}

export interface BlockExplorerParams {
  chainId?: number;
  blockExplorerURI?: string;
}

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

const blockExplorerList: Record<number, string> = {
  11155111: "https://sepolia.etherscan.io/",
  534351: "https://sepolia.scrollscan.com/"
};
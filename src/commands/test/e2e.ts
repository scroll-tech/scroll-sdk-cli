import { Args, Command, Flags } from '@oclif/core'
import { ethers } from 'ethers'
import { confirm, select, Separator } from '@inquirer/prompts'
import QRCode from 'qrcode'
import { parseTomlConfig } from '../../utils/config-parser.js'
import path from 'path'
import { getFinalizedBlockHeight, l1ETHGatewayABI, l2ETHGatewayABI, getCrossDomainMessageFromTx, getPendingQueueIndex, getGasOracleL2BaseFee, awaitTx, txLink } from '../../utils/onchain/index.js'
import { Wallet } from 'ethers'
import chalk from 'chalk';

interface ContractsConfig {
  [key: string]: string
}

enum Layer {
  L1 = 'l1',
  L2 = 'l2'
}

const FUNDING_AMOUNT = 0.004

// Custom error types
class WalletFundingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletFundingError';
  }
}

class BridgingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BridgingError';
  }
}

class DeploymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeploymentError';
  }
}

class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export default class TestE2e extends Command {
  static description = 'Test contracts by checking deployment and initialization'

  static flags = {
    config: Flags.string({
      char: 'c',
      description: 'Path to config.toml file',
      default: './charts/scroll-stack/config.toml',
    }),
    contracts: Flags.string({
      char: 't',
      description: 'Path to configs-contracts.toml file',
      default: './charts/scroll-stack/configs-contracts.toml',
    }),
    pod: Flags.boolean({
      char: 'p',
      description: 'Run inside Kubernetes pod',
      default: false,
    }),
    private_key: Flags.string({ char: 'k', description: 'Private key for funder wallet initialization' }),
    manual_fund: Flags.boolean({ char: 'm', description: 'Manually fund the test wallet.' }),
    skip_wallet_generation: Flags.boolean({ char: 's', description: 'Manually fund the test wallet.' }),
  }

  private l1Provider!: ethers.JsonRpcProvider
  private l2Provider!: ethers.JsonRpcProvider
  private wallet!: ethers.Wallet
  private fundingWallet!: ethers.Wallet
  private manualFunding: boolean = false
  private skipWalletGen: boolean = false
  private l1Rpc!: string
  private l2Rpc!: string
  private l1ETHGateway!: string
  private l2ETHGateway!: string
  private l1MessegeQueueProxyAddress!: string
  private bridgeApiUrl!: string

  private results: {
    bridgeFundsL1ToL2: {
      L1DepositETHTx?: string;
      L2ETHBridgeTx?: string;
      complete: boolean;
    };
    bridgeFundsL2ToL1: {
      L2DepositETHTx?: string;
      complete: false
    };
    deployERC20OnL1: {
      address?: string;
      txHash?: string;
      complete: boolean;
    };
    deployERC20OnL2: {
      address?: string;
      txHash?: string;
      complete: boolean;
    };
    bridgeERC20L1ToL2: {
      L2TxHash?: string;
      complete: boolean;
    };
    bridgeERC20L2ToL1: {
      L2TxHash?: string;
      complete: boolean;
    };
    fundWalletOnL1: {
      complete: boolean;
    };
    fundWalletOnL2: {
      complete: boolean;
    }
  } = {
      bridgeFundsL1ToL2: { complete: false },
      bridgeFundsL2ToL1: { complete: false },
      deployERC20OnL1: { complete: false },
      deployERC20OnL2: { complete: false },
      bridgeERC20L1ToL2: { complete: false },
      bridgeERC20L2ToL1: { complete: false },
      fundWalletOnL1: { complete: false },
      fundWalletOnL2: { complete: false },
    };

  private logResult(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    let icon: string;
    let coloredMessage: string;

    switch (type) {
      case 'success':
        icon = '✅';
        coloredMessage = chalk.green(message);
        break;
      case 'warning':
        icon = '⚠️';
        coloredMessage = chalk.yellow(message);
        break;
      case 'error':
        icon = '❌';
        coloredMessage = chalk.red(message);
        break;
      default:
        icon = 'ℹ️';
        coloredMessage = chalk.blue(message);
    }

    this.log(`${icon} ${coloredMessage}`);
  }

  private logSection(sectionName: string): void {
    this.log('\n' + chalk.bgCyan.black(` ${sectionName} `) + '\n');
  }

  private logTx(txHash: string, description: string): void {
    this.logResult(`${description}: ${chalk.cyan(txHash)}`, 'info');
  }

  public async run(): Promise<void> {
    try {
      const { flags } = await this.parse(TestE2e)

      const configPath = path.resolve(flags.config)
      const contractsPath = path.resolve(flags.contracts)
      this.manualFunding = flags.manual_fund;

      const config = parseTomlConfig(configPath)
      const contractsConfig: ContractsConfig = parseTomlConfig(contractsPath)

      // TODO: Grab important contracts and save them somewhere?

      let l1RpcUrl: string
      let l2RpcUrl: string

      // if we're running inside a pod, we shouldn't use external URLs
      if (flags.pod) {
        l1RpcUrl = config?.general?.L1_RPC_ENDPOINT
        l2RpcUrl = config?.general?.L2_RPC_ENDPOINT
      } else {
        l1RpcUrl = config?.frontend?.EXTERNAL_RPC_URI_L1
        l2RpcUrl = config?.frontend?.EXTERNAL_RPC_URI_L2
      }

      // Check if RPC URLs are defined
      if (!l1RpcUrl || !l2RpcUrl) {
        throw new ConfigurationError(`Missing RPC URL(s) in ${configPath}. Please ensure L1_RPC_ENDPOINT and L2_RPC_ENDPOINT (for pod mode) or EXTERNAL_RPC_URI_L1 and EXTERNAL_RPC_URI_L2 (for non-pod mode) are defined.`);
      }

      this.l1Rpc = l1RpcUrl
      this.l2Rpc = l2RpcUrl
      this.l1ETHGateway = contractsConfig.L1_ETH_GATEWAY_PROXY_ADDR
      this.l2ETHGateway = contractsConfig.L2_ETH_GATEWAY_PROXY_ADDR
      this.l1MessegeQueueProxyAddress = contractsConfig.L1_MESSAGE_QUEUE_PROXY_ADDR
      this.bridgeApiUrl = config?.frontend.BRIDGE_API_URI
      this.skipWalletGen = flags.skip_wallet_generation

      this.l1Provider = new ethers.JsonRpcProvider(l1RpcUrl)
      this.l2Provider = new ethers.JsonRpcProvider(l2RpcUrl)

      if (flags.skip_wallet_generation) {
        this.wallet = new ethers.Wallet(flags.private_key ?? config.accounts.DEPLOYER_PRIVATE_KEY)
        this.logResult(`Skipping wallet generation, using: ${this.wallet.address}`)
      } else {

        if (flags.private_key) {
          this.fundingWallet = new ethers.Wallet(flags.private_key, this.l1Provider)
          this.logResult(`Funding Wallet: ${this.fundingWallet.address}`)
        } else if (config.accounts.DEPLOYER_PRIVATE_KEY && !flags.manual_fund) {
          this.logResult("No funding source found. Using DEPLOYER_PRIVATE_KEY.")
          this.fundingWallet = new ethers.Wallet(config.accounts.DEPLOYER_PRIVATE_KEY, this.l1Provider)
          this.logResult(`Funding Wallet: ${this.fundingWallet.address}`)
        } else {
          this.logResult("No Deploy private key found or provided. (Will prompt to fund L1 address manually.)")
        }

      }

      await this.runE2ETest()
    } catch (error) {
      if (error instanceof ConfigurationError) {
        this.error(`Configuration error: ${error.message}`);
      } else if (error instanceof NetworkError) {
        this.error(`Network error: ${error.message}`);
      } else if (error instanceof Error) {
        this.error(`Unexpected error: ${error.message}`);
      } else {
        this.error(`An unknown error occurred`);
      }
    }
  }

  private async runE2ETest(): Promise<void> {
    try {
      this.logSection('Running E2E Test');

      // Setup L1
      if (!this.skipWalletGen) {
        await this.generateNewWallet();
        await this.fundWalletOnL1();
      }

      // Run L1 and L2 groups in parallel
      await Promise.all([
        this.runL1Groups(),
        this.runL2Groups(),
      ]);

      this.logResult('E2E Test completed successfully', 'success');
    } catch (error) {
      this.handleError(error);
    }
  }

  private async runL1Groups(): Promise<void> {
    try {
      this.logSection('Running L1 Groups');

      // Sequential L1 - Group 1 (ETH)
      this.logResult('L1 Group 1 (ETH)', 'info');
      await this.bridgeFundsL1ToL2();

      // Sequential L1 - Group 2 (ERC20)
      this.logResult('L1 Group 2 (ERC20)', 'info');
      await this.deployERC20OnL1();
      await this.bridgeERC20L1ToL2();

      this.logResult('L1 Groups completed', 'success');
    } catch (error) {
      this.handleGroupError('L1 Groups', error);
    }
  }

  private async runL2Groups(): Promise<void> {
    try {
      this.logSection('Running L2 Groups');

      // Setup L2
      this.logResult('Setup L2', 'info');
      await this.fundWalletOnL2();

      // Sequential L2 - Group 1 (ETH)
      this.logResult('L2 Group 1 (ETH)', 'info');
      await this.bridgeFundsL2ToL1();
      await this.claimFundsOnL1();

      // Sequential L2 - Group 2 (ERC20)
      this.logResult('L2 Group 2 (ERC20)', 'info');
      await this.deployERC20OnL2();
      await this.bridgeERC20L2ToL1();
      await this.claimERC20OnL1();

      this.logResult('L2 Groups completed', 'success');
    } catch (error) {
      this.handleGroupError('L2 Groups', error);
    }
  }

  private handleError(error: unknown): void {
    if (error instanceof WalletFundingError) {
      this.error(`E2E Test failed due to wallet funding issues: ${error.message}`);
    } else if (error instanceof BridgingError) {
      this.error(`E2E Test failed due to bridging issues: ${error.message}`);
    } else if (error instanceof DeploymentError) {
      this.error(`E2E Test failed due to contract deployment issues: ${error.message}`);
    } else if (error instanceof ConfigurationError) {
      this.error(`E2E Test failed due to configuration issues: ${error.message}`);
    } else if (error instanceof NetworkError) {
      this.error(`E2E Test failed due to network issues: ${error.message}`);
    } else if (error instanceof Error) {
      this.error(`E2E Test failed: ${error.message}`);
    } else {
      this.error(`E2E Test failed due to an unknown error`);
    }
  }

  private handleGroupError(groupName: string, error: unknown): void {
    if (error instanceof BridgingError || error instanceof DeploymentError) {
      this.error(`${groupName} failed: ${error.message}`);
    } else if (error instanceof Error) {
      this.error(`${groupName} failed due to an unexpected error: ${error.message}`);
    } else {
      this.error(`${groupName} failed due to an unknown error`);
    }
    throw error;
  }

  // Generate a new random wallet to run all tests.
  private async generateNewWallet(): Promise<void> {
    const randomWallet = ethers.Wallet.createRandom()
    this.wallet = new ethers.Wallet(randomWallet.privateKey, this.l1Provider)
    this.logResult(`Generated new wallet: ${chalk.cyan(this.wallet.address)}`, 'success')
    this.logResult(`Private Key: ${chalk.yellow(this.wallet.privateKey)}`, 'warning')
  }


  private async fundWalletOnL1(): Promise<void> {
    try {
      if (this.fundingWallet && !this.manualFunding) {
        this.logResult('Sending funds to new wallet...')
        await this.fundWalletWithEth(FUNDING_AMOUNT, Layer.L1);
        return
      }

      await this.promptManualFunding(this.wallet.address, FUNDING_AMOUNT, Layer.L1);

      this.results.fundWalletOnL1.complete = true;
    } catch (error) {
      throw new WalletFundingError(`Failed to fund wallet on L1: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  private async fundWalletWithEth(amount: number = FUNDING_AMOUNT, layer: Layer = Layer.L1): Promise<void> {
    const wallet = layer === Layer.L1 ? this.fundingWallet : new Wallet(this.fundingWallet.privateKey, this.l2Provider);
    const tx = await wallet.sendTransaction({
      to: this.wallet.address,
      value: ethers.parseEther(amount.toString())
    })
    await tx.wait()
    this.logResult(`Funded wallet with ${amount} ETH: ${tx.hash}`)
  }

  private async bridgeFundsL1ToL2(): Promise<void> {
    try {
      // Implement bridging funds from L1 to L2
      this.logResult('Bridging funds from L1 to L2', 'info')

      const amount = ethers.parseEther((FUNDING_AMOUNT / 2).toString());
      const gasLimit = BigInt(170000); // Adjust this value as needed
      // TODO: what's the best way to determine the gasLimit?

      const l2BaseFee = await getGasOracleL2BaseFee(this.l1Rpc, this.l1MessegeQueueProxyAddress)
      const value = ethers.parseEther((FUNDING_AMOUNT / 2 + 0.00002).toString());

      // Create the contract instance
      const l1ETHGateway = new ethers.Contract(this.l1ETHGateway, l1ETHGatewayABI, this.wallet.connect(this.l1Provider));

      // const value = amount + ethers.parseEther(`${gasLimit*l2BaseFee} wei`);
      this.logResult(`Depositing ${amount} by sending ${value} to ${await l1ETHGateway.getAddress()}`)

      const tx = await l1ETHGateway.depositETH(amount, gasLimit, { value });
      this.results.bridgeFundsL1ToL2.L1DepositETHTx = tx.hash

      this.logTx(tx.hash, 'Transaction sent');
      const receipt = await tx.wait();
      const blockNumber = receipt?.blockNumber;

      this.logResult(`Transaction mined in block: ${chalk.cyan(blockNumber)}`, 'success');

      const { queueIndex, l2TxHash } = await getCrossDomainMessageFromTx(tx.hash, this.l1Rpc, this.l1MessegeQueueProxyAddress);
      this.results.bridgeFundsL1ToL2.L2ETHBridgeTx = l2TxHash

      this.logResult(`Waiting for the following tx on L2: ${chalk.cyan(l2TxHash)}`, 'info');

      let isFinalized = false;
      while (!isFinalized) {

        const finalizedBlockNumber = await getFinalizedBlockHeight(this.l1Rpc);

        if (blockNumber >= finalizedBlockNumber) {
          isFinalized = true;
          this.logResult(`Block ${blockNumber} is finalized. Bridging should be completed soon.`, 'success');
        } else {
          // TODO: This doesn't work on Sepolia? Look into it.
          this.logResult(`Waiting for block ${blockNumber} to be finalized, current height is ${finalizedBlockNumber}`, 'info');
        }

        const queueHeight = await getPendingQueueIndex(this.l1Rpc, this.l1MessegeQueueProxyAddress);

        this.logResult(`Current bridge queue position is ${queueHeight}, pending tx is position ${queueIndex}`, 'info')

        // await new Promise(resolve => setTimeout(resolve, 20000)); // Wait for 10 seconds -- todo, communicate this better and detect better
      }

      // Now that the block is finalized, check L2 for the l2TxHash every 20 seconds.
      const l2TxLink = txLink(l2TxHash, { rpc: this.l2Provider })

      this.logResult(`Waiting for ${chalk.cyan(l2TxLink)}...`, 'info')
      const l2TxReceipt = await awaitTx(l2TxHash, this.l2Provider)

      this.log(`${chalk.gray(JSON.stringify(l2TxReceipt, null, 2))}`)

      this.logResult('Bridging funds from L1 to L2 completed', 'success');
    } catch (error) {
      throw new BridgingError(`Error bridging funds from L1 to L2: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async deployERC20OnL1(): Promise<void> {
    try {
      // Implement deploying ERC20 on L1
      this.logResult('Deploying ERC20 on L1', 'info')
      this.results.deployERC20OnL1.complete = true;
    } catch (error) {
      throw new DeploymentError(`Failed to deploy ERC20 on L1: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async bridgeERC20L1ToL2(): Promise<void> {
    try {
      // Implement bridging ERC20 from L1 to L2
      this.logResult('Bridging ERC20 from L1 to L2', 'info')
      this.results.bridgeERC20L1ToL2.complete = true;
    } catch (error) {
      throw new BridgingError(`Error bridging ERC20 from L1 to L2: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async promptUserForL2Funding(): Promise<string> {

    const funderBalance = this.fundingWallet ? await this.l2Provider.getBalance(this.fundingWallet.address) : 0n;

    const answer = await select({
      message: 'Wait for Bridge to complete or directly funds on L2?',
      choices: [
        {
          name: 'Bridge',
          value: 'bridge',
          description: 'Wait for bridge tx to complete.',
        },
        new Separator(),
        {
          name: 'L1 Funder',
          value: 'funder',
          description: 'Use the deployer or funding wallet private key.',
          disabled: funderBalance < FUNDING_AMOUNT / 2,
        },
        {
          name: 'Manual Funding',
          value: 'manual',
          description: 'Use your own wallet to fund the address.'
        },
      ],
    });

    return answer

  }

  private async fundWalletOnL2(): Promise<void> {

    // Starts after this.bridgeFundsL1toL2 is completed
    let answer = await this.promptUserForL2Funding()

    // if (response.action === 'Directly fund L2 wallet') {
    if (answer === "bridge") {
      // TODO: handle some async stuff in parallel
      this.logResult(`Waiting for L1 -> L2 bridge to complete...`, 'info')

      // Wait for this.bridgeFundsL1ToL2 to complete -- signaled by this.results.bridgeFundsL1ToL2.complete becoming true

      this.results.fundWalletOnL2.complete = true;

      return
    }

    if (this.fundingWallet && answer === "funder") {
      this.logResult('Sending funds to new wallet...', 'info')
      await this.fundWalletWithEth(FUNDING_AMOUNT / 2, Layer.L2);

      this.results.fundWalletOnL2.complete = true;

      return
    }

    await this.promptManualFunding(this.wallet.address, FUNDING_AMOUNT / 2, Layer.L2);

    this.results.fundWalletOnL2.complete = true;
  }

  private async deployERC20OnL2(): Promise<void> {
    try {
      // Implement deploying ERC20 on L2
      this.logResult('Deploying ERC20 on L2', 'info')
    } catch (error) {
      throw new DeploymentError(`Failed to deploy ERC20 on L2: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async bridgeFundsL2ToL1(): Promise<void> {
    try {
      this.logResult('Bridging funds from L2 to L1', 'info')

      const amount = ethers.parseEther((FUNDING_AMOUNT / 4).toString());

      const value = ethers.parseEther((FUNDING_AMOUNT / 2 + 0.00002).toString());

      // Create the contract instance
      const l2ETHGateway = new ethers.Contract(this.l2ETHGateway, l2ETHGatewayABI, this.wallet.connect(this.l2Provider));

      // const value = amount + ethers.parseEther(`${gasLimit*l2BaseFee} wei`);
      this.logResult(`Withdrawing ${amount} by sending ${value} to ${await l2ETHGateway.getAddress()}`, 'info')

      const tx = await l2ETHGateway.withdrawETH(amount, 0, { value });
      this.results.bridgeFundsL2ToL1.L2DepositETHTx = tx.hash

      this.logTx(tx.hash, 'Transaction sent');
      const receipt = await tx.wait();
      const blockNumber = receipt?.blockNumber;

      this.logResult(`Transaction mined in block: ${chalk.cyan(blockNumber)}`, 'success');

      const { l2TxHash, queueIndex } = await getCrossDomainMessageFromTx(tx.hash, this.l1Rpc, this.l1MessegeQueueProxyAddress);
      this.results.bridgeFundsL1ToL2.L2ETHBridgeTx = l2TxHash

      this.logResult(`Waiting for the following tx on L2: ${chalk.cyan(l2TxHash)}`, 'info');

      let isFinalized = false;
      while (!isFinalized) {

        const finalizedBlockNumber = await getFinalizedBlockHeight(this.l1Rpc);

        if (blockNumber >= finalizedBlockNumber) {
          isFinalized = true;
          this.logResult(`Block ${blockNumber} is finalized. Bridging should be completed soon.`, 'success');
        } else {
          // TODO: This doesn't work on Sepolia? Look into it.
          this.logResult(`Waiting for block ${blockNumber} to be finalized, current height is ${finalizedBlockNumber}`, 'info');
        }

        const queueHeight = await getPendingQueueIndex(this.l1Rpc, this.l1MessegeQueueProxyAddress);

        this.logResult(`Current bridge queue position is ${queueHeight}, pending tx is position ${queueIndex}`, 'info')

        // await new Promise(resolve => setTimeout(resolve, 20000)); // Wait for 10 seconds -- todo, communicate this better and detect better
      }

      // Now that the block is finalized, check L2 for the l2TxHash every 20 seconds.
      const l2TxLink = txLink(l2TxHash, { rpc: this.l2Provider })

      this.logResult(`Waiting for ${chalk.cyan(l2TxLink)}...`, 'info')
      const l2TxReceipt = await awaitTx(l2TxHash, this.l2Provider)

      this.log(`${chalk.gray(JSON.stringify(l2TxReceipt, null, 2))}`)
    } catch (error) {
      throw new BridgingError(`Error bridging funds from L2 to L1: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async bridgeERC20L2ToL1(): Promise<void> {
    try {
      // Implement bridging ERC20 from L2 to L1
      this.logResult('Bridging ERC20 from L2 to L1', 'info')
    } catch (error) {
      throw new BridgingError(`Error bridging ERC20 from L2 to L1: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async claimFundsOnL1(): Promise<void> {
    try {
      // Implement claiming funds on L1
      this.logResult('Claiming funds on L1', 'info')
    } catch (error) {
      throw new Error(`Error claiming funds on L1: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async claimERC20OnL1(): Promise<void> {
    try {
      // Implement claiming ERC20 on L1
      this.logResult('Claiming ERC20 on L1', 'info')
    } catch (error) {
      throw new Error(`Error claiming ERC20 on L1: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async promptManualFunding(address: string, amount: number, layer: Layer) {

    let chainId = layer === Layer.L1 ? (await this.l1Provider.getNetwork()).chainId : (await this.l2Provider.getNetwork()).chainId
    let qrString = ""
    qrString += "ethereum:"
    qrString += address
    qrString += "@"
    qrString += chainId
    qrString += "&value="
    qrString += amount / 2

    this.logResult(`Please fund the following address with ${chalk.yellow(amount)} ETH:`, 'warning');
    this.logResult(chalk.cyan(address), 'info');
    this.log('\n');
    this.logResult(`ChainID: ${chalk.cyan(Number(chainId))}`, 'info');
    this.logResult(`Chain RPC: ${chalk.cyan(layer === Layer.L1 ? this.l1Rpc : this.l2Rpc)}`, 'info');
    this.log('\n');
    this.logResult('Scan this QR code to fund the address:', 'info');

    this.log(await QRCode.toString(qrString, { type: 'terminal', small: true }))

    let funded = false;

    while (!funded) {

      const answer = await confirm({ message: 'Done?' });

      this.logResult(`Checking...`, 'info')
      // Check if wallet is actually funded -- if not, we'll loop.

      let balance = layer === Layer.L1 ? await this.l1Provider.getBalance(address) : await this.l2Provider.getBalance(address);
      let formattedBalance = ethers.formatEther(balance);

      if (parseFloat(formattedBalance) >= amount) {
        this.logResult(`Wallet Balance: ${chalk.green(formattedBalance)}`, 'success')
        funded = true;
      } else {
        this.logResult(`Balance is only ${chalk.red(formattedBalance)}. Please fund the wallet.`, 'warning')
      }

    }
  }
}
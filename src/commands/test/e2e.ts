import { Args, Command, Flags } from '@oclif/core'
import { ethers } from 'ethers'
import { confirm, select, Separator } from '@inquirer/prompts'
import QRCode from 'qrcode'
import { parseTomlConfig } from '../../utils/config-parser.js'
import path from 'path'
import {
  addressLink,
  awaitTx,
  blockLink,
  erc20ABI,
  erc20Bytecode,
  getCrossDomainMessageFromTx,
  getFinalizedBlockHeight,
  getGasOracleL2BaseFee,
  getL2TokenFromL1Address,
  getPendingQueueIndex,
  getWithdrawals,
  l1ETHGatewayABI,
  l2ETHGatewayABI,
  l1GatewayRouterABI,
  l2GatewayRouterWithdrawERC20ABI,
  l1MessengerRelayMessageWithProofABI,
  scrollERC20ABI,
  txLink,
} from '../../utils/onchain/index.js'
import { Wallet } from 'ethers'
import chalk from 'chalk';
import ora from 'ora'

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
  private l1GatewayRouter!: string
  private l2GatewayRouter!: string
  private l1Messenger!: string
  private l1MessegeQueueProxyAddress!: string
  private bridgeApiUrl!: string
  private mockFinalizeEnabled!: boolean
  private mockFinalizeTimeout!: number

  private results: {
    bridgeFundsL1ToL2: {
      l1DepositTx?: string;
      l2MessengerTx?: string;
      queueIndex?: number;
      complete: boolean;
    };
    bridgeFundsL2ToL1: {
      l2WithdrawTx?: string;
      complete: boolean
    };
    bridgeERC20L1ToL2: {
      l1DepositTx?: string;
      l2MessengerTx?: string;
      queueIndex?: number;
      l2TokenAddress?: string;
      complete: boolean;
    };
    bridgeERC20L2ToL1: {
      l2WithdrawTx?: string;
      complete: boolean;
    };
    claimERC20OnL1: {
      complete: boolean;
      l1ClaimTx?: string;
    };
    claimETHOnL1: {
      complete: boolean;
      l1ClaimTx?: string;
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
    fundWalletOnL1: {
      complete: boolean;
    };
    fundWalletOnL2: {
      complete: boolean;
    }
  } = {
      bridgeFundsL1ToL2: { complete: false },
      bridgeFundsL2ToL1: { complete: false },
      bridgeERC20L1ToL2: { complete: false },
      bridgeERC20L2ToL1: { complete: false },
      claimETHOnL1: { complete: false },
      claimERC20OnL1: { complete: false },
      deployERC20OnL1: { complete: false },
      deployERC20OnL2: { complete: false },
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

  private async logTx(txHash: string, description: string, layer: Layer): Promise<void> {
    const link = await txLink(txHash, { rpc: layer === Layer.L1 ? this.l1Provider : this.l2Provider });
    this.logResult(`${description}: ${chalk.cyan(link)}`, 'info');
  }

  private async logAddress(address: string, description: string, layer: Layer): Promise<void> {
    const link = await addressLink(address, { rpc: layer === Layer.L1 ? this.l1Provider : this.l2Provider });
    this.logResult(`${description}: ${chalk.cyan(link)}`, 'info');
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
      this.skipWalletGen = flags.skip_wallet_generation
      this.l1ETHGateway = contractsConfig.L1_ETH_GATEWAY_PROXY_ADDR
      this.l2ETHGateway = contractsConfig.L2_ETH_GATEWAY_PROXY_ADDR
      this.l1GatewayRouter = contractsConfig.L1_GATEWAY_ROUTER_PROXY_ADDR
      this.l2GatewayRouter = contractsConfig.L2_GATEWAY_ROUTER_PROXY_ADDR
      this.l1MessegeQueueProxyAddress = contractsConfig.L1_MESSAGE_QUEUE_PROXY_ADDR
      this.l1Messenger = contractsConfig.L1_SCROLL_MESSENGER_PROXY_ADDR
      this.mockFinalizeEnabled = config?.general.TEST_ENV_MOCK_FINALIZE_ENABLED === "true" ? true : false
      this.mockFinalizeTimeout = config?.general.TEST_ENV_MOCK_FINALIZE_TIMEOUT_SEC ? parseInt(contractsConfig.TEST_ENV_MOCK_FINALIZE_TIMEOUT_SEC) : 0
      this.bridgeApiUrl = config?.frontend.BRIDGE_API_URI

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

      this.logSection('Setup L1');
      // Setup L1
      if (!this.skipWalletGen) {
        this.logSection('Generate and Fund Wallets');
        await this.generateNewWallet();
        await this.fundWalletOnL1();
      }

      this.logSection('Initiate ETH Deposit on L1');
      await this.bridgeFundsL1ToL2();
      await this.shortPause()

      this.logSection('Deploying ERC20 on L1');
      await this.deployERC20OnL1();
      await this.shortPause()


      this.logSection('Initiate ERC20 Deposit on L1');
      await this.bridgeERC20L1ToL2();
      await this.shortPause()

      // Setup L2
      this.logSection('Setup L2');
      await this.fundWalletOnL2();
      await this.shortPause()

      if (!this.results.fundWalletOnL2.complete) {
        this.logSection('Waiting for L1 ETH Deposit');
        await this.completeL1ETHDeposit();
        await this.shortPause()
      }

      this.logSection('Initiate ETH Withdrawal on L2');
      await this.bridgeFundsL2ToL1();
      await this.shortPause()

      this.logSection('Deploying an ERC20 on L2');
      await this.deployERC20OnL2()
      await this.shortPause()

      this.logSection('Waiting for L1 ERC20 Deposit');
      await this.completeL1ERC20Deposit();
      await this.shortPause()
      await this.shortPause()
      await this.shortPause()
      await this.shortPause()
      await this.shortPause()
      await this.shortPause()
      await this.shortPause()

      this.logSection('Bridging ERC20 Back to L1');
      await this.bridgeERC20L2ToL1();
      await this.shortPause()


      this.logSection('Claiming ETH and ERC20 on L1');
      await this.claimFundsOnL1();
      await this.shortPause()
      await this.claimERC20OnL1();
      await this.shortPause()

      this.logResult('E2E Test completed successfully', 'success');
    } catch (error) {
      this.handleError(error);
    }
  }

  private async shortPause() {
    // Sleep for 0.5 second
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  private async completeL1ETHDeposit(): Promise<void> {
    try {
      this.logResult('Waiting for L1 ETH deposit to complete on L2...', 'info');

      if (!this.results.bridgeFundsL1ToL2.l2MessengerTx) {
        throw new BridgingError('L2 destination transaction hash is missing.');
      }

      const spinner = ora('Waiting for L2 transaction to be mined...').start();

      try {
        // Wait for the L2 transaction to be mined
        const l2Receipt = await this.l2Provider.waitForTransaction(this.results.bridgeFundsL1ToL2.l2MessengerTx);

        if (l2Receipt && l2Receipt.status === 1) {
          spinner.succeed('L1 ETH deposit successfully completed on L2');
          this.results.bridgeFundsL1ToL2.complete = true;
        } else {
          spinner.fail('L2 transaction failed or was reverted.');
          throw new BridgingError('L2 transaction failed or was reverted.');
        }
      } catch (error) {
        spinner.fail('Failed to complete L1 ETH deposit');
        throw error;
      }
    } catch (error) {
      throw new BridgingError(`Failed to complete L1 ETH deposit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async completeL1ERC20Deposit(): Promise<void> {
    try {
      this.logResult('Waiting for L1 ERC20 deposit to complete on L2...', 'info');

      if (!this.results.bridgeERC20L1ToL2.l2MessengerTx) {
        throw new BridgingError('L2 destination transaction hash for ERC20 deposit is missing.');
      }

      const spinner = ora('Waiting for L2 transaction to be mined...').start();

      try {
        // Wait for the L2 transaction to be mined
        const l2Receipt = await this.l2Provider.waitForTransaction(this.results.bridgeERC20L1ToL2.l2MessengerTx);

        if (l2Receipt && l2Receipt.status === 1) {
          spinner.succeed('L1 ERC20 deposit successfully completed on L2');
          this.results.bridgeERC20L1ToL2.complete = true;
        } else {
          spinner.fail('L2 ERC20 deposit transaction failed or was reverted.');
          throw new BridgingError('L2 ERC20 deposit transaction failed or was reverted.');
        }
      } catch (error) {
        spinner.fail('Failed to complete L1 ERC20 deposit');
        throw error;
      }
    } catch (error) {
      throw new BridgingError(`Failed to complete L1 ERC20 deposit: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    await this.logAddress(this.wallet.address, 'Generated new wallet', Layer.L1);
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
    await this.logTx(tx.hash, `Funded wallet with ${amount} ETH`, layer);
  }

  private async bridgeFundsL1ToL2(): Promise<void> {
    try {
      // Implement bridging funds from L1 to L2
      this.logResult('Bridging funds from L1 to L2', 'info')

      const amount = ethers.parseEther((FUNDING_AMOUNT / 2).toString());
      const gasLimit = BigInt(170000); // Adjust this value as needed
      // TODO: what's the best way to determine the gasLimit?

      const l2BaseFee = await getGasOracleL2BaseFee(this.l1Rpc, this.l1MessegeQueueProxyAddress)
      const value = ethers.parseEther((FUNDING_AMOUNT / 2 + 0.001).toString());

      // Create the contract instance
      const l1ETHGateway = new ethers.Contract(this.l1ETHGateway, l1ETHGatewayABI, this.wallet.connect(this.l1Provider));

      // const value = amount + ethers.parseEther(`${gasLimit*l2BaseFee} wei`);
      await this.logAddress(await l1ETHGateway.getAddress(), `Depositing ${amount} by sending ${value} to`, Layer.L1);

      const tx = await l1ETHGateway.depositETH(amount, gasLimit, { value });

      await this.logTx(tx.hash, 'Transaction sent', Layer.L1);
      const receipt = await tx.wait();
      const blockNumber = receipt?.blockNumber;

      this.logResult(`Transaction mined in block: ${chalk.cyan(blockNumber)}`, 'success');

      const { queueIndex, l2TxHash } = await getCrossDomainMessageFromTx(tx.hash, this.l1Rpc, this.l1MessegeQueueProxyAddress);

      this.results.bridgeFundsL1ToL2 = {
        l1DepositTx: tx.hash,
        complete: false,
        l2MessengerTx: l2TxHash,
        queueIndex
      };

      // await this.logTx(l2TxHash, 'Waiting for the following tx on L2', Layer.L2);

      // let isFinalized = false;
      // while (!isFinalized) {

      //   const finalizedBlockNumber = await getFinalizedBlockHeight(this.l1Rpc);

      //   if (blockNumber >= finalizedBlockNumber) {
      //     isFinalized = true;
      //     this.logResult(`Block ${blockNumber} is finalized. Bridging should be completed soon.`, 'success');
      //   } else {
      //     // TODO: This doesn't work on Sepolia? Look into it.
      //     this.logResult(`Waiting for block ${blockNumber} to be finalized, current height is ${finalizedBlockNumber}`, 'info');
      //   }

      //   const queueHeight = await getPendingQueueIndex(this.l1Rpc, this.l1MessegeQueueProxyAddress);

      //   this.logResult(`Current bridge queue position is ${queueHeight}, pending tx is position ${queueIndex}`, 'info')

      //   await new Promise(resolve => setTimeout(resolve, 20000)); // Wait for 10 seconds -- todo, communicate this better and detect better
      // }

      // // Now that the block is finalized, check L2 for the l2TxHash every 20 seconds.
      // const l2TxLink = await txLink(l2TxHash, { rpc: this.l2Provider })

      // this.logResult(`Waiting for ${chalk.cyan(l2TxLink)}...`, 'info')
      // const l2TxReceipt = await awaitTx(l2TxHash, this.l2Provider)

      // this.log(`${chalk.gray(JSON.stringify(l2TxReceipt, null, 2))}`)

      // this.logResult('Bridging funds from L1 to L2 completed', 'success');
    } catch (error) {
      throw new BridgingError(`Error bridging funds from L1 to L2: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async deployERC20OnL1(): Promise<void> {
    try {
      // Implement deploying ERC20 on L1
      this.logResult('Deploying ERC20 on L1', 'info')
      // Deploy new TKN ERC20 token and mint 1000 to admin wallet
      const tokenContract = await this.deployERC20(Layer.L1)

      this.logAddress(tokenContract, "Token successfully deployed", Layer.L1)

      this.results.deployERC20OnL1.address = tokenContract
      this.results.deployERC20OnL1.complete = true;
    } catch (error) {
      throw new DeploymentError(`Failed to deploy ERC20 on L1: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async bridgeERC20L1ToL2(): Promise<void> {
    try {
      // Implement bridging ERC20 from L1 to L2
      this.logResult('Bridging ERC20 from L1 to L2', 'info')
      // Wait for token balance to exist in wallet before proceeding
      const erc20Address = this.results.deployERC20OnL1.address;
      if (!erc20Address) {
        throw new Error("ERC20 address not found. Make sure deployERC20OnL1 was successful.");
      }

      const erc20Contract = new ethers.Contract(erc20Address, erc20ABI, this.wallet.connect(this.l1Provider));

      let balance = BigInt(0);
      let attempts = 0;
      const delay = 15000; // 15 seconds

      while (balance === BigInt(0)) {
        balance = await erc20Contract.balanceOf(this.wallet.address);
        if (balance > BigInt(0)) {
          this.logResult(`Token balance found: ${balance.toString()}`, 'success');
          break;
        }
        attempts++;
        this.logResult(`Waiting for token balance...`, 'info');
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const halfBalance = balance / 2n;

      // Set allowance for l1GatewayRouter
      const approvalTx = await erc20Contract.approve(this.l1GatewayRouter, halfBalance);
      await approvalTx.wait();

      this.logResult(`Approved ${halfBalance} tokens for L1GatewayRouter`, 'success');

      // Create L1GatewayRouter contract instance
      const l1GatewayRouter = new ethers.Contract(this.l1GatewayRouter, l1GatewayRouterABI, this.wallet.connect(this.l1Provider));

      // Call depositERC20
      const depositTx = await l1GatewayRouter.depositERC20(erc20Address, halfBalance, 200000, { value: ethers.parseEther("0.0005") });
      // TODO: figure out value here
      await depositTx.wait();

      // const blockNumber = receipt?.blockNumber;

      // Get L2TokenAddress from L1 Contract Address
      const l2TokenAddress = await getL2TokenFromL1Address(erc20Address, this.l1Rpc, this.l1GatewayRouter);
      const { queueIndex, l2TxHash } = await getCrossDomainMessageFromTx(depositTx.hash, this.l1Rpc, this.l1MessegeQueueProxyAddress)

      this.logTx(depositTx.hash, `Deposit transaction sent`, Layer.L1);
      this.logAddress(l2TokenAddress, `L2 Token Address`, Layer.L2);
      this.logTx(l2TxHash, `L2 Messenger Tx`, Layer.L2);

      this.results.bridgeERC20L1ToL2 = {
        l1DepositTx: depositTx.hash,
        complete: false,
        l2MessengerTx: l2TxHash,
        l2TokenAddress,
        queueIndex
      };

      // let isFinalized = false;
      // while (!isFinalized) {

      //   const finalizedBlockNumber = await getFinalizedBlockHeight(this.l1Rpc);

      //   if (blockNumber >= finalizedBlockNumber) {
      //     isFinalized = true;
      //     this.logResult(`Block ${blockNumber} is finalized. Bridging should be completed soon.`, 'success');
      //   } else {
      //     // TODO: This doesn't work on Sepolia? Look into it.
      //     this.logResult(`Waiting for block ${blockNumber} to be finalized, current height is ${finalizedBlockNumber}`, 'info');
      //   }

      //   const queueHeight = await getPendingQueueIndex(this.l1Rpc, this.l1MessegeQueueProxyAddress);

      //   this.logResult(`Current bridge queue position is ${queueHeight}, pending tx is position ${queueIndex}`, 'info')

      //   await new Promise(resolve => setTimeout(resolve, 20000)); // Wait for 10 seconds -- todo, communicate this better and detect better
      // }


      // // Now that the block is finalized, check L2 for the l2TxHash every 20 seconds.
      // const l2TxLink = await txLink(l2TxHash, { rpc: this.l2Provider })

      // this.logResult(`Waiting for ${chalk.cyan(l2TxLink)}...`, 'info')
      // const l2TxReceipt = await awaitTx(l2TxHash, this.l2Provider)

      // this.log(`${chalk.gray(JSON.stringify(l2TxReceipt, null, 2))}`)

      // this.logResult('Bridging funds from L1 to L2 completed', 'success');


      // this.results.bridgeERC20L1ToL2.complete = true;

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

      // will check this later in the main flow...

      this.results.fundWalletOnL2.complete = false;

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

      // Deploy new TKN ERC20 token and mint 1000 to admin wallet
      const tokenContract = await this.deployERC20(Layer.L2)

      this.logAddress(tokenContract, "Token successfully deployed", Layer.L2)

      this.results.deployERC20OnL2.address = tokenContract
      this.results.deployERC20OnL2.complete = true


    } catch (error) {
      throw new DeploymentError(`Failed to deploy ERC20 on L2: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async bridgeFundsL2ToL1(): Promise<void> {
    try {
      this.logResult('Bridging funds from L2 to L1', 'info')

      const amount = ethers.parseEther((FUNDING_AMOUNT / 4).toString());
      const value = amount;
      // const value = ethers.parseEther((FUNDING_AMOUNT / 4 + 0.001).toString());
      // TODO: sort out how to set value here

      // Create the contract instance
      const l2ETHGateway = new ethers.Contract(this.l2ETHGateway, l2ETHGatewayABI, this.wallet.connect(this.l2Provider));

      // const value = amount + ethers.parseEther(`${gasLimit*l2BaseFee} wei`);
      await this.logAddress(await l2ETHGateway.getAddress(), `Withdrawing ${amount} by sending ${value} to`, Layer.L2);

      const tx = await l2ETHGateway.withdrawETH(amount, 0, { value });
      this.results.bridgeFundsL2ToL1.l2WithdrawTx = tx.hash

      await this.logTx(tx.hash, 'Transaction sent', Layer.L2);
      const receipt = await tx.wait();
      const blockNumber = receipt?.blockNumber;

      this.logResult(`Transaction mined in block: ${chalk.cyan(blockNumber)}`, 'success');

      this.results.bridgeFundsL2ToL1.complete = true;

    } catch (error) {
      throw new BridgingError(`Error bridging funds from L2 to L1: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async bridgeERC20L2ToL1(): Promise<void> {
    try {
      // Implement bridging ERC20 from L2 to L1
      this.logResult('Bridging L1-originated ERC20 from L2 to L1', 'info')

      // Wait for token balance to exist in wallet before proceeding
      const erc20Address = this.results.bridgeERC20L1ToL2.l2TokenAddress;
      if (!erc20Address) {
        throw new Error("ERC20 address not found. Make sure deployERC20OnL1 was successful.");
      }

      const erc20Contract = new ethers.Contract(erc20Address, scrollERC20ABI, this.wallet.connect(this.l2Provider));

      let balance = BigInt(0);
      let attempts = 0;
      const delay = 15000; // 15 seconds

      while (balance === BigInt(0)) {
        this.logResult(`Getting token balance...`, 'info');
        balance = await erc20Contract.balanceOf(this.wallet.address);
        if (balance > BigInt(0)) {
          this.logResult(`Token balance found: ${balance.toString()}`, 'success');
          break;
        }
        attempts++;
        this.logResult(`Waiting for token balance...`, 'info');
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const halfBalance = balance / 2n;

      // Set allowance for l2GatewayRouter
      const approvalTx = await erc20Contract.approve(this.l2GatewayRouter, halfBalance);
      await approvalTx.wait();

      this.logResult(`Approved ${halfBalance} tokens for L2GatewayRouter`, 'success');

      // Create L2GatewayRouter contract instance
      const l2GatewayRouter = new ethers.Contract(this.l2GatewayRouter, l2GatewayRouterWithdrawERC20ABI, this.wallet.connect(this.l2Provider));

      // Call withdrawERC20
      const withdrawTx = await l2GatewayRouter.withdrawERC20(erc20Address, halfBalance, 0, { value: 0 });
      const receipt = await withdrawTx.wait();

      this.logResult(`Withdrawal transaction sent: ${withdrawTx.hash}`, 'success');
      this.results.bridgeERC20L2ToL1 = {
        l2WithdrawTx: withdrawTx.hash,
        complete: true
      };

    } catch (error) {
      throw new BridgingError(`Error bridging ERC20 from L2 to L1: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async claimFundsOnL1(): Promise<void> {

    try {
      // Implement claiming funds on L1
      this.logResult('Claiming funds on L1', 'info')

      if (this.mockFinalizeEnabled) {
        this.logResult(`Config shows finalization timeout enabled at ${this.mockFinalizeTimeout} seconds. May need to wait...`)
      } else {
        this.logResult(`Proof generation can take up to 1h. Please wait...`)
      }

      if (this.results.bridgeFundsL2ToL1.l2WithdrawTx === undefined) {
        throw new BridgingError('L2 deposit ETH transaction hash is undefined. Cannot claim funds on L1.');
      }

      const txHash = await this.findAndExecuteWithdrawal(this.results.bridgeFundsL2ToL1.l2WithdrawTx)

      this.results.claimETHOnL1.complete = true
      this.results.claimETHOnL1.l1ClaimTx = txHash


    } catch (error) {
      throw new Error(`Error claiming funds on L1: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async claimERC20OnL1(): Promise<void> {
    try {
      // Implement claiming ERC20 on L1
      this.logResult('Claiming ERC20 on L1', 'info')

      if (this.mockFinalizeEnabled) {
        this.logResult(`Config shows finalization timeout enabled at ${this.mockFinalizeTimeout} seconds. May need to wait...`)
      } else {
        this.logResult(`Proof generation can take up to 1h. Please wait...`)
      }

      if (this.results.bridgeERC20L2ToL1.l2WithdrawTx === undefined) {
        throw new BridgingError('L2 deposit ETH transaction hash is undefined. Cannot claim funds on L1.');
      }

      const txHash = await this.findAndExecuteWithdrawal(this.results.bridgeERC20L2ToL1.l2WithdrawTx)

      this.results.claimERC20OnL1.complete = true
      this.results.claimERC20OnL1.l1ClaimTx = txHash

    } catch (error) {
      throw new Error(`Error claiming ERC20 on L1: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async findAndExecuteWithdrawal(txHash: string) {

    try {

      let unclaimedWithdrawal;

      while (!unclaimedWithdrawal?.claim_info) {
        let withdrawals = await getWithdrawals(this.wallet.address, this.bridgeApiUrl);

        // Check to see if the bridged tx is among unclaimed withdrawals if so, set withdrawalFound to true.
        for (const withdrawal of withdrawals) {
          this.log(withdrawal.hash)
          if (withdrawal.hash === txHash) {
            unclaimedWithdrawal = withdrawal;
            this.logResult(`Found matching withdrawal for transaction: ${txHash}`, 'success');
            break;
          }
        }

        let l1TxHash = unclaimedWithdrawal?.counterpart_chain_tx.hash;
        if (l1TxHash) {
          this.logTx(l1TxHash, "This withdrawal has already been claimed", Layer.L1)
          return
        }

        if (!unclaimedWithdrawal) {
          this.logResult(`Withdrawal not found yet. Waiting...`, 'info');
          await new Promise(resolve => setTimeout(resolve, 20000)); // Wait for 20 seconds before checking again
        } else if (!unclaimedWithdrawal?.claim_info) {
          this.logResult(`Withdrawal seen, but waiting for finalization. Waiting...`, 'info');
          await new Promise(resolve => setTimeout(resolve, 20000)); // Wait for 20 seconds before checking again
        }


      }


      if (!unclaimedWithdrawal.claim_info.claimable) {
        throw new Error(`Claim found, but marked as "unclaimable".`)
      }

      if (!unclaimedWithdrawal?.claim_info) {
        throw new Error(`No claim info in claim withdrawal.`)
      }

      // 

      // Now build and make the withdrawal claim

      // Create the contract instance
      const l1Messenger = new ethers.Contract(this.l1Messenger, l1MessengerRelayMessageWithProofABI, this.wallet.connect(this.l1Provider));

      // const value = amount + ethers.parseEther(`${gasLimit*l2BaseFee} wei`);
      await this.logAddress(await l1Messenger.getAddress(), `Calling relayMessageWithProof on`, Layer.L1);


      const { from, to, value, nonce, message, proof } = unclaimedWithdrawal.claim_info;

      const tx = await l1Messenger.relayMessageWithProof(from, to, value, nonce, message, { batchIndex: proof.batch_index, merkleProof: proof.merkle_proof });

      await this.logTx(tx.hash, 'Transaction sent', Layer.L1);
      const receipt = await tx.wait();
      const blockNumber = receipt?.blockNumber;

      this.logResult(`Transaction mined in block: ${chalk.cyan(blockNumber)}`, 'success');

      return receipt.hash;


    } catch (error) {
      throw new Error(`Error finding and executing withdrawal on L1: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

    await this.logAddress(address, `Please fund the following address with ${chalk.yellow(amount)} ETH`, layer);
    this.log('\n');
    this.logResult(`ChainID: ${chalk.cyan(Number(chainId))}`, 'info');
    this.logResult(`Chain RPC: ${chalk.cyan(layer === Layer.L1 ? this.l1Rpc : this.l2Rpc)}`, 'info');
    this.log('\n');
    this.logResult('Scan this QR code to fund the address:', 'info');

    this.log(await QRCode.toString(qrString, { type: 'terminal', small: true }))

    let funded = false;

    while (!funded) {

      await confirm({ message: 'Press Enter when ready...' });

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

  private async deployERC20(layer: Layer) {
    try {
      // Choose the correct provider based on the layer
      const provider = layer === Layer.L1 ? this.l1Provider : this.l2Provider;

      // Connect the wallet to the correct provider
      const connectedWallet = this.wallet.connect(provider);

      // Create the contract factory with the connected wallet
      const tokenFactory = new ethers.ContractFactory(erc20ABI, erc20Bytecode, connectedWallet);

      // Deploy the contract
      const tokenContract = await tokenFactory.deploy();

      // Wait for the deployment transaction to be mined
      await tokenContract.waitForDeployment();

      // Get the deployed contract address
      const contractAddress = await tokenContract.getAddress();

      return contractAddress;
    } catch (error) {
      if (error instanceof Error) {
        throw new DeploymentError(`Failed to deploy ERC20 on ${layer === Layer.L1 ? 'L1' : 'L2'}: ${error.message}`);
      } else {
        throw new DeploymentError(`Failed to deploy ERC20 on ${layer === Layer.L1 ? 'L1' : 'L2'}: Unknown error`);
      }
    }
  }
}
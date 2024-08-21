import { Separator, confirm, select } from '@inquirer/prompts'
import {
  // Args,
  Command,
  Flags,
} from '@oclif/core'
import chalk from 'chalk'
import { Wallet, ethers } from 'ethers'
import fs from 'node:fs/promises'
import path from 'node:path'
import ora from 'ora'
import { toString as qrCodeToString } from 'qrcode'

import { parseTomlConfig } from '../../utils/config-parser.js'
import {
  BlockExplorerParams,
  Withdrawal,
  addressLink,
  awaitERC20Balance,
  // awaitTx,
  // blockLink,
  erc20ABI,
  erc20Bytecode,
  getCrossDomainMessageFromTx,
  // getFinalizedBlockHeight,
  // getGasOracleL2BaseFee,
  getL2TokenFromL1Address,
  // getPendingQueueIndex,
  getWithdrawals,
  l1ETHGatewayABI,
  l1GatewayRouterABI,
  l1MessengerRelayMessageWithProofABI,
  l2ETHGatewayABI,
  l2GatewayRouterWithdrawERC20ABI,
  scrollERC20ABI,
  txLink,
} from '../../utils/onchain/index.js'

interface ContractsConfig {
  [key: string]: string
}

enum Layer {
  L1 = 'l1',
  L2 = 'l2',
}

const FUNDING_AMOUNT = 0.004

// Custom error types
class WalletFundingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WalletFundingError'
  }
}

class BridgingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BridgingError'
  }
}

class DeploymentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeploymentError'
  }
}

class ConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

class NetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkError'
  }
}

export default class TestE2e extends Command {
  static description = 'Test contracts by checking deployment and initialization'

  static flags = {
    config: Flags.string({
      char: 'c',
      default: './config.toml',
      description: 'Path to config.toml file',
    }),
    contracts: Flags.string({
      char: 'n',
      default: './config-contracts.toml',
      description: 'Path to configs-contracts.toml file',
    }),
    // eslint-disable-next-line camelcase
    manual: Flags.boolean({ char: 'm', description: 'Manually fund the test wallet.' }),
    pod: Flags.boolean({
      char: 'p',
      default: false,
      description: 'Run inside Kubernetes pod',
    }),
    // eslint-disable-next-line camelcase
    'private-key': Flags.string({ char: 'k', description: 'Private key for funder wallet initialization' }),
    resume: Flags.boolean({
      char: 'r',
      default: false,
      description: 'Uses e2e_resume.json to continue last run.',
    }),
    // eslint-disable-next-line camelcase
    'skip-wallet-generation': Flags.boolean({ char: 's', description: 'Manually fund the test wallet.' }),
  }

  private blockExplorers: Record<Layer, BlockExplorerParams> = {
    [Layer.L1]: { blockExplorerURI: '' },
    [Layer.L2]: { blockExplorerURI: '' },
  }

  private bridgeApiUrl!: string
  private fundingWallet!: ethers.Wallet
  private l1ETHGateway!: string
  private l1GatewayRouter!: string
  private l1MessegeQueueProxyAddress!: string
  private l1Messenger!: string
  private l1Provider!: ethers.JsonRpcProvider
  private l1Rpc!: string
  private l2ETHGateway!: string
  private l2GatewayRouter!: string
  private l2Provider!: ethers.JsonRpcProvider
  private l2Rpc!: string
  private manualFunding: boolean = false
  private mockFinalizeEnabled!: boolean
  private mockFinalizeTimeout!: number

  private results: {
    bridgeERC20L1ToL2: {
      complete: boolean
      l1DepositTx?: string
      l2MessengerTx?: string
      l2TokenAddress?: string
      queueIndex?: number
    }
    bridgeERC20L2ToL1: {
      complete: boolean
      l2WithdrawTx?: string
    }
    bridgeFundsL1ToL2: {
      complete: boolean
      l1DepositTx?: string
      l2MessengerTx?: string
      queueIndex?: number
    }
    bridgeFundsL2ToL1: {
      complete: boolean
      l2WithdrawTx?: string
    }
    claimERC20OnL1: {
      complete: boolean
      l1ClaimTx?: string
    }
    claimETHOnL1: {
      complete: boolean
      l1ClaimTx?: string
    }
    deployERC20OnL1: {
      address?: string
      complete: boolean
      txHash?: string
    }
    deployERC20OnL2: {
      address?: string
      complete: boolean
      txHash?: string
    }
    fundWalletOnL1: {
      complete: boolean
      generatedPrivateKey?: string // should never store user provided key
      walletAddress?: string
    }
    fundWalletOnL2: {
      complete: boolean
    }
  } = {
      bridgeERC20L1ToL2: { complete: false },
      bridgeERC20L2ToL1: { complete: false },
      bridgeFundsL1ToL2: { complete: false },
      bridgeFundsL2ToL1: { complete: false },
      claimERC20OnL1: { complete: false },
      claimETHOnL1: { complete: false },
      deployERC20OnL1: { complete: false },
      deployERC20OnL2: { complete: false },
      fundWalletOnL1: { complete: false },
      fundWalletOnL2: { complete: false },
    }

  private resumeFilePath: string | undefined

  private skipWalletGen: boolean = false

  private wallet!: ethers.Wallet

  public async run(): Promise<void> {
    try {
      const { flags } = await this.parse(TestE2e)

      const configPath = path.resolve(flags.config)
      const contractsPath = path.resolve(flags.contracts)
      this.manualFunding = flags.manual

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
        throw new ConfigurationError(
          `Missing RPC URL(s) in ${configPath}. Please ensure L1_RPC_ENDPOINT and L2_RPC_ENDPOINT (for pod mode) or EXTERNAL_RPC_URI_L1 and EXTERNAL_RPC_URI_L2 (for non-pod mode) are defined.`,
        )
      }

      const l1BlockExplorer = config?.frontend?.EXTERNAL_EXPLORER_URI_L1
      const l2BlockExplorer = config?.frontend?.EXTERNAL_EXPLORER_URI_L2

      // Check if Blockexplorer URLs are defined
      if (!l1BlockExplorer || !l2BlockExplorer) {
        throw new ConfigurationError(
          `Missing Block Explorer URL(s) in ${configPath}. Please ensure EXTERNAL_EXPLORER_URI_L1 and EXTERNAL_EXPLORER_URI_L1 are defined.`,
        )
      }

      this.blockExplorers.l1.blockExplorerURI = l1BlockExplorer
      this.blockExplorers.l2.blockExplorerURI = l2BlockExplorer

      this.l1Rpc = l1RpcUrl
      this.l2Rpc = l2RpcUrl
      this.skipWalletGen = flags['skip-wallet-generation']
      this.l1ETHGateway = contractsConfig.L1_ETH_GATEWAY_PROXY_ADDR
      this.l2ETHGateway = contractsConfig.L2_ETH_GATEWAY_PROXY_ADDR
      this.l1GatewayRouter = contractsConfig.L1_GATEWAY_ROUTER_PROXY_ADDR
      this.l2GatewayRouter = contractsConfig.L2_GATEWAY_ROUTER_PROXY_ADDR
      this.l1MessegeQueueProxyAddress = contractsConfig.L1_MESSAGE_QUEUE_PROXY_ADDR
      this.l1Messenger = contractsConfig.L1_SCROLL_MESSENGER_PROXY_ADDR
      this.mockFinalizeEnabled = config?.general.TEST_ENV_MOCK_FINALIZE_ENABLED === 'true'
      this.mockFinalizeTimeout = config?.general.TEST_ENV_MOCK_FINALIZE_TIMEOUT_SEC ?? 0
      // TODO: make this work for pod mode
      this.bridgeApiUrl = config?.frontend.BRIDGE_API_URI

      this.l1Provider = new ethers.JsonRpcProvider(l1RpcUrl)
      this.l2Provider = new ethers.JsonRpcProvider(l2RpcUrl)

      if (this.skipWalletGen) {
        this.wallet = new ethers.Wallet(flags['private-key'] ?? config.accounts.DEPLOYER_PRIVATE_KEY)
        this.results.fundWalletOnL1.walletAddress = this.wallet.address
        this.logResult(`Skipping wallet generation, using: ${this.wallet.address}`)
      } else if (flags['private-key']) {
        this.fundingWallet = new ethers.Wallet(flags['private-key'], this.l1Provider)
        this.logResult(`Funding Wallet: ${this.fundingWallet.address}`)
      } else if (config.accounts.DEPLOYER_PRIVATE_KEY && !flags.manual) {
        this.logResult('No funding source found. Using DEPLOYER_PRIVATE_KEY.')
        this.fundingWallet = new ethers.Wallet(config.accounts.DEPLOYER_PRIVATE_KEY, this.l1Provider)
        this.logResult(`Funding Wallet: ${this.fundingWallet.address}`)
      } else {
        this.logResult('No Deploy private key found or provided. (Will prompt to fund L1 address manually.)')
      }

      // Handle resume flag
      if (flags.resume) {
        // we may want a custom resume file in future
        this.resumeFilePath = 'e2e_resume.json'
        await this.loadResumeFile()
        if (this.results.fundWalletOnL1.generatedPrivateKey) {
          this.generateNewWallet(this.results.fundWalletOnL1.generatedPrivateKey)
        }
      }

      await this.runE2ETest()
    } catch (error) {
      this.handleError(error)
    }
  }

  private async bridgeERC20L1ToL2(): Promise<void> {
    try {
      // Implement bridging ERC20 from L1 to L2
      this.logResult('Bridging ERC20 from L1 to L2', 'info')
      // Wait for token balance to exist in wallet before proceeding
      const erc20Address = this.results.deployERC20OnL1.address
      if (!erc20Address) {
        throw new Error('ERC20 address not found. Make sure deployERC20OnL1 was successful.')
      }

      const erc20Contract = new ethers.Contract(erc20Address, erc20ABI, this.wallet.connect(this.l1Provider))

      let balance = BigInt(0)
      // let attempts = 0
      const delay = 15_000 // 15 seconds

      while (balance === BigInt(0)) {
        // eslint-disable-next-line no-await-in-loop
        balance = await erc20Contract.balanceOf(this.wallet.address)
        if (balance > BigInt(0)) {
          this.logResult(`Token balance found: ${balance.toString()}`, 'success')
          break
        }

        // attempts++
        this.logResult(`Waiting for token balance...`, 'info')
        // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      const halfBalance = balance / 2n

      // Set allowance for l1GatewayRouter
      const approvalTx = await erc20Contract.approve(this.l1GatewayRouter, halfBalance)
      await approvalTx.wait()

      this.logResult(`Approved ${halfBalance} tokens for L1GatewayRouter`, 'success')

      // Create L1GatewayRouter contract instance
      const l1GatewayRouter = new ethers.Contract(
        this.l1GatewayRouter,
        l1GatewayRouterABI,
        this.wallet.connect(this.l1Provider),
      )

      // Gas cost for initial ERC20 bridging
      const erc20GasLimitGatewayRouter = 450_000

      // Call depositERC20
      const depositTx = await l1GatewayRouter.depositERC20(erc20Address, halfBalance, erc20GasLimitGatewayRouter, {
        value: ethers.parseEther('0.001'),
      })
      // TODO: figure out value here
      await depositTx.wait()

      // const blockNumber = receipt?.blockNumber;

      // Get L2TokenAddress from L1 Contract Address
      const l2TokenAddress = await getL2TokenFromL1Address(erc20Address, this.l1Rpc, this.l1GatewayRouter)
      const { l2TxHash, queueIndex } = await getCrossDomainMessageFromTx(
        depositTx.hash,
        this.l1Rpc,
        this.l1MessegeQueueProxyAddress,
      )

      this.logTx(depositTx.hash, `Deposit transaction sent`, Layer.L1)
      this.logAddress(l2TokenAddress, `L2 Token Address`, Layer.L2)
      this.logTx(l2TxHash, `L2 Messenger Tx`, Layer.L2)

      this.results.bridgeERC20L1ToL2 = {
        complete: false,
        l1DepositTx: depositTx.hash,
        l2MessengerTx: l2TxHash,
        l2TokenAddress,
        queueIndex,
      }
    } catch (error) {
      throw new BridgingError(
        `Error bridging ERC20 from L1 to L2: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private async bridgeERC20L2ToL1(): Promise<void> {
    try {
      // Implement bridging ERC20 from L2 to L1
      this.logResult('Bridging L1-originated ERC20 from L2 to L1', 'info')

      // Wait for token balance to exist in wallet before proceeding
      const erc20Address = this.results.bridgeERC20L1ToL2.l2TokenAddress
      if (!erc20Address) {
        throw new Error('ERC20 address not found. Make sure deployERC20OnL1 was successful.')
      }

      this.log(JSON.stringify({ erc20Address, rpc: this.l2Rpc, wallet: this.wallet.address }))

      const balance = await awaitERC20Balance(this.wallet.address, erc20Address, this.l2Rpc)

      // let balance = BigInt(0)
      // let attempts = 0
      // const delay = 15_000 // 15 seconds

      // this.logResult(`Getting token balance...`, 'info')
      // while (balance === BigInt(0)) {
      //   try {
      //     balance = await erc20Contract.balanceOf(this.wallet.address)
      //     if (balance > BigInt(0)) {
      //       this.logResult(`Token balance found: ${balance.toString()}`, 'success')
      //       break
      //     }

      //     this.logResult(`Waiting for token balance...`, 'info')
      //   } catch (error) {
      //     this.logResult(
      //       `Error getting token balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
      //       'warning',
      //     )
      //   }

      //   attempts++
      //   await new Promise((resolve) => setTimeout(resolve, delay))
      // }

      const halfBalance = BigInt(Number.parseInt(balance, 10)) / 2n

      // Set allowance for l2GatewayRouter
      const erc20Contract = new ethers.Contract(erc20Address, scrollERC20ABI, this.wallet.connect(this.l2Provider))
      const approvalTx = await erc20Contract.approve(this.l2GatewayRouter, halfBalance)
      await approvalTx.wait()

      this.logResult(`Approved ${halfBalance} tokens for L2GatewayRouter`, 'success')

      // Create L2GatewayRouter contract instance
      const l2GatewayRouter = new ethers.Contract(
        this.l2GatewayRouter,
        l2GatewayRouterWithdrawERC20ABI,
        this.wallet.connect(this.l2Provider),
      )

      // Call withdrawERC20
      const withdrawTx = await l2GatewayRouter.withdrawERC20(erc20Address, halfBalance, 0, { value: 0 })
      await withdrawTx.wait()

      this.logResult(`Withdrawal transaction sent: ${withdrawTx.hash}`, 'success')
      this.results.bridgeERC20L2ToL1 = {
        complete: true,
        l2WithdrawTx: withdrawTx.hash,
      }
    } catch (error) {
      throw new BridgingError(
        `Error bridging ERC20 from L2 to L1: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private async bridgeFundsL1ToL2(): Promise<void> {
    try {
      // Implement bridging funds from L1 to L2
      this.logResult('Bridging funds from L1 to L2', 'info')

      const amount = ethers.parseEther((FUNDING_AMOUNT / 2).toString())
      const gasLimit = BigInt(170_000) // Adjust this value as needed
      // TODO: what's the best way to determine the gasLimit?

      // const l2BaseFee = await getGasOracleL2BaseFee(this.l1Rpc, this.l1MessegeQueueProxyAddress)
      const value = ethers.parseEther((FUNDING_AMOUNT / 2 + 0.001).toString())

      // Create the contract instance
      const l1ETHGateway = new ethers.Contract(this.l1ETHGateway, l1ETHGatewayABI, this.wallet.connect(this.l1Provider))

      // const value = amount + ethers.parseEther(`${gasLimit*l2BaseFee} wei`);
      await this.logAddress(await l1ETHGateway.getAddress(), `Depositing ${amount} by sending ${value} to`, Layer.L1)

      const tx = await l1ETHGateway.depositETH(amount, gasLimit, { value })

      await this.logTx(tx.hash, 'Transaction sent', Layer.L1)
      const receipt = await tx.wait()
      const blockNumber = receipt?.blockNumber

      this.logResult(`Transaction mined in block: ${chalk.cyan(blockNumber)}`, 'success')

      const { l2TxHash, queueIndex } = await getCrossDomainMessageFromTx(
        tx.hash,
        this.l1Rpc,
        this.l1MessegeQueueProxyAddress,
      )

      this.results.bridgeFundsL1ToL2 = {
        complete: false,
        l1DepositTx: tx.hash,
        l2MessengerTx: l2TxHash,
        queueIndex,
      }
    } catch (error) {
      throw new BridgingError(
        `Error bridging funds from L1 to L2: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private async bridgeFundsL2ToL1(): Promise<void> {
    try {
      this.logResult('Bridging funds from L2 to L1', 'info')

      const amount = ethers.parseEther((FUNDING_AMOUNT / 4).toString())
      const value = amount
      // const value = ethers.parseEther((FUNDING_AMOUNT / 4 + 0.001).toString());
      // TODO: sort out how to set value here

      // Create the contract instance
      const l2ETHGateway = new ethers.Contract(this.l2ETHGateway, l2ETHGatewayABI, this.wallet.connect(this.l2Provider))

      // const value = amount + ethers.parseEther(`${gasLimit*l2BaseFee} wei`);
      await this.logAddress(await l2ETHGateway.getAddress(), `Withdrawing ${amount} by sending ${value} to`, Layer.L2)

      const tx = await l2ETHGateway.withdrawETH(amount, 0, { value })
      this.results.bridgeFundsL2ToL1.l2WithdrawTx = tx.hash

      await this.logTx(tx.hash, 'Transaction sent', Layer.L2)
      const receipt = await tx.wait()
      const blockNumber = receipt?.blockNumber

      this.logResult(`Transaction mined in block: ${chalk.cyan(blockNumber)}`, 'success')

      this.results.bridgeFundsL2ToL1.complete = true
    } catch (error) {
      throw new BridgingError(
        `Error bridging funds from L2 to L1: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private async claimERC20OnL1(): Promise<void> {
    try {
      // Implement claiming ERC20 on L1
      this.logResult('Claiming ERC20 on L1', 'info')

      if (this.mockFinalizeEnabled) {
        this.logResult(
          `Config shows finalization timeout enabled at ${this.mockFinalizeTimeout} seconds. May need to wait...`,
        )
      } else {
        this.logResult(`Proof generation can take up to 1h. Please wait...`)
      }

      if (this.results.bridgeERC20L2ToL1.l2WithdrawTx === undefined) {
        throw new BridgingError('L2 deposit ETH transaction hash is undefined. Cannot claim funds on L1.')
      }

      const txHash = await this.findAndExecuteWithdrawal(this.results.bridgeERC20L2ToL1.l2WithdrawTx)

      this.results.claimERC20OnL1.complete = true
      this.results.claimERC20OnL1.l1ClaimTx = txHash
    } catch (error) {
      throw new Error(`Error claiming ERC20 on L1: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async claimFundsOnL1(): Promise<void> {
    try {
      // Implement claiming funds on L1
      this.logResult('Claiming funds on L1', 'info')

      // TODO: Why is this not working?
      if (this.mockFinalizeEnabled) {
        this.logResult(
          `Config shows finalization timeout enabled at ${this.mockFinalizeTimeout} seconds. May need to wait...`,
        )
      } else {
        this.logResult(`Proof generation can take up to 1h. Please wait...`)
      }

      if (this.results.bridgeFundsL2ToL1.l2WithdrawTx === undefined) {
        throw new BridgingError('L2 deposit ETH transaction hash is undefined. Cannot claim funds on L1.')
      }

      const txHash = await this.findAndExecuteWithdrawal(this.results.bridgeFundsL2ToL1.l2WithdrawTx)

      this.results.claimETHOnL1.complete = true
      this.results.claimETHOnL1.l1ClaimTx = txHash
    } catch (error) {
      throw new Error(`Error claiming funds on L1: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async completeL1ERC20Deposit(): Promise<void> {
    try {
      this.logResult('Waiting for L1 ERC20 deposit to complete on L2...', 'info')

      if (!this.results.bridgeERC20L1ToL2.l2MessengerTx) {
        throw new BridgingError('L2 destination transaction hash for ERC20 deposit is missing.')
      }

      const spinner = ora('Waiting for L2 transaction to be mined...').start()

      try {
        // Wait for the L2 transaction to be mined
        const l2Receipt = await this.l2Provider.waitForTransaction(this.results.bridgeERC20L1ToL2.l2MessengerTx)

        if (l2Receipt && l2Receipt.status === 1) {
          spinner.succeed('L1 ERC20 deposit successfully completed on L2')
          this.results.bridgeERC20L1ToL2.complete = true
        } else {
          spinner.fail('L2 ERC20 deposit transaction failed or was reverted.')
          throw new BridgingError('L2 ERC20 deposit transaction failed or was reverted.')
        }
      } catch (error) {
        spinner.fail('Failed to complete L1 ERC20 deposit')
        throw error
      }
    } catch (error) {
      throw new BridgingError(
        `Failed to complete L1 ERC20 deposit: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private async completeL1ETHDeposit(): Promise<void> {
    try {
      this.logResult('Waiting for L1 ETH deposit to complete on L2...', 'info')

      if (!this.results.bridgeFundsL1ToL2.l2MessengerTx) {
        throw new BridgingError('L2 destination transaction hash is missing.')
      }

      const spinner = ora('Waiting for L2 transaction to be mined...').start()

      try {
        // Wait for the L2 transaction to be mined
        const l2Receipt = await this.l2Provider.waitForTransaction(this.results.bridgeFundsL1ToL2.l2MessengerTx)

        if (l2Receipt && l2Receipt.status === 1) {
          spinner.succeed('L1 ETH deposit successfully completed on L2')
          this.results.bridgeFundsL1ToL2.complete = true
          this.results.fundWalletOnL2.complete = true
        } else {
          spinner.fail('L2 transaction failed or was reverted.')
          throw new BridgingError('L2 transaction failed or was reverted.')
        }
      } catch (error) {
        spinner.fail('Failed to complete L1 ETH deposit')
        throw error
      }
    } catch (error) {
      throw new BridgingError(
        `Failed to complete L1 ETH deposit: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private async deployERC20(layer: Layer) {
    try {
      // Choose the correct provider based on the layer
      const provider = layer === Layer.L1 ? this.l1Provider : this.l2Provider

      // Connect the wallet to the correct provider
      const connectedWallet = this.wallet.connect(provider)

      // Create the contract factory with the connected wallet
      const tokenFactory = new ethers.ContractFactory(erc20ABI, erc20Bytecode, connectedWallet)

      // Deploy the contract
      const tokenContract = await tokenFactory.deploy()

      // Wait for the deployment transaction to be mined
      await tokenContract.waitForDeployment()

      // Get the deployed contract address
      const contractAddress = await tokenContract.getAddress()

      return contractAddress
    } catch (error) {
      const error_ =
        error instanceof Error
          ? new DeploymentError(`Failed to deploy ERC20 on ${layer === Layer.L1 ? 'L1' : 'L2'}: ${error.message}`)
          : new DeploymentError(`Failed to deploy ERC20 on ${layer === Layer.L1 ? 'L1' : 'L2'}: Unknown error`)
      throw error_
    }
  }

  private async deployERC20OnL1(): Promise<void> {
    try {
      // Implement deploying ERC20 on L1
      this.logResult('Deploying ERC20 on L1', 'info')
      // Deploy new TKN ERC20 token and mint 1000 to admin wallet
      const tokenContract = await this.deployERC20(Layer.L1)

      this.logAddress(tokenContract, 'Token successfully deployed', Layer.L1)

      this.results.deployERC20OnL1.address = tokenContract
      this.results.deployERC20OnL1.complete = true
    } catch (error) {
      throw new DeploymentError(
        `Failed to deploy ERC20 on L1: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private async deployERC20OnL2(): Promise<void> {
    try {
      // Implement deploying ERC20 on L2
      this.logResult('Deploying ERC20 on L2', 'info')

      // Deploy new TKN ERC20 token and mint 1000 to admin wallet
      const tokenContract = await this.deployERC20(Layer.L2)

      this.logAddress(tokenContract, 'Token successfully deployed', Layer.L2)

      this.results.deployERC20OnL2.address = tokenContract
      this.results.deployERC20OnL2.complete = true
    } catch (error) {
      throw new DeploymentError(
        `Failed to deploy ERC20 on L2: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private async findAndExecuteWithdrawal(txHash: string) {
    try {
      let unclaimedWithdrawal
      let found = false

      while (!unclaimedWithdrawal?.claim_info) {
        let withdrawals: Withdrawal[] = []

        try {
          // eslint-disable-next-line no-await-in-loop
          withdrawals = await getWithdrawals(this.wallet.address, this.bridgeApiUrl)
        } catch (error) {
          this.logResult(
            `Warning: Failed to get withdrawals. Continuing... Error: ${error instanceof Error ? error.message : 'Unknown error'
            }`,
            'warning',
          )
        }

        // Check to see if the bridged tx is among unclaimed withdrawals if so, set withdrawalFound to true.
        for (const withdrawal of withdrawals) {
          if (withdrawal.hash === txHash) {
            unclaimedWithdrawal = withdrawal
            !found && this.logResult(`Found matching withdrawal for transaction: ${txHash}`, 'success')
            found = true
            break
          }
        }

        const l1TxHash = unclaimedWithdrawal?.counterpart_chain_tx.hash
        if (l1TxHash) {
          this.logTx(l1TxHash, 'This withdrawal has already been claimed', Layer.L1)
          return
        }

        if (!unclaimedWithdrawal) {
          this.logResult(`Withdrawal not found yet. Waiting...`, 'info')
          // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
          await new Promise((resolve) => setTimeout(resolve, 60_000)) // Wait for 20 seconds before checking again
        } else if (!unclaimedWithdrawal?.claim_info) {
          this.logResult(`Withdrawal seen, but waiting for finalization. Waiting...`, 'info')
          // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
          await new Promise((resolve) => setTimeout(resolve, 60_000)) // Wait for 20 seconds before checking again
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
      const l1Messenger = new ethers.Contract(
        this.l1Messenger,
        l1MessengerRelayMessageWithProofABI,
        this.wallet.connect(this.l1Provider),
      )

      // const value = amount + ethers.parseEther(`${gasLimit*l2BaseFee} wei`);
      await this.logAddress(await l1Messenger.getAddress(), `Calling relayMessageWithProof on`, Layer.L1)

      const { from, message, nonce, proof, to, value } = unclaimedWithdrawal.claim_info

      const tx = await l1Messenger.relayMessageWithProof(from, to, value, nonce, message, {
        batchIndex: proof.batch_index,
        merkleProof: proof.merkle_proof,
      })

      await this.logTx(tx.hash, 'Transaction sent', Layer.L1)
      const receipt = await tx.wait()
      const blockNumber = receipt?.blockNumber

      this.logResult(`Transaction mined in block: ${chalk.cyan(blockNumber)}`, 'success')

      return receipt.hash
    } catch (error) {
      throw new Error(
        `Error finding and executing withdrawal on L1: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private async fundWalletOnL1(): Promise<void> {
    try {
      if (this.fundingWallet && !this.manualFunding) {
        this.logResult('Sending funds to new wallet...')
        await this.fundWalletWithEth(FUNDING_AMOUNT, Layer.L1)
        return
      }

      await this.promptManualFunding(this.wallet.address, FUNDING_AMOUNT, Layer.L1)

      this.results.fundWalletOnL1.complete = true
    } catch (error) {
      throw new WalletFundingError(
        `Failed to fund wallet on L1: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private async fundWalletOnL2(): Promise<void> {
    // Starts after this.bridgeFundsL1toL2 is completed
    const answer = await this.promptUserForL2Funding()

    // if (response.action === 'Directly fund L2 wallet') {
    if (answer === 'bridge') {
      // TODO: handle some async stuff in parallel
      this.logResult(`Waiting for L1 -> L2 bridge to complete...`, 'info')

      // will check this later in the main flow...

      this.results.fundWalletOnL2.complete = false

      return
    }

    if (this.fundingWallet && answer === 'funder') {
      this.logResult('Sending funds to new wallet...', 'info')
      await this.fundWalletWithEth(FUNDING_AMOUNT / 2, Layer.L2)

      this.results.fundWalletOnL2.complete = true

      return
    }

    await this.promptManualFunding(this.wallet.address, FUNDING_AMOUNT / 2, Layer.L2)

    this.results.fundWalletOnL2.complete = true
  }

  private async fundWalletWithEth(amount: number = FUNDING_AMOUNT, layer: Layer = Layer.L1): Promise<void> {
    const wallet = layer === Layer.L1 ? this.fundingWallet : new Wallet(this.fundingWallet.privateKey, this.l2Provider)
    const tx = await wallet.sendTransaction({
      to: this.wallet.address,
      value: ethers.parseEther(amount.toString()),
    })
    await tx.wait()
    await this.logTx(tx.hash, `Funded wallet with ${amount} ETH`, layer)
  }

  // Generate a new random wallet to run all tests.
  private async generateNewWallet(privateKey: string = ''): Promise<void> {
    if (privateKey) {
      this.logResult('Loaded existing private key...')
    } else {
      const randomWallet = ethers.Wallet.createRandom()
      privateKey = randomWallet.privateKey
    }

    this.wallet = new ethers.Wallet(privateKey, this.l1Provider)
    await this.logAddress(this.wallet.address, 'Generated new wallet', Layer.L1)
    this.results.fundWalletOnL1 = { complete: false, generatedPrivateKey: privateKey, walletAddress: this.wallet.address }
    this.logResult(`Private Key: ${chalk.yellow(this.wallet.privateKey)}`, 'warning')
  }

  private handleError(error: unknown): void {
    if (error instanceof WalletFundingError) {
      this.error(`E2E Test failed due to wallet funding issues: ${error.message}`)
    } else if (error instanceof BridgingError) {
      this.error(`E2E Test failed due to bridging issues: ${error.message}`)
    } else if (error instanceof DeploymentError) {
      this.error(`E2E Test failed due to contract deployment issues: ${error.message}`)
    } else if (error instanceof ConfigurationError) {
      this.error(`E2E Test failed due to configuration issues: ${error.message}`)
    } else if (error instanceof NetworkError) {
      this.error(`E2E Test failed due to network issues: ${error.message}`)
    } else if (error instanceof Error) {
      this.error(`E2E Test failed: ${error.message}`)
    } else {
      this.error(`E2E Test failed due to an unknown error`)
    }
  }

  // private handleGroupError(groupName: string, error: unknown): void {
  //   if (error instanceof BridgingError || error instanceof DeploymentError) {
  //     this.error(`${groupName} failed: ${error.message}`)
  //   } else if (error instanceof Error) {
  //     this.error(`${groupName} failed due to an unexpected error: ${error.message}`)
  //   } else {
  //     this.error(`${groupName} failed due to an unknown error`)
  //   }

  //   throw error
  // }

  private async loadResumeFile(): Promise<void> {
    try {
      if (!this.resumeFilePath) {
        throw new Error('Resume file path is not set.')
      }

      this.logResult(`Loading resume file from: ${this.resumeFilePath}`, 'info')

      const fileContent = await fs.readFile(this.resumeFilePath, 'utf8')
      const resumeData = JSON.parse(fileContent, (key, value) => {
        // Check if the value is a string that represents a BigInt
        if (typeof value === 'string' && /^\d+n$/.test(value)) {
          return BigInt(value.slice(0, -1))
        }

        return value
      })

      if (resumeData.results) {
        this.results = resumeData.results
        this.logResult('Resume data loaded successfully', 'success')

        // Log the loaded state
        for (const [key, value] of Object.entries(this.results)) {
          this.logResult(`${key}: ${JSON.stringify(value)}`, 'info')
        }
      } else {
        throw new Error('Invalid resume file format: missing results data')
      }
    } catch (error) {
      if (error instanceof Error) {
        this.logResult(`Failed to load resume file: ${error.message}`, 'error')
      } else {
        this.logResult('Failed to load resume file: Unknown error', 'error')
      }

      throw error
    }
  }

  private async logAddress(address: string, description: string, layer: Layer): Promise<void> {
    const link = await addressLink(address, this.blockExplorers[layer])
    this.logResult(`${description}: ${chalk.cyan(link)}`, 'info')
  }

  private logResult(message: string, type: 'error' | 'info' | 'success' | 'warning' = 'info'): void {
    let icon: string
    let coloredMessage: string

    switch (type) {
      case 'success': {
        icon = '✅'
        coloredMessage = chalk.green(message)
        break
      }

      case 'warning': {
        icon = '⚠️'
        coloredMessage = chalk.yellow(message)
        break
      }

      case 'error': {
        icon = '❌'
        coloredMessage = chalk.red(message)
        break
      }

      default: {
        icon = 'ℹ️'
        coloredMessage = chalk.blue(message)
      }
    }

    this.log(`${icon} ${coloredMessage}`)
  }

  private logSection(sectionName: string): void {
    this.log('\n' + chalk.bgCyan.black(` ${sectionName} `) + '\n')
  }

  private async logTx(txHash: string, description: string, layer: Layer): Promise<void> {
    const link = await txLink(txHash, this.blockExplorers[layer])
    this.logResult(`${description}: ${chalk.cyan(link)}`, 'info')
  }

  private async promptManualFunding(address: string, amount: number, layer: Layer) {
    const chainId =
      layer === Layer.L1 ? (await this.l1Provider.getNetwork()).chainId : (await this.l2Provider.getNetwork()).chainId
    let qrString = ''
    qrString += 'ethereum:'
    qrString += address
    qrString += '@'
    qrString += chainId
    qrString += '&value='
    qrString += amount / 2

    await this.logAddress(address, `Please fund the following address with ${chalk.yellow(amount)} ETH`, layer)
    this.log('\n')
    this.logResult(`ChainID: ${chalk.cyan(Number(chainId))}`, 'info')
    this.logResult(`Chain RPC: ${chalk.cyan(layer === Layer.L1 ? this.l1Rpc : this.l2Rpc)}`, 'info')
    this.log('\n')
    this.logResult('Scan this QR code to fund the address:', 'info')

    this.log(await qrCodeToString(qrString, { small: true, type: 'terminal' }))

    let funded = false

    while (!funded) {
      // eslint-disable-next-line no-await-in-loop
      await confirm({ message: 'Press Enter when ready...' })

      this.logResult(`Checking...`, 'info')
      // Check if wallet is actually funded -- if not, we'll loop.

      const balance =
        // eslint-disable-next-line no-await-in-loop
        layer === Layer.L1 ? await this.l1Provider.getBalance(address) : await this.l2Provider.getBalance(address)
      const formattedBalance = ethers.formatEther(balance)

      if (Number.parseFloat(formattedBalance) >= amount) {
        this.logResult(`Wallet Balance: ${chalk.green(formattedBalance)}`, 'success')
        funded = true
      } else {
        this.logResult(`Balance is only ${chalk.red(formattedBalance)}. Please fund the wallet.`, 'warning')
      }
    }
  }

  private async promptUserForL2Funding(): Promise<string> {
    const funderBalance = this.fundingWallet ? await this.l2Provider.getBalance(this.fundingWallet.address) : 0n

    const answer = await select({
      choices: [
        {
          description: 'Wait for bridge tx to complete.',
          name: 'Bridge',
          value: 'bridge',
        },
        new Separator(),
        {
          description: 'Use the deployer or funding wallet private key.',
          disabled: funderBalance < FUNDING_AMOUNT / 2,
          name: 'L1 Funder',
          value: 'funder',
        },
        {
          description: 'Use your own wallet to fund the address.',
          name: 'Manual Funding',
          value: 'manual',
        },
      ],
      message: 'Wait for Bridge to complete or directly funds on L2?',
    })

    return answer
  }

  private async runE2ETest(): Promise<void> {
    try {
      this.logSection('Running E2E Test')

      this.logSection('Setup L1')
      // Setup L1

      if (!this.skipWalletGen || !this.results.fundWalletOnL1.complete) {
        this.logSection('Generate and Fund Wallets')
        if (!this.results.fundWalletOnL1.generatedPrivateKey) {
          await this.generateNewWallet()
        }

        await this.fundWalletOnL1()
        await this.saveProgress()
      } else {
        this.logResult('Skipping section...', 'info')
      }

      this.logSection('Initiate ETH Deposit on L1')
      if (this.results.bridgeFundsL1ToL2.l2MessengerTx) {
        this.logResult('Skipping section...', 'info')
      } else {
        await this.bridgeFundsL1ToL2()
        await this.shortPause()
        await this.saveProgress()
      }

      this.logSection('Deploying ERC20 on L1')
      if (this.results.deployERC20OnL1.complete) {
        this.logResult('Skipping section...', 'info')
      } else {
        await this.deployERC20OnL1()
        await this.shortPause()
        await this.saveProgress()
      }

      this.logSection('Initiate ERC20 Deposit on L1')
      if (this.results.bridgeERC20L1ToL2.complete) {
        this.logResult('Skipping section...', 'info')
      } else {
        await this.bridgeERC20L1ToL2()
        await this.shortPause()
        await this.saveProgress()
      }

      // Setup L2
      this.logSection('Setup L2')
      if (this.results.fundWalletOnL2.complete) {
        this.logResult('Skipping section...', 'info')
      } else {
        await this.fundWalletOnL2()
        await this.shortPause()
        await this.saveProgress()
      }

      // this complete is less related to resume function,
      // but just to know result of above section
      if (!this.results.fundWalletOnL2.complete) {
        this.logSection('Waiting for L1 ETH Deposit')
        await this.completeL1ETHDeposit()
        await this.shortPause()
        await this.saveProgress()
      }

      this.logSection('Initiate ETH Withdrawal on L2')
      if (this.results.bridgeFundsL2ToL1.complete) {
        this.logResult('Skipping section...', 'info')
      } else {
        await this.bridgeFundsL2ToL1()
        await this.shortPause()
        await this.saveProgress()
      }

      this.logSection('Deploying an ERC20 on L2')
      if (this.results.deployERC20OnL2.complete) {
        this.logResult('Skipping section...', 'info')
      } else {
        await this.deployERC20OnL2()
        await this.shortPause()
        await this.saveProgress()
      }

      this.logSection('Waiting for L1 ERC20 Deposit')
      if (this.results.bridgeERC20L1ToL2.complete) {
        this.logResult('Skipping section...', 'info')
      } else {
        await this.completeL1ERC20Deposit()
        // Wait for a block...
        await this.shortPause()
        await this.shortPause()
        await this.shortPause()
        await this.shortPause()
        await this.shortPause()
        await this.shortPause()
        await this.shortPause()
        await this.shortPause()
        await this.saveProgress()
      }

      this.logSection('Bridging ERC20 Back to L1')
      if (this.results.bridgeERC20L2ToL1.l2WithdrawTx) {
        this.logResult('Skipping section...', 'info')
      } else {
        await this.bridgeERC20L2ToL1()
        await this.shortPause()
        await this.saveProgress()
      }

      this.logSection('Claiming ETH and ERC20 on L1')

      if (this.results.claimETHOnL1.complete && this.results.claimERC20OnL1.complete) {
        this.logResult('Skipping section...', 'info')
      } else {
        if (!this.results.claimETHOnL1.complete) {
          await this.claimFundsOnL1()
          await this.shortPause()
          await this.saveProgress()
        }

        if (!this.results.claimERC20OnL1.complete) {
          await this.claimERC20OnL1()
          await this.shortPause()
          await this.saveProgress()
        }
      }

      this.logResult('E2E Test completed successfully', 'success')
    } catch (error) {
      this.handleError(error)
    }
  }

  private async saveProgress(): Promise<void> {
    if (!this.resumeFilePath) {
      this.resumeFilePath = 'e2e_resume.json'
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, unicorn/consistent-function-scoping
    const serializeBigInt = (key: string, value: any) => {
      if (typeof value === 'bigint') {
        return value.toString()
      }

      return value
    }

    const resumeData = {
      results: this.results,
      timestamp: new Date().toISOString(),
    }

    try {
      const fileContent = JSON.stringify(resumeData, serializeBigInt, 2)
      await fs.writeFile(this.resumeFilePath, fileContent, 'utf8')
      this.logResult(`Progress saved: ${this.resumeFilePath}`, 'success')
    } catch (error) {
      this.logResult(`Failed to save progress: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    }
  }

  private async shortPause() {
    // Sleep for 0.5 second
    // eslint-disable-next-line no-promise-executor-return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

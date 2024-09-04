import { confirm, select, input } from '@inquirer/prompts'
import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { ethers, Contract } from 'ethers'
import path from 'node:path'
import { toString as qrCodeToString } from 'qrcode'

import { parseTomlConfig } from '../../utils/config-parser.js'
import { addressLink, txLink } from '../../utils/onchain/index.js'

enum Layer {
  L1 = 'l1',
  L2 = 'l2',
}

export default class HelperFundAccounts extends Command {
  static description = 'Fund L1 and L2 accounts for contracts'

  static flags = {
    account: Flags.string({
      char: 'a',
      description: 'Additional account to fund',
    }),
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
    dev: Flags.boolean({
      char: 'd',
      default: false,
      description: 'Use Anvil devnet funding logic',
    }),
    l1rpc: Flags.string({
      char: 'o',
      description: 'L1 RPC URL',
    }),
    l2rpc: Flags.string({
      char: 't',
      description: 'L2 RPC URL',
    }),
    manual: Flags.boolean({
      char: 'm',
      description: 'Manually fund the accounts',
    }),
    pod: Flags.boolean({
      char: 'p',
      default: false,
      description: 'Run inside Kubernetes pod',
    }),
    'private-key': Flags.string({
      char: 'k',
      description: 'Private key for funder wallet',
    }),
    'fund-deployer': Flags.boolean({
      char: 'i',
      description: 'Fund the deployer address only',
      default: false,
    }),
    amount: Flags.string({
      char: 'f',
      description: 'Amount to fund in ETH',
      default: '0.1',
    }),
    layer: Flags.string({
      char: 'l',
      description: 'Specify layer to fund (1 for L1, 2 for L2)',
      options: ["1", "2"],
    }),
  }

  private blockExplorers: Record<Layer, { blockExplorerURI: string }> = {
    [Layer.L1]: { blockExplorerURI: '' },
    [Layer.L2]: { blockExplorerURI: '' },
  }

  private fundingWallet!: ethers.Wallet
  private l1ETHGateway!: string
  private l1Provider!: ethers.JsonRpcProvider
  private l1Rpc!: string
  private l2Provider!: ethers.JsonRpcProvider
  private l2Rpc!: string

  private altGasTokenEnabled: boolean = false
  private l1GasTokenGateway!: string
  private l1GasTokenAddress!: string
  private altGasTokenContract!: ethers.Contract
  private altGasTokenDecimals!: number
  private altGasTokenSymbol!: string

  public async run(): Promise<void> {
    const { flags } = await this.parse(HelperFundAccounts)

    const configPath = path.resolve(flags.config)
    const config = parseTomlConfig(configPath)

    let l1RpcUrl: string
    let l2RpcUrl: string

    if (flags.pod) {
      l1RpcUrl = config?.general?.L1_RPC_ENDPOINT
      l2RpcUrl = config?.general?.L2_RPC_ENDPOINT
    } else {
      l1RpcUrl = flags.l1rpc ?? config.frontend.EXTERNAL_RPC_URI_L1
      l2RpcUrl = flags.l2rpc ?? config.frontend.EXTERNAL_RPC_URI_L2
    }

    if (!l1RpcUrl || !l2RpcUrl) {
      this.error(
        `Missing RPC URL(s) in ${configPath}. Please ensure L1_RPC_ENDPOINT and L2_RPC_ENDPOINT (for pod mode) or EXTERNAL_RPC_URI_L1 and EXTERNAL_EXPLORER_URI_L2 (for non-pod mode) are defined or use the '-o' and '-t' flags.`,
      )
    }

    this.l1Rpc = l1RpcUrl
    this.l2Rpc = l2RpcUrl
    this.l1Provider = new ethers.JsonRpcProvider(l1RpcUrl)
    this.l2Provider = new ethers.JsonRpcProvider(l2RpcUrl)

    this.blockExplorers.l1.blockExplorerURI = config?.frontend?.EXTERNAL_EXPLORER_URI_L1
    this.blockExplorers.l2.blockExplorerURI = config?.frontend?.EXTERNAL_EXPLORER_URI_L2

    this.l1ETHGateway = config?.contracts?.L1_ETH_GATEWAY_PROXY_ADDR

    if (flags['private-key']) {
      this.fundingWallet = new ethers.Wallet(flags['private-key'], this.l1Provider)
    } else if (!flags.manual && !flags.dev) {
      this.fundingWallet = new ethers.Wallet(config.accounts.DEPLOYER_PRIVATE_KEY, this.l1Provider)
    }

    // Check for alternative gas token
    this.altGasTokenEnabled = config?.['gas-token']?.ALTERNATIVE_GAS_TOKEN_ENABLED === true

    if (this.altGasTokenEnabled) {
      this.log(chalk.yellow('Alternative Gas Token mode is enabled.'))

      // Parse config-contracts.toml
      const contractsConfigPath = path.resolve(flags.contracts)
      const contractsConfig = parseTomlConfig(contractsConfigPath)
      this.l1GasTokenGateway = contractsConfig.L1_GAS_TOKEN_GATEWAY_PROXY_ADDR
      this.l1GasTokenAddress = contractsConfig.L1_GAS_TOKEN_ADDR

      if (!this.l1GasTokenAddress || !this.l1GasTokenGateway) {
        this.error('Alternative Gas Token is enabled but L1_GAS_TOKEN_ADDR or L1_GAS_TOKEN_GATEWAY_PROXY_ADDR is not set in config-contracts.toml')
      }

      // Immediately fetch gas token details
      await this.initializeAltGasToken()

      // Set default amount to 2 ETH if not explicitly set
      if (flags.amount === '0.1' && !flags['amount']) {
        flags.amount = '2'
      }
    }


    if (flags['fund-deployer']) {
      await this.fundDeployer(config.accounts.DEPLOYER_ADDR, flags)
    } else {
      const l1Addresses: Record<string, string> = {
        'L1_COMMIT_SENDER': config.accounts.L1_COMMIT_SENDER_ADDR,
        'L1_FINALIZE_SENDER': config.accounts.L1_FINALIZE_SENDER_ADDR,
        'L1_GAS_ORACLE_SENDER': config.accounts.L1_GAS_ORACLE_SENDER_ADDR,
      }

      const l2Addresses: Record<string, string> = {
        'L2_GAS_ORACLE_SENDER': config.accounts.L2_GAS_ORACLE_SENDER_ADDR
      }

      if (flags.account) {
        l1Addresses['ADDITIONAL_ACCOUNT'] = flags.account
        l2Addresses['ADDITIONAL_ACCOUNT'] = flags.account
      }

      if (!flags.layer || flags.layer === "1") {
        await this.fundL1Addresses(l1Addresses, flags)
      }

      if (!flags.layer || flags.layer === "2") {
        await this.fundL2Addresses(l2Addresses, flags)
      }
    }

    this.log(chalk.green('Funding complete'))
  }

  private async fundDeployer(deployerAddress: string, flags: any): Promise<void> {
    this.log(chalk.cyan('\nFunding Deployer Address:'))
    if (flags.dev) {
      await this.fundAddressAnvil(this.l1Provider, deployerAddress, 100, Layer.L1)
    } else {
      await this.promptManualFunding(deployerAddress, Number(flags.amount), Layer.L1)
    }

    if (this.altGasTokenEnabled) {
      await this.fundDeployerWithAltGasToken(deployerAddress)
    }
  }

  private async fundDeployerWithAltGasToken(deployerAddress: string): Promise<void> {
    this.log(chalk.cyan('\nFunding Deployer with Alternative Gas Token:'))

    try {
      const amount = await select({
        message: `How many ${this.altGasTokenSymbol} tokens do you want to transfer?`,
        choices: [
          { name: '100', value: ethers.parseUnits('100', this.altGasTokenDecimals) },
          { name: '1000', value: ethers.parseUnits('1000', this.altGasTokenDecimals) },
          { name: '10000', value: ethers.parseUnits('10000', this.altGasTokenDecimals) },
          { name: 'Custom', value: -1n },
        ],
      })

      let tokenAmount: bigint
      if (amount === -1n) {
        const customAmount = await input({ message: `Enter the amount of ${this.altGasTokenSymbol} tokens:` })
        tokenAmount = ethers.parseUnits(customAmount, this.altGasTokenDecimals)
      } else {
        tokenAmount = amount
      }

      await this.promptManualFundingERC20(deployerAddress, tokenAmount, this.l1GasTokenAddress, this.altGasTokenSymbol)
    } catch (error) {
      this.log(chalk.red('An error occurred while funding with alternative gas token:'))
      this.log(chalk.red(error instanceof Error ? error.stack || error.message : String(error)))
      this.log(chalk.yellow('Debug information:'))
      this.log(chalk.yellow(`L1 Gas Token Address: ${this.l1GasTokenAddress}`))
      this.log(chalk.yellow(`L1 Gas Token Gateway: ${this.l1GasTokenGateway}`))
      this.log(chalk.yellow(`L1 Provider URL: ${this.l1Provider._getConnection().url}`))
      this.error('Failed to fund deployer with alternative gas token')
    }
  }

  private async promptManualFundingERC20(address: string, amount: bigint, tokenAddress: string, symbol: string) {
    const chainId = (await this.l1Provider.getNetwork()).chainId

    const formattedAmount = ethers.formatUnits(amount, await new Contract(tokenAddress, ['function decimals() view returns (uint8)'], this.l1Provider).decimals())

    const qrString = `ethereum:${tokenAddress}/transfer?address=${address}&uint256=${amount.toString()}&chainId=${chainId}`

    await this.logAddress(address, `Please transfer ${chalk.yellow(formattedAmount)} ${symbol} to`, Layer.L1)
    this.log('\n')
    this.log(`ChainID: ${chalk.cyan(Number(chainId))}`)
    this.log(`Chain RPC: ${chalk.cyan(this.l1Rpc)}`)
    this.log(`Token Address: ${chalk.cyan(tokenAddress)}`)
    this.log('\n')
    this.log('Scan this QR code to initiate the transfer:')

    this.log(await qrCodeToString(qrString, { small: true, type: 'terminal' }))

    let funded = false
    while (!funded) {
      await confirm({ message: 'Press Enter when ready...' })
      this.log(`Checking...`)
      const balance = await new Contract(tokenAddress, ['function balanceOf(address) view returns (uint256)'], this.l1Provider).balanceOf(address)
      const formattedBalance = ethers.formatUnits(balance, await new Contract(tokenAddress, ['function decimals() view returns (uint8)'], this.l1Provider).decimals())

      if (balance >= amount) {
        this.log(chalk.green(`Wallet Balance: ${formattedBalance} ${symbol}`))
        funded = true
      } else {
        this.log(chalk.yellow(`Balance is only ${formattedBalance} ${symbol}. Please complete the transfer.`))
      }
    }
  }

  private async bridgeFundsL1ToL2(recipient: string, amount: number): Promise<void> {
    try {
      this.log(chalk.cyan(`Bridging funds from L1 to L2 for recipient: ${recipient}`))

      if (!this.fundingWallet.provider) {
        throw new Error('Funding wallet provider is not initialized');
      }

      const initialFunderBalance = await this.fundingWallet.provider.getBalance(this.fundingWallet.address)

      const gasLimit = BigInt(170_000)
      const value = ethers.parseEther((amount + 0.001).toString())

      const l1ETHGateway = new ethers.Contract(
        this.l1ETHGateway,
        ['function depositETH(address _to, uint256 _amount, uint256 _gasLimit) payable'],
        this.fundingWallet,
      )

      await this.logAddress(
        this.l1ETHGateway,
        `Depositing ${amount} ETH by sending ${ethers.formatEther(value)} to`,
        Layer.L1,
      )

      const tx = await l1ETHGateway.depositETH(recipient, ethers.parseEther(amount.toString()), gasLimit, { value })
      await this.logTx(tx.hash, 'Bridge transaction sent', Layer.L1)

      const receipt = await tx.wait()
      this.log(chalk.green(`Transaction mined in block: ${receipt.blockNumber}`))

      const finalFunderBalance = await this.fundingWallet.provider.getBalance(this.fundingWallet.address)

      this.log(chalk.cyan(`Funding wallet balance (L1):`))
      this.log(chalk.yellow(`  Before: ${ethers.formatEther(initialFunderBalance)} ETH`))
      this.log(chalk.yellow(`  After:  ${ethers.formatEther(finalFunderBalance)} ETH`))

      this.log(
        chalk.yellow(`Funds are being bridged to ${recipient}. Please wait for the transaction to be processed on L2.`),
      )
    } catch (error) {
      this.error(`Error bridging funds from L1 to L2: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async fundAddressAnvil(provider: ethers.JsonRpcProvider, address: string, amount: number, layer: Layer) {
    try {
      const result = await provider.send('anvil_setBalance', [address, ethers.parseEther(amount.toString()).toString()])
      await this.logAddress(address, `Successfully funded with ${amount} ETH`, layer)
      return result
    } catch (error) {
      this.error(
        `Failed to fund ${address} (${layer} devnet): ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private async fundAddressNetwork(address: string, amount: number, layer: Layer) {
    try {
      const provider = layer === Layer.L1 ? this.l1Provider : this.l2Provider;
      const fundingWallet = layer === Layer.L1 ? this.fundingWallet : this.fundingWallet.connect(this.l2Provider);

      const initialFunderBalance = await provider.getBalance(fundingWallet.address);
      const initialRecipientBalance = await provider.getBalance(address);

      const unitName = this.altGasTokenEnabled && layer === Layer.L2 ? this.altGasTokenSymbol : 'ETH';

      const tx = await fundingWallet.sendTransaction({
        to: address,
        value: ethers.parseEther(amount.toString()),
      });

      await tx.wait();
      await this.logTx(tx.hash, `Funded ${address} with ${amount} ${unitName}`, layer);

      const finalFunderBalance = await provider.getBalance(fundingWallet.address);
      const finalRecipientBalance = await provider.getBalance(address);

      this.log(chalk.cyan(`Funding wallet balance:`));
      this.log(chalk.yellow(`  Before: ${ethers.formatEther(initialFunderBalance)} ${unitName}`));
      this.log(chalk.yellow(`  After:  ${ethers.formatEther(finalFunderBalance)} ${unitName}`));
      this.log(chalk.cyan(`Recipient wallet balance:`));
      this.log(chalk.yellow(`  Before: ${ethers.formatEther(initialRecipientBalance)} ${unitName}`));
      this.log(chalk.yellow(`  After:  ${ethers.formatEther(finalRecipientBalance)} ${unitName}`));
    } catch (error) {
      this.error(`Failed to fund ${address} (${layer}): ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async fundL1Addresses(addresses: Record<string, string>, flags: any): Promise<void> {
    this.log(chalk.cyan('\nFunding L1 Addresses:'))
    for (const [contractName, address] of Object.entries(addresses)) {
      if (!address) {
        this.warn(`Address not found in config for ${contractName}`)
        continue
      }

      this.log(chalk.blue(`Funding ${contractName}:`))

      if (flags.dev) {
        await this.fundAddressAnvil(this.l1Provider, address, Number(flags.amount), Layer.L1)
      } else if (flags.manual) {
        await this.promptManualFunding(address, Number(flags.amount), Layer.L1)
      } else {
        await this.fundAddressNetwork(address, Number(flags.amount), Layer.L1)
      }
    }
  }

  private async fundL2Addresses(addresses: Record<string, string>, flags: any): Promise<void> {
    this.log(chalk.cyan('\nFunding L2 Addresses:'))
    for (const [contractName, address] of Object.entries(addresses)) {
      if (!address) {
        this.warn(`Address not found in config for ${contractName}`)
        continue
      }

      this.log(chalk.blue(`Funding ${contractName}:`))

      const fundingMethod = await this.promptUserForL2Funding()

      if (fundingMethod === 'bridge') {
        if (this.altGasTokenEnabled) {
          await this.bridgeAltTokenL1ToL2(address, Number(flags.amount))
        } else {
          await this.bridgeFundsL1ToL2(address, Number(flags.amount))
        }
      } else if (fundingMethod === 'direct') {
        await this.fundAddressNetwork(address, Number(flags.amount), Layer.L2)
      } else {
        await this.promptManualFunding(address, Number(flags.amount), Layer.L2)
      }
    }
  }

  private async bridgeAltTokenL1ToL2(recipient: string, amount: number): Promise<void> {
    try {
      this.log(chalk.cyan(`Bridging alternative gas token from L1 to L2 for recipient: ${recipient}`))

      const tokenAmount = ethers.parseUnits(amount.toString(), this.altGasTokenDecimals)

      // Approve the L1 Gas Token Gateway to spend tokens
      const approveTx = await this.altGasTokenContract.approve(this.l1GasTokenGateway, tokenAmount)
      await approveTx.wait()

      this.log(chalk.green(`Approved ${amount} ${this.altGasTokenSymbol} for L1 Gas Token Gateway`))

      // Create L1 Gas Token Gateway contract instance with signer
      const l1GasTokenGateway = new ethers.Contract(
        this.l1GasTokenGateway,
        ['function depositETH(address _to, uint256 _amount, uint256 _gasLimit) payable'],
        this.fundingWallet
      )

      const gasLimit = BigInt(300_000) // Adjust as needed
      const depositTx = await l1GasTokenGateway.depositETH(
        recipient,
        tokenAmount,
        gasLimit,
        { value: ethers.parseEther('0.01') } // Small amount of ETH for L2 gas
      )

      await this.logTx(depositTx.hash, 'Bridge transaction sent', Layer.L1)

      const receipt = await depositTx.wait()
      this.log(chalk.green(`Transaction mined in block: ${receipt.blockNumber}`))

      this.log(chalk.yellow(`Alternative gas tokens are being bridged to ${recipient}. Please wait for the transaction to be processed on L2.`))
    } catch (error) {
      this.error(`Error bridging alternative gas token from L1 to L2: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async logAddress(address: string, description: string, layer: Layer): Promise<void> {
    const link = await addressLink(address, this.blockExplorers[layer])
    this.log(`${description}: ${chalk.cyan(link)}`)
  }

  private async logTx(txHash: string, description: string, layer: Layer): Promise<void> {
    const link = await txLink(txHash, this.blockExplorers[layer])
    this.log(`${description}: ${chalk.cyan(link)}`)
  }

  private async promptManualFunding(address: string, amount: number, layer: Layer) {
    const chainId =
      layer === Layer.L1 ? (await this.l1Provider.getNetwork()).chainId : (await this.l2Provider.getNetwork()).chainId

    const qrString = `ethereum:${address}@${chainId}&value=${amount}`

    const unitName = this.altGasTokenEnabled && layer === Layer.L2 ? 'GasTokens' : 'ETH'

    await this.logAddress(address, `Please fund the following address with ${chalk.yellow(amount)} ${unitName}`, layer)
    this.log('\n')
    this.log(`ChainID: ${chalk.cyan(Number(chainId))}`)
    this.log(`Chain RPC: ${chalk.cyan(layer === Layer.L1 ? this.l1Rpc : this.l2Rpc)}`)
    this.log('\n')
    this.log('Scan this QR code to fund the address:')

    this.log(await qrCodeToString(qrString, { small: true, type: 'terminal' }))

    let funded = false
    while (!funded) {
      await confirm({ message: 'Press Enter when ready...' })
      this.log(`Checking...`)
      const balance = await (layer === Layer.L1 ? this.l1Provider : this.l2Provider).getBalance(address)
      const formattedBalance = ethers.formatEther(balance)

      if (Number(formattedBalance) >= amount) {
        this.log(chalk.green(`Wallet Balance: ${formattedBalance} ${unitName}`))
        funded = true
      } else {
        this.log(chalk.yellow(`Balance is only ${formattedBalance} ${unitName}. Please fund the wallet.`))
      }
    }
  }

  private async promptUserForL2Funding(): Promise<string> {
    const answer = await select({
      choices: [
        { name: 'Bridge funds from L1', value: 'bridge' },
        { name: 'Directly fund L2 wallet', value: 'direct' },
        { name: 'Manual funding', value: 'manual' },
      ],
      message: 'How would you like to fund the L2 address?',
    })
    return answer
  }

  private async initializeAltGasToken(): Promise<void> {
    const erc20ABI = [
      'function balanceOf(address account) view returns (uint256)',
      'function transfer(address to, uint256 amount) returns (bool)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
      'function approve(address spender, uint256 amount) returns (bool)'
    ]

    try {
      this.log(chalk.yellow(`Connecting to token contract at address: ${this.l1GasTokenAddress}`))
      this.altGasTokenContract = new ethers.Contract(this.l1GasTokenAddress, erc20ABI, this.fundingWallet.connect(this.l1Provider))

      this.log(chalk.yellow('Fetching token details...'))

      try {
        this.altGasTokenSymbol = await this.altGasTokenContract.symbol.staticCall()
        this.log(chalk.green(`Token symbol: ${this.altGasTokenSymbol}`))
      } catch (symbolError) {
        this.log(chalk.red(`Error fetching symbol: ${symbolError}`))
        this.altGasTokenSymbol = "Unknown"
      }

      try {
        this.altGasTokenDecimals = await this.altGasTokenContract.decimals.staticCall()
        this.log(chalk.green(`Token decimals: ${this.altGasTokenDecimals}`))
      } catch (decimalsError) {
        this.log(chalk.red(`Error fetching decimals: ${decimalsError}`))
        this.altGasTokenDecimals = 18
      }

    } catch (error) {
      this.log(chalk.red('An error occurred while initializing alternative gas token:'))
      this.log(chalk.red(error instanceof Error ? error.stack || error.message : String(error)))
      this.error('Failed to initialize alternative gas token')
    }
  }
}

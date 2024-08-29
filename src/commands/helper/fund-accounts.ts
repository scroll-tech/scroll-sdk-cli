import { confirm, select } from '@inquirer/prompts'
import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { ethers } from 'ethers'
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
        `Missing RPC URL(s) in ${configPath}. Please ensure L1_RPC_ENDPOINT and L2_RPC_ENDPOINT (for pod mode) or EXTERNAL_RPC_URI_L1 and EXTERNAL_RPC_URI_L2 (for non-pod mode) are defined or use the '-o' and '-t' flags.`,
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

      await this.fundL1Addresses(l1Addresses, flags)
      await this.fundL2Addresses(l2Addresses, flags)
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

  private async fundAddressNetwork(provider: ethers.JsonRpcProvider, address: string, amount: number, layer: Layer) {
    try {
      if (!this.fundingWallet.provider) {
        throw new Error('Funding wallet provider is not initialized');
      }

      const initialFunderBalance = await this.fundingWallet.provider.getBalance(this.fundingWallet.address)
      const initialRecipientBalance = await provider.getBalance(address)

      const tx = await this.fundingWallet.sendTransaction({
        to: address,
        value: ethers.parseEther(amount.toString()),
      })
      await tx.wait()
      await this.logTx(tx.hash, `Funded ${address} with ${amount} ETH`, layer)

      const finalFunderBalance = await this.fundingWallet.provider.getBalance(this.fundingWallet.address)
      const finalRecipientBalance = await provider.getBalance(address)

      this.log(chalk.cyan(`Funding wallet balance:`))
      this.log(chalk.yellow(`  Before: ${ethers.formatEther(initialFunderBalance)} ETH`))
      this.log(chalk.yellow(`  After:  ${ethers.formatEther(finalFunderBalance)} ETH`))
      this.log(chalk.cyan(`Recipient wallet balance:`))
      this.log(chalk.yellow(`  Before: ${ethers.formatEther(initialRecipientBalance)} ETH`))
      this.log(chalk.yellow(`  After:  ${ethers.formatEther(finalRecipientBalance)} ETH`))
    } catch (error) {
      this.error(`Failed to fund ${address} (${layer}): ${error instanceof Error ? error.message : 'Unknown error'}`)
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
        // eslint-disable-next-line no-await-in-loop
        await this.fundAddressAnvil(this.l1Provider, address, Number(flags.amount), Layer.L1)
      } else if (flags.manual) {
        // eslint-disable-next-line no-await-in-loop
        await this.promptManualFunding(address, Number(flags.amount), Layer.L1)
      } else {
        // eslint-disable-next-line no-await-in-loop
        await this.fundAddressNetwork(this.l1Provider, address, Number(flags.amount), Layer.L1)
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

      // eslint-disable-next-line no-await-in-loop
      const fundingMethod = await this.promptUserForL2Funding()

      if (fundingMethod === 'bridge') {
        // eslint-disable-next-line no-await-in-loop
        await this.bridgeFundsL1ToL2(address, Number(flags.amount))
      } else if (fundingMethod === 'direct') {
        // eslint-disable-next-line no-await-in-loop
        await this.fundAddressNetwork(this.l2Provider, address, Number(flags.amount), Layer.L2)
      } else {
        // eslint-disable-next-line no-await-in-loop
        await this.promptManualFunding(address, Number(flags.amount), Layer.L2)
      }
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

    await this.logAddress(address, `Please fund the following address with ${chalk.yellow(amount)} ETH`, layer)
    this.log('\n')
    this.log(`ChainID: ${chalk.cyan(Number(chainId))}`)
    this.log(`Chain RPC: ${chalk.cyan(layer === Layer.L1 ? this.l1Rpc : this.l2Rpc)}`)
    this.log('\n')
    this.log('Scan this QR code to fund the address:')

    this.log(await qrCodeToString(qrString, { small: true, type: 'terminal' }))

    let funded = false
    while (!funded) {
      // eslint-disable-next-line no-await-in-loop
      await confirm({ message: 'Press Enter when ready...' })
      this.log(`Checking...`)
      // eslint-disable-next-line no-await-in-loop
      const balance = await (layer === Layer.L1 ? this.l1Provider : this.l2Provider).getBalance(address)
      const formattedBalance = ethers.formatEther(balance)

      if (Number(formattedBalance) >= amount) {
        this.log(chalk.green(`Wallet Balance: ${formattedBalance}`))
        funded = true
      } else {
        this.log(chalk.yellow(`Balance is only ${formattedBalance}. Please fund the wallet.`))
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
}

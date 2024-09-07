import { Args, Command, Flags } from '@oclif/core'
import * as fs from 'fs'
import * as toml from 'toml'
import { input, confirm } from '@inquirer/prompts'
import { ethers } from 'ethers'
import path from 'node:path'
import { parseTomlConfig } from '../../utils/config-parser.js'
import chalk from 'chalk'
import { BlockExplorerParams, addressLink, txLink } from '../../utils/onchain/index.js'

export default class HelperSetScalars extends Command {
  static override description = 'Set commit and blob scalars for Scroll SDK'

  static override flags = {
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
    pod: Flags.boolean({
      char: 'p',
      default: false,
      description: 'Run inside Kubernetes pod',
    }),
    k: Flags.string({ char: 'k', description: 'Private key of the Owner' }),
    blobScalar: Flags.integer({ description: 'Value for setBlobScalar', default: 0 }),
    commitScalar: Flags.integer({ description: 'Value for setCommitScalar', default: 0 }),
    rpc: Flags.string({
      char: 'r',
      description: 'RPC URL (overrides config)',
    }),
  }

  private blockExplorers: Record<'l1' | 'l2', BlockExplorerParams> = {
    l1: { blockExplorerURI: '' },
    l2: { blockExplorerURI: '' },
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(HelperSetScalars)

    const configPath = path.resolve(flags.config)
    const config = parseTomlConfig(configPath)

    const contractsPath = path.resolve(flags.contracts)
    const contractsConfig = parseTomlConfig(contractsPath)

    let rpcUrl = flags.rpc || (flags.pod ? config.general.L2_RPC_ENDPOINT : config.frontend.EXTERNAL_RPC_URI_L2)

    if (!rpcUrl) {
      this.error(`${chalk.red('Missing RPC URL.')} Please check your config file or provide --rpc flag.`)
    }

    let contractAddress = contractsConfig?.L1_GAS_PRICE_ORACLE_ADDR || '0x5300000000000000000000000000000000000002'

    const provider = new ethers.JsonRpcProvider(rpcUrl)

    // Set block explorer URL
    this.blockExplorers.l2.blockExplorerURI = config?.frontend?.EXTERNAL_EXPLORER_URI_L2 || ''

    // Get private key or prompt for owner address
    let signer: ethers.Signer
    let signerAddress: string
    if (flags.k) {
      signer = new ethers.Wallet(flags.k, provider)
      signerAddress = await signer.getAddress()
    } else {
      signerAddress = await input({ message: 'Enter the owner address:' })
      signer = await provider.getSigner(signerAddress)
    }

    await this.logAddress(signerAddress, 'Using address')

    // Check account balance
    const balance = await provider.getBalance(signerAddress)

    // ABI for the contract functions
    const abi = [
      'function setCommitScalar(uint256) public',
      'function setBlobScalar(uint256) public'
    ]

    const contract = new ethers.Contract(contractAddress, abi, signer)

    // Estimate gas for both transactions
    const estimatedGasCommit = await contract.setCommitScalar.estimateGas(flags.commitScalar)
    const estimatedGasBlob = await contract.setBlobScalar.estimateGas(flags.blobScalar)
    const totalEstimatedGas = estimatedGasCommit + estimatedGasBlob

    const feeData = await provider.getFeeData()
    const gasPrice = feeData.gasPrice ?? 0n
    const estimatedCost = totalEstimatedGas * gasPrice

    if (balance < estimatedCost) {
      this.log(chalk.yellow(`Insufficient funds. Account balance: ${chalk.cyan(ethers.formatEther(balance))} ETH`))
      this.log(chalk.yellow(`Estimated cost: ${chalk.cyan(ethers.formatEther(estimatedCost))} ETH`))

      const fundAccount = await confirm({ message: 'Would you like to fund the account from the DEPLOYER address?' })

      if (fundAccount) {
        const deployerPrivateKey = config.accounts.DEPLOYER_PRIVATE_KEY
        const deployerWallet = new ethers.Wallet(deployerPrivateKey, provider)
        const fundingAmount = estimatedCost * BigInt(2) // Double the estimated cost to ensure enough funds

        const fundingTx = await deployerWallet.sendTransaction({
          to: signerAddress,
          value: fundingAmount,
        })

        await fundingTx.wait()
        await this.logTx(fundingTx.hash, `Account funded with ${chalk.green(ethers.formatEther(fundingAmount))} ETH`)
      } else {
        this.error(chalk.red('Insufficient funds to proceed. Aborting.'))
      }
    }

    try {
      // Set commit scalar
      const commitTx = await contract.setCommitScalar(flags.commitScalar)
      await commitTx.wait()
      await this.logTx(commitTx.hash, `Commit scalar set to ${chalk.green(flags.commitScalar)}`)

      // Set blob scalar
      const blobTx = await contract.setBlobScalar(flags.blobScalar)
      await blobTx.wait()
      await this.logTx(blobTx.hash, `Blob scalar set to ${chalk.green(flags.blobScalar)}`)

      this.log(chalk.green('Scalars set successfully!'))
    } catch (error) {
      this.error(chalk.red(`Failed to set scalars: ${error instanceof Error ? error.message : 'Unknown error'}`))
    }
  }

  private async logAddress(address: string, description: string): Promise<void> {
    const link = await addressLink(address, this.blockExplorers.l2)
    this.log(`${chalk.blue(description)}: ${chalk.cyan(link)}`)
  }

  private async logTx(txHash: string, description: string): Promise<void> {
    const link = await txLink(txHash, this.blockExplorers.l2)
    this.log(`${chalk.blue(description)}: ${chalk.cyan(link)}`)
  }
}

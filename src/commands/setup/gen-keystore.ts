import { Command, Flags } from '@oclif/core'
import { Wallet, ethers } from 'ethers'
import * as fs from 'fs'
import * as path from 'path'
import { confirm, password as input, input as textInput } from '@inquirer/prompts'
import * as toml from '@iarna/toml'
import chalk from 'chalk'
import { isAddress } from 'ethers'
import crypto from 'crypto'

interface KeyPair {
  privateKey: string
  address: string
}

export default class SetupGenKeystore extends Command {
  static override description = 'Generate keystore and account keys for L2 Geth'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --no-accounts',
  ]

  static override flags = {
    accounts: Flags.boolean({
      description: 'Generate account key pairs',
      allowNo: true,
      default: true,
    }),
  }

  private async getExistingConfig(): Promise<any> {
    const configPath = path.join(process.cwd(), 'config.toml')
    if (!fs.existsSync(configPath)) {
      this.error('config.toml not found in the current directory.')
      return {}
    }

    const configContent = fs.readFileSync(configPath, 'utf-8')
    return toml.parse(configContent) as any
  }

  private async generateKeystore(existingAddress: string | undefined): Promise<{ address: string, keystoreJson: string, password: string }> {
    const generateNew = await confirm({
      message: 'Do you want to generate a new L2 Geth keystore?',
      default: !existingAddress,
    })

    if (generateNew) {
      const password = await input({ message: 'Enter a password for the L2 Geth keystore:' })
      const wallet = Wallet.createRandom()
      const encryptedJson = await wallet.encrypt(password)
      return {
        address: wallet.address,
        keystoreJson: encryptedJson,
        password,
      }
    } else {
      this.log(chalk.yellow('Using existing L2 Geth keystore.'))
      return {
        address: existingAddress!,
        keystoreJson: '',
        password: '',
      }
    }
  }

  private generateKeyPair(): KeyPair {
    const wallet = Wallet.createRandom()
    return {
      privateKey: wallet.privateKey,
      address: wallet.address,
    }
  }

  private generateRandomHex(bytes: number): string {
    return crypto.randomBytes(bytes).toString('hex')
  }

  private async updateConfigToml(
    signerAddress: string,
    keystoreJson: string,
    password: string,
    accounts: Record<string, KeyPair>,
    coordinatorJwtSecretKey?: string
  ): Promise<void> {
    const configPath = path.join(process.cwd(), 'config.toml')
    const existingConfig = await this.getExistingConfig()

    if (!existingConfig.accounts) existingConfig.accounts = {}
    if (!existingConfig.sequencer) existingConfig.sequencer = {}

    // Add L2GETH values to sequencer section
    if (signerAddress) existingConfig.sequencer.L2GETH_SIGNER_ADDRESS = signerAddress
    if (keystoreJson) existingConfig.sequencer.L2GETH_KEYSTORE = keystoreJson
    if (password) existingConfig.sequencer.L2GETH_PASSWORD = password
    if (!existingConfig.sequencer.L2GETH_NODEKEY) {
      existingConfig.sequencer.L2GETH_NODEKEY = Wallet.createRandom().privateKey.slice(2) // Remove '0x' prefix
    }

    // Add other accounts
    for (const [key, value] of Object.entries(accounts)) {
      if (key === 'OWNER') {
        // Only set the address for OWNER, remove the private key if it exists
        existingConfig.accounts.OWNER_ADDR = value.address
        delete existingConfig.accounts.OWNER_PRIVATE_KEY
      } else {
        existingConfig.accounts[`${key}_PRIVATE_KEY`] = value.privateKey
        existingConfig.accounts[`${key}_ADDR`] = value.address
      }
    }

    // Add COORDINATOR_JWT_SECRET_KEY if generated
    if (coordinatorJwtSecretKey) {
      if (!existingConfig.coordinator) existingConfig.coordinator = {}
      existingConfig.coordinator.COORDINATOR_JWT_SECRET_KEY = coordinatorJwtSecretKey
    }

    fs.writeFileSync(configPath, toml.stringify(existingConfig))
    this.log(chalk.green('config.toml updated successfully'))
  }

  private async getOwnerAddress(existingOwnerAddr: string | undefined): Promise<string | undefined> {
    const useManualAddress = await confirm({
      message: 'Do you want to manually provide an Owner wallet address?',
      default: !!existingOwnerAddr,
    })
    if (useManualAddress) {
      let ownerAddress: string | undefined
      while (!ownerAddress) {
        const input = await textInput({
          message: 'Enter the Owner wallet address:',
          default: existingOwnerAddr,
        })
        if (isAddress(input)) {
          ownerAddress = input
        } else {
          this.log(chalk.red('Invalid Ethereum address format. Please try again.'))
        }
      }
      return ownerAddress
    }
    return undefined
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(SetupGenKeystore)
    const existingConfig = await this.getExistingConfig()

    this.log(chalk.blue('Setting up L2 Geth keystore and account keys...'))

    let keystoreData = { address: '', keystoreJson: '', password: '' }
    keystoreData = await this.generateKeystore(existingConfig.sequencer?.L2GETH_SIGNER_ADDRESS)

    let accounts: Record<string, KeyPair> = {}
    if (flags.accounts) {
      const generateAccounts = await confirm({
        message: 'Do you want to generate account key pairs?',
        default: true,
      })

      if (generateAccounts) {
        this.log(chalk.blue('Generating account key pairs...'))
        const accountTypes = ['DEPLOYER', 'L1_COMMIT_SENDER', 'L1_FINALIZE_SENDER', 'L1_GAS_ORACLE_SENDER', 'L2_GAS_ORACLE_SENDER']

        for (const accountType of accountTypes) {
          if (!existingConfig.accounts?.[`${accountType}_PRIVATE_KEY`]) {
            accounts[accountType] = this.generateKeyPair()
          } else {
            accounts[accountType] = {
              privateKey: existingConfig.accounts[`${accountType}_PRIVATE_KEY`],
              address: existingConfig.accounts[`${accountType}_ADDR`],
            }
          }
        }

        const ownerAddress = await this.getOwnerAddress(existingConfig.accounts?.OWNER_ADDR)
        if (ownerAddress) {
          accounts.OWNER = { privateKey: '', address: ownerAddress }
        } else {
          accounts.OWNER = this.generateKeyPair()
          this.log(chalk.yellow('\n⚠️  IMPORTANT: Randomly generated Owner wallet'))
          this.log(chalk.yellow('Owner private key will not be stored in config.toml'))
          this.log(chalk.yellow('Please store this private key in a secure place:'))
          this.log(chalk.red(`OWNER_PRIVATE_KEY: ${accounts.OWNER.privateKey}`))
          this.log(chalk.yellow('You will need this key for future operations!\n'))
        }

        // Display public addresses
        this.log(chalk.cyan('\nGenerated public addresses:'))
        for (const [key, value] of Object.entries(accounts)) {
          this.log(chalk.cyan(`${key}_ADDR: ${value.address}`))
        }
      } else {
        this.log(chalk.yellow('Skipping account key pair generation...'))
      }
    }

    if (keystoreData.address) {
      this.log(chalk.green(`\nL2GETH_SIGNER_ADDRESS: ${keystoreData.address}`))
      this.log(chalk.green('L2GETH_KEYSTORE: [Encrypted JSON keystore]'))
    }

    let coordinatorJwtSecretKey: string | undefined

    const generateJwtSecret = await confirm({
      message: 'Do you want to generate a random COORDINATOR_JWT_SECRET_KEY?',
      default: !existingConfig.coordinator?.COORDINATOR_JWT_SECRET_KEY,
    })
    if (generateJwtSecret) {
      coordinatorJwtSecretKey = this.generateRandomHex(32)
      this.log(chalk.green(`Generated COORDINATOR_JWT_SECRET_KEY: ${coordinatorJwtSecretKey}`))
    }

    const updateConfig = await confirm({ message: 'Do you want to update these values in config.toml?' })

    if (updateConfig) {
      await this.updateConfigToml(
        keystoreData.address,
        keystoreData.keystoreJson,
        keystoreData.password,
        accounts,
        coordinatorJwtSecretKey
      )
      this.log(chalk.green('config.toml updated successfully'))
    }

    this.log(chalk.blue('Keystore and account key generation completed.'))
  }
}
import { Command, Flags } from '@oclif/core'
import { Wallet } from 'ethers'
import * as fs from 'fs'
import * as path from 'path'
import { confirm, password as input, input as textInput } from '@inquirer/prompts'
import * as toml from '@iarna/toml'
import chalk from 'chalk'
import { isAddress } from 'ethers'

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

  private async generateKeystore(): Promise<{ address: string, keystoreJson: string, password: string }> {
    const password = await input({ message: 'Enter a password for the L2 Geth keystore:' })

    const wallet = Wallet.createRandom()
    const encryptedJson = await wallet.encrypt(password)

    return {
      address: wallet.address,
      keystoreJson: encryptedJson,
      password,
    }
  }

  private generateKeyPair(): KeyPair {
    const wallet = Wallet.createRandom()
    return {
      privateKey: wallet.privateKey,
      address: wallet.address,
    }
  }

  private async updateConfigToml(
    signerAddress: string,
    keystoreJson: string,
    password: string,
    accounts: Record<string, KeyPair>
  ): Promise<void> {
    const configPath = path.join(process.cwd(), 'config.toml')
    let config: any = {}

    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf-8')
      config = toml.parse(configContent)
    }

    if (!config.accounts) {
      config.accounts = {}
    }

    if (!config.sequencer) {
      config.sequencer = {}
    }

    // Add L2GETH values to sequencer section
    config.sequencer.L2GETH_SIGNER_ADDRESS = signerAddress
    config.sequencer.L2GETH_KEYSTORE = keystoreJson
    config.sequencer.L2GETH_PASSWORD = password
    config.sequencer.L2GETH_NODEKEY = Wallet.createRandom().privateKey.slice(2) // Remove '0x' prefix

    // Add other accounts
    for (const [key, value] of Object.entries(accounts)) {
      if (key === 'OWNER') {
        // Only set the address for OWNER, remove the private key if it exists
        config.accounts.OWNER_ADDR = value.address
        delete config.accounts.OWNER_PRIVATE_KEY
      } else {
        config.accounts[`${key}_PRIVATE_KEY`] = value.privateKey
        config.accounts[`${key}_ADDR`] = value.address
      }
    }

    fs.writeFileSync(configPath, toml.stringify(config))
    this.log(chalk.green('config.toml updated successfully'))
  }

  private async getOwnerAddress(): Promise<string | undefined> {
    const useManualAddress = await confirm({ message: 'Do you want to manually provide an Owner wallet address?' })
    if (useManualAddress) {
      let ownerAddress: string | undefined
      while (!ownerAddress) {
        const input = await textInput({ message: 'Enter the Owner wallet address:' })
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

    this.log(chalk.blue('Generating L2 Geth keystore...'))
    const { address, keystoreJson, password } = await this.generateKeystore()

    let accounts: Record<string, KeyPair> = {}
    if (flags.accounts) {
      this.log(chalk.blue('Generating account key pairs...'))
      accounts = {
        DEPLOYER: this.generateKeyPair(),
        L1_COMMIT_SENDER: this.generateKeyPair(),
        L1_FINALIZE_SENDER: this.generateKeyPair(),
        L1_GAS_ORACLE_SENDER: this.generateKeyPair(),
        L2_GAS_ORACLE_SENDER: this.generateKeyPair(),
      }

      const ownerAddress = await this.getOwnerAddress()
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

    this.log(chalk.green(`\nL2GETH_SIGNER_ADDRESS: ${address}`))
    this.log(chalk.green('L2GETH_KEYSTORE: [Encrypted JSON keystore]'))

    const updateConfig = await confirm({ message: 'Do you want to update these values in config.toml?' })

    if (updateConfig) {
      await this.updateConfigToml(address, keystoreJson, password, accounts)
      this.log(chalk.green('config.toml updated successfully'))
    }

    this.log(chalk.blue('Keystore and account key generation completed.'))
  }
}
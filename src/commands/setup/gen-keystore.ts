import { Command } from '@oclif/core'
import { Wallet } from 'ethers'
import * as fs from 'fs'
import * as path from 'path'
import { confirm, password as input } from '@inquirer/prompts'
import * as toml from '@iarna/toml'

interface KeyPair {
  privateKey: string
  address: string
}

export default class SetupGenKeystore extends Command {
  static override description = 'Generate keystore and account keys for L2 Geth'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

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

    // Add L2GETH values to accounts section only
    config.accounts.L2GETH_SIGNER_ADDRESS = signerAddress
    config.accounts.L2GETH_KEYSTORE = keystoreJson
    config.accounts.L2GETH_PASSWORD = password
    config.accounts.L2GETH_NODEKEY = Wallet.createRandom().privateKey.slice(2) // Remove '0x' prefix

    // Add other accounts
    for (const [key, value] of Object.entries(accounts)) {
      config.accounts[`${key}_PRIVATE_KEY`] = value.privateKey
      config.accounts[`${key}_ADDR`] = value.address
    }

    fs.writeFileSync(configPath, toml.stringify(config))
    this.log('config.toml updated successfully')
  }

  public async run(): Promise<void> {
    this.log('Generating L2 Geth keystore...')
    const { address, keystoreJson, password } = await this.generateKeystore()

    this.log('Generating account key pairs...')
    const accounts: Record<string, KeyPair> = {
      DEPLOYER: this.generateKeyPair(),
      OWNER: this.generateKeyPair(),
      L1_COMMIT_SENDER: this.generateKeyPair(),
      L1_FINALIZE_SENDER: this.generateKeyPair(),
      L1_GAS_ORACLE_SENDER: this.generateKeyPair(),
      L2_GAS_ORACLE_SENDER: this.generateKeyPair(),
    }

    this.log(`L2GETH_SIGNER_ADDRESS: ${address}`)
    this.log('L2GETH_KEYSTORE: [Encrypted JSON keystore]')

    const updateConfig = await confirm({ message: 'Do you want to update these values in config.toml?' })

    if (updateConfig) {
      await this.updateConfigToml(address, keystoreJson, password, accounts)
    }

    this.log('Keystore and account key generation completed.')
  }
}
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

interface SequencerData {
  address: string
  keystoreJson: string
  password: string
  nodekey: string
}

interface BootnodeData {
  nodekey: string
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

  private async generateSequencerKeystore(index: number): Promise<SequencerData> {
    const password = await input({ message: `Enter a password for sequencer-${index} keystore:` })
    const wallet = Wallet.createRandom()
    const encryptedJson = await wallet.encrypt(password)
    return {
      address: wallet.address,
      keystoreJson: encryptedJson,
      password,
      nodekey: Wallet.createRandom().privateKey.slice(2), // Remove '0x' prefix
    }
  }

  private getEnodeUrl(nodekey: string, index: number): string {
    // Remove '0x' prefix if present
    nodekey = nodekey.startsWith('0x') ? nodekey.slice(2) : nodekey;

    // Create a Wallet instance from the private key
    const wallet = new ethers.Wallet(nodekey);

    // Get the public key
    const publicKey = wallet.signingKey.publicKey;

    // Remove '0x04' prefix from public key
    const publicKeyNoPrefix = publicKey.slice(4);

    return `enode://${publicKeyNoPrefix}@l2-sequencer-${index}:30303`
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
    sequencerData: SequencerData[],
    bootnodeData: BootnodeData[],
    accounts: Record<string, KeyPair>,
    coordinatorJwtSecretKey?: string,
    overwriteSequencers: boolean = false,
    overwriteBootnodes: boolean = false
  ): Promise<void> {
    const configPath = path.join(process.cwd(), 'config.toml')
    const existingConfig = await this.getExistingConfig()

    // Create a new object to store the updated config
    let updatedConfig: Record<string, any> = {}

    // Helper function to add or update a section
    const addOrUpdateSection = (key: string, value: any) => {
      if (key === 'sequencer') {
        updatedConfig[key] = value || {}
        const enodeUrls = sequencerData.map((data, index) => this.getEnodeUrl(data.nodekey, index))
        updatedConfig[key].L2_GETH_STATIC_PEERS = enodeUrls

        // If overwriting, remove all existing sequencer subsections
        if (overwriteSequencers) {
          Object.keys(updatedConfig[key]).forEach(subKey => {
            if (subKey.startsWith('sequencer-')) {
              delete updatedConfig[key][subKey]
            }
          })
        }

        // Add sequencer subsections
        sequencerData.forEach((data, index) => {
          const subKey = `sequencer-${index}`
          updatedConfig[key][subKey] = {
            L2GETH_SIGNER_ADDRESS: data.address,
            L2GETH_KEYSTORE: data.keystoreJson,
            L2GETH_PASSWORD: data.password,
            L2GETH_NODEKEY: data.nodekey,
          }
        })
      } else if (key === 'bootnode') {
        updatedConfig[key] = value || {}

        // If overwriting, remove all existing bootnode subsections
        if (overwriteBootnodes) {
          Object.keys(updatedConfig[key]).forEach(subKey => {
            if (subKey.startsWith('bootnode-')) {
              delete updatedConfig[key][subKey]
            }
          })
        }

        // Add bootnode subsections
        bootnodeData.forEach((data, index) => {
          const subKey = `bootnode-${index}`
          updatedConfig[key][subKey] = {
            L2GETH_NODEKEY: data.nodekey,
          }
        })
      } else if (key === 'accounts') {
        updatedConfig[key] = value || {}
        for (const [accountKey, accountValue] of Object.entries(accounts)) {
          if (accountKey === 'OWNER') {
            updatedConfig[key].OWNER_ADDR = accountValue.address
            delete updatedConfig[key].OWNER_PRIVATE_KEY
          } else {
            updatedConfig[key][`${accountKey}_PRIVATE_KEY`] = accountValue.privateKey
            updatedConfig[key][`${accountKey}_ADDR`] = accountValue.address
          }
        }
      } else if (key === 'coordinator') {
        updatedConfig[key] = value || {}
        if (coordinatorJwtSecretKey) {
          updatedConfig[key].COORDINATOR_JWT_SECRET_KEY = coordinatorJwtSecretKey
        }
      } else {
        updatedConfig[key] = value
      }
    }

    // Iterate through existing config to maintain order
    for (const [key, value] of Object.entries(existingConfig)) {
      addOrUpdateSection(key, value)
    }

    // Add new sections if they didn't exist in the original config
    if (!updatedConfig.sequencer) addOrUpdateSection('sequencer', null)
    if (!updatedConfig.bootnode) addOrUpdateSection('bootnode', null)
    if (!updatedConfig.accounts) addOrUpdateSection('accounts', null)
    if (coordinatorJwtSecretKey && !updatedConfig.coordinator) addOrUpdateSection('coordinator', null)

    fs.writeFileSync(configPath, toml.stringify(updatedConfig))
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

  private async generateBootnodeNodekey(): Promise<string> {
    return Wallet.createRandom().privateKey.slice(2) // Remove '0x' prefix
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(SetupGenKeystore)
    const existingConfig = await this.getExistingConfig()

    this.log(chalk.blue('Setting up Sequencer keystores, bootnode nodekeys, L2 account keypairs, and coordinator JWT secret key...'))

    // Handle sequencer keystores
    const changeSequencerKeys = await confirm({
      message: 'Do you want to change your sequencer keys?',
      default: false,
    })

    let sequencerData: SequencerData[] = []
    let overwrite = false;

    if (changeSequencerKeys) {
      const existingSequencers = existingConfig.sequencer
        ? Object.keys(existingConfig.sequencer)
          .filter(key => key.startsWith('sequencer-'))
          .filter(key => {
            const section = existingConfig.sequencer[key];
            return section && Object.values(section).some(value => value !== '');
          })
          .length
        : 0;

      const backupCount = await textInput({
        message: `How many backup sequencers do you want to run? (Current: ${Math.max(0, existingSequencers - 1)}, suggested: 1)`,
        default: '1',
      })
      const totalSequencers = parseInt(backupCount) + 1

      if (existingSequencers > 0) {
        const action = await textInput({
          message: 'Do you want to (a)dd additional keystores or (o)verwrite existing ones?',
          default: 'a',
        })

        if (action.toLowerCase() === 'a') {
          // Add additional keystores
          if (totalSequencers <= existingSequencers) {
            this.log(chalk.yellow(`You already have ${existingSequencers} sequencer(s). No new sequencers will be added.`))
            // Keep existing sequencer data
            for (let i = 0; i < existingSequencers; i++) {
              const sectionName = `sequencer-${i}`
              if (existingConfig.sequencer[sectionName] && Object.values(existingConfig.sequencer[sectionName]).some(value => value !== '')) {
                sequencerData.push({
                  address: existingConfig.sequencer[sectionName].L2GETH_SIGNER_ADDRESS,
                  keystoreJson: existingConfig.sequencer[sectionName].L2GETH_KEYSTORE,
                  password: existingConfig.sequencer[sectionName].L2GETH_PASSWORD,
                  nodekey: existingConfig.sequencer[sectionName].L2GETH_NODEKEY,
                })
              }
            }
          } else {
            // Keep existing sequencer data
            for (let i = 0; i < existingSequencers; i++) {
              const sectionName = `sequencer-${i}`
              if (existingConfig.sequencer[sectionName] && Object.values(existingConfig.sequencer[sectionName]).some(value => value !== '')) {
                sequencerData.push({
                  address: existingConfig.sequencer[sectionName].L2GETH_SIGNER_ADDRESS,
                  keystoreJson: existingConfig.sequencer[sectionName].L2GETH_KEYSTORE,
                  password: existingConfig.sequencer[sectionName].L2GETH_PASSWORD,
                  nodekey: existingConfig.sequencer[sectionName].L2GETH_NODEKEY,
                })
              }
            }
            // Add new sequencers
            for (let i = existingSequencers; i < totalSequencers; i++) {
              sequencerData.push(await this.generateSequencerKeystore(i))
            }
          }
        } else if (action.toLowerCase() === 'o') {
          overwrite = true;
          // Overwrite existing keystores
          for (let i = 0; i < totalSequencers; i++) {
            sequencerData.push(await this.generateSequencerKeystore(i))
          }
        } else {
          this.error(chalk.red('Invalid option. Please run the command again and choose either (a)dd or (o)verwrite.'))
        }
      } else {
        // Generate new keystores
        for (let i = 0; i < totalSequencers; i++) {
          sequencerData.push(await this.generateSequencerKeystore(i))
        }
      }
    } else {
      // Keep existing sequencer data
      if (existingConfig.sequencer) {
        Object.keys(existingConfig.sequencer).forEach(key => {
          if (key.startsWith('sequencer-') && Object.values(existingConfig.sequencer[key]).some(value => value !== '')) {
            sequencerData.push({
              address: existingConfig.sequencer[key].L2GETH_SIGNER_ADDRESS,
              keystoreJson: existingConfig.sequencer[key].L2GETH_KEYSTORE,
              password: existingConfig.sequencer[key].L2GETH_PASSWORD,
              nodekey: existingConfig.sequencer[key].L2GETH_NODEKEY,
            })
          }
        })
      }
    }

    let bootnodeData: BootnodeData[] = []
    let overwriteBootnodes = false

    const changeBootnodeKeys = await confirm({
      message: 'Do you want to change your bootnode keys?',
      default: false,
    })

    if (changeBootnodeKeys) {
      const existingBootnodes = existingConfig.bootnode
        ? Object.keys(existingConfig.bootnode)
          .filter(key => key.startsWith('bootnode-'))
          .filter(key => {
            const section = existingConfig.bootnode[key];
            return section && section.L2GETH_NODEKEY !== '';
          })
          .length
        : 0;

      const bootnodeCount = await textInput({
        message: `How many bootnodes do you want to run? (Current: ${existingBootnodes}, suggested: 2)`,
        default: '2',
      })
      const totalBootnodes = parseInt(bootnodeCount)

      if (existingBootnodes > 0) {
        const action = await textInput({
          message: 'Do you want to (a)dd additional bootnode keys or (o)verwrite existing ones?',
          default: 'a',
        })

        if (action.toLowerCase() === 'a') {
          // Add additional bootnode keys
          if (totalBootnodes <= existingBootnodes) {
            this.log(chalk.yellow(`You already have ${existingBootnodes} bootnode(s). No new bootnodes will be added.`))
            // Keep existing bootnode data
            for (let i = 0; i < existingBootnodes; i++) {
              const sectionName = `bootnode-${i}`
              if (existingConfig.bootnode[sectionName] && existingConfig.bootnode[sectionName].L2GETH_NODEKEY) {
                bootnodeData.push({
                  nodekey: existingConfig.bootnode[sectionName].L2GETH_NODEKEY,
                })
              }
            }
          } else {
            // Keep existing bootnode data
            for (let i = 0; i < existingBootnodes; i++) {
              const sectionName = `bootnode-${i}`
              if (existingConfig.bootnode[sectionName] && existingConfig.bootnode[sectionName].L2GETH_NODEKEY) {
                bootnodeData.push({
                  nodekey: existingConfig.bootnode[sectionName].L2GETH_NODEKEY,
                })
              }
            }
            // Add new bootnode keys
            for (let i = existingBootnodes; i < totalBootnodes; i++) {
              bootnodeData.push({ nodekey: await this.generateBootnodeNodekey() })
            }
          }
        } else if (action.toLowerCase() === 'o') {
          overwriteBootnodes = true;
          // Overwrite existing bootnode keys
          for (let i = 0; i < totalBootnodes; i++) {
            bootnodeData.push({ nodekey: await this.generateBootnodeNodekey() })
          }
        } else {
          this.error(chalk.red('Invalid option. Please run the command again and choose either (a)dd or (o)verwrite.'))
        }
      } else {
        // Generate new bootnode keys
        for (let i = 0; i < totalBootnodes; i++) {
          bootnodeData.push({ nodekey: await this.generateBootnodeNodekey() })
        }
      }
    } else {
      // Keep existing bootnode data
      if (existingConfig.bootnode) {
        Object.keys(existingConfig.bootnode).forEach(key => {
          if (key.startsWith('bootnode-') && existingConfig.bootnode[key].L2GETH_NODEKEY) {
            bootnodeData.push({
              nodekey: existingConfig.bootnode[key].L2GETH_NODEKEY,
            })
          }
        })
      }
    }

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
        sequencerData,
        bootnodeData,
        accounts,
        coordinatorJwtSecretKey,
        overwrite,
        overwriteBootnodes
      )
      this.log(chalk.green('config.toml updated successfully'))
    }

    this.log(chalk.blue('Keystore, bootnode, and account key generation completed.'))
  }
}
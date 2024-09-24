import { Command, Flags } from '@oclif/core'
import Docker from 'dockerode';
import * as fs from 'fs'
import * as path from 'path'
import * as toml from '@iarna/toml'
import chalk from 'chalk'
import { confirm, input, select } from '@inquirer/prompts'
import { ethers } from 'ethers'

export default class SetupConfigs extends Command {
  static override description = 'Generate configuration files and create environment files for services'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --image-tag v0.0.24',
  ]

  static override flags = {
    'image-tag': Flags.string({
      description: 'Specify the Docker image tag to use',
      required: false,
    }),
  }

  private async runDockerCommand(imageTag: string): Promise<void> {
    const docker = new Docker();
    const image = `scrolltech/scroll-stack-contracts:${imageTag}`;

    try {
      this.log(chalk.cyan("Pulling Docker Image..."))
      // Pull the image if it doesn't exist locally
      const pullStream = await docker.pull(image);
      await new Promise((resolve, reject) => {
        docker.modem.followProgress(pullStream, (err, res) => {
          if (err) {
            reject(err);
          } else {
            this.log(chalk.green('Image pulled successfully'));
            resolve(res);
          }
        });
      });

      this.log(chalk.cyan("Creating Docker Container..."))
      // Create and run the container
      const container = await docker.createContainer({
        Image: image,
        Cmd: [], // Add any command if needed
        HostConfig: {
          Binds: [`${process.cwd()}:/contracts/volume`],
        },
      });

      this.log(chalk.cyan("Starting Container"))
      await container.start();

      // Wait for the container to finish and get the logs
      const stream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
      });

      // Print the logs
      stream.pipe(process.stdout);

      // Wait for the container to finish
      await new Promise((resolve) => {
        container.wait((err, data) => {
          if (err) {
            this.error(`Container exited with error: ${err}`);
          } else if (data.StatusCode !== 0) {
            this.error(`Container exited with status code: ${data.StatusCode}`);
          }
          resolve(null);
        });
      });

      // Remove the container
      await container.remove();

    } catch (error) {
      this.error(`Failed to run Docker command: ${error}`);
    }
  }

  private createSecretsFolder(): void {
    const secretsPath = path.join(process.cwd(), 'secrets')
    if (!fs.existsSync(secretsPath)) {
      fs.mkdirSync(secretsPath)
      this.log(chalk.green('Created secrets folder'))
    } else {
      this.log(chalk.yellow('Secrets folder already exists'))
    }
  }

  private async createEnvFiles(): Promise<void> {
    const configPath = path.join(process.cwd(), 'config.toml')
    if (!fs.existsSync(configPath)) {
      this.error(chalk.red('config.toml not found in the current directory.'))
      return
    }

    const configContent = fs.readFileSync(configPath, 'utf-8')
    const config = toml.parse(configContent)

    const services = [
      'blockscout', 'bridge-history-api', 'bridge-history-fetcher', 'chain-monitor', 'coordinator-cron', 'coordinator-api',
      'gas-oracle', 'l1-explorer', 'l2-sequencer', 'rollup-node'
    ]

    for (const service of services) {
      const envFile = path.join(process.cwd(), 'secrets', `${service}-secret.env`)
      const envContent = this.generateEnvContent(service, config)
      fs.writeFileSync(envFile, envContent)
      this.log(chalk.green(`Created ${service}-secret.env`))
    }

    // Create additional files
    this.createMigrateDbFiles(config)
  }

  // TODO: check privatekey secrets once integrated
  private generateEnvContent(service: string, config: any): string {
    const mapping: Record<string, string[]> = {
      'blockscout': ['BLOCKSCOUT_DB_CONNECTION_STRING:DATABASE_URL'],
      'bridge-history-api': ['BRIDGE_HISTORY_DB_CONNECTION_STRING:SCROLL_BRIDGE_HISTORY_DB_DSN'],
      'bridge-history-fetcher': ['BRIDGE_HISTORY_DB_CONNECTION_STRING:SCROLL_BRIDGE_HISTORY_DB_DSN'],
      'chain-monitor': ['CHAIN_MONITOR_DB_CONNECTION_STRING:SCROLL_CHAIN_MONITOR_DB_CONFIG_DSN'],
      'coordinator-api': ['COORDINATOR_DB_CONNECTION_STRING:SCROLL_COORDINATOR_DB_DSN', 'COORDINATOR_JWT_SECRET_KEY:SCROLL_COORDINATOR_AUTH_SECRET'],
      'coordinator-cron': ['COORDINATOR_DB_CONNECTION_STRING:SCROLL_COORDINATOR_DB_DSN', 'COORDINATOR_JWT_SECRET_KEY:SCROLL_COORDINATOR_AUTH_SECRET'],
      'gas-oracle': ['GAS_ORACLE_DB_CONNECTION_STRING:SCROLL_ROLLUP_DB_CONFIG_DSN', 'L1_GAS_ORACLE_SENDER_PRIVATE_KEY:SCROLL_ROLLUP_L1_CONFIG_RELAYER_CONFIG_GAS_ORACLE_SENDER_PRIVATE_KEY', 'L2_GAS_ORACLE_SENDER_PRIVATE_KEY:SCROLL_ROLLUP_L2_CONFIG_RELAYER_CONFIG_GAS_ORACLE_SENDER_PRIVATE_KEY'],
      'l1-explorer': ['L1_EXPLORER_DB_CONNECTION_STRING:DATABASE_URL'],
      'l2-sequencer': ['L2GETH_KEYSTORE:L2GETH_KEYSTORE_1', 'L2GETH_PASSWORD:L2GETH_PASSWORD_1', 'L2GETH_NODEKEY:L2GETH_NODEKEY_1'],
      'rollup-node': ['ROLLUP_NODE_DB_CONNECTION_STRING:SCROLL_ROLLUP_DB_CONFIG_DSN', 'L1_COMMIT_SENDER_PRIVATE_KEY:SCROLL_ROLLUP_L2_CONFIG_RELAYER_CONFIG_COMMIT_SENDER_PRIVATE_KEY', 'L1_FINALIZE_SENDER_PRIVATE_KEY:SCROLL_ROLLUP_L2_CONFIG_RELAYER_CONFIG_FINALIZE_SENDER_PRIVATE_KEY'],
    }

    let content = ''
    for (const pair of mapping[service] || []) {
      const [configKey, envKey] = pair.split(':')
      if (config.db && config.db[configKey]) {
        content += `${envKey}="${config.db[configKey]}"\n`
      } else if (config.accounts && config.accounts[configKey]) {
        content += `${envKey}="${config.accounts[configKey]}"\n`
      } else if (config.coordinator && config.coordinator[configKey]) {
        content += `${envKey}="${config.coordinator[configKey]}"\n`
      } else if (config.sequencer && config.sequencer[configKey]) {
        content += `${envKey}="${config.sequencer[configKey]}"\n`
      }
    }
    return content
  }

  private createMigrateDbFiles(config: any): void {
    const migrateDbFiles = [
      { service: 'bridge-history-fetcher', key: 'BRIDGE_HISTORY_DB_CONNECTION_STRING' },
      { service: 'gas-oracle', key: 'GAS_ORACLE_DB_CONNECTION_STRING' },
      { service: 'rollup-node', key: 'ROLLUP_NODE_DB_CONNECTION_STRING' },
    ]

    for (const file of migrateDbFiles) {
      const filePath = path.join(process.cwd(), 'secrets', `${file.service}-migrate-db.json`)
      let content: any;

      if (file.service === 'bridge-history-fetcher') {
        content = {
          l1: {},
          l2: {},
          db: {
            driver_name: 'postgres',
            maxOpenNum: 50,
            maxIdleNume: 5,
            dsn: config.db[file.key],
          }
        }
      } else {
        content = {
          driver_name: 'postgres',
          dsn: config.db[file.key],
        }
      }

      fs.writeFileSync(filePath, JSON.stringify(content, null, 2))
      this.log(chalk.green(`Created ${file.service}-migrate-db.json`))
    }
  }

  private copyContractsConfigs(): void {
    const sourceDir = process.cwd()
    const targetDir = path.join(sourceDir, 'contracts', 'configs')

    // Ensure the target directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const filesToCopy = ['config.toml', 'config-contracts.toml']

    for (const file of filesToCopy) {
      const sourcePath = path.join(sourceDir, file)
      const targetPath = path.join(targetDir, file)

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath)
        this.log(chalk.green(`Copied ${file} to contracts/configs/`))
      } else {
        this.log(chalk.yellow(`${file} not found in the current directory, skipping.`))
      }
    }
  }

  private async updateDeploymentSalt(): Promise<void> {
    const configPath = path.join(process.cwd(), 'config.toml')
    if (!fs.existsSync(configPath)) {
      this.log(chalk.yellow('config.toml not found. Skipping deployment salt update.'))
      return
    }

    const configContent = fs.readFileSync(configPath, 'utf-8')
    const config = toml.parse(configContent)

    const currentSalt = (config.contracts as any)?.DEPLOYMENT_SALT || ''
    let defaultNewSalt = currentSalt

    if (/\d+$/.test(currentSalt)) {
      // If the current salt ends with a number, increment it
      const number = parseInt(currentSalt.match(/\d+$/)[0], 10)
      defaultNewSalt = currentSalt.replace(/\d+$/, (number + 1).toString())
    } else {
      // Generate a new random 6 char string and append it to the base
      const baseSalt = currentSalt.split('-')[0] || 'devnetSalt'
      const randomString = Math.random().toString(36).substring(2, 8)
      defaultNewSalt = `${baseSalt}-${randomString}`
    }

    this.log(chalk.cyan(`Current deployment salt: ${currentSalt}`))
    const updateSalt = await confirm({
      message: 'Would you like to update the deployment salt in config.toml?'
    })

    if (updateSalt) {
      const newSalt = await input({
        message: 'Enter new deployment salt:',
        default: defaultNewSalt
      })

      if (!config.contracts) {
        config.contracts = {}
      }
      (config.contracts as any).DEPLOYMENT_SALT = newSalt

      fs.writeFileSync(configPath, toml.stringify(config as any))
      this.log(chalk.green(`Deployment salt updated in config.toml from "${currentSalt}" to "${newSalt}"`))
    } else {
      this.log(chalk.yellow('Deployment salt not updated'))
    }
  }

  private async updateL1ContractDeploymentBlock(): Promise<void> {
    const configPath = path.join(process.cwd(), 'config.toml')
    if (!fs.existsSync(configPath)) {
      this.log(chalk.yellow('config.toml not found. Skipping L1_CONTRACT_DEPLOYMENT_BLOCK update.'))
      return
    }

    const configContent = fs.readFileSync(configPath, 'utf-8')
    const config = toml.parse(configContent)

    const currentBlock = (config.general as any)?.L1_CONTRACT_DEPLOYMENT_BLOCK || ''
    let defaultNewBlock = currentBlock

    const updateBlock = await confirm({
      message: 'Would you like to update the L1_CONTRACT_DEPLOYMENT_BLOCK in config.toml?'
    })

    if (updateBlock) {
      try {
        const l1RpcUri = (config.frontend as any)?.EXTERNAL_RPC_URI_L1
        if (l1RpcUri) {
          const provider = new ethers.JsonRpcProvider(l1RpcUri)
          const latestBlock = await provider.getBlockNumber()
          defaultNewBlock = latestBlock.toString()
          this.log(chalk.green(`Retrieved current L1 block height: ${defaultNewBlock}`))
        } else {
          this.log(chalk.yellow('EXTERNAL_RPC_URI_L1 not found in config.toml. Using current value as default.'))
        }
      } catch (error) {
        this.log(chalk.yellow(`Failed to retrieve current L1 block height: ${error}`))
        this.log(chalk.yellow('Using current value as default.'))
      }

      if (!defaultNewBlock || isNaN(Number(defaultNewBlock))) {
        defaultNewBlock = '0'
      }

      const newBlock = await input({
        message: 'Enter new L1_CONTRACT_DEPLOYMENT_BLOCK:',
        default: defaultNewBlock
      })

      if (!config.general) {
        config.general = {}
      }
      (config.general as any).L1_CONTRACT_DEPLOYMENT_BLOCK = newBlock

      fs.writeFileSync(configPath, toml.stringify(config as any))
      this.log(chalk.green(`L1_CONTRACT_DEPLOYMENT_BLOCK updated in config.toml from "${currentBlock}" to "${newBlock}"`))
    } else {
      this.log(chalk.yellow('L1_CONTRACT_DEPLOYMENT_BLOCK not updated'))
    }
  }

  private nodeKeyToEnodeId(nodeKey: string): string {
    // Remove '0x' prefix if present
    nodeKey = nodeKey.startsWith('0x') ? nodeKey.slice(2) : nodeKey;

    // Create a Wallet instance from the private key
    const wallet = new ethers.Wallet(nodeKey);

    // Get the public key
    const publicKey = wallet.signingKey.publicKey;

    // Remove '0x04' prefix from public key
    const publicKeyNoPrefix = publicKey.slice(4);

    // The enode ID is the uncompressed public key without the '04' prefix
    return publicKeyNoPrefix;
  }

  private async updateSequencerEnode(): Promise<void> {
    const configPath = path.join(process.cwd(), 'config.toml')
    if (!fs.existsSync(configPath)) {
      this.log(chalk.yellow('config.toml not found. Skipping sequencer enode update.'))
      return
    }

    const configContent = fs.readFileSync(configPath, 'utf-8')
    const config = toml.parse(configContent)

    const nodeKey = (config.sequencer as any)?.L2GETH_NODEKEY
    if (!nodeKey) {
      this.log(chalk.yellow('L2GETH_NODEKEY not found in [sequencer] section. Skipping sequencer enode update.'))
      return
    }

    const updateEnode = await confirm({
      message: 'Would you like to update the L2_GETH_STATIC_PEERS in config.toml using the L2GETH_NODEKEY?'
    })

    if (updateEnode) {
      const enodeId = this.nodeKeyToEnodeId(nodeKey)
      const host = await input({
        message: 'Enter the host for the enode:',
        default: 'l2-sequencer-1'
      })
      const port = await input({
        message: 'Enter the port for the enode:',
        default: '30303'
      })

      const enode = `enode://${enodeId}@${host}:${port}`
      const enodeList = `["${enode}"]`

      if (!config.sequencer) {
        config.sequencer = {}
      }
      (config.sequencer as any).L2_GETH_STATIC_PEERS = enodeList

      fs.writeFileSync(configPath, toml.stringify(config as any))
      this.log(chalk.green(`L2_GETH_STATIC_PEERS updated in config.toml: ${enodeList}`))
    } else {
      this.log(chalk.yellow('L2_GETH_STATIC_PEERS not updated'))
    }
  }

  private async fetchDockerTags(): Promise<string[]> {
    try {
      const response = await fetch('https://registry.hub.docker.com/v2/repositories/scrolltech/scroll-stack-contracts/tags?page_size=100');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.results
        .map((tag: any) => tag.name)
        .filter((tag: string) => tag.startsWith('gen-configs'));
    } catch (error) {
      this.error(`Failed to fetch Docker tags: ${error}`);
    }
  }

  private async getDockerImageTag(providedTag: string | undefined): Promise<string> {
    const defaultTag = 'gen-configs-v0.0.24';

    if (!providedTag) {
      return defaultTag;
    }

    const tags = await this.fetchDockerTags();

    if (providedTag.startsWith('gen-configs-v') && tags.includes(providedTag)) {
      return providedTag;
    } else if (providedTag.startsWith('v') && tags.includes(`gen-configs-${providedTag}`)) {
      return `gen-configs-${providedTag}`;
    } else if (/^\d+\.\d+\.\d+$/.test(providedTag) && tags.includes(`gen-configs-v${providedTag}`)) {
      return `gen-configs-v${providedTag}`;
    }

    const selectedTag = await select({
      message: 'Select a Docker image tag:',
      choices: tags.map(tag => ({ name: tag, value: tag })),
    });

    return selectedTag;
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(SetupConfigs)

    const imageTag = await this.getDockerImageTag(flags['image-tag']);
    this.log(chalk.blue(`Using Docker image tag: ${imageTag}`));

    this.log(chalk.blue('Checking L1_CONTRACT_DEPLOYMENT_BLOCK...'))
    await this.updateL1ContractDeploymentBlock()

    this.log(chalk.blue('Checking deployment salt...'))
    await this.updateDeploymentSalt()

    this.log(chalk.blue('Checking sequencer enode...'))
    await this.updateSequencerEnode()

    this.log(chalk.blue('Running docker command to generate configs...'))
    await this.runDockerCommand(imageTag)

    this.log(chalk.blue('Creating secrets folder...'))
    this.createSecretsFolder()

    this.log(chalk.blue('Copying contract configs...'))
    this.copyContractsConfigs()

    this.log(chalk.blue('Creating secrets environment files...'))
    await this.createEnvFiles()

    this.log(chalk.green('Configuration setup completed.'))
  }
}
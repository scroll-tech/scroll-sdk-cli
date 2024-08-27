import { Command } from '@oclif/core'
import Docker from 'dockerode';
import * as fs from 'fs'
import * as path from 'path'
import * as toml from '@iarna/toml'
import chalk from 'chalk'

export default class SetupConfigs extends Command {
  static override description = 'Generate configuration files and create environment files for services'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  private async runDockerCommand(): Promise<void> {
    const docker = new Docker();
    const image = 'scrolltech/scroll-stack-contracts:gen-configs-v0.0.16';

    try {
      // Pull the image if it doesn't exist locally
      await docker.pull(image);

      // Create and run the container
      const container = await docker.createContainer({
        Image: image,
        Cmd: [], // Add any command if needed
        HostConfig: {
          Binds: [`${process.cwd()}:/contracts/volume`],
        },
      });

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
      'bridge-history-fetcher', 'blockscout', 'chain-monitor', 'coordinator',
      'event-watcher', 'gas-oracle', 'l1-explorer', 'l2-sequencer', 'rollup-node'
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
      'bridge-history-fetcher': ['BRIDGE_HISTORY_DB_CONNECTION_STRING:DATABASE_URL'],
      'chain-monitor': ['CHAIN_MONITOR_DB_CONNECTION_STRING:DATABASE_URL'],
      'coordinator': ['COORDINATOR_DB_CONNECTION_STRING:DATABASE_URL'],
      'event-watcher': ['EVENT_WATCHER_DB_CONNECTION_STRING:DATABASE_URL'], //TODO: remove
      'gas-oracle': ['GAS_ORACLE_DB_CONNECTION_STRING:DATABASE_URL', 'L1_GAS_ORACLE_SENDER_PRIVATE_KEY:SCROLL_ROLLUP_L1_CONFIG_GAS_ORACLE_SENDER_PRIVATE_KEY', 'L2_GAS_ORACLE_SENDER_PRIVATE_KEY:SCROLL_ROLLUP_L2_CONFIG_GAS_ORACLE_SENDER_PRIVATE_KEY'],
      'l1-explorer': ['L1_EXPLORER_DB_CONNECTION_STRING:DATABASE_URL'],
      'l2-sequencer': ['L2GETH_KEYSTORE:L2GETH_KEYSTORE', 'L2GETH_PASSWORD:L2GETH_PASSWORD', 'L2GETH_NODEKEY:L2GETH_NODEKEY'],
      'rollup-node': ['ROLLUP_NODE_DB_CONNECTION_STRING:DATABASE_URL', 'L1_COMMIT_SENDER_PRIVATE_KEY:SCROLL_ROLLUP_L2_CONFIG_RELAYER_CONFIG_COMMIT_SENDER_PRIVATE_KEY', 'L1_FINALIZE_SENDER_PRIVATE_KEY:SCROLL_ROLLUP_L2_CONFIG_RELAYER_CONFIG_FINALIZE_SENDER_PRIVATE_KEY'],
    }

    let content = ''
    for (const pair of mapping[service] || []) {
      const [configKey, envKey] = pair.split(':')
      if (config.db && config.db[configKey]) {
        content += `${envKey}="${config.db[configKey]}"\n`
      } else if (config.accounts && config.accounts[configKey]) {
        content += `${envKey}="${config.accounts[configKey]}"\n`
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
      const content = JSON.stringify({
        driver_name: 'postgres',
        dsn: config.db[file.key],
      }, null, 2)
      fs.writeFileSync(filePath, content)
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

  public async run(): Promise<void> {
    this.log(chalk.blue('Running docker command to generate configs...'))
    await this.runDockerCommand()

    this.log(chalk.blue('Creating secrets folder...'))
    this.createSecretsFolder()

    this.log(chalk.blue('Copying contract configs...'))
    this.copyContractsConfigs()

    this.log(chalk.blue('Creating environment files...'))
    await this.createEnvFiles()

    this.log(chalk.green('Configuration setup completed.'))
  }
}
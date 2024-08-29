import { Command, Flags } from '@oclif/core'
import * as fs from 'fs'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as yaml from 'js-yaml'
import * as toml from '@iarna/toml'
import { confirm } from '@inquirer/prompts'
import chalk from 'chalk'

const execAsync = promisify(exec)

export default class SetupPrepCharts extends Command {
  static override description = 'Prepare Helm charts for Scroll SDK'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --github-username=your-username --github-token=your-token',
    '<%= config.bin %> <%= command.id %> --no-pull',
  ]

  static override flags = {
    'github-username': Flags.string({ description: 'GitHub username', required: false }),
    'github-token': Flags.string({ description: 'GitHub Personal Access Token', required: false }),
    'pull': Flags.boolean({
      description: 'Pull and untar charts',
      allowNo: true,
      default: true,
    }),
  }

  private charts = [
    'balance-checker', 'blockscout', 'blockscout-sc-verifier', 'bridge-history-api',
    'bridge-history-fetcher', 'chain-monitor', 'contracts', 'coordinator-api',
    'coordinator-cron', 'external-secrets-lib', 'frontends', 'gas-oracle', 'l2-bootnode', 'l2-rpc', 'l2-sequencer',
    'rollup-explorer-backend', 'rollup-node', 'scroll-common', 'scroll-sdk'
  ]

  private chartToConfigMapping: Record<string, string> = {
    'rollup-explorer-backend': 'frontend.ROLLUPSCAN_API_URI',
    'frontends': 'frontend.DOMAIN_ENDING',
    'coordinator-api': 'frontend.DOMAIN_ENDING',
    'bridge-history-api': 'frontend.BRIDGE_API_URI',
    'l2-explorer': 'frontend.EXTERNAL_EXPLORER_URI_L2',
    'l1-explorer': 'frontend.EXTERNAL_EXPLORER_URI_L1',
    'l2-rpc': 'frontend.EXTERNAL_RPC_URI_L2',
    'blockscout': 'frontend.EXTERNAL_EXPLORER_URI_L2'
    // Add more mappings as needed, using 'frontend.DOMAIN_ENDING' for charts that should use it
  }

  private configMapping: Record<string, string> = {
    'SCROLL_L1_RPC': 'general.L1_RPC_ENDPOINT',
    'SCROLL_L2_RPC': 'general.L2_RPC_ENDPOINT',
    'CHAIN_ID': 'general.CHAIN_ID_L2',
    'CHAIN_ID_L1': 'general.CHAIN_ID_L1',
    'CHAIN_ID_L2': 'general.CHAIN_ID_L2',
    'L2GETH_L1_ENDPOINT': 'general.L1_RPC_ENDPOINT',
    'L2GETH_L1_CONTRACT_DEPLOYMENT_BLOCK': 'general.L1_CONTRACT_DEPLOYMENT_BLOCK',
    'L2GETH_SIGNER_ADDRESS': 'accounts.L2GETH_SIGNER_ADDRESS',
    'L1_RPC_ENDPOINT': 'general.L1_RPC_ENDPOINT',
    'L2_RPC_ENDPOINT': 'general.L2_RPC_ENDPOINT',
    'L1_SCROLL_CHAIN_PROXY_ADDR': 'contracts.L1_SCROLL_CHAIN_PROXY_ADDR',
    'L2GETH_PEER_LIST': 'sequencer.L2_GETH_STATIC_PEERS'
    // Add more mappings as needed
  }

  private contractsConfig: any = {}

  private loadContractsConfig(): void {
    const contractsConfigPath = path.join(process.cwd(), 'config-contracts.toml')
    if (fs.existsSync(contractsConfigPath)) {
      const contractsConfigContent = fs.readFileSync(contractsConfigPath, 'utf-8')
      this.contractsConfig = toml.parse(contractsConfigContent)
    } else {
      this.warn('config-contracts.toml not found. Some values may not be populated correctly.')
    }
  }

  private getConfigValue(key: string, config: any): any {
    const [section, subKey] = key.split('.')
    if (section === 'contracts' && this.contractsConfig[subKey]) {
      return this.contractsConfig[subKey]
    }
    return this.getNestedValue(config, key)
  }

  private async authenticateGHCR(username: string, token: string): Promise<void> {
    const command = `echo ${token} | docker login ghcr.io -u ${username} --password-stdin`
    await execAsync(command)
    this.log('Authenticated with GitHub Container Registry')
  }

  private async pullChart(chart: string): Promise<boolean> {
    try {
      const command = `helm pull oci://ghcr.io/scroll-tech/scroll-sdk/helm/${chart}`
      await execAsync(command)
      this.log(`Pulled chart: ${chart}`)
      return true
    } catch (error) {
      this.log(`Failed to pull chart: ${chart}`)
      return false
    }
  }

  private async untarCharts(): Promise<void> {
    const command = 'for file in *.tgz; do tar -xzvf "$file"; done'
    await execAsync(command)
    this.log('Untarred all charts')
  }

  private copyFileIfExists(fileName: string, targetDir: string): void {
    const sourcePath = path.join(process.cwd(), fileName)
    const targetPath = path.join(process.cwd(), targetDir, 'configs', fileName)

    if (fs.existsSync(sourcePath)) {
      // Create the entire target directory path if it doesn't exist
      const targetDirPath = path.dirname(targetPath)
      fs.mkdirSync(targetDirPath, { recursive: true })

      fs.copyFileSync(sourcePath, targetPath)
      this.log(`Copied ${fileName} to ${targetDir}/configs/`)
    } else {
      this.log(`File ${fileName} does not exist in the current directory, skipping.`)
    }
  }

  private moveConfigFiles(): void {
    const configFiles = [
      { file: 'balance-checker-config.json', dir: 'balance-checker' },
      { file: 'bridge-history-config.json', dir: 'bridge-history-api' },
      { file: 'bridge-history-config.json', dir: 'bridge-history-fetcher' },
      { file: 'chain-monitor-config.json', dir: 'chain-monitor' },
      { file: 'coordinator-config.json', dir: 'coordinator-api' },
      { file: 'coordinator-config.json', dir: 'coordinator-cron' },
      { file: 'frontend-config', dir: 'frontends' },
      { file: 'genesis.json', dir: 'scroll-common' },
      { file: 'rollup-config.json', dir: 'gas-oracle' },
      { file: 'rollup-config.json', dir: 'rollup-node' },
      { file: 'rollup-explorer-backend-config.json', dir: 'rollup-explorer-backend' }
    ]

    for (const { file, dir } of configFiles) {
      this.copyFileIfExists(file, dir)
    }

    this.log('Config file copy operation completed.')
  }

  private async processProductionYaml(chartDir: string, config: any): Promise<boolean> {
    const productionYamlPath = path.join(process.cwd(), chartDir, 'values', 'production.yaml')
    if (!fs.existsSync(productionYamlPath)) {
      this.log(chalk.yellow(`production.yaml not found for ${chartDir}`))
      return false
    }

    const productionYamlContent = fs.readFileSync(productionYamlPath, 'utf8')
    const productionYaml = yaml.load(productionYamlContent) as any

    let updated = false
    const changes: Array<{ key: string; oldValue: string; newValue: string }> = []
    const emptyUnmappedKeys: string[] = []

    // Process configMaps
    let envData: any
    if (chartDir === 'contracts') {
      envData = productionYaml.configMaps?.['contracts-deployment-env']?.data
    } else {
      envData = productionYaml.configMaps?.env?.data
    }

    if (envData) {
      for (const [key, value] of Object.entries(envData)) {
        if (value === '') {
          const configKey = this.configMapping[key]
          if (configKey) {
            const configValue = this.getConfigValue(configKey, config)
            if (configValue !== undefined && configValue !== null) {
              // Convert all values to strings
              const stringValue = String(configValue)
              changes.push({ key, oldValue: value as string, newValue: stringValue })
              envData[key] = stringValue
              updated = true
            } else {
              this.log(chalk.yellow(`${chartDir}: No value found for ${configKey}`))
            }
          } else {
            emptyUnmappedKeys.push(key)
          }
        }
      }
    }

    // Process ingress
    if (productionYaml.ingress?.main?.hosts) {
      const configKey = this.chartToConfigMapping[chartDir]
      if (configKey) {
        const configValue = this.getConfigValue(configKey, config)
        const domainEnding = this.getConfigValue('frontend.DOMAIN_ENDING', config)

        for (const host of productionYaml.ingress.main.hosts) {
          let newHost: string
          if (configKey === 'frontend.DOMAIN_ENDING' && domainEnding) {
            // For charts that should use DOMAIN_ENDING
            const parts = host.host.split('.')
            newHost = `${parts[0]}.${domainEnding}`
          } else if (configValue) {
            try {
              const url = new URL(configValue)
              newHost = url.host
            } catch (error) {
              // If configValue is not a valid URL, use it as is
              newHost = configValue
            }
          } else {
            newHost = host.host
          }

          if (newHost !== host.host) {
            changes.push({ key: host.host, oldValue: host.host, newValue: newHost })
            host.host = newHost
            updated = true
          }
        }
      }
    }

    if (updated || emptyUnmappedKeys.length > 0) {
      this.log(`\nFor ${chalk.cyan(chartDir)}/values/production.yaml:`)

      if (changes.length > 0) {
        this.log(chalk.green('Changes:'))
        for (const change of changes) {
          this.log(`  ${chalk.yellow(change.key)}: "${change.oldValue}" -> "${change.newValue}"`)
        }
      }

      if (emptyUnmappedKeys.length > 0) {
        this.log(chalk.yellow('Empty strings without mapping:'))
        for (const key of emptyUnmappedKeys) {
          this.log(`  ${key}`)
        }
      }

      if (updated) {
        const shouldUpdate = await confirm({ message: 'Do you want to apply these changes?' })
        if (shouldUpdate) {
          // Use a custom YAML.dump function with specific options
          const yamlString = yaml.dump(productionYaml, {
            lineWidth: -1, // Disable line wrapping
            noRefs: true,
            quotingType: '"',
            forceQuotes: true,
          });

          fs.writeFileSync(productionYamlPath, yamlString)
          this.log(chalk.green(`Updated production.yaml for ${chartDir}`))
          return true
        } else {
          this.log(chalk.yellow(`Skipped updating production.yaml for ${chartDir}`))
        }
      }
    } else {
      this.log(chalk.yellow(`${chartDir}: No changes needed in production.yaml`))
    }

    return false
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((prev, curr) => prev && prev[curr], obj)
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(SetupPrepCharts)

    this.log('Starting chart preparation...')

    // Load contracts config before processing yaml files
    this.loadContractsConfig()

    if (flags.pull) {
      let authenticated = false
      if (flags['github-username'] && flags['github-token']) {
        try {
          await this.authenticateGHCR(flags['github-username'], flags['github-token'])
          authenticated = true
        } catch (error) {
          this.log('Failed to authenticate with GitHub Container Registry')
        }
      }

      let allChartsPulled = true
      for (const chart of this.charts) {
        const success = await this.pullChart(chart)
        if (!success) {
          allChartsPulled = false
          break
        }
      }

      if (!allChartsPulled) {
        this.log('Failed to pull all charts. This might be due to authentication issues.')
        this.log('To authenticate, run the command with the following flags:')
        this.log('--github-username=your-username --github-token=your-personal-access-token')
        this.log('You can create a Personal Access Token at: https://github.com/settings/tokens')
        this.log('Ensure the token has the necessary permissions to access the required repositories.')
        return
      }

      // Untar charts
      await this.untarCharts()
    } else {
      this.log('Skipping chart pull and untar steps')
    }

    // Move config files
    this.moveConfigFiles()

    // Process production.yaml files
    const configPath = path.join(process.cwd(), 'config.toml')
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf-8')
      const config = toml.parse(configContent)

      let updatedCharts = 0
      let skippedCharts = 0
      for (const chart of this.charts) {
        const updated = await this.processProductionYaml(chart, config)
        if (updated) {
          updatedCharts++
        } else {
          skippedCharts++
        }
      }

      this.log(chalk.green(`\nUpdated production.yaml files for ${updatedCharts} chart(s).`))
      this.log(chalk.yellow(`Skipped ${skippedCharts} chart(s).`))
    } else {
      this.warn('config.toml not found. Skipping production.yaml processing.')
    }

    this.log('Chart preparation completed.')
  }
}
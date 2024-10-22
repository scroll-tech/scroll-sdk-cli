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
  static override description = 'Validate Makefile and prepare Helm charts for Scroll SDK'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --github-username=your-username --github-token=your-token',
    '<%= config.bin %> <%= command.id %> --values-dir=./custom-values',
    '<%= config.bin %> <%= command.id %> --skip-auth-check',
  ]

  static override flags = {
    'github-username': Flags.string({ description: 'GitHub username', required: false }),
    'github-token': Flags.string({ description: 'GitHub Personal Access Token', required: false }),
    'values-dir': Flags.string({ description: 'Directory containing values files', default: './values' }),
    'skip-auth-check': Flags.boolean({ description: 'Skip authentication check for individual charts', default: false }),
  }

  private configMapping: Record<string, string | ((chartName: string, productionNumber: string) => string)> = {
    'SCROLL_L1_RPC': 'general.L1_RPC_ENDPOINT',
    'SCROLL_L2_RPC': 'general.L2_RPC_ENDPOINT',
    'CHAIN_ID': 'general.CHAIN_ID_L2',
    'CHAIN_ID_L1': 'general.CHAIN_ID_L1',
    'CHAIN_ID_L2': 'general.CHAIN_ID_L2',
    'L2GETH_L1_ENDPOINT': 'general.L1_RPC_ENDPOINT',
    'L2GETH_L1_CONTRACT_DEPLOYMENT_BLOCK': 'general.L1_CONTRACT_DEPLOYMENT_BLOCK',
    'L1_RPC_ENDPOINT': 'general.L1_RPC_ENDPOINT',
    'L2_RPC_ENDPOINT': 'general.L2_RPC_ENDPOINT',
    'L1_SCROLL_CHAIN_PROXY_ADDR': 'contractsFile.L1_SCROLL_CHAIN_PROXY_ADDR',
    'L2GETH_SIGNER_ADDRESS': (chartName, productionNumber) =>
      productionNumber === '0' ? 'sequencer.L2GETH_SIGNER_ADDRESS' : `sequencer.sequencer-${productionNumber}.L2GETH_SIGNER_ADDRESS`,
    'L2GETH_PEER_LIST': 'sequencer.L2_GETH_STATIC_PEERS',
    'L2GETH_KEYSTORE': (chartName, productionNumber) =>
      productionNumber === '0' ? 'sequencer.L2GETH_KEYSTORE' : `sequencer.sequencer-${productionNumber}.L2GETH_KEYSTORE`,
    'L2GETH_PASSWORD': (chartName, productionNumber) =>
      productionNumber === '0' ? 'sequencer.L2GETH_PASSWORD' : `sequencer.sequencer-${productionNumber}.L2GETH_PASSWORD`,
    'L2GETH_NODEKEY': (chartName, productionNumber) =>
      chartName.startsWith('l2-bootnode') ? `bootnode.bootnode-${productionNumber}.L2GETH_NODEKEY` :
        (productionNumber === '0' ? 'sequencer.L2GETH_NODEKEY' : `sequencer.sequencer-${productionNumber}.L2GETH_NODEKEY`),
    // Add ingress host mappings
    'FRONTEND_HOST': 'ingress.FRONTEND_HOST',
    'BRIDGE_HISTORY_API_HOST': 'ingress.BRIDGE_HISTORY_API_HOST',
    'ROLLUP_EXPLORER_API_HOST': 'ingress.ROLLUP_EXPLORER_API_HOST',
    'COORDINATOR_API_HOST': 'ingress.COORDINATOR_API_HOST',
    'RPC_GATEWAY_HOST': 'ingress.RPC_GATEWAY_HOST',
    'BLOCKSCOUT_HOST': 'ingress.BLOCKSCOUT_HOST',
    'ADMIN_SYSTEM_DASHBOARD_HOST': 'ingress.ADMIN_SYSTEM_DASHBOARD_HOST',
    'L1_DEVNET_HOST': 'ingress.L1_DEVNET_HOST',
    'L1_EXPLORER_HOST': 'ingress.L1_EXPLORER_HOST',
    'RPC_GATEWAY_WS_HOST': 'ingress.RPC_GATEWAY_WS_HOST',
    'GRAFANA_HOST': 'ingress.GRAFANA_HOST',
    // Add more mappings as needed
  }

  private configData: any = {}
  private contractsConfig: any = {}

  private loadConfigs(): void {
    const configPath = path.join(process.cwd(), 'config.toml')
    const contractsConfigPath = path.join(process.cwd(), 'config-contracts.toml')

    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf-8')
      this.configData = toml.parse(configContent)
    } else {
      this.warn('config.toml not found. Some values may not be populated correctly.')
    }

    if (fs.existsSync(contractsConfigPath)) {
      const contractsConfigContent = fs.readFileSync(contractsConfigPath, 'utf-8')
      this.contractsConfig = toml.parse(contractsConfigContent)
    } else {
      this.warn('config-contracts.toml not found. Some values may not be populated correctly.')
    }
  }

  private getConfigValue(key: string): any {
    const [configType, ...rest] = key.split('.')
    const configKey = rest.join('.')

    if (configType === 'contractsFile') {
      return this.getNestedValue(this.contractsConfig, configKey)
    } else {
      return this.getNestedValue(this.configData, key)
    }
  }

  private async authenticateGHCR(username: string, token: string): Promise<void> {
    const command = `echo ${token} | docker login ghcr.io -u ${username} --password-stdin`
    await execAsync(command)
    this.log('Authenticated with GitHub Container Registry')
  }

  private async validateOCIAccess(ociUrl: string): Promise<boolean> {
    try {
      await execAsync(`helm show chart ${ociUrl}`)
      return true
    } catch (error) {
      return false
    }
  }

  private async processProductionYaml(valuesDir: string): Promise<{ updated: number; skipped: number }> {
    const productionFiles = fs.readdirSync(valuesDir)
      .filter(file => file.endsWith('-production.yaml') || file.match(/-production-\d+\.yaml$/))

    let updatedCharts = 0
    let skippedCharts = 0

    for (const file of productionFiles) {
      const yamlPath = path.join(valuesDir, file)
      const chartName = file.replace(/-production(-\d+)?\.yaml$/, '')
      const productionNumber = file.match(/-production-(\d+)\.yaml$/)?.[1] || '0'

      this.log(`Processing ${file} for chart ${chartName}...`)

      const productionYamlContent = fs.readFileSync(yamlPath, 'utf8')
      let productionYaml = yaml.load(productionYamlContent) as any

      let updated = false
      const changes: Array<{ key: string; oldValue: string; newValue: string }> = []

      // Process configMaps
      if (productionYaml.configMaps) {
        for (const [configMapName, configMapData] of Object.entries(productionYaml.configMaps)) {
          if (configMapData && typeof configMapData === 'object' && 'data' in configMapData) {
            const envData = (configMapData as any).data
            for (const [key, value] of Object.entries(envData)) {
              if (value === '' || value === '[""]' || value === '[]' ||
                (Array.isArray(value) && (value.length === 0 || (value.length === 1 && value[0] === ''))) ||
                value === null || value === undefined) {
                const configMapping = this.configMapping[key]
                if (configMapping) {
                  let configKey: string
                  if (typeof configMapping === 'function') {
                    configKey = configMapping(chartName, productionNumber)
                  } else {
                    configKey = configMapping
                  }
                  const configValue = this.getConfigValue(configKey)
                  if (configValue !== undefined && configValue !== null) {
                    let newValue: string | string[]
                    if (Array.isArray(configValue)) {
                      newValue = JSON.stringify(configValue)
                    } else {
                      newValue = String(configValue)
                    }
                    changes.push({ key, oldValue: JSON.stringify(value), newValue: newValue })
                    envData[key] = newValue
                    updated = true
                  } else {
                    this.log(chalk.yellow(`${chartName}: No value found for ${configKey}`))
                  }
                }
              }
            }
          }
        }
      }

      // Process ingress
      if (productionYaml.ingress) {
        let ingressUpdated = false;
        for (const [ingressKey, ingressValue] of Object.entries(productionYaml.ingress)) {
          if (ingressValue && typeof ingressValue === 'object' && 'hosts' in ingressValue) {
            const hosts = ingressValue.hosts as Array<{ host: string }>;
            if (Array.isArray(hosts)) {
              for (let i = 0; i < hosts.length; i++) {
                if (typeof hosts[i] === 'object' && 'host' in hosts[i]) {
                  let configValue: string | undefined;

                  if (chartName === 'l2-rpc' && ingressKey === 'websocket') {
                    configValue = this.getConfigValue('ingress.RPC_GATEWAY_WS_HOST');
                  } else {
                    // Check for direct mapping first
                    const directMappingKey = `ingress.${chartName.toUpperCase().replace(/-/g, '_')}_HOST`;
                    configValue = this.getConfigValue(directMappingKey);

                    // If direct mapping doesn't exist, try alternative mappings
                    if (!configValue) {
                      const alternativeMappings: Record<string, string> = {
                        'frontends': 'FRONTEND_HOST',
                        'bridge-history-api': 'BRIDGE_HISTORY_API_HOST',
                        'rollup-explorer-backend': 'ROLLUP_EXPLORER_API_HOST',
                        'coordinator-api': 'COORDINATOR_API_HOST',
                        'l2-rpc': 'RPC_GATEWAY_HOST',
                        'l1-devnet': 'L1_DEVNET_HOST',
                        'blockscout': 'BLOCKSCOUT_HOST',
                        'admin-system-dashboard': 'ADMIN_SYSTEM_DASHBOARD_HOST',
                        'grafana': 'GRAFANA_HOST',
                      };

                      const alternativeKey = alternativeMappings[chartName];
                      if (alternativeKey) {
                        configValue = this.getConfigValue(`ingress.${alternativeKey}`);
                      }
                    }
                  }

                  if (configValue && configValue !== hosts[i].host) {
                    changes.push({ key: `ingress.${ingressKey}.hosts[${i}].host`, oldValue: hosts[i].host, newValue: configValue });
                    hosts[i].host = configValue;
                    ingressUpdated = true;
                  }
                }
              }
            }
          }
        }

        if (ingressUpdated) {
          updated = true;
          // Update the tls section if it exists
          for (const [ingressKey, ingressValue] of Object.entries(productionYaml.ingress)) {
            if (ingressValue && typeof ingressValue === 'object' && 'tls' in ingressValue && 'hosts' in ingressValue) {
              const tlsEntries = ingressValue.tls as Array<{ hosts: string[] }>;
              const hosts = ingressValue.hosts as Array<{ host: string }>;
              if (Array.isArray(tlsEntries) && Array.isArray(hosts)) {
                tlsEntries.forEach((tlsEntry) => {
                  if (Array.isArray(tlsEntry.hosts)) {
                    tlsEntry.hosts = hosts.map((host) => host.host);
                  }
                });
              }
            }
          }
        }
      }

      if (updated) {
        this.log(`\nFor ${chalk.cyan(file)}:`)
        this.log(chalk.green('Changes:'))
        for (const change of changes) {
          this.log(`  ${chalk.yellow(change.key)}: ${change.oldValue} -> ${change.newValue}`)
        }

        const shouldUpdate = await confirm({ message: `Do you want to apply these changes to ${file}?` })
        if (shouldUpdate) {
          const yamlString = yaml.dump(productionYaml, {
            lineWidth: -1,
            noRefs: true,
            quotingType: '"',
            forceQuotes: true,
          })

          fs.writeFileSync(yamlPath, yamlString)
          this.log(chalk.green(`Updated ${file}`))
          updatedCharts++
        } else {
          this.log(chalk.yellow(`Skipped updating ${file}`))
          skippedCharts++
        }
      } else {
        this.log(chalk.yellow(`No changes needed in ${file}`))
        skippedCharts++
      }
    }

    return { updated: updatedCharts, skipped: skippedCharts }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((prev, curr) => prev && prev[curr], obj)
  }

  private async validateMakefile(skipAuthCheck: boolean): Promise<void> {
    const makefilePath = path.join(process.cwd(), 'Makefile')
    if (!fs.existsSync(makefilePath)) {
      this.error('Makefile not found in the current directory.')
    }

    const makefileContent = fs.readFileSync(makefilePath, 'utf-8')
    const installCommands = makefileContent.match(/helm\s+upgrade\s+-i.*?(?=\n\n|\Z)/gs)

    if (!installCommands) {
      this.warn('No Helm upgrade commands found in the Makefile.')
      return
    }

    for (const command of installCommands) {
      const chartNameMatch = command.match(/upgrade\s+-i\s+(\S+)/)
      const ociMatch = command.match(/oci:\/\/([^\s]+)/)

      if (chartNameMatch && ociMatch) {
        const chartName = chartNameMatch[1]
        const ociUrl = ociMatch[0]

        if (!skipAuthCheck) {
          const hasAccess = await this.validateOCIAccess(ociUrl)

          if (hasAccess) {
            this.log(chalk.green(`Access verified for chart: ${chartName}`))
          } else {
            this.log(chalk.red(`Unable to access chart: ${chartName}`))
            this.log('This might be due to authentication issues.')
            this.log('To authenticate, run the command with the following flags:')
            this.log('--github-username=your-username --github-token=your-personal-access-token')
            this.log('You can create a Personal Access Token at: https://github.com/settings/tokens')
            this.log('Ensure the token has the necessary permissions to access the required repositories.')
          }
        }

        const valuesFileMatches = command.match(/-f\s+([^\s]+)/g)
        if (valuesFileMatches) {
          for (const match of valuesFileMatches) {
            const valuesFile = match.split(' ')[1]
            if (fs.existsSync(valuesFile)) {
              this.log(chalk.green(`Values file verified: ${valuesFile}`))
            } else {
              this.log(chalk.red(`Values file not found: ${valuesFile}`))
            }
          }
        }
      }
    }
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(SetupPrepCharts)

    this.log('Starting chart preparation...')

    // Load configs before processing yaml files
    this.loadConfigs()

    if (flags['github-username'] && flags['github-token']) {
      try {
        await this.authenticateGHCR(flags['github-username'], flags['github-token'])
      } catch (error) {
        this.log('Failed to authenticate with GitHub Container Registry')
      }
    }

    let skipAuthCheck = flags['skip-auth-check']
    if (!skipAuthCheck) {
      skipAuthCheck = !(await confirm({ message: 'Do you want to perform authentication checks for individual charts?' }))
    }

    // Validate Makefile
    await this.validateMakefile(skipAuthCheck)

    // Process production.yaml files
    const valuesDir = flags['values-dir']
    const { updated, skipped } = await this.processProductionYaml(valuesDir)

    this.log(chalk.green(`\nUpdated production YAML files for ${updated} chart(s).`))
    this.log(chalk.yellow(`Skipped ${skipped} chart(s).`))

    this.log('Chart preparation completed.')
  }
}
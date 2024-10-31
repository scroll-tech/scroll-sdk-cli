/* eslint-disable complexity */
import * as toml from '@iarna/toml'
import {confirm, input, select} from '@inquirer/prompts'
import {Args, Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import * as fs from 'node:fs'
import * as path from 'node:path'

export default class SetupDomains extends Command {
  static override args = {
    file: Args.string({description: 'file to read'}),
  }

  static override description = 'Set up domain configurations for external services'

  static override examples = ['<%= config.bin %> <%= command.id %>']

  static override flags = {
    force: Flags.boolean({char: 'f'}),
    name: Flags.string({char: 'n', description: 'name to print'}),
  }

  public async run(): Promise<void> {
    const existingConfig = await this.getExistingConfig()

    this.logSection('Current domain configurations:')
    for (const [key, value] of Object.entries(existingConfig.frontend || {})) {
      if (key.includes('URI')) {
        this.logKeyValue(key, value as string)
      }
    }

    this.logSection('Current ingress configurations:')
    for (const [key, value] of Object.entries(existingConfig.ingress || {})) {
      this.logKeyValue(key, value as string)
    }

    type L1Network = 'anvil' | 'holesky' | 'mainnet' | 'other' | 'sepolia'

    const l1Network = (await select({
      choices: [
        {name: 'Ethereum Mainnet', value: 'mainnet'},
        {name: 'Ethereum Sepolia Testnet', value: 'sepolia'},
        {name: 'Ethereum Holesky Testnet', value: 'holesky'},
        {name: 'Other...', value: 'other'},
        {name: 'Anvil (Local)', value: 'anvil'},
      ],
      default: existingConfig.general?.CHAIN_NAME_L1?.toLowerCase() || 'mainnet',
      message: 'Select the L1 network:',
    })) as L1Network

    const l1ExplorerUrls: Partial<Record<L1Network, string>> = {
      holesky: 'https://holesky.etherscan.io',
      mainnet: 'https://etherscan.io',
      sepolia: 'https://sepolia.etherscan.io',
    }

    const l1RpcUrls: Partial<Record<L1Network, string>> = {
      holesky: 'https://rpc.ankr.com/eth_holesky',
      mainnet: 'https://rpc.ankr.com/eth',
      sepolia: 'https://rpc.ankr.com/eth_sepolia',
    }

    const l1ChainIds: Partial<Record<L1Network, string>> = {
      anvil: '111111',
      holesky: '17000',
      mainnet: '1',
      sepolia: '11155111',
    }

    const generalConfig: Record<string, string> = {}
    let domainConfig: Record<string, string> = {}
    const usesAnvil = l1Network === 'anvil'

    if (l1Network === 'other' || l1Network === 'anvil') {
      generalConfig.CHAIN_NAME_L1 = await input({
        default: l1Network === 'anvil' ? 'Anvil L1' : existingConfig.general?.CHAIN_NAME_L1 || 'Custom L1',
        message: 'Enter the L1 Chain Name:',
      })
      generalConfig.CHAIN_ID_L1 = await input({
        default: l1Network === 'anvil' ? '111111' : existingConfig.general?.CHAIN_ID_L1 || '',
        message: 'Enter the L1 Chain ID:',
      })
      if (l1Network !== 'anvil') {
        domainConfig.EXTERNAL_EXPLORER_URI_L1 = await input({
          default: existingConfig.frontend?.EXTERNAL_EXPLORER_URI_L1 || '',
          message: 'Enter the L1 Explorer URL:',
        })
        domainConfig.EXTERNAL_RPC_URI_L1 = await input({
          default: existingConfig.frontend?.EXTERNAL_RPC_URI_L1 || '',
          message: 'Enter the L1 Public RPC URL:',
        })
      }
    } else {
      generalConfig.CHAIN_NAME_L1 = l1Network.charAt(0).toUpperCase() + l1Network.slice(1)
      generalConfig.CHAIN_ID_L1 = l1ChainIds[l1Network]!
      domainConfig.EXTERNAL_EXPLORER_URI_L1 = l1ExplorerUrls[l1Network]!
      domainConfig.EXTERNAL_RPC_URI_L1 = l1RpcUrls[l1Network]!
    }

    this.logInfo(`Using ${chalk.bold(generalConfig.CHAIN_NAME_L1)} network:`)
    if (l1Network !== 'anvil') {
      this.logKeyValue('L1 Explorer URL', domainConfig.EXTERNAL_EXPLORER_URI_L1)
      this.logKeyValue('L1 Public RPC URL', domainConfig.EXTERNAL_RPC_URI_L1)
    }

    this.logKeyValue('L1 Chain Name', generalConfig.CHAIN_NAME_L1)
    this.logKeyValue('L1 Chain ID', generalConfig.CHAIN_ID_L1)

    if (l1Network === 'anvil') {
      generalConfig.L1_RPC_ENDPOINT = 'http://l1-devnet:8545'
      generalConfig.L1_RPC_ENDPOINT_WEBSOCKET = 'ws://l1-devnet:8546'
    } else {
      const setL1RpcEndpoint = await confirm({
        message: 'Do you want to set custom (private) L1 RPC endpoints for the SDK backend?',
      })

      if (setL1RpcEndpoint) {
        generalConfig.L1_RPC_ENDPOINT = await input({
          default: existingConfig.general?.L1_RPC_ENDPOINT || domainConfig.EXTERNAL_RPC_URI_L1,
          message: 'Enter the L1 RPC HTTP endpoint for SDK backend:',
        })

        generalConfig.L1_RPC_ENDPOINT_WEBSOCKET = await input({
          default:
            existingConfig.general?.L1_RPC_ENDPOINT_WEBSOCKET || domainConfig.EXTERNAL_RPC_URI_L1.replace('http', 'ws'),
          message: 'Enter the L1 RPC WebSocket endpoint for SDK backend:',
        })
      } else {
        generalConfig.L1_RPC_ENDPOINT = domainConfig.EXTERNAL_RPC_URI_L1
        generalConfig.L1_RPC_ENDPOINT_WEBSOCKET = domainConfig.EXTERNAL_RPC_URI_L1.replace('http', 'ws')
      }
    }

    this.logSuccess(`Updated [general] L1_RPC_ENDPOINT = "${generalConfig.L1_RPC_ENDPOINT}"`)
    this.logSuccess(`Updated [general] L1_RPC_ENDPOINT_WEBSOCKET = "${generalConfig.L1_RPC_ENDPOINT_WEBSOCKET}"`)

    const {domainConfig: sharedDomainConfig, ingressConfig} = await this.setupSharedConfigs(existingConfig, usesAnvil)

    // Merge the domainConfig from setupSharedConfigs with the one we've created here
    domainConfig = {...domainConfig, ...sharedDomainConfig}

    this.logSection('New domain configurations:')
    for (const [key, value] of Object.entries(domainConfig)) {
      this.logKeyValue(key, value)
    }

    this.logSection('New ingress configurations:')
    for (const [key, value] of Object.entries(ingressConfig)) {
      this.logKeyValue(key, value)
    }

    this.logSection('New general configurations:')
    for (const [key, value] of Object.entries(generalConfig)) {
      this.logKeyValue(key, value)
    }

    const confirmUpdate = await confirm({
      message: 'Do you want to update the config.toml file with these new configurations?',
    })
    if (confirmUpdate) {
      await this.updateConfigFile(domainConfig, ingressConfig, generalConfig)
    } else {
      this.logWarning('Configuration update cancelled.')
    }
  }

  private async getExistingConfig(): Promise<any> {
    const configPath = path.join(process.cwd(), 'config.toml')
    if (!fs.existsSync(configPath)) {
      this.error('config.toml not found in the current directory.')
      return {}
    }

    const configContent = fs.readFileSync(configPath, 'utf8')
    return toml.parse(configContent) as any
  }

  private logInfo(message: string) {
    this.log(chalk.blue(message))
  }

  private logKeyValue(key: string, value: string) {
    this.log(`${chalk.cyan(key)} = ${chalk.green(`"${value}"`)}`)
  }

  private logSection(title: string) {
    this.log(chalk.bold.underline(`\n${title}`))
  }

  private logSuccess(message: string) {
    this.log(chalk.green(message))
  }

  private logWarning(message: string) {
    this.log(chalk.yellow(message))
  }

  private mergeTomlContent(original: string, updated: string): string {
    const originalLines = original.split('\n')
    const updatedLines = updated.split('\n')
    const mergedLines: string[] = []

    let originalIndex = 0
    let updatedIndex = 0

    while (originalIndex < originalLines.length && updatedIndex < updatedLines.length) {
      const originalLine = originalLines[originalIndex]
      const updatedLine = updatedLines[updatedIndex]

      if (originalLine.trim().startsWith('#') || originalLine.trim() === '') {
        // Preserve comments and empty lines from the original file
        mergedLines.push(originalLine)
        originalIndex++
      } else if (originalLine === updatedLine) {
        // Lines are identical, keep either one
        mergedLines.push(originalLine)
        originalIndex++
        updatedIndex++
      } else {
        // Lines differ, use the updated line
        mergedLines.push(updatedLine)
        updatedIndex++
        // Skip original lines until we find a match or reach a new section
        while (
          originalIndex < originalLines.length &&
          !originalLines[originalIndex].includes('=') &&
          !originalLines[originalIndex].trim().startsWith('[')
        ) {
          originalIndex++
        }
      }
    }

    // Add any remaining lines from the updated content
    while (updatedIndex < updatedLines.length) {
      mergedLines.push(updatedLines[updatedIndex])
      updatedIndex++
    }

    return mergedLines.join('\n')
  }

  private async setupSharedConfigs(
    existingConfig: any,
    usesAnvil: boolean,
  ): Promise<{
    domainConfig: Record<string, string>
    generalConfig: Record<string, string>
    ingressConfig: Record<string, string>
    protocol: string
  }> {
    let domainConfig: Record<string, string> = {}
    let ingressConfig: Record<string, string> = {}
    const generalConfig: Record<string, string> = {}
    let sharedEnding = false
    let urlEnding = ''
    let protocol = ''

    sharedEnding = await confirm({
      default: Boolean(existingConfig.ingress?.FRONTEND_HOST),
      message: 'Do you want all external URLs to share a URL ending?',
    })

    if (sharedEnding) {
      const existingFrontendHost = existingConfig.ingress?.FRONTEND_HOST || ''
      const defaultUrlEnding =
        existingFrontendHost.startsWith('frontend.') || existingFrontendHost.startsWith('frontends.')
          ? existingFrontendHost.split('.').slice(1).join('.')
          : existingFrontendHost || 'scrollsdk'

      urlEnding = await input({
        default: defaultUrlEnding,
        message: 'Enter the shared URL ending:',
      })

      protocol = await select({
        choices: [
          {name: 'HTTP', value: 'http'},
          {name: 'HTTPS', value: 'https'},
        ],
        default: existingConfig.frontend?.EXTERNAL_RPC_URI_L1?.startsWith('https') ? 'https' : 'http',
        message: 'Choose the protocol for the shared URLs:',
      })

      const frontendAtRoot = await confirm({
        message: 'Do you want the frontends to be hosted at the root domain? (No will use a "frontends" subdomain)',
      })

      domainConfig = {
        ADMIN_SYSTEM_DASHBOARD_URI: `${protocol}://admin-system-dashboard.${urlEnding}`,
        BRIDGE_API_URI: `${protocol}://bridge-history-api.${urlEnding}/api`,
        EXTERNAL_EXPLORER_URI_L2: `${protocol}://blockscout.${urlEnding}`,
        EXTERNAL_RPC_URI_L2: `${protocol}://l2-rpc.${urlEnding}`,
        GRAFANA_URI: `${protocol}://grafana.${urlEnding}`,
        ROLLUPSCAN_API_URI: `${protocol}://rollup-explorer-backend.${urlEnding}/api`,
      }

      if (usesAnvil) {
        domainConfig.EXTERNAL_RPC_URI_L1 = `${protocol}://l1-devnet.${urlEnding}`
        domainConfig.EXTERNAL_EXPLORER_URI_L1 = `${protocol}://l1-explorer.${urlEnding}`
      }

      ingressConfig = {
        ADMIN_SYSTEM_DASHBOARD_HOST: `admin-system-dashboard.${urlEnding}`,
        BLOCKSCOUT_BACKEND_HOST: `blockscout-backend.${urlEnding}`,
        BLOCKSCOUT_HOST: `blockscout.${urlEnding}`,
        BRIDGE_HISTORY_API_HOST: `bridge-history-api.${urlEnding}`,
        COORDINATOR_API_HOST: `coordinator-api.${urlEnding}`,
        FRONTEND_HOST: frontendAtRoot ? urlEnding : `frontends.${urlEnding}`,
        GRAFANA_HOST: `grafana.${urlEnding}`,
        ROLLUP_EXPLORER_API_HOST: `rollup-explorer-backend.${urlEnding}`,
        RPC_GATEWAY_HOST: `l2-rpc.${urlEnding}`,
        ...(usesAnvil ? {L1_DEVNET_HOST: `l1-devnet.${urlEnding}`, L1_EXPLORER_HOST: `l1-explorer.${urlEnding}`} : {}),
      }
    } else {
      protocol = await select({
        choices: [
          {name: 'HTTP', value: 'http'},
          {name: 'HTTPS', value: 'https'},
        ],
        default: existingConfig.frontend?.EXTERNAL_RPC_URI_L1?.startsWith('https') ? 'https' : 'http',
        message: 'Choose the protocol for the URLs:',
      })

      ingressConfig = {
        ADMIN_SYSTEM_DASHBOARD_HOST: await input({
          default: existingConfig.ingress?.ADMIN_SYSTEM_DASHBOARD_HOST || 'admin-system-dashboard.scrollsdk',
          message: 'Enter ADMIN_SYSTEM_DASHBOARD_HOST:',
        }),
        BLOCKSCOUT_BACKEND_HOST: await input({
          default: existingConfig.ingress?.BLOCKSCOUT_BACKEND_HOST || 'blockscout-backend.scrollsdk',
          message: 'Enter BLOCKSCOUT_BACKEND_HOST:',
        }),
        BLOCKSCOUT_HOST: await input({
          default: existingConfig.ingress?.BLOCKSCOUT_HOST || 'blockscout.scrollsdk',
          message: 'Enter BLOCKSCOUT_HOST:',
        }),
        BRIDGE_HISTORY_API_HOST: await input({
          default: existingConfig.ingress?.BRIDGE_HISTORY_API_HOST || 'bridge-history-api.scrollsdk',
          message: 'Enter BRIDGE_HISTORY_API_HOST:',
        }),
        COORDINATOR_API_HOST: await input({
          default: existingConfig.ingress?.COORDINATOR_API_HOST || 'coordinator-api.scrollsdk',
          message: 'Enter COORDINATOR_API_HOST:',
        }),
        FRONTEND_HOST: await input({
          default: existingConfig.ingress?.FRONTEND_HOST || 'frontends.scrollsdk',
          message: 'Enter FRONTEND_HOST:',
        }),
        GRAFANA_HOST: await input({
          default: existingConfig.ingress?.GRAFANA_HOST || 'grafana.scrollsdk',
          message: 'Enter GRAFANA_HOST:',
        }),
        ROLLUP_EXPLORER_API_HOST: await input({
          default: existingConfig.ingress?.ROLLUP_EXPLORER_API_HOST || 'rollup-explorer-backend.scrollsdk',
          message: 'Enter ROLLUP_EXPLORER_API_HOST:',
        }),
        RPC_GATEWAY_HOST: await input({
          default: existingConfig.ingress?.RPC_GATEWAY_HOST || 'l2-rpc.scrollsdk',
          message: 'Enter RPC_GATEWAY_HOST:',
        }),
      }

      if (usesAnvil) {
        ingressConfig.L1_DEVNET_HOST = await input({
          default: existingConfig.ingress?.L1_DEVNET_HOST || 'l1-devnet.scrollsdk',
          message: 'Enter L1_DEVNET_HOST:',
        })
        ingressConfig.L1_EXPLORER_HOST = await input({
          default: existingConfig.ingress?.L1_EXPLORER_HOST || 'l1-explorer.scrollsdk',
          message: 'Enter L1_EXPLORER_HOST:',
        })
      }

      domainConfig = {
        ADMIN_SYSTEM_DASHBOARD_URI: await input({
          default:
            existingConfig.frontend?.ADMIN_SYSTEM_DASHBOARD_URI ||
            `${protocol}://${ingressConfig.ADMIN_SYSTEM_DASHBOARD_HOST}`,
          message: 'Enter ADMIN_SYSTEM_DASHBOARD_URI:',
        }),
        BRIDGE_API_URI: await input({
          default:
            existingConfig.frontend?.BRIDGE_API_URI || `${protocol}://${ingressConfig.BRIDGE_HISTORY_API_HOST}/api`,
          message: 'Enter BRIDGE_API_URI:',
        }),
        EXTERNAL_EXPLORER_URI_L2: await input({
          default:
            existingConfig.frontend?.EXTERNAL_EXPLORER_URI_L2 || `${protocol}://${ingressConfig.BLOCKSCOUT_HOST}`,
          message: 'Enter EXTERNAL_EXPLORER_URI_L2:',
        }),
        EXTERNAL_RPC_URI_L2: await input({
          default: existingConfig.frontend?.EXTERNAL_RPC_URI_L2 || `${protocol}://${ingressConfig.RPC_GATEWAY_HOST}`,
          message: 'Enter EXTERNAL_RPC_URI_L2:',
        }),
        GRAFANA_URI: await input({
          default: existingConfig.frontend?.GRAFANA_URI || `${protocol}://${ingressConfig.GRAFANA_HOST}`,
          message: 'Enter GRAFANA_URI:',
        }),
        ROLLUPSCAN_API_URI: await input({
          default:
            existingConfig.frontend?.ROLLUPSCAN_API_URI ||
            `${protocol}://${ingressConfig.ROLLUP_EXPLORER_API_HOST}/api`,
          message: 'Enter ROLLUPSCAN_API_URI:',
        }),
      }

      if (usesAnvil) {
        domainConfig.EXTERNAL_RPC_URI_L1 = await input({
          default: existingConfig.frontend?.EXTERNAL_RPC_URI_L1 || `${protocol}://l1-devnet.scrollsdk`,
          message: 'Enter EXTERNAL_RPC_URI_L1:',
        })
        domainConfig.EXTERNAL_EXPLORER_URI_L1 = await input({
          default: existingConfig.frontend?.EXTERNAL_EXPLORER_URI_L1 || `${protocol}://l1-explorer.scrollsdk`,
          message: 'Enter EXTERNAL_EXPLORER_URI_L1:',
        })
      }
    }

    return {domainConfig, generalConfig, ingressConfig, protocol}
  }

  private async updateConfigFile(
    domainConfig: Record<string, string>,
    ingressConfig: Record<string, string>,
    generalConfig: Record<string, string>,
  ): Promise<void> {
    const configPath = path.join(process.cwd(), 'config.toml')
    const existingConfig = await this.getExistingConfig()

    // Ensure sections exist
    if (!existingConfig.frontend) existingConfig.frontend = {}
    if (!existingConfig.ingress) existingConfig.ingress = {}
    if (!existingConfig.general) existingConfig.general = {}

    // Update only the specified keys
    for (const [key, value] of Object.entries(generalConfig)) {
      existingConfig.general[key] = value
    }

    for (const [key, value] of Object.entries(domainConfig)) {
      existingConfig.frontend[key] = value
    }

    for (const [key, value] of Object.entries(ingressConfig)) {
      existingConfig.ingress[key] = value
    }

    // Remove L1_DEVNET_HOST from ingress if not using Anvil
    if (generalConfig.CHAIN_NAME_L1 !== 'Anvil L1' && existingConfig.ingress.L1_DEVNET_HOST) {
      delete existingConfig.ingress.L1_DEVNET_HOST
    }

    // Remove L1_EXPLORER_HOST from ingress if not using Anvil
    if (generalConfig.CHAIN_NAME_L1 !== 'Anvil L1' && existingConfig.ingress.L1_EXPLORER_HOST) {
      delete existingConfig.ingress.L1_EXPLORER_HOST
    }

    // Convert the updated config back to TOML string
    const updatedContent = toml.stringify(existingConfig)

    // Merge the updated content with the original content to preserve comments
    const mergedContent = this.mergeTomlContent(fs.readFileSync(configPath, 'utf8'), updatedContent)

    fs.writeFileSync(configPath, mergedContent)
    this.logSuccess('config.toml has been updated with the new domain configurations.')
  }
}

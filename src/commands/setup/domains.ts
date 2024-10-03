import { Args, Command, Flags } from '@oclif/core'
import { input, confirm, select } from '@inquirer/prompts'
import * as fs from 'fs'
import * as path from 'path'
import * as toml from '@iarna/toml'
import chalk from 'chalk'

export default class SetupDomains extends Command {
  static override args = {
    file: Args.string({ description: 'file to read' }),
  }

  static override description = 'Set up domain configurations for external services'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static override flags = {
    force: Flags.boolean({ char: 'f' }),
    name: Flags.string({ char: 'n', description: 'name to print' }),
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

  private async updateConfigFile(domainConfig: Record<string, string>, ingressConfig: Record<string, string>, generalConfig: Record<string, string>): Promise<void> {
    const configPath = path.join(process.cwd(), 'config.toml')
    const existingConfig = await this.getExistingConfig()

    // Ensure sections exist
    if (!existingConfig.frontend) existingConfig.frontend = {}
    if (!existingConfig.ingress) existingConfig.ingress = {}
    if (!existingConfig.general) existingConfig.general = {}

    // Update only the specified keys
    Object.entries(generalConfig).forEach(([key, value]) => {
      existingConfig.general[key] = value
    })
    Object.entries(domainConfig).forEach(([key, value]) => {
      existingConfig.frontend[key] = value
    })
    Object.entries(ingressConfig).forEach(([key, value]) => {
      existingConfig.ingress[key] = value
    })

    // Remove L1_DEVNET_HOST from ingress if not using Anvil
    if (generalConfig.CHAIN_NAME_L1 !== 'Anvil L1' && existingConfig.ingress.L1_DEVNET_HOST) {
      delete existingConfig.ingress.L1_DEVNET_HOST
    }

    // Convert the updated config back to TOML string
    const updatedContent = toml.stringify(existingConfig)

    // Merge the updated content with the original content to preserve comments
    const mergedContent = this.mergeTomlContent(fs.readFileSync(configPath, 'utf-8'), updatedContent)

    fs.writeFileSync(configPath, mergedContent)
    this.logSuccess('config.toml has been updated with the new domain configurations.')
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
        while (originalIndex < originalLines.length &&
          !originalLines[originalIndex].includes('=') &&
          !originalLines[originalIndex].trim().startsWith('[')) {
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

  private logSection(title: string) {
    this.log(chalk.bold.underline(`\n${title}`))
  }

  private logKeyValue(key: string, value: string) {
    this.log(`${chalk.cyan(key)} = ${chalk.green(`"${value}"`)}`)
  }

  private logInfo(message: string) {
    this.log(chalk.blue(message))
  }

  private logSuccess(message: string) {
    this.log(chalk.green(message))
  }

  private logWarning(message: string) {
    this.log(chalk.yellow(message))
  }

  private async setupSharedConfigs(existingConfig: any, usesAnvil: boolean): Promise<{
    domainConfig: Record<string, string>;
    ingressConfig: Record<string, string>;
    generalConfig: Record<string, string>;
    protocol: string;
  }> {
    let domainConfig: Record<string, string> = {};
    let ingressConfig: Record<string, string> = {};
    let generalConfig: Record<string, string> = {};
    let sharedEnding = false;
    let urlEnding = '';
    let protocol = '';

    sharedEnding = await confirm({
      message: 'Do you want all external URLs to share a URL ending?',
      default: !!existingConfig.ingress?.FRONTEND_HOST
    });

    if (sharedEnding) {
      const existingFrontendHost = existingConfig.ingress?.FRONTEND_HOST || '';
      const defaultUrlEnding = existingFrontendHost.startsWith('frontend.') || existingFrontendHost.startsWith('frontends.')
        ? existingFrontendHost.split('.').slice(1).join('.')
        : existingFrontendHost || 'scrollsdk';

      urlEnding = await input({
        message: 'Enter the shared URL ending:',
        default: defaultUrlEnding,
      });

      protocol = await select({
        message: 'Choose the protocol for the shared URLs:',
        choices: [
          { name: 'HTTP', value: 'http' },
          { name: 'HTTPS', value: 'https' },
        ],
        default: existingConfig.frontend?.EXTERNAL_RPC_URI_L1?.startsWith('https') ? 'https' : 'http'
      });

      const frontendAtRoot = await confirm({
        message: 'Do you want the frontends to be hosted at the root domain? (No will use a "frontends" subdomain)',
      });

      domainConfig = {
        EXTERNAL_RPC_URI_L2: `${protocol}://l2-rpc.${urlEnding}`,
        BRIDGE_API_URI: `${protocol}://bridge-history-api.${urlEnding}/api`,
        ROLLUPSCAN_API_URI: `${protocol}://rollup-explorer-backend.${urlEnding}/api`,
        EXTERNAL_EXPLORER_URI_L2: `${protocol}://blockscout.${urlEnding}`,
        ADMIN_SYSTEM_DASHBOARD_URL: `${protocol}://admin-system-dashboard.${urlEnding}`,
      };

      if (usesAnvil) {
        domainConfig.EXTERNAL_RPC_URI_L1 = `${protocol}://l1-devnet.${urlEnding}`;
        domainConfig.EXTERNAL_EXPLORER_URI_L1 = `${protocol}://l1-explorer.${urlEnding}`;
      }

      ingressConfig = {
        FRONTEND_HOST: frontendAtRoot ? urlEnding : `frontends.${urlEnding}`,
        BRIDGE_HISTORY_API_HOST: `bridge-history-api.${urlEnding}`,
        ROLLUP_EXPLORER_API_HOST: `rollup-explorer-backend.${urlEnding}`,
        COORDINATOR_API_HOST: `coordinator-api.${urlEnding}`,
        RPC_GATEWAY_HOST: `l2-rpc.${urlEnding}`,
        BLOCKSCOUT_HOST: `blockscout.${urlEnding}`,
        ADMIN_SYSTEM_DASHBOARD_HOST: `admin-system-dashboard.${urlEnding}`,
        ...(usesAnvil ? { L1_DEVNET_HOST: `l1-devnet.${urlEnding}` } : {}),
      };
    } else {
      protocol = await select({
        message: 'Choose the protocol for the URLs:',
        choices: [
          { name: 'HTTP', value: 'http' },
          { name: 'HTTPS', value: 'https' },
        ],
        default: existingConfig.frontend?.EXTERNAL_RPC_URI_L1?.startsWith('https') ? 'https' : 'http'
      });

      ingressConfig = {
        FRONTEND_HOST: await input({
          message: 'Enter FRONTEND_HOST:',
          default: existingConfig.ingress?.FRONTEND_HOST || 'frontends.scrollsdk',
        }),
        BRIDGE_HISTORY_API_HOST: await input({
          message: 'Enter BRIDGE_HISTORY_API_HOST:',
          default: existingConfig.ingress?.BRIDGE_HISTORY_API_HOST || 'bridge-history-api.scrollsdk',
        }),
        ROLLUP_EXPLORER_API_HOST: await input({
          message: 'Enter ROLLUP_EXPLORER_API_HOST:',
          default: existingConfig.ingress?.ROLLUP_EXPLORER_API_HOST || 'rollup-explorer-backend.scrollsdk',
        }),
        COORDINATOR_API_HOST: await input({
          message: 'Enter COORDINATOR_API_HOST:',
          default: existingConfig.ingress?.COORDINATOR_API_HOST || 'coordinator-api.scrollsdk',
        }),
        RPC_GATEWAY_HOST: await input({
          message: 'Enter RPC_GATEWAY_HOST:',
          default: existingConfig.ingress?.RPC_GATEWAY_HOST || 'l2-rpc.scrollsdk',
        }),
        BLOCKSCOUT_HOST: await input({
          message: 'Enter BLOCKSCOUT_HOST:',
          default: existingConfig.ingress?.BLOCKSCOUT_HOST || 'blockscout.scrollsdk',
        }),
        ADMIN_SYSTEM_DASHBOARD_HOST: await input({
          message: 'Enter ADMIN_SYSTEM_DASHBOARD_HOST:',
          default: existingConfig.ingress?.ADMIN_SYSTEM_DASHBOARD_HOST || 'admin-system-dashboard.scrollsdk',
        }),
      };

      if (usesAnvil) {
        ingressConfig.L1_DEVNET_HOST = await input({
          message: 'Enter L1_DEVNET_HOST:',
          default: existingConfig.ingress?.L1_DEVNET_HOST || 'l1-devnet.scrollsdk',
        });
      }

      domainConfig = {
        EXTERNAL_RPC_URI_L2: await input({
          message: 'Enter EXTERNAL_RPC_URI_L2:',
          default: existingConfig.frontend?.EXTERNAL_RPC_URI_L2 || `${protocol}://${ingressConfig.RPC_GATEWAY_HOST}`,
        }),
        BRIDGE_API_URI: await input({
          message: 'Enter BRIDGE_API_URI:',
          default: existingConfig.frontend?.BRIDGE_API_URI || `${protocol}://${ingressConfig.BRIDGE_HISTORY_API_HOST}/api`,
        }),
        ROLLUPSCAN_API_URI: await input({
          message: 'Enter ROLLUPSCAN_API_URI:',
          default: existingConfig.frontend?.ROLLUPSCAN_API_URI || `${protocol}://${ingressConfig.ROLLUP_EXPLORER_API_HOST}/api`,
        }),
        EXTERNAL_EXPLORER_URI_L2: await input({
          message: 'Enter EXTERNAL_EXPLORER_URI_L2:',
          default: existingConfig.frontend?.EXTERNAL_EXPLORER_URI_L2 || `${protocol}://${ingressConfig.BLOCKSCOUT_HOST}`,
        }),
        ADMIN_SYSTEM_DASHBOARD_URL: await input({
          message: 'Enter ADMIN_SYSTEM_DASHBOARD_URL:',
          default: existingConfig.frontend?.ADMIN_SYSTEM_DASHBOARD_URL || `${protocol}://${ingressConfig.ADMIN_SYSTEM_DASHBOARD_HOST}`,
        }),
      };

      if (usesAnvil) {
        domainConfig.EXTERNAL_RPC_URI_L1 = await input({
          message: 'Enter EXTERNAL_RPC_URI_L1:',
          default: existingConfig.frontend?.EXTERNAL_RPC_URI_L1 || `${protocol}://l1-devnet.scrollsdk`,
        });
        domainConfig.EXTERNAL_EXPLORER_URI_L1 = await input({
          message: 'Enter EXTERNAL_EXPLORER_URI_L1:',
          default: existingConfig.frontend?.EXTERNAL_EXPLORER_URI_L1 || `${protocol}://l1-explorer.scrollsdk`,
        });
      }
    }

    return { domainConfig, ingressConfig, generalConfig, protocol };
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

    type L1Network = 'mainnet' | 'sepolia' | 'holesky' | 'other' | 'anvil';

    const l1Network = await select({
      message: 'Select the L1 network:',
      choices: [
        { name: 'Ethereum Mainnet', value: 'mainnet' },
        { name: 'Ethereum Sepolia Testnet', value: 'sepolia' },
        { name: 'Ethereum Holesky Testnet', value: 'holesky' },
        { name: 'Other...', value: 'other' },
        { name: 'Anvil (Local)', value: 'anvil' },
      ],
      default: existingConfig.general?.CHAIN_NAME_L1?.toLowerCase() || 'mainnet'
    }) as L1Network;

    const l1ExplorerUrls: Partial<Record<L1Network, string>> = {
      mainnet: 'https://etherscan.io',
      sepolia: 'https://sepolia.etherscan.io',
      holesky: 'https://holesky.etherscan.io',
    }

    const l1RpcUrls: Partial<Record<L1Network, string>> = {
      mainnet: 'https://rpc.ankr.com/eth',
      sepolia: 'https://rpc.ankr.com/eth_sepolia',
      holesky: 'https://rpc.ankr.com/eth_holesky',
    }

    const l1ChainIds: Partial<Record<L1Network, string>> = {
      mainnet: '1',
      sepolia: '11155111',
      holesky: '17000',
      anvil: '111111',
    }

    let generalConfig: Record<string, string> = {};
    let domainConfig: Record<string, string> = {};
    let usesAnvil = l1Network === 'anvil';

    if (l1Network === 'other' || l1Network === 'anvil') {
      generalConfig.CHAIN_NAME_L1 = await input({
        message: 'Enter the L1 Chain Name:',
        default: l1Network === 'anvil' ? 'Anvil L1' : (existingConfig.general?.CHAIN_NAME_L1 || 'Custom L1'),
      });
      generalConfig.CHAIN_ID_L1 = await input({
        message: 'Enter the L1 Chain ID:',
        default: l1Network === 'anvil' ? '111111' : (existingConfig.general?.CHAIN_ID_L1 || ''),
      });
      if (l1Network !== 'anvil') {
        domainConfig.EXTERNAL_EXPLORER_URI_L1 = await input({
          message: 'Enter the L1 Explorer URL:',
          default: existingConfig.frontend?.EXTERNAL_EXPLORER_URI_L1 || '',
        });
        domainConfig.EXTERNAL_RPC_URI_L1 = await input({
          message: 'Enter the L1 Public RPC URL:',
          default: existingConfig.frontend?.EXTERNAL_RPC_URI_L1 || '',
        });
      }
    } else {
      generalConfig.CHAIN_NAME_L1 = l1Network.charAt(0).toUpperCase() + l1Network.slice(1);
      generalConfig.CHAIN_ID_L1 = l1ChainIds[l1Network]!;
      domainConfig.EXTERNAL_EXPLORER_URI_L1 = l1ExplorerUrls[l1Network]!;
      domainConfig.EXTERNAL_RPC_URI_L1 = l1RpcUrls[l1Network]!;
    }

    this.logInfo(`Using ${chalk.bold(generalConfig.CHAIN_NAME_L1)} network:`)
    if (l1Network !== 'anvil') {
      this.logKeyValue('L1 Explorer URL', domainConfig.EXTERNAL_EXPLORER_URI_L1)
      this.logKeyValue('L1 Public RPC URL', domainConfig.EXTERNAL_RPC_URI_L1)
    }
    this.logKeyValue('L1 Chain Name', generalConfig.CHAIN_NAME_L1)
    this.logKeyValue('L1 Chain ID', generalConfig.CHAIN_ID_L1)

    if (l1Network !== 'anvil') {
      const setL1RpcEndpoint = await confirm({
        message: 'Do you want to set custom (private) L1 RPC endpoints for the SDK backend?',
      })

      if (setL1RpcEndpoint) {
        generalConfig.L1_RPC_ENDPOINT = await input({
          message: 'Enter the L1 RPC HTTP endpoint for SDK backend:',
          default: existingConfig.general?.L1_RPC_ENDPOINT || domainConfig.EXTERNAL_RPC_URI_L1,
        });

        generalConfig.L1_RPC_ENDPOINT_WEBSOCKET = await input({
          message: 'Enter the L1 RPC WebSocket endpoint for SDK backend:',
          default: existingConfig.general?.L1_RPC_ENDPOINT_WEBSOCKET || domainConfig.EXTERNAL_RPC_URI_L1.replace('http', 'ws'),
        });
      } else {
        generalConfig.L1_RPC_ENDPOINT = domainConfig.EXTERNAL_RPC_URI_L1;
        generalConfig.L1_RPC_ENDPOINT_WEBSOCKET = domainConfig.EXTERNAL_RPC_URI_L1.replace('http', 'ws');
      }
    } else {
      generalConfig.L1_RPC_ENDPOINT = 'http://l1-devnet:8545';
      generalConfig.L1_RPC_ENDPOINT_WEBSOCKET = 'ws://l1-devnet:8546';
    }

    this.logSuccess(`Updated [general] L1_RPC_ENDPOINT = "${generalConfig.L1_RPC_ENDPOINT}"`)
    this.logSuccess(`Updated [general] L1_RPC_ENDPOINT_WEBSOCKET = "${generalConfig.L1_RPC_ENDPOINT_WEBSOCKET}"`)

    const { domainConfig: sharedDomainConfig, ingressConfig, protocol } = await this.setupSharedConfigs(existingConfig, usesAnvil);

    // Merge the domainConfig from setupSharedConfigs with the one we've created here
    domainConfig = { ...domainConfig, ...sharedDomainConfig };

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

    const confirmUpdate = await confirm({ message: 'Do you want to update the config.toml file with these new configurations?' })
    if (confirmUpdate) {
      await this.updateConfigFile(domainConfig, ingressConfig, generalConfig)
    } else {
      this.logWarning('Configuration update cancelled.')
    }
  }
}
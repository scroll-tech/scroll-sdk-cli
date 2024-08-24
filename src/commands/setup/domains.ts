import { Args, Command, Flags } from '@oclif/core'
import { input, confirm, select } from '@inquirer/prompts'
import * as fs from 'fs'
import * as path from 'path'
import * as toml from '@iarna/toml'

export default class SetupDomains extends Command {
  static override args = {
    file: Args.string({ description: 'file to read' }),
  }

  static override description = 'Set up domain configurations for external services'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static override flags = {
    // flag with no value (-f, --force)
    force: Flags.boolean({ char: 'f' }),
    // flag with a value (-n, --name=VALUE)
    name: Flags.string({ char: 'n', description: 'name to print' }),
  }

  private async updateConfigFile(domainConfig: Record<string, string>): Promise<void> {
    const configPath = path.join(process.cwd(), 'config.toml')
    if (!fs.existsSync(configPath)) {
      this.error('config.toml not found in the current directory.')
      return
    }

    const configContent = fs.readFileSync(configPath, 'utf-8')
    const config = toml.parse(configContent)

    if (!config.frontend) {
      config.frontend = {}
    }

    for (const [key, value] of Object.entries(domainConfig)) {
      (config.frontend as Record<string, string>)[key] = value
    }

    fs.writeFileSync(configPath, toml.stringify(config as any))
    this.log('config.toml has been updated with the new domain configurations.')
  }

  public async run(): Promise<void> {
    const configPath = path.join(process.cwd(), 'config.toml')
    if (!fs.existsSync(configPath)) {
      this.error('config.toml not found in the current directory.')
      return
    }

    const configContent = fs.readFileSync(configPath, 'utf-8')
    const config = toml.parse(configContent)

    this.log('Current domain configurations:')
    for (const [key, value] of Object.entries(config.frontend || {})) {
      if (key.includes('URI')) {
        this.log(`${key} = "${value}"`)
      }
    }

    const usesPublicL1 = await confirm({ message: 'Are you using a public L1 network?' })

    let domainConfig: Record<string, string> = {}

    if (usesPublicL1) {
      type L1Network = 'mainnet' | 'sepolia' | 'holesky';

      const l1Network = await select({
        message: 'Select the L1 network:',
        choices: [
          { name: 'Ethereum Mainnet', value: 'mainnet' },
          { name: 'Ethereum Sepolia Testnet', value: 'sepolia' },
          { name: 'Ethereum Holesky Testnet', value: 'holesky' },
        ],
      }) as L1Network;

      const l1ExplorerUrls: Record<L1Network, string> = {
        mainnet: 'https://etherscan.io',
        sepolia: 'https://sepolia.etherscan.io',
        holesky: 'https://holesky.etherscan.io',
      }

      const l1RpcUrls: Record<L1Network, string> = {
        mainnet: 'https://rpc.ankr.com/eth',
        sepolia: 'https://rpc.ankr.com/eth_sepolia',
        holesky: 'https://rpc.ankr.com/eth_holesky',
      }

      domainConfig.EXTERNAL_EXPLORER_URI_L1 = l1ExplorerUrls[l1Network]
      domainConfig.EXTERNAL_RPC_URI_L1 = l1RpcUrls[l1Network]

      this.log(`Using ${l1Network} network:`)
      this.log(`L1 Explorer URL: ${domainConfig.EXTERNAL_EXPLORER_URI_L1}`)
      this.log(`L1 RPC URL: ${domainConfig.EXTERNAL_RPC_URI_L1}`)

      const sharedEnding = await confirm({ message: 'Do you want all L2 external URLs to share a URL ending?' })

      if (sharedEnding) {
        const urlEnding = await input({
          message: 'Enter the shared URL ending for L2:',
          default: 'scrollsdk',
        })

        const protocol = await select({
          message: 'Choose the protocol for the shared URLs:',
          choices: [
            { name: 'HTTP', value: 'http' },
            { name: 'HTTPS', value: 'https' },
          ],
        })

        domainConfig = {
          ...domainConfig,
          EXTERNAL_RPC_URI_L2: `${protocol}://l2-rpc.${urlEnding}`,
          BRIDGE_API_URI: `${protocol}://bridge-history-api.${urlEnding}/api`,
          ROLLUPSCAN_API_URI: `${protocol}://rollup-explorer-backend.${urlEnding}/api`,
          EXTERNAL_EXPLORER_URI_L2: `${protocol}://l2-explorer.${urlEnding}`,
        }
      } else {
        domainConfig = {
          ...domainConfig,
          EXTERNAL_RPC_URI_L2: await input({
            message: 'Enter EXTERNAL_RPC_URI_L2:',
            default: 'http://l2-rpc.scrollsdk',
          }),
          BRIDGE_API_URI: await input({
            message: 'Enter BRIDGE_API_URI:',
            default: 'http://bridge-history-api.scrollsdk/api',
          }),
          ROLLUPSCAN_API_URI: await input({
            message: 'Enter ROLLUPSCAN_API_URI:',
            default: 'http://rollup-explorer-backend.scrollsdk/api',
          }),
          EXTERNAL_EXPLORER_URI_L2: await input({
            message: 'Enter EXTERNAL_EXPLORER_URI_L2:',
            default: 'http://l2-explorer.scrollsdk',
          }),
        }
      }
    } else {
      const sharedEnding = await confirm({ message: 'Do you want all external URLs to share a URL ending?' })

      if (sharedEnding) {
        const urlEnding = await input({
          message: 'Enter the shared URL ending:',
          default: 'scrollsdk',
        })

        const protocol = await select({
          message: 'Choose the protocol for the shared URLs:',
          choices: [
            { name: 'HTTP', value: 'http' },
            { name: 'HTTPS', value: 'https' },
          ],
        })

        domainConfig = {
          EXTERNAL_RPC_URI_L1: `${protocol}://l1-devnet.${urlEnding}`,
          EXTERNAL_RPC_URI_L2: `${protocol}://l2-rpc.${urlEnding}`,
          BRIDGE_API_URI: `${protocol}://bridge-history-api.${urlEnding}/api`,
          ROLLUPSCAN_API_URI: `${protocol}://rollup-explorer-backend.${urlEnding}/api`,
          EXTERNAL_EXPLORER_URI_L1: `${protocol}://l1-explorer.${urlEnding}`,
          EXTERNAL_EXPLORER_URI_L2: `${protocol}://l2-explorer.${urlEnding}`,
        }
      } else {
        domainConfig = {
          EXTERNAL_RPC_URI_L1: await input({
            message: 'Enter EXTERNAL_RPC_URI_L1:',
            default: 'http://l1-devnet.scrollsdk',
          }),
          EXTERNAL_RPC_URI_L2: await input({
            message: 'Enter EXTERNAL_RPC_URI_L2:',
            default: 'http://l2-rpc.scrollsdk',
          }),
          BRIDGE_API_URI: await input({
            message: 'Enter BRIDGE_API_URI:',
            default: 'http://bridge-history-api.scrollsdk/api',
          }),
          ROLLUPSCAN_API_URI: await input({
            message: 'Enter ROLLUPSCAN_API_URI:',
            default: 'http://rollup-explorer-backend.scrollsdk/api',
          }),
          EXTERNAL_EXPLORER_URI_L1: await input({
            message: 'Enter EXTERNAL_EXPLORER_URI_L1:',
            default: 'http://l1-explorer.scrollsdk',
          }),
          EXTERNAL_EXPLORER_URI_L2: await input({
            message: 'Enter EXTERNAL_EXPLORER_URI_L2:',
            default: 'http://l2-explorer.scrollsdk',
          }),
        }
      }
    }

    this.log('\nNew domain configurations:')
    for (const [key, value] of Object.entries(domainConfig)) {
      this.log(`${key} = "${value}"`)
    }

    const confirmUpdate = await confirm({ message: 'Do you want to update the config.toml file with these new configurations?' })
    if (confirmUpdate) {
      await this.updateConfigFile(domainConfig)
    } else {
      this.log('Configuration update cancelled.')
    }
  }
}
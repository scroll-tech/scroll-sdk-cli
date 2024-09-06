import * as k8s from '@kubernetes/client-node'
import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import terminalLink from 'terminal-link'

import { parseTomlConfig } from '../../utils/config-parser.js'

export default class TestIngress extends Command {
  static override description = 'Check for required ingress hosts and validate frontend URLs'

  static override flags = {
    config: Flags.string({ char: 'c', description: 'Path to config.toml file' }),
    dev: Flags.boolean({ char: 'd', description: 'Include development ingresses' }),
    namespace: Flags.string({ char: 'n', default: 'default', description: 'Kubernetes namespace' }),
  }

  private configValues: Record<string, string> = {}

  private frontendToIngressMapping: Record<string, string> = {
    'EXTERNAL_RPC_URI_L2': 'RPC_GATEWAY_HOST',
    'BRIDGE_API_URI': 'BRIDGE_HISTORY_API_HOST',
    'ROLLUPSCAN_API_URI': 'ROLLUP_EXPLORER_API_HOST',
    'EXTERNAL_EXPLORER_URI_L2': 'BLOCKSCOUT_HOST',
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(TestIngress)

    if (flags.config) {
      this.loadConfig(flags.config)
    }

    const requiredNames = [
      'blockscout',
      'bridge-history-api',
      'frontends',
      'grafana',
      'l2-rpc',
      'rollup-explorer-backend',
    ]

    if (flags.dev) {
      requiredNames.push('l1-devnet', 'l1-explorer')
    }

    try {
      const actualIngresses = await this.getIngresses(flags.namespace)

      this.log(chalk.cyan(`List of SDK ingresses found in ${flags.namespace} namespace:`))
      for (const [name, host] of Object.entries(actualIngresses)) {
        this.log(`- ${chalk.green(name)}: ${terminalLink(host, `http://${host}`)}`)
      }

      const missingNames = requiredNames.filter((name) => !Object.hasOwn(actualIngresses, name))

      if (missingNames.length > 0) {
        this.log(chalk.yellow('\nMissing ingresses:'))
        for (const name of missingNames) this.log(chalk.red(`- ${name}`))
        this.log(chalk.red('Some required ingresses are missing!'))
      } else {
        this.log(chalk.green('\nAll required ingresses are present.'))
      }

      this.log(chalk.cyan('\nChecking connectivity to ingress hosts:'))
      for (const [name, host] of Object.entries(actualIngresses)) {
        // eslint-disable-next-line no-await-in-loop
        const isReachable = await this.checkHost(host, name)
        if (isReachable) {
          this.log(chalk.green(`- ${name} (${terminalLink(host, `http://${host}`)}) is reachable`))
        } else {
          this.log(
            chalk.red(
              `- ${name} (${terminalLink(host, `http://${host}`)}) is not reachable or did not return a 200 status`,
            ),
          )
        }
      }

      if (Object.keys(this.configValues).length > 0) {
        this.compareWithConfig(actualIngresses)
        this.validateFrontendIngress(actualIngresses)
      }
    } catch (error) {
      this.error(chalk.red('Failed to retrieve ingresses: ' + error))
    }
  }

  private async checkHost(host: string, name: string): Promise<boolean> {
    try {
      let response: Response

      if (name === 'bridge-history-api') {
        response = await fetch(`http://${host}/api/txs`)
      } else if (name === 'l1-devnet') {
        response = await fetch(`http://${host}`, {
          body: JSON.stringify({
            id: 1,
            jsonrpc: '2.0',
            method: 'web3_clientVersion',
            params: [],
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        })
      } else if (name === 'coordinator-api') {
        response = await fetch(`http://${host}/coordinator/v1/challenge/`, {
          method: 'GET',
        })
      } else {
        response = await fetch(`http://${host}`)
      }

      return response.status === 200
    } catch {
      return false
    }
  }

  private compareWithConfig(actualIngresses: Record<string, string>): void {
    this.log(chalk.cyan('\nComparing ingresses with config.toml values:'))

    const configMapping: Record<string, string> = {
      BRIDGE_API_URI: 'bridge-history-api',
      EXTERNAL_EXPLORER_URI_L1: 'l1-explorer',
      EXTERNAL_EXPLORER_URI_L2: 'blockscout',
      EXTERNAL_RPC_URI_L1: 'l1-devnet',
      EXTERNAL_RPC_URI_L2: 'l2-rpc',
      ROLLUPSCAN_API_URI: 'rollup-explorer-backend',
    }

    for (const [configKey, ingressName] of Object.entries(configMapping)) {
      const configValue = this.configValues[configKey]
      const ingressValue = actualIngresses[ingressName]

      if (configValue && ingressValue) {
        const configHost = new URL(configValue).host
        if (configHost === ingressValue) {
          this.log(chalk.green(`- ${configKey} matches ${ingressName}: ${configHost}`))
        } else {
          this.log(chalk.red(`- Mismatch for ${configKey}:`))
          this.log(chalk.red(`  Config value: ${configHost}`))
          this.log(chalk.red(`  Ingress value: ${ingressValue}`))
        }
      } else if (configValue) {
        this.log(chalk.yellow(`- ${configKey} is in config but no matching ingress found`))
      } else if (ingressValue) {
        this.log(chalk.yellow(`- ${ingressName} ingress exists but no matching config value found`))
      }
    }
  }

  private async getIngresses(namespace: string): Promise<Record<string, string>> {
    const kc = new k8s.KubeConfig()
    kc.loadFromDefault()
    const k8sApi = kc.makeApiClient(k8s.NetworkingV1Api)

    const response = await k8sApi.listNamespacedIngress(namespace)
    const ingresses: Record<string, string> = {}

    for (const ingress of response.body.items) {
      if (ingress.metadata?.name && ingress.spec?.rules && ingress.spec.rules.length > 0) {
        const rule = ingress.spec.rules[0]
        if (rule.host) {
          ingresses[ingress.metadata.name] = rule.host
        }
      }
    }

    return ingresses
  }

  private loadConfig(configPath: string): void {
    try {
      const parsedConfig = parseTomlConfig(configPath)

      if (parsedConfig.frontend) {
        this.configValues = parsedConfig.frontend as Record<string, string>
      }
    } catch (error) {
      this.error(chalk.red(`Failed to load config file: ${error}`))
    }
  }

  private validateFrontendIngress(actualIngresses: Record<string, string>): void {
    this.log(chalk.cyan('\nValidating frontend URLs against ingress hosts:'))

    let hasDiscrepancy = false

    for (const [frontendKey, ingressKey] of Object.entries(this.frontendToIngressMapping)) {
      const frontendValue = this.configValues[frontendKey]
      const ingressValue = actualIngresses[ingressKey.toLowerCase()]

      if (frontendValue && ingressValue) {
        try {
          const frontendHost = new URL(frontendValue).host
          if (frontendHost !== ingressValue) {
            this.log(chalk.red(`Discrepancy found for ${frontendKey}:`))
            this.log(chalk.red(`  Frontend value: ${frontendHost}`))
            this.log(chalk.red(`  Ingress value: ${ingressValue}`))
            hasDiscrepancy = true
          } else {
            this.log(chalk.green(`${frontendKey} matches ${ingressKey}: ${frontendHost}`))
          }
        } catch (error) {
          this.log(chalk.yellow(`Invalid URL for ${frontendKey}: ${frontendValue}`))
        }
      } else {
        this.log(chalk.yellow(`Missing value for ${frontendKey} or ${ingressKey}`))
      }
    }

    if (hasDiscrepancy) {
      this.log(chalk.yellow('\nWarning: Some frontend URLs do not match their corresponding ingress hosts.'))
      this.log(chalk.yellow('This might indicate a misconfiguration in the frontend section of config.toml.'))
    } else {
      this.log(chalk.green('\nAll frontend URLs match their corresponding ingress hosts.'))
    }
  }
}

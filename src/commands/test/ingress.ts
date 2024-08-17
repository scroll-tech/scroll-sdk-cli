import * as k8s from '@kubernetes/client-node'
import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import terminalLink from 'terminal-link'

export default class TestIngress extends Command {
  static override description = 'Check for required ingress hosts'

  static override flags = {
    dev: Flags.boolean({char: 'd', description: 'Include development ingresses'}),
    namespace: Flags.string({char: 'n', default: 'default', description: 'Kubernetes namespace'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(TestIngress)

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

      this.log(chalk.cyan(`Found ingresses in namespace '${flags.namespace}':`))
      for (const [name, host] of Object.entries(actualIngresses)) {
        this.log(`- ${chalk.green(name)}: ${terminalLink(host, `https://${host}`)}`)
      }

      const missingNames = requiredNames.filter((name) => !Object.prototype.hasOwnProperty.call(actualIngresses, name))

      if (missingNames.length > 0) {
        this.log(chalk.yellow('\nMissing ingresses:'))
        for (const name of missingNames) this.log(chalk.red(`- ${name}`))
        this.error(chalk.red('Some required ingresses are missing!'))
      } else {
        this.log(chalk.green('\nAll required ingresses are present.'))
      }

      this.log(chalk.cyan('\nChecking connectivity to ingress hosts:'))
      for (const [name, host] of Object.entries(actualIngresses)) {
        const isReachable = await this.checkHost(host)
        if (!isReachable) {
          this.log(
            chalk.red(
              `- ${name} (${terminalLink(host, `https://${host}`)}) is not reachable or did not return a 200 status`,
            ),
          )
        } else {
          this.log(chalk.green(`- ${name} (${terminalLink(host, `https://${host}`)}) is reachable`))
        }
      }

      this.log(chalk.cyan('\nList of ingresses (name: host):'))
      for (const [name, host] of Object.entries(actualIngresses)) {
        this.log(`- ${chalk.green(name)}: ${terminalLink(host, `https://${host}`)}`)
      }
    } catch (error) {
      this.error(chalk.red('Failed to retrieve ingresses: ' + error))
    }
  }

  private async checkHost(host: string): Promise<boolean> {
    try {
      const response = await fetch(`https://${host}`)
      return response.status === 200
    } catch {
      return false
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
}

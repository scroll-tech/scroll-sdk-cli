import {Command, Flags} from '@oclif/core'
import * as k8s from '@kubernetes/client-node'

export default class TestIngress extends Command {
  static override description = 'Check for required ingress hosts'

  static override flags = {
    dev: Flags.boolean({char: 'd', description: 'Include development ingresses'}),
    namespace: Flags.string({char: 'n', description: 'Kubernetes namespace', default: 'default'}),
  }

  private async getIngressHosts(namespace: string): Promise<string[]> {
    const kc = new k8s.KubeConfig()
    kc.loadFromDefault()
    const k8sApi = kc.makeApiClient(k8s.NetworkingV1Api)

    const response = await k8sApi.listNamespacedIngress(namespace)
    const hosts: string[] = []

    response.body.items.forEach(ingress => {
      ingress.spec?.rules?.forEach(rule => {
        if (rule.host) {
          hosts.push(rule.host)
        }
      })
    })

    return hosts
  }

  private async checkHost(host: string): Promise<boolean> {
    try {
      const response = await fetch(`http://${host}`)
      return response.status === 200
    } catch (error) {
      return false
    }
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(TestIngress)

    const requiredHosts = [
      'blockscout',
      'bridge-history-api',
      'frontends',
      'grafana',
      'l2-rpc',
      'rollup-explorer-backend',
    ]

    if (flags.dev) {
      requiredHosts.push('l1-devnet', 'l1-explorer')
    }

    try {
      const actualHosts = await this.getIngressHosts(flags.namespace)
      
      this.log(`Found ingress hosts in namespace '${flags.namespace}':`)
      actualHosts.forEach(host => this.log(`- ${host}`))

      const missingHosts = requiredHosts.filter(host => !actualHosts.includes(host))

      if (missingHosts.length > 0) {
        this.log('\nMissing ingress hosts:')
        missingHosts.forEach(host => this.log(`- ${host}`))
        this.error('Some required ingress hosts are missing!')
      } else {
        this.log('\nAll required ingress hosts are present.')
      }

      this.log('\nChecking connectivity to ingress hosts:')
      for (const host of actualHosts) {
        const isReachable = await this.checkHost(host)
        if (!isReachable) {
          this.log(`- ${host} is not reachable or did not return a 200 status`)
        }
      }
    } catch (error) {
      this.error('Failed to retrieve ingress hosts: ' + error)
    }
  }
}
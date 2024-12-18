import { Command, Flags } from '@oclif/core'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import chalk from 'chalk'
import { exec } from 'child_process'
import { promisify } from 'util'
import { confirm, input, select } from '@inquirer/prompts'

const execAsync = promisify(exec)

export default class SetupTls extends Command {
  static override description = 'Update TLS configuration in Helm charts'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --debug',
    '<%= config.bin %> <%= command.id %> --values-dir custom-values',
  ]

  static override flags = {
    debug: Flags.boolean({
      char: 'd',
      description: 'Show debug output and confirm before making changes',
      default: false,
    }),
    'values-dir': Flags.string({
      description: 'Directory containing the values files',
      default: 'values',
    }),
  }

  private selectedIssuer: string | null = null
  private debugMode: boolean = false
  private valuesDir: string = 'values'

  private async checkClusterIssuer(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('kubectl get clusterissuer -o jsonpath="{.items[*].metadata.name}"')
      const clusterIssuers = stdout.trim().split(' ').filter(Boolean)

      if (clusterIssuers.length > 0) {
        this.log(chalk.green('Found ClusterIssuer(s):'))
        clusterIssuers.forEach(issuer => this.log(chalk.cyan(`  - ${issuer}`)))

        if (clusterIssuers.length === 1) {
          const useExisting = await confirm({
            message: chalk.yellow(`Do you want to use the existing ClusterIssuer "${clusterIssuers[0]}"?`),
          })
          if (useExisting) {
            this.selectedIssuer = clusterIssuers[0]
            return true
          }
          return false
        } else {
          this.selectedIssuer = await select({
            message: chalk.yellow('Select which ClusterIssuer you want to use:'),
            choices: clusterIssuers.map(issuer => ({ name: issuer, value: issuer })),
          })
          return true
        }
      } else {
        this.log(chalk.yellow('No ClusterIssuer found in the cluster.'))
        return false
      }
    } catch (error) {
      this.log(chalk.red('Error checking for ClusterIssuer:'))
      this.log(chalk.red(error as string))
      return false
    }
  }

  private async createClusterIssuer(email: string): Promise<void> {
    const clusterIssuerYaml = `
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ${email}
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
`

    try {
      await fs.promises.writeFile('cluster-issuer.yaml', clusterIssuerYaml)
      await execAsync('kubectl apply -f cluster-issuer.yaml')
      await fs.promises.unlink('cluster-issuer.yaml')
      this.log(chalk.green('ClusterIssuer created successfully.'))
    } catch (error) {
      this.error(chalk.red(`Failed to create ClusterIssuer: ${error}`))
    }
  }

  private async loadConfig(): Promise<any> {
    // TODO: Implement loading of config.yaml
  }

  private async updateChartIngress(chart: string, issuer: string): Promise<void> {
    const yamlPath = path.join(process.cwd(), this.valuesDir, `${chart}-production.yaml`)

    if (!fs.existsSync(yamlPath)) {
      this.log(chalk.yellow(`${chart}-production.yaml not found in ${this.valuesDir} directory`))
      return
    }

    try {
      const content = fs.readFileSync(yamlPath, 'utf8')
      const yamlContent: any = yaml.load(content)

      const ingressTypes = ['main', 'websocket']
      let updated = false


      /*
      grafana:
        ingress:
          enabled: true
          annotations:
            kubernetes.io/ingress.class: "nginx"
            nginx.ingress.kubernetes.io/ssl-redirect: "true"
          tls:
            - secretName: admin-system-dashboard-tls
              hosts:
                - grafana.scsdk.unifra.xyz
          hosts:
            - grafana.scsdk.unifra.xyz
      */
      if (yamlContent.grafana && yamlContent.grafana.ingress) {
        const originalContent = yaml.dump(yamlContent.grafana.ingress, { lineWidth: -1, noRefs: true })
        let ingressUpdated = false;
        let ingress = yamlContent.grafana.ingress;
        if (!ingress.annotations) {
          ingress.annotations = {};
        }

        if (ingress.annotations['cert-manager.io/cluster-issuer'] !== issuer) {
          ingress.annotations['cert-manager.io/cluster-issuer'] = issuer
          ingressUpdated = true
        }


        // Update or add TLS configuration
        if (ingress.hosts && ingress.hosts.length > 0) {
          const firstHost = ingress.hosts[0];
          if (typeof firstHost === 'string') {
            const hostname = firstHost
            const secretName = `${chart}-grafana-tls`;
            //const secretName = ingressType === 'main' ? `${chart}-tls` : `${chart}-${ingressType}-tls`

            if (!ingress.tls) {
              ingress.tls = [{
                secretName: secretName,
                hosts: [hostname],
              }]
              ingressUpdated = true
            } else if (ingress.tls.length === 0) {
              ingress.tls.push({
                secretName: secretName,
                hosts: [hostname],
              })
              ingressUpdated = true
            } else {
              // Update existing TLS configuration
              ingress.tls.forEach((tlsConfig: any) => {
                if (!tlsConfig.secretName || tlsConfig.secretName !== secretName) {
                  tlsConfig.secretName = secretName
                  ingressUpdated = true
                }
                if (!tlsConfig.hosts || !tlsConfig.hosts.includes(hostname)) {
                  tlsConfig.hosts = [hostname]
                  ingressUpdated = true
                }
              })
            }
          }
        }

        if (ingressUpdated) {
          updated = true
          const updatedContent = yaml.dump(ingress, { lineWidth: -1, noRefs: true })

          if (this.debugMode) {
            this.log(chalk.yellow(`\nProposed changes for ${chart} :`))
            this.log(chalk.red('- Original content:'))
            this.log(originalContent)
            this.log(chalk.green('+ Updated content:'))
            this.log(updatedContent)

            const confirmUpdate = await confirm({
              message: chalk.cyan(`Do you want to apply these changes to ${chart}?`),
            })

            if (!confirmUpdate) {
              this.log(chalk.yellow(`Skipped updating ${chart}`));
            }
          }

          this.log(chalk.green(`Updated TLS configuration for ${chart} `))
        } else {
          this.log(chalk.green(`No changes needed for ${chart} ()`))
        }

      }

      for (const ingressType of ingressTypes) {
        if (yamlContent.ingress?.[ingressType]) {
          const originalContent = yaml.dump(yamlContent.ingress[ingressType], { lineWidth: -1, noRefs: true })
          let ingressUpdated = false

          // Add or update annotation
          if (!yamlContent.ingress[ingressType].annotations) {
            yamlContent.ingress[ingressType].annotations = {}
          }
          if (yamlContent.ingress[ingressType].annotations['cert-manager.io/cluster-issuer'] !== issuer) {
            yamlContent.ingress[ingressType].annotations['cert-manager.io/cluster-issuer'] = issuer
            ingressUpdated = true
          }

          // Update or add TLS configuration
          if (yamlContent.ingress[ingressType].hosts && yamlContent.ingress[ingressType].hosts.length > 0) {
            const firstHost = yamlContent.ingress[ingressType].hosts[0]
            if (typeof firstHost === 'object' && firstHost.host) {
              const hostname = firstHost.host
              const secretName = ingressType === 'main' ? `${chart}-tls` : `${chart}-${ingressType}-tls`

              if (!yamlContent.ingress[ingressType].tls) {
                yamlContent.ingress[ingressType].tls = [{
                  secretName: secretName,
                  hosts: [hostname],
                }]
                ingressUpdated = true
              } else if (yamlContent.ingress[ingressType].tls.length === 0) {
                yamlContent.ingress[ingressType].tls.push({
                  secretName: secretName,
                  hosts: [hostname],
                })
                ingressUpdated = true
              } else {
                // Update existing TLS configuration
                yamlContent.ingress[ingressType].tls.forEach((tlsConfig: any) => {
                  if (!tlsConfig.secretName || tlsConfig.secretName !== secretName) {
                    tlsConfig.secretName = secretName
                    ingressUpdated = true
                  }
                  if (!tlsConfig.hosts || !tlsConfig.hosts.includes(hostname)) {
                    tlsConfig.hosts = [hostname]
                    ingressUpdated = true
                  }
                })
              }
            }
          }

          if (ingressUpdated) {
            updated = true
            const updatedContent = yaml.dump(yamlContent.ingress[ingressType], { lineWidth: -1, noRefs: true })

            if (this.debugMode) {
              this.log(chalk.yellow(`\nProposed changes for ${chart} (${ingressType}):`))
              this.log(chalk.red('- Original content:'))
              this.log(originalContent)
              this.log(chalk.green('+ Updated content:'))
              this.log(updatedContent)

              const confirmUpdate = await confirm({
                message: chalk.cyan(`Do you want to apply these changes to ${chart} (${ingressType})?`),
              })

              if (!confirmUpdate) {
                this.log(chalk.yellow(`Skipped updating ${chart} (${ingressType})`))
                continue
              }
            }

            this.log(chalk.green(`Updated TLS configuration for ${chart} (${ingressType})`))
          } else {
            this.log(chalk.green(`No changes needed for ${chart} (${ingressType})`))
          }
        }
      }

      if (updated) {
        // Write updated YAML back to file
        const updatedYamlContent = yaml.dump(yamlContent, {
          lineWidth: -1,
          noRefs: true,
          quotingType: '"',
          forceQuotes: false
        })
        fs.writeFileSync(yamlPath, updatedYamlContent)
      }
    } catch (error) {
      this.error(chalk.red(`Failed to update ${chart}: ${error}`))
    }
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(SetupTls)
    this.debugMode = flags.debug
    this.valuesDir = flags['values-dir']

    try {
      this.log(chalk.blue('Starting TLS configuration update...'))

      let clusterIssuerExists = await this.checkClusterIssuer()

      while (!clusterIssuerExists) {
        const createIssuer = await confirm({
          message: chalk.yellow('No suitable ClusterIssuer found. Do you want to create one?'),
        })

        if (createIssuer) {
          const email = await input({
            message: chalk.cyan('Enter your email address for the ClusterIssuer:'),
            validate: (value) => {
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                return 'Please enter a valid email address.'
              }
              return true
            },
          })

          await this.createClusterIssuer(email)
          clusterIssuerExists = await this.checkClusterIssuer()
        } else {
          this.log(chalk.yellow('ClusterIssuer is required for TLS configuration. Exiting.'))
          return
        }
      }

      if (!this.selectedIssuer) {
        this.error(chalk.red('No ClusterIssuer selected. Exiting.'))
        return
      }

      this.log(chalk.green(`Using ClusterIssuer: ${this.selectedIssuer}`))

      const chartsToUpdate = [
        'admin-system-dashboard',
        'frontends',
        'blockscout',
        'coordinator-api',
        'bridge-history-api',
        'rollup-explorer-backend',
        'l2-rpc',
        'l1-devnet',
        'scroll-monitor'
      ]

      for (const chart of chartsToUpdate) {
        await this.updateChartIngress(chart, this.selectedIssuer)
      }

      this.log(chalk.green('TLS configuration update completed.'))
    } catch (error) {
      this.error(chalk.red(`Failed to update TLS configuration: ${error}`))
    }
  }
}
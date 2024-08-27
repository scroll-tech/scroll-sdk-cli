import { Command } from '@oclif/core'
import * as fs from 'fs'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { select, input, confirm } from '@inquirer/prompts'
import * as yaml from 'js-yaml'
import chalk from 'chalk'

const execAsync = promisify(exec)

interface SecretService {
  pushSecrets(): Promise<void>
}

class AWSSecretService implements SecretService {
  constructor(private region: string) { }

  private async convertToJson(filePath: string): Promise<string> {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    const lines = content.split('\n')
    const jsonContent: Record<string, string> = {}

    for (const line of lines) {
      if (line.trim() && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split(':')
        const value = valueParts.join(':').trim()
        jsonContent[key.trim()] = value.replace(/^"/, '').replace(/"$/, '')
      }
    }

    return JSON.stringify(jsonContent)
  }

  private async pushToAWSSecret(content: string, secretName: string): Promise<void> {
    const command = `aws secretsmanager create-secret --name "scroll/${secretName}" --secret-string '${content}' --region ${this.region}`
    try {
      await execAsync(command)
      console.log(chalk.green(`Successfully pushed secret: scroll/${secretName}`))
    } catch (error) {
      console.error(chalk.red(`Failed to push secret: scroll/${secretName}`))
    }
  }

  async pushSecrets(): Promise<void> {
    const secretsDir = path.join(process.cwd(), 'secrets')

    // Process JSON files
    const jsonFiles = fs.readdirSync(secretsDir).filter(file => file.endsWith('.json'))
    for (const file of jsonFiles) {
      const secretName = path.basename(file, '.json')
      console.log(chalk.cyan(`Processing JSON secret: ${secretName}`))
      const content = await fs.promises.readFile(path.join(secretsDir, file), 'utf-8')
      await this.pushToAWSSecret(content, secretName)
    }

    // Process ENV files
    const envFiles = fs.readdirSync(secretsDir).filter(file => file.endsWith('.env'))
    for (const file of envFiles) {
      const secretName = `${path.basename(file, '.env')}-env`
      console.log(chalk.cyan(`Processing ENV secret: ${secretName}`))
      const content = await this.convertToJson(path.join(secretsDir, file))
      await this.pushToAWSSecret(content, secretName)
    }
  }
}

class HashicorpVaultDevService implements SecretService {
  private async runCommand(command: string): Promise<string> {
    try {
      const { stdout } = await execAsync(command)
      return stdout.trim()
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`))
      throw error
    }
  }

  private async convertEnvToDict(filePath: string): Promise<Record<string, string>> {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    const result: Record<string, string> = {}

    const lines = content.split('\n')
    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim()

        // Remove surrounding quotes if present
        value = value.replace(/^["'](.*)["']$/, '$1')

        result[key] = value
      }
    }

    return result
  }

  private async isSecretEngineEnabled(path: string): Promise<boolean> {
    try {
      const output = await this.runCommand(`kubectl exec vault-0 -- vault secrets list -format=json`)
      const secretsList = JSON.parse(output)
      return path + '/' in secretsList
    } catch (error) {
      console.error(chalk.red(`Error checking if secret engine is enabled: ${error}`))
      return false
    }
  }

  private async pushToVault(secretName: string, data: Record<string, string>): Promise<void> {
    const kvPairs = Object.entries(data)
      .map(([key, value]) => `${key}='${value.replace(/'/g, "'\\''")}'`)
      .join(' ')

    const command = `kubectl exec vault-0 -- vault kv put scroll/${secretName} ${kvPairs}`

    // Debug output
    console.log(chalk.yellow('--- Debug Output ---'))
    console.log(chalk.cyan(`Secret Name: ${secretName}`))
    console.log(chalk.cyan(`Command: ${command}`))
    console.log(chalk.yellow('-------------------'))

    try {
      await this.runCommand(command)
      console.log(chalk.green(`Successfully pushed secret: scroll/${secretName}`))
    } catch (error) {
      console.error(chalk.red(`Failed to push secret: scroll/${secretName}`))
      console.error(chalk.red(`Error: ${error}`))
    }
  }

  private async pushJsonToVault(secretName: string, content: string): Promise<void> {
    try {
      const jsonContent = JSON.parse(content);
      const escapedJson = JSON.stringify(jsonContent).replace(/'/g, "'\\''");
      const command = `kubectl exec vault-0 -- vault kv put scroll/${secretName} migrate-db.json='${escapedJson}'`;

      // Debug output
      console.log(chalk.yellow('--- Debug Output ---'));
      console.log(chalk.cyan(`Secret Name: ${secretName}`));
      console.log(chalk.cyan(`Command: ${command}`));
      console.log(chalk.yellow('-------------------'));

      await this.runCommand(command);
      console.log(chalk.green(`Successfully pushed JSON secret: scroll/${secretName}`));
    } catch (error) {
      console.error(chalk.red(`Failed to push JSON secret: scroll/${secretName}`));
      console.error(chalk.red(`Error: ${error}`));
    }
  }

  async pushSecrets(): Promise<void> {
    // Check if the KV secrets engine is already enabled
    const isEnabled = await this.isSecretEngineEnabled('scroll')
    if (!isEnabled) {
      // Enable the KV secrets engine only if it's not already enabled
      try {
        await this.runCommand("kubectl exec vault-0 -- vault secrets enable -path=scroll kv-v2")
        console.log(chalk.green("KV secrets engine enabled at path 'scroll'"))
      } catch (error: unknown) {
        if (error instanceof Error) {
          // If the error is about the path already in use, we can ignore it
          if (!error.message.includes("path is already in use at scroll/")) {
            throw error
          }
          console.log(chalk.yellow("KV secrets engine already enabled at path 'scroll'"))
        } else {
          // If it's not an Error instance, rethrow it
          throw error
        }
      }
    } else {
      console.log(chalk.yellow("KV secrets engine already enabled at path 'scroll'"))
    }

    const secretsDir = path.join(process.cwd(), 'secrets')

    // Process JSON files
    const jsonFiles = fs.readdirSync(secretsDir).filter(file => file.endsWith('.json'))
    for (const file of jsonFiles) {
      const secretName = path.basename(file, '.json')
      console.log(chalk.cyan(`Processing JSON secret: scroll/${secretName}`))
      const content = await fs.promises.readFile(path.join(secretsDir, file), 'utf-8')
      await this.pushJsonToVault(secretName, content)
    }

    // Process ENV files
    const envFiles = fs.readdirSync(secretsDir).filter(file => file.endsWith('.env'))
    for (const file of envFiles) {
      const secretName = `${path.basename(file, '.env')}-env`
      console.log(chalk.cyan(`Processing ENV secret: scroll/${secretName}`))
      const data = await this.convertEnvToDict(path.join(secretsDir, file))
      await this.pushToVault(secretName, data)
    }

    console.log(chalk.green("All secrets have been processed and populated in Vault."))
  }
}

export default class SetupPushSecrets extends Command {
  static override description = 'Push secrets to the selected secret service'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  private async getVaultCredentials(): Promise<Record<string, string>> {
    return {
      server: await input({
        message: chalk.cyan('Enter Vault server URL:'),
        default: "http://vault.default.svc.cluster.local:8200"
      }),
      path: await input({
        message: chalk.cyan('Enter Vault path:'),
        default: "scroll"
      }),
      version: await input({
        message: chalk.cyan('Enter Vault version:'),
        default: "v2"
      }),
      tokenSecretName: await input({
        message: chalk.cyan('Enter Vault token secret name:'),
        default: "vault-token"
      }),
      tokenSecretKey: await input({
        message: chalk.cyan('Enter Vault token secret key:'),
        default: "token"
      })
    }
  }

  private async getAWSCredentials(): Promise<Record<string, string>> {
    return {
      serviceAccount: await input({
        message: chalk.cyan('Enter AWS service account:'),
      }),
      secretRegion: await input({
        message: chalk.cyan('Enter AWS secret region:'),
        default: "us-west-2"
      })
    }
  }

  private async updateProductionYaml(provider: string): Promise<void> {
    const charts = [
      'balance-checker', 'blockscout', 'blockscout-sc-verifier', 'bridge-history-api',
      'bridge-history-fetcher', 'chain-monitor', 'contracts', 'coordinator-api',
      'coordinator-cron', 'external-secrets-lib', 'frontends', 'gas-oracle', 'l2-bootnode', 'l2-rpc', 'l2-sequencer',
      'rollup-explorer-backend', 'rollup-node', 'scroll-common', 'scroll-sdk'
    ]

    let credentials: Record<string, string>
    if (provider === 'vault') {
      credentials = await this.getVaultCredentials()
    } else {
      credentials = await this.getAWSCredentials()
    }

    for (const chart of charts) {
      const yamlPath = path.join(process.cwd(), chart, 'values', 'production.yaml')
      if (fs.existsSync(yamlPath)) {
        const content = fs.readFileSync(yamlPath, 'utf8')
        const yamlContent = yaml.load(content) as any

        let updated = false
        if (yamlContent.externalSecrets) {
          for (const [secretName, secret] of Object.entries(yamlContent.externalSecrets) as [string, any][]) {
            if (secret.provider === provider) {
              if (provider === 'vault') {
                secret.server = credentials.server
                secret.path = credentials.path
                secret.version = credentials.version
                secret.tokenSecretName = credentials.tokenSecretName
                secret.tokenSecretKey = credentials.tokenSecretKey
              } else {
                secret.serviceAccount = credentials.serviceAccount
                secret.secretRegion = credentials.secretRegion
              }

              // Update remoteRef for migrate-db secrets
              if (secretName.endsWith('-migrate-db')) {
                for (const data of secret.data) {
                  if (data.remoteRef && data.remoteRef.key && data.secretKey === 'migrate-db.json') {
                    data.remoteRef.property = 'migrate-db.json'
                  }
                }
              }

              updated = true
            }
          }
        }

        if (updated) {
          const newContent = yaml.dump(yamlContent, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: true })
          fs.writeFileSync(yamlPath, newContent)
          this.log(chalk.green(`Updated externalSecrets provider in ${chalk.cyan(chart)}/values/production.yaml`))
        } else {
          this.log(chalk.yellow(`No changes needed in ${chalk.cyan(chart)}/values/production.yaml`))
        }
      } else {
        this.log(chalk.yellow(`${chalk.cyan(chart)}/values/production.yaml not found, skipping`))
      }
    }
  }


  public async run(): Promise<void> {
    this.log(chalk.blue('Starting secret push process...'))

    const secretService = await select({
      message: chalk.cyan('Select a secret service:'),
      choices: [
        { name: 'AWS', value: 'aws' },
        { name: 'Hashicorp Vault - Dev', value: 'vault' },
      ],
    })

    let service: SecretService
    let provider: string

    if (secretService === 'aws') {
      const region = await input({
        message: chalk.cyan('Enter AWS region:'),
        validate: (value) => value.length > 0 || chalk.red('AWS region is required'),
      })
      service = new AWSSecretService(region)
      provider = 'aws'
    } else if (secretService === 'vault') {
      service = new HashicorpVaultDevService()
      provider = 'vault'
    } else {
      this.error(chalk.red('Invalid secret service selected'))
    }

    try {
      await service.pushSecrets()
      this.log(chalk.green('Secrets pushed successfully'))

      const shouldUpdateYaml = await confirm({
        message: chalk.cyan('Do you want to update the production.yaml files with the new secret provider?'),
      })

      if (shouldUpdateYaml) {
        await this.updateProductionYaml(provider)
        this.log(chalk.green('Production YAML files updated successfully'))
        this.log(chalk.green('Contracts configs copied successfully'))
      } else {
        this.log(chalk.yellow('Skipped updating production YAML files and copying contracts configs'))
      }

      this.log(chalk.blue('Secret push process completed.'))
    } catch (error) {
      this.error(chalk.red(`Failed to push secrets: ${error}`))
    }
  }
}
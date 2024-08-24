import { Command } from '@oclif/core'
import * as fs from 'fs'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { select, input } from '@inquirer/prompts'

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
      console.log(`Successfully pushed secret: scroll/${secretName}`)
    } catch (error) {
      console.error(`Failed to push secret: scroll/${secretName}`)
    }
  }

  async pushSecrets(): Promise<void> {
    const secretsDir = path.join(process.cwd(), 'secrets')

    // Process JSON files
    const jsonFiles = fs.readdirSync(secretsDir).filter(file => file.endsWith('.json'))
    for (const file of jsonFiles) {
      const secretName = path.basename(file, '.json')
      console.log(`Processing JSON secret: ${secretName}`)
      const content = await fs.promises.readFile(path.join(secretsDir, file), 'utf-8')
      await this.pushToAWSSecret(content, secretName)
    }

    // Process ENV files
    const envFiles = fs.readdirSync(secretsDir).filter(file => file.endsWith('.env'))
    for (const file of envFiles) {
      const secretName = `${path.basename(file, '.env')}-env`
      console.log(`Processing ENV secret: ${secretName}`)
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
      console.error(`Error: ${error}`)
      throw error
    }
  }

  private async convertEnvToDict(filePath: string): Promise<Record<string, string>> {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    const lines = content.split('\n')
    const result: Record<string, string> = {}

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, value] = trimmedLine.split('=')
        result[key.trim()] = value.trim()
      }
    }

    return result
  }

  private escapeValue(value: string): string {
    return value.replace(/'/g, "'\\''")
  }

  private async isSecretEngineEnabled(path: string): Promise<boolean> {
    try {
      const output = await this.runCommand(`kubectl exec vault-0 -- vault secrets list -format=json`)
      const secretsList = JSON.parse(output)
      return path + '/' in secretsList
    } catch (error) {
      console.error(`Error checking if secret engine is enabled: ${error}`)
      return false
    }
  }

  async pushSecrets(): Promise<void> {
    // Check if the KV secrets engine is already enabled
    const isEnabled = await this.isSecretEngineEnabled('scroll')
    if (!isEnabled) {
      // Enable the KV secrets engine only if it's not already enabled
      try {
        await this.runCommand("kubectl exec vault-0 -- vault secrets enable -path=scroll kv-v2")
        console.log("KV secrets engine enabled at path 'scroll'")
      } catch (error: unknown) {
        if (error instanceof Error) {
          // If the error is about the path already in use, we can ignore it
          if (!error.message.includes("path is already in use at scroll/")) {
            throw error
          }
          console.log("KV secrets engine already enabled at path 'scroll'")
        } else {
          // If it's not an Error instance, rethrow it
          throw error
        }
      }
    } else {
      console.log("KV secrets engine already enabled at path 'scroll'")
    }

    const secretsDir = path.join(process.cwd(), 'secrets')

    // Process JSON files
    const jsonFiles = fs.readdirSync(secretsDir).filter(file => file.endsWith('.json'))
    for (const file of jsonFiles) {
      const secretName = path.basename(file, '.json')
      console.log(`Processing JSON secret: scroll/${secretName}`)
      const content = await fs.promises.readFile(path.join(secretsDir, file), 'utf-8')
      const escapedContent = this.escapeValue(content)
      await this.runCommand(`kubectl exec vault-0 -- vault kv put scroll/${secretName} config-json='${escapedContent}'`)
    }

    // Process ENV files
    const envFiles = fs.readdirSync(secretsDir).filter(file => file.endsWith('.env'))
    for (const file of envFiles) {
      const secretName = `${path.basename(file, '.env')}-env`
      console.log(`Processing ENV secret: scroll/${secretName}`)
      const data = await this.convertEnvToDict(path.join(secretsDir, file))
      const kvPairs = Object.entries(data)
        .map(([key, value]) => `${key}='${this.escapeValue(value)}'`)
        .join(' ')
      await this.runCommand(`kubectl exec vault-0 -- vault kv put scroll/${secretName} ${kvPairs}`)
    }

    console.log("All secrets have been processed and populated in Vault.")
  }
}

export default class SetupPushSecrets extends Command {
  static override description = 'Push secrets to the selected secret service'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    const secretService = await select({
      message: 'Select a secret service:',
      choices: [
        { name: 'AWS', value: 'aws' },
        { name: 'Hashicorp Vault - Dev', value: 'vault' },
      ],
    })

    let service: SecretService

    if (secretService === 'aws') {
      const region = await input({
        message: 'Enter AWS region:',
        validate: (value) => value.length > 0 || 'AWS region is required',
      })
      service = new AWSSecretService(region)
    } else if (secretService === 'vault') {
      service = new HashicorpVaultDevService()
    } else {
      this.error('Invalid secret service selected')
    }

    try {
      await service.pushSecrets()
      this.log('Secrets pushed successfully')
    } catch (error) {
      this.error('Failed to push secrets: ' + error)
    }
  }
}
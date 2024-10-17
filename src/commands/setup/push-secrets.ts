import { confirm, input, select } from '@inquirer/prompts'
import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { exec } from 'child_process'
import * as fs from 'fs'
import * as yaml from 'js-yaml'
import * as path from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface SecretService {
  pushSecrets(): Promise<void>
}

class AWSSecretService implements SecretService {
  constructor(private region: string, private prefixName: string, private debug: boolean) { }

  private async secretExists(secretName: string): Promise<boolean> {
    const fullSecretName = `${this.prefixName}/${secretName}`
    try {
      await execAsync(`aws secretsmanager describe-secret --secret-id "${fullSecretName}" --region ${this.region}`)
      return true
    } catch (error: any) {
      if (error.message.includes('ResourceNotFoundException')) {
        return false
      }
      throw error
    }
  }

  private async createOrUpdateSecret(content: Record<string, string>, secretName: string): Promise<void> {
    const fullSecretName = `${this.prefixName}/${secretName}`
    const jsonContent = JSON.stringify(content)
    const escapedJsonContent = jsonContent.replace(/'/g, "'\\''")

    if (await this.secretExists(secretName)) {
      const shouldOverride = await confirm({
        message: chalk.yellow(`Secret ${fullSecretName} already exists. Do you want to override it?`),
        default: false,
      })

      if (!shouldOverride) {
        console.log(chalk.yellow(`Skipping secret: ${fullSecretName}`))
        return
      }

      const command = `aws secretsmanager put-secret-value --secret-id "${fullSecretName}" --secret-string '${escapedJsonContent}' --region ${this.region}`
      if (this.debug) {
        console.log(chalk.yellow('--- Debug Output ---'))
        console.log(chalk.cyan(`Command: ${command}`))
        console.log(chalk.yellow('-------------------'))
      }
      try {
        await execAsync(command)
        console.log(chalk.green(`Successfully updated secret: ${fullSecretName}`))
      } catch (error) {
        console.error(chalk.red(`Failed to update secret: ${fullSecretName}`))
        console.error(chalk.red(`Error details: ${error}`))
        throw error
      }
    } else {
      const command = `aws secretsmanager create-secret --name "${fullSecretName}" --secret-string '${escapedJsonContent}' --region ${this.region}`
      if (this.debug) {
        console.log(chalk.yellow('--- Debug Output ---'))
        console.log(chalk.cyan(`Command: ${command}`))
        console.log(chalk.yellow('-------------------'))
      }
      try {
        await execAsync(command)
        console.log(chalk.green(`Successfully created secret: ${fullSecretName}`))
      } catch (error) {
        console.error(chalk.red(`Failed to create secret: ${fullSecretName}`))
        console.error(chalk.red(`Error details: ${error}`))
        throw error
      }
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
        value = value.replace(/^["'](.*)["']$/, '$1')
        result[key] = value
      }
    }

    return result
  }

  async pushSecrets(): Promise<void> {
    const secretsDir = path.join(process.cwd(), 'secrets')

    // Process JSON files
    const jsonFiles = fs.readdirSync(secretsDir).filter(file => file.endsWith('.json'))
    for (const file of jsonFiles) {
      const secretName = path.basename(file, '.json')
      console.log(chalk.cyan(`Processing JSON secret: ${secretName}`))
      const content = await fs.promises.readFile(path.join(secretsDir, file), 'utf-8')
      await this.createOrUpdateSecret({ 'migrate-db.json': content }, secretName)
    }

    // Process ENV files
    const envFiles = fs.readdirSync(secretsDir).filter(file => file.endsWith('.env'))
    let l2SequencerSecrets: Record<string, string> = {}

    for (const file of envFiles) {
      const secretName = path.basename(file, '.env')
      if (secretName.startsWith('l2-sequencer-')) {
        console.log(chalk.cyan(`Processing L2 Sequencer secret: ${secretName}`))
        const data = await this.convertEnvToDict(path.join(secretsDir, file))
        l2SequencerSecrets = { ...l2SequencerSecrets, ...data }
      } else {
        console.log(chalk.cyan(`Processing ENV secret: ${secretName}-env`))
        const data = await this.convertEnvToDict(path.join(secretsDir, file))
        await this.createOrUpdateSecret(data, `${secretName}-env`)
      }
    }

    // Push combined L2 Sequencer secrets
    if (Object.keys(l2SequencerSecrets).length > 0) {
      console.log(chalk.cyan(`Processing combined L2 Sequencer secrets: l2-sequencer-secret-env`))
      await this.createOrUpdateSecret(l2SequencerSecrets, 'l2-sequencer-secret-env')
    }
  }
}

class HashicorpVaultDevService implements SecretService {
  private debug: boolean

  constructor(debug: boolean) {
    this.debug = debug
  }

  private async runCommand(command: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`kubectl exec vault-0 -- ${command}`)
      return stdout.trim()
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`))
      throw error
    }
  }

  private async isVaultPodRunning(): Promise<boolean> {
    try {
      await execAsync('kubectl get pod vault-0')
      return true
    } catch (error) {
      return false
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
      const output = await this.runCommand(`vault secrets list -format=json`)
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

    const command = `vault kv put scroll/${secretName} ${kvPairs}`

    if (this.debug) {
      console.log(chalk.yellow('--- Debug Output ---'))
      console.log(chalk.cyan(`Secret Name: ${secretName}`))
      console.log(chalk.cyan(`Command: ${command}`))
      console.log(chalk.yellow('-------------------'))
    }

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
      const command = `vault kv put scroll/${secretName} migrate-db.json='${escapedJson}'`;

      if (this.debug) {
        console.log(chalk.yellow('--- Debug Output ---'));
        console.log(chalk.cyan(`Secret Name: ${secretName}`));
        console.log(chalk.cyan(`Command: ${command}`));
        console.log(chalk.yellow('-------------------'));
      }

      await this.runCommand(command);
      console.log(chalk.green(`Successfully pushed JSON secret: scroll/${secretName}`));
    } catch (error) {
      console.error(chalk.red(`Failed to push JSON secret: scroll/${secretName}`));
      console.error(chalk.red(`Error: ${error}`));
    }
  }

  async pushSecrets(): Promise<void> {
    if (!(await this.isVaultPodRunning())) {
      console.log(chalk.yellow('Vault pod is not running. Please install Vault using the following commands:'))
      console.log(chalk.cyan('helm repo add hashicorp https://helm.releases.hashicorp.com'))
      console.log(chalk.cyan('helm repo update'))
      console.log(chalk.cyan('helm install vault hashicorp/vault --set "server.dev.enabled=true"'))
      console.log(chalk.yellow('After installing Vault, please run this command again.'))
      return
    }

    // Check if the KV secrets engine is already enabled
    const isEnabled = await this.isSecretEngineEnabled('scroll')
    if (!isEnabled) {
      // Enable the KV secrets engine only if it's not already enabled
      try {
        await this.runCommand("vault secrets enable -path=scroll kv-v2")
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
    let l2SequencerSecrets: Record<string, string> = {}

    for (const file of envFiles) {
      const secretName = path.basename(file, '.env') + '-env'
      if (secretName.startsWith('l2-sequencer-')) {
        console.log(chalk.cyan(`Processing L2 Sequencer secret: ${secretName}`))
        const data = await this.convertEnvToDict(path.join(secretsDir, file))
        l2SequencerSecrets = { ...l2SequencerSecrets, ...data }
      } else {
        console.log(chalk.cyan(`Processing ENV secret: scroll/${secretName}`))
        const data = await this.convertEnvToDict(path.join(secretsDir, file))
        await this.pushToVault(secretName, data)
      }
    }

    // Push combined L2 Sequencer secrets
    if (Object.keys(l2SequencerSecrets).length > 0) {
      console.log(chalk.cyan(`Processing combined L2 Sequencer secrets: scroll/l2-sequencer-secret-env`))
      await this.pushToVault('l2-sequencer-secret-env', l2SequencerSecrets)
    }

    console.log(chalk.green("All secrets have been processed and populated in Vault."))
  }
}

export default class SetupPushSecrets extends Command {
  static override description = 'Push secrets to the selected secret service'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --debug',
    '<%= config.bin %> <%= command.id %> --values-dir custom-values',
  ]

  static override flags = {
    debug: Flags.boolean({
      char: 'd',
      description: 'Show debug output',
      default: false,
    }),
    'values-dir': Flags.string({
      description: 'Directory containing the values files',
      default: 'values',
    }),
  }

  private flags: any;

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
      }),
      prefixName: await input({
        message: chalk.cyan('Enter secret prefix name:'),
        default: "scroll"
      })
    }
  }

  private async updateProductionYaml(provider: string): Promise<void> {
    const valuesDir = path.join(process.cwd(), this.flags['values-dir']);
    if (!fs.existsSync(valuesDir)) {
      this.error(chalk.red(`Values directory not found at ${valuesDir}`));
    }

    let credentials: Record<string, string>;
    if (provider === 'vault') {
      credentials = await this.getVaultCredentials();
    } else {
      credentials = await this.getAWSCredentials();
    }

    const yamlFiles = fs.readdirSync(valuesDir).filter(file =>
      file.endsWith('-production.yaml') || file.match(/-production-\d+\.yaml$/)
    );

    for (const yamlFile of yamlFiles) {
      const yamlPath = path.join(valuesDir, yamlFile);
      this.log(chalk.cyan(`Processing ${yamlFile}`));

      const content = fs.readFileSync(yamlPath, 'utf8');
      const yamlContent = yaml.load(content) as any;

      let updated = false;
      if (yamlContent.externalSecrets) {
        for (const [secretName, secret] of Object.entries(yamlContent.externalSecrets) as [string, any][]) {
          if (secret.provider !== provider) {
            secret.provider = provider;
            updated = true;
          }

          if (provider === 'vault') {
            secret.server = credentials.server;
            secret.path = credentials.path;
            secret.version = credentials.version;
            secret.tokenSecretName = credentials.tokenSecretName;
            secret.tokenSecretKey = credentials.tokenSecretKey;
            delete secret.serviceAccount;
            delete secret.secretRegion;
            updated = true;
          } else {
            secret.serviceAccount = credentials.serviceAccount;
            secret.secretRegion = credentials.secretRegion;
            delete secret.server;
            delete secret.path;
            delete secret.version;
            delete secret.tokenSecretName;
            delete secret.tokenSecretKey;
            updated = true;
          }

          // Update remoteRef for migrate-db secrets
          if (secretName.endsWith('-migrate-db')) {
            for (const data of secret.data) {
              if (data.remoteRef && data.remoteRef.key && data.secretKey === 'migrate-db.json') {
                data.remoteRef.property = 'migrate-db.json';
                updated = true;
              }
            }
          }

          // Update remoteRef for l2-sequencer secrets
          if (secretName.match(/^l2-sequencer-\d+-secret$/)) {
            for (const data of secret.data) {
              if (data.remoteRef && data.remoteRef.key) {
                data.remoteRef.key = 'l2-sequencer-secret';
                updated = true;
              }
            }
          }
        }
      }

      if (updated) {
        const newContent = yaml.dump(yamlContent, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: true });
        fs.writeFileSync(yamlPath, newContent);
        this.log(chalk.green(`Updated externalSecrets provider in ${chalk.cyan(yamlFile)}`));
      } else {
        this.log(chalk.yellow(`No changes needed in ${chalk.cyan(yamlFile)}`));
      }
    }
  }


  public async run(): Promise<void> {
    const { flags } = await this.parse(SetupPushSecrets)
    this.flags = flags

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
      const awsCredentials = await this.getAWSCredentials()
      service = new AWSSecretService(awsCredentials.secretRegion, awsCredentials.prefixName, flags.debug)
      provider = 'aws'
    } else if (secretService === 'vault') {
      service = new HashicorpVaultDevService(flags.debug)
      provider = 'vault'
    } else {
      this.error(chalk.red('Invalid secret service selected'))
    }

    try {
      await service.pushSecrets()
      this.log(chalk.green('Secrets pushed successfully'))

      const shouldUpdateYaml = await confirm({
        message: chalk.cyan('Do you want to update the production YAML files with the new secret provider?'),
      })

      if (shouldUpdateYaml) {
        await this.updateProductionYaml(provider)
        this.log(chalk.green('Production YAML files updated successfully'))
      } else {
        this.log(chalk.yellow('Skipped updating production YAML files'))
      }

      this.log(chalk.blue('Secret push process completed.'))
    } catch (error) {
      this.error(chalk.red(`Failed to push secrets: ${error}`))
    }
  }
}

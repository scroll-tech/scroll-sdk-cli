import { Command } from '@oclif/core'
import { confirm, input, select } from '@inquirer/prompts'
import * as fs from 'fs'
import * as path from 'path'
import * as toml from '@iarna/toml'
import chalk from 'chalk'
import { ethers } from 'ethers'

export default class SetupGasToken extends Command {
  static override description = 'Set up gas token configurations'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  private async updateConfigFile(gasConfig: Record<string, string | boolean | number>): Promise<void> {
    const configPath = path.join(process.cwd(), 'config.toml')
    if (!fs.existsSync(configPath)) {
      this.error('config.toml not found in the current directory.')
      return
    }

    const configContent = fs.readFileSync(configPath, 'utf-8')
    const config = toml.parse(configContent) as toml.JsonMap

    if (!config['gas-token']) {
      config['gas-token'] = {}
    }

    // Remove all existing gas-token configurations
    if (typeof config['gas-token'] === 'object') {
      Object.keys(config['gas-token']).forEach(key => {
        delete (config['gas-token'] as Record<string, unknown>)[key]
      })
    }

    // Add new configurations
    Object.entries(gasConfig).forEach(([key, value]) => {
      if (config['gas-token'] && typeof config['gas-token'] === 'object') {
        (config['gas-token'] as Record<string, unknown>)[key] = value
      }
    })

    const updatedContent = toml.stringify(config)
    fs.writeFileSync(configPath, updatedContent)
    this.log(chalk.green('config.toml has been updated with the new gas token configurations.'))
  }

  private async checkL1TokenExists(tokenAddress: string): Promise<boolean> {
    const configPath = path.join(process.cwd(), 'config.toml')
    if (!fs.existsSync(configPath)) {
      this.error('config.toml not found in the current directory.')
      return false
    }

    const configContent = fs.readFileSync(configPath, 'utf-8')
    const config = toml.parse(configContent) as any

    const l1RpcEndpoint = config.general?.L1_RPC_ENDPOINT
    if (!l1RpcEndpoint) {
      this.error('L1_RPC_ENDPOINT not found in config.toml')
      return false
    }

    try {
      // Validate the address format using ethers v6
      if (!ethers.isAddress(tokenAddress)) {
        this.log(chalk.red('Invalid Ethereum address format.'))
        return false
      }

      const provider = new ethers.JsonRpcProvider(l1RpcEndpoint)
      const code = await provider.getCode(tokenAddress)
      return code !== '0x'
    } catch (error) {
      this.error(`Failed to check token existence: ${error}`)
      return false
    }
  }

  private async displayChanges(gasConfig: Record<string, string | boolean | number>): Promise<void> {
    this.log(chalk.cyan('\nThe following changes will be made to the [gas-token] section in config.toml:'))

    Object.entries(gasConfig).forEach(([key, value]) => {
      if (typeof value === 'boolean') {
        this.log(`${key} = ${chalk.green(value.toString())}`)
      } else if (typeof value === 'number') {
        this.log(`${key} = ${chalk.green(value.toString())}`)
      } else {
        this.log(`${key} = ${chalk.green(`"${value}"`)}`)
      }
    })

    const keys = ['ALTERNATIVE_GAS_TOKEN_ENABLED', 'L1_GAS_TOKEN', 'EXAMPLE_GAS_TOKEN_DECIMAL']
    const removedKeys = keys.filter(key => !(key in gasConfig))
    if (removedKeys.length > 0) {
      this.log(chalk.yellow('\nThe following keys will be removed:'))
      removedKeys.forEach(key => this.log(chalk.yellow(key)))
    }
  }

  public async run(): Promise<void> {
    this.log(chalk.blue('Setting up gas token configurations...'))

    const useAlternativeToken = await confirm({
      message: chalk.cyan('Do you want to use an alternative gas token?'),
      default: false
    })

    let gasConfig: Record<string, string | boolean | number> = {
      ALTERNATIVE_GAS_TOKEN_ENABLED: useAlternativeToken,
    }

    if (useAlternativeToken) {
      const deploymentChoice = await select({
        message: chalk.cyan('How do you want to set up the gas token?'),
        choices: [
          { name: 'Use an existing L1 ERC20 token', value: 'existing' },
          { name: 'Auto-deploy a new ERC20 token', value: 'autodeploy' },
        ],
      })

      if (deploymentChoice === 'existing') {
        let tokenAddress: string
        let isValidAddress = false

        do {
          tokenAddress = await input({
            message: chalk.cyan('Enter the L1 ERC20 token address:'),
            validate: (value) => ethers.isAddress(value) || 'Please enter a valid Ethereum address',
          })

          isValidAddress = await this.checkL1TokenExists(tokenAddress)
          if (!isValidAddress) {
            this.log(chalk.red('The provided address does not contain a contract. Please try again.'))
          }
        } while (!isValidAddress)

        gasConfig.L1_GAS_TOKEN = tokenAddress
      } else {
        const tokenDecimals = await input({
          message: chalk.cyan('Enter the number of decimals for the example gas token:'),
          default: '18',
          validate: (value) => {
            const num = parseInt(value, 10)
            return (!isNaN(num) && num >= 0 && num <= 256) || 'Please enter a valid number between 0 and 256'
          },
        })

        gasConfig.EXAMPLE_GAS_TOKEN_DECIMAL = parseInt(tokenDecimals, 10)
      }
    }

    await this.displayChanges(gasConfig)

    const confirmChanges = await confirm({
      message: chalk.cyan('Do you want to apply these changes?'),
      default: true
    })

    if (confirmChanges) {
      await this.updateConfigFile(gasConfig)
      this.log(chalk.green('Gas token configuration completed successfully.'))
    } else {
      this.log(chalk.yellow('Gas token configuration cancelled.'))
    }
  }
}
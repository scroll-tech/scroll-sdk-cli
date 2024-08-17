import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import {ethers} from 'ethers'
import path from 'node:path'

import {parseTomlConfig} from '../../utils/config-parser.js'

enum Layer {
  L1 = 'l1',
  L2 = 'l2',
}

export default class HelperActivity extends Command {
  static description = 'Generate transactions on the specified network(s) to produce more blocks'

  static flags = {
    config: Flags.string({
      char: 'c',
      default: './config.toml',
      description: 'Path to config.toml file',
    }),
    interval: Flags.integer({
      char: 'i',
      default: 5,
      description: 'Interval between transactions in seconds',
    }),
    layer1: Flags.boolean({
      char: 'o',
      default: false,
      description: 'Generate activity on Layer 1',
    }),
    layer2: Flags.boolean({
      char: 't',
      default: true,
      description: 'Generate activity on Layer 2',
    }),
    pod: Flags.boolean({
      char: 'p',
      default: false,
      description: 'Run inside Kubernetes pod',
    }),
    privateKey: Flags.string({
      char: 'k',
      description: 'Private key (overrides config)',
    }),
    recipient: Flags.string({
      char: 'x',
      description: 'Recipient address (overrides config)',
    }),
    rpc: Flags.string({
      char: 'r',
      description: 'RPC URL (overrides config for both layers)',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(HelperActivity)

    const configPath = path.resolve(flags.config)
    const config = parseTomlConfig(configPath)

    const privateKey = flags.privateKey ?? config.accounts.DEPLOYER_PRIVATE_KEY
    const recipientAddr = flags.recipient ?? config.accounts.DEPLOYER_ADDR

    if (!privateKey || !recipientAddr) {
      this.error('Missing required configuration. Please check your config file or provide flags.')
    }

    const layers: Layer[] = []
    if (flags.layer1) layers.push(Layer.L1)
    if (flags.layer2) layers.push(Layer.L2)

    if (layers.length === 0) {
      this.error('At least one layer must be selected. Use --layer1 or --layer2 flags.')
    }

    const providers: Record<Layer, ethers.JsonRpcProvider> = {} as Record<Layer, ethers.JsonRpcProvider>
    const wallets: Record<Layer, ethers.Wallet> = {} as Record<Layer, ethers.Wallet>

    for (const layer of layers) {
      let rpcUrl: string
      if (flags.rpc) {
        rpcUrl = flags.rpc
      } else if (flags.pod) {
        rpcUrl = layer === Layer.L1 ? config.general.L1_RPC_ENDPOINT : config.general.L2_RPC_ENDPOINT
      } else {
        rpcUrl = layer === Layer.L1 ? config.frontend.EXTERNAL_RPC_URI_L1 : config.frontend.EXTERNAL_RPC_URI_L2
      }

      if (!rpcUrl) {
        this.error(`Missing RPC URL for ${layer.toUpperCase()}. Please check your config file or provide --rpc flag.`)
      }

      providers[layer] = new ethers.JsonRpcProvider(rpcUrl)
      wallets[layer] = new ethers.Wallet(privateKey, providers[layer])
    }

    this.log(
      chalk.cyan(
        `Starting activity generation on ${layers.map((l) => l.toUpperCase()).join(' and ')}. Press Ctrl+C to stop.`,
      ),
    )

    // eslint-disable-next-line no-constant-condition
    while (true) {
      for (const layer of layers) {
        // eslint-disable-next-line no-await-in-loop
        await this.sendTransaction(wallets[layer], recipientAddr, layer)
      }

      // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
      await new Promise((resolve) => setTimeout(resolve, flags.interval * 1000))
    }
  }

  private async sendTransaction(wallet: ethers.Wallet, recipient: string, layer: Layer) {
    try {
      const tx = await wallet.sendTransaction({
        to: recipient,
        value: ethers.parseUnits('0.1', 'gwei'),
      })
      const receipt = await tx.wait()
      this.log(chalk.green(`${layer.toUpperCase()} Transaction sent: ${tx.hash} (Block: ${receipt?.blockNumber})`))
    } catch (error) {
      this.log(
        chalk.red(
          `Failed to send ${layer.toUpperCase()} transaction: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        ),
      )
    }
  }
}

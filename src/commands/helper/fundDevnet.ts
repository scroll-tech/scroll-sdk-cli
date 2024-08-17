import {Command, Flags} from '@oclif/core'
import {ethers} from 'ethers'
import path from 'node:path'

import {parseTomlConfig} from '../../utils/config-parser.js'

export default class HelperFundDevnet extends Command {
  static description = 'Fund default L1 accounts when using an Anvil devnet'

  static flags = {
    account: Flags.string({
      char: 'a',
      description: 'Additional account to fund',
    }),
    config: Flags.string({
      char: 'c',
      default: './config.toml',
      description: 'Path to config.toml file',
    }),
    rpc: Flags.string({
      char: 'r',
      description: 'L1 RPC URL',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(HelperFundDevnet)

    const configPath = path.resolve(flags.config)
    const config = parseTomlConfig(configPath)

    const anvilRpc = flags.rpc ?? config.frontend.EXTERNAL_RPC_URI_L1

    const provider = new ethers.JsonRpcProvider(anvilRpc)

    const addresses = [
      config.accounts.L1_COMMIT_SENDER_ADDR,
      config.accounts.L1_FINALIZE_SENDER_ADDR,
      config.accounts.L1_GAS_ORACLE_SENDER_ADDR,
    ]

    if (flags.account) {
      addresses.push(flags.account)
    }

    const amount = '0x3635C9ADC5DEA00000' // 1000 ETH in wei

    for (const address of addresses) {
      if (!address) {
        this.warn(`Address not found in config for one of the accounts`)
        continue
      }

      // eslint-disable-next-line no-await-in-loop
      await this.fundAddress(provider, address, amount)
    }

    this.log('Funding complete')
  }

  private async fundAddress(provider: ethers.JsonRpcProvider, address: string, amount: string) {
    try {
      const result = await provider.send('anvil_setBalance', [address, amount])
      this.log(`Successfully funded ${address}`)
      return result
    } catch (error) {
      this.error(`Failed to fund ${address}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

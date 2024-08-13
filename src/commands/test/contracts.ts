import {Command, Flags} from '@oclif/core'
import {ethers} from 'ethers'
import {parseTomlConfig} from '../../utils/config-parser.js'
import path from 'path'
import cliProgress from 'cli-progress'

interface ContractsConfig {
  [key: string]: string
}

export default class TestContracts extends Command {
  static description = 'Test contracts by checking deployment and initialization'

  static flags = {
    config: Flags.string({
      char: 'c',
      description: 'Path to config.toml file',
      default: './charts/scroll-stack/config.toml',
    }),
    contracts: Flags.string({
      char: 't',
      description: 'Path to configs-contracts.toml file',
      default: './charts/scroll-stack/configs-contracts.toml',
    }),
    pod: Flags.boolean({
      char: 'p',
      description: 'Run inside Kubernetes pod',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(TestContracts)

    const configPath = path.resolve(flags.config)
    const contractsPath = path.resolve(flags.contracts)

    const config = parseTomlConfig(configPath)
    const contractsConfig: ContractsConfig = parseTomlConfig(contractsPath)

    let l1RpcUrl: string
    let l2RpcUrl: string

    if (flags.pod) {
      l1RpcUrl = config.general.L1_RPC_ENDPOINT
      l2RpcUrl = config.general.L2_RPC_ENDPOINT
    } else {
      l1RpcUrl = config.frontend.EXTERNAL_RPC_URI_L1
      l2RpcUrl = config.frontend.EXTERNAL_RPC_URI_L2
    }

    const l1Provider = new ethers.JsonRpcProvider(l1RpcUrl)
    const l2Provider = new ethers.JsonRpcProvider(l2RpcUrl)

    try {
      const l1Contracts = Object.entries(contractsConfig).filter(([key]) => 
        key.startsWith('L1_') && 
        key !== 'L1_GAS_PRICE_ORACLE_ADDR' ||
        key === 'L2_GAS_PRICE_ORACLE_IMPLEMENTATION_ADDR' || 
        key === 'L2_GAS_PRICE_ORACLE_PROXY_ADDR'
      )
      const l2Contracts = Object.entries(contractsConfig).filter(([key]) => 
        (key.startsWith('L2_') && 
        key !== 'L2_GAS_PRICE_ORACLE_IMPLEMENTATION_ADDR' && 
        key !== 'L2_GAS_PRICE_ORACLE_PROXY_ADDR') ||
        key === 'L1_GAS_PRICE_ORACLE_ADDR'
      )

      const multibar = new cliProgress.MultiBar({
        clearOnComplete: false,
        hideCursor: true,
        format: ' {bar} | {percentage}% | {value}/{total} | {name}',
      }, cliProgress.Presets.shades_classic)

      const l1Bar = multibar.create(l1Contracts.length, 0, {name: 'Checking L1 contract...'})
      const l2Bar = multibar.create(l2Contracts.length, 0, {name: 'Checking L2 contract...'})

      const notDeployed: Array<{name: string; address: string}> = []
      const notInitialized: Array<{name: string; address: string}> = []

      await Promise.all([
        this.checkContracts(l1Provider, l1Contracts, l1Bar, notDeployed, notInitialized),
        this.checkContracts(l2Provider, l2Contracts, l2Bar, notDeployed, notInitialized),
      ])

      multibar.stop()

      if (notDeployed.length > 0) {
        this.log('\nContracts not deployed:')
        notDeployed.forEach(contract => this.log(`- ${contract.name} (${contract.address})`))
      }

      if (notInitialized.length > 0) {
        this.log('\nContracts not initialized:')
        notInitialized.forEach(contract => this.log(`- ${contract.name} (${contract.address})`))
      }

      if (notDeployed.length === 0 && notInitialized.length === 0) {
        this.log('\nAll contracts are deployed and initialized.')
      }
    } catch (error) {
      this.error(`Failed to check contracts: ${error}`)
    }
  }

  private async checkContracts(
    provider: ethers.Provider,
    contracts: [string, string][],
    progressBar: cliProgress.SingleBar,
    notDeployed: Array<{name: string; address: string}>,
    notInitialized: Array<{name: string; address: string}>
  ) {
    for (const [name, address] of contracts) {
      progressBar.update({name: `Checking ${name}...`})
      const code = await provider.getCode(address)
      if (code === '0x') {
        notDeployed.push({name, address})
      } else {
        const initialized = await this.checkInitialization(provider, address)
        if (!initialized) {
          notInitialized.push({name, address})
        }
      }
      progressBar.increment()
    }
  }

  private async checkInitialization(provider: ethers.Provider, address: string): Promise<boolean> {
    const abi = ['function initialized() view returns (bool)']
    const contract = new ethers.Contract(address, abi, provider)
    
    try {
      return await contract.initialized()
    } catch (error) {
      return false
    }
  }
}
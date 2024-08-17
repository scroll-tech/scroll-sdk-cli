import {Command, Flags} from '@oclif/core'
import {ethers} from 'ethers'
import {parseTomlConfig} from '../../utils/config-parser.js'
import path from 'path'
import cliProgress from 'cli-progress'
import {L1Contracts, L2Contracts, DeployedContract} from '../../data/contracts.js'

interface ContractsConfig {
  [key: string]: string
}

export default class TestContracts extends Command {
  static description = 'Test contracts by checking deployment and initialization'

  static flags = {
    config: Flags.string({
      char: 'c',
      description: 'Path to config.toml file',
      default: './config.toml',
    }),
    contracts: Flags.string({
      char: 't',
      description: 'Path to configs-contracts.toml file',
      default: './config-contracts.toml',
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

    // if we're running inside a pod, we shouldn't use external URLs
    if (flags.pod) {
      l1RpcUrl = config?.general?.L1_RPC_ENDPOINT
      l2RpcUrl = config?.general?.L2_RPC_ENDPOINT
    } else {
      l1RpcUrl = config?.frontend?.EXTERNAL_RPC_URI_L1
      l2RpcUrl = config?.frontend?.EXTERNAL_RPC_URI_L2
    }

    const owner = config?.accounts?.OWNER_ADDR

    // Check if RPC URLs are defined
    if (!l1RpcUrl || !l2RpcUrl) {
      this.error(
        `Missing RPC URL(s) in ${configPath}. Please ensure L1_RPC_ENDPOINT and L2_RPC_ENDPOINT (for pod mode) or EXTERNAL_RPC_URI_L1 and EXTERNAL_RPC_URI_L2 (for non-pod mode) are defined.`,
      )
    }

    // Check if owner address is defined
    if (!owner) {
      this.error(`Missing OWNER_ADDR in ${configPath}. Please ensure it is defined in the accounts section.`)
    }

    // Check if contractsConfig is empty
    if (Object.keys(contractsConfig).length === 0) {
      this.error(
        `Contract configuration in ${contractsPath} is empty. Please ensure it contains the necessary contract addresses.`,
      )
    }

    const l1Provider = new ethers.JsonRpcProvider(l1RpcUrl)
    const l2Provider = new ethers.JsonRpcProvider(l2RpcUrl)

    // Check that config has a value for each required contract name

    const l1Addresses: DeployedContract[] = L1Contracts.map((contract) => {
      const address = contractsConfig[contract.name]
      if (!address) {
        this.log(`Missing address for contract: ${contract.name}`)
      }
      return {...contract, address}
    }).filter((address) => address !== undefined)

    const l2Addresses: DeployedContract[] = L2Contracts.map((contract) => {
      const address = contractsConfig[contract.name]
      if (!address) {
        this.log(`Missing address for contract: ${contract.name}`)
      }
      return {...contract, address}
    }).filter((address) => address !== undefined)

    try {
      // Check Deployments

      const multibarDeployment = new cliProgress.MultiBar(
        {
          clearOnComplete: false,
          hideCursor: true,
          format: ' {bar} | {percentage}% | {value}/{total} | {name}',
        },
        cliProgress.Presets.shades_classic,
      )

      let l1BarDeploy = multibarDeployment.create(l1Addresses.length, 0, {name: 'Checking L1 contract deployment...'})
      let l2BarDeploy = multibarDeployment.create(l2Addresses.length, 0, {name: 'Checking L2 contract deployment...'})

      const notDeployed: DeployedContract[] = []

      await Promise.all([
        this.checkContractDeployment(l1Provider, l1Addresses, l1BarDeploy, notDeployed),
        this.checkContractDeployment(l2Provider, l2Addresses, l2BarDeploy, notDeployed),
      ])

      // Check Initializations

      const multibarInitialization = new cliProgress.MultiBar(
        {
          clearOnComplete: false,
          hideCursor: true,
          format: ' {bar} | {percentage}% | {value}/{total} | {name}',
        },
        cliProgress.Presets.shades_classic,
      )

      const l1AddressesToInitialize = l1Addresses.filter(
        (contract) => contract.initializes && !notDeployed.some((nd) => nd.name === contract.name),
      )
      const l2AddressesToInitialize = l2Addresses.filter(
        (contract) => contract.initializes && !notDeployed.some((nd) => nd.name === contract.name),
      )

      const l1BarInit = multibarDeployment.create(l1AddressesToInitialize.length, 0, {
        name: 'Checking L1 contract initialization...',
      })
      const l2BarInit = multibarDeployment.create(l2AddressesToInitialize.length, 0, {
        name: 'Checking L2 contract initialization...',
      })

      const notInitialized: DeployedContract[] = []

      await Promise.all([
        this.checkContractInitialization(l1Provider, l1AddressesToInitialize, l1BarInit, notInitialized),
        this.checkContractInitialization(l2Provider, l2AddressesToInitialize, l2BarInit, notInitialized),
      ])

      // Check Owner

      const multibarOwner = new cliProgress.MultiBar(
        {
          clearOnComplete: false,
          hideCursor: true,
          format: ' {bar} | {percentage}% | {value}/{total} | {name}',
        },
        cliProgress.Presets.shades_classic,
      )

      const l1AddressesWithOwner = l1Addresses.filter(
        (contract) => contract.owned && !notDeployed.some((nd) => nd.name === contract.name),
      )
      const l2AddressesWithOwner = l2Addresses.filter(
        (contract) => contract.owned && !notDeployed.some((nd) => nd.name === contract.name),
      )

      const l1BarOwner = multibarOwner.create(l1AddressesWithOwner.length, 0, {
        name: 'Checking L1 contract ownership...',
      })
      const l2BarOwner = multibarOwner.create(l2AddressesWithOwner.length, 0, {
        name: 'Checking L2 contract ownership...',
      })

      const notOwned: DeployedContract[] = []

      await Promise.all([
        this.checkContractOwner(l1Provider, l1AddressesWithOwner, l1BarOwner, owner, notOwned),
        this.checkContractOwner(l2Provider, l2AddressesWithOwner, l2BarOwner, owner, notOwned),
      ])

      multibarDeployment.stop()
      multibarInitialization.stop()
      multibarOwner.stop()

      // Print results
      // Print results for correctly deployed, initialized, and owned contracts
      const correctlyConfigured = [...l1Addresses, ...l2Addresses].filter(
        (contract) =>
          !notDeployed.some((nd) => nd.name === contract.name) &&
          (!contract.initializes || !notInitialized.some((ni) => ni.name === contract.name)) &&
          (!contract.owned || !notOwned.some((no) => no.name === contract.name)),
      )

      this.log('\nCorrectly configured contracts:')
      correctlyConfigured.forEach((contract) => {
        let status = 'Deployed'
        if (contract.initializes) status += ', Initialized'
        if (contract.owned) status += ', Correctly Owned'
        this.log(`- ${contract.name} (${contract.address}): ${status}`)
      })

      if (notDeployed.length > 0) {
        this.log('\nContracts not deployed:')
        notDeployed.forEach((contract) => this.log(`- ${contract.name} (${contract.address})`))
      }

      if (notInitialized.length > 0) {
        this.log('\nContracts not initialized:')
        notInitialized.forEach((contract) => this.log(`- ${contract.name} (${contract.address})`))
      }

      if (notOwned.length > 0) {
        this.log('\nContracts without correct owner:')
        notInitialized.forEach((contract) => this.log(`- ${contract.name} (${contract.address})`))
      }

      if (notDeployed.length === 0 && notInitialized.length === 0 && notOwned.length === 0) {
        this.log('\nAll contracts are deployed, initialized and have owner set.')
      }
    } catch (error) {
      this.error(`Failed to check contracts: ${error}`)
    }
  }

  private async checkContractDeployment(
    provider: ethers.Provider,
    contracts: DeployedContract[],
    progressBar: cliProgress.SingleBar,
    notDeployed: DeployedContract[],
  ) {
    for (const c of contracts) {
      progressBar.update({name: `Checking ${c.name}...`})
      const code = await provider.getCode(c.address ?? '')
      if (code === '0x') {
        notDeployed.push(c)
      }

      progressBar.increment()
    }
  }

  private async checkContractInitialization(
    provider: ethers.Provider,
    contracts: DeployedContract[],
    progressBar: cliProgress.SingleBar,
    notInitialized: DeployedContract[],
  ) {
    for (const c of contracts) {
      progressBar.update({name: `Checking ${c.name}...`})
      try {
        const initCount = await provider.getStorage(c?.address || '', 0)
        if (parseInt(initCount) > 0) {
          notInitialized.push(c)
        }
      } catch (error) {
        this.error(`Error checking initialization for ${c.name}: ${error}`)
      }

      progressBar.increment()
    }
  }

  private async checkContractOwner(
    provider: ethers.Provider,
    contracts: DeployedContract[],
    progressBar: cliProgress.SingleBar,
    expectedOwner: string,
    notOwned: DeployedContract[],
  ) {
    const ownableABI = ['function owner() view returns (address)']

    for (const c of contracts) {
      progressBar.update({name: `Checking ${c.name}...`})
      if (c.owned && c.address) {
        const contract = new ethers.Contract(c.address, ownableABI, provider)
        try {
          const owner = await contract.owner()
          if (owner.toLowerCase() !== expectedOwner.toLowerCase()) {
            notOwned.push(c)
          }
        } catch (error) {
          this.error(`Error checking owner for ${c.name}: ${error}`)
        }
      }
      progressBar.increment()
    }
  }
}

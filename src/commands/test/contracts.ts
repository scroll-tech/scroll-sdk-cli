import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import * as cliProgress from 'cli-progress'
import {ethers} from 'ethers'
import path from 'node:path'

import {DeployedContract, Layer, contracts} from '../../data/contracts.js'
import {parseTomlConfig} from '../../utils/config-parser.js'
import {addressLink} from '../../utils/onchain/index.js'

interface ContractsConfig {
  [key: string]: string
}

export default class TestContracts extends Command {
  static description = 'Test contracts by checking deployment and initialization'

  static flags = {
    config: Flags.string({
      char: 'c',
      default: './config.toml',
      description: 'Path to config.toml file',
    }),
    contracts: Flags.string({
      char: 'n',
      default: './config-contracts.toml',
      description: 'Path to configs-contracts.toml file',
    }),
    pod: Flags.boolean({
      char: 'p',
      default: false,
      description: 'Run inside Kubernetes pod',
    }),
  }

  private blockExplorers: Record<Layer, {blockExplorerURI: string}> = {
    [Layer.L1]: {blockExplorerURI: ''},
    [Layer.L2]: {blockExplorerURI: ''},
  }

  private contractsConfig: ContractsConfig = {}

  // eslint-disable-next-line complexity
  async run(): Promise<void> {
    const {flags} = await this.parse(TestContracts)

    const configPath = path.resolve(flags.config)
    const contractsPath = path.resolve(flags.contracts)

    const config = parseTomlConfig(configPath)
    this.contractsConfig = parseTomlConfig(contractsPath)

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

    this.blockExplorers.l1.blockExplorerURI = config?.frontend?.EXTERNAL_EXPLORER_URI_L1
    this.blockExplorers.l2.blockExplorerURI = config?.frontend?.EXTERNAL_EXPLORER_URI_L2

    // Check if RPC URLs are defined
    if (!l1RpcUrl || !l2RpcUrl) {
      this.error(
        chalk.red(
          `Missing RPC URL(s) in ${configPath}. Please ensure L1_RPC_ENDPOINT and L2_RPC_ENDPOINT (for pod mode) or EXTERNAL_RPC_URI_L1 and EXTERNAL_RPC_URI_L2 (for non-pod mode) are defined.`,
        ),
      )
    }

    // Check if owner address is defined
    if (!owner) {
      this.error(chalk.red(`Missing OWNER_ADDR in ${configPath}. Please ensure it is defined in the accounts section.`))
    }

    // Check if contractsConfig is empty
    if (Object.keys(this.contractsConfig).length === 0) {
      this.error(
        chalk.red(
          `Contract configuration in ${contractsPath} is empty. Please ensure it contains the necessary contract addresses.`,
        ),
      )
    }

    const l1Provider = new ethers.JsonRpcProvider(l1RpcUrl)
    const l2Provider = new ethers.JsonRpcProvider(l2RpcUrl)

    // Check that config has a value for each required contract name

    const l1Addresses: DeployedContract[] = contracts
      .filter((contract) => contract.layer === Layer.L1)
      .map((contract) => {
        const address = this.contractsConfig[contract.name]
        if (!address) {
          this.log(chalk.yellow(`Missing address for contract: ${contract.name}`))
        }

        return {...contract, address}
      })
      .filter((contract: DeployedContract) => contract.address !== undefined)

    const l2Addresses: DeployedContract[] = contracts
      .filter((contract) => contract.layer === Layer.L2)
      .map((contract) => {
        const address = this.contractsConfig[contract.name]
        if (!address) {
          this.log(chalk.yellow(`Missing address for contract: ${contract.name}`))
        }

        return {...contract, address}
      })
      .filter((contract) => contract.address !== undefined)

    try {
      // Check Deployments

      const multibarDeployment = new cliProgress.MultiBar(
        {
          clearOnComplete: false,
          format: ' {bar} | {percentage}% | {value}/{total} | {name}',
          hideCursor: true,
        },
        cliProgress.Presets.shades_classic,
      )

      const l1BarDeploy = multibarDeployment.create(l1Addresses.length, 0, {name: 'Checking L1 contract deployment...'})
      const l2BarDeploy = multibarDeployment.create(l2Addresses.length, 0, {name: 'Checking L2 contract deployment...'})

      const notDeployed: DeployedContract[] = []

      await Promise.all([
        this.checkContractDeployment(l1Provider, l1Addresses, l1BarDeploy, notDeployed),
        this.checkContractDeployment(l2Provider, l2Addresses, l2BarDeploy, notDeployed),
      ])

      // Check Initializations

      const multibarInitialization = new cliProgress.MultiBar(
        {
          clearOnComplete: false,
          format: ' {bar} | {percentage}% | {value}/{total} | {name}',
          hideCursor: true,
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
          format: ' {bar} | {percentage}% | {value}/{total} | {name}',
          hideCursor: true,
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

      this.log(chalk.green('\nCorrectly configured contracts:'))
      for (const contract of correctlyConfigured) {
        let status = 'Deployed'
        if (contract.initializes) status += ', Initialized'
        if (contract.owned) status += ', Correctly Owned'
        // eslint-disable-next-line no-await-in-loop
        const link = await addressLink(
          contract.address!,
          this.blockExplorers[contract.layer === 'l1' ? Layer.L1 : Layer.L2],
        )
        this.log(`- ${chalk.cyan(contract.name)}\n     ${chalk.blue(link)}\n     Status: ${chalk.green(status)}`)
      }

      if (notDeployed.length > 0) {
        this.log(chalk.red('\nContracts not deployed:'))
        for (const contract of notDeployed) {
          // eslint-disable-next-line no-await-in-loop
          const link = await addressLink(
            contract.address!,
            this.blockExplorers[contract.layer === 'l1' ? Layer.L1 : Layer.L2],
          )
          this.log(chalk.red(`- ${contract.name}\n     ${chalk.blue(link)}`))
        }
      }

      if (notInitialized.length > 0) {
        this.log(chalk.yellow('\nContracts not initialized:'))
        for (const contract of notInitialized) {
          // eslint-disable-next-line no-await-in-loop
          const link = await addressLink(
            contract.address!,
            this.blockExplorers[contract.layer === 'l1' ? Layer.L1 : Layer.L2],
          )
          this.log(chalk.yellow(`- ${contract.name}\n     ${chalk.blue(link)}`))
        }
      }

      if (notOwned.length > 0) {
        this.log(chalk.yellow('\nContracts without correct owner:'))
        for (const contract of notOwned) {
          // eslint-disable-next-line no-await-in-loop
          const link = await addressLink(
            contract.address!,
            this.blockExplorers[contract.layer === 'l1' ? Layer.L1 : Layer.L2],
          )
          this.log(chalk.yellow(`- ${contract.name}\n     ${chalk.blue(link)}`))
        }
      }

      if (notDeployed.length === 0 && notInitialized.length === 0 && notOwned.length === 0) {
        this.log(chalk.green('\nAll contracts are deployed, initialized and have owner set.'))
      }
    } catch (error) {
      this.error(chalk.red(`Failed to check contracts: ${error}`))
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
      // eslint-disable-next-line no-await-in-loop
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
        if (!c.address) {
          throw new Error(`No address found for ${c.name}`)
        }

        // TODO: Look into L2_MESSAGE_QUEUE_ADDR initialization later
        if (c.name === 'L2_MESSAGE_QUEUE_ADDR') {
          continue
        }

        // eslint-disable-next-line no-await-in-loop
        const initCount = await provider.getStorage(c.address, 0)
        if (Number.parseInt(initCount, 16) <= 0) {
          notInitialized.push(c)
        }
      } catch (error) {
        this.error(`Error checking initialization for ${c.name}: ${error}`)
      }

      progressBar.increment()
    }
  }

  // eslint-disable-next-line max-params
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
          // eslint-disable-next-line no-await-in-loop
          const owner = await contract.owner()
          let expectedOwnerForContract = expectedOwner

          // Special case for L2_SCROLL_STANDARD_ERC20_FACTORY_ADDR
          if (c.name === 'L2_SCROLL_STANDARD_ERC20_FACTORY_ADDR') {
            expectedOwnerForContract = this.contractsConfig.L2_STANDARD_ERC20_GATEWAY_PROXY_ADDR
          }

          if (owner.toLowerCase() !== expectedOwnerForContract.toLowerCase()) {
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

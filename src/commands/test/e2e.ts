import { Args, Command, Flags } from '@oclif/core'
import { ethers } from 'ethers'
import { confirm, select, Separator } from '@inquirer/prompts'
import QRCode from 'qrcode'
import { parseTomlConfig } from '../../utils/config-parser.js'
import path from 'path'
import { getFinalizedBlockHeight, l1ETHGatewayABI, l2ETHGatewayABI, getCrossDomainMessageFromTx, getPendingQueueIndex, getGasOracleL2BaseFee, awaitTx, txLink } from '../../utils/onchain/index.js'
import { Wallet } from 'ethers'

interface ContractsConfig {
  [key: string]: string
}

enum Layer {
  L1 = 'l1',
  L2 = 'l2'
}

const FUNDING_AMOUNT = 0.004

export default class TestE2e extends Command {
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
    private_key: Flags.string({ char: 'k', description: 'Private key for funder wallet initialization' }),
    manual_fund: Flags.boolean({ char: 'm', description: 'Manually fund the test wallet.' }),
    skip_wallet_generation: Flags.boolean({ char: 's', description: 'Manually fund the test wallet.' }),
  }

  private l1Provider!: ethers.JsonRpcProvider
  private l2Provider!: ethers.JsonRpcProvider
  // private l1Provider!: ethers.JsonRpcApiProvider
  // private l2Provider!: ethers.JsonRpcApiProvider
  private wallet!: ethers.Wallet
  private fundingWallet!: ethers.Wallet
  private manualFunding: boolean = false
  private skipWalletGen: boolean = false
  private l1Rpc!: string
  private l2Rpc!: string
  private l1ETHGateway!: string
  private l2ETHGateway!: string
  private l1MessegeQueueProxyAddress!: string
  private bridgeApiUrl!: string

  private results: {
    bridgeFundsL1ToL2: {
      L1DepositETHTx?: string;
      L2ETHBridgeTx?: string;
    };
    deployERC20OnL1?: {
      address?: string;
      txHash?: string;
    };
    bridgeERC20L1ToL2?: {
      L2TxHash?: string;
    };
    deployERC20OnL2?: {
      address?: string;
      txHash?: string;
    };
    bridgeFundsL2ToL1: {
      L2DepositETHTx?: string;
    };
  } = {
      bridgeFundsL1ToL2: {},
      bridgeFundsL2ToL1: {}
    };


  public async run(): Promise<void> {
    const { flags } = await this.parse(TestE2e)

    const configPath = path.resolve(flags.config)
    const contractsPath = path.resolve(flags.contracts)
    this.manualFunding = flags.manual_fund;

    const config = parseTomlConfig(configPath)
    const contractsConfig: ContractsConfig = parseTomlConfig(contractsPath)

    // TODO: Grab important contracts and save them somewhere?

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

    // Check if RPC URLs are defined
    if (!l1RpcUrl || !l2RpcUrl) {
      this.error(`Missing RPC URL(s) in ${configPath}. Please ensure L1_RPC_ENDPOINT and L2_RPC_ENDPOINT (for pod mode) or EXTERNAL_RPC_URI_L1 and EXTERNAL_RPC_URI_L2 (for non-pod mode) are defined.`);
    }

    this.l1Rpc = l1RpcUrl
    this.l2Rpc = l2RpcUrl
    this.l1ETHGateway = contractsConfig.L1_ETH_GATEWAY_PROXY_ADDR
    this.l2ETHGateway = contractsConfig.L2_ETH_GATEWAY_PROXY_ADDR
    this.l1MessegeQueueProxyAddress = contractsConfig.L1_MESSAGE_QUEUE_PROXY_ADDR
    this.bridgeApiUrl = config.frontends.BRIDGE_API_URI
    this.skipWalletGen = flags.skip_wallet_generation

    this.l1Provider = new ethers.JsonRpcProvider(l1RpcUrl)
    this.l2Provider = new ethers.JsonRpcProvider(l2RpcUrl)

    if (flags.skip_wallet_generation) {
      this.wallet = new ethers.Wallet(flags.private_key ?? config.accounts.DEPLOYER_PRIVATE_KEY)
      this.log(`Skipping wallet generation, using: ${this.wallet.address}`)
    } else {

      if (flags.private_key) {
        this.fundingWallet = new ethers.Wallet(flags.private_key, this.l1Provider)
        this.log(`Funding Wallet: ${this.fundingWallet.address}`)
      } else if (config.accounts.DEPLOYER_PRIVATE_KEY && !flags.manual_fund) {
        this.log("No funding source found. Using DEPLOYER_PRIVATE_KEY.")
        this.fundingWallet = new ethers.Wallet(config.accounts.DEPLOYER_PRIVATE_KEY, this.l1Provider)
        this.log(`Funding Wallet: ${this.fundingWallet.address}`)
      } else {
        this.log("No Deploy private key found or provided. (Will prompt to fund L1 address manually.)")
      }

    }


    await this.runE2ETest()
  }

  private async runE2ETest(): Promise<void> {
    if (!this.skipWalletGen) {
      await this.generateNewWallet()
      await this.fundWalletOnL1()
    }
    // await this.bridgeFundsL1ToL2()
    // await this.deployERC20OnL1()
    // await this.bridgeERC20L1ToL2()
    await this.promptUserForL2Funding()
    await this.deployERC20OnL2()
    await this.bridgeFundsL2ToL1()
    await this.bridgeERC20L2ToL1()
    await this.claimFundsOnL1()
    await this.claimERC20OnL1()
  }

  // Generate a new random wallet to run all tests.
  private async generateNewWallet(): Promise<void> {
    const randomWallet = ethers.Wallet.createRandom()
    this.wallet = new ethers.Wallet(randomWallet.privateKey, this.l1Provider)
    this.log(`Generated new wallet: ${this.wallet.address}`)
    this.log(`Private Key: ${this.wallet.privateKey}`)
  }


  private async fundWalletOnL1(): Promise<void> {
    if (this.fundingWallet && !this.manualFunding) {
      this.log('Sending funds to new wallet...')
      await this.fundWalletWithEth();
      return
    }

    await this.promptManualFunding(this.wallet.address, FUNDING_AMOUNT, Layer.L1);

  }


  private async fundWalletWithEth(layer: Layer = Layer.L1): Promise<void> {
    const wallet = layer === Layer.L1 ? this.fundingWallet : new Wallet(this.fundingWallet.privateKey, this.l2Provider);
    const tx = await wallet.sendTransaction({
      to: this.wallet.address,
      value: ethers.parseEther(FUNDING_AMOUNT.toString())
    })
    await tx.wait()
    this.log(`Funded wallet with 0.05 ETH: ${tx.hash}`)
  }

  private async bridgeFundsL1ToL2(): Promise<void> {
    // Implement bridging funds from L1 to L2
    this.log('Bridging funds from L1 to L2')

    const amount = ethers.parseEther((FUNDING_AMOUNT / 2).toString());
    const gasLimit = BigInt(170000); // Adjust this value as needed
    // TODO: what's the best way to determine the gasLimit?

    const l2BaseFee = await getGasOracleL2BaseFee(this.l1Rpc, this.l1MessegeQueueProxyAddress)
    const value = ethers.parseEther((FUNDING_AMOUNT / 2 + 0.00002).toString());

    // Create the contract instance
    const l1ETHGateway = new ethers.Contract(this.l1ETHGateway, l1ETHGatewayABI, this.wallet.connect(this.l1Provider));

    try {
      // const value = amount + ethers.parseEther(`${gasLimit*l2BaseFee} wei`);
      this.log(`Depositing ${amount} by sending ${value} to ${await l1ETHGateway.getAddress()}`)

      const tx = await l1ETHGateway.depositETH(amount, gasLimit, { value });
      this.results.bridgeFundsL1ToL2.L1DepositETHTx = tx.hash

      this.log(`Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      const blockNumber = receipt?.blockNumber;

      this.log(`Transaction mined in block: ${blockNumber}`);

      const { l2TxHash, queueIndex } = await getCrossDomainMessageFromTx(tx.hash, this.l1Rpc, this.l1MessegeQueueProxyAddress);
      this.results.bridgeFundsL1ToL2.L2ETHBridgeTx = l2TxHash

      this.log(`Waiting for the following tx on L2: ${l2TxHash}`);

      let isFinalized = false;
      while (!isFinalized) {

        const finalizedBlockNumber = await getFinalizedBlockHeight(this.l1Rpc);

        if (blockNumber >= finalizedBlockNumber) {
          isFinalized = true;
          this.log(`Block ${blockNumber} is finalized. Bridging should be completed soon.`);
        } else {
          // TODO: This doesn't work on Sepolia? Look into it.
          this.log(`Waiting for block ${blockNumber} to be finalized, current height is ${finalizedBlockNumber}`);
        }

        const queueHeight = await getPendingQueueIndex(this.l1Rpc, this.l1MessegeQueueProxyAddress);

        this.log(`Current bridge queue position is ${queueHeight}, pending tx is position ${queueIndex}`)

        // await new Promise(resolve => setTimeout(resolve, 20000)); // Wait for 10 seconds -- todo, communicate this better and detect better
      }
    } catch (error) {
      this.error(`Error bridging funds: ${error}`);
    }

    // Now that the block is finalized, check L2 for the l2TxHash every 20 seconds.
    const l2TxHash = this.results.bridgeFundsL1ToL2.L2ETHBridgeTx || "";
    const l2TxLink = txLink(l2TxHash, { rpc: this.l2Provider })

    this.log(`Waiting for ${l2TxLink}...`)
    const l2TxReceipt = await awaitTx(l2TxHash, this.l2Provider)

    this.log(`${JSON.stringify(l2TxReceipt)}`)

  }

  private async deployERC20OnL1(): Promise<void> {
    // Implement deploying ERC20 on L1
    this.log('Deploying ERC20 on L1')
  }

  private async bridgeERC20L1ToL2(): Promise<void> {
    // Implement bridging ERC20 from L1 to L2
    this.log('Bridging ERC20 from L1 to L2')
  }

  private async promptUserForL2Funding(): Promise<void> {

    const funderBalance = this.fundingWallet ? await this.l2Provider.getBalance(this.fundingWallet.address) : 0n;

    const answer = await select({
      message: 'Wait for Bridge to complete or directly funds on L2?',
      choices: [
        {
          name: 'Bridge',
          value: 'bridge',
          description: 'Wait for bridge tx to complete.',
        },
        new Separator(),
        {
          name: 'L1 Funder',
          value: 'funder',
          description: 'Use the deployer or funding wallet private key.',
          disabled: funderBalance < FUNDING_AMOUNT / 2,
        },
        {
          name: 'Manual Funding',
          value: 'manual',
          description: 'Use your own wallet to fund the address.'
        },
      ],
    });


    // if (response.action === 'Directly fund L2 wallet') {
    if (answer !== "bridge") {
      // Implement direct L2 wallet funding
      await this.fundWalletOnL2(answer)
    } else {
      // TODO: handle some async stuff in parallel
      this.log(`Waiting for bridge to complete...This isn't implemented yet.`)
    }
  }

  private async fundWalletOnL2(answer: string): Promise<void> {
    if (this.fundingWallet && answer === "funder") {
      this.log('Sending funds to new wallet...')
      await this.fundWalletWithEth(Layer.L2);
      return
    }

    await this.promptManualFunding(this.wallet.address, FUNDING_AMOUNT / 2, Layer.L2);

  }

  private async deployERC20OnL2(): Promise<void> {
    // Implement deploying ERC20 on L2
    this.log('Deploying ERC20 on L2')
  }

  private async bridgeFundsL2ToL1(): Promise<void> {

    this.log('Bridging funds from L2 to L1')

    const amount = ethers.parseEther((FUNDING_AMOUNT / 4).toString());

    const value = ethers.parseEther((FUNDING_AMOUNT / 2 + 0.00002).toString());

    // Create the contract instance
    const l2ETHGateway = new ethers.Contract(this.l2ETHGateway, l2ETHGatewayABI, this.wallet.connect(this.l2Provider));

    try {
      // const value = amount + ethers.parseEther(`${gasLimit*l2BaseFee} wei`);
      this.log(`Withdrawing ${amount} by sending ${value} to ${await l2ETHGateway.getAddress()}`)

      const tx = await l2ETHGateway.withdrawETH(amount, 0, { value });
      this.results.bridgeFundsL2ToL1.L2DepositETHTx = tx.hash

      this.log(`Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      const blockNumber = receipt?.blockNumber;

      this.log(`Transaction mined in block: ${blockNumber}`);

      const { l2TxHash, queueIndex } = await getCrossDomainMessageFromTx(tx.hash, this.l1Rpc, this.l1MessegeQueueProxyAddress);
      this.results.bridgeFundsL1ToL2.L2ETHBridgeTx = l2TxHash

      this.log(`Waiting for the following tx on L2: ${l2TxHash}`);

      let isFinalized = false;
      while (!isFinalized) {

        const finalizedBlockNumber = await getFinalizedBlockHeight(this.l1Rpc);

        if (blockNumber >= finalizedBlockNumber) {
          isFinalized = true;
          this.log(`Block ${blockNumber} is finalized. Bridging should be completed soon.`);
        } else {
          // TODO: This doesn't work on Sepolia? Look into it.
          this.log(`Waiting for block ${blockNumber} to be finalized, current height is ${finalizedBlockNumber}`);
        }

        const queueHeight = await getPendingQueueIndex(this.l1Rpc, this.l1MessegeQueueProxyAddress);

        this.log(`Current bridge queue position is ${queueHeight}, pending tx is position ${queueIndex}`)

        // await new Promise(resolve => setTimeout(resolve, 20000)); // Wait for 10 seconds -- todo, communicate this better and detect better
      }
    } catch (error) {
      this.error(`Error bridging funds: ${error}`);
    }

    // Now that the block is finalized, check L2 for the l2TxHash every 20 seconds.
    const l2TxHash = this.results.bridgeFundsL1ToL2.L2ETHBridgeTx || "";
    const l2TxLink = txLink(l2TxHash, { rpc: this.l2Provider })

    this.log(`Waiting for ${l2TxLink}...`)
    const l2TxReceipt = await awaitTx(l2TxHash, this.l2Provider)

    this.log(`${JSON.stringify(l2TxReceipt)}`)

  }

  private async bridgeERC20L2ToL1(): Promise<void> {
    // Implement bridging ERC20 from L2 to L1
    this.log('Bridging ERC20 from L2 to L1')
  }

  private async claimFundsOnL1(): Promise<void> {
    // Implement claiming funds on L1
    this.log('Claiming funds on L1')
  }

  private async claimERC20OnL1(): Promise<void> {
    // Implement claiming ERC20 on L1
    this.log('Claiming ERC20 on L1')
  }

  private async promptManualFunding(address: string, amount: number, layer: Layer) {

    let chainId = layer === Layer.L1 ? (await this.l1Provider.getNetwork()).chainId : (await this.l2Provider.getNetwork()).chainId
    let qrString = ""
    qrString += "ethereum:"
    qrString += address
    qrString += "@"
    qrString += chainId
    qrString += "&value="
    qrString += amount / 2

    this.log(`Please fund the following address with ${amount} ETH:`);
    this.log(address);
    this.log('\n');
    this.log("ChainID:", Number(chainId));
    this.log("Chain RPC:", layer === Layer.L1 ? this.l1Rpc : this.l2Rpc);
    this.log('\n');
    this.log('Scan this QR code to fund the address:');

    this.log(await QRCode.toString(qrString, { type: 'terminal', small: true }))

    let funded = false;

    while (!funded) {

      const answer = await confirm({ message: 'Done?' });

      this.log(`Checking...`)
      // Check if wallet is actually funded -- if not, we'll loop.

      let balance = layer === Layer.L1 ? await this.l1Provider.getBalance(address) : await this.l2Provider.getBalance(address);
      let formattedBalance = ethers.formatEther(balance);

      if (parseFloat(formattedBalance) >= amount) {
        this.log(`Wallet Balance: ${formattedBalance}`)
        funded = true;
      } else {
        this.log(`Balance is only ${formattedBalance}. Please fund the wallet.`)
      }

    }
  }
}
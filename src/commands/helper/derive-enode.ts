import { Command, Args } from '@oclif/core'
import chalk from 'chalk'
import { ethers } from 'ethers'

export default class HelperDeriveEnode extends Command {
  static description = 'Derive enode and L2_GETH_STATIC_PEERS from a nodekey'

  static examples = [
    '<%= config.bin %> <%= command.id %> 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  ]

  static args = {
    nodekey: Args.string({
      description: 'Nodekey of the geth ethereum node',
      required: true,
    }),
  }

  private nodeKeyToEnodeId(nodeKey: string): string {
    // Remove '0x' prefix if present
    nodeKey = nodeKey.startsWith('0x') ? nodeKey.slice(2) : nodeKey;

    // Create a Wallet instance from the private key
    const wallet = new ethers.Wallet(nodeKey);

    // Get the public key
    const publicKey = wallet.signingKey.publicKey;

    // Remove '0x04' prefix from public key
    const publicKeyNoPrefix = publicKey.slice(4);

    // The enode ID is the uncompressed public key without the '04' prefix
    return publicKeyNoPrefix;
  }

  public async run(): Promise<void> {
    const { args } = await this.parse(HelperDeriveEnode)
    const nodekey = args.nodekey

    if (!/^[0-9a-fA-F]{64}$/.test(nodekey)) {
      this.error(chalk.red('Invalid nodekey format. It should be a 64-character hexadecimal string.'))
    }

    try {
      const enodeId = this.nodeKeyToEnodeId(nodekey)
      const enode = `enode://${enodeId}@l2-sequencer-1:30303`
      const configEntry = `L2_GETH_STATIC_PEERS = '["enode://${enodeId}@l2-sequencer-1:30303"]'`

      this.log(chalk.cyan('Enode:'))
      this.log(chalk.green(enode))
      this.log('')
      this.log(chalk.cyan('Config.toml entry:'))
      this.log(chalk.green(configEntry))
      this.log('')
      this.log(chalk.yellow('Note: You may need to change "l2-sequencer-1" to the appropriate hostname or IP address.'))
    } catch (error) {
      this.error(chalk.red(`Failed to derive enode: ${error}`))
    }
  }
}

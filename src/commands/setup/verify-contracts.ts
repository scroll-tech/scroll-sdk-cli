import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import { select } from '@inquirer/prompts'
import Docker from 'dockerode'

export default class ContractsVerification extends Command {
  static override description = 'Set up contracts verification'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --image-tag verify-64934888f4cd002e77414a8e62812f70c00c5937',
  ]

  static override flags = {
    'image-tag': Flags.string({
      description: 'Specify the Docker image tag to use',
      required: false,
    }),
  }

  private async fetchDockerTags(): Promise<string[]> {
    try {
      const response = await fetch(
        'https://registry.hub.docker.com/v2/repositories/scrolltech/scroll-stack-contracts/tags?page_size=100',
      )
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      return data.results.map((tag: any) => tag.name).filter((tag: string) => tag.startsWith('verify'))
    } catch (error) {
      this.error(`Failed to fetch Docker tags: ${error}`)
    }
  }

  private async getDockerImageTag(providedTag: string | undefined): Promise<string> {
    const defaultTag = 'verify-64934888f4cd002e77414a8e62812f70c00c5937'

    if (!providedTag) {
      return defaultTag
    }

    const tags = await this.fetchDockerTags()

    if (providedTag.startsWith('gen-configs-v') && tags.includes(providedTag)) {
      return providedTag
    } else if (providedTag.startsWith('v') && tags.includes(`verify-${providedTag}`)) {
      return `verify-${providedTag}`
    } else if (/^\d+\.\d+\.\d+$/.test(providedTag) && tags.includes(`verify-v${providedTag}`)) {
      return `verify-v${providedTag}`
    }

    const selectedTag = await select({
      message: 'Select a Docker image tag:',
      choices: tags.map((tag) => ({name: tag, value: tag})),
    })

    return selectedTag
  }

  private async runDockerCommand(imageTag: string): Promise<void> {
    const docker = new Docker()
    const image = `scrolltech/scroll-stack-contracts:${imageTag}`

    try {
      this.log(chalk.cyan('Pulling Docker Image...'))
      // Pull the image if it doesn't exist locally
      const pullStream = await docker.pull(image)
      await new Promise((resolve, reject) => {
        docker.modem.followProgress(pullStream, (err, res) => {
          if (err) {
            reject(err)
          } else {
            this.log(chalk.green('Image pulled successfully'))
            resolve(res)
          }
        })
      })

      this.log(chalk.cyan('Creating Docker Container...'))
      // Create and run the container
      const container = await docker.createContainer({
        Image: image,
        Cmd: [], // Add any command if needed
        HostConfig: {
          Binds: [`${process.cwd()}:/contracts/volume`],
        },
      })

      this.log(chalk.cyan('Starting Container'))
      await container.start()

      // Wait for the container to finish and get the logs
      const stream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
      })

      // Print the logs
      stream.pipe(process.stdout)

      // Wait for the container to finish
      await new Promise((resolve) => {
        container.wait((err, data) => {
          if (err) {
            this.error(`Container exited with error: ${err}`)
          } else if (data.StatusCode !== 0) {
            this.error(`Container exited with status code: ${data.StatusCode}`)
          }
          resolve(null)
        })
      })

      // Remove the container
      await container.remove()
    } catch (error) {
      this.error(`Failed to run Docker command: ${error}`)
    }
  }

  public async run(): Promise<void> {
    this.log(chalk.blue('Running docker command to contracts verification...'))

    const {flags} = await this.parse(ContractsVerification)

    const imageTag = await this.getDockerImageTag(flags['image-tag'])
    this.log(chalk.blue(`Using Docker image tag: ${imageTag}`))

    await this.runDockerCommand(imageTag)
  }
}

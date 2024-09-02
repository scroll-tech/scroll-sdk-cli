import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export default class TestDependencies extends Command {
  static override description = 'Check for required dependencies'

  static override flags = {
    dev: Flags.boolean({ char: 'd', description: 'Include development dependencies' }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(TestDependencies)

    const dependencies = [
      { command: 'docker --version', name: 'Docker' },
      { command: 'kubectl version --client', name: 'Kubectl' },
      { command: 'helm version --short', name: 'Helm' },
    ]

    if (flags.dev) {
      dependencies.push(
        { command: 'minikube version', name: 'Minikube' }
      )
    }

    let allFound = true
    const foundDependencies: string[] = []
    const missingDependencies: string[] = []

    for (const dep of dependencies) {
      // eslint-disable-next-line no-await-in-loop
      const found = await this.checkDependency(dep.command)
      if (found) {
        foundDependencies.push(dep.name)
      } else {
        allFound = false
        missingDependencies.push(dep.name)
      }
    }

    this.log(chalk.cyan('\nDependency Check Results:'))

    if (foundDependencies.length > 0) {
      this.log(chalk.green('\n✅ Found Dependencies:'))
      for (const dep of foundDependencies) {
        this.log(chalk.green(`  • ${dep}`))
      }
    }

    if (missingDependencies.length > 0) {
      this.log(chalk.yellow('\n❌ Missing Dependencies:'))
      for (const dep of missingDependencies) {
        this.log(chalk.yellow(`  • ${dep}`))
        this.log(chalk.gray(`    To install: ${this.getInstallInstructions(dep)}`))
      }
    }

    if (allFound) {
      this.log(chalk.green('\n🎉 All required dependencies are installed.'))
    } else {
      this.log(chalk.yellow('\n⚠️  Some dependencies are missing. Please install them to ensure full functionality.'))
    }
  }

  private async checkDependency(command: string): Promise<boolean> {
    try {
      await execAsync(command)
      return true
    } catch {
      return false
    }
  }

  private getInstallInstructions(name: string): string {
    const instructions: { [key: string]: string } = {
      Cast: 'brew install cast || https://book.getfoundry.sh/getting-started/installation',
      Docker: 'brew install --cask docker || https://docs.docker.com/get-docker/',
      Helm: 'brew install helm || https://helm.sh/docs/intro/install/',
      Kubectl: 'brew install kubectl || https://kubernetes.io/docs/tasks/tools/',
      Minikube: 'brew install minikube || https://minikube.sigs.k8s.io/docs/start/',
    }
    return instructions[name] || `Please refer to ${name}'s official documentation for installation instructions.`
  }
}

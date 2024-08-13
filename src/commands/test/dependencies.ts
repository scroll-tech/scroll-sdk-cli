import {Command, Flags} from '@oclif/core'
import {exec} from 'child_process'
import {promisify} from 'util'

const execAsync = promisify(exec)

export default class TestDependencies extends Command {
  static override description = 'Check for required dependencies'

  static override flags = {
    dev: Flags.boolean({char: 'd', description: 'Include development dependencies'}),
  }

  private async checkDependency(command: string): Promise<boolean> {
    try {
      await execAsync(command)
      return true
    } catch (error) {
      return false
    }
  }

  private getInstallInstructions(name: string): string {
    const instructions: {[key: string]: string} = {
      Docker: 'brew install --cask docker || https://docs.docker.com/get-docker/',
      Kubectl: 'brew install kubectl || https://kubernetes.io/docs/tasks/tools/',
      Minikube: 'brew install minikube || https://minikube.sigs.k8s.io/docs/start/',
      Helm: 'brew install helm || https://helm.sh/docs/intro/install/',
      Cast: 'brew install cast || https://book.getfoundry.sh/getting-started/installation',
    }
    return instructions[name] || `Please refer to ${name}'s official documentation for installation instructions.`
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(TestDependencies)

    const dependencies = [
      {name: 'Docker', command: 'docker --version'},
      {name: 'Kubectl', command: 'kubectl version --client'},
      {name: 'Minikube', command: 'minikube version'},
      {name: 'Helm', command: 'helm version --short'},
    ]

    if (flags.dev) {
      dependencies.push({name: 'Cast', command: 'cast --version'})
    }

    let allFound = true

    for (const dep of dependencies) {
      const found = await this.checkDependency(dep.command)
      if (!found) {
        allFound = false
        this.log(`${dep.name} not found. To install:`)
        this.log(this.getInstallInstructions(dep.name))
        this.log('')
      }
    }

    if (allFound) {
      this.log('All required dependencies are installed.')
    }
  }
}
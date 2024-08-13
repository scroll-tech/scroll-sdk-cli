import {expect} from 'chai'
import {runCommand} from '@oclif/test'

describe('test:dependencies', () => {
  it('runs test:dependencies and reports only missing dependencies', async () => {
    const {stdout} = await runCommand(['test:dependencies'])
    if (stdout.includes('not found')) {
      expect(stdout).to.contain('To install:')
      expect(stdout).to.contain('brew install')
    } else {
      expect(stdout).to.contain('All required dependencies are installed.')
    }
    expect(stdout).to.not.contain('Cast')
  })

  it('runs test:dependencies with --dev flag and includes Cast', async () => {
    const {stdout} = await runCommand(['test:dependencies', '--dev'])
    if (stdout.includes('not found')) {
      expect(stdout).to.contain('To install:')
      expect(stdout).to.contain('brew install')
    } else {
      expect(stdout).to.contain('All required dependencies are installed.')
    }
    if (stdout.includes('Cast not found')) {
      expect(stdout).to.contain('Cast')
    }
  })
})
import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('helper:fund_devnet', () => {
  it('runs helper:fund_devnet cmd', async () => {
    const {stdout} = await runCommand('helper:fund_devnet')
    expect(stdout).to.contain('hello world')
  })

  it('runs helper:fund_devnet --name oclif', async () => {
    const {stdout} = await runCommand('helper:fund_devnet --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
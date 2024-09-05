import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('helper:clear-accounts', () => {
  it('runs helper:clear-accounts cmd', async () => {
    const {stdout} = await runCommand('helper:clear-accounts')
    expect(stdout).to.contain('hello world')
  })

  it('runs helper:clear-accounts --name oclif', async () => {
    const {stdout} = await runCommand('helper:clear-accounts --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})

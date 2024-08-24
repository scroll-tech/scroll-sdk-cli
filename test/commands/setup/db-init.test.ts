import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('setup:db-init', () => {
  it('runs setup:db-init cmd', async () => {
    const {stdout} = await runCommand('setup:db-init')
    expect(stdout).to.contain('hello world')
  })

  it('runs setup:db-init --name oclif', async () => {
    const {stdout} = await runCommand('setup:db-init --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})

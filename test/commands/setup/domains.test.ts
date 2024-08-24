import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('setup:domains', () => {
  it('runs setup:domains cmd', async () => {
    const {stdout} = await runCommand('setup:domains')
    expect(stdout).to.contain('hello world')
  })

  it('runs setup:domains --name oclif', async () => {
    const {stdout} = await runCommand('setup:domains --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})

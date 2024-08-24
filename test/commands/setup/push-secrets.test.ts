import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('setup:push-secrets', () => {
  it('runs setup:push-secrets cmd', async () => {
    const {stdout} = await runCommand('setup:push-secrets')
    expect(stdout).to.contain('hello world')
  })

  it('runs setup:push-secrets --name oclif', async () => {
    const {stdout} = await runCommand('setup:push-secrets --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})

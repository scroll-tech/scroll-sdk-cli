import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('setup:tls', () => {
  it('runs setup:tls cmd', async () => {
    const {stdout} = await runCommand('setup:tls')
    expect(stdout).to.contain('hello world')
  })

  it('runs setup:tls --name oclif', async () => {
    const {stdout} = await runCommand('setup:tls --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})

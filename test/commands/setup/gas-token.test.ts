import { runCommand } from '@oclif/test'
import { expect } from 'chai'

describe('setup:gas-token', () => {
  it('runs setup:gas cmd', async () => {
    const { stdout } = await runCommand('setup:gas-token')
    expect(stdout).to.contain('hello world')
  })

  it('runs setup:gas --name oclif', async () => {
    const { stdout } = await runCommand('setup:gas-token --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})

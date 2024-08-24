import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('setup:configs', () => {
  it('runs setup:configs cmd', async () => {
    const {stdout} = await runCommand('setup:configs')
    expect(stdout).to.contain('hello world')
  })

  it('runs setup:configs --name oclif', async () => {
    const {stdout} = await runCommand('setup:configs --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})

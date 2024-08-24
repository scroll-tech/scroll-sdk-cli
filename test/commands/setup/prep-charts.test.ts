import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('setup:prep-charts', () => {
  it('runs setup:prep-charts cmd', async () => {
    const {stdout} = await runCommand('setup:prep-charts')
    expect(stdout).to.contain('hello world')
  })

  it('runs setup:prep-charts --name oclif', async () => {
    const {stdout} = await runCommand('setup:prep-charts --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})

import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('helper:l1_activity', () => {
  it('runs helper:l1_activity cmd', async () => {
    const {stdout} = await runCommand('helper:l1_activity')
    expect(stdout).to.contain('hello world')
  })

  it('runs helper:l1_activity --name oclif', async () => {
    const {stdout} = await runCommand('helper:l1_activity --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})

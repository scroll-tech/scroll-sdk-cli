import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('helper:derive-enode', () => {
  it('runs helper:derive-enode cmd', async () => {
    const {stdout} = await runCommand('helper:derive-enode')
    expect(stdout).to.contain('hello world')
  })

  it('runs helper:derive-enode --name oclif', async () => {
    const {stdout} = await runCommand('helper:derive-enode --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})

import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('helper:set-scalars', () => {
  it('runs helper:set-scalars cmd', async () => {
    const {stdout} = await runCommand('helper:set-scalars')
    expect(stdout).to.contain('hello world')
  })

  it('runs helper:set-scalars --name oclif', async () => {
    const {stdout} = await runCommand('helper:set-scalars --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})

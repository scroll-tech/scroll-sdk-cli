import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('test:e2e', () => {
  it('runs test:e2e cmd', async () => {
    const {stdout} = await runCommand('test:e2e')
    expect(stdout).to.contain('hello world')
  })

  it('runs test:e2e --name oclif', async () => {
    const {stdout} = await runCommand('test:e2e --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})

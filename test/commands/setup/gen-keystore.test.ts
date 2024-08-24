import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('setup:gen-keystore', () => {
  it('runs setup:gen-keystore cmd', async () => {
    const {stdout} = await runCommand('setup:gen-keystore')
    expect(stdout).to.contain('hello world')
  })

  it('runs setup:gen-keystore --name oclif', async () => {
    const {stdout} = await runCommand('setup:gen-keystore --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})

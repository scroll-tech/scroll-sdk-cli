import {expect} from 'chai'
import {runCommand} from '@oclif/test'

describe('test:ingress', () => {
  it('runs test:ingress and lists ingress hosts', async () => {
    const {stdout} = await runCommand(['test:ingress'])
    expect(stdout).to.contain("Found ingress hosts in namespace 'default':")
    expect(stdout).to.contain('blockscout')
    expect(stdout).to.contain('bridge-history-api')
    expect(stdout).to.contain('frontends')
    expect(stdout).to.contain('grafana')
    expect(stdout).to.contain('l2-rpc')
    expect(stdout).to.contain('rollup-explorer-backend')
    expect(stdout).to.not.contain('l1-devnet')
    expect(stdout).to.not.contain('l1-explorer')
  })

  it('runs test:ingress with --dev flag and includes development ingresses', async () => {
    const {stdout} = await runCommand(['test:ingress', '--dev'])
    expect(stdout).to.contain("Found ingress hosts in namespace 'default':")
    expect(stdout).to.contain('blockscout')
    expect(stdout).to.contain('bridge-history-api')
    expect(stdout).to.contain('frontends')
    expect(stdout).to.contain('grafana')
    expect(stdout).to.contain('l2-rpc')
    expect(stdout).to.contain('rollup-explorer-backend')
    expect(stdout).to.contain('l1-devnet')
    expect(stdout).to.contain('l1-explorer')
  })

  it('runs test:ingress with custom namespace', async () => {
    const {stdout} = await runCommand(['test:ingress', '--namespace', 'custom-namespace'])
    expect(stdout).to.contain("Found ingress hosts in namespace 'custom-namespace':")
  })

  it('reports missing ingress hosts', async () => {
    const {stdout} = await runCommand(['test:ingress'])
    if (stdout.includes('Missing ingress hosts:')) {
      expect(stdout).to.contain('Some required ingress hosts are missing!')
    } else {
      expect(stdout).to.contain('All required ingress hosts are present.')
    }
  })

  it('checks connectivity to ingress hosts', async () => {
    const {stdout} = await runCommand(['test:ingress'])
    expect(stdout).to.contain('Checking connectivity to ingress hosts:')
    if (stdout.includes('is not reachable or did not return a 200 status')) {
      expect(stdout).to.contain('is not reachable or did not return a 200 status')
    }
  })
})
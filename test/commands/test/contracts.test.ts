import {expect} from 'chai'
import {runCommand} from '@oclif/test'
import * as sinon from 'sinon'
import * as ethers from 'ethers'
import * as configParser from '../../../src/utils/config-parser.js'
import fs from 'fs'
import cliProgress from 'cli-progress'

describe('test:contracts', () => {
  let getCodeStub: sinon.SinonStub
  let parseTomlConfigStub: sinon.SinonStub
  let fsExistsSyncStub: sinon.SinonStub
  let contractStub: sinon.SinonStub
  let multiBarStub: sinon.SinonStub

  beforeEach(() => {
    getCodeStub = sinon.stub(ethers.JsonRpcProvider.prototype, 'getCode')
    getCodeStub.resolves('0x123456') // Non-empty bytecode

    contractStub = sinon.stub(ethers, 'Contract')
    contractStub.returns({
      initialized: sinon.stub().resolves(true)
    })

    parseTomlConfigStub = sinon.stub(configParser, 'parseTomlConfig')
    parseTomlConfigStub.returns({
      L1_CONTRACT_1: '0x1111111111111111111111111111111111111111',
      L1_CONTRACT_2: '0x2222222222222222222222222222222222222222',
      L2_CONTRACT_1: '0x3333333333333333333333333333333333333333',
      L2_CONTRACT_2: '0x4444444444444444444444444444444444444444',
      L2_GAS_PRICE_ORACLE_IMPLEMENTATION_ADDR: '0x8Da0c9d391Bc1B8456341e74c8cD90ED1d21E20D',
      L2_GAS_PRICE_ORACLE_PROXY_ADDR: '0x247969F4fad93a33d4826046bc3eAE0D36BdE548',
      L1_GAS_PRICE_ORACLE_ADDR: '0x5300000000000000000000000000000000000002',
      general: {
        L1_RPC_ENDPOINT: 'http://l1.example.com',
        L2_RPC_ENDPOINT: 'http://l2.example.com',
      },
      frontend: {
        EXTERNAL_RPC_URI_L1: 'http://external-l1.example.com',
        EXTERNAL_RPC_URI_L2: 'http://external-l2.example.com',
      },
    })

    fsExistsSyncStub = sinon.stub(fs, 'existsSync').returns(true)

    multiBarStub = sinon.stub(cliProgress, 'MultiBar')
    multiBarStub.returns({
      create: sinon.stub().returns({
        increment: sinon.stub(),
        update: sinon.stub().callsFake((value: number, options: any) => {}),
        value: 0,
      }),
      stop: sinon.stub(),
    })
  })

  afterEach(() => {
    sinon.restore()
  })

  it('reports all contracts deployed and initialized', async () => {
    const {stdout} = await runCommand(['test:contracts'])
    expect(stdout).to.contain('All contracts are deployed and initialized.')
  })

  it('reports undeployed contracts with addresses', async () => {
    getCodeStub.onFirstCall().resolves('0x')
    const {stdout} = await runCommand(['test:contracts'])
    expect(stdout).to.contain('Contracts not deployed:')
    expect(stdout).to.contain('L1_CONTRACT_1 (0x1111111111111111111111111111111111111111)')
  })

  it('reports uninitialized contracts with addresses', async () => {
    contractStub.returns({
      initialized: sinon.stub().resolves(false)
    })
    const {stdout} = await runCommand(['test:contracts'])
    expect(stdout).to.contain('Contracts not initialized:')
    expect(stdout).to.match(/L1_CONTRACT_\d \(0x[0-9a-fA-F]{40}\)/)
  })

  it('runs with --pod flag', async () => {
    await runCommand(['test:contracts', '--pod'])
    expect(parseTomlConfigStub.calledTwice).to.be.true
  })

  it('runs with custom config paths', async () => {
    await runCommand([
      'test:contracts',
      '--config', './custom-config.toml',
      '--contracts', './custom-contracts.toml',
    ])
    expect(parseTomlConfigStub.calledWith(sinon.match(/custom-config\.toml$/))).to.be.true
    expect(parseTomlConfigStub.calledWith(sinon.match(/custom-contracts\.toml$/))).to.be.true
  })

  it('correctly sorts L1 and L2 contracts', async () => {
    const testInstance = new TestContracts([], {})
    // @ts-ignore: Accessing private method for testing
    const runMethod = testInstance.run.bind(testInstance)
    
    // Mock the providers and other methods
    const l1ProviderStub = sinon.createStubInstance(ethers.JsonRpcProvider)
    const l2ProviderStub = sinon.createStubInstance(ethers.JsonRpcProvider)
    sinon.stub(ethers, 'JsonRpcProvider')
      .onFirstCall().returns(l1ProviderStub)
      .onSecondCall().returns(l2ProviderStub)
    
    sinon.stub(testInstance, 'checkContracts').resolves()
    
    await runMethod()
    
    // Check that L2_GAS_PRICE_ORACLE contracts are checked on L1
    expect(testInstance.checkContracts.firstCall.args[1]).to.deep.include(['L2_GAS_PRICE_ORACLE_IMPLEMENTATION_ADDR', '0x8Da0c9d391Bc1B8456341e74c8cD90ED1d21E20D'])
    expect(testInstance.checkContracts.firstCall.args[1]).to.deep.include(['L2_GAS_PRICE_ORACLE_PROXY_ADDR', '0x247969F4fad93a33d4826046bc3eAE0D36BdE548'])
    
    // Check that L1_GAS_PRICE_ORACLE is checked on L2
    expect(testInstance.checkContracts.secondCall.args[1]).to.deep.include(['L1_GAS_PRICE_ORACLE_ADDR', '0x5300000000000000000000000000000000000002'])
    
    // Check that L1_GAS_PRICE_ORACLE is not checked on L1
    expect(testInstance.checkContracts.firstCall.args[1]).to.not.deep.include(['L1_GAS_PRICE_ORACLE_ADDR', '0x5300000000000000000000000000000000000002'])
  })
})
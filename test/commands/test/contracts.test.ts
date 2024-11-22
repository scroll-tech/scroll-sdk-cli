import { expect } from 'chai';
import sinon from 'sinon';
import { Config } from '@oclif/core';
import { JsonRpcProvider, Contract } from 'ethers';
import * as configParser from '../../../src/utils/config-parser.js';
import TestContracts from '../../../src/commands/test/contracts.js';

const mockConfig: Config = {
  // Add minimum required properties
  root: '/mock/root',
  name: 'mock-cli',
  version: '1.0.0',
  // Add other required properties as needed
} as Config;

describe('TestContracts', () => {
  let parseTomlConfigStub: sinon.SinonStub;
  let providerStub: sinon.SinonStubbedInstance<JsonRpcProvider>;
  let contractStub: sinon.SinonStubbedInstance<Contract>;

  beforeEach(() => {
    parseTomlConfigStub = sinon.stub(configParser, 'parseTomlConfig');
    providerStub = sinon.createStubInstance(JsonRpcProvider);
    contractStub = sinon.createStubInstance(Contract);

    parseTomlConfigStub.returns({
      L1_CONTRACT: '0x1111111111111111111111111111111111111111',
      L2_CONTRACT: '0x2222222222222222222222222222222222222222',
      L2_GAS_PRICE_ORACLE_IMPLEMENTATION_ADDR: '0x3333333333333333333333333333333333333333',
      L2_GAS_PRICE_ORACLE_PROXY_ADDR: '0x4444444444444444444444444444444444444444',
      L1_GAS_PRICE_ORACLE_ADDR: '0x5555555555555555555555555555555555555555',
      general: {
        L1_RPC_ENDPOINT: 'http://l1.example.com',
        L2_RPC_ENDPOINT: 'http://l2.example.com',
      },
    });

    sinon.stub(JsonRpcProvider, 'from' as keyof typeof JsonRpcProvider).returns(providerStub);
    sinon.stub(Contract, 'from' as keyof typeof Contract).returns(contractStub);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should correctly initialize providers', async () => {
    const testContracts = new TestContracts([], mockConfig);
    await testContracts.run();

    expect(JsonRpcProvider.from).to.have.been.calledTwice;
    expect(JsonRpcProvider.from).to.have.been.calledWith('http://l1.example.com');
    expect(JsonRpcProvider.from).to.have.been.calledWith('http://l2.example.com');
  });

  it('should check contract deployment on L1', async () => {
    providerStub.getCode.resolves('0x123456'); // Non-empty bytecode
    contractStub.initialized.resolves(true);

    const testContracts = new TestContracts([], {});
    await testContracts.run();

    expect(providerStub.getCode).to.have.been.calledWith('0x1111111111111111111111111111111111111111');
    expect(contractStub.initialized).to.have.been.called;
  });

  it('should check contract deployment on L2', async () => {
    providerStub.getCode.resolves('0x123456'); // Non-empty bytecode
    contractStub.initialized.resolves(true);

    const testContracts = new TestContracts([], {});
    await testContracts.run();

    expect(providerStub.getCode).to.have.been.calledWith('0x2222222222222222222222222222222222222222');
    expect(contractStub.initialized).to.have.been.called;
  });

  it('should handle undeployed contracts', async () => {
    providerStub.getCode.resolves('0x'); // Empty bytecode

    const testContracts = new TestContracts([], {});
    await testContracts.run();

    expect(providerStub.getCode).to.have.been.called;
    expect(contractStub.initialized).to.not.have.been.called;
  });

  it('should handle uninitialized contracts', async () => {
    providerStub.getCode.resolves('0x123456'); // Non-empty bytecode
    contractStub.initialized.resolves(false);

    const testContracts = new TestContracts([], {});
    await testContracts.run();

    expect(providerStub.getCode).to.have.been.called;
    expect(contractStub.initialized).to.have.been.called;
  });

  it('should check L2 Gas Price Oracle contracts on L1', async () => {
    providerStub.getCode.resolves('0x123456'); // Non-empty bytecode
    contractStub.initialized.resolves(true);

    const testContracts = new TestContracts([], {});
    await testContracts.run();

    expect(providerStub.getCode).to.have.been.calledWith('0x3333333333333333333333333333333333333333');
    expect(providerStub.getCode).to.have.been.calledWith('0x4444444444444444444444444444444444444444');
  });

  it('should check L1 Gas Price Oracle contract on L2', async () => {
    providerStub.getCode.resolves('0x123456'); // Non-empty bytecode
    contractStub.initialized.resolves(true);

    const testContracts = new TestContracts([], {});
    await testContracts.run();

    expect(providerStub.getCode).to.have.been.calledWith('0x5555555555555555555555555555555555555555');
  });
});
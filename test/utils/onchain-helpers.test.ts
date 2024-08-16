import { expect } from 'chai';
import sinon from 'sinon';
import { JsonRpcProvider, TransactionReceipt, Contract } from 'ethers';
import * as onchainHelpers from '../../src/utils/onchain/index.js';

const EXTERNAL_RPC_URI_L1 = "https://eth-sepolia.g.alchemy.com/v2/demo";
const EXTERNAL_RPC_URI_L2 = "https://sepolia-rpc.scroll.io/";
const L1_MESSAGE_QUEUE_PROXY_ADDR = "0xF0B2293F5D834eAe920c6974D50957A1732de763";

describe('Onchain Helpers', () => {
  let providerStub: sinon.SinonStubbedInstance<JsonRpcProvider>;

  beforeEach(() => {
    providerStub = sinon.createStubInstance(JsonRpcProvider);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('getFinalizedBlockHeight', () => {
    it('should return the finalized block height', async () => {
      providerStub.send.resolves({ number: '0x1234' });
      const result = await onchainHelpers.getFinalizedBlockHeight(providerStub as unknown as JsonRpcProvider);
      expect(result).to.equal(4660);
      expect(providerStub.send.calledWith("eth_getBlockByNumber", ["finalized", false])).to.be.true;
    });
  });

  describe('getCrossDomainMessageFromTx', () => {
    it('should return queue index and L2 tx hash', async () => {
      const txHash = "0xc4cc1447185335970a26a8781fb17bd5bdfd49bd53474f1c322d0965b8906cea";
      const mockReceipt = {
        logs: [{
          address: L1_MESSAGE_QUEUE_PROXY_ADDR,
          data: '0x0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000004'
        }]
      };
      providerStub.getTransactionReceipt.resolves(mockReceipt as unknown as TransactionReceipt);
      
      const contractStub = sinon.stub(Contract.prototype, 'getCrossDomainMessage').resolves('0x5678');

      const result = await onchainHelpers.getCrossDomainMessageFromTx(providerStub as unknown as JsonRpcProvider, txHash, L1_MESSAGE_QUEUE_PROXY_ADDR);
      expect(result).to.deep.equal({ queueIndex: 2n, l2TxHash: '0x5678' });
      expect(contractStub.calledOnce).to.be.true;
    });
  });

  describe('getPendingQueueIndex', () => {
    it('should return the pending queue index', async () => {
      const contractStub = sinon.stub(Contract.prototype, 'pendingQueueIndex').resolves(10n);
      
      const result = await onchainHelpers.getPendingQueueIndex(providerStub as unknown as JsonRpcProvider, L1_MESSAGE_QUEUE_PROXY_ADDR);
      expect(result).to.equal(10n);
      expect(contractStub.calledOnce).to.be.true;
    });
  });

  describe('getGasOracleL2BaseFee', () => {
    it('should return the L2 base fee', async () => {
      const contractStub = sinon.stub(Contract.prototype, 'l2BaseFee').resolves(1000000000n);
      
      const result = await onchainHelpers.getGasOracleL2BaseFee(providerStub as unknown as JsonRpcProvider, L1_MESSAGE_QUEUE_PROXY_ADDR);
      expect(result).to.equal(1000000000n);
      expect(contractStub.calledOnce).to.be.true;
    });
  });

  describe('awaitTx', () => {
    it('should wait for transaction receipt', async () => {
      const txHash = "0x2e5166ad15b3d71bc4d489b25336e3d35c339d85ed905247b220d320bfe781c9";
      const mockReceipt = { blockNumber: 1234, status: 1 };
      providerStub.getTransactionReceipt.onFirstCall().resolves(null);
      providerStub.getTransactionReceipt.onSecondCall().resolves(mockReceipt as unknown as TransactionReceipt);
      
      const result = await onchainHelpers.awaitTx(providerStub as unknown as JsonRpcProvider, txHash, 100);
      expect(result).to.deep.equal(mockReceipt);
      expect(providerStub.getTransactionReceipt.calledTwice).to.be.true;
    });
  });

  describe('constructBlockExplorerUrl', () => {
    it('should construct correct block explorer URL', async () => {
      providerStub.getNetwork.resolves({ chainId: 11155111n });
      const result = await onchainHelpers.constructBlockExplorerUrl(
        providerStub as unknown as JsonRpcProvider,
        '0x2e5166ad15b3d71bc4d489b25336e3d35c339d85ed905247b220d320bfe781c9',
        onchainHelpers.LookupType.TX
      );
      expect(result).to.equal('https://sepolia.etherscan.io/tx/0x2e5166ad15b3d71bc4d489b25336e3d35c339d85ed905247b220d320bfe781c9');
    });
  });
});
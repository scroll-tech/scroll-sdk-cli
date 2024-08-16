import { getFinalizedBlockHeight, getCrossDomainMessageFromTx, getPendingQueueIndex, getGasOracleL2BaseFee, awaitTx, txLink, getUnclaimedWithdrawals } from './utils/onchain/index.js';

const EXTERNAL_RPC_URI_L1 = "https://alien-flashy-arm.ethereum-sepolia.quiknode.pro/2aeb75414e5ee0e930b64c2e7feff59efb537f30"
const EXTERNAL_RPC_URI_L2 = "https://sepolia-rpc.scroll.io/"
const L1_MESSAGE_QUEUE_PROXY_ADDR = "0xF0B2293F5D834eAe920c6974D50957A1732de763";
const BRIDGE_API_URI = "https://sepolia-api-bridge-v2.scroll.io/api"

async function testGetFinalizedBlockHeight() {
	try {
		const finalizedBlockHeight = await getFinalizedBlockHeight(EXTERNAL_RPC_URI_L1);
		console.log(`Finalized block height: ${finalizedBlockHeight}`);
	} catch (error) {
		console.error('Error:', error);
	}
}

async function testGetCrossDomainMessageFromTx() {
	try {
		const txHash = "0xc4cc1447185335970a26a8781fb17bd5bdfd49bd53474f1c322d0965b8906cea";
		const crossDomainMessage = await getCrossDomainMessageFromTx(txHash, EXTERNAL_RPC_URI_L1, L1_MESSAGE_QUEUE_PROXY_ADDR)
		console.log(`Cross-domain message (L2 tx hash): ${crossDomainMessage.l2TxHash}`);
		console.log(`Queue Position: ${crossDomainMessage.queueIndex}`);
	} catch (error) {
		console.error('Error in testGetCrossDomainMessageFromTx:', error);
	}
}

async function testGetPendingQueueIndex() {
	try {
		const pendingQueueIndex = await getPendingQueueIndex(EXTERNAL_RPC_URI_L1, L1_MESSAGE_QUEUE_PROXY_ADDR)
		console.log(`Pending queue index: ${pendingQueueIndex}`);
	} catch (error) {
		console.error('Error in testGetPendingQueueIndex:', error);
	}
}

async function testGetGasOracleL2BaseFee() {
	try {
		const l2BaseFee = await getGasOracleL2BaseFee(EXTERNAL_RPC_URI_L1, L1_MESSAGE_QUEUE_PROXY_ADDR)
		console.log(`L2 Basefee: ${l2BaseFee}`);
	} catch (error) {
		console.error('Error in testGetGasOracleL2BaseFee:', error);
	}
}

async function testAwaitTx() {
	try {
		const txHash = "0x2e5166ad15b3d71bc4d489b25336e3d35c339d85ed905247b220d320bfe781c9"; // Example transaction hash

		console.log(`Waiting for transaction ${txHash} to be mined...`);
		const receipt = await awaitTx(txHash, EXTERNAL_RPC_URI_L2);

		if (receipt) {
			console.log(`Transaction mined in block: ${receipt.blockNumber}`);
			console.log(`Transaction status: ${receipt.status === 1 ? 'Success' : 'Failure'}`);
		} else {
			console.log('Transaction not mined within the timeout period');
		}
	} catch (error) {
		console.error('Error in testAwaitTx:', error);
	}
}

async function testTxLink() {
	try {
		const txHash = "0x2e5166ad15b3d71bc4d489b25336e3d35c339d85ed905247b220d320bfe781c9"; // Example transaction hash
		console.log(await txLink(txHash, { rpc: EXTERNAL_RPC_URI_L2 }))
	} catch (error) {
		console.error('Error in testTxLink:', error);
	}
}

async function testGetUnclaimedWithdrawals() {
	try {
		const results = await getUnclaimedWithdrawals("0x98110937b5D6C5FCB0BA99480e585D2364e9809C", BRIDGE_API_URI)
		console.log(results);
	} catch (error) {
		console.error('Error in testGetUnclaimedWithdrawals:', error);
	}

}



async function main() {
	console.log('Starting test...');
	await testGetFinalizedBlockHeight();
	await testGetCrossDomainMessageFromTx();
	await testGetPendingQueueIndex();
	await testGetGasOracleL2BaseFee();
	await testAwaitTx();
	await testTxLink();
	await testGetUnclaimedWithdrawals();
	console.log('Test completed.');
}

main().catch(error => {
	console.error('Unhandled error in main:', error);
});

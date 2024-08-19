import { ethers } from 'ethers';
import { RpcSource, scrollERC20ABI, generateProvider } from './index.js';

export async function awaitERC20Balance(
	walletAddress: string,
	erc20Address: string,
	rpc: RpcSource
): Promise<string> {
	try {
		const provider = generateProvider(rpc)
		const erc20Contract = new ethers.Contract(erc20Address, scrollERC20ABI, provider);

		let balance = BigInt(0);
		let attempts = 0;
		const maxAttempts = 5;
		const delay = 15000; // 15 seconds

		while (balance === BigInt(0) && attempts < maxAttempts) {
			balance = await erc20Contract.balanceOf(walletAddress);
			if (balance > BigInt(0)) {
				return balance.toString();
			}
			attempts++;
			console.log(`Attempt ${attempts}: Waiting for token balance...`);
			await new Promise(resolve => setTimeout(resolve, delay));
		}

		return balance.toString();
	} catch (error) {
		console.error('Error in getScrollERC20Balance:', error);
		throw error;
	}
}
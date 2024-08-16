// Define the UnclaimedWithdrawal type
export type UnclaimedWithdrawal = {
	hash: string;
	messageHash: string;
	tokenType: number;
	tokenAmounts: string[];
	l1TokenAddress: string;
	l2TokenAddress: string;
	blockNumber: number;
	claimable: boolean;
	from: string;
	to: string;
	value: string;
};

export async function getUnclaimedWithdrawals(address: string, apiUri: string) {
	let url = `${apiUri}/l2/unclaimed/withdrawals?address=${address}&page=1&page_size=100`;

	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const data = await response.json();

		if (data.errcode !== 0) {
			throw new Error(`API error: ${data.errmsg}`);
		}

		const unclaimedWithdrawals: UnclaimedWithdrawal[] = data.data.results.map((result: any) => ({
			hash: result.hash,
			messageHash: result.message_hash,
			tokenType: result.token_type,
			tokenAmounts: result.token_amounts,
			l1TokenAddress: result.l1_token_address,
			l2TokenAddress: result.l2_token_address,
			blockNumber: result.block_number,
			claimable: result.claim_info.claimable,
			from: result.claim_info.from,
			to: result.claim_info.to,
			value: result.claim_info.value,
		}));

		return unclaimedWithdrawals;
	} catch (error) {
		console.error('Error fetching unclaimed withdrawals:', error);
		throw error;
	}

}
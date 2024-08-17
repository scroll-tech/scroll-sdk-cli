/**
 * Represents an unclaimed withdrawal.
 */
export type Withdrawal = {
	hash: string;
	replay_tx_hash: string;
	refund_tx_hash: string;
	message_hash: string;
	token_type: number;
	token_ids: any[];
	token_amounts: string[];
	message_type: number;
	l1_token_address: string;
	l2_token_address: string;
	block_number: number;
	tx_status: number;
	counterpart_chain_tx: CounterpartChainTx;
	claim_info: ClaimInfo | null;
	block_timestamp: number;
	batch_deposit_fee: string;
};

export interface ClaimInfo {
	from: string;
	to: string;
	value: string;
	nonce: string;
	message: string;
	proof: Proof;
	claimable: boolean;
}

export interface Proof {
	batch_index: string;
	merkle_proof: string;
}

export interface CounterpartChainTx {
	hash: string;
	block_number: number;
}

/**
 * Retrieves unclaimed withdrawals for a given address.
 * 
 * @param address - The address to check for unclaimed withdrawals.
 * @param apiUri - The URI of the API to query for unclaimed withdrawals.
 * @returns A promise that resolves to an array of UnclaimedWithdrawal objects.
 * @throws An error if the API request fails or returns an error.
 */
export async function getWithdrawals(address: string, apiUri: string): Promise<Withdrawal[]> {
	let url = `${apiUri}/l2/withdrawals?address=${address}&page=1&page_size=100`;

	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const data = await response.json();

		if (data.errcode !== 0) {
			throw new Error(`API error: ${data.errmsg}`);
		}

		const withdrawals: Withdrawal[] = data.data.results.map((result: any) => ({
			hash: result.hash,
			from: result.from,
			to: result.to,
			value: result.value,
			nonce: result.nonce,
			block_number: result.block_number,
			tx_status: result.tx_status,
			counterpart_chain_tx: {
				hash: result.counterpart_chain_tx.hash,
				block_number: result.counterpart_chain_tx.block_number
			},
			claim_info: result.claim_info ? {
				from: result.claim_info.from,
				to: result.claim_info.to,
				value: result.claim_info.value,
				nonce: result.claim_info.nonce,
				message: result.claim_info.message,
				proof: {
					batch_index: result.claim_info.proof.batch_index,
					merkle_proof: result.claim_info.proof.merkle_proof
				},
				claimable: result.claim_info.claimable
			} : null,
			block_timestamp: result.block_timestamp,
			batch_deposit_fee: result.batch_deposit_fee
		}));

		return withdrawals;
	} catch (error) {
		console.error('Error fetching unclaimed withdrawals:', error);
		throw error;
	}
}
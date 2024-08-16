import { JsonRpcProvider, Wallet } from "ethers";
import { RpcSource } from "./index.js";

export function generateProvider(rpcSource: RpcSource): JsonRpcProvider {
	if (typeof rpcSource === 'string') {
		return new JsonRpcProvider(rpcSource);
	} else if (rpcSource instanceof Wallet && rpcSource.provider instanceof JsonRpcProvider) {
		return rpcSource.provider;
	} else if (rpcSource instanceof JsonRpcProvider) {
		return rpcSource;
	}
	throw new Error('Invalid rpcSource. Expected Provider, Wallet with JsonRpcProvider, or string with RPC Url.');
}
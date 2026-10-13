import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import source from '../../../contracts/lastlight.py?raw';
import mission from '../generated/mission.json';
import missionHash from '../generated/mission-hash.json';
import deployment from '../deployment.json';

export const CHAIN_ID = 61999;
export const EXPLORER = studionet.blockExplorers.default.url;
export const CONTRACT_SOURCE = source;
export const MISSION = mission;
export const MISSION_HASH = missionHash.sha256;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SESSION_RE = /^[a-f0-9]{32}$/;
const ADDRESS_KEY = 'lastlight:studionet:contract';
const PENDING_KEY = 'lastlight:studionet:pending';

export function validAddress(value) { return ADDRESS_RE.test(value || '') && !/^0x0{40}$/i.test(value); }
export function validSessionId(value) { return SESSION_RE.test(value || ''); }
export function short(value) { return value ? `${value.slice(0, 7)}…${value.slice(-5)}` : '—'; }
export function configuredAddress() {
  const fromBuild = import.meta.env.VITE_LASTLIGHT_CONTRACT_ADDRESS || deployment.contractAddress;
  const fromLocal = localStorage.getItem(ADDRESS_KEY);
  return validAddress(fromBuild) ? fromBuild : validAddress(fromLocal) ? fromLocal : '';
}
export function saveAddress(address) {
  if (!validAddress(address)) throw new Error('Enter a valid deployed contract address.');
  localStorage.setItem(ADDRESS_KEY, address);
}
export function pendingAction() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch { return null; }
}
export function rememberPending(action) { localStorage.setItem(PENDING_KEY, JSON.stringify(action)); }
export function forgetPending() { localStorage.removeItem(PENDING_KEY); }

export function getProvider() {
  return window.ethereum || null;
}

export async function ensureStudionet(provider) {
  const chainHex = `0x${CHAIN_ID.toString(16)}`;
  const current = await provider.request({ method: 'eth_chainId' });
  if (Number.parseInt(current, 16) === CHAIN_ID) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
  } catch (error) {
    if (error?.code !== 4902) throw new Error('Please switch MetaMask to GenLayer Studionet (61999).');
    await provider.request({ method: 'wallet_addEthereumChain', params: [{
      chainId: chainHex,
      chainName: studionet.name,
      nativeCurrency: studionet.nativeCurrency,
      rpcUrls: studionet.rpcUrls.default.http,
      blockExplorerUrls: [EXPLORER],
    }] });
  }
  const after = await provider.request({ method: 'eth_chainId' });
  if (Number.parseInt(after, 16) !== CHAIN_ID) throw new Error('Wallet is not on GenLayer Studionet.');
}

export async function requestWallet() {
  const provider = getProvider();
  if (!provider) throw new Error('MetaMask is required to sign game transactions.');
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const account = accounts?.[0];
  if (!validAddress(account)) throw new Error('No wallet account was selected.');
  await ensureStudionet(provider);
  return account;
}

export function client(account) {
  const provider = getProvider();
  if (account && !provider) throw new Error('MetaMask is unavailable.');
  return createClient({ chain: studionet, ...(account ? { account, provider } : {}) });
}

export async function read(address, functionName, args = [], account) {
  if (!validAddress(address)) throw new Error('Deploy or select a contract first.');
  // Public reads use the pinned Studionet RPC, independent of MetaMask's selected chain.
  return client().readContract({ address, functionName, args });
}

export function successfulReceipt(receipt) {
  if (receipt?.statusName !== 'FINALIZED' && receipt?.status !== 7) return false;
  if (receipt?.txExecutionResultName === 'FINISHED_WITH_RETURN' || receipt?.txExecutionResult === 1) return true;
  // Some Studionet finalized receipts omit the execution-result field entirely.
  // In that case a positive consensus result is only provisional: callers must
  // still verify the expected contract state with a separate public read.
  return receipt?.txExecutionResult == null
    && receipt?.txExecutionResultName == null
    && [1, 6, 'AGREE', 'MAJORITY_AGREE'].includes(receipt?.resultName ?? receipt?.result);
}

export function failedReceipt(receipt) {
  return receipt?.statusName === 'CANCELED' || receipt?.status === 8
    || receipt?.txExecutionResultName === 'FINISHED_WITH_ERROR' || receipt?.txExecutionResult === 2
    || [2, 7, 'DISAGREE', 'MAJORITY_DISAGREE'].includes(receipt?.resultName ?? receipt?.result);
}

export async function waitForFinality(hash, account) {
  const receipt = await client(account).waitForTransactionReceipt({ hash, status: 'FINALIZED', interval: 5000, retries: 120 });
  if (failedReceipt(receipt)) throw new Error('The transaction finalized with an execution error. No game state was credited.');
  if (!successfulReceipt(receipt)) throw new Error('The transaction is not confirmed as successful. Check its explorer status before retrying.');
  return receipt;
}

export async function write(address, functionName, args, account) {
  return client(account).writeContract({ address, functionName, args, value: 0n });
}

export async function deploy(account) {
  return client(account).deployContract({ code: CONTRACT_SOURCE, args: [] });
}

export async function verifyContract(address, account) {
  const config = await read(address, 'get_config', [], account);
  if (config?.mission_hash !== MISSION_HASH || config?.rules_version !== MISSION.rulesVersion) {
    throw new Error('This contract uses different mission rules. Wallet actions are disabled.');
  }
  return config;
}

export function newId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function safeError(error) {
  const message = String(error?.shortMessage || error?.message || 'Unknown error');
  if (/user rejected|user denied|rejected the request/i.test(message)) return 'Cancelled in MetaMask. No action was recorded.';
  if (/not enough funds|insufficient funds/i.test(message)) return 'Wallet lacks GEN for the network fee; the game itself sends 0 GEN.';
  if (/switch MetaMask|mission rules|not confirmed|execution error|timed out|not found|valid deployed|not on GenLayer|MetaMask is required/i.test(message)) return message.slice(0, 250);
  return 'The network or wallet could not complete this action. Check the transaction status before retrying.';
}

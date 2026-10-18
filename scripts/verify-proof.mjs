import crypto from 'node:crypto';
import fs from 'node:fs';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const mission = JSON.parse(fs.readFileSync(new URL('../content/kestrel-01.json', import.meta.url), 'utf8'));
const proof = JSON.parse(fs.readFileSync(new URL('../deploy/proof.json', import.meta.url), 'utf8'));
const canonical = JSON.stringify(mission);
const localHash = crypto.createHash('sha256').update(canonical).digest('hex');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function successful(receipt) {
  if (receipt?.statusName !== 'FINALIZED' && receipt?.status !== 7) return false;
  if (receipt?.txExecutionResultName === 'FINISHED_WITH_RETURN' || receipt?.txExecutionResult === 1) return true;
  return receipt?.txExecutionResult == null && receipt?.txExecutionResultName == null
    && [1, 6, 'AGREE', 'MAJORITY_AGREE'].includes(receipt?.resultName ?? receipt?.result);
}

assert(proof.rulesVersion === mission.rulesVersion, 'Proof rules version does not match mission source.');
assert(proof.missionHash === localHash, `Proof hash does not match local rules (${localHash}).`);
console.log(`Local rules verified: ${mission.rulesVersion} ${localHash}`);

if (!proof.contractAddress || !proof.deploymentTxHash || !proof.sourceCommit
    || !Array.isArray(proof.cases) || proof.cases.length === 0) {
  console.error('Live proof is incomplete: deployment, source commit, and finalized demo cases have not been recorded.');
  process.exitCode = 2;
} else {
  assert(/^0x[\da-fA-F]{40}$/.test(proof.contractAddress), 'Proof contract address is invalid.');
  assert(/^[\da-f]{40}$/.test(proof.sourceCommit), 'Proof source commit must be a full Git SHA.');
  const sourceUrl = `https://raw.githubusercontent.com/sanity456/lastlight/${proof.sourceCommit}/contracts/lastlight.py`;
  const sourceResponse = await fetch(sourceUrl);
  assert(sourceResponse.ok, `Pinned public contract source could not be fetched (${sourceResponse.status}).`);
  const pinnedSource = await sourceResponse.text();
  const localSource = fs.readFileSync(new URL('../contracts/lastlight.py', import.meta.url), 'utf8');
  assert(pinnedSource === localSource, 'Pinned public contract source differs from the locally verified contract.');
  console.log(`Public source verified at commit ${proof.sourceCommit}`);

  const client = createClient({ chain: studionet });
  const receipts = new Map();
  const hashes = [proof.deploymentTxHash];
  for (const testCase of proof.cases) {
    assert(/^([\da-f]{32})$/.test(testCase.sessionId || ''), `Case ${testCase.name} has an invalid session ID.`);
    assert(/^0x[\da-fA-F]{64}$/.test(testCase.creationTxHash || ''), `Case ${testCase.name} needs a creation transaction hash.`);
    assert(Array.isArray(testCase.roundTxHashes) && testCase.roundTxHashes.length === 3,
      `Case ${testCase.name} needs three round transaction hashes.`);
    hashes.push(testCase.creationTxHash, ...testCase.roundTxHashes);
    if (testCase.joinTxHash) hashes.push(testCase.joinTxHash);
  }
  for (const hash of hashes) {
    assert(/^0x[\da-fA-F]{64}$/.test(hash), `Invalid transaction hash in proof: ${hash}`);
    const receipt = await client.waitForTransactionReceipt({ hash, status: 'FINALIZED', interval: 5000, retries: 1 });
    assert(successful(receipt), `Transaction did not finalize successfully: ${hash}`);
    receipts.set(hash, receipt);
    console.log(`Finalized successfully: ${hash}`);
  }

  const deployed = receipts.get(proof.deploymentTxHash)?.txDataDecoded;
  assert(deployed?.type === 'deploy' && deployed.code === localSource,
    'Deployment transaction does not contain the pinned public contract source.');
  assert(deployed.contractAddress?.toLowerCase() === proof.contractAddress.toLowerCase(),
    'Deployment transaction created a different contract address.');

  const config = await client.readContract({ address: proof.contractAddress, functionName: 'get_config', args: [] });
  assert(config?.rules_version === mission.rulesVersion, 'Deployed rules version differs from local source.');
  assert(config?.mission_hash === localHash, 'Deployed mission hash differs from local source.');
  console.log(`Contract verified: ${proof.contractAddress}`);

  for (const testCase of proof.cases) {
    assert(testCase.sessionId, `Proof case is missing sessionId: ${testCase.name || 'unnamed'}`);
    const creation = receipts.get(testCase.creationTxHash)?.txDataDecoded;
    assert(creation?.type === 'call' && creation.callData?.method === 'create_session'
      && creation.callData?.args?.[0] === testCase.sessionId,
    `Creation transaction does not match case ${testCase.name}.`);
    const session = await client.readContract({ address: proof.contractAddress, functionName: 'get_session', args: [testCase.sessionId] });
    assert(session?.id === testCase.sessionId, `Could not read case ${testCase.name} from the deployed contract.`);
    const expectedVerdicts = testCase.expectedVerdicts || [];
    const expectedBranches = testCase.expectedBranches || [];
    assert(expectedVerdicts.length === 3 && expectedBranches.length === 3, `Case ${testCase.name} must list three verdicts and branch IDs.`);
    for (let index = 0; index < 3; index++) {
      const round = await client.readContract({ address: proof.contractAddress, functionName: 'get_round', args: [testCase.sessionId, BigInt(index)] });
      const submitted = receipts.get(testCase.roundTxHashes[index])?.txDataDecoded;
      assert(submitted?.type === 'call' && submitted.callData?.method === 'submit_plan'
        && submitted.callData?.args?.[0] === testCase.sessionId
        && String(submitted.callData.args[1]) === String(index)
        && submitted.callData.args[2] === round.action_id
        && submitted.callData.args[3]?.trim() === round.plan,
      `Round ${index + 1} transaction does not match case ${testCase.name}.`);
      assert(round?.mission_hash === localHash, `Round ${index + 1} in ${testCase.name} uses a different rules hash.`);
      assert(round?.judgment?.verdict === expectedVerdicts[index], `Unexpected verdict in ${testCase.name} round ${index + 1}.`);
      assert(round?.branch_id === expectedBranches[index], `Unexpected branch in ${testCase.name} round ${index + 1}.`);
      assert(typeof round?.judgment?.quote === 'string' && (!round.judgment.quote || round.plan.includes(round.judgment.quote)), `Evidence quote is not present in ${testCase.name} round ${index + 1}.`);
    }
    assert(session.status === (testCase.expectedStatus || 'COMPLETED'), `Unexpected final status in ${testCase.name}.`);
    if (testCase.expectedEnding) assert(session.ending === testCase.expectedEnding, `Unexpected ending in ${testCase.name}.`);
    console.log(`Case verified: ${testCase.name} (${session.ending}, ${session.final_score})`);
  }
}

import fs from 'node:fs';
import crypto from 'node:crypto';

const contentFile = new URL('../content/kestrel-01.json', import.meta.url);
const templateFile = new URL('../contracts/lastlight.template.py', import.meta.url);
const contractFile = new URL('../contracts/lastlight.py', import.meta.url);
const webFile = new URL('../web/src/generated/mission.json', import.meta.url);
const metadataFile = new URL('../web/src/generated/mission-hash.json', import.meta.url);
const scenario = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
if (scenario.rulesVersion !== 'lastlight-2' || scenario.rounds.length !== 3) throw new Error('Unexpected mission content');
if (!scenario.rounds[0].criterion?.id || !scenario.rounds[0].criterion?.text) throw new Error('The intake round needs one narrow criterion');
for (const round of scenario.rounds.slice(1)) {
  if (!round.branches || Object.values(round.branches).some(branch => !branch.criterion?.id || !branch.criterion?.text)) {
    throw new Error(`Every ${round.id} branch needs one narrow criterion`);
  }
}
for (const branch of Object.values(scenario.rounds[1].branches)) {
  if (!branch.branchOnOutcome || !['MET', 'NOT_MET', 'INSUFFICIENT_EVIDENCE'].every(key => branch.branchOnOutcome[key])) {
    throw new Error('Every coolant verdict must choose a deterministic communications branch');
  }
}
for (const branch of Object.values(scenario.rounds[2].branches)) {
  if (!branch.criterion?.id || !branch.criterion?.text) throw new Error('Every communications branch needs one criterion');
}
const verdicts = ['MET', 'NOT_MET', 'INSUFFICIENT_EVIDENCE'];
if (!verdicts.every(verdict => scenario.outcomes[verdict])) throw new Error('Every allowed verdict needs fixed deterministic effects');
if (!verdicts.every(verdict => scenario.rounds[0].branches[verdict])) throw new Error('Every intake verdict must choose a coolant branch');
for (const branchId of Object.values(scenario.rounds[0].branches)) {
  if (!scenario.rounds[1].branches[branchId]) throw new Error(`Unknown coolant branch ${branchId}`);
}
for (const branch of Object.values(scenario.rounds[1].branches)) {
  if (!verdicts.every(verdict => branch.branchOnOutcome[verdict])) throw new Error('Every coolant verdict must choose a communications branch');
  for (const branchId of Object.values(branch.branchOnOutcome)) {
    if (!scenario.rounds[2].branches[branchId]) throw new Error(`Unknown communications branch ${branchId}`);
  }
}
const canonical = JSON.stringify(scenario);
const hash = crypto.createHash('sha256').update(canonical).digest('hex');
const template = fs.readFileSync(templateFile, 'utf8');
if (!template.includes('__MISSION_JSON__') || !template.includes('__MISSION_HASH__')) throw new Error('Contract template markers missing');
const files = [
  [contractFile, template.replace('__MISSION_JSON__', JSON.stringify(canonical)).replace('__MISSION_HASH__', hash)],
  [webFile, JSON.stringify(scenario, null, 2) + '\n'],
  [metadataFile, JSON.stringify({ rulesVersion: scenario.rulesVersion, sha256: hash }, null, 2) + '\n'],
];
for (const [file, expected] of files) {
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== expected) throw new Error(`Generated file is stale: ${file.pathname}`);
  } else {
    fs.mkdirSync(new URL('.', file), { recursive: true });
    fs.writeFileSync(file, expected);
  }
}
console.log(`${process.argv.includes('--check') ? 'Checked' : 'Generated'} mission ${scenario.rulesVersion} SHA-256 ${hash}`);

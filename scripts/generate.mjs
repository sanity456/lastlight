import fs from 'node:fs';
import crypto from 'node:crypto';

const contentFile = new URL('../content/kestrel-01.json', import.meta.url);
const templateFile = new URL('../contracts/lastlight.template.py', import.meta.url);
const contractFile = new URL('../contracts/lastlight.py', import.meta.url);
const webFile = new URL('../web/src/generated/mission.json', import.meta.url);
const metadataFile = new URL('../web/src/generated/mission-hash.json', import.meta.url);
const scenario = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
if (scenario.rulesVersion !== 'lastlight-1' || scenario.rounds.length !== 3) throw new Error('Unexpected mission content');
for (const round of scenario.rounds) if (round.criteria.length !== 3) throw new Error('Every round needs three criteria');
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

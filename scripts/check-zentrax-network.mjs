import fs from 'node:fs';
import path from 'node:path';

const required = [
  'zentrax-network/README.md',
  'zentrax-network/docs/ARCHITECTURE_DECISION_RECORD.md',
  'zentrax-network/docs/THREAT_MODEL.md',
  'zentrax-network/docs/GENESIS_PARAMETERS.md',
  'zentrax-network/docs/OPERATIONS.md',
];
const failures = [];
for (const file of required) {
  if (!fs.existsSync(file)) failures.push(`Missing required ZENTRAX network file: ${file}`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
const adr = fs.readFileSync(required[1], 'utf8');
const threat = fs.readFileSync(required[2], 'utf8');
const params = fs.readFileSync(required[3], 'utf8');
const readme = fs.readFileSync(required[0], 'utf8');
if (!adr.includes('PROPOSED — NOT APPROVED')) failures.push('Architecture decision must remain explicitly unapproved until review.');
if (!threat.includes('Security invariants')) failures.push('Threat model security invariants section is missing.');
if (!params.includes('ALL PRODUCTION VALUES UNSET')) failures.push('Production genesis parameters must remain unset at this stage.');
if (!readme.includes('No chain node')) failures.push('Workspace README must disclose scaffold-only status.');
if (fs.existsSync('zentrax-network/genesis.json') || fs.existsSync('zentrax-network/config/genesis.json')) {
  failures.push('Unexpected genesis file found: do not publish unreviewed production genesis parameters.');
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`ZENTRAX network scaffold check passed: ${required.length} required files present; no production genesis configuration found.`);

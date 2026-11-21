import fs from 'node:fs';
import path from 'node:path';

const required = [
  'zentrax-network/README.md',
  'zentrax-network/docs/ARCHITECTURE_DECISION_RECORD.md',
  'zentrax-network/docs/THREAT_MODEL.md',
  'zentrax-network/docs/GENESIS_PARAMETERS.md',
  'zentrax-network/docs/OPERATIONS.md',
  'zentrax-network/devnet/README.md',
  'zentrax-network/devnet/Dockerfile',
  'zentrax-network/devnet/compose.yaml',
  'zentrax-network/devnet/verify.sh',
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
const devnetReadme = fs.readFileSync('zentrax-network/devnet/README.md', 'utf8');
const dockerfile = fs.readFileSync('zentrax-network/devnet/Dockerfile', 'utf8');
const compose = fs.readFileSync('zentrax-network/devnet/compose.yaml', 'utf8');
const verifier = fs.readFileSync('zentrax-network/devnet/verify.sh', 'utf8');
if (!adr.includes('PROPOSED — NOT APPROVED')) failures.push('Architecture decision must remain explicitly unapproved until review.');
if (!threat.includes('Security invariants')) failures.push('Threat model security invariants section is missing.');
if (!params.includes('ALL PRODUCTION VALUES UNSET')) failures.push('Production genesis parameters must remain unset at this stage.');
if (!readme.includes('No chain node')) failures.push('Workspace README must disclose scaffold-only status.');
if (!devnetReadme.includes('local-only engineering harness')) failures.push('Devnet README must disclose local-only reference scope.');
if (!dockerfile.includes('--branch v0.7.4')) failures.push('Devnet image must pin the upstream Cosmos EVM tag.');
for (const node of ['node0:', 'node1:', 'node2:', 'node3:']) if (!compose.includes(node)) failures.push(`Four-validator compose service is missing: ${node}`);
if (!verifier.includes('Expected 4 validators')) failures.push('Devnet verifier must assert the four-validator set.');
if (fs.existsSync('zentrax-network/genesis.json') || fs.existsSync('zentrax-network/config/genesis.json')) {
  failures.push('Unexpected genesis file found: do not publish unreviewed production genesis parameters.');
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`ZENTRAX network checks passed: ${required.length} required files present; four-node devnet harness declared; no production genesis configuration found.`);

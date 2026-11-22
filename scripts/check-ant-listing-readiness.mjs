import fs from 'node:fs';
import path from 'node:path';

const requiredFiles = [
  'contracts/AntColony.sol',
  'contracts/AntColonySale.sol',
  'scripts/deploy-ant.js',
  'scripts/deploy-ant-sale-testnet.js',
  'hardhat.config.js',
  'docs/ZENTRAX_EXCHANGE_APPLICATION_PACKET.md',
  'docs/ZENTRAX_EXCHANGE_LISTING_READINESS.md',
  'docs/ZENTRAX_ANT_MASTER_COMPLETION_CHECKLIST.md',
  'docs/ANT_TESTNET_SECURITY_REVIEW_2026-11-22.md'
];
const checks = [];
const blockers = [];
const read = (file) => fs.readFileSync(file, 'utf8');
const addCheck = (name, ok, detail) => {
  checks.push({ name, passed: Boolean(ok), detail });
  if (!ok) blockers.push({ code: name.toUpperCase().replace(/[^A-Z0-9]+/g, '_'), detail });
};

for (const file of requiredFiles) {
  addCheck(`required file: ${file}`, fs.existsSync(file), fs.existsSync(file) ? 'present' : 'missing');
}

let hardhat = '', tokenDeploy = '', saleDeploy = '', token = '', sale = '';
let appPacket = '', readiness = '', master = '', security = '';
try {
  hardhat = read('hardhat.config.js');
  tokenDeploy = read('scripts/deploy-ant.js');
  saleDeploy = read('scripts/deploy-ant-sale-testnet.js');
  token = read('contracts/AntColony.sol');
  sale = read('contracts/AntColonySale.sol');
  appPacket = read('docs/ZENTRAX_EXCHANGE_APPLICATION_PACKET.md');
  readiness = read('docs/ZENTRAX_EXCHANGE_LISTING_READINESS.md');
  master = read('docs/ZENTRAX_ANT_MASTER_COMPLETION_CHECKLIST.md');
  security = read('docs/ANT_TESTNET_SECURITY_REVIEW_2026-11-22.md');
} catch (error) {
  console.error('Cannot complete readiness checks:', error.message);
  process.exit(1);
}

addCheck('testnet-only Hardhat configuration', /bscTestnet\s*:\s*\{[\s\S]*?chainId\s*:\s*97/.test(hardhat) && !/bscMainnet\s*:/.test(hardhat), 'BSC Testnet chain ID 97 is configured; no BSC mainnet network is configured.');
addCheck('token deploy chain guard', /network\.config\.chainId\s*!==\s*97/.test(tokenDeploy), 'Token deployment script refuses every chain except BSC Testnet chain ID 97.');
addCheck('sale deploy chain guard', /network\.config\.chainId\)\s*!==\s*97/.test(saleDeploy), 'Sale deployment script refuses every chain except BSC Testnet chain ID 97.');
addCheck('fixed supply token invariant', /INITIAL_SUPPLY\s*=\s*200_000\s*\*\s*10\s*\*\*\s*18/.test(token) && !/function\s+mint\s*\(/i.test(token), 'Token source declares the fixed 200,000 ANT initial supply and exposes no public mint function.');
addCheck('sale immutable caps and window', /immutable\s+saleStartAt/.test(sale) && /immutable\s+saleEndAt/.test(sale) && /immutable\s+maxGrossUsdt/.test(sale) && /immutable\s+maxWalletGrossUsdt/.test(sale), 'Sale contract contains immutable time window, global cap and per-wallet cap.');
addCheck('sale recipient and price safety controls', /RecipientCollision/.test(sale) && /StalePrice/.test(sale) && /SlippageExceeded/.test(sale) && /nonReentrant/.test(sale), 'Sale source contains recipient collision, stale-price, slippage and reentrancy protections.');
addCheck('exchange application remains truthful', /Current formal submissions:\s*0/.test(appPacket) && /Current approvals:\s*0/.test(appPacket) && /not deployed/i.test(appPacket), 'Application packet does not claim a mainnet deployment, submission or approval.');
addCheck('listing dossier remains preparation-only', /0 applications submitted/.test(readiness) && /0 approvals/.test(readiness) && /NOT DEPLOYED/.test(readiness), 'Listing dossier records zero applications/approvals and no mainnet deployment.');
addCheck('master checklist blocks real-money launch', /No real-money launch is authorized/.test(master), 'Master checklist explicitly keeps real-money launch disabled pending gates.');
addCheck('security review disclaims independent audit', /not an independent audit/i.test(security) && /NOT APPROVED FOR PUBLIC SALE OR MAINNET/.test(security), 'Security review is not represented as an independent audit or mainnet approval.');

const report = {
  generatedAt: new Date().toISOString(),
  branch: process.env.GITHUB_REF_NAME || process.env.GITHUB_HEAD_REF || 'local',
  status: blockers.length ? 'GUARDRAIL_CHECK_FAILED' : 'PREPARATION_ONLY',
  readyForMainnet: false,
  readyForPublicSale: false,
  readyForDexLaunch: false,
  readyForCexSubmission: false,
  checks,
  knownBlockers: [
    'No verified BSC mainnet token or sale contract deployment.',
    'No independent smart-contract/oracle audit report.',
    'Issuer legal entity, authorized applicant and jurisdiction-specific legal review are incomplete.',
    'Primary-sale price, vesting/allocation and refund/escrow policy are not finalized.',
    'No independently verified live market, DEX liquidity or CEX approval.'
  ],
  guardrailFailures: blockers
};
fs.mkdirSync(path.dirname('artifacts/ant-listing-readiness.json'), { recursive: true });
fs.writeFileSync('artifacts/ant-listing-readiness.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = [
    '# ANT listing readiness gate',
    '',
    `**Status:** ${report.status}`,
    '',
    '- Mainnet ready: **NO**',
    '- Public sale ready: **NO**',
    '- DEX launch ready: **NO**',
    '- CEX submission ready: **NO**',
    '',
    '## Static guardrail checks',
    ...checks.map((item) => `- ${item.passed ? 'PASS' : 'FAIL'} — ${item.name}: ${item.detail}`),
    '',
    '## Known release blockers',
    ...report.knownBlockers.map((item) => `- ${item}`),
    ''
  ].join('\n');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
if (process.argv.includes('--require-ready') && report.knownBlockers.length) {
  console.error('Release gate blocked: evidence and approvals are incomplete.');
  process.exit(2);
}
if (blockers.length) process.exit(1);

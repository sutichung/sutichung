import fs from 'node:fs';
import { ethers } from 'ethers';

const TOKEN_ADDRESS = process.env.ANT_TOKEN_ADDRESS;
const DEPLOYMENT_BLOCK = Number(process.env.ANT_DEPLOYMENT_BLOCK);
const RPC_URL = process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet-dataseed.bnbchain.org';
const RANGE = Number(process.env.ANT_LOG_BLOCK_RANGE || 2000);
const ZERO = ethers.ZeroAddress;
const INITIAL_SUPPLY = 200_000n * 10n ** 18n;

if (!TOKEN_ADDRESS || !ethers.isAddress(TOKEN_ADDRESS) || TOKEN_ADDRESS === ZERO) {
  throw new Error('Set ANT_TOKEN_ADDRESS to the verified BSC Testnet token contract address.');
}
if (!Number.isSafeInteger(DEPLOYMENT_BLOCK) || DEPLOYMENT_BLOCK < 0) {
  throw new Error('Set ANT_DEPLOYMENT_BLOCK to the token deployment block number.');
}
if (!Number.isSafeInteger(RANGE) || RANGE < 1 || RANGE > 10000) {
  throw new Error('ANT_LOG_BLOCK_RANGE must be an integer from 1 to 10000.');
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const network = await provider.getNetwork();
if (network.chainId !== 97n) {
  throw new Error(`Refusing tokenomics evidence collection on chainId ${network.chainId}; BSC Testnet chainId 97 is required.`);
}
const tokenAddress = ethers.getAddress(TOKEN_ADDRESS);
const code = await provider.getCode(tokenAddress);
if (code === '0x') throw new Error('No contract bytecode exists at ANT_TOKEN_ADDRESS on BSC Testnet.');

const abi = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'event Transfer(address indexed from,address indexed to,uint256 value)'
];
const token = new ethers.Contract(tokenAddress, abi, provider);
const [name, symbol, decimals, totalSupply, latestBlock, deployBlock] = await Promise.all([
  token.name(), token.symbol(), token.decimals(), token.totalSupply(),
  provider.getBlockNumber(), provider.getBlock(DEPLOYMENT_BLOCK)
]);
if (!deployBlock) throw new Error('ANT_DEPLOYMENT_BLOCK is not available from this RPC.');
if (DEPLOYMENT_BLOCK > latestBlock) throw new Error('ANT_DEPLOYMENT_BLOCK is ahead of the current chain tip.');
if (name !== 'Ant Colony' || symbol !== 'ANT' || decimals !== 18) {
  throw new Error(`Unexpected token metadata: ${name}/${symbol}/${decimals}`);
}
if (totalSupply > INITIAL_SUPPLY) {
  throw new Error('Observed totalSupply exceeds the documented 200,000 ANT initial supply.');
}

const iface = new ethers.Interface(abi);
const transferTopic = iface.getEvent('Transfer').topicHash;
const balances = new Map();
let transferLogCount = 0;
for (let fromBlock = DEPLOYMENT_BLOCK; fromBlock <= latestBlock; fromBlock += RANGE) {
  const toBlock = Math.min(latestBlock, fromBlock + RANGE - 1);
  const logs = await provider.getLogs({
    address: tokenAddress,
    topics: [transferTopic],
    fromBlock,
    toBlock
  });
  for (const log of logs) {
    const event = iface.parseLog(log);
    const from = ethers.getAddress(event.args.from);
    const to = ethers.getAddress(event.args.to);
    const amount = event.args.value;
    if (from !== ZERO) {
      const next = (balances.get(from) || 0n) - amount;
      if (next < 0n) throw new Error(`Transfer history produced a negative balance for ${from}.`);
      balances.set(from, next);
    }
    if (to !== ZERO) balances.set(to, (balances.get(to) || 0n) + amount);
    transferLogCount += 1;
  }
}
for (const [address, balance] of balances) if (balance === 0n) balances.delete(address);
const reconstructedSupply = [...balances.values()].reduce((sum, value) => sum + value, 0n);
if (reconstructedSupply !== totalSupply) {
  throw new Error(`Transfer-history reconciliation failed: reconstructed ${reconstructedSupply}, on-chain totalSupply ${totalSupply}.`);
}
const burned = INITIAL_SUPPLY - totalSupply;
const holders = [...balances.entries()]
  .sort((a, b) => a[1] === b[1] ? 0 : a[1] > b[1] ? -1 : 1);
const topHolders = holders.slice(0, 20).map(([address, balance]) => ({
  address,
  balanceRaw: balance.toString(),
  balanceAnt: ethers.formatUnits(balance, 18),
  shareOfCurrentSupplyPercent: totalSupply === 0n ? '0' : (Number(balance * 1000000n / totalSupply) / 10000).toFixed(4)
}));
const report = {
  generatedAt: new Date().toISOString(),
  network: 'BSC Testnet',
  chainId: 97,
  contractAddress: tokenAddress,
  deploymentBlock: DEPLOYMENT_BLOCK,
  latestBlock,
  token: { name, symbol, decimals },
  initialSupplyAnt: '200000',
  initialSupplyRaw: INITIAL_SUPPLY.toString(),
  currentTotalSupplyRaw: totalSupply.toString(),
  currentTotalSupplyAnt: ethers.formatUnits(totalSupply, 18),
  cumulativeBurnedRaw: burned.toString(),
  cumulativeBurnedAnt: ethers.formatUnits(burned, 18),
  transferLogCount,
  nonZeroHolderCount: holders.length,
  balancesReconciledToTotalSupply: true,
  topHolders,
  allocationStatus: 'NOT_VERIFIED_FROM_BALANCES_ALONE',
  circulatingSupplyStatus: 'NOT_DETERMINED; treasury, vesting and restricted wallets require issuer labels and legal methodology',
  vestingStatus: 'NO_VESTING_CONTRACT_FOUND_IN_CURRENT_CONTRACT_SOURCE; verify independently before making a public claim',
  warning: 'Testnet evidence only. This report does not establish mainnet supply, legal circulating supply, beneficial ownership, allocation intent, or vesting rights.'
};
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/ant-tokenomics-evidence.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '# ANT tokenomics evidence (testnet)',
    '',
    `- Contract: ${tokenAddress}`,
    `- Current total supply: ${report.currentTotalSupplyAnt} ANT`,
    `- Non-zero holders reconstructed: ${holders.length}`,
    '- Transfer history reconciled to totalSupply: **YES**',
    '- Allocation / circulating supply / vesting status: **NOT VERIFIED**',
    '',
    'This is testnet evidence only, not a legal circulating-supply statement.'
  ].join('\n') + '\n');
}

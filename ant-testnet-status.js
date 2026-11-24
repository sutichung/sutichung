'use strict';

const http = require('node:http');
const port = Number(process.env.PORT || 10000);

const server = http.createServer((req, res) => {
  if (req.url !== '/' && req.url !== '/healthz' && req.url !== '/api/status') {
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'not_found' }));
  }
  const contractAddress = String(process.env.ANT_TESTNET_CONTRACT_ADDRESS || '').trim();
  const payload = {
    ok: true,
    service: 'ant-testnet-status',
    mode: 'status_only',
    network: 'BNB Smart Chain Testnet',
    chainId: 97,
    deploymentMethod: 'GitHub Actions workflow_dispatch',
    deploymentStatus: contractAddress ? 'address_configured_unverified' : 'not_deployed_or_address_missing',
    contractAddressConfigured: Boolean(contractAddress),
    contractAddress: contractAddress || null,
    mainnetDeploymentEnabled: false,
    signerConfiguredInThisService: false,
    checkedAt: new Date().toISOString()
  };
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
});

server.listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'ant_testnet_status_started', port, chainId: 97, mode: 'status_only' }));
});

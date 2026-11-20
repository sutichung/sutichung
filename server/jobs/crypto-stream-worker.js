'use strict';
const { createCryptoStreamEngine } = require('../lib/crypto-stream-engine');

const engine = createCryptoStreamEngine();
let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  process.stdout.write('[crypto-worker] ' + signal + ' received; draining event batches.\n');
  engine.stop().then(() => process.exit(0)).catch(error => {
    process.stderr.write('[crypto-worker] shutdown error: ' + String(error.message || error) + '\n');
    process.exit(1);
  });
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', error => process.stderr.write('[crypto-worker] unhandled rejection: ' + String(error?.stack || error) + '\n'));
const status = engine.start();
process.stdout.write('[crypto-worker] started ' + JSON.stringify(status) + '\n');

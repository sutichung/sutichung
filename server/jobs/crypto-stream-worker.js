'use strict';

// Safety seal: the crypto stream worker must not start until the feature is formally re-approved.
process.stderr.write('[crypto-worker] disabled: crypto market feature is sealed pending data licensing, reliability and product readiness approval.\n');
process.exitCode = 1;

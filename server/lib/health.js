'use strict';

function buildRuntimeHealth(options = {}) {
  const expected = Number(options.expectedInstances ?? process.env.EXPECTED_INSTANCE_COUNT);
  const expectedInstances = Number.isInteger(expected) && expected > 0 ? expected : null;
  return {
    ok: true,
    status: 'healthy',
    time: new Date().toISOString(),
    node: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    mode: options.mode || (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
    commit: process.env.RENDER_GIT_COMMIT || null,
    branch: process.env.RENDER_GIT_BRANCH || null,
    deployment: {
      region: options.region || process.env.APP_REGION || process.env.RENDER_REGION || 'unknown',
      service: options.service || process.env.RENDER_SERVICE_NAME || process.env.RENDER_SERVICE_ID || null,
      instance: options.instance || process.env.RENDER_INSTANCE_ID || null,
      expectedInstances,
      topologyConfigured: expectedInstances !== null
    }
  };
}

module.exports = { buildRuntimeHealth };

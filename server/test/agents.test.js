'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAiCommittee } = require('../lib/agents');

test('AI committee reports all five providers without inventing connectivity when keys are absent', async () => {
  const result = await buildAiCommittee('2330', {
    getHistory: async () => ({
      data: [{ time: '2026-11-17', open: 100, high: 105, low: 98, close: 103, volume: 1000 }],
      source: 'unit-test-history',
      asOf: '2026-11-17'
    }),
    env: {}
  });
  assert.deepEqual(result.agents.map(agent => agent.provider), ['gemini', 'groq', 'cloudflare', 'xai', 'deepseek']);
  assert.ok(result.agents.every(agent => agent.status === 'not_configured'));
  assert.equal(result.consensus, null);
});

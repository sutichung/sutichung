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
test('AI committee rejects malformed model output instead of inventing a neutral score', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        direction: '看多', score: null, confidence: 72, summary: 'test',
        scenarios: { bullish: {}, neutral: {}, bearish: {} }
      }) }] } }]
    })
  });
  try {
    const result = await buildAiCommittee('2330', {
      getHistory: async () => ({
        data: [{ time: '2026-11-17', open: 100, high: 105, low: 98, close: 103, volume: 1000 }],
        source: 'unit-test-history',
        asOf: '2026-11-17'
      }),
      env: { GEMINI_API_KEY: 'test-key' }
    });
    const gemini = result.agents.find(agent => agent.provider === 'gemini');
    assert.equal(gemini.status, 'error');
    assert.match(gemini.message, /拒絕產生預設評分/);
    assert.equal(result.consensus, null);
  } finally {
    global.fetch = originalFetch;
  }
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluateCandidate,median}=require('../lib/autonomous-learning');
const good=(ret=4)=>({netReturnPct:ret,maxDrawdownPct:12,sharpe:0.9,profitFactor:1.4,tradeCount:12});
const folds=()=>[good(3),good(4),good(5)].map(test=>({leakageFree:true,test}));

test('promotes robust walk-forward candidate only to paper trading',()=>{
 const r=evaluateCandidate({candidateId:'ema-rsi-v2',folds:folds()});
 assert.equal(r.status,'paper_candidate');assert.equal(r.eligible,true);assert.equal(r.livePromotion,false);
});
test('rejects candidates with weak out-of-sample performance',()=>{
 const f=folds();f[1].test=good(-2);
 const r=evaluateCandidate({candidateId:'weak',folds:f});
 assert.equal(r.status,'rejected');assert.ok(r.failures.includes('insufficient_fold_consistency'));
});
test('does not evaluate candidates with too few walk-forward folds',()=>{
 const r=evaluateCandidate({candidateId:'few',folds:folds().slice(0,2)});
 assert.equal(r.status,'insufficient_evidence');
});
test('requires explicit leakage-free declaration',()=>{
 const f=folds();f[0].leakageFree=false;
 assert.throws(()=>evaluateCandidate({candidateId:'leaky',folds:f}),/leakage_free/);
});
test('requires improvement over current champion',()=>{
 const r=evaluateCandidate({candidateId:'challenger',folds:folds(),champion:{netReturnPct:6,maxDrawdownPct:10,sharpe:1.2,profitFactor:1.5,tradeCount:100}});
 assert.equal(r.status,'rejected');assert.ok(r.failures.includes('does_not_improve_champion_return'));
});
test('median handles even and odd samples',()=>{assert.equal(median([1,3,2]),2);assert.equal(median([1,3]),2);});

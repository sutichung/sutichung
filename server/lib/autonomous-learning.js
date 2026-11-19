'use strict';

// Deterministic strategy-learning promotion gate.
// It evaluates out-of-sample walk-forward reports; it never places orders or
// changes production strategy configuration.
const DEFAULTS=Object.freeze({minFolds:3,minTrades:30,minProfitFactor:1.1,minSharpe:0.5,maxDrawdownPct:25,minImprovementPct:0});
const finite=(x)=>typeof x==='number'&&Number.isFinite(x);
function median(values){const a=[...values].sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function validateMetrics(metrics,label){
 if(!metrics||typeof metrics!=='object')throw new Error(label+'_metrics_missing');
 for(const k of ['netReturnPct','maxDrawdownPct','sharpe','profitFactor','tradeCount']){
  if(!finite(metrics[k]))throw new Error(label+'_invalid_'+k);
 }
 if(metrics.tradeCount<0||metrics.maxDrawdownPct<0||metrics.profitFactor<0)throw new Error(label+'_invalid_range');
}
function evaluateCandidate({candidateId,folds,champion=null,config={}}={}){
 if(typeof candidateId!=='string'||!candidateId.trim())throw new Error('candidate_id_required');
 if(!Array.isArray(folds))throw new Error('walk_forward_folds_required');
 const rules={...DEFAULTS,...config};
 if(folds.length<rules.minFolds)return {candidateId,status:'insufficient_evidence',eligible:false,reason:'insufficient_walk_forward_folds',requiredFolds:rules.minFolds,observedFolds:folds.length,livePromotion:false};
 const test=folds.map((fold,i)=>{
  if(!fold||fold.leakageFree!==true)throw new Error('fold_'+i+'_must_be_explicitly_leakage_free');
  validateMetrics(fold.test,'fold_'+i+'_test');
  return fold.test;
 });
 const totalTrades=test.reduce((s,x)=>s+x.tradeCount,0);
 const summary={
  folds:test.length,totalOutOfSampleTrades:totalTrades,
  medianNetReturnPct:median(test.map(x=>x.netReturnPct)),
  medianSharpe:median(test.map(x=>x.sharpe)),
  medianProfitFactor:median(test.map(x=>x.profitFactor)),
  worstDrawdownPct:Math.max(...test.map(x=>x.maxDrawdownPct)),
  positiveFoldCount:test.filter(x=>x.netReturnPct>0).length
 };
 const failures=[];
 if(totalTrades<rules.minTrades)failures.push('insufficient_out_of_sample_trades');
 if(summary.medianNetReturnPct<=0)failures.push('non_positive_median_out_of_sample_return');
 if(summary.medianProfitFactor<rules.minProfitFactor)failures.push('profit_factor_below_gate');
 if(summary.medianSharpe<rules.minSharpe)failures.push('sharpe_below_gate');
 if(summary.worstDrawdownPct>rules.maxDrawdownPct)failures.push('drawdown_above_gate');
 if(summary.positiveFoldCount<Math.ceil(test.length*2/3))failures.push('insufficient_fold_consistency');
 if(champion){
  validateMetrics(champion,'champion');
  if(summary.medianNetReturnPct<champion.netReturnPct+rules.minImprovementPct)failures.push('does_not_improve_champion_return');
  if(summary.medianSharpe<champion.sharpe)failures.push('does_not_improve_champion_sharpe');
 }
 return {
  candidateId,status:failures.length?'rejected':'paper_candidate',eligible:failures.length===0,
  failures,summary,livePromotion:false,
  nextStep:failures.length?'Revise or discard; do not deploy.':'Run paper trading and independent risk review; live promotion requires a separate human approval.'
 };
}
module.exports={evaluateCandidate,median,DEFAULTS};

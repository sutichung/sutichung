'use strict';
function isFresh(timestamp,maxAgeMs,now=Date.now()){
  const t=Date.parse(timestamp||'');return Number.isFinite(t)&&now-t>=-30000&&now-t<=maxAgeMs;
}
function validateCandle(c){
  const vals=['open','high','low','close','volume'].map(k=>Number(c&&c[k]));
  if(vals.some(v=>!Number.isFinite(v)||v<0))return false;
  const [o,h,l,cl]=vals;return h>=Math.max(o,l,cl)&&l<=Math.min(o,h,cl)&&h>=l;
}
function shouldAbstain({fresh,historyCount,score,confidence,backtestTrades=0,maxDrawdownPct=100}){
  const reasons=[];
  if(!fresh)reasons.push('行情資料過期或時間戳無效');
  if(historyCount<60)reasons.push('有效歷史 K 線少於 60 根');
  if(!Number.isFinite(score))reasons.push('模型分數不可用');
  if(!Number.isFinite(confidence)||confidence<0.60)reasons.push('預測信心未達 60%');
  if(backtestTrades<100)reasons.push('樣本外回測交易數不足 100 筆');
  if(maxDrawdownPct>20)reasons.push('回測最大回撤超過 20%');
  return {abstain:reasons.length>0,reasons};
}
module.exports={isFresh,validateCandle,shouldAbstain};

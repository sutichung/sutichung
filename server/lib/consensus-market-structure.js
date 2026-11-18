'use strict';

// Causal market-structure and consensus-score research.
// Swing points become visible only after the right-side confirmation bars.
// BOS/CHoCH and order blocks are recorded on the bar they are detected, never retroactively.
const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : null;
const round = (x,d=2) => Number.isFinite(x) ? Number(x.toFixed(d)) : null;
function features(bars, lookback=5) {
  const n=bars.length, out=Array(n), swings=[], blocks=[];
  const tr=Array(n).fill(null), atr=Array(n).fill(null), er=Array(n).fill(null), chop=Array(n).fill(null), volPct=Array(n).fill(null);
  const fast=Array(n).fill(null), slow=Array(n).fill(null), volZ=Array(n).fill(null), bullDist=Array(n).fill(0), bearDist=Array(n).fill(0), structure=Array(n).fill('neutral');
  for(let i=0;i<n;i++){
    const b=bars[i],prev=bars[i-1];
    tr[i]=Math.max(b.high-b.low,prev?Math.abs(b.high-prev.close):0,prev?Math.abs(b.low-prev.close):0);
    if(i>=13)atr[i]=mean(tr.slice(i-13,i+1));
    if(i>=20){
      const path=bars.slice(i-19,i+1).reduce((s,x,j,a)=>j?s+Math.abs(x.close-a[j-1].close):s,0);
      er[i]=path?Math.abs(b.close-bars[i-20].close)/path:0;
      const range=Math.max(...bars.slice(i-13,i+1).map(x=>x.high))-Math.min(...bars.slice(i-13,i+1).map(x=>x.low));
      const sum=mean(tr.slice(i-13,i+1))*14;
      chop[i]=range>0&&sum>0?100*Math.log10(sum/range)/Math.log10(14):null;
    }
    if(i>=20){fast[i]=mean(bars.slice(i-20,i+1).map(x=>x.close));}
    if(i>=54){slow[i]=mean(bars.slice(i-54,i+1).map(x=>x.close));}
    if(i>=19){
      const vols=bars.slice(i-19,i+1).map(x=>x.volume),m=mean(vols),sd=Math.sqrt(mean(vols.map(x=>(x-m)**2)));
      volZ[i]=sd?(b.volume-m)/sd:0;
    }
    if(i>=99&&atr[i]!==null){
      const hist=atr.slice(i-99,i+1).map((x,j)=>x===null?null:x/bars[i-99+j].close).filter(Number.isFinite);
      const current=atr[i]/b.close;volPct[i]=hist.filter(x=>x<=current).length/hist.length;
    }
    // A pivot at p is first knowable at i=p+lookback.
    const p=i-lookback;
    if(p>=lookback){
      const window=bars.slice(p-lookback,p+lookback+1),ph=bars[p].high,pl=bars[p].low;
      if(window.every(x=>x.high<=ph))swings.push({index:p,confirmedAt:i,price:ph,kind:'high'});
      if(window.every(x=>x.low>=pl))swings.push({index:p,confirmedAt:i,price:pl,kind:'low'});
    }
    const priorHigh=[...swings].reverse().find(x=>x.kind==='high'&&x.confirmedAt<i);
    const priorLow=[...swings].reverse().find(x=>x.kind==='low'&&x.confirmedAt<i);
    if(prev&&priorHigh&&b.close>priorHigh.price&&prev.close<=priorHigh.price){
      structure[i]='bullish_bos';
      for(let j=i-1;j>=Math.max(0,i-15);j--)if(bars[j].close<bars[j].open){blocks.push({index:j,createdAt:i,high:bars[j].high,low:bars[j].low,direction:'bullish',mitigated:false,broken:false});break;}
    }else if(prev&&priorLow&&b.close<priorLow.price&&prev.close>=priorLow.price){
      structure[i]='bearish_bos';
      for(let j=i-1;j>=Math.max(0,i-15);j--)if(bars[j].close>bars[j].open){blocks.push({index:j,createdAt:i,high:bars[j].high,low:bars[j].low,direction:'bearish',mitigated:false,broken:false});break;}
    }
    for(const ob of blocks)if(!ob.mitigated&&!ob.broken&&ob.createdAt<i){
      if(ob.direction==='bullish'){if(b.close<ob.low)ob.broken=true;else if(b.low<=ob.high)ob.mitigated=true;}
      else {if(b.close>ob.high)ob.broken=true;else if(b.high>=ob.low)ob.mitigated=true;}
    }
    const activeBull=[...blocks].reverse().find(x=>x.direction==='bullish'&&!x.mitigated&&!x.broken&&x.createdAt<i);
    const activeBear=[...blocks].reverse().find(x=>x.direction==='bearish'&&!x.mitigated&&!x.broken&&x.createdAt<i);
    if(activeBull&&atr[i]>0)bullDist[i]=(b.close-(activeBull.high+activeBull.low)/2)/atr[i];
    if(activeBear&&atr[i]>0)bearDist[i]=(b.close-(activeBear.high+activeBear.low)/2)/atr[i];
    out[i]={atr:atr[i],er:er[i],chop:chop[i],volPercentile:volPct[i],fast:fast[i],slow:slow[i],trendDir:fast[i]!==null&&slow[i]!==null?(fast[i]>slow[i]?1:-1):0,volZ:volZ[i],nearestBullOb:bullDist[i],nearestBearOb:bearDist[i],structure:structure[i],swingCount:swings.length};
  }
  return out;
}
function score(f){
  let value=0;const reasons=[];
  if(f.trendDir===1&&f.er>0.3){value+=1.2;reasons.push('有效上升趨勢');}
  else if(f.trendDir===1&&f.er>0.18){value+=0.6;reasons.push('弱上升趨勢');}
  if(f.chop<45&&f.volPercentile<0.85){value+=1;reasons.push('波動可控');}
  else if(f.chop>61){value-=1.5;reasons.push('高度盤整');}
  if(f.nearestBullOb>-1.5&&f.nearestBullOb<0.3){value+=1.3;reasons.push('接近多頭訂單區');}
  if(f.nearestBullOb<-2.5)value-=0.8;
  if(f.volZ>1.1){value+=0.7;reasons.push('量能放大');}
  if(f.er<0.12){value-=2;reasons.push('效率過低');}
  if(f.structure==='bullish_bos'){value+=0.8;reasons.push('多頭結構突破');}
  if(f.structure==='bearish_bos'){value-=0.8;reasons.push('空頭結構突破');}
  return {value,reasons};
}
function simulate(bars,fs,start,end,costs,minScore){
  const fee=costs.feeBps/10000,slip=costs.slippageBps/10000,tax=costs.sellTaxBps/10000;
  let cash=100000,qty=0,entryCost=0,entryIndex=-1,entryScore=0,entryReasons=[],peak=cash,maxDD=0;
  const curve=[cash],trades=[],returns=[];
  for(let i=start;i<end-1;i++){
    const f=fs[i],s=score(f),enter=s.value>=minScore,exit=s.value<1;
    const next=bars[i+1];
    if(qty>0&&exit){
      const fill=next.open*(1-slip),proceeds=qty*fill*(1-fee-tax);
      trades.push({pnl:proceeds-entryCost,returnPct:(proceeds/entryCost-1)*100,holdBars:i+1-entryIndex,score:entryScore,reasons:entryReasons});
      cash+=proceeds;qty=0;entryCost=0;entryIndex=-1;entryReasons=[];
    }else if(qty===0&&enter){
      const budget=cash*0.88,fill=next.open*(1+slip);
      qty=budget/(fill*(1+fee));entryCost=qty*fill*(1+fee);cash-=entryCost;entryIndex=i+1;entryScore=s.value;entryReasons=s.reasons;
    }
    const equity=cash+qty*next.close,prior=curve.at(-1);curve.push(equity);
    returns.push(prior?equity/prior-1:0);peak=Math.max(peak,equity);maxDD=Math.min(maxDD,equity/peak-1);
  }
  if(qty>0){const last=bars[end-1],fill=last.close*(1-slip),proceeds=qty*fill*(1-fee-tax);trades.push({pnl:proceeds-entryCost,returnPct:(proceeds/entryCost-1)*100,holdBars:end-1-entryIndex,score:entryScore,reasons:entryReasons,periodEndClose:true});cash+=proceeds;curve.push(cash);}
  const wins=trades.filter(t=>t.pnl>0),losses=trades.filter(t=>t.pnl<0),avg=mean(returns)||0,sd=returns.length?Math.sqrt(mean(returns.map(x=>(x-avg)**2))):0,down=returns.length?Math.sqrt(mean(returns.map(x=>Math.min(0,x)**2))):0;
  const gw=wins.reduce((s,t)=>s+t.pnl,0),gl=-losses.reduce((s,t)=>s+t.pnl,0);
  return {status:trades.length?'ok':'no_trades',trades:trades.length,wins:wins.length,losses:losses.length,winRatePct:trades.length?round(wins.length/trades.length*100):null,netReturnPct:round((cash/100000-1)*100),maxDrawdownPct:round(maxDD*100),sharpe:sd?round(avg/sd*Math.sqrt(costs.annualization),3):null,sortino:down?round(avg/down*Math.sqrt(costs.annualization),3):null,profitFactor:gl?round(gw/gl,3):gw?null:0,expectancyPct:trades.length?round(mean(trades.map(t=>t.returnPct))):null,averageEntryScore:trades.length?round(mean(trades.map(t=>t.score))):null,finalEquity:round(cash),tradeDetails:trades};
}
function runConsensusResearch(input, options={}) {
  if(!Array.isArray(input)||input.length<130)return {status:'insufficient_data',error:'共識策略至少需要 130 根 OHLCV K 線',strategies:[]};
  const bars=input.map(x=>({time:x.time??null,open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume)}));
  for(let i=0;i<bars.length;i++){const b=bars[i];if(![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.open<=0||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close,b.high)||b.volume<0)return {status:'invalid_data',error:'共識策略收到無效 OHLCV',invalidIndex:i,strategies:[]};}
  const market=options.market||'tw-stock',defaults=market==='crypto'?{feeBps:10,slippageBps:5,sellTaxBps:0,annualization:365}:market==='us-stock'?{feeBps:1,slippageBps:5,sellTaxBps:0,annualization:252}:{feeBps:14.25,slippageBps:10,sellTaxBps:30,annualization:252};
  const costs={...defaults,...options};
  for(const key of ['feeBps','slippageBps','sellTaxBps'])if(!Number.isFinite(Number(costs[key]))||Number(costs[key])<0||Number(costs[key])>1000)return {status:'invalid_costs',error:'交易成本參數必須介於 0 到 1000 bps',strategies:[]};
  const fs=features(bars,5),split=Math.floor(bars.length*0.6),start=60;
  const periods=[{id:'in_sample',label:'訓練區間',start,end:split},{id:'out_of_sample',label:'樣本外區間',start:split,end:bars.length}].map(p=>({...p,metrics:simulate(bars,fs,p.start,p.end,costs,3.5)}));
  const folds=[],size=Math.floor((bars.length-split)/3);
  if(size>=3)for(let k=0;k<3;k++){const a=split+k*size,b=k===2?bars.length:split+(k+1)*size;folds.push({fold:k+1,metrics:simulate(bars,fs,a,b,costs,3.5)});}
  const oos=periods[1].metrics,valid=folds.filter(x=>x.metrics.trades>0),count=valid.reduce((s,x)=>s+x.metrics.trades,0),positive=valid.filter(x=>x.metrics.netReturnPct>0).length;
  const wfPassed=folds.length===3&&valid.length===3&&count>=10&&positive>=2&&valid.every(x=>x.metrics.netReturnPct!==null);
  const half=simulate(bars,fs,split,bars.length,{...costs,feeBps:costs.feeBps/2,slippageBps:costs.slippageBps/2,sellTaxBps:costs.sellTaxBps/2},3.5);
  const doubled=simulate(bars,fs,split,bars.length,{...costs,feeBps:costs.feeBps*2,slippageBps:costs.slippageBps*2,sellTaxBps:costs.sellTaxBps*2},3.5);
  const passed=oos.trades>=10&&oos.netReturnPct>0&&oos.maxDrawdownPct<=15&&oos.sharpe>0&&oos.profitFactor>1.1&&wfPassed;
  return {status:'ok',id:'consensus_market_structure',name:'多維度市場結構共識評分',category:'market_structure',description:'Efficiency Ratio、Choppiness、波動分位數、Swing、BOS、Order Block、量能異常多因子評分',features:fs.slice(-120),periods,walkForward:{passed:!!wfPassed,folds,totalTrades:count,positiveFolds:positive},costSensitivity:{halfCost:half,baseCost:oos,doubleCost:doubled,doubleCostStillPositive:doubled.netReturnPct>0},validation:{passed:!!passed,status:passed?'preliminary_pass':'not_validated',level:'single_holdout_plus_three_walk_forward_folds'},disclaimer:'Swing 僅在右側 5 根 K 線完成後確認；BOS 與訂單區僅自確認當根起可用，不回填至歷史。訊號於收盤後計算，下一根開盤成交。OB 為簡化價格區域代理，不代表真實機構掛單或必然支撐阻力。研究結果不構成投資建議。'};
}
module.exports={runConsensusResearch,features,score};

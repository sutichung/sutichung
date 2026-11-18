'use strict';

// Four additional deterministic strategies ported from the supplied CCXT/Python design.
// Signals are evaluated only after a completed candle and filled at the next candle open.
const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
const sma = (xs,n) => xs.length >= n ? mean(xs.slice(-n)) : null;
const emaSeries = (xs,n) => {
  const out=Array(xs.length).fill(null), k=2/(n+1); let v=null,count=0;
  xs.forEach((x,i)=>{if(x===null||x===undefined||!Number.isFinite(Number(x)))return;const value=Number(x);v=v===null?value:k*value+(1-k)*v;count++;if(count>=n)out[i]=v;});
  return out;
};
function buildSignals(bars) {
  const c=bars.map(x=>+x.close), h=bars.map(x=>+x.high), l=bars.map(x=>+x.low);
  const e12=emaSeries(c,12),e26=emaSeries(c,26),macd=e12.map((x,i)=>x===null||e26[i]===null?null:x-e26[i]);
  const ms=emaSeries(macd,9);
  const atr=Array(c.length).fill(null),rsi=Array(c.length).fill(null),bbMid=Array(c.length).fill(null),bbLower=Array(c.length).fill(null);
  for(let i=1;i<c.length;i++){
    const tr=[];for(let j=Math.max(1,i-13);j<=i;j++)tr.push(Math.max(h[j]-l[j],Math.abs(h[j]-c[j-1]),Math.abs(l[j]-c[j-1])));
    atr[i]=mean(tr);
    if(i>=14){let g=0,loss=0;for(let j=i-13;j<=i;j++){const d=c[j]-c[j-1];g+=Math.max(d,0);loss+=Math.max(-d,0);}rsi[i]=loss===0?(g===0?50:100):100-100/(1+g/loss);}
    if(i>=19){const w=c.slice(i-19,i+1),m=mean(w),sd=Math.sqrt(mean(w.map(x=>(x-m)**2)));bbMid[i]=m;bbLower[i]=m-2*sd;}
  }
  // Wilder-style trailing bands and direction for a SuperTrend-like ATR trend.
  const stDir=Array(c.length).fill(1),finalUpper=Array(c.length).fill(null),finalLower=Array(c.length).fill(null);
  for(let i=0;i<c.length;i++){
    if(atr[i]===null)continue;
    const mid=(h[i]+l[i])/2,bu=mid+3*atr[i],bl=mid-3*atr[i];
    if(i===0||finalUpper[i-1]===null){finalUpper[i]=bu;finalLower[i]=bl;continue;}
    finalUpper[i]=(bu<finalUpper[i-1]||c[i-1]>finalUpper[i-1])?bu:finalUpper[i-1];
    finalLower[i]=(bl>finalLower[i-1]||c[i-1]<finalLower[i-1])?bl:finalLower[i-1];
    stDir[i]=stDir[i-1];
    if(stDir[i-1]===1&&c[i]<finalLower[i])stDir[i]=-1;
    else if(stDir[i-1]===-1&&c[i]>finalUpper[i])stDir[i]=1;
  }
  const out=[];
  for(let i=0;i<c.length;i++){
    const prevHigh=i>=20?Math.max(...h.slice(i-20,i)):null;
    const prevLow10=i>=10?Math.min(...l.slice(i-10,i)):null;
    const sma20=i>=19?sma(c.slice(0,i+1),20):null;
    const sma50=i>=49?sma(c.slice(0,i+1),50):null;
    const prevSma20=i>=20?sma(c.slice(0,i),20):null;
    const prevSma50=i>=50?sma(c.slice(0,i),50):null;
    const histogram=macd[i]===null||ms[i]===null?null:macd[i]-ms[i];
    const prevHist=i>0&&macd[i-1]!==null&&ms[i-1]!==null?macd[i-1]-ms[i-1]:null;
    out.push({sma20,sma50,prevSma20,prevSma50,prevHigh20:prevHigh,prevLow10,
      rsi:rsi[i],bbMid:bbMid[i],bbLower:bbLower[i],atr:atr[i],
      supertrendDirection:stDir[i],previousSupertrendDirection:i?stDir[i-1]:null,
      histogram,previousHistogram:prevHist});
  }
  return out;
}
function signal(id,b,f){
  if(id==='sma_cross_20_50')return {
    enter:f.prevSma20!==null&&f.prevSma50!==null&&f.sma20>f.sma50&&f.prevSma20<=f.prevSma50,
    exit:f.prevSma20!==null&&f.prevSma50!==null&&f.sma20<f.sma50&&f.prevSma20>=f.prevSma50
  };
  if(id==='donchian_20_10')return {enter:f.prevHigh20!==null&&b.close>f.prevHigh20,exit:f.prevLow10!==null&&b.close<f.prevLow10};
  if(id==='bollinger_rsi')return {enter:f.bbLower!==null&&f.rsi!==null&&b.close<f.bbLower&&f.rsi<35,exit:(f.bbMid!==null&&b.close>f.bbMid)||(f.rsi!==null&&f.rsi>65)};
  return {enter:f.supertrendDirection===1&&f.previousSupertrendDirection===-1,exit:f.supertrendDirection===-1&&f.previousSupertrendDirection===1};
}
const defs=[
  {id:'sma_cross_20_50',name:'SMA Cross 20/50',description:'20／50 日期均線黃金交叉與死亡交叉',entry:'SMA20 上穿 SMA50',exit:'SMA20 下穿 SMA50'},
  {id:'donchian_20_10',name:'Donchian Breakout 20/10',description:'唐奇安通道突破；只比較訊號 K 線之前的區間高低點',entry:'收盤突破前 20 根最高價',exit:'收盤跌破前 10 根最低價'},
  {id:'bollinger_rsi',name:'Bollinger + RSI',description:'布林下軌與 RSI 超賣的均值回歸策略',entry:'收盤低於布林下軌且 RSI < 35',exit:'收盤高於中軌或 RSI > 65'},
  {id:'supertrend_atr',name:'SuperTrend ATR 14/3',description:'14 根滾動 ATR 風險通道方向翻轉，採 3 倍通道',entry:'SuperTrend 由空翻多',exit:'SuperTrend 由多翻空'}
];
function runPeriod(bars,features,id,start,end,costs){
  const fee=costs.feeBps/10000,slip=costs.slippageBps/10000,tax=costs.sellTaxBps/10000;
  let cash=100000,qty=0,entryValue=0,entryTime=null,peak=100000,maxDD=0;
  const curve=[cash],trades=[],periodReturns=[];
  for(let i=start;i<end-1;i++){
    const sig=signal(id,bars[i],features[i]),next=bars[i+1];
    if(qty>0&&sig.exit){
      const fill=next.open*(1-slip),proceeds=qty*fill*(1-fee-tax),pnl=proceeds-entryValue;
      cash+=proceeds;trades.push({pnl,returnPct:entryValue?pnl/entryValue*100:0,holdBars:i+1-entryTime});
      qty=0;entryValue=0;entryTime=null;
    }else if(qty===0&&sig.enter){
      const budget=cash*0.95,fill=next.open*(1+slip);
      qty=budget/(fill*(1+fee));entryValue=qty*fill*(1+fee);cash-=entryValue;entryTime=i+1;
    }
    const eq=cash+qty*next.close;curve.push(eq);
    const prior=curve.length>1?curve[curve.length-2]:100000;
    periodReturns.push(prior?eq/prior-1:0);peak=Math.max(peak,eq);maxDD=Math.min(maxDD,eq/peak-1);
  }
  if(qty>0){
    const last=bars[end-1],fill=last.close*(1-slip),proceeds=qty*fill*(1-fee-tax),pnl=proceeds-entryValue;
    cash+=proceeds;trades.push({pnl,returnPct:entryValue?pnl/entryValue*100:0,holdBars:end-1-entryTime,periodEndClose:true});
    qty=0;
    const priorEquity=curve.length?curve[curve.length-1]:100000;
    periodReturns.push(priorEquity?cash/priorEquity-1:0);
    peak=Math.max(peak,cash);maxDD=Math.min(maxDD,cash/peak-1);curve.push(cash);
  }
  const finalEquity=cash,netReturnPct=(finalEquity/100000-1)*100;
  const wins=trades.filter(t=>t.pnl>0),losses=trades.filter(t=>t.pnl<0);
  const avg=periodReturns.length?mean(periodReturns):0,sd=periodReturns.length?Math.sqrt(mean(periodReturns.map(x=>(x-avg)**2))):0;
  const downside=periodReturns.length?Math.sqrt(mean(periodReturns.map(x=>Math.min(0,x)**2))):0;
  const grossWin=wins.reduce((s,t)=>s+t.pnl,0),grossLoss=-losses.reduce((s,t)=>s+t.pnl,0);
  return {status:trades.length?'ok':'no_trades',trades:trades.length,winRatePct:trades.length?wins.length/trades.length*100:null,
    netReturnPct,maxDrawdownPct:-maxDD*100,sharpe:sd?avg/sd*Math.sqrt(costs.annualization):null,
    sortino:downside?avg/downside*Math.sqrt(costs.annualization):null,
    profitFactor:grossLoss?grossWin/grossLoss:grossWin?null:0,
    expectancyPct:trades.length?mean(trades.map(t=>t.returnPct)):null,
    finalEquity,tradeDetails:trades};
}
function regime(bars){if(!bars.length)return {regime:'unknown',periodReturnPct:null};const pct=(bars.at(-1).close/bars[0].close-1)*100;return {regime:pct>=8?'bullish':pct<=-8?'bearish':'sideways',periodReturnPct:pct};}
function runAdvancedStrategies(bars,split,costs){
  const features=buildSignals(bars),out=[];
  for(const def of defs){
    const periods=[
      {id:'in_sample',label:'訓練區間',start:60,end:split},
      {id:'out_of_sample',label:'樣本外區間',start:split,end:bars.length}
    ].filter(p=>p.end-p.start>=3).map(p=>({...p,metrics:runPeriod(bars,features,def.id,p.start,p.end,costs),marketRegime:regime(bars.slice(p.start,p.end))}));
    const oos=periods.find(p=>p.id==='out_of_sample')?.metrics||{};
    const folds=[];const size=Math.floor((bars.length-split)/3);
    if(size>=3)for(let k=0;k<3;k++){const start=split+k*size,end=k===2?bars.length:split+(k+1)*size;folds.push({fold:k+1,metrics:runPeriod(bars,features,def.id,start,end,costs),marketRegime:regime(bars.slice(start,end))});}
    const valid=folds.filter(x=>x.metrics.trades>0),totalTrades=valid.reduce((s,x)=>s+x.metrics.trades,0),positiveFolds=valid.filter(x=>x.metrics.netReturnPct>0).length;
    const averageNetReturnPct=valid.length?mean(valid.map(x=>x.metrics.netReturnPct)):null;
    const worstMaxDrawdownPct=valid.length?Math.max(...valid.map(x=>x.metrics.maxDrawdownPct)):null;
    const averageSharpe=valid.length&&valid.every(x=>x.metrics.sharpe!==null)?mean(valid.map(x=>x.metrics.sharpe)):null;
    const wfPassed=folds.length===3&&valid.length===3&&totalTrades>=10&&positiveFolds>=2&&averageNetReturnPct>0&&worstMaxDrawdownPct<=15&&averageSharpe!==null&&averageSharpe>0;
    const half=runPeriod(bars,features,def.id,split,bars.length,{...costs,feeBps:costs.feeBps/2,slippageBps:costs.slippageBps/2,sellTaxBps:costs.sellTaxBps/2});
    const doubled=runPeriod(bars,features,def.id,split,bars.length,{...costs,feeBps:costs.feeBps*2,slippageBps:costs.slippageBps*2,sellTaxBps:costs.sellTaxBps*2});
    const passed=oos.trades>=10&&oos.netReturnPct>0&&oos.maxDrawdownPct<=15&&oos.sharpe>0&&oos.profitFactor>1.1&&wfPassed;
    out.push({...def,periods,walkForward:{passed:wfPassed,folds,totalTrades,positiveFolds,averageNetReturnPct,worstMaxDrawdownPct,averageSharpe},
      costSensitivity:{halfCost:half,baseCost:oos,doubleCost:doubled,doubleCostStillPositive:doubled.netReturnPct>0},
      validation:{passed,status:passed?'preliminary_pass':'not_validated',level:'single_holdout_plus_three_walk_forward_folds'}});
  }
  return out;
}
module.exports={runAdvancedStrategies,buildSignals,defs};

'use strict';

// 4h execution with a strictly completed 1d trend filter.
// Daily candles are only visible after their full 24h interval has elapsed.
// Swing pivots are only exposed after right-side confirmation bars.
const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
const round = (x,d=2) => Number.isFinite(x) ? Number(x.toFixed(d)) : null;
const DAY = 86400000;
function timeMs(x){if(typeof x==='number'&&Number.isFinite(x))return x<1e12?x*1000:x;const s=String(x??'').trim();if(/^\d{10,13}$/.test(s)){const n=Number(s);return n<1e12?n*1000:n;}const n=Date.parse(s);return Number.isFinite(n)?n:NaN;}
function validate(rows,label){
  if(!Array.isArray(rows)||rows.length<1)throw new Error(label+' 缺少 K 線資料');
  let last=-Infinity;
  for(let i=0;i<rows.length;i++){
    const b=rows[i],t=timeMs(b.time??b.openTime);
    const vals=[b.open,b.high,b.low,b.close,b.volume].map(Number);
    if(!Number.isFinite(t)||t<=last)throw new Error(label+' 時間必須有效、遞增且不可重複');
    const [o,h,l,c,v]=vals;
    if(!vals.every(Number.isFinite)||o<=0||h<=0||l<=0||c<=0||v<0||h<Math.max(o,c,l)||l>Math.min(o,c,h))throw new Error(label+' OHLCV 格式錯誤，位置 '+i);
    last=t;
  }
}
function dailyTrendMap(daily, intradayTimes){
  const closes=daily.map(x=>Number(x.close)),out=Array(intradayTimes.length).fill(0);
  const trends=Array(daily.length).fill(0);
  let sum50=0,sum200=0;
  for(let i=0;i<daily.length;i++){
    sum50+=closes[i];sum200+=closes[i];
    if(i>=50)sum50-=closes[i-50];
    if(i>=200)sum200-=closes[i-200];
    if(i>=199){const sma50=sum50/50,sma200=sum200/200;trends[i]=sma50>sma200?1:-1;}
  }
  let j=-1;
  for(let i=0;i<intradayTimes.length;i++){
    const t=timeMs(intradayTimes[i]);
    while(j+1<daily.length&&timeMs(daily[j+1].time??daily[j+1].openTime)+DAY<=t)j++;
    out[i]=j>=199?trends[j]:0;
  }
  return out;
}
function buildFeatures(bars){
  const n=bars.length,atr=Array(n).fill(null),er=Array(n).fill(null),chop=Array(n).fill(null),volPct=Array(n).fill(null),trend=Array(n).fill(0),volZ=Array(n).fill(null),bullDist=Array(n).fill(null),structure=Array(n).fill('neutral');
  const tr=Array(n).fill(0),swings=[],blocks=[];
  for(let i=0;i<n;i++){
    const b=bars[i],prev=bars[i-1];
    tr[i]=Math.max(b.high-b.low,prev?Math.abs(b.high-prev.close):0,prev?Math.abs(b.low-prev.close):0);
    if(i>=13)atr[i]=mean(tr.slice(i-13,i+1));
    if(i>=20){
      const path=bars.slice(i-19,i+1).reduce((s,x,k,a)=>k?s+Math.abs(x.close-a[k-1].close):s,0);
      er[i]=path?Math.abs(b.close-bars[i-20].close)/path:0;
    }
    if(i>=13){
      const sum=tr.slice(i-13,i+1).reduce((a,x)=>a+x,0);
      const range=Math.max(...bars.slice(i-13,i+1).map(x=>x.high))-Math.min(...bars.slice(i-13,i+1).map(x=>x.low));
      chop[i]=sum>0&&range>0?100*Math.log10(sum/range)/Math.log10(14):null;
    }
    if(i>=54)trend[i]=mean(bars.slice(i-20,i+1).map(x=>x.close))>mean(bars.slice(i-54,i+1).map(x=>x.close))?1:-1;
    if(i>=19){const vs=bars.slice(i-19,i+1).map(x=>x.volume),m=mean(vs),sd=Math.sqrt(mean(vs.map(x=>(x-m)**2)));volZ[i]=sd?(b.volume-m)/sd:0;}
    if(i>=99&&atr[i]!==null){
      const hist=atr.slice(i-99,i+1).map((x,k)=>x===null?null:x/bars[i-99+k].close).filter(Number.isFinite);
      const current=atr[i]/b.close;volPct[i]=hist.filter(x=>x<=current).length/hist.length;
    }
    const p=i-5;
    if(p>=5){
      const w=bars.slice(p-5,p+6);
      if(w.every(x=>x.high<=bars[p].high))swings.push({index:p,confirmedAt:i,price:bars[p].high,kind:'high'});
      if(w.every(x=>x.low>=bars[p].low))swings.push({index:p,confirmedAt:i,price:bars[p].low,kind:'low'});
    }
    const ph=[...swings].reverse().find(x=>x.kind==='high'&&x.confirmedAt<i);
    const pl=[...swings].reverse().find(x=>x.kind==='low'&&x.confirmedAt<i);
    if(prev&&ph&&b.close>ph.price&&prev.close<=ph.price){
      structure[i]='bullish_bos';
      for(let k=i-1;k>=Math.max(0,i-12);k--)if(bars[k].close<bars[k].open){blocks.push({createdAt:i,high:bars[k].high,low:bars[k].low,active:true});break;}
    }else if(prev&&pl&&b.close<pl.price&&prev.close>=pl.price)structure[i]='bearish_bos';
    for(const ob of blocks)if(ob.active&&ob.createdAt<i){if(b.close<ob.low||b.low<=ob.high)ob.active=false;}
    const ob=[...blocks].reverse().find(x=>x.active&&x.createdAt<i);
    if(ob&&atr[i]>0)bullDist[i]=(b.close-(ob.high+ob.low)/2)/atr[i];
  }
  return bars.map((b,i)=>({atr:atr[i],er:er[i],chop:chop[i],volPct:volPct[i],trend:trend[i],volZ:volZ[i],bullDist:bullDist[i],structure:structure[i]}));
}
function score(f,htf){
  let s=0;const reasons=[];
  if(htf===1){s+=1.5;reasons.push('日線多頭');}
  else if(htf===-1){s-=1.8;reasons.push('日線空頭過濾');}
  if(f.er!==null&&f.chop!==null&&f.er>0.28&&f.chop<48){s+=1.4;reasons.push('高效率低切換');}
  else if((f.er!==null&&f.er<0.13)||(f.chop!==null&&f.chop>62)){s-=2.2;reasons.push('低效率／高切換重罰');}
  if(f.bullDist!==null&&f.bullDist>-1.8&&f.bullDist<0.4){s+=1.6;reasons.push('接近多頭 OB');}
  if(f.bullDist!==null&&f.bullDist<-3)s-=1;
  if(f.volPct!==null&&f.volPct>0.88){s-=1.7;reasons.push('極端波動防禦');}
  if(f.volZ!==null&&f.volZ>1.2){s+=0.7;reasons.push('量能確認');}
  if(f.trend===1){s+=0.8;reasons.push('4h 趨勢向上');}
  if(f.structure==='bullish_bos'){s+=0.8;reasons.push('多頭結構突破');}
  return {value:s,reasons};
}
function simulate(bars,fs,htf,start,end,costs){
  const fee=costs.feeBps/10000,slip=costs.slippageBps/10000,tax=costs.sellTaxBps/10000;
  let cash=100000,qty=0,entryCost=0,entryIndex=-1,peak=cash,maxDD=0;
  const trades=[],returns=[];
  for(let i=start;i<end-1;i++){
    const sc=score(fs[i],htf[i]),next=bars[i+1];
    const prevEquity=cash+qty*bars[i].close;
    if(qty>0&&sc.value<1.8){
      const fill=next.open*(1-slip),proceeds=qty*fill*(1-fee-tax);
      trades.push({pnl:proceeds-entryCost,returnPct:(proceeds/entryCost-1)*100,holdBars:i+1-entryIndex});
      cash+=proceeds;qty=0;entryCost=0;entryIndex=-1;
    }else if(qty===0&&sc.value>=4){
      const fill=next.open*(1+slip),budget=cash*0.85;
      qty=budget/(fill*(1+fee));entryCost=qty*fill*(1+fee);cash-=entryCost;entryIndex=i+1;
    }
    const eq=cash+qty*next.close;
    returns.push(prevEquity>0?eq/prevEquity-1:0);
    peak=Math.max(peak,eq);maxDD=Math.min(maxDD,eq/peak-1);
  }
  if(qty>0){const last=bars[end-1],preLiquidationEquity=cash+qty*last.close,fill=last.close*(1-slip),proceeds=qty*fill*(1-fee-tax);trades.push({pnl:proceeds-entryCost,returnPct:(proceeds/entryCost-1)*100,holdBars:end-1-entryIndex,periodEndClose:true});cash+=proceeds;returns.push(preLiquidationEquity>0?cash/preLiquidationEquity-1:0);peak=Math.max(peak,cash);maxDD=Math.min(maxDD,cash/peak-1);}
  const wins=trades.filter(t=>t.pnl>0),losses=trades.filter(t=>t.pnl<0),avg=mean(returns)||0,sd=returns.length?Math.sqrt(mean(returns.map(x=>(x-avg)**2))):0,down=returns.length?Math.sqrt(mean(returns.map(x=>Math.min(0,x)**2))):0;
  const gw=wins.reduce((s,t)=>s+t.pnl,0),gl=-losses.reduce((s,t)=>s+t.pnl,0);
  return {status:trades.length?'ok':'no_trades',trades:trades.length,winRatePct:trades.length?round(wins.length/trades.length*100):null,netReturnPct:round((cash/100000-1)*100),maxDrawdownPct:round(Math.abs(maxDD)*100),sharpe:sd?round(avg/sd*Math.sqrt(costs.annualization),3):null,profitFactor:gl?round(gw/gl,3):gw?null:0,expectancyPct:trades.length?round(mean(trades.map(t=>t.returnPct))):null,finalEquity:round(cash),tradeDetails:trades};
}
function runMtfStrategy(intraday,daily,costs){
  try{validate(intraday,'4h');validate(daily,'1d');}catch(e){return {status:'invalid_data',error:e.message};}
  if(intraday.length<220||daily.length<200)return {status:'insufficient_data',error:'MTF 至少需要 220 根 4h K 線與 200 根已完成日線 K 線'};
  const bars=intraday.map(x=>({time:x.time??x.openTime,open:+x.open,high:+x.high,low:+x.low,close:+x.close,volume:+x.volume}));
  const days=daily.map(x=>({time:x.time??x.openTime,open:+x.open,high:+x.high,low:+x.low,close:+x.close,volume:+x.volume}));
  const htf=dailyTrendMap(days,bars.map(x=>x.time)),fs=buildFeatures(bars),split=Math.floor(bars.length*0.6),periods=[];
  for(const p of [{id:'in_sample',label:'訓練區間',start:60,end:split},{id:'out_of_sample',label:'樣本外區間',start:split,end:bars.length}])periods.push({...p,metrics:simulate(bars,fs,htf,p.start,p.end,mtfCosts)});
  const folds=[],size=Math.floor((bars.length-split)/3);
  if(size>=3)for(let k=0;k<3;k++){const a=split+k*size,b=k===2?bars.length:split+(k+1)*size;folds.push({fold:k+1,metrics:simulate(bars,fs,htf,a,b,mtfCosts)});}
  const valid=folds.filter(x=>x.metrics.trades>0),totalTrades=valid.reduce((s,x)=>s+x.metrics.trades,0),positiveFolds=valid.filter(x=>x.metrics.netReturnPct>0).length;
  const averageNetReturnPct=valid.length?mean(valid.map(x=>x.metrics.netReturnPct)):null;
  const worstMaxDrawdownPct=valid.length?Math.max(...valid.map(x=>x.metrics.maxDrawdownPct)):null;
  const averageSharpe=valid.length&&valid.every(x=>x.metrics.sharpe!==null)?mean(valid.map(x=>x.metrics.sharpe)):null;
  const wfPassed=folds.length===3&&valid.length===3&&totalTrades>=10&&positiveFolds>=2&&averageNetReturnPct>0&&worstMaxDrawdownPct<=15&&averageSharpe!==null&&averageSharpe>0;
  const oos=periods[1].metrics,passed=oos.trades>=10&&oos.netReturnPct>0&&oos.maxDrawdownPct<=15&&oos.sharpe>0&&oos.profitFactor>1.1&&wfPassed;
  const half=simulate(bars,fs,htf,split,bars.length,{...mtfCosts,feeBps:costs.feeBps/2,slippageBps:costs.slippageBps/2,sellTaxBps:costs.sellTaxBps/2});
  const doubled=simulate(bars,fs,htf,split,bars.length,{...mtfCosts,feeBps:costs.feeBps*2,slippageBps:costs.slippageBps*2,sellTaxBps:costs.sellTaxBps*2});
  return {status:'ok',id:'mtf_structure_4h_1d',name:'多時間框架結構共識（4h＋1d）',category:'multi_timeframe',description:'日線 SMA50/200 趨勢過濾，4h Efficiency Ratio、Choppiness、Swing/BOS、Order Block、波動分位數與量能評分',entry:'日線 SMA50 > SMA200，且 4h 共識評分 >= 4',exit:'4h 共識評分 < 1.8',timeframes:{execution:'4h',trendFilter:'1d',dailyBarsRequired:200,annualizationBarsPerYear:barsPerYear},periods,walkForward:{passed:wfPassed,folds,totalTrades,positiveFolds,averageNetReturnPct:round(averageNetReturnPct),worstMaxDrawdownPct:round(worstMaxDrawdownPct),averageSharpe:round(averageSharpe,3)},costSensitivity:{halfCost:half,baseCost:oos,doubleCost:doubled,doubleCostStillPositive:doubled.netReturnPct>0},validation:{passed,status:passed?'preliminary_pass':'not_validated',level:'single_holdout_plus_three_walk_forward_folds'},latest:{dailyTrend:htf.at(-1),score:score(fs.at(-1),htf.at(-1)).value,reasons:score(fs.at(-1),htf.at(-1)).reasons,features:fs.at(-1)},disclaimer:'只使用已完整收盤日線作為 4h 趨勢濾網；Swing 需右側 5 根確認，BOS/OB 僅在偵測當根之後可用。訊號於 4h 收盤後計算，下一根 4h 開盤成交。簡化 OB 不代表真實機構掛單。回測仍未完整模擬市場微結構、滑價跳空、交易所停牌或資料供應限制；未通過驗證不得當作實盤推薦。'};
}
module.exports={runMtfStrategy,dailyTrendMap,buildFeatures,score,simulate};

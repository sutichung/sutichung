'use strict';

const { indicators } = require('./indicators');
const { runAdvancedStrategies } = require('./advanced-strategies');
const { runConsensusResearch } = require('./consensus-market-structure');
const { runMtfStrategy } = require('./mtf-structure-strategy');
const { evaluateCandidate } = require('./autonomous-learning');

const STRATEGIES = [
  {id:'ema_trend_rsi',name:'EMA 趨勢＋RSI',category:'trend',description:'EMA20/EMA60 趨勢交叉，RSI 作動能確認',entry:'EMA20 上穿 EMA60 且 RSI 50–68',exit:'EMA20 下穿 EMA60 或 RSI > 75'},
  {id:'macd_momentum',name:'MACD 動能翻正',category:'momentum',description:'MACD 柱體由負轉正，並要求 RSI 動能確認',entry:'MACD Histogram 上穿 0 且 RSI > 50',exit:'MACD Histogram 下穿 0 或 RSI < 45'},
  {id:'bb_mean_reversion',name:'布林通道均值回歸',category:'mean_reversion',description:'價格跌破布林下軌且 RSI 超賣後，等待回歸中軌',entry:'收盤低於布林下軌且 RSI < 35',exit:'收盤回到中軌或 RSI >= 55'}
];

const MARKET_TYPES = new Set(['tw-stock','us-stock','crypto']);
const finite = x => x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const round = (x,d=2) => Number.isFinite(x) ? Number(x.toFixed(d)) : null;
function parseCandleTime(value){
  if(typeof value==='number'&&Number.isFinite(value))return value<1e12?value*1000:value;
  const text=String(value??'').trim();
  if(/^\d{10,13}$/.test(text)){const n=Number(text);return n<1e12?n*1000:n;}
  return Date.parse(text);
}

function normalizeCandleTime(value) {
  if(value===null||value===undefined||value==='')return null;
  let timestamp;
  if(typeof value==='number'||/^-?\d+(?:\.\d+)?$/.test(String(value).trim())){
    const numeric=Number(value);
    timestamp=Math.abs(numeric)<1e12?numeric*1000:numeric;
  }else timestamp=Date.parse(String(value));
  if(!Number.isFinite(timestamp)||timestamp<=0)return null;
  const date=new Date(timestamp);
  return Number.isFinite(date.getTime())?date.toISOString():null;
}

function inferAnnualization(candles,market='tw-stock'){
  const times=candles.map(x=>parseCandleTime(x.time??x.openTime)).filter(Number.isFinite);
  const diffs=times.slice(1).map((t,i)=>t-times[i]).filter(x=>x>0&&x<=7*86400000).sort((a,b)=>a-b);
  const intervalMs=diffs.length?diffs[Math.floor(diffs.length/2)]:86400000;
  if(intervalMs>=18*3600000)return {annualization:market==='crypto'?365:252,barIntervalMs:intervalMs};
  const tradingHours=market==='crypto'?24:market==='us-stock'?6.5:4.5;
  const base=market==='crypto'?365:252;
  return {annualization:Math.max(1,Math.round(base*tradingHours*3600000/intervalMs)),barIntervalMs:intervalMs};
}

function validateCandles(input) {
  if (!Array.isArray(input) || input.length < 130) return {ok:false,error:'至少需要 130 根有效 OHLCV K 線（含暖機與樣本外區間）'};
  const rows=input.map(x=>({
    time:normalizeCandleTime(x.time??x.openTime??null),
    open:finite(x.open)?Number(x.open):NaN,high:finite(x.high)?Number(x.high):NaN,low:finite(x.low)?Number(x.low):NaN,close:finite(x.close)?Number(x.close):NaN,volume:finite(x.volume)?Number(x.volume):NaN
  }));
  for(let i=0;i<rows.length;i++){
    const x=rows[i];
    if(![x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)||x.open<=0||x.high<=0||x.low<=0||x.close<=0||x.volume<0||x.high<Math.max(x.open,x.close,x.low)||x.low>Math.min(x.open,x.close,x.high))return {ok:false,error:'OHLCV 含無效價格、成交量或高低價關係錯誤',invalidIndex:i};
    const timestamp=parseCandleTime(x.time);
    if(!Number.isFinite(timestamp)||timestamp<=0)return {ok:false,error:'K 線時間缺漏或格式無效',invalidIndex:i};
    if(i&&timestamp<=parseCandleTime(rows[i-1].time))return {ok:false,error:'K 線時間未嚴格遞增或存在重複時間',invalidIndex:i};
    x.time=new Date(timestamp).toISOString();
  }
  return {ok:true,rows};
}

function signalFor(id, current, previous, candle) {
  if(!current||!previous)return {enter:false,exit:false};
  if(id==='ema_trend_rsi')return {
    enter:previous.ema20<=previous.ema60&&current.ema20>current.ema60&&current.rsi>=50&&current.rsi<=68,
    exit:current.ema20<current.ema60||current.rsi>75
  };
  if(id==='macd_momentum')return {
    enter:previous.macdHistogram<=0&&current.macdHistogram>0&&current.rsi>50,
    exit:current.macdHistogram<0||current.rsi<45
  };
  return {
    enter:candle.close<current.bollingerLower&&current.rsi<35,
    exit:candle.close>=current.bollingerMiddle||current.rsi>=55
  };
}

function summarize(trades, dailyReturns, annualization=252) {
  if(!trades.length)return {status:'no_trades',trades:0,winRatePct:null,netReturnPct:null,maxDrawdownPct:null,sharpe:null,sortino:null,profitFactor:null,expectancyPct:null};
  const wins=trades.filter(x=>x.returnPct>0),losses=trades.filter(x=>x.returnPct<0);
  let equity=1,peak=1,maxDd=0;
  for(const value of dailyReturns){equity*=1+value;peak=Math.max(peak,equity);maxDd=Math.max(maxDd,(peak-equity)/peak*100);}
  const avg=trades.reduce((s,x)=>s+x.returnPct,0)/trades.length;
  const grossWin=wins.reduce((s,x)=>s+x.returnPct,0),grossLoss=Math.abs(losses.reduce((s,x)=>s+x.returnPct,0));
  const mean=dailyReturns.length?dailyReturns.reduce((s,x)=>s+x,0)/dailyReturns.length:0;
  const variance=dailyReturns.length>1?dailyReturns.reduce((s,x)=>s+(x-mean)**2,0)/(dailyReturns.length-1):0;
  const sd=Math.sqrt(variance),downDev=dailyReturns.length?Math.sqrt(dailyReturns.reduce((s,x)=>s+Math.min(0,x)**2,0)/dailyReturns.length):0;
  return {status:'ok',trades:trades.length,wins:wins.length,losses:losses.length,winRatePct:round(wins.length/trades.length*100),netReturnPct:round((equity-1)*100),maxDrawdownPct:round(maxDd),sharpe:sd?round(mean/sd*Math.sqrt(annualization),3):null,sortino:downDev?round(mean/downDev*Math.sqrt(annualization),3):null,profitFactor:grossLoss?round(grossWin/grossLoss,3):grossWin?null:0,expectancyPct:round(avg),averageHoldBars:round(trades.reduce((s,x)=>s+x.holdBars,0)/trades.length,1)};
}

function runStrategy(id, candles, start, end, costs) {
  const trades=[],dailyReturns=[];
  let position=false,entryIndex=-1,entryPrice=0;
  const entryCost=(costs.feeBps+costs.slippageBps)/10000;
  const exitCost=(costs.feeBps+costs.slippageBps+costs.sellTaxBps)/10000;
  for(let i=start;i<end-1;i++){
    const current=indicators(candles.slice(0,i+1));
    const previous=indicators(candles.slice(0,i));
    if(!current||!previous)continue;
    const signal=signalFor(id,current,previous,candles[i]);
    const execution=candles[i+1];
    let barReturn=0;
    if(position){
      if(signal.exit){
        barReturn=execution.open/candles[i].close-1;
        barReturn=(1+barReturn)*(1-exitCost)-1;
        const gross=execution.open/entryPrice-1;
        const net=(1+gross)*(1-entryCost)*(1-exitCost)-1;
        trades.push({returnPct:net*100,holdBars:i+1-entryIndex});
        position=false;
      }else{
        barReturn=execution.close/candles[i].close-1;
      }
    }else if(signal.enter){
      position=true;entryIndex=i+1;entryPrice=execution.open;
      barReturn=execution.close/execution.open-1;
      barReturn=(1+barReturn)*(1-entryCost)-1;
    }
    dailyReturns.push(barReturn);
  }
  if(position){
    const last=candles[end-1],gross=last.close/entryPrice-1;
    const net=(1+gross)*(1-entryCost)*(1-exitCost)-1;
    trades.push({returnPct:net*100,holdBars:end-entryIndex,periodEndClose:true});
    if(dailyReturns.length)dailyReturns[dailyReturns.length-1]=(1+dailyReturns.at(-1))*(1-exitCost)-1;
  }
  return summarize(trades,dailyReturns,costs.annualization||252);
}

function runBuyAndHold(candles,start,end,costs) {
  if(!Array.isArray(candles)||end-start<2)return {status:'insufficient_data',trades:0,netReturnPct:null,maxDrawdownPct:null,sharpe:null};
  const first=candles[start],last=candles[end-1];
  const entryCost=(costs.feeBps+costs.slippageBps)/10000;
  const exitCost=(costs.feeBps+costs.slippageBps+costs.sellTaxBps)/10000;
  const dailyReturns=[];
  for(let i=start;i<end;i++){
    let value=i===start?candles[i].close/candles[i].open-1:candles[i].close/candles[i-1].close-1;
    if(i===start)value=(1+value)*(1-entryCost)-1;
    if(i===end-1)value=(1+value)*(1-exitCost)-1;
    dailyReturns.push(value);
  }
  const net=(last.close/first.open)*(1-entryCost)*(1-exitCost)-1;
  return summarize([{returnPct:net*100,holdBars:end-start}],dailyReturns,costs.annualization||252);
}

function walkForward(id,candles,start,end,costs,foldCount=3) {
  const foldSize=Math.floor((end-start)/foldCount);
  if(foldSize<10)return {status:'insufficient_data',foldCount,folds:[],totalTrades:0,positiveFolds:0,passed:false};
  const folds=[];
  for(let i=0;i<foldCount;i++){
    const foldStart=start+i*foldSize,foldEnd=i===foldCount-1?end:start+(i+1)*foldSize;
    const metrics=runStrategy(id,candles,foldStart,foldEnd,costs);
    folds.push({fold:i+1,start:foldStart,end:foldEnd,metrics,marketRegime:classifyRegime(candles.slice(foldStart,foldEnd))});
  }
  const evaluated=folds.filter(x=>x.metrics.status==='ok');
  const totalTrades=evaluated.reduce((sum,x)=>sum+x.metrics.trades,0);
  const positiveFolds=evaluated.filter(x=>x.metrics.netReturnPct>0).length;
  const averageNetReturnPct=evaluated.length?evaluated.reduce((sum,x)=>sum+x.metrics.netReturnPct,0)/evaluated.length:null;
  const worstMaxDrawdownPct=evaluated.length?Math.max(...evaluated.map(x=>x.metrics.maxDrawdownPct)):null;
  const averageSharpe=evaluated.length&&evaluated.every(x=>x.metrics.sharpe!==null)?evaluated.reduce((sum,x)=>sum+x.metrics.sharpe,0)/evaluated.length:null;
  const passed=evaluated.length===foldCount&&totalTrades>=10&&positiveFolds>=2&&averageNetReturnPct>0&&worstMaxDrawdownPct<=15&&averageSharpe!==null&&averageSharpe>0;
  return {status:evaluated.length===foldCount?'evaluated':'insufficient_trades_in_some_folds',foldCount,folds,totalTrades,positiveFolds,averageNetReturnPct:round(averageNetReturnPct),worstMaxDrawdownPct:round(worstMaxDrawdownPct),averageSharpe:round(averageSharpe,3),passed};
}

function classifyRegime(candles) {
  const first=candles[0],last=candles.at(-1);
  const change=(last.close/first.close-1)*100;
  const closes=candles.map(x=>x.close);
  const trend=closes.at(-1)>closes.slice(-60).reduce((s,x)=>s+x,0)/Math.min(60,closes.length)?'up':'down';
  return {periodReturnPct:round(change),trend,regime:change>=8?'bullish':change<=-8?'bearish':'sideways'};
}


function validateResearchHistory(history, market, options={}) {
  if (!MARKET_TYPES.has(market)) return { ok:false, status:'invalid_market', error:'market must be tw-stock, us-stock or crypto' };
  if (!history || history.error || history.stale) return { ok:false, status:'upstream_unavailable', error:String(history && (history.error || history.warning) || 'market_data_upstream_unavailable') };
  if (!Array.isArray(history.data) || history.data.length < 130) return { ok:false, status:'insufficient_data', error:'至少需要 130 根真實且有效的 OHLCV K 線；不會產生模擬績效' };
  const source=String(history.source || '').trim();
  if (!source || /^(unavailable|unknown|mock|synthetic|simulated)$/i.test(source)) return { ok:false, status:'upstream_unavailable', error:'缺少可驗證的行情來源，拒絕計算績效' };
  const last=history.data.at(-1);
  const asOf=(last && (last.time || last.openTime)) || history.asOf;
  const timestamp=parseCandleTime(asOf);
  if (!Number.isFinite(timestamp) || timestamp<=0) return { ok:false, status:'insufficient_data', error:'缺少可驗證的最後一根 K 線時間' };
  const now=Number(options.now === undefined ? Date.now() : options.now);
  if (timestamp > now + 5*60*1000) return { ok:false, status:'invalid_data', error:'行情時間戳位於未來，拒絕計算績效' };
  const interval=String(options.interval || '1d');
  const maxAgeMs=market==='crypto' ? (interval==='4h' ? 12*60*60*1000 : 36*60*60*1000) : 14*24*60*60*1000;
  if (now-timestamp > maxAgeMs) return { ok:false, status:'stale_data', error:'最後一根 K 線已過期，拒絕使用舊資料計算績效' };
  return { ok:true, asOf:new Date(timestamp).toISOString(), barCount:history.data.length, source };
}

function runStrategyLab(input, options={}) {
  const market=options.market;
  if (!MARKET_TYPES.has(market)) return {status:'invalid_market',error:'market must be tw-stock, us-stock or crypto',strategies:[],performance:null,simulatedPerformance:false};
  const checked=validateCandles(input);
  if(!checked.ok)return {status:'insufficient_data',error:checked.error,invalidIndex:checked.invalidIndex??null,strategies:[],performance:null,simulatedPerformance:false,disclaimer:'資料不足或 OHLCV 品質不合格，不會產生策略績效。'};
  const candles=checked.rows;
  const defaults=market==='crypto'?{feeBps:10,slippageBps:5,sellTaxBps:0}:market==='us-stock'?{feeBps:1,slippageBps:5,sellTaxBps:0}:{feeBps:14.25,slippageBps:10,sellTaxBps:30};
  const inferred=inferAnnualization(candles,market);
  const overrides={};
  for(const key of ['feeBps','slippageBps','sellTaxBps','annualization'])if(options[key]!==undefined)overrides[key]=options[key];
  const costs={...defaults,...inferred,market,...overrides};
  for(const key of ['feeBps','slippageBps','sellTaxBps'])if(!finite(costs[key])||Number(costs[key])<0||Number(costs[key])>1000)return {status:'invalid_costs',error:'交易成本參數必須介於 0 到 1000 bps',strategies:[],performance:null,simulatedPerformance:false};
  const split=Math.floor(candles.length*0.6);
  const trainStart=60,trainEnd=split, testStart=split,testEnd=candles.length;
  const periods=[
    {id:'in_sample',label:'訓練區間',start:trainStart,end:trainEnd},
    {id:'out_of_sample',label:'樣本外區間',start:testStart,end:testEnd}
  ];
  const benchmark=runBuyAndHold(candles,testStart,testEnd,costs);
  const baseStrategies=STRATEGIES.map(strategy=>{
    const results=periods.map(period=>({...period,metrics:runStrategy(strategy.id,candles,period.start,period.end,costs),marketRegime:classifyRegime(candles.slice(period.start,period.end))}));
    const oos=results[1].metrics;
    const wf=walkForward(strategy.id,candles,testStart,testEnd,costs,3);
    const learningMetricsComplete=wf.folds.length===3&&wf.folds.every(f=>{
      const m=f.metrics;
      return m.status==='ok'&&[m.netReturnPct,m.maxDrawdownPct,m.sharpe,m.profitFactor,m.trades].every(finite);
    });
    const autonomousLearning=learningMetricsComplete
      ? evaluateCandidate({candidateId:strategy.id,folds:wf.folds.map(f=>({leakageFree:true,test:{
          netReturnPct:f.metrics.netReturnPct,maxDrawdownPct:f.metrics.maxDrawdownPct,
          sharpe:f.metrics.sharpe,profitFactor:f.metrics.profitFactor,tradeCount:f.metrics.trades
        }}))})
      : {candidateId:strategy.id,status:'insufficient_evidence',eligible:false,reason:'incomplete_walk_forward_fold_metrics',livePromotion:false};
    const halfCostMetrics=runStrategy(strategy.id,candles,testStart,testEnd,{...costs,feeBps:costs.feeBps*0.5,slippageBps:costs.slippageBps*0.5,sellTaxBps:costs.sellTaxBps*0.5});
    const doubleCostMetrics=runStrategy(strategy.id,candles,testStart,testEnd,{...costs,feeBps:costs.feeBps*2,slippageBps:costs.slippageBps*2,sellTaxBps:costs.sellTaxBps*2});
    const passed=oos.status==='ok'&&oos.trades>=10&&oos.netReturnPct>0&&oos.maxDrawdownPct<=15&&oos.sharpe!==null&&oos.sharpe>0&&oos.profitFactor!==null&&oos.profitFactor>1.1&&wf.passed;
    const benchmarkComparison={excessReturnPct:oos.netReturnPct!==null&&benchmark.netReturnPct!==null?round(oos.netReturnPct-benchmark.netReturnPct):null,sharpeDelta:oos.sharpe!==null&&benchmark.sharpe!==null?round(oos.sharpe-benchmark.sharpe,3):null,outperformedBuyAndHold:oos.netReturnPct!==null&&benchmark.netReturnPct!==null?oos.netReturnPct>benchmark.netReturnPct:null,benchmark:'buy_and_hold_same_out_of_sample_window_and_cost_assumptions'};
    return {...strategy,periods:results,walkForward:wf,benchmarkComparison,autonomousLearning,costSensitivity:{halfCost:halfCostMetrics,baseCost:oos,doubleCost:doubleCostMetrics,doubleCostStillPositive:doubleCostMetrics.netReturnPct!==null&&doubleCostMetrics.netReturnPct>0},validation:{status:passed?'preliminary_pass':'not_validated',level:'single_holdout_plus_three_walk_forward_folds',rules:['單一樣本外區間至少 10 筆交易','樣本外淨報酬大於 0（已扣估算成本）','樣本外最大回撤不超過 15%','樣本外 Sharpe 大於 0','Profit Factor 大於 1.1','三個 Walk-forward 區段都必須有足夠交易樣本','Walk-forward 至少 2/3 區段為正報酬且總交易數至少 10 筆','Walk-forward 平均報酬為正且最差區段回撤不超過 15%','額外呈現半成本與雙倍成本敏感度'],passed}};
  });
  const consensus=runConsensusResearch(candles,{market,feeBps:costs.feeBps,slippageBps:costs.slippageBps,sellTaxBps:costs.sellTaxBps,annualization:costs.annualization});
  const advancedStrategies=runAdvancedStrategies(candles,split,costs);
  const mtf=options.htfCandles?runMtfStrategy(candles,options.htfCandles,costs):null;
  const strategies=[...baseStrategies,...advancedStrategies,...(consensus.status==='ok'?[consensus]:[]),...(mtf&&mtf.status==='ok'?[mtf]:[])].map(strategy=>{
    if(strategy.benchmarkComparison)return strategy;
    const oos=strategy.periods?.find(period=>period.id==='out_of_sample')?.metrics||{};
    const strategyReturn=oos.netReturnPct===null||oos.netReturnPct===undefined?null:Number(oos.netReturnPct);
    const strategySharpe=oos.sharpe===null||oos.sharpe===undefined?null:Number(oos.sharpe);
    return {...strategy,benchmarkComparison:{
      excessReturnPct:Number.isFinite(strategyReturn)&&Number.isFinite(benchmark.netReturnPct)?round(strategyReturn-benchmark.netReturnPct):null,
      sharpeDelta:Number.isFinite(strategySharpe)&&Number.isFinite(benchmark.sharpe)?round(strategySharpe-benchmark.sharpe,3):null,
      outperformedBuyAndHold:Number.isFinite(strategyReturn)&&Number.isFinite(benchmark.netReturnPct)?strategyReturn>benchmark.netReturnPct:null,
      benchmark:'buy_and_hold_same_out_of_sample_window_and_cost_assumptions'
    }};
  });
  return {status:'ok',symbol:options.symbol||null,market,source:options.source||'provided OHLCV',asOf:candles.at(-1).time,barCount:candles.length,strategyCount:strategies.length,benchmarks:{buyAndHoldOutOfSample:benchmark,comparisonNote:'策略與買入持有基準使用相同樣本外區間及成本假設；超額報酬是簡單差值，不代表經風險因子調整的 Alpha。'},split:{trainBars:trainEnd-trainStart,outOfSampleBars:testEnd-testStart,ratio:'60/40',walkForwardFolds:3,method:'single_holdout_plus_three_walk_forward_folds'},costs:{feeBps:costs.feeBps,slippageBps:costs.slippageBps,sellTaxBps:costs.sellTaxBps,annualization:costs.annualization,barIntervalMs:costs.barIntervalMs,unit:'bps per side; sell tax charged on exit'},strategies,disclaimer:'研究與回測結果不是未來報酬保證。使用下一根 K 線開盤成交以避免同根收盤訊號前視偏誤，區間結束時將未平倉部位按最後收盤價估值並計入退出成本；仍未完整模擬限價排隊、停牌、漲跌停、融券限制及實際市場微結構。單一 60/40 樣本外與三段 Walk-forward 通過僅代表初步候選；另附半成本及雙倍成本敏感度，仍須多市場、多週期、不同景氣環境與交易樣本驗證；未校正多重策略比較偏誤，也未使用歷史時點成分股名單，存在多重測試與存活者偏誤；價格報酬未計股利及公司行動，空方未計融券借券費；未通過者不得當作推薦訊號。'};
}

module.exports={runStrategyLab,validateCandles,validateResearchHistory,walkForward,runBuyAndHold,STRATEGIES,parseCandleTime,inferAnnualization};

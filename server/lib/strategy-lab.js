'use strict';

const { indicators } = require('./indicators');
const { runAdvancedStrategies } = require('./advanced-strategies');
const { runConsensusResearch } = require('./consensus-market-structure');
const { runMtfStrategy } = require('./mtf-structure-strategy');

const STRATEGIES = [
  {id:'ema_trend_rsi',name:'EMA 趨勢＋RSI',category:'trend',description:'EMA20/EMA60 趨勢交叉，RSI 作動能確認',entry:'EMA20 上穿 EMA60 且 RSI 50–68',exit:'EMA20 下穿 EMA60 或 RSI > 75'},
  {id:'macd_momentum',name:'MACD 動能翻正',category:'momentum',description:'MACD 柱體由負轉正，並要求 RSI 動能確認',entry:'MACD Histogram 上穿 0 且 RSI > 50',exit:'MACD Histogram 下穿 0 或 RSI < 45'},
  {id:'bb_mean_reversion',name:'布林通道均值回歸',category:'mean_reversion',description:'價格跌破布林下軌且 RSI 超賣後，等待回歸中軌',entry:'收盤低於布林下軌且 RSI < 35',exit:'收盤回到中軌或 RSI >= 55'}
];

const finite = x => x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const round = (x,d=2) => Number.isFinite(x) ? Number(x.toFixed(d)) : null;
function parseCandleTime(value){
  if(typeof value==='number'&&Number.isFinite(value))return value<1e12?value*1000:value;
  const text=String(value??'').trim();
  if(/^\\d{10,13}$/.test(text)){const n=Number(text);return n<1e12?n*1000:n;}
  return Date.parse(text);
}

function validateCandles(input) {
  if (!Array.isArray(input) || input.length < 130) return {ok:false,error:'至少需要 130 根有效 OHLCV K 線（含暖機與樣本外區間）'};
  const rows=input.map(x=>({
    time:x.time??x.openTime??null,
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

function runStrategyLab(input, options={}) {
  const checked=validateCandles(input);
  if(!checked.ok)return {status:'insufficient_data',error:checked.error,invalidIndex:checked.invalidIndex??null,strategies:[],disclaimer:'資料不足或 OHLCV 品質不合格，不會產生策略績效。'};
  const candles=checked.rows;
  const market=options.market||'tw-stock';
  const defaults=market==='crypto'?{feeBps:10,slippageBps:5,sellTaxBps:0}:market==='us-stock'?{feeBps:1,slippageBps:5,sellTaxBps:0}:{feeBps:14.25,slippageBps:10,sellTaxBps:30};
  const costs={...defaults,annualization:market==='crypto'?365:252,...Object.fromEntries(Object.entries(options).filter(([,value])=>value!==undefined))};
  for(const key of ['feeBps','slippageBps','sellTaxBps'])if(!finite(costs[key])||Number(costs[key])<0||Number(costs[key])>1000)return {status:'invalid_costs',error:'交易成本參數必須介於 0 到 1000 bps',strategies:[]};
  const split=Math.floor(candles.length*0.6);
  const trainStart=60,trainEnd=split, testStart=split,testEnd=candles.length;
  const periods=[
    {id:'in_sample',label:'訓練區間',start:trainStart,end:trainEnd},
    {id:'out_of_sample',label:'樣本外區間',start:testStart,end:testEnd}
  ];
  const baseStrategies=STRATEGIES.map(strategy=>{
    const results=periods.map(period=>({...period,metrics:runStrategy(strategy.id,candles,period.start,period.end,costs),marketRegime:classifyRegime(candles.slice(period.start,period.end))}));
    const oos=results[1].metrics;
    const wf=walkForward(strategy.id,candles,testStart,testEnd,costs,3);
    const halfCostMetrics=runStrategy(strategy.id,candles,testStart,testEnd,{...costs,feeBps:costs.feeBps*0.5,slippageBps:costs.slippageBps*0.5,sellTaxBps:costs.sellTaxBps*0.5});
    const doubleCostMetrics=runStrategy(strategy.id,candles,testStart,testEnd,{...costs,feeBps:costs.feeBps*2,slippageBps:costs.slippageBps*2,sellTaxBps:costs.sellTaxBps*2});
    const passed=oos.status==='ok'&&oos.trades>=10&&oos.netReturnPct>0&&oos.maxDrawdownPct<=15&&oos.sharpe!==null&&oos.sharpe>0&&oos.profitFactor!==null&&oos.profitFactor>1.1&&wf.passed;
    return {...strategy,periods:results,walkForward:wf,costSensitivity:{halfCost:halfCostMetrics,baseCost:oos,doubleCost:doubleCostMetrics,doubleCostStillPositive:doubleCostMetrics.netReturnPct!==null&&doubleCostMetrics.netReturnPct>0},validation:{status:passed?'preliminary_pass':'not_validated',level:'single_holdout_plus_three_walk_forward_folds',rules:['單一樣本外區間至少 10 筆交易','樣本外淨報酬大於 0（已扣估算成本）','樣本外最大回撤不超過 15%','樣本外 Sharpe 大於 0','Profit Factor 大於 1.1','三個 Walk-forward 區段都必須有足夠交易樣本','Walk-forward 至少 2/3 區段為正報酬且總交易數至少 10 筆','Walk-forward 平均報酬為正且最差區段回撤不超過 15%','額外呈現半成本與雙倍成本敏感度'],passed}};
  });
  const consensus=runConsensusResearch(candles,{market,feeBps:costs.feeBps,slippageBps:costs.slippageBps,sellTaxBps:costs.sellTaxBps,annualization:costs.annualization});
  const advancedStrategies=runAdvancedStrategies(candles,split,costs);
  const mtf=options.htfCandles?runMtfStrategy(candles,options.htfCandles,costs):null;
  const strategies=[...baseStrategies,...advancedStrategies,...(consensus.status==='ok'?[consensus]:[]),...(mtf&&mtf.status==='ok'?[mtf]:[])];
  return {status:'ok',symbol:options.symbol||null,market,source:options.source||'provided OHLCV',asOf:candles.at(-1).time,barCount:candles.length,strategyCount:strategies.length,split:{trainBars:trainEnd-trainStart,outOfSampleBars:testEnd-testStart,ratio:'60/40',walkForwardFolds:3,method:'single_holdout_plus_three_walk_forward_folds'},costs:{feeBps:costs.feeBps,slippageBps:costs.slippageBps,sellTaxBps:costs.sellTaxBps,annualization:costs.annualization,unit:'bps per side; sell tax charged on exit'},strategies,disclaimer:'研究與回測結果不是未來報酬保證。使用下一根 K 線開盤成交以避免同根收盤訊號前視偏誤，區間結束時將未平倉部位按最後收盤價估值並計入退出成本；仍未完整模擬限價排隊、停牌、漲跌停、融券限制及實際市場微結構。單一 60/40 樣本外與三段 Walk-forward 通過僅代表初步候選；另附半成本及雙倍成本敏感度，仍須多市場、多週期、不同景氣環境與交易樣本驗證；未校正多重策略比較偏誤，也未使用歷史時點成分股名單，存在多重測試與存活者偏誤；價格報酬未計股利及公司行動，空方未計融券借券費；未通過者不得當作推薦訊號。'};
}

module.exports={runStrategyLab,validateCandles,walkForward,STRATEGIES,parseCandleTime};

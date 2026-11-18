'use strict';

const { indicators } = require('./indicators');

const STRATEGIES = [
  {id:'ema_trend_rsi',name:'EMA 趨勢＋RSI',category:'trend',description:'EMA20/EMA60 趨勢交叉，RSI 作動能確認',entry:'EMA20 上穿 EMA60 且 RSI 50–68',exit:'EMA20 下穿 EMA60 或 RSI > 75'},
  {id:'macd_momentum',name:'MACD 動能翻正',category:'momentum',description:'MACD 柱體由負轉正，並要求 RSI 動能確認',entry:'MACD Histogram 上穿 0 且 RSI > 50',exit:'MACD Histogram 下穿 0 或 RSI < 45'},
  {id:'bb_mean_reversion',name:'布林通道均值回歸',category:'mean_reversion',description:'價格跌破布林下軌且 RSI 超賣後，等待回歸中軌',entry:'收盤低於布林下軌且 RSI < 35',exit:'收盤回到中軌或 RSI >= 55'}
];

const finite = x => Number.isFinite(Number(x));
const round = (x,d=2) => Number.isFinite(x) ? Number(x.toFixed(d)) : null;

function validateCandles(input) {
  if (!Array.isArray(input) || input.length < 130) return {ok:false,error:'至少需要 130 根有效 OHLCV K 線（含暖機與樣本外區間）'};
  const rows=input.map(x=>({
    time:x.time??x.openTime??null,
    open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume)
  }));
  for(let i=0;i<rows.length;i++){
    const x=rows[i];
    if(![x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)||x.open<=0||x.high<=0||x.low<=0||x.close<=0||x.volume<0||x.high<Math.max(x.open,x.close,x.low)||x.low>Math.min(x.open,x.close,x.high))return {ok:false,error:'OHLCV 含無效價格、成交量或高低價關係錯誤',invalidIndex:i};
    if(i&&rows[i-1].time&&x.time&&String(x.time)<=String(rows[i-1].time))return {ok:false,error:'K 線時間未嚴格遞增或存在重複時間',invalidIndex:i};
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

function summarize(trades, dailyReturns) {
  if(!trades.length)return {status:'no_trades',trades:0,winRatePct:null,netReturnPct:null,maxDrawdownPct:null,sharpe:null,sortino:null,profitFactor:null,expectancyPct:null};
  const wins=trades.filter(x=>x.returnPct>0),losses=trades.filter(x=>x.returnPct<0);
  let equity=1,peak=1,maxDd=0;
  for(const value of dailyReturns){equity*=1+value;peak=Math.max(peak,equity);maxDd=Math.max(maxDd,(peak-equity)/peak*100);}
  const avg=trades.reduce((s,x)=>s+x.returnPct,0)/trades.length;
  const grossWin=wins.reduce((s,x)=>s+x.returnPct,0),grossLoss=Math.abs(losses.reduce((s,x)=>s+x.returnPct,0));
  const mean=dailyReturns.length?dailyReturns.reduce((s,x)=>s+x,0)/dailyReturns.length:0;
  const variance=dailyReturns.length>1?dailyReturns.reduce((s,x)=>s+(x-mean)**2,0)/(dailyReturns.length-1):0;
  const sd=Math.sqrt(variance),down=dailyReturns.filter(x=>x<0),downDev=down.length?Math.sqrt(down.reduce((s,x)=>s+x*x,0)/down.length):0;
  return {status:'ok',trades:trades.length,wins:wins.length,losses:losses.length,winRatePct:round(wins.length/trades.length*100),netReturnPct:round((equity-1)*100),maxDrawdownPct:round(maxDd),sharpe:sd?round(mean/sd*Math.sqrt(252),3):null,sortino:downDev?round(mean/downDev*Math.sqrt(252),3):null,profitFactor:grossLoss?round(grossWin/grossLoss,3):grossWin?null:0,expectancyPct:round(avg),averageHoldBars:round(trades.reduce((s,x)=>s+x.holdBars,0)/trades.length,1)};
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
  return summarize(trades,dailyReturns);
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
  const costs={...defaults,...Object.fromEntries(Object.entries(options).filter(([,value])=>value!==undefined))};
  for(const key of ['feeBps','slippageBps','sellTaxBps'])if(!finite(costs[key])||Number(costs[key])<0||Number(costs[key])>1000)return {status:'invalid_costs',error:'交易成本參數必須介於 0 到 1000 bps',strategies:[]};
  const split=Math.floor(candles.length*0.6);
  const trainStart=60,trainEnd=split, testStart=split,testEnd=candles.length;
  const periods=[
    {id:'in_sample',label:'訓練區間',start:trainStart,end:trainEnd},
    {id:'out_of_sample',label:'樣本外區間',start:testStart,end:testEnd}
  ];
  const strategies=STRATEGIES.map(strategy=>{
    const results=periods.map(period=>({...period,metrics:runStrategy(strategy.id,candles,period.start,period.end,costs),marketRegime:classifyRegime(candles.slice(period.start,period.end))}));
    const oos=results[1].metrics;
    const passed=oos.status==='ok'&&oos.trades>=5&&oos.netReturnPct>0&&oos.maxDrawdownPct<=20&&oos.sharpe!==null&&oos.sharpe>0;
    return {...strategy,periods:results,validation:{status:passed?'candidate_pass':'not_validated',rules:['樣本外至少 5 筆交易','樣本外淨報酬大於 0（已扣估算成本）','樣本外最大回撤不超過 20%','樣本外 Sharpe 大於 0'],passed}};
  });
  return {status:'ok',symbol:options.symbol||null,market,source:options.source||'provided OHLCV',asOf:candles.at(-1).time,barCount:candles.length,split:{trainBars:trainEnd-trainStart,outOfSampleBars:testEnd-testStart,ratio:'60/40'},costs:{feeBps:costs.feeBps,slippageBps:costs.slippageBps,sellTaxBps:costs.sellTaxBps,unit:'bps per side; sell tax charged on exit'},strategies,disclaimer:'研究與回測結果不是未來報酬保證。使用下一根 K 線開盤成交以避免同根收盤訊號前視偏誤，區間結束時將未平倉部位按最後收盤價估值並計入退出成本；仍未完整模擬限價排隊、停牌、漲跌停、融券限制及實際市場微結構。未通過樣本外規則的策略不得當作推薦訊號。'};
}

module.exports={runStrategyLab,validateCandles,STRATEGIES};

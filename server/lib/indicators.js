'use strict';
function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const k=2/(period+1); let value=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for(let i=period;i<values.length;i++) value=values[i]*k+value*(1-k);
  return value;
}
function rsi(values, period=14) {
  if(values.length<=period)return null;
  let gain=0,loss=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];gain+=Math.max(d,0);loss+=Math.max(-d,0);}
  gain/=period;loss/=period;
  for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];gain=(gain*(period-1)+Math.max(d,0))/period;loss=(loss*(period-1)+Math.max(-d,0))/period;}
  return loss===0?100:100-100/(1+gain/loss);
}
function indicators(candles) {
  if(!Array.isArray(candles)||candles.length<60)return null;
  const close=candles.map(x=>Number(x.close)),high=candles.map(x=>Number(x.high)),low=candles.map(x=>Number(x.low)),volume=candles.map(x=>Number(x.volume));
  if([...close,...high,...low,...volume].some(x=>!Number.isFinite(x)))return null;
  const e5=ema(close,5),e20=ema(close,20),e60=ema(close,60);
  const macdSeries=[];
  for(let i=26;i<=close.length;i++)macdSeries.push(ema(close.slice(0,i),12)-ema(close.slice(0,i),26));
  const macd=macdSeries.at(-1),signal=ema(macdSeries,9),tr=[];
  for(let i=1;i<candles.length;i++)tr.push(Math.max(high[i]-low[i],Math.abs(high[i]-close[i-1]),Math.abs(low[i]-close[i-1])));
  const avgVol=volume.slice(-20).reduce((a,b)=>a+b,0)/Math.min(20,volume.slice(-20).length);
  const hi=Math.max(...high.slice(-9)),lo=Math.min(...low.slice(-9));
  return {rsi:rsi(close),ema5:e5,ema20:e20,ema60:e60,macd,macdSignal:signal,atr:tr.slice(-14).reduce((a,b)=>a+b,0)/Math.min(14,tr.slice(-14).length),support:Math.min(...low.slice(-20)),resistance:Math.max(...high.slice(-20)),volumeRatio:avgVol?volume.at(-1)/avgVol:null,k:hi===lo?null:(close.at(-1)-lo)/(hi-lo)*100,trend:close.at(-1)>e5&&e5>e20&&e20>e60?'bullish':close.at(-1)<e5&&e5<e20&&e20<e60?'bearish':'mixed'};
}
module.exports={ema,rsi,indicators};

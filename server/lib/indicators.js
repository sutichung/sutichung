'use strict';

const mean = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const k=2/(period+1); let value=mean(values.slice(0,period));
  for(let i=period;i<values.length;i++) value=values[i]*k+value*(1-k);
  return value;
}
function sma(values, period) {
  if(!Array.isArray(values)||values.length<period)return null;
  return mean(values.slice(-period));
}
function rsi(values, period=14) {
  if(!Array.isArray(values)||values.length<=period)return null;
  let gain=0,loss=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];gain+=Math.max(d,0);loss+=Math.max(-d,0);}
  gain/=period;loss/=period;
  for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];gain=(gain*(period-1)+Math.max(d,0))/period;loss=(loss*(period-1)+Math.max(-d,0))/period;}
  if(loss===0)return gain===0?50:100;
  return 100-100/(1+gain/loss);
}
function indicators(candles) {
  if(!Array.isArray(candles)||candles.length<60)return null;
  const close=candles.map(x=>Number(x.close)),high=candles.map(x=>Number(x.high)),low=candles.map(x=>Number(x.low)),volume=candles.map(x=>Number(x.volume));
  if([...close,...high,...low,...volume].some(x=>!Number.isFinite(x))||close.some(x=>x<=0)||high.some((x,i)=>x<Math.max(low[i],close[i]))||low.some((x,i)=>x>Math.min(high[i],close[i]))||volume.some(x=>x<0))return null;
  const e5=ema(close,5),e10=ema(close,10),e20=ema(close,20),e60=ema(close,60),sma5=sma(close,5),sma20=sma(close,20),sma60=sma(close,60);
  const macdSeries=[];
  for(let i=26;i<=close.length;i++)macdSeries.push(ema(close.slice(0,i),12)-ema(close.slice(0,i),26));
  const macd=macdSeries.at(-1),macdSignal=ema(macdSeries,9),macdHistogram=macd!=null&&macdSignal!=null?macd-macdSignal:null;
  const tr=[],plusDm=[],minusDm=[];
  for(let i=1;i<candles.length;i++){
    tr.push(Math.max(high[i]-low[i],Math.abs(high[i]-close[i-1]),Math.abs(low[i]-close[i-1])));
    const up=high[i]-high[i-1],down=low[i-1]-low[i];
    plusDm.push(up>down&&up>0?up:0);minusDm.push(down>up&&down>0?down:0);
  }
  const atr14=mean(tr.slice(-14));
  const atrPercent=atr14&&close.at(-1)?atr14/close.at(-1)*100:null;
  const smoothTr=mean(tr.slice(-14)),plusDi=smoothTr?mean(plusDm.slice(-14))/smoothTr*100:null,minusDi=smoothTr?mean(minusDm.slice(-14))/smoothTr*100:null;
  const dxSeries=[];
  for(let i=13;i<tr.length;i++){
    const t=mean(tr.slice(i-13,i+1)),p=t?mean(plusDm.slice(i-13,i+1))/t*100:null,m=t?mean(minusDm.slice(i-13,i+1))/t*100:null;
    if(p!=null&&m!=null&&p+m>0)dxSeries.push(Math.abs(p-m)/(p+m)*100);
  }
  const adx=dxSeries.length>=14?mean(dxSeries.slice(-14)):null;
  const bbWindow=close.slice(-20),bbMid=mean(bbWindow),variance=mean(bbWindow.map(x=>(x-bbMid)**2)),bbStd=variance==null?null:Math.sqrt(variance);
  const bbUpper=bbStd==null?null:bbMid+2*bbStd,bbLower=bbStd==null?null:bbMid-2*bbStd;
  const bbWidth=bbMid?((bbUpper-bbLower)/bbMid)*100:null;
  const typical=candles.map((x,i)=>(high[i]+low[i]+close[i])/3),tp20=typical.slice(-20),tpMean=mean(tp20),tpDev=mean(tp20.map(x=>Math.abs(x-tpMean)));
  const cci=tpDev?((typical.at(-1)-tpMean)/(0.015*tpDev)):null;
  let obv=0;for(let i=1;i<close.length;i++)obv+=close[i]>close[i-1]?volume[i]:close[i]<close[i-1]?-volume[i]:0;
  let moneyPositive=0,moneyNegative=0;
  for(let i=Math.max(1,candles.length-14);i<candles.length;i++){const flow=typical[i]*volume[i];if(typical[i]>typical[i-1])moneyPositive+=flow;else if(typical[i]<typical[i-1])moneyNegative+=flow;}
  const mfi=moneyNegative===0?(moneyPositive===0?50:100):100-100/(1+moneyPositive/moneyNegative);
  const recentHigh=Math.max(...high.slice(-9)),recentLow=Math.min(...low.slice(-9)),k=recentHigh===recentLow?null:(close.at(-1)-recentLow)/(recentHigh-recentLow)*100;
  const kSeries=[];
  for(let i=Math.max(8,close.length-3);i<close.length;i++){const h=Math.max(...high.slice(i-8,i+1)),l=Math.min(...low.slice(i-8,i+1));kSeries.push(h===l?50:(close[i]-l)/(h-l)*100);}
  const d=mean(kSeries.slice(-3));
  const avgVol=mean(volume.slice(-20)),volumeRatio=avgVol?volume.at(-1)/avgVol:null;
  const vwap20Den=volume.slice(-20).reduce((a,b)=>a+b,0),vwap20=vwap20Den?typical.slice(-20).reduce((sum,x,i)=>sum+x*volume.slice(-20)[i],0)/vwap20Den:null;
  const support=Math.min(...low.slice(-20)),resistance=Math.max(...high.slice(-20));
  const roc20=close.length>20&&close.at(-21)!==0?(close.at(-1)/close.at(-21)-1)*100:null;
  const williamsR=recentHigh===recentLow?null:(recentHigh-close.at(-1))/(recentHigh-recentLow)*-100;
  return {
    rsi:rsi(close),sma5,sma20,sma60,ema5:e5,ema10:e10,ema20:e20,ema60:e60,
    macd,macdSignal,macdHistogram,atr:atr14,atrPercent,adx,plusDi,minusDi,
    bollingerUpper:bbUpper,bollingerMiddle:bbMid,bollingerLower:bbLower,bollingerWidth:bbWidth,
    cci,obv,mfi,k,d,williamsR,roc20,vwap20,volumeRatio,
    support,resistance,trend:close.at(-1)>e5&&e5>e20&&e20>e60?'bullish':close.at(-1)<e5&&e5<e20&&e20<e60?'bearish':'mixed'
  };
}
module.exports={ema,sma,rsi,indicators};

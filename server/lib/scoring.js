'use strict';

const clamp = (n, lo=0, hi=100) => Math.max(lo, Math.min(hi, n));
const finite = value => Number.isFinite(Number(value)) && value !== null && value !== '';

/**
 * Transparent, deterministic research score. It is a directional ranking,
 * not a calibrated probability or a trade instruction.
 * Expected optional fields: trend, macd, signal, rsi, volumeRatio,
 * institutionalNet, foreignNet, trustNet, dealerNet, trustFlowPct5d, foreignFlowPct5d, pe, pb, dividendYield, marginChange,
 * shortChange, retailBias, fearGreed, advanceDecline, futuresChangePct,
 * asOf (ISO timestamp).
 */
function scoreStock(input={}) {
  const reasons=[];
  let score=50, covered=0, total=127;
  const add=(weight, direction, positive, negative)=>{
    if(direction===null)return;
    score += weight*direction;
    covered += Math.abs(weight);
    reasons.push(direction>0?positive:direction<0?negative:'該因子中性');
  };
  const trend=String(input.trend||'').toLowerCase();
  if(trend.includes('bull')||trend.includes('多頭')) add(14,1,'均線趨勢偏多','');
  else if(trend.includes('bear')||trend.includes('空頭')) add(14,-1,'','均線趨勢偏空');
  else if(trend) { covered+=14; reasons.push('均線趨勢混合'); }

  if(finite(input.macd)&&finite(input.signal)) add(10,Number(input.macd)>Number(input.signal)?1:-1,'MACD 動能向上','MACD 動能向下');
  if(finite(input.rsi)) {
    const r=Number(input.rsi);
    if(r>=52&&r<=68)add(8,1,'RSI 動能健康偏多','');
    else if(r>75)add(8,-1,'','RSI 過熱，追價風險提高');
    else if(r<30)add(8,-0.25,'','RSI 超賣，仍需價格確認');
    else if(r<45)add(8,-0.5,'','RSI 動能偏弱');
    else {covered+=8;reasons.push('RSI 位於中性區');}
  }
  if(finite(input.volumeRatio)) {
    const v=Number(input.volumeRatio);
    if(v>=1.5) add(6,trend.includes('bear')||trend.includes('空頭')?-1:1,'量能放大且趨勢未轉空','放量伴隨弱勢趨勢');
    else if(v<0.6){covered+=6;reasons.push('成交量偏低');}
    else covered+=6;
  }

  const inst=finite(input.institutionalNet)?[Number(input.institutionalNet)]:['foreignNet','trustNet','dealerNet'].filter(k=>finite(input[k])).map(k=>Number(input[k]));
  if(inst.length) add(6,Math.sign(inst.reduce((a,b)=>a+b,0)),'法人合計買超','法人合計賣超');

  const whaleSignals=[];
  if(finite(input.trustFlowPct5d)){const v=Number(input.trustFlowPct5d);whaleSignals.push(v>=3?1:v<=-3?-1:0);}
  if(finite(input.foreignFlowPct5d)){const v=Number(input.foreignFlowPct5d);whaleSignals.push(v>=5?1:v<=-5?-1:0);}
  if(whaleSignals.length)add(5,whaleSignals.reduce((a,b)=>a+b,0)/whaleSignals.length,'近五日法人籌碼流向偏多','近五日法人籌碼流向偏空');

  const valuation=[];
  if(finite(input.pe)&&Number(input.pe)>0){const v=Number(input.pe);valuation.push(v<=15?1:v>35?-1:0);}
  if(finite(input.pb)&&Number(input.pb)>0){const v=Number(input.pb);valuation.push(v<=1.5?0.5:v>=5?-0.5:0);}
  if(finite(input.dividendYield)&&Number(input.dividendYield)>=0){valuation.push(Number(input.dividendYield)>=4?0.5:0);}
  if(valuation.length)add(10,valuation.reduce((a,b)=>a+b,0)/valuation.length,'估值因子相對有利','估值因子偏高，留意安全邊際');

  if(finite(input.marginChange)) {
    const m=Number(input.marginChange);
    const aligned=trend.includes('bull')||trend.includes('多頭');
    add(4,m>0?(aligned?-0.5:-1):m<0?(aligned?0.5:0):0,'融資變化與趨勢配合','融資增加，留意散戶槓桿風險');
  }
  if(finite(input.shortChange)) {
    const s=Number(input.shortChange);
    add(3,s>0?0.5:s<0?-0.25:0,'融券增加，留意軋空可能','融券減少，軋空動能下降');
  }
  if(finite(input.fearGreed)) {
    const f=Number(input.fearGreed);
    if(f<=20)add(5,1,'市場極度恐懼，列入逆向觀察','');
    else if(f>=80)add(5,-1,'','市場過度樂觀，留意反轉');
    else {covered+=5;reasons.push('市場情緒未達極端');}
  }
  if(finite(input.largeHolderChangePct)) add(2,Number(input.largeHolderChangePct)>0?1:Number(input.largeHolderChangePct)<0?-1:0,'大戶持股比例增加','大戶持股比例下降');
  if(finite(input.retailBias)) {const rb=Number(input.retailBias);if(rb<=20)add(2,1,'散戶情緒極度偏空，列入逆向觀察','');else if(rb>=80)add(2,-1,'','散戶情緒極度偏多，留意反轉');else covered+=2;}
  if(finite(input.advanceDecline)) {
    const breadth=Number(input.advanceDecline);
    add(5,breadth>1.2?1:breadth<0.8?-1:0,'市場上漲家數廣度較佳','市場下跌家數廣度較差');
  }
  if(finite(input.futuresChangePct)) {
    const f=Number(input.futuresChangePct);
    add(5,f>0?1:f<0?-1:0,'台指期方向偏多','台指期方向偏空');
  }
  if(finite(input.adx)&&finite(input.plusDi)&&finite(input.minusDi)){
    const strength=Number(input.adx),direction=Math.sign(Number(input.plusDi)-Number(input.minusDi));
    if(strength>=20)add(5,direction,'ADX 顯示趨勢強度足夠且方向偏多','ADX 顯示趨勢強度足夠且方向偏空');
    else {covered+=5;reasons.push('ADX 趨勢強度偏弱，避免過度解讀方向');}
  }
  if(finite(input.mfi)){
    const m=Number(input.mfi);
    if(m>=60&&m<=80)add(4,1,'MFI 資金流量動能偏多','');
    else if(m>=90)add(4,-0.5,'','MFI 資金流量過熱');
    else if(m<=20)add(4,-0.25,'','MFI 位於低檔，等待反轉確認');
    else covered+=4;
  }
  if(finite(input.cci)){
    const c=Number(input.cci);
    if(c>=100&&c<200)add(4,1,'CCI 動能轉強','');
    else if(c>=200)add(4,-0.5,'','CCI 動能過熱');
    else if(c<=-100)add(4,-1,'','CCI 動能偏弱');
    else covered+=4;
  }
  if(finite(input.priceVsVwap20Pct))add(4,Number(input.priceVsVwap20Pct)>=0?1:-1,'價格位於 20 日成交量加權均價之上','價格位於 20 日成交量加權均價之下');

  if(finite(input.k)) {
    const k=Number(input.k);
    if(k>=50&&k<=80)add(5,1,'KD 動能偏多','');
    else if(k>90)add(5,-1,'','KD 高檔鈍化風險');
    else if(k<20)add(5,-0.25,'','KD 位於超賣區，等待反轉確認');
    else covered+=5;
  }
  if(finite(input.priceVsEma20Pct)) add(5,Number(input.priceVsEma20Pct)>=0?1:-1,'價格位於 EMA20 之上','價格位於 EMA20 之下');
  if(finite(input.priceVsEma60Pct)) add(5,Number(input.priceVsEma60Pct)>=0?1:-1,'價格位於 EMA60 之上','價格位於 EMA60 之下');
  if(finite(input.return5dPct)) add(5,Number(input.return5dPct)>=0?1:-1,'近五日報酬偏強','近五日報酬偏弱');
  if(finite(input.return20dPct)) add(5,Number(input.return20dPct)>=0?1:-1,'近二十日報酬偏強','近二十日報酬偏弱');

  if(finite(input.dailyChangePct)&&Math.abs(Number(input.dailyChangePct))>=8.5)reasons.push('單日漲跌幅達 8.5% 以上，隔日沖與波動風險提高；不因此追價');

  const scoreValue=Math.round(clamp(score));
  const confidence=Math.round(covered/total*100);
  const asOf=Date.parse(input.asOf||'');
  const ageMs=Number.isFinite(asOf)?Date.now()-asOf:Infinity;
  const technicalDate=String(input.technicalAsOf||'').slice(0,10);
  const quoteDate=Number.isFinite(asOf)?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date(asOf)):null;
  const technicalSessionMatches=input.marketSessionOpen!==true||(input.quoteIsLive===true&&technicalDate&&quoteDate===technicalDate);
  const fresh=ageMs>=-30000&&ageMs<=Number(input.maxAgeMs||180000)&&technicalSessionMatches;
  const valid=confidence>=60&&fresh;
  let direction='觀望';
  if(valid) direction=scoreValue>=70?'偏向買進':scoreValue<=35?'偏向賣出／避險':'中性觀望';
  if(!technicalSessionMatches) reasons.unshift('盤中技術指標仍是前一交易日完整日K，缺少同交易日盤中K線；暫停方向訊號');
  if(!fresh&&technicalSessionMatches) reasons.unshift('行情時間戳缺失或已過期');
  if(confidence<60) reasons.unshift('有效因子覆蓋率不足 60%');
  return {
    score:scoreValue,
    buyScore:scoreValue,
    sellScore:100-scoreValue,
    confidence,
    direction,
    status:valid?'research-ready':'insufficient-data',
    fresh,
    reasons
  };
}

module.exports={scoreStock};

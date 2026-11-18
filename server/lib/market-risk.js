'use strict';

const finite=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const clamp=v=>Math.max(0,Math.min(100,Math.round(v)));
function mean(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;}
function std(xs){if(xs.length<2)return null;const m=mean(xs);return Math.sqrt(mean(xs.map(x=>(x-m)**2)));}
function assessMarketRisk(history,derivatives,microstructure=null){
 const candles=(history?.data||[]).filter(x=>{
  const o=Number(x.open),h=Number(x.high),l=Number(x.low),c=Number(x.close),v=Number(x.volume);
  return [o,h,l,c,v].every(Number.isFinite)&&o>0&&h>0&&l>0&&c>0&&v>=0&&h>=Math.max(o,c,l)&&l<=Math.min(o,c,h);
 });
 const book=microstructure?.book||null,tape=microstructure?.tape||null;
 const hasBook=!!(Array.isArray(book?.bids)&&book.bids.length&&Array.isArray(book?.asks)&&book.asks.length);
 const hasTape=!!(tape&&Number.isFinite(Number(tape.count))&&Number.isFinite(Number(tape.knownSideCount))&&Number(tape.count)>0&&Number(tape.knownSideCount)>0);
 const obi=finite(book?.obi),weightedObi=finite(book?.weightedObi),obiNotional=finite(book?.obiNotional);
 const spreadPct=finite(book?.spreadPct),microPriceDeviationBps=finite(book?.microPriceDeviationBps);
 const tradeImbalance=finite(tape?.tradeImbalance),aggressiveBuyPct=finite(tape?.aggressiveBuyPct);
 const largeSellCount=Array.isArray(tape?.largeTrades)?tape.largeTrades.filter(x=>x?.side==='sell').length:null;
 const enough=candles.length>=22;
 const last=candles.at(-1),prev=candles.at(-2);
 const vols=candles.slice(-22,-1).map(x=>Number(x.volume)).filter(Number.isFinite);
 const avgVol=mean(vols),volSd=std(vols),volZ=last&&volSd>0?(last.volume-avgVol)/volSd:null;
 const change=last&&prev&&prev.close>0?(last.close/prev.close-1)*100:null;
 const range=last&&last.open>0?(last.high-last.low)/last.open*100:null;
 const body=last&&last.open>0?(last.close-last.open)/last.open*100:null;
 const upperWick=last&&last.open>0?(last.high-Math.max(last.open,last.close))/last.open*100:null;
 const lowerWick=last&&last.open>0?(Math.min(last.open,last.close)-last.low)/last.open*100:null;
 const recent=candles.slice(-20).map(x=>x.close),peak=recent.length?Math.max(...recent):null,drawdown=peak>0&&last?(last.close/peak-1)*100:null;
 const funding=finite(derivatives?.fundingRate),longPct=finite(derivatives?.battle?.longPct);
 const hasDerivatives=funding!==null||longPct!==null;
 const coverage={candles:enough,derivatives:hasDerivatives,orderBook:hasBook,tradeTape:hasTape,liquidationFeed:false,onChainWhaleFlow:false};
 const missing=[];
 if(!enough)missing.push('至少需要 22 根有效 K 線');
 if(!hasBook)missing.push('目前交易所未取得有效委託簿快照');
 else missing.push('委託簿是單次 REST 快照，未取得撤單率、掛單存活時間或連續變化');
 if(!hasTape)missing.push('目前交易所未取得有效逐筆成交樣本');
 else missing.push('逐筆成交僅為交易所 REST 最近成交樣本，不等於完整逐筆歷史');
 missing.push('尚未整合真實強平事件流','尚未整合鏈上巨鯨轉帳與交易所淨流入');
 const microstructureStatus=hasBook&&hasTape?'connected':hasBook?'book_only':hasTape?'tape_only':'unavailable';
 if(!enough||!last)return {status:'insufficient_data',label:'資料不足，暫不判讀',source:history?.source||'unavailable',asOf:history?.asOf||null,candleCount:candles.length,scenarios:[],coverage,missing,microstructureStatus,microstructureSource:microstructure?.source||null,microstructureReceivedAt:microstructure?.receivedAt||null,disclaimer:'這是異常風險篩查，不是操縱行為認定或交易指令。委託簿與成交資料僅為單次 REST 快照。'};
 const scenarios=[];
 const add=(id,name,score,signals,meaning,limits)=>scenarios.push({id,name,score:clamp(score),signals,meaning,limits});
 const sellSignals=[];let sell=0;
 if(change!==null&&change<=-3){sell+=25;sellSignals.push('單根 K 線跌幅 '+change.toFixed(2)+'%');}
 if(volZ!==null&&volZ>=2){sell+=25;sellSignals.push('成交量高於近期均值 '+volZ.toFixed(1)+' 個標準差');}
 if(body!==null&&body<0){sell+=10;sellSignals.push('收盤低於開盤');}
 if(drawdown!==null&&drawdown<=-8){sell+=15;sellSignals.push('近 20 根 K 線自高點回撤 '+Math.abs(drawdown).toFixed(2)+'%');}
 if(upperWick!==null&&upperWick>=2){sell+=10;sellSignals.push('上影線偏長，可能有高檔賣壓');}
 if(funding!==null&&funding<0){sell+=5;sellSignals.push('資金費率轉負');}
 if(obi!==null&&obi<=-0.35){sell+=15;sellSignals.push('委託簿可見深度偏向賣方（OBI '+obi.toFixed(2)+'）');}
 if(obiNotional!==null&&obiNotional<=-0.35){sell+=10;sellSignals.push('可見名目金額深度偏向賣方');}
 if(tradeImbalance!==null&&tradeImbalance<=-0.35){sell+=20;sellSignals.push('最近成交主動賣出失衡（'+tradeImbalance.toFixed(2)+'）');}
 if(largeSellCount!==null&&largeSellCount>=2){sell+=10;sellSignals.push('最近成交樣本含 '+largeSellCount+' 筆達門檻的大額賣單');}
 add('sell_pressure','集中賣壓／疑似砸盤風險',sell,sellSignals.length?sellSignals:['未達目前規則門檻'],'價格、可見賣盤深度與主動賣出同時偏弱時，提高賣壓風險警示。','盤口只代表快照可見掛單，可能隨時撤改；不能識別賣方身分、動機或違法操縱。');
 const trapSignals=[];let trap=0;
 if(upperWick!==null&&upperWick>=2){trap+=25;trapSignals.push('上影線顯著');}
 if(volZ!==null&&volZ>=1.5){trap+=20;trapSignals.push('突破／波動伴隨異常成交量');}
 if(change!==null&&change>0&&body!==null&&body<0.5){trap+=15;trapSignals.push('盤中上探但收盤動能弱');}
 if(drawdown!==null&&drawdown<=-4){trap+=15;trapSignals.push('近期高點回落');}
 if(tradeImbalance!==null&&tradeImbalance>=0.35&&obi!==null&&obi<=0.15){trap+=15;trapSignals.push('主動買成交偏強但可見買盤深度未同步增強');}
 if(microPriceDeviationBps!==null&&microPriceDeviationBps<=-5){trap+=10;trapSignals.push('微價格低於中間價，短線買賣盤權重偏弱');}
 add('bull_trap','假突破／誘多回落風險',trap,trapSignals.length?trapSignals:['未觀察到足夠假突破條件'],'上攻後收回、成交與可見盤口背離時，提示突破品質下降。','盤口與成交快照不能重建盤中先後順序；需連續 WebSocket、逐筆歷史及撤單事件確認。');
 const longSignals=[];let longRisk=0;
 if(longPct!==null&&longPct>=60){longRisk+=30;longSignals.push('多方帳戶比例偏高 '+longPct.toFixed(1)+'%');}
 if(funding!==null&&funding>=0.0005){longRisk+=25;longSignals.push('資金費率偏高 '+(funding*100).toFixed(4)+'%');}
 if(change!==null&&change<0){longRisk+=10;longSignals.push('價格轉跌');}
 if(volZ!==null&&volZ>=1.5&&change!==null&&change<0){longRisk+=20;longSignals.push('下跌伴隨放量');}
 add('long_liquidation','多頭擁擠／連環清算風險',longRisk,longSignals.length?longSignals:['多空擁擠訊號不足'],'多方倉位擁擠、資金費率偏高且價格轉弱時，可能放大多頭清算風險。','未取得實際強平逐筆資料；不可把估算清算熱區當成真實清算掛單。');
 const shortSignals=[];let shortRisk=0;
 if(longPct!==null&&longPct<=40){shortRisk+=30;shortSignals.push('空方帳戶比例偏高');}
 if(funding!==null&&funding<=-0.0005){shortRisk+=25;shortSignals.push('資金費率顯著為負');}
 if(change!==null&&change>3){shortRisk+=15;shortSignals.push('價格急升');}
 if(lowerWick!==null&&lowerWick>=2){shortRisk+=15;shortSignals.push('下影線偏長，可能出現低檔承接');}
 add('short_squeeze','空頭擁擠／軋空風險',shortRisk,shortSignals.length?shortSignals:['空頭擁擠訊號不足'],'空方比例偏高、資金費率偏負而價格急升時，留意空頭回補與軋空。','多空比是帳戶比例或特定合約統計，不代表全市場真實部位。');
 const liquiditySignals=[];
 if(volZ!==null&&volZ>=2&&range!==null&&range>=3)liquiditySignals.push('異常放量且價格振幅擴大');
 if(range!==null&&range>=6)liquiditySignals.push('單根 K 線振幅達 '+range.toFixed(2)+'%');
 if(spreadPct!==null&&spreadPct>=0.15){liquiditySignals.push('即時買賣價差 '+spreadPct.toFixed(3)+'%');}
 if(spreadPct!==null&&spreadPct>=0.5)liquiditySignals.push('買賣價差已擴大至 0.5% 以上');
 if(microPriceDeviationBps!==null&&Math.abs(microPriceDeviationBps)>=10)liquiditySignals.push('微價格偏移 '+microPriceDeviationBps.toFixed(1)+' bps，盤口不平衡可能放大滑價');
 const liquidityScore=(spreadPct!==null&&spreadPct>=0.5?35:spreadPct!==null&&spreadPct>=0.15?20:0)+(microPriceDeviationBps!==null&&Math.abs(microPriceDeviationBps)>=10?10:0)+(volZ!==null&&volZ>=2&&range!==null&&range>=3?20:0)+(range!==null&&range>=6?15:0);
 add('liquidity_stress','流動性壓力／滑價風險',liquidityScore,liquiditySignals.length?liquiditySignals:['未觀察到明顯價差或波動壓力'],'直接使用可見委託簿價差與微價格偏移，輔助判斷目前快照的流動性壓力。','只量測快照可見深度與價差，未量測掛單撤銷速度、實際成交衝擊或市場深度恢復速度。');
 const sorted=[...scenarios].sort((a,b)=>b.score-a.score);
 const sourceParts=[history.source||'exchange candles',microstructure?.source].filter(Boolean);
 return {status:'ok',label:sorted[0]?.score>=60?'出現高風險情境':sorted[0]?.score>=35?'異常觀察':'未見明顯異常',asOf:history.asOf||last.time||null,source:sourceParts.join(' + '),candleCount:candles.length,microstructureStatus,microstructureSource:microstructure?.source||null,microstructureReceivedAt:microstructure?.receivedAt||null,metrics:{lastChangePct:change,volumeZ:volZ,rangePct:range,upperWickPct:upperWick,lowerWickPct:lowerWick,drawdown20Pct:drawdown,fundingRate:funding,longAccountPct:longPct,orderBookImbalance:obi,weightedOrderBookImbalance:weightedObi,notionalOrderBookImbalance:obiNotional,spreadPct,microPriceDeviationBps,tradeImbalance,aggressiveBuyPct,largeSellCount},scenarios:sorted,coverage,missing,disclaimer:'風險分數是規則式篩查，不是操縱定罪、漲跌機率或投資建議。委託簿與逐筆成交來自 Binance／Bybit／OKX 公開 REST 快照及最近成交樣本，不是 WebSocket 連續流；看見賣盤或大額成交不代表能識別操縱者。真實清算事件與鏈上巨鯨轉帳仍未接入。'};
}
module.exports={assessMarketRisk};

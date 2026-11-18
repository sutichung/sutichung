'use strict';

const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const clamp=v=>Math.max(0,Math.min(100,Math.round(v)));
function mean(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;}
function std(xs){if(xs.length<2)return null;const m=mean(xs);return Math.sqrt(mean(xs.map(x=>(x-m)**2)));}
function assessMarketRisk(history,derivatives){
 const candles=(history?.data||[]).filter(x=>[x.open,x.high,x.low,x.close,x.volume].every(v=>Number.isFinite(Number(v))&&Number(v)>=0));
 const enough=candles.length>=22;
 const last=candles.at(-1),prev=candles.at(-2);
 const returns=candles.slice(1).map((x,i)=>candles[i].close>0?(x.close/candles[i].close-1)*100:null).filter(Number.isFinite);
 const vols=candles.slice(-22,-1).map(x=>Number(x.volume)).filter(Number.isFinite);
 const avgVol=mean(vols),volSd=std(vols),volZ=last&&volSd>0?(last.volume-avgVol)/volSd:null;
 const change=last&&prev&&prev.close>0?(last.close/prev.close-1)*100:null;
 const range=last&&last.open>0?(last.high-last.low)/last.open*100:null;
 const body=last&&last.open>0?(last.close-last.open)/last.open*100:null;
 const upperWick=last&&last.open>0?(last.high-Math.max(last.open,last.close))/last.open*100:null;
 const lowerWick=last&&last.open>0?(Math.min(last.open,last.close)-last.low)/last.open*100:null;
 const recent=candles.slice(-20).map(x=>x.close),peak=Math.max(...recent),drawdown=peak>0?(last.close/peak-1)*100:null;
 const funding=finite(derivatives?.fundingRate),longPct=finite(derivatives?.battle?.longPct);
 const hasDerivatives=!!derivatives;
 const scenarios=[];
 const add=(id,name,score,signals,meaning,limits)=>scenarios.push({id,name,score:clamp(score),signals,meaning,limits});
 if(!enough||!last){return {status:'insufficient_data',label:'資料不足，暫不判讀',source:history?.source||'unavailable',asOf:history?.asOf||null,candleCount:candles.length,scenarios:[],missing:['至少需要 22 根有效 K 線','即時委託簿與逐筆成交尚未納入'],disclaimer:'這是異常風險篩查，不是操縱行為認定或交易指令。'};}
 const sellSignals=[];let sell=0;
 if(change!==null&&change<=-3){sell+=25;sellSignals.push('單根 K 線跌幅 '+change.toFixed(2)+'%');}
 if(volZ!==null&&volZ>=2){sell+=25;sellSignals.push('成交量高於近期均值 '+volZ.toFixed(1)+' 個標準差');}
 if(body!==null&&body<0){sell+=10;sellSignals.push('收盤低於開盤');}
 if(drawdown!==null&&drawdown<=-8){sell+=15;sellSignals.push('近 20 根 K 線自高點回撤 '+Math.abs(drawdown).toFixed(2)+'%');}
 if(upperWick!==null&&upperWick>=2){sell+=10;sellSignals.push('上影線偏長，可能有高檔賣壓');}
 if(funding!==null&&funding<0){sell+=5;sellSignals.push('資金費率轉負');}
 add('sell_pressure','集中賣壓／疑似砸盤風險',sell,sellSignals.length?sellSignals:['未達目前規則門檻'],'價格急跌與異常放量同時出現時，提高賣壓風險警示。','僅用 K 線與衍生品摘要，無法識別賣方身分、動機或是否違法操縱。');
 const trapSignals=[];let trap=0;
 if(upperWick!==null&&upperWick>=2){trap+=25;trapSignals.push('上影線顯著');}
 if(volZ!==null&&volZ>=1.5){trap+=20;trapSignals.push('突破／波動伴隨異常成交量');}
 if(change!==null&&change>0&&body!==null&&body<0.5){trap+=15;trapSignals.push('盤中上探但收盤動能弱');}
 if(drawdown!==null&&drawdown<=-4){trap+=15;trapSignals.push('近期高點回落');}
 add('bull_trap','假突破／誘多回落風險',trap,trapSignals.length?trapSignals:['未觀察到足夠假突破條件'],'上攻後收回、上影線與放量同時出現時，提示突破品質下降。','日 K 無法判斷盤中先後順序，需搭配 5 分鐘／逐筆資料確認。');
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
 add('liquidity_stress','流動性壓力／滑價風險',liquiditySignals.length?45:0,liquiditySignals.length?liquiditySignals:['未取得委託簿深度，無法確認流動性狀態'],'波動與成交量同時異常時，實際進出場可能面臨較大滑價。','尚未直接量測買賣盤深度、價差、撤單率；不能宣稱偵測到假掛單或冰山單。');
 const sorted=[...scenarios].sort((a,b)=>b.score-a.score);
 return {status:'ok',label:sorted[0]?.score>=60?'出現高風險情境':sorted[0]?.score>=35?'異常觀察':'未見明顯異常',asOf:history.asOf||last.time||null,source:history.source||'exchange candles',candleCount:candles.length,metrics:{lastChangePct:change,volumeZ:volZ,rangePct:range,upperWickPct:upperWick,lowerWickPct:lowerWick,drawdown20Pct:drawdown,fundingRate:funding,longAccountPct:longPct},scenarios:sorted,coverage:{candles:true,derivatives:hasDerivatives,orderBook:false,tradeTape:false,liquidationFeed:false,onChainWhaleFlow:false},missing:['尚未整合跨交易所即時委託簿深度','尚未整合逐筆主動買賣與撤單事件','尚未整合真實強平事件流','尚未整合鏈上巨鯨轉帳與交易所淨流入'],disclaimer:'風險分數是規則式篩查，不是操縱定罪、漲跌機率或投資建議；異常也可能來自正常新聞、宏觀事件或市場波動。'};
}
module.exports={assessMarketRisk};

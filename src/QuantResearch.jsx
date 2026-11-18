import React,{useMemo,useState} from 'react';

const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const pct=v=>Number.isFinite(v)?(v>=0?'+':'')+v.toFixed(2)+'%':'—';
function emaSeries(values,period){
 const out=Array(values.length).fill(null);
 if(values.length<period)return out;
 const k=2/(period+1);let v=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
 out[period-1]=v;
 for(let i=period;i<values.length;i++){v=values[i]*k+v*(1-k);out[i]=v;}
 return out;
}
function runBacktest(candles,cost){
 if(!Number.isFinite(cost)||cost<0)return {invalidCost:true};
 const rows=(candles||[]).filter(x=>n(x.open)!==null&&n(x.close)!==null&&n(x.high)!==null&&n(x.low)!==null&&n(x.volume)!==null);
 if(rows.length<65)return {insufficient:true,count:rows.length};
 const close=rows.map(x=>Number(x.close)),fast=emaSeries(close,20),slow=emaSeries(close,60);
 const trades=[];let entry=null;
 for(let i=60;i<rows.length-1;i++){
  const prev=fast[i-1]-slow[i-1],now=fast[i]-slow[i];
  if(entry===null&&prev<=0&&now>0){const price=Number(rows[i+1].open);if(price>0)entry={price,date:rows[i+1].time};}
  else if(entry!==null&&prev>=0&&now<0){const price=Number(rows[i+1].open);if(price>0){const gross=(price/entry.price-1)*100;trades.push({entry:entry.price,exit:price,date:rows[i+1].time,gross,net:gross-cost});entry=null;}}
 }
 const wins=trades.filter(t=>t.net>0),losses=trades.filter(t=>t.net<0);
 const grossWin=wins.reduce((s,t)=>s+t.net,0),grossLoss=Math.abs(losses.reduce((s,t)=>s+t.net,0));
 let equity=1,peak=1,mdd=0;
 for(const t of trades){equity*=1+t.net/100;peak=Math.max(peak,equity);mdd=Math.min(mdd,(equity/peak-1)*100);}
 const net=trades.reduce((s,t)=>s+t.net,0);
 return {insufficient:false,bars:rows.length,count:trades.length,wins:wins.length,losses:losses.length,winRate:trades.length?wins.length/trades.length*100:null,expectancy:trades.length?net/trades.length:null,profitFactor:grossLoss?grossWin/grossLoss:grossWin>0?Infinity:null,totalNet:(equity-1)*100,mdd,openPosition:entry,first:rows[0].time,last:rows.at(-1).time,trades:trades.slice(-8)};
}
export default function QuantResearch({candles=[],symbol='—',source='',asOf='',market='TW'}) {
 const [commission,setCommission]=useState(market==='US'?'0':market==='CRYPTO'?'0.05':'0.1425');
 const [tax,setTax]=useState(market==='US'||market==='CRYPTO'?'0':'0.30');
 const [slippage,setSlippage]=useState('0.05');
 const inputs=[commission,tax,slippage];
 const validCost=inputs.every(v=>String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=10);
 const cost=validCost?(Number(commission)*2)+Number(tax)+(Number(slippage)*2):null;
 const result=useMemo(()=>runBacktest(candles,cost),[candles,cost]);
 const card={background:'#111a2b',border:'1px solid #293951',borderRadius:12,padding:13,minWidth:0};
 const metric={background:'#172338',borderRadius:8,padding:10,minWidth:0};
 const label={display:'block',fontSize:11,color:'#91a1b8'};
 const value={fontSize:20,fontWeight:800,marginTop:5,fontVariantNumeric:'tabular-nums'};
 const field=(title,val,set)=> <label style={{display:'grid',gap:5,flex:'1 1 100px',fontSize:11,color:'#91a1b8'}}>{title}<input type="number" min="0" step="0.001" value={val} onChange={e=>set(e.target.value)} style={{width:'100%',boxSizing:'border-box',padding:8,borderRadius:7,border:'1px solid #293951',background:'#172338',color:'#e8eef8'}}/></label>;
 return <section style={{...card,marginBottom:12,color:'#e8eef8'}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',alignItems:'center'}}><b>🧪 量化研究實驗室｜EMA20／EMA60 趨勢策略</b><small style={{color:'#91a1b8'}}>個股 {symbol}｜歷史日K研究</small></div>
  <p style={{fontSize:11,color:'#91a1b8',lineHeight:1.7,margin:'8px 0'}}>規則：EMA20 上穿 EMA60 後，下一根日K開盤進場；下穿後，下一根日K開盤出場。只做多、不加碼。此為初步研究樣本，不是完整全市場回測，也未做樣本外／Walk-forward 驗證。</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>{field(market==='US'?'券商佣金（單邊 %）':market==='CRYPTO'?'交易所費率（單邊 %）':'單邊手續費 (%)',commission,setCommission)}{field(market==='US'?'交易相關費用（賣出 %）':market==='CRYPTO'?'其他交易費用（賣出 %）':'賣出交易稅 (%)',tax,setTax)}{field('單邊滑價 (%)',slippage,setSlippage)}</div>
  <div style={{fontSize:11,color:'#91a1b8',marginBottom:10}}>{market==='US'?'美股佣金／交易費用需依券商自行設定（預設 0 不代表免費）。':market==='CRYPTO'?'加密貨幣預設單邊費率 0.05% 僅為回測假設；請依交易所、VIP 等級及 Maker／Taker 實際費率修改。':'台股成本依實際券商折扣及交易稅設定。'} 本次往返成本假設：{Number.isFinite(cost)?cost.toFixed(4)+'%':'設定無效'}｜資料來源：{source||'未提供'}｜最後日K：{asOf||'日期未提供'}</div>
  {result.invalidCost?<div style={{...metric,color:'#fb7185'}}>成本參數無效。請輸入 0 至 10% 之間的非負數字；未修正前不計算績效。</div>:result.insufficient?<div style={{...metric,color:'#fbbf24'}}>歷史日K不足 65 根，目前取得 {result.count} 根。資料不足，不產生回測績效。</div>:<>
   <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>
    {[['完成交易',result.count+' 筆'],['勝率',pct(result.winRate)],['淨期望值',pct(result.expectancy)],['Profit Factor',result.profitFactor===Infinity?'∞':result.profitFactor===null?'—':result.profitFactor.toFixed(2)],['淨資金變化',pct(result.totalNet)],['最大回撤',pct(result.mdd)]].map(([k,v])=><div key={k} style={metric}><small style={label}>{k}</small><div style={{...value,color:k==='淨期望值'?(result.expectancy>0?'#34d399':'#fb7185'):'#e8eef8'}}>{v}</div></div>)}
   </div>
   <div style={{marginTop:10,padding:10,borderRadius:8,background:'#172338',fontSize:11,lineHeight:1.7,color:'#cbd5e1'}}>測試區間：{result.first||'—'} 至 {result.last||'—'}；交易 {result.count} 筆、獲利 {result.wins} 筆、虧損 {result.losses} 筆。{result.openPosition?'目前最後一筆訊號仍持有，未將未實現損益混入已平倉統計。':'最後沒有未平倉部位。'}{result.count<30?' 交易樣本少於 30 筆，統計可信度不足。':''}</div>
   {result.trades.length>0&&<div style={{overflowX:'auto',marginTop:10}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}><thead><tr>{['出場日期','進場價','出場價','毛報酬','淨報酬'].map(x=><th key={x} style={{textAlign:'right',padding:7,borderBottom:'1px solid #293951',color:'#91a1b8'}}>{x}</th>)}</tr></thead><tbody>{result.trades.map((t,i)=><tr key={i}>{[t.date,t.entry.toFixed(2),t.exit.toFixed(2),pct(t.gross),pct(t.net)].map((x,j)=><td key={j} style={{textAlign:'right',padding:7,borderBottom:'1px solid #293951',color:j===4?(t.net>=0?'#fb7185':'#34d399'):'#e8eef8'}}>{x}</td>)}</tr>)}</tbody></table></div>}
  </>}
  <small style={{display:'block',marginTop:10,color:'#91a1b8',lineHeight:1.7}}>重要限制：手續費與交易稅為可調假設，需依券商折扣、商品種類及當期規定校正；滑價為使用者假設。這裡使用目前載入的個股歷史日K，未含除權息調整、漲跌停無法成交、成交量容量、融券限制與完整市場倖存者偏差處理。不得單憑此結果投入實盤。</small>
 </section>;
}

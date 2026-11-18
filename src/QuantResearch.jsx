import React,{useEffect,useMemo,useState} from 'react';

const fmt=(v,suffix='')=>Number.isFinite(Number(v))?Number(v).toFixed(2)+suffix:'—';
const API=(process.env.REACT_APP_MARKET_API||'/api/market').replace(/\\/$/,'');
export default function QuantResearch({symbol='2330',source='',asOf='',market='tw-stock'}) {
 const defaults=market==='crypto'?{fee:0.10,tax:0,slippage:0.05}:market==='us-stock'?{fee:0.01,tax:0,slippage:0.05}:{fee:0.1425,tax:0.30,slippage:0.10};
 const [fee,setFee]=useState(String(defaults.fee)),[tax,setTax]=useState(String(defaults.tax)),[slippage,setSlippage]=useState(String(defaults.slippage));
 const [result,setResult]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [reload,setReload]=useState(0);
 const valid=[fee,tax,slippage].every(x=>x.trim()!==''&&Number.isFinite(Number(x))&&Number(x)>=0&&Number(x)<=10);
 const params=useMemo(()=>new URLSearchParams({market,feeBps:String(Number(fee)*100),sellTaxBps:String(Number(tax)*100),slippageBps:String(Number(slippage)*100)}).toString(),[market,fee,tax,slippage]);
 useEffect(()=>{
  if(!symbol||!valid){setResult(null);return;}
  const controller=new AbortController();let alive=true;
  setLoading(true);setError('');
  const token=localStorage.getItem('ts_access_token')||'';
  const headers={Accept:'application/json'};if(token)headers.Authorization='Bearer '+token;
  fetch(API+'/research/strategies/'+encodeURIComponent(symbol)+'?'+params,{headers,signal:controller.signal})
   .then(async response=>{const body=await response.json();if(!response.ok&&body.status!=='insufficient_data')throw new Error(body.error||('HTTP '+response.status));return body;})
   .then(body=>{if(alive){setResult(body);if(body.status!=='ok')setError(body.error||'歷史資料不足，未產生策略績效');}})
   .catch(e=>{if(alive&&e.name!=='AbortError'){setResult(null);setError(e.message||'策略研究服務暫時無法連線');}})
   .finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;controller.abort();};
 },[symbol,params,valid,reload]);
 const card={background:'#111a2b',border:'1px solid #293951',borderRadius:12,padding:13,minWidth:0,color:'#e8eef8'};
 const metric={background:'#172338',borderRadius:8,padding:10,minWidth:0};
 const label={display:'block',fontSize:11,color:'#91a1b8'};
 const value={fontSize:18,fontWeight:800,marginTop:5,fontVariantNumeric:'tabular-nums'};
 const field=(title,val,set)=> <label style={{display:'grid',gap:5,flex:'1 1 100px',fontSize:11,color:'#91a1b8'}}>{title}<input type="number" min="0" max="10" step="0.001" value={val} onChange={e=>set(e.target.value)} style={{width:'100%',boxSizing:'border-box',padding:8,borderRadius:7,border:'1px solid #293951',background:'#172338',color:'#e8eef8'}}/></label>;
 const metrics=(x)=>[['交易筆數',x.trades+' 筆'],['勝率',fmt(x.winRatePct,'%')],['淨報酬',fmt(x.netReturnPct,'%')],['最大回撤',fmt(x.maxDrawdownPct,'%')],['Sharpe',fmt(x.sharpe)],['Sortino',fmt(x.sortino)],['Profit Factor',fmt(x.profitFactor)],['單筆期望值',fmt(x.expectancyPct,'%')]];
 return <section style={{...card,marginBottom:12}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',alignItems:'center'}}><b>🧪 策略實驗室｜多策略 Walk-forward 驗證</b><small style={{color:'#91a1b8'}}>標的 {symbol}｜{market==='tw-stock'?'台股':market==='us-stock'?'美股':'加密貨幣'}</small></div>
  <p style={{fontSize:11,color:'#91a1b8',lineHeight:1.7,margin:'8px 0'}}>借鏡 Pine Script 專案的自動化策略驗證流程，使用 EMA 趨勢、MACD 動能、布林均值回歸三種透明規則。60% 訓練區間與 40% 樣本外區間分開測試，訊號在收盤確認、下一根 K 線開盤成交；未通過樣本外條件不會列為候選。</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>{field('單邊手續費／費率 (%)',fee,setFee)}{field('賣出交易稅 (%)',tax,setTax)}{field('單邊滑價 (%)',slippage,setSlippage)}<button onClick={()=>setReload(x=>x+1)} disabled={loading||!valid} style={{alignSelf:'end',padding:'9px 12px',borderRadius:7,border:'1px solid #315579',background:'#18304b',color:'#bfdbfe',fontWeight:700,cursor:'pointer'}}>重新回測</button></div>
  <small style={{display:'block',color:'#91a1b8',lineHeight:1.7,marginBottom:10}}>成本為可調假設，依券商折扣、交易所 Maker／Taker、商品稅制調整。預設值不代表你的實際費率。來源：{result?.source||source||'等待歷史行情'}｜最後 K 線：{result?.asOf||asOf||'—'}｜資料筆數：{result?.barCount??'—'}</small>
  {!valid?<div style={{...metric,color:'#fb7185'}}>成本欄位無效，請輸入 0 至 10% 的數字。</div>:loading?<div style={{...metric,color:'#93c5fd'}}>正在取得歷史行情並執行多策略回測…</div>:error?<div style={{...metric,color:'#fbbf24',lineHeight:1.7}}>{error}<br/>資料不足或上游失效時不會填入模擬績效。</div>:result?.strategies?<div style={{display:'grid',gap:10}}>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',fontSize:11,color:'#91a1b8'}}><span>訓練 {result.split?.trainBars??'—'} 根</span><span>樣本外 {result.split?.outOfSampleBars??'—'} 根</span><span>切分 {result.split?.ratio||'—'}</span><span>成本已納入</span></div>
   {result.strategies.map(strategy=><div key={strategy.id} style={{background:'#172338',border:'1px solid #293951',borderRadius:9,padding:11}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',alignItems:'center'}}><b>{strategy.name}</b><span style={{fontSize:11,color:strategy.validation?.passed?'#34d399':'#fbbf24'}}>{strategy.validation?.passed?'樣本外候選通過':'尚未通過驗證'}</span></div>
    <div style={{fontSize:11,color:'#91a1b8',margin:'5px 0 9px'}}>{strategy.description}｜進場：{strategy.entry}｜出場：{strategy.exit}</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>
     {strategy.periods.map(period=><div key={period.id} style={metric}><b style={{fontSize:12}}>{period.label}</b><div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:7,marginTop:8}}>{metrics(period.metrics).map(([k,v])=><div key={k}><small style={label}>{k}</small><div style={{...value,fontSize:15,color:k==='淨報酬'?(Number(period.metrics.netReturnPct)>0?'#34d399':'#fb7185'):'#e8eef8'}}>{v}</div></div>)}</div><small style={{display:'block',marginTop:7,color:'#91a1b8'}}>市場狀態：{period.marketRegime?.regime||'—'}｜區間報酬 {fmt(period.marketRegime?.periodReturnPct,'%')}</small></div>)}
    </div>
   </div>)}
  </div>:<div style={{...metric,color:'#91a1b8'}}>尚未取得可用的策略研究結果。</div>}
  <small style={{display:'block',marginTop:10,color:'#91a1b8',lineHeight:1.7}}>研究限制：策略結果不是未來報酬保證。使用下一根 K 線開盤成交以避免同根收盤前視偏誤；尚未完整模擬限價排隊、漲跌停、停牌、融券限制、成交量容量與市場微結構。樣本外不足 5 筆交易、淨報酬不正、回撤過大或 Sharpe 不正，均不會列為通過。</small>
 </section>;
}

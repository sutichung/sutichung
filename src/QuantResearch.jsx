import React,{useEffect,useMemo,useState} from 'react';

const fmt=(v,suffix='')=>v===null||v===undefined||v===''?'—':Number.isFinite(Number(v))?Number(v).toFixed(2)+suffix:'—';
const API_BASE=import.meta.env.VITE_MARKET_API||'/api/market';
const API=API_BASE.endsWith('/')?API_BASE.slice(0,-1):API_BASE;
export default function QuantResearch({symbol='2330',source='',asOf='',market='tw-stock'}) {
 const defaults=market==='crypto'?{fee:0.10,tax:0,slippage:0.05}:market==='us-stock'?{fee:0.01,tax:0,slippage:0.05}:{fee:0.1425,tax:0.30,slippage:0.10};
 const [marketType,setMarketType]=useState(market),[targetSymbol,setTargetSymbol]=useState(symbol),[draftSymbol,setDraftSymbol]=useState(symbol);\n const [exchange,setExchange]=useState('Binance'),[cryptoType,setCryptoType]=useState('spot');
 const [fee,setFee]=useState(String(defaults.fee)),[tax,setTax]=useState(String(defaults.tax)),[slippage,setSlippage]=useState(String(defaults.slippage));
 const [result,setResult]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [outcomes,setOutcomes]=useState(null),[outcomeError,setOutcomeError]=useState('');
 const [reload,setReload]=useState(0);
 useEffect(()=>{setTargetSymbol(symbol);setDraftSymbol(symbol);},[symbol]);
 useEffect(()=>{const d=marketType==='crypto'?{fee:0.10,tax:0,slippage:0.05}:marketType==='us-stock'?{fee:0.01,tax:0,slippage:0.05}:{fee:0.1425,tax:0.30,slippage:0.10};setFee(String(d.fee));setTax(String(d.tax));setSlippage(String(d.slippage));},[marketType]);
 const valid=[fee,tax,slippage].every(x=>x.trim()!==''&&Number.isFinite(Number(x))&&Number(x)>=0&&Number(x)<=10);
 const params=useMemo(()=>new URLSearchParams({market:marketType,feeBps:String(Number(fee)*100),sellTaxBps:String(Number(tax)*100),slippageBps:String(Number(slippage)*100)}).toString(),[marketType,exchange,cryptoType,fee,tax,slippage]);
 useEffect(()=>{
  if(!targetSymbol||!valid){setResult(null);return;}
  const controller=new AbortController();let alive=true;
  setLoading(true);setError('');
  const token=localStorage.getItem('ts_access_token')||'';
  const headers={Accept:'application/json'};if(token)headers.Authorization='Bearer '+token;
  fetch(API+'/research/strategies/'+encodeURIComponent(targetSymbol)+'?'+params,{headers,signal:controller.signal})
   .then(async response=>{const body=await response.json();if(!response.ok&&body.status!=='insufficient_data')throw new Error(body.error||('HTTP '+response.status));return body;})
   .then(body=>{if(alive){setResult(body);if(body.status!=='ok')setError(body.error||'歷史資料不足，未產生策略績效');}})
   .catch(e=>{if(alive&&e.name!=='AbortError'){setResult(null);setError(e.message||'策略研究服務暫時無法連線');}})
   .finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;controller.abort();};
 },[targetSymbol,marketType,params,valid,reload]);
 useEffect(()=>{
  let alive=true;
  const load=async()=>{
   try{
    const token=localStorage.getItem('ts_access_token')||'';
    const headers={Accept:'application/json'};if(token)headers.Authorization='Bearer '+token;
    const response=await fetch(API+'/research/outcomes',{headers});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.error||('HTTP '+response.status));
    if(alive){setOutcomes(body);setOutcomeError('');}
   }catch(e){if(alive)setOutcomeError(e.message||'績效歷史暫時無法讀取');}
  };
  load();const timer=setInterval(load,300000);
  return()=>{alive=false;clearInterval(timer);};
 },[]);
 const latestOutcomes=useMemo(()=>{
  const latest={};
  for(const item of outcomes?.data||[]){
   if(!['1h','1d','5d','20d'].includes(item.horizon))continue;
   if(!latest[item.horizon]||Date.parse(item.generatedAt||'')>Date.parse(latest[item.horizon].generatedAt||''))latest[item.horizon]=item;
  }
  return latest;
 },[outcomes]);
 const card={background:'#111a2b',border:'1px solid #293951',borderRadius:12,padding:13,minWidth:0,color:'#e8eef8'};
 const metric={background:'#172338',borderRadius:8,padding:10,minWidth:0};
 const label={display:'block',fontSize:11,color:'#91a1b8'};
 const value={fontSize:18,fontWeight:800,marginTop:5,fontVariantNumeric:'tabular-nums'};
 const field=(title,val,set)=> <label style={{display:'grid',gap:5,flex:'1 1 100px',fontSize:11,color:'#91a1b8'}}>{title}<input type="number" min="0" max="10" step="0.001" value={val} onChange={e=>set(e.target.value)} style={{width:'100%',boxSizing:'border-box',padding:8,borderRadius:7,border:'1px solid #293951',background:'#172338',color:'#e8eef8'}}/></label>;
 const metrics=(x)=>[['交易筆數',x.trades+' 筆'],['勝率',fmt(x.winRatePct,'%')],['淨報酬',fmt(x.netReturnPct,'%')],['最大回撤',fmt(x.maxDrawdownPct,'%')],['Sharpe',fmt(x.sharpe)],['Sortino',fmt(x.sortino)],['Profit Factor',fmt(x.profitFactor)],['單筆期望值',fmt(x.expectancyPct,'%')]];
 return <section style={{...card,marginBottom:12}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',alignItems:'center'}}><b>🧪 策略實驗室｜多策略樣本外驗證</b><small style={{color:'#91a1b8'}}>標的 {targetSymbol}｜{marketType==='tw-stock'?'台股':marketType==='us-stock'?'美股':'加密貨幣'}</small></div>
  <p style={{fontSize:11,color:'#91a1b8',lineHeight:1.7,margin:'8px 0'}}>借鏡 Pine Script 專案的自動化策略驗證流程，使用 EMA 趨勢、MACD 動能、布林均值回歸、SMA 交叉、唐奇安突破、布林 RSI、SuperTrend、多維度市場結構共識，以及加密貨幣 4h＋1d 多時間框架策略等透明規則。60% 訓練區間與 40% 樣本外區間分開測試，並將樣本外區間切成三段 Walk-forward；另測半成本與雙倍成本情境。市場結構策略只在右側確認 K 線完成後辨識 Swing；訊號收盤確認、下一根 K 線開盤成交，任何通過都只是研究候選。</p>
  <div style={{...metric,margin:'10px 0',padding:11}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',alignItems:'center'}}><b>📈 真實訊號績效追蹤</b><small style={{color:'#91a1b8'}}>Supabase 私有歷史紀錄｜每 5 分鐘更新</small></div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:7,marginTop:9}}>
    {['1h','1d','5d','20d'].map(h=>{const item=latestOutcomes[h];return <div key={h} style={{background:'#111a2b',borderRadius:8,padding:8,minWidth:0}}><small style={label}>{h} 追蹤</small><div style={{fontSize:16,fontWeight:800,marginTop:4,color:item?.averageNetReturnPct>0?'#34d399':item?.averageNetReturnPct<0?'#fb7185':'#e8eef8'}}>{fmt(item?.directionalHitRatePct,'%')}</div><small style={label}>方向命中率</small><div style={{fontSize:12,marginTop:4}}>淨報酬 {fmt(item?.averageNetReturnPct,'%')}</div><small style={label}>{item?String(item.evaluatedCount??0)+' 筆有效樣本':'尚無有效樣本'}</small></div>;})}
   </div>
   <small style={{display:'block',color:'#91a1b8',marginTop:8,lineHeight:1.6}}>{outcomeError?(/401|authentication_required/i.test(outcomeError)?'登入後即可查看歷史績效。':'績效紀錄暫時無法讀取：'+outcomeError):outcomes?.count?('最新紀錄 '+new Date(outcomes.data[0]?.generatedAt||Date.now()).toLocaleString('zh-TW')+'；樣本不足或行情缺漏不會補造命中率。'):'尚未累積可用的歷史追蹤樣本；系統將在有效交易時段逐步建立 1 小時、1 日、5 日及 20 日紀錄。'}</small>
  </div>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}><label style={{display:'grid',gap:5,flex:'1 1 130px',fontSize:11,color:'#91a1b8'}}>市場<select value={marketType} onChange={e=>setMarketType(e.target.value)} style={{padding:8,borderRadius:7,border:'1px solid #293951',background:'#172338',color:'#e8eef8'}}><option value='tw-stock'>台股</option><option value='us-stock'>美股</option><option value='crypto'>加密貨幣</option></select></label><label style={{display:'grid',gap:5,flex:'1 1 130px',fontSize:11,color:'#91a1b8'}}>研究代號<input value={draftSymbol} onChange={e=>setDraftSymbol(e.target.value.toUpperCase().trim())} style={{padding:8,borderRadius:7,border:'1px solid #293951',background:'#172338',color:'#e8eef8'}}/></label>{marketType==='crypto'&&<><label style={{display:'grid',gap:5,flex:'1 1 140px',fontSize:11,color:'#91a1b8'}}>交易所<select value={exchange} onChange={e=>setExchange(e.target.value)} style={{padding:8,borderRadius:7,border:'1px solid #293951',background:'#172338',color:'#e8eef8'}}><option>Binance</option><option>Bybit</option><option>OKX</option><option>Coinbase</option><option>Kraken</option><option>Kraken Futures</option></select></label><label style={{display:'grid',gap:5,flex:'1 1 120px',fontSize:11,color:'#91a1b8'}}>商品類型<select value={cryptoType} onChange={e=>setCryptoType(e.target.value)} style={{padding:8,borderRadius:7,border:'1px solid #293951',background:'#172338',color:'#e8eef8'}}><option value='spot'>現貨</option><option value='perpetual'>永續合約</option></select></label></>}{field('單邊手續費／費率 (%)',fee,setFee)}{field('賣出交易稅 (%)',tax,setTax)}{field('單邊滑價 (%)',slippage,setSlippage)}<button onClick={()=>{setTargetSymbol(draftSymbol.toUpperCase().trim());setReload(x=>x+1);}} disabled={loading||!valid||!draftSymbol.trim()} style={{alignSelf:'end',padding:'9px 12px',borderRadius:7,border:'1px solid #315579',background:'#18304b',color:'#bfdbfe',fontWeight:700,cursor:'pointer'}}>重新回測</button></div>
  <small style={{display:'block',color:'#91a1b8',lineHeight:1.7,marginBottom:10}}>成本為可調假設，依券商折扣、交易所 Maker／Taker、商品稅制調整。預設值不代表你的實際費率。來源：{result?.source||source||'等待歷史行情'}{marketType==='crypto'?'｜交易所：'+exchange+'｜商品：'+(cryptoType==='spot'?'現貨':'永續合約'):''}｜最後 K 線：{result?.asOf||asOf||'—'}｜資料筆數：{result?.barCount??'—'}</small>
  {!valid?<div style={{...metric,color:'#fb7185'}}>成本欄位無效，請輸入 0 至 10% 的數字。</div>:loading?<div style={{...metric,color:'#93c5fd'}}>正在取得歷史行情並執行多策略回測…</div>:error?<div style={{...metric,color:'#fbbf24',lineHeight:1.7}}>{error}<br/>資料不足或上游失效時不會填入模擬績效。</div>:result?.strategies?<div style={{display:'grid',gap:10}}>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',fontSize:11,color:'#91a1b8'}}><span>訓練 {result.split?.trainBars??'—'} 根</span><span>樣本外 {result.split?.outOfSampleBars??'—'} 根</span><span>切分 {result.split?.ratio||'—'}</span><span>策略 {result.strategyCount??result.strategies.length} 種</span><span>成本已納入</span></div>
   {result.strategies.map(strategy=><div key={strategy.id} style={{background:'#172338',border:'1px solid #293951',borderRadius:9,padding:11}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',alignItems:'center'}}><b>{strategy.name}</b><span style={{fontSize:11,color:strategy.validation?.passed?'#34d399':'#fbbf24'}}>{strategy.validation?.passed?'初步樣本外通過・非投資建議':'尚未通過驗證'}</span></div>
    <div style={{fontSize:11,color:'#91a1b8',margin:'5px 0 9px'}}>{strategy.description}{strategy.timeframes?`｜週期：${strategy.timeframes.execution} 執行／${strategy.timeframes.trendFilter} 趨勢過濾`:''}｜進場：{strategy.entry||'依策略規則'}｜出場：{strategy.exit||'依策略規則'}</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>
     {strategy.periods.map(period=><div key={period.id} style={metric}><b style={{fontSize:12}}>{period.label}</b><div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:7,marginTop:8}}>{metrics(period.metrics).map(([k,v])=><div key={k}><small style={label}>{k}</small><div style={{...value,fontSize:15,color:k==='淨報酬'?(Number(period.metrics.netReturnPct)>0?'#34d399':'#fb7185'):'#e8eef8'}}>{v}</div></div>)}</div><small style={{display:'block',marginTop:7,color:'#91a1b8'}}>市場狀態：{period.marketRegime?.regime||'—'}｜區間報酬 {fmt(period.marketRegime?.periodReturnPct,'%')}</small></div>)}
    </div>
    <div style={{marginTop:9,padding:9,borderRadius:8,background:'#111a2b'}}>
     <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><b style={{fontSize:12}}>Walk-forward 三段樣本外驗證</b><span style={{fontSize:11,color:strategy.walkForward?.passed?'#34d399':'#fbbf24'}}>{strategy.walkForward?.passed?'三段條件通過':'尚未通過／樣本不足'}</span></div>
     <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:6,marginTop:8}}>
      {(strategy.walkForward?.folds||[]).map(fold=><div key={fold.fold} style={{background:'#172338',borderRadius:7,padding:7,minWidth:0}}><small style={label}>Fold {fold.fold}｜{fold.marketRegime?.regime||'—'}</small><div style={{fontSize:14,fontWeight:800,marginTop:4}}>{fmt(fold.metrics?.netReturnPct,'%')}</div><small style={label}>{fold.metrics?.trades??0} 筆交易</small></div>)}
     </div>
     <small style={{display:'block',marginTop:7,color:'#91a1b8'}}>總交易 {strategy.walkForward?.totalTrades??0} 筆｜正報酬區段 {strategy.walkForward?.positiveFolds??0}/3｜平均報酬 {fmt(strategy.walkForward?.averageNetReturnPct,'%')}｜最差回撤 {fmt(strategy.walkForward?.worstMaxDrawdownPct,'%')}</small>
     <small style={{display:'block',marginTop:6,color:'#91a1b8'}}>成本敏感度：半成本 {fmt(strategy.costSensitivity?.halfCost?.netReturnPct,'%')}｜基準 {fmt(strategy.costSensitivity?.baseCost?.netReturnPct,'%')}｜雙倍成本 {fmt(strategy.costSensitivity?.doubleCost?.netReturnPct,'%')}（雙倍成本仍為正：{strategy.costSensitivity?.doubleCostStillPositive?'是':'否／無有效交易'}）</small>
    </div>
   </div>)}
  </div>:<div style={{...metric,color:'#91a1b8'}}>尚未取得可用的策略研究結果。</div>}
  <small style={{display:'block',marginTop:10,color:'#91a1b8',lineHeight:1.7}}>研究限制：策略結果不是未來報酬保證。使用下一根 K 線開盤成交以避免同根收盤前視偏誤；尚未完整模擬限價排隊、漲跌停、停牌、融券限制、成交量容量與市場微結構。樣本外不足 10 筆交易、淨報酬不正、回撤超過 15%、Sharpe 不正、Profit Factor 不大於 1.1，或三段 Walk-forward 不符合條件，均不會列為通過。未校正多重策略比較偏誤，也未使用歷史時點成分股名單，因此仍有多重測試與存活者偏誤；價格報酬未計股利及公司行動，空方未計融券借券費。</small>
 </section>;
}

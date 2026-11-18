import React,{useCallback,useEffect,useMemo,useState} from 'react';
import CandleChart from './CandleChart';
import QuantResearch from './QuantResearch';

const API='/api/us';
const colors={bg:'#080d18',panel:'#111a2b',panel2:'#172338',border:'#293951',text:'#e8eef8',muted:'#91a1b8',blue:'#60a5fa',green:'#34d399',red:'#fb7185',yellow:'#fbbf24'};
const fmt=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const pct=v=>Number.isFinite(Number(v))?(Number(v)>0?'+':'')+fmt(v)+'%':'—';
async function api(path,signal){const token=localStorage.getItem('ts_access_token')||'',headers={Accept:'application/json'};if(token)headers.Authorization='Bearer '+token;const r=await fetch(API+path,{headers,signal});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||('HTTP '+r.status));return r.json();}
function Box({title,children,right}){return <section style={{background:colors.panel,border:'1px solid '+colors.border,borderRadius:12,padding:13,minWidth:0}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginBottom:10,flexWrap:'wrap'}}><b>{title}</b>{right}</div>{children}</section>}
function Stat({label,value,note,color=colors.text}){return <div style={{background:colors.panel2,borderRadius:8,padding:10,minWidth:0}}><small style={{color:colors.muted}}>{label}</small><div style={{fontSize:18,fontWeight:800,color,marginTop:4,overflowWrap:'anywhere'}}>{value}</div>{note&&<small style={{color:colors.muted}}>{note}</small>}</div>}
export default function USMarket(){
 const [expanded,setExpanded]=useState(true),[market,setMarket]=useState(null),[symbol,setSymbol]=useState('NVDA'),[history,setHistory]=useState([]),[historyMeta,setHistoryMeta]=useState({}),[agents,setAgents]=useState([]),[consensus,setConsensus]=useState(null),[busy,setBusy]=useState(false),[aiBusy,setAiBusy]=useState(false),[error,setError]=useState(''),[filter,setFilter]=useState(''),[sort,setSort]=useState('score');
 const loadMarket=useCallback(async(signal)=>{try{const x=await api('/market',signal);setMarket(x);setError(x.error||'');}catch(e){if(e.name!=='AbortError')setError(e.message);}},[]);
 useEffect(()=>{if(!expanded)return;const c=new AbortController();loadMarket(c.signal);const t=setInterval(()=>loadMarket(c.signal),5*60*1000);return()=>{c.abort();clearInterval(t);};},[expanded,loadMarket]);
 useEffect(()=>{if(!expanded||!symbol)return;let alive=true;const c=new AbortController();setHistory([]);setHistoryMeta({});api('/history/'+encodeURIComponent(symbol),c.signal).then(x=>{if(alive){setHistory(x.data||[]);setHistoryMeta({source:x.source||'',asOf:x.asOf||x.data?.at(-1)?.time||null,timestamp:x.timestamp||null});}}).catch(e=>{if(alive&&e.name!=='AbortError')setError(e.message);});return()=>{alive=false;c.abort();};},[expanded,symbol]);
 const selected=market?.scan?.find(x=>x.symbol===symbol)||market?.data?.[symbol]||{};
 const ind=selected.indicators||{};
 const runAI=async()=>{setAiBusy(true);try{const x=await api('/agents/'+encodeURIComponent(symbol)+'?refresh=1');setAgents(x.agents||[]);setConsensus(x.consensus||null);}catch(e){setError(e.message);}finally{setAiBusy(false);}};
 const rows=useMemo(()=>{const all=market?.scan||[];return all.filter(x=>(x.symbol+' '+x.name+' '+x.sector).toLowerCase().includes(filter.toLowerCase())).sort((a,b)=>sort==='change'?(b.changePct??-Infinity)-(a.changePct??-Infinity):(b.scorecard?.score??0)-(a.scorecard?.score??0));},[market,filter,sort]);
 const recommendations=useMemo(()=>rows.filter(x=>x.scorecard?.status==='research-ready'&&x.scorecard?.direction==='偏向買進').slice(0,6),[rows]);
 const grid={display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8};
 return <section id="us-market" style={{margin:'16px 0',padding:14,border:'1px solid '+colors.border,borderRadius:14,background:'#0b1422',color:colors.text,fontFamily:'Inter,system-ui,sans-serif'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}>
   <div><div style={{fontSize:20,fontWeight:900}}>🇺🇸 美股智慧研究專區</div><small style={{color:colors.muted}}>美股指數・個股掃描・技術指標・AI 三方分析・量化回測</small></div>
   <button onClick={()=>setExpanded(v=>!v)} style={{background:colors.panel2,color:colors.text,border:'1px solid '+colors.border,borderRadius:8,padding:'8px 12px'}}>{expanded?'收合專區':'展開美股專區'}</button>
  </div>
  {expanded&&<div style={{display:'grid',gap:12,marginTop:14}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',fontSize:11,color:colors.muted}}><span>資料：{market?.source||'連線中'}｜更新：{market?.timestamp?new Date(market.timestamp).toLocaleString('zh-TW'):'—'}</span><span>涵蓋 {market?.coverage?.stocks??0}/{market?.coverage?.universe??30} 檔股票／ETF；非全市場清單</span></div>
   {error&&<div role="status" style={{background:'#351b20',color:'#fecdd3',padding:9,borderRadius:8,fontSize:12}}>{error}</div>}
   <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8}}>{(market?.indices||[]).map(x=><Stat key={x.symbol} label={x.name||x.symbol} value={fmt(x.price)} note={pct(x.changePct)+' · '+(x.marketState||'')} color={x.changePct>=0?colors.green:colors.red}/>)}</div>
   <Box title="📊 美股強弱掃描" right={<small style={{color:colors.muted}}>規則式研究評分，不是勝率</small>}>
    <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="搜尋美股代號／公司／產業" style={{width:'100%',padding:9,background:colors.panel2,color:colors.text,border:'1px solid '+colors.border,borderRadius:7,marginBottom:8}}/>
    <div style={{display:'flex',gap:6,marginBottom:8}}><button onClick={()=>setSort('score')} style={{background:sort==='score'?colors.blue:colors.panel2,color:colors.text,border:0,padding:7,borderRadius:6}}>研究分數</button><button onClick={()=>setSort('change')} style={{background:sort==='change'?colors.blue:colors.panel2,color:colors.text,border:0,padding:7,borderRadius:6}}>漲跌幅</button></div>
    <div style={{maxHeight:340,overflow:'auto'}}>{rows.map(x=><button key={x.symbol} onClick={()=>{setSymbol(x.symbol);setAgents([]);setConsensus(null);}} style={{display:'grid',gridTemplateColumns:'minmax(85px,1fr) minmax(0,1.5fr) repeat(2,minmax(65px,.8fr))',gap:7,alignItems:'center',width:'100%',textAlign:'left',background:x.symbol===symbol?'#20324a':'transparent',color:colors.text,border:0,borderBottom:'1px solid '+colors.border,padding:'9px 5px',cursor:'pointer'}}><b>{x.symbol}</b><span style={{fontSize:11,color:colors.muted,overflow:'hidden',textOverflow:'ellipsis'}}>{x.name}</span><b style={{textAlign:'right',color:x.changePct>=0?colors.green:colors.red}}>{pct(x.changePct)}</b><span style={{textAlign:'right',fontSize:11}}>分數 {x.scorecard?.score??'—'}</span></button>)}</div>
   </Box>
   <Box title={'📈 個股分析｜'+symbol+' '+(selected.name||'')} right={<small style={{color:colors.muted}}>{selected.marketState||'美股報價'}</small>}>
    <div style={{fontSize:28,fontWeight:900}}>{selected.currency||'USD'} {fmt(selected.price)} <span style={{fontSize:14,color:selected.changePct>=0?colors.green:colors.red}}>{pct(selected.changePct)}</span></div>
    <small style={{color:colors.muted}}>報價時間：{selected.timestamp?new Date(selected.timestamp).toLocaleString('zh-TW'):'—'}｜{selected.delayed?'可能延遲／休市報價':'來源時間戳較新'}｜{selected.source||market?.source}</small>
    <div style={{...grid,marginTop:10}}><Stat label="RSI(14)" value={fmt(ind.rsi,1)}/><Stat label="MACD" value={fmt(ind.macd,3)} note={'訊號 '+fmt(ind.macdSignal,3)}/><Stat label="EMA20" value={fmt(ind.ema20)}/><Stat label="EMA60" value={fmt(ind.ema60)}/><Stat label="ATR%" value={fmt(ind.atrPercent,2)+'%'}/><Stat label="KD-K" value={fmt(ind.k,1)}/><Stat label="20日支撐" value={fmt(ind.support)}/><Stat label="20日壓力" value={fmt(ind.resistance)}/></div>
    <div style={{marginTop:12}}>{history.length?<CandleChart data={history} source={historyMeta.source} updatedAt={historyMeta.asOf}/>:<div style={{color:colors.muted,padding:16}}>正在載入歷史 K 線，至少需要 60 根日 K 才能計算完整指標。</div>}</div>
    <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:10}}><b>研究判讀：{selected.scorecard?.direction||'資料不足'}</b><span style={{color:colors.muted,fontSize:11}}>分數 {selected.scorecard?.score??'—'}／100｜覆蓋 {selected.scorecard?.confidence??0}%</span><a href={'https://www.sec.gov/edgar/search/#/q='+encodeURIComponent(symbol)} target="_blank" rel="noreferrer" style={{color:colors.blue,fontSize:12}}>SEC 公司申報資料</a></div>
   </Box>
   <QuantResearch candles={history} symbol={symbol} source={historyMeta.source||'Yahoo Finance Chart'} asOf={historyMeta.asOf}/>
   <Box title="🤖 Gemini／Groq／Cloudflare 三方 AI 多空分析" right={<button disabled={aiBusy} onClick={runAI} style={{background:colors.blue,color:'#fff',border:0,borderRadius:7,padding:'8px 12px'}}>{aiBusy?'分析中…':'立即分析'}</button>}>
    <div style={{fontSize:11,color:colors.muted,marginBottom:8}}>AI 使用此美股代號的行情與歷史 K 線；未接通的供應商會顯示錯誤，不以其他模型冒名替代。</div>
    {consensus&&<div style={{fontSize:18,fontWeight:800,marginBottom:9}}>三方共識：{consensus.direction||'資料不足'}</div>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8}}>{['gemini','groq','cloudflare'].map(key=>{const a=agents.find(x=>x.provider===key);return <div key={key} style={{background:colors.panel2,borderRadius:8,padding:10,minWidth:0}}><b>{key==='cloudflare'?'Cloudflare AI':key[0].toUpperCase()+key.slice(1)}</b>{a?.status==='ok'?<><div style={{fontSize:22,fontWeight:900,color:a.direction==='看多'?colors.green:a.direction==='看空'?colors.red:colors.yellow}}>{a.direction} {a.score}</div><small style={{color:colors.muted}}>信心 {a.confidence}%｜{a.model}</small><p style={{fontSize:11,lineHeight:1.6}}>{a.summary}</p><small style={{color:colors.muted}}>風險：{(a.risks||[]).join('；')||'未提供'}</small></>:<small style={{display:'block',fontSize:11,color:colors.muted,marginTop:8}}>{a?.message||'尚未執行'}</small>}</div>})}</div>
   </Box>
   <Box title="⭐ 美股每日偏多候選"><div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8}}>{recommendations.map(x=><button key={x.symbol} onClick={()=>setSymbol(x.symbol)} style={{background:colors.panel2,color:colors.text,border:'1px solid '+colors.border,borderRadius:8,padding:9,textAlign:'left'}}><b>{x.symbol}</b><div style={{fontSize:11,color:colors.green}}>研究分數 {x.scorecard.score}</div><small style={{color:colors.muted}}>{x.name}</small></button>)}{!recommendations.length&&<small style={{color:colors.muted}}>目前沒有通過資料新鮮度及覆蓋率條件的偏多候選；不強行推薦。</small>}</div></Box>
   <div style={{fontSize:10,color:colors.muted,lineHeight:1.7}}>資料限制：此版使用 Yahoo Finance 非官方公開 Chart 端點，沒有即時行情服務等級保證，可能限流或中斷。美股掃描目前是 30 檔大型股／ETF觀察清單，不是全美股市場。量化回測使用日 K 並計入你設定的成本，未經樣本外驗證前不可視為實盤策略。SEC 連結提供官方申報文件入口；尚未自動抽取完整財報比率。美股價格及量化結果以美元為單位。</div>
  </div>}
 </section>;
}

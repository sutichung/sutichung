import React,{useMemo,useState} from 'react';

const n=(v)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const metric=(s,k)=>n(s?.[k]??s?.indicators?.[k]);
const money=(v)=>v===null?'—':v.toLocaleString('zh-TW',{maximumFractionDigits:2});
export default function SmartScreener({stocks=[],selected,onSelect}){
 const [mode,setMode]=useState('全部候選');
 const [horizon,setHorizon]=useState('短線');
 const [sort,setSort]=useState('score');
 const candidates=useMemo(()=>stocks.map(s=>{
  const price=metric(s,'price'),change=metric(s,'changePct'),rsi=metric(s,'rsi'),volumeRatio=metric(s,'volumeRatio'),ema20=metric(s,'ema20')??metric(s,'e20'),ema60=metric(s,'ema60')??metric(s,'e60'),macd=metric(s,'macd'),signal=metric(s,'macdSignal')??metric(s,'signal'),flow=metric(s,'institutionalNet5d')??metric(s,'foreignNet5d');
  const valid=s.scorecard?.status==='research-ready'&&s.scorecard?.fresh===true;
  const trend=ema20!==null&&ema60!==null&&ema20>ema60;
  const momentum=change!==null&&change>0&&volumeRatio!==null&&volumeRatio>=1.2;
  const chip=flow!==null&&flow>0;
  const oversold=rsi!==null&&rsi<35;
  const bullish=valid&&s.scorecard?.direction==='偏向買進';
  const signalCount=[trend,momentum,chip,rsi!==null&&rsi>=50&&rsi<=70,macd!==null&&signal!==null&&macd>signal].filter(Boolean).length;
  return {...s,_m:{price,change,rsi,volumeRatio,ema20,ema60,macd,signal,flow,trend,momentum,chip,oversold,bullish,signalCount,valid}};
 }).filter(s=>{
  const m=s._m;
  if(!m.valid)return false;
  if(horizon==='短線'&&!m.momentum&&!m.oversold&&!m.bullish)return false;
  if(horizon==='波段'&&!m.trend&&!m.bullish)return false;
  if(horizon==='長線'&&!(m.valid&&m.bullish)&&!(metric(s,'pe')!==null&&metric(s,'pb')!==null&&m.trend))return false;
  if(mode==='偏多訊號'&&!m.bullish)return false;
  if(mode==='法人買超'&&!m.chip)return false;
  if(mode==='量能放大'&&!(m.volumeRatio!==null&&m.volumeRatio>=1.5))return false;
  if(mode==='超賣觀察'&&!m.oversold)return false;
  if(mode==='均線轉強'&&!m.trend)return false;
  return true;
 }).sort((a,b)=>sort==='change'?(b._m.change??-Infinity)-(a._m.change??-Infinity):sort==='volume'?(b._m.volumeRatio??-Infinity)-(a._m.volumeRatio??-Infinity):sort==='flow'?(b._m.flow??-Infinity)-(a._m.flow??-Infinity):(b._m.signalCount-a._m.signalCount)||(b.scorecard?.score??-1)-(a.scorecard?.score??-1)),[stocks,mode,horizon,sort]);
 const modes=['全部候選','偏多訊號','法人買超','量能放大','超賣觀察','均線轉強'];
 const button=(active)=>({border:'1px solid '+(active?'#60a5fa':'#293951'),background:active?'#203958':'#172338',color:active?'#bfdbfe':'#cbd5e1',borderRadius:999,padding:'8px 11px',fontSize:11,whiteSpace:'nowrap',cursor:'pointer'});
 return <section style={{background:'#111a2b',border:'1px solid #293951',borderRadius:12,padding:14,color:'#e8eef8',marginBottom:12}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',alignItems:'center'}}><b>🧭 智慧選股工作台</b><small style={{color:'#91a1b8'}}>依現有行情、技術與籌碼欄位篩選；不補造缺失資料</small></div>
  <div style={{display:'flex',gap:7,flexWrap:'wrap',margin:'12px 0 9px'}}>{['短線','波段','長線'].map(x=><button key={x} onClick={()=>setHorizon(x)} style={button(horizon===x)}>{x}</button>)}</div>
  <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:10}}>{modes.map(x=><button key={x} onClick={()=>setMode(x)} style={button(mode===x)}>{x}</button>)}</div>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:8}}><small style={{color:'#91a1b8'}}>符合條件 {candidates.length} 檔｜排序依據</small><div style={{display:'flex',gap:6}}>{[['score','條件數／AI分數'],['change','漲跌幅'],['volume','量比'],['flow','法人買超']].map(([v,t])=><button key={v} onClick={()=>setSort(v)} style={button(sort===v)}>{t}</button>)}</div></div>
  {candidates.length?<div style={{display:'grid',gap:7}}>{candidates.slice(0,12).map(s=>{const m=s._m;return <button key={s.symbol} onClick={()=>onSelect?.(s.symbol)} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:8,textAlign:'left',alignItems:'center',width:'100%',background:selected===s.symbol?'#1c3150':'#172338',border:'1px solid '+(selected===s.symbol?'#60a5fa':'#293951'),borderRadius:9,padding:10,color:'#e8eef8',cursor:'pointer'}}><span style={{minWidth:0}}><b>{s.symbol} {s.name||''}</b><small style={{display:'block',color:'#91a1b8',marginTop:4}}>RSI {money(m.rsi)}　量比 {money(m.volumeRatio)}　EMA20/60 {money(m.ema20)}/{money(m.ema60)}</small><small style={{display:'block',color:'#91a1b8',marginTop:3}}>{[m.bullish?'AI偏多':null,m.trend?'均線轉強':null,m.momentum?'價量動能':null,m.chip?'法人買超':null,m.oversold?'RSI超賣觀察':null].filter(Boolean).join(' · ')||'條件資料不足'}</small></span><span style={{textAlign:'right',whiteSpace:'nowrap'}}><b style={{color:m.change===null?'#91a1b8':m.change>=0?'#fb7185':'#34d399'}}>{m.change===null?'—':(m.change>0?'+':'')+m.change.toFixed(2)+'%'}</b><small style={{display:'block',color:'#91a1b8',marginTop:4}}>條件 {m.signalCount}/5</small></span></button>})}</div>:<div style={{padding:13,background:'#172338',borderRadius:8,color:'#91a1b8',fontSize:12}}>目前沒有符合條件且資料足夠的標的。可切換策略或等待下一輪有效行情；系統不會為了填滿名單而降低資料門檻。</div>}
  <small style={{display:'block',color:'#91a1b8',lineHeight:1.6,marginTop:9}}>短線著重價量動能；波段著重 EMA20/60 趨勢；長線僅納入有有效量化訊號或估值與趨勢欄位的股票。篩選結果是研究候選，不是自動下單指令或報酬保證。資料來源時間與即時／延遲狀態請以個股行情區為準。</small>
 </section>;
}

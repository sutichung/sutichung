import React,{useCallback,useEffect,useState} from 'react';

const API='/api/intelligence/overview';
const palette={bg:'#0b1422',panel:'#111a2b',panel2:'#172338',border:'#293951',text:'#e8eef8',muted:'#91a1b8',blue:'#60a5fa',green:'#34d399',red:'#fb7185',yellow:'#fbbf24'};
async function load(){const token=localStorage.getItem('ts_access_token')||'';const r=await fetch(API,{headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'情報中心載入失敗 '+r.status);return data;}
function Card({title,children}){return <section style={{background:palette.panel,border:'1px solid '+palette.border,borderRadius:12,padding:13,minWidth:0}}><b>{title}</b><div style={{marginTop:10}}>{children}</div></section>}
const badge=(status)=>({display:'inline-block',fontSize:10,padding:'3px 7px',borderRadius:20,border:'1px solid '+palette.border,color:status==='connected'?palette.green:status==='partial'?palette.yellow:palette.muted,background:palette.panel2});
export default function GlobalIntelligence(){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[topic,setTopic]=useState('all'),[updated,setUpdated]=useState(null);
 const refresh=useCallback(async()=>{setBusy(true);try{const x=await load();setData(x);setUpdated(new Date().toISOString());setError('');}catch(e){setError(e.message);}finally{setBusy(false);}},[]);
 useEffect(()=>{refresh();const timer=setInterval(refresh,300000);return()=>clearInterval(timer);},[refresh]);
 const items=(data?.items||[]).filter(x=>topic==='all'||x.topic===topic);
 return <section id="global-intelligence" style={{margin:'16px 0',padding:14,border:'1px solid '+palette.border,borderRadius:14,background:palette.bg,color:palette.text,fontFamily:'Inter,system-ui,sans-serif'}}>
  <style>{'@media(max-width:700px){#global-intelligence .intel-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}#global-intelligence .intel-sources{grid-template-columns:1fr!important}}'}</style>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}}><div><div style={{fontSize:21,fontWeight:900}}>🛡️ 全球情報・攻防偵測・持續驗證中心</div><small style={{color:palette.muted}}>拒絕當韭菜｜來源交叉比對｜多空反證｜安全監控｜歷史結果驗證</small></div><button onClick={refresh} disabled={busy} style={{background:palette.blue,color:'#fff',border:0,borderRadius:8,padding:'8px 12px',fontWeight:800}}>{busy?'更新中…':'立即更新情報'}</button></div>
  {error&&<div role="alert" style={{marginTop:10,padding:9,borderRadius:8,background:'#351b20',color:'#fecdd3',fontSize:12}}>{error}</div>}
  <div className="intel-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8,margin:'12px 0'}}>
   {[['已收集情報',data?.summary?.items??'—'],['交叉驗證完成',data?.summary?.verifiedItems??0],['待驗證資訊',data?.summary?.unverifiedItems??'—'],['防火牆攔截',data?.security?.blocked??'—']].map(([k,v])=><div key={k} style={{background:palette.panel2,borderRadius:9,padding:10}}><small style={{color:palette.muted}}>{k}</small><div style={{fontSize:21,fontWeight:850,marginTop:4}}>{v}</div></div>)}
  </div>
  <Card title="🌍 情報來源與覆蓋率">
   <div className="intel-sources" style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>{(data?.sources||[]).map(s=><div key={s.id} style={{padding:9,background:palette.panel2,borderRadius:8}}><div style={{display:'flex',justifyContent:'space-between',gap:6,alignItems:'center'}}><b style={{fontSize:12}}>{s.label}</b><span style={badge(s.status)}>{s.status==='connected'?'已接通':s.status==='partial'?'部分接通':s.status==='empty'?'目前無資料':s.status==='unavailable'?'暫不可用':'尚未接通'}</span></div><div style={{fontSize:11,color:palette.muted,marginTop:5,lineHeight:1.5}}>{s.coverage}｜筆數 {s.items}</div></div>)}</div>
  </Card>
  <div style={{height:10}}/>
  <Card title="🧭 跨領域情報分類">
   <div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button onClick={()=>setTopic('all')} style={{...btnStyle,background:topic==='all'?palette.blue:palette.panel2}}>全部</button>{(data?.topics||[]).map(t=><button key={t.id} onClick={()=>setTopic(t.id)} style={{...btnStyle,background:topic===t.id?palette.blue:palette.panel2}}>{t.label} · {t.count}</button>)}</div>
   <div style={{marginTop:10,display:'grid',gap:8}}>{items.slice(0,40).map((x,i)=><article key={x.url||x.title+i} style={{padding:10,border:'1px solid '+palette.border,borderRadius:8,background:palette.panel2}}><div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><b style={{fontSize:13}}>{x.title}</b><span style={badge('partial')}>單一來源・待驗證</span></div>{x.summary&&<p style={{fontSize:11,color:palette.muted,lineHeight:1.6,margin:'6px 0'}}>{x.summary}</p>}<small style={{color:palette.muted}}>{x.source}｜{x.publishedAt||'發布時間未提供'}｜分類 {x.topic}</small>{x.url&&<div style={{marginTop:5}}><a href={x.url} target="_blank" rel="noreferrer" style={{color:palette.blue,fontSize:11}}>查看原始來源 ↗</a></div>}</article>)}{!items.length&&<div style={{fontSize:12,color:palette.muted}}>目前沒有此分類的可用資料；不以空資料推測市場方向。</div>}</div>
  </Card>
  <div style={{height:10}}/>
  <Card title="🧠 拒絕當韭菜：交叉驗證與反向攻防規則">
   <div style={{display:'grid',gap:7}}>{(data?.decisionRules||[]).map((x,i)=><div key={i} style={{display:'flex',gap:8,fontSize:12,lineHeight:1.6}}><b style={{color:palette.blue}}>{i+1}.</b><span>{x}</span></div>)}</div>
  </Card>
  <div style={{height:10}}/>
  <Card title="🚨 網站攻防監控（目前為單一執行個體記憶體統計）">
   <div className="intel-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8}}>{[['請求數',data?.security?.requests],['封鎖數',data?.security?.blocked],['掃描探測',data?.security?.probes],['頻率限制',data?.security?.rateLimited]].map(([k,v])=><div key={k} style={{padding:9,background:palette.panel2,borderRadius:8}}><small style={{color:palette.muted}}>{k}</small><div style={{fontSize:19,fontWeight:800}}>{v??'—'}</div></div>)}</div>
   <small style={{display:'block',color:palette.muted,marginTop:8,lineHeight:1.5}}>{data?.security?.scope||'安全事件統計尚未取得'}。這不是分散式 WAF，也不能防禦大型 DDoS。</small>
  </Card>
  <div style={{height:10}}/>
  <Card title="📚 持續學習：資料紀律與目前限制">
   <div style={{fontSize:12,lineHeight:1.7}}><b style={{color:palette.green}}>已建立：</b>定期重新擷取目前已接通來源、分類去重、保留原始連結、明確標示單一來源待驗證。<br/><b style={{color:palette.yellow}}>尚未完成：</b>持久化事件資料庫、跨來源自動比對、預測快照與 1 小時／1 天／5 天／20 天績效追蹤、模型自動校準。這些需要資料庫 schema 與背景排程，不能假裝已經在訓練。<br/><b style={{color:palette.muted}}>更新時間：</b>{updated?new Date(updated).toLocaleString('zh-TW'):'等待資料'}｜伺服器資料時間：{data?.generatedAt?new Date(data.generatedAt).toLocaleString('zh-TW'):'—'}</div>
   <ul style={{fontSize:11,color:palette.muted,lineHeight:1.7,paddingLeft:18}}>{(data?.limitations||[]).map((x,i)=><li key={i}>{x}</li>)}</ul>
  </Card>
 </section>;
}
const btnStyle={border:'1px solid '+palette.border,color:palette.text,borderRadius:20,padding:'6px 9px',fontSize:11,cursor:'pointer'};

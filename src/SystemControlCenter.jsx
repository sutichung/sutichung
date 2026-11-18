import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
const palette = { bg:'#0b1422', panel:'#111d30', border:'#2b405c', text:'#e7eef9', muted:'#91a1b8', green:'#34d399', yellow:'#fbbf24', red:'#fb7185', blue:'#60a5fa' };
const crews = [
  { id:'network', name:'網路與伺服器維修組', icon:'🌐', test:/health|伺服器|網路|api/i, action:'檢查服務存活、API 回應與上游連線；若服務無回應，先確認 Render 部署與日誌。' },
  { id:'data', name:'行情資料維修組', icon:'📡', test:/twse|finmind|fugle|行情|資料/i, action:'核對來源時間戳、資料筆數與延遲標記；來源故障時切換已配置的公開資料備援，不把舊資料冒充即時。' },
  { id:'security', name:'安全防護維修組', icon:'🛡️', test:/auth|supabase|安全|登入/i, action:'檢查登入服務與防火牆狀態；不自動變更帳號、金鑰或權限。' },
  { id:'ai', name:'AI 與模型維修組', icon:'🧠', test:/gemini|groq|openrouter|cloudflare|ai|模型/i, action:'辨識金鑰缺漏、權限錯誤、額度限制與上游故障；不會自動更換或讀取金鑰。' },
  { id:'workers', name:'蟻群工作調度組', icon:'🐜', test:/colony|蟻群|worker|佇列/i, action:'檢查工作佇列、執行中工蜂、失敗與重試數；佇列阻塞時先保留證據再處理。' }
];

async function getJson(path) {
  const token = localStorage.getItem('ts_access_token') || '';
  const headers = { Accept:'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(path, { headers, signal:controller.signal, cache:'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally { clearTimeout(timer); }
}
function stateOf(ok) { return ok ? 'normal' : 'warning'; }
function statusLabel(status) {
  if (status === 'connected' || status === 'normal') return '正常';
  if (status === 'not_configured') return '尚未設定';
  if (status === 'timeout') return '逾時';
  if (status === 'rate_limited') return '頻率受限';
  if (status === 'auth_error' || status === 'permission_error') return '權限／金鑰問題';
  if (status === 'error' || status === 'upstream_error') return '異常';
  return status || '未知';
}
export default function SystemControlCenter() {
  const busyRef = useRef(false);
  const [health, setHealth] = useState(null);
  const [colony, setColony] = useState(null);
  const [providers, setProviders] = useState(null);
  const [busy, setBusy] = useState(false);
  const [providerBusy, setProviderBusy] = useState(false);
  const [lastCheck, setLastCheck] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(true);

  const selfCheck = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError('');
    const results = await Promise.allSettled([getJson('/health'), getJson('/colony/status')]);
    if (results[0].status === 'fulfilled') setHealth(results[0].value);
    else setError('健康檢查失敗：' + results[0].reason.message);
    if (results[1].status === 'fulfilled') setColony(results[1].value);
    else setError(old => [old, '蟻群狀態讀取失敗：' + results[1].reason.message].filter(Boolean).join('；'));
    setLastCheck(new Date().toISOString());
    busyRef.current = false;
    setBusy(false);
  }, []);

  const fullCheck = useCallback(async () => {
    if (providerBusy) return;
    setProviderBusy(true);
    try { setProviders(await getJson('/diagnostics/providers')); }
    catch (e) { setError(old => [old, '外部服務檢測失敗：' + e.message].filter(Boolean).join('；')); }
    finally { setProviderBusy(false); }
  }, [providerBusy]);

  useEffect(() => { selfCheck(); const timer = setInterval(selfCheck, 30000); return () => clearInterval(timer); }, [selfCheck]);

  const findings = useMemo(() => {
    const list = [];
    if (!health) list.push({id:'network', title:'主服務健康狀態尚未確認', severity:'warning', crew:'network'});
    else if (!health.ok) list.push({id:'health', title:'主服務健康檢查未通過', severity:'critical', crew:'network'});
    if (health?.trading?.ready === false) list.push({id:'trading', title:'交易資料就緒條件未全部滿足', severity:'warning', crew:'data', detail:health.trading.reason || '部分資料來源或設定未就緒'});
    if (colony && colony.failed > 0) list.push({id:'colony-failed', title:'蟻群工作曾發生失敗', severity:'warning', crew:'workers', detail:'累計失敗 ' + colony.failed + ' 件；需查看最近任務與錯誤。'});
    if (colony && colony.queued > 1000) list.push({id:'colony-queue', title:'蟻群佇列積壓', severity:'warning', crew:'workers', detail:'目前等待 ' + colony.queued + ' 件。'});
    if (providers?.checks) providers.checks.forEach(item => {
      if (['error','timeout','auth_error','permission_error','rate_limited','not_configured'].includes(item.status)) {
        const crew = item.id === 'supabase' ? 'security' : ['gemini','groq','openrouter'].includes(item.id) ? 'ai' : 'data';
        list.push({id:'provider-'+item.id,title:item.label+'：'+statusLabel(item.status),severity:item.status==='not_configured'?'info':'warning',crew,detail:item.message});
      }
    });
    return list;
  }, [health, colony, providers]);

  const crewStatus = crews.map(crew => ({...crew, jobs:findings.filter(x => x.crew === crew.id)}));
  const critical = findings.filter(x => x.severity === 'critical').length;
  const warning = findings.filter(x => x.severity === 'warning').length;
  const overall = !health ? '檢測中' : critical ? '需要立即處理' : warning ? '有項目待維修' : '系統運作正常';
  const statusColor = !health ? palette.yellow : critical ? palette.red : warning ? palette.yellow : palette.green;

  return <section id="system-control-center" style={{margin:'12px 0',padding:14,borderRadius:14,border:'1px solid '+palette.border,background:'linear-gradient(145deg,#101d30,#0a1321)',color:palette.text,minWidth:0}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}>
      <div><div style={{fontSize:18,fontWeight:900}}>🎛️ 中央控制中心｜自動檢測與維修派遣</div><div style={{fontSize:11,color:palette.muted,marginTop:4}}>控制中心統一監督・維修小組分工・故障留痕・修復後重新驗收</div></div>
      <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
        <button onClick={selfCheck} disabled={busy} style={{border:'1px solid '+palette.border,borderRadius:8,padding:'8px 11px',background:'#1a2b43',color:palette.text}}>{busy?'檢測中…':'立即自我檢測'}</button>
        <button onClick={fullCheck} disabled={providerBusy} style={{border:'1px solid #315b83',borderRadius:8,padding:'8px 11px',background:'#15334e',color:'#bfdbfe'}}>{providerBusy?'外部檢測中…':'全面檢查外部服務'}</button>
        <button onClick={()=>setExpanded(x=>!x)} style={{border:'1px solid '+palette.border,borderRadius:8,padding:'8px 11px',background:'transparent',color:palette.muted}}>{expanded?'收合':'展開'}</button>
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8,marginTop:13}}>
      <div style={{background:palette.panel,borderRadius:9,padding:10}}><small style={{color:palette.muted}}>總體狀態</small><div style={{fontSize:14,fontWeight:800,color:statusColor,marginTop:4}}>{overall}</div></div>
      <div style={{background:palette.panel,borderRadius:9,padding:10}}><small style={{color:palette.muted}}>待處理項目</small><div style={{fontSize:19,fontWeight:900,marginTop:2}}>{findings.length}</div></div>
      <div style={{background:palette.panel,borderRadius:9,padding:10}}><small style={{color:palette.muted}}>蟻群工作</small><div style={{fontSize:14,fontWeight:800,marginTop:4}}>{colony ? (colony.activeWorkers||0)+' 執行／'+(colony.queued||0)+' 等待' : '讀取中'}</div></div>
    </div>
    <div style={{fontSize:10,color:palette.muted,marginTop:8}}>最後檢測：{lastCheck?new Date(lastCheck).toLocaleString('zh-TW'):'尚未完成'}　｜　自動健康檢測每 30 秒執行</div>
    {error && <div role="status" style={{marginTop:8,padding:9,borderRadius:8,background:'#3a2028',color:'#fecdd3',fontSize:11}}>{error}</div>}
    {expanded && <>
      <div style={{marginTop:14,fontWeight:800,fontSize:13}}>維修人員派遣狀態</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:8,marginTop:8}}>
        {crewStatus.map(crew=><div key={crew.id} style={{background:palette.panel,border:'1px solid '+palette.border,borderRadius:10,padding:10,minWidth:0}}>
          <div style={{fontWeight:800,fontSize:12}}>{crew.icon} {crew.name}</div>
          <div style={{fontSize:11,color:crew.jobs.length?palette.yellow:palette.green,marginTop:6}}>{crew.jobs.length?'已派工 '+crew.jobs.length+' 項':'待命／巡檢中'}</div>
          <div style={{fontSize:10,color:palette.muted,lineHeight:1.6,marginTop:5}}>{crew.jobs.length?crew.jobs.map(job=>job.title).join('；'):crew.action}</div>
        </div>)}
      </div>
      <div style={{marginTop:14,fontWeight:800,fontSize:13}}>故障工單與診斷結果</div>
      {!findings.length?<div style={{marginTop:8,padding:11,borderRadius:9,background:'#103126',color:'#a7f3d0',fontSize:12}}>目前已檢查的項目沒有觸發故障規則。外部服務完整檢查尚未執行時，不代表所有供應商都正常。</div>:
        <div style={{display:'grid',gap:7,marginTop:8}}>{findings.map(item=><div key={item.id} style={{padding:10,borderRadius:9,background:palette.panel,borderLeft:'3px solid '+(item.severity==='critical'?palette.red:item.severity==='warning'?palette.yellow:palette.blue)}}>
          <div style={{fontSize:12,fontWeight:800}}>{item.severity==='critical'?'🔴':item.severity==='warning'?'🟡':'🔵'} {item.title}</div>
          {item.detail&&<div style={{fontSize:11,color:palette.muted,marginTop:4}}>{item.detail}</div>}
        </div>)}</div>}
      {providers?.summary&&<div style={{fontSize:10,color:palette.muted,marginTop:9}}>外部服務檢測：{providers.summary.connected}/{providers.summary.total} 成功，{providers.summary.failed} 異常，{providers.summary.notConfigured} 未設定。檢測時間 {new Date(providers.generatedAt).toLocaleString('zh-TW')}。</div>}
      <div style={{marginTop:10,padding:9,borderRadius:8,background:'#172338',fontSize:10,color:palette.muted,lineHeight:1.7}}>安全規則：目前會自動檢測、分類、派工與提出修復建議；不會擅自重啟正式服務、修改資料庫、替換 API 金鑰、變更會員權限或下單。維修完成必須重新檢測驗收，避免錯誤修復造成二次故障。</div>
    </>}
  </section>;
}

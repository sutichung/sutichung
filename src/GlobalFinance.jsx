import React, { useCallback, useEffect, useState } from 'react';

const REGIONS = ['全部','亞洲','歐洲','北美洲','南美洲','中東','大洋洲'];
const STATUS = {
  public_data_only: { label: '公開資料可查', color: '#34d399' },
  directory_only: { label: '機構目錄／尚未接 API', color: '#fbbf24' },
  contract_required: { label: '需授權／合約', color: '#fbbf24' }
};
const panel = { background:'#111a2b', border:'1px solid #293951', borderRadius:12, padding:14, minWidth:0 };
const muted = { color:'#91a1b8' };

export default function GlobalFinance() {
  const [registry,setRegistry] = useState(null);
  const [fx,setFx] = useState(null);
  const [region,setRegion] = useState('全部');
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [r,f] = await Promise.all([
        fetch('/api/finance/registry',{headers:{Accept:'application/json'}}),
        fetch('/api/finance/fx',{headers:{Accept:'application/json'}})
      ]);
      if(!r.ok) throw new Error('全球金融機構目錄讀取失敗：HTTP '+r.status);
      if(!f.ok) throw new Error('ECB 匯率資料讀取失敗：HTTP '+f.status);
      const [rd,fd] = await Promise.all([r.json(),f.json()]);
      setRegistry(rd); setFx(fd);
      if(fd.error) setError(fd.error);
    } catch(e) { setError(e.message || '全球金融資料暫時無法讀取'); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{load();const timer=setInterval(load,15*60*1000);return()=>clearInterval(timer);},[load]);
  const items = (registry?.institutions || []).filter(x=>region==='全部'||x.region===region);
  const cards = [
    {label:'登錄機構／官方來源',value:registry?.institutions?.length ?? '—'},
    {label:'國家／司法管轄區',value:registry?.jurisdictions ?? '—'},
    {label:'已實作公開資料介接',value:registry?.publicDataConnectorsImplemented ?? '—',note:'ECB 每日參考匯率 API 模組'},
    {label:'私人銀行帳戶連線',value:'0',note:'尚未取得銀行／聚合商授權'}
  ];
  return <section id="global-finance" style={{scrollMarginTop:78,margin:'14px 0',color:'#e8eef8',fontFamily:'Inter,system-ui,sans-serif'}}>
    <div style={{...panel,background:'linear-gradient(110deg,#172b3d,#111a2b)',marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap'}}>
        <div><div style={{fontSize:22,fontWeight:900,color:'#bfdbfe'}}>🌐 全球金融資料中心</div><div style={{fontSize:12,...muted,marginTop:5}}>跨國官方資料源・外匯基準・金融機構登錄・授權銀行連線管理</div></div>
        <button onClick={load} disabled={loading} style={{background:'#2563eb',color:'#fff',border:0,borderRadius:8,padding:'10px 14px',minHeight:42,fontWeight:700,cursor:'pointer'}}>{loading?'同步中…':'立即同步資料'}</button>
      </div>
      <div style={{fontSize:12,lineHeight:1.7,color:'#fbbf24',marginTop:10}}>目前為第一階段：公開資料與機構目錄。私人銀行餘額、存款、信用卡與交易明細尚未連線；不會以示範數字冒充真實資產。</div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8,marginBottom:10}}>
      {cards.map(c=><div key={c.label} style={{...panel,padding:11}}><small style={muted}>{c.label}</small><div style={{fontSize:21,fontWeight:850,marginTop:5}}>{c.value}</div>{c.note&&<small style={muted}>{c.note}</small>}</div>)}
    </div>
    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.3fr) minmax(260px,.9fr)',gap:10,alignItems:'start'}}>
      <div style={panel}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:10}}><b>各國金融機構與官方資料源</b><small style={muted}>目錄狀態不等於銀行帳戶已連線</small></div>
        <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:8,marginBottom:6}}>
          {REGIONS.map(x=><button key={x} onClick={()=>setRegion(x)} style={{whiteSpace:'nowrap',border:'1px solid '+(region===x?'#60a5fa':'#293951'),background:region===x?'#1d3b5c':'#172338',color:'#e8eef8',borderRadius:20,padding:'7px 11px',minHeight:38}}>{x}</button>)}
        </div>
        <div style={{display:'grid',gap:7}}>
          {items.map(x=><div key={x.code} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:8,alignItems:'center',padding:'9px 10px',background:'#172338',borderRadius:8}}>
            <div><b style={{fontSize:13}}>{x.flag} {x.name}</b><div style={{fontSize:11,...muted,marginTop:3}}>{x.country} · {x.category} · {x.capabilities}</div><a href={x.url} target="_blank" rel="noreferrer" style={{fontSize:11,color:'#60a5fa',textDecoration:'none'}}>官方資料入口 ↗</a></div>
            <span style={{fontSize:10,color:STATUS[x.status]?.color||'#fbbf24',textAlign:'right'}}>{STATUS[x.status]?.label||'待驗證'}</span>
          </div>)}
          {!items.length&&<div style={muted}>此區域尚無登錄資料。</div>}
        </div>
        <small style={{display:'block',...muted,marginTop:9}}>目錄為官方機構入口與能力盤點，不代表已取得該機構的個人帳戶 API 權限。</small>
      </div>
      <div style={{display:'grid',gap:10}}>
        <div style={panel}>
          <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center',marginBottom:8}}><b>🌍 全球外匯基準</b><small style={muted}>ECB</small></div>
          {fx?.rates?.length ? <div style={{display:'grid',gap:6}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',fontSize:10,...muted,paddingBottom:5,borderBottom:'1px solid #293951'}}><span>幣別</span><span>每 1 EUR</span><span>日期</span></div>
            {fx.rates.map(x=><div key={x.currency} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',fontSize:12,fontVariantNumeric:'tabular-nums'}}><b>{x.currency}</b><span>{Number(x.rate).toLocaleString('en-US',{maximumFractionDigits:5})}</span><span style={muted}>{x.asOf}</span></div>)}
          </div>:<div style={{fontSize:12,...muted}}>尚未取得官方匯率資料；不顯示估算值。</div>}
          <small style={{display:'block',...muted,marginTop:9}}>來源：{fx?.source||'European Central Bank Data Portal'}<br/>抓取時間：{fx?.fetchedAt?new Date(fx.fetchedAt).toLocaleString('zh-TW'):'—'}｜基準貨幣 EUR；每日參考匯率，非逐筆即時報價</small>
          {fx?.errors?.length>0&&<small style={{display:'block',color:'#fbbf24',marginTop:5}}>部分幣別暫缺：{fx.errors.map(x=>x.currency).join('、')}</small>}
        </div>
        <div style={panel}>
          <b>🔐 銀行帳戶接入閘道</b>
          <div style={{fontSize:12,lineHeight:1.8,...muted,marginTop:8}}>• 預設唯讀：餘額、帳戶與交易紀錄<br/>• 逐家確認國家法規、銀行覆蓋率與 API 合約<br/>• 使用者明確授權、可撤銷、到期即停止同步<br/>• OAuth／PKCE、伺服器端加密與稽核紀錄<br/>• 不抓取網銀密碼、不繞過 MFA、不發起轉帳</div>
          <div style={{marginTop:9,padding:9,background:'#352b18',borderRadius:7,color:'#fcd34d',fontSize:11}}>下一階段：先選台灣合法可用的銀行／開放銀行 sandbox，完成授權、撤銷與資料隔離測試，再擴展海外。</div>
        </div>
      </div>
    </div>
    {error&&<div role="status" style={{marginTop:9,padding:9,background:'#351b20',borderRadius:8,color:'#fecdd3',fontSize:11}}>資料狀態：{error}</div>}
    <style>{'@media(max-width:760px){#global-finance>div:nth-of-type(2){grid-template-columns:repeat(2,minmax(0,1fr))!important}#global-finance>div:nth-of-type(3){grid-template-columns:1fr!important}}'}</style>
  </section>;
}

import React, { useEffect, useState } from 'react';

const roles = [
  ['偵察蟻','掃描資料新鮮度'],['技術蟻','分析技術指標'],['多方蟻','整理偏多證據'],
  ['空方蟻','尋找反向證據'],['防禦蟻','檢查波動與資料風險'],['稽核蟻','驗證來源與完整性']
];
const fmt = v => Number(v||0).toLocaleString('zh-TW');
export default function AntColony(){
  const [data,setData]=useState(null),[error,setError]=useState('');
  useEffect(()=>{
    let live=true;
    const load=async()=>{
      try{
        const token=localStorage.getItem('ts_access_token')||'';
        const response=await fetch('/api/colony/status',{headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{})},cache:'no-store'});
        if(!response.ok)throw new Error(response.status===401?'請先登入會員':'蟻群監控暫時無法連線');
        const json=await response.json();if(live){setData(json);setError('');}
      }catch(e){if(live)setError(e.message);}
    };
    load();const timer=setInterval(load,4000);
    return()=>{live=false;clearInterval(timer);};
  },[]);
  const panel={background:'#111a2b',border:'1px solid #293951',borderRadius:12,padding:14,color:'#e8eef8',minWidth:0};
  const metric={background:'#172338',borderRadius:9,padding:10,minWidth:0};
  const markets=Object.entries(data?.byMarket||{});
  return <section aria-label="蟻群協作監控中心" style={{...panel,margin:'12px 0',boxShadow:'0 8px 30px rgba(0,0,0,.12)'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}>
      <div><div style={{fontSize:18,fontWeight:900}}>🐜 蟻群協作監控中心</div><div style={{fontSize:11,color:'#91a1b8',marginTop:4}}>六種專業蟻群・微批次派工・互相驗證・研究不下單</div></div>
      <span style={{fontSize:11,color:error?'#fb7185':'#34d399'}}>{error|| (data?.activeWorkers?data.activeWorkers+' 隻正在工作':'等待任務／背景待命')}</span>
    </div>
    {error?<div style={{marginTop:12,color:'#fb7185',fontSize:12}}>{error}</div>:<>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8,marginTop:12}}>
        {[[ '工作者',fmt(data?.workers) ],['處理中',fmt(data?.activeWorkers)],['排隊中',fmt(data?.queued)],['已完成',fmt(data?.completed)]].map(([label,value])=><div key={label} style={metric}><div style={{fontSize:10,color:'#91a1b8'}}>{label}</div><b style={{fontSize:20}}>{value}</b></div>)}
      </div>
      <div style={{height:7,background:'#293951',borderRadius:8,overflow:'hidden',marginTop:12}}><div style={{height:'100%',width:(data?.completionPct||0)+'%',background:'#34d399',transition:'width .35s'}}/></div>
      <div style={{fontSize:10,color:'#91a1b8',marginTop:5}}>任務完成率 {data?.completionPct||0}%　累計派工 {fmt(data?.enqueued)}　失敗 {fmt(data?.failed)}　重試 {fmt(data?.retried)}</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:7,marginTop:12}}>
        {roles.map(([name,desc])=><div key={name} style={{background:'#172338',padding:9,borderRadius:8}}><b style={{fontSize:12}}>{name}</b><div style={{fontSize:10,color:'#91a1b8',marginTop:3}}>{desc}</div></div>)}
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
        {markets.map(([name,m])=><span key={name} style={{fontSize:11,background:'#172338',padding:'6px 9px',borderRadius:7}}>{name}｜排隊 {fmt(m.queued)}・完成 {fmt(m.completed)}・失敗 {fmt(m.failed)}</span>)}
        {!markets.length&&<span style={{fontSize:11,color:'#91a1b8'}}>尚未收到市場掃描任務；載入市場資料後會自動分批派工。</span>}
      </div>
      <div style={{marginTop:12,borderTop:'1px solid #293951',paddingTop:10}}>
        <b style={{fontSize:12}}>六角色交叉判讀（規則式研究，不是 AI 勝率）</b>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:6,marginTop:7}}>
          {(data?.consensus||[]).slice(0,6).map(item=><div key={item.market+'-'+item.symbol} style={{fontSize:11,background:'#172338',padding:8,borderRadius:7}}>
            <b>{item.market} · {item.symbol}</b><div style={{marginTop:4,color:item.verdict.includes('偏多')?'#34d399':item.verdict.includes('偏空')?'#fb7185':item.verdict.includes('風險')?'#fbbf24':'#91a1b8'}}>{item.verdict}</div>
            <small style={{color:'#91a1b8'}}>證據分數 {item.evidenceScore} · {item.reason}</small>
          </div>)}
          {!data?.consensus?.length&&<span style={{fontSize:10,color:'#91a1b8'}}>等待同一批六角色完成交叉判讀。</span>}
        </div>
      </div>
      <div style={{marginTop:12,borderTop:'1px solid #293951',paddingTop:10}}>
        <b style={{fontSize:12}}>最近完成任務</b>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:6,marginTop:7}}>
          {(data?.recent||[]).slice(0,6).map(task=><div key={task.id} style={{fontSize:10,background:'#172338',padding:7,borderRadius:6,overflowWrap:'anywhere'}}>{task.market} · {task.symbol} · {task.role}<span style={{color:task.status==='failed'?'#fb7185':'#34d399'}}>　{task.status}</span></div>)}
          {!data?.recent?.length&&<span style={{fontSize:10,color:'#91a1b8'}}>等待第一批任務。</span>}
        </div>
      </div>
      <div style={{fontSize:10,color:'#91a1b8',marginTop:9}}>最近派工：{data?.lastDispatchAt?new Date(data.lastDispatchAt).toLocaleString('zh-TW'):'尚無'}　｜　佇列目前保存在服務記憶體，重啟後會重置。</div>
    </>}
  </section>;
}

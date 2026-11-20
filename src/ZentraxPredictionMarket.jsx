import React, { useCallback, useEffect, useMemo, useState } from 'react';

const GOLD = '#D6B56D';
const PANEL = 'linear-gradient(145deg,#17140f,#0d0c0a)';
const token = () => localStorage.getItem('ts_access_token') || '';
const fmt = (v, d = 2) => Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-US', { minimumFractionDigits:d, maximumFractionDigits:d }) : '—';
async function request(path, options = {}) {
  const headers = { Accept:'application/json', ...(token() ? { Authorization:'Bearer '+token() } : {}), ...(options.body ? { 'Content-Type':'application/json' } : {}) };
  const response = await fetch(path, { ...options, headers, cache:'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || ('HTTP '+response.status));
  return data;
}
function localMinuteValue(date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0,16);
}
export default function ZentraxPredictionMarket() {
  const [markets,setMarkets]=useState([]), [account,setAccount]=useState(null), [positions,setPositions]=useState([]), [orders,setOrders]=useState([]);
  const [amount,setAmount]=useState('25'), [loading,setLoading]=useState(true), [busy,setBusy]=useState(''), [error,setError]=useState(''), [message,setMessage]=useState('');
  const [admin,setAdmin]=useState({symbol:'BTCUSDT',direction:'ABOVE',strikePrice:'',closeAt:localMinuteValue(new Date(Date.now()+24*60*60*1000))});
  const load=useCallback(async()=>{
    setLoading(true); setError('');
    try {
      const m=await request('/api/prediction/markets'); setMarkets(m.markets||[]);
      if(token()) {
        const a=await request('/api/prediction/account'); setAccount(a.account ? {...a.account,isSuperAdmin:a.isSuperAdmin,assurance:a.assurance} : null); setPositions(a.positions||[]); setOrders(a.orders||[]);
        if(a.isSuperAdmin && a.assurance!=='aal2') setMessage('管理員帳號已辨識；請完成 MFA 二次驗證後建立市場。');
      } else { setAccount(null); setPositions([]); setOrders([]); }
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{ load(); const timer=setInterval(load,30000); return()=>clearInterval(timer); },[load]);
  const marketMap=useMemo(()=>new Map(markets.map(m=>[m.id,m])),[markets]);
  const place=async(market,side)=>{
    if(!token()){setError('請先登入會員，才能使用虛擬點數參與預測。');return;}
    const value=Number(amount); if(!Number.isFinite(value)||value<1||value>1000){setError('每筆預測需 1–1,000 虛擬點數。');return;}
    setBusy(market.id+side);setError('');setMessage('');
    try { const result=await request('/api/prediction/orders',{method:'POST',body:JSON.stringify({marketId:market.id,side,amount:value,clientOrderId:crypto.randomUUID()})});
      setMessage(side+' 預測已記錄：'+fmt(result.order?.shares,4)+' 份額；僅為虛擬點數。'); await load();
    } catch(e){setError(e.message);} finally{setBusy('');}
  };
  const createMarket=async event=>{
    event.preventDefault();setBusy('create');setError('');setMessage('');
    try {
      const result=await request('/api/prediction/admin/markets',{method:'POST',body:JSON.stringify({...admin,strikePrice:Number(admin.strikePrice),closeAt:new Date(admin.closeAt).toISOString()})});
      setMessage('市場已建立。參考價格 '+fmt(result.reference?.price,2)+' USDT；目前只開放虛擬點數。');
      setAdmin(x=>({...x,strikePrice:''}));await load();
    } catch(e){setError(e.message);} finally{setBusy('');}
  };
  const styles={panel:{background:PANEL,border:'1px solid rgba(214,181,109,.35)',borderRadius:16,padding:16,color:'#f5f1e8',minWidth:0},muted:{color:'#b8b1a2',fontSize:11,lineHeight:1.7},button:{border:'1px solid #8d7442',borderRadius:9,padding:'10px 13px',background:'#241d11',color:GOLD,fontWeight:800,cursor:'pointer'},input:{width:'100%',boxSizing:'border-box',background:'#100e0b',border:'1px solid #594728',borderRadius:8,padding:10,color:'#f5f1e8',marginTop:5}};
  const open=markets.filter(m=>m.status==='open'), closed=markets.filter(m=>m.status!=='open');
  return <section id="zentrax-prediction" style={{...styles.panel,margin:'12px 0',scrollMarginTop:82}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
      <div><div style={{fontSize:11,letterSpacing:2,color:GOLD,fontWeight:900}}>ZENTRAX · CRYPTO PREDICTION</div><h2 style={{margin:'5px 0',fontSize:23}}>加密貨幣價格預測市場</h2><div style={styles.muted}>BTC／ETH／BNB · YES／NO · 社群機率 · 到期自動判定</div></div>
      <div style={{border:'1px solid #8d7442',borderRadius:10,padding:'9px 12px',background:'#20190f'}}><small style={{color:GOLD}}>模擬帳戶餘額</small><div style={{fontSize:22,fontWeight:900}}>{account?fmt(account.balance,2)+' 點':'登入後啟用'}</div></div>
    </div>
    <div role="note" style={{marginTop:13,padding:11,borderRadius:9,background:'#302512',border:'1px solid #80632f',color:'#f4dfad',fontSize:11,lineHeight:1.7}}>
      <b>測試階段：只使用虛擬點數，不是 USDT 或 ANT。</b> 不接受充值、提款或真實資金；虛擬點數沒有現金價值。價格事件以 Binance Spot 指定 UTC 1 分鐘 K 線收盤價判定，資料源中斷時不會猜測結果。
    </div>
    {error&&<div role="alert" style={{marginTop:10,padding:10,borderRadius:8,background:'#3a171b',color:'#fecdd3',fontSize:12}}>{error}</div>}
    {message&&<div role="status" style={{marginTop:10,padding:10,borderRadius:8,background:'#183225',color:'#bbf7d0',fontSize:12}}>{message}</div>}
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'18px 0 9px',gap:8}}><b>正在開放的市場</b><button style={styles.button} onClick={load} disabled={loading}>{loading?'更新中…':'重新整理'}</button></div>
    {loading&&!markets.length?<div style={styles.muted}>載入市場資料中…</div>:open.length===0?<div style={{...styles.panel,background:'#100e0b',textAlign:'center',padding:24}}><div style={{fontSize:25}}>◈</div><b>目前沒有開放中的市場</b><p style={styles.muted}>尚未有通過管理員驗證並發布的事件。管理員可在下方建立第一個 BTC／ETH／BNB 價格事件；不會顯示虛構市場或模擬行情。</p></div>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,300px),1fr))',gap:10}}>
      {open.map(m=><article key={m.id} style={{background:'#100e0b',border:'1px solid #493a20',borderRadius:12,padding:13,minWidth:0}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:8}}><b>{m.title}</b><span style={{fontSize:10,color:'#86efac',whiteSpace:'nowrap'}}>開放中</span></div>
        <div style={{display:'flex',gap:14,flexWrap:'wrap',marginTop:10,fontSize:11,color:'#b8b1a2'}}><span>參考價：{fmt(m.reference_price,2)} USDT</span><span>目標：{fmt(m.strike_price,2)} USDT</span></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:12}}>
          <div style={{background:'#13271d',border:'1px solid #285d40',borderRadius:9,padding:10}}><small style={{color:'#86efac'}}>YES 參考價</small><div style={{fontSize:23,fontWeight:900,color:'#86efac'}}>{fmt(Number(m.yesPrice)*100,1)}%</div></div>
          <div style={{background:'#2c1b1d',border:'1px solid #63343a',borderRadius:9,padding:10}}><small style={{color:'#fda4af'}}>NO 參考價</small><div style={{fontSize:23,fontWeight:900,color:'#fda4af'}}>{fmt(Number(m.noPrice)*100,1)}%</div></div>
        </div>
        <div style={{...styles.muted,marginTop:9}}>截止：{new Date(m.close_at).toLocaleString('zh-TW',{timeZone:'UTC'})} UTC · YES 池 {fmt(m.yes_pool,2)} · NO 池 {fmt(m.no_pool,2)}</div>
        <div style={{display:'flex',gap:7,alignItems:'center',marginTop:10,flexWrap:'wrap'}}>
          <label style={{fontSize:11,color:'#b8b1a2'}}>投入點數 <input aria-label="投入虛擬點數" type="number" min="1" max="1000" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} style={{...styles.input,width:90,display:'inline-block',margin:0}}/></label>
          <button style={{...styles.button,background:'#183225',color:'#86efac',borderColor:'#285d40',flex:1}} disabled={!!busy||!account} onClick={()=>place(m,'YES')}>{busy===m.id+'YES'?'處理中…':'預測 YES'}</button>
          <button style={{...styles.button,background:'#35191d',color:'#fda4af',borderColor:'#63343a',flex:1}} disabled={!!busy||!account} onClick={()=>place(m,'NO')}>{busy===m.id+'NO'?'處理中…':'預測 NO'}</button>
        </div>
      </article>)}
    </div>}
    {account&&<div style={{marginTop:18,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,250px),1fr))',gap:10}}>
      <div style={{background:'#100e0b',border:'1px solid #493a20',borderRadius:11,padding:12}}><b>我的持倉</b>{positions.length?positions.map(p=><div key={p.market_id} style={{padding:'8px 0',borderBottom:'1px solid #302718',fontSize:11}}><b>{marketMap.get(p.market_id)?.title||p.market_id}</b><div style={styles.muted}>YES {fmt(p.yes_shares,4)} 份 · NO {fmt(p.no_shares,4)} 份 · 已投入 {fmt(Number(p.yes_cost)+Number(p.no_cost),2)} 點 · 派彩 {fmt(p.payout,2)}</div></div>):<p style={styles.muted}>尚無持倉。</p>}</div>
      <div style={{background:'#100e0b',border:'1px solid #493a20',borderRadius:11,padding:12}}><b>最近預測紀錄</b>{orders.length?orders.slice(0,8).map(o=><div key={o.id} style={{padding:'8px 0',borderBottom:'1px solid #302718',fontSize:11}}><b>{o.side} · {fmt(o.stake,2)} 點</b><div style={styles.muted}>{fmt(o.shares,4)} 份 @ {fmt(Number(o.price)*100,1)}% · {new Date(o.created_at).toLocaleString('zh-TW')}</div></div>):<p style={styles.muted}>尚無交易紀錄。</p>}</div>
    </div>}
    {account?.isSuperAdmin&&<form onSubmit={createMarket} style={{marginTop:18,padding:13,border:'1px solid #8d7442',borderRadius:11,background:'#141109'}}>
      <div style={{fontWeight:900,color:GOLD}}>管理員 · 建立價格事件</div><p style={styles.muted}>需要 SUPER_ADMIN 角色及 Supabase MFA AAL2。建立時會擷取 Binance 現貨參考價；截止時間必須是 UTC 整分鐘，並至少提前 1 小時、最多 30 天。</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:9}}>
        <label style={{fontSize:11}}>交易對<select value={admin.symbol} onChange={e=>setAdmin(x=>({...x,symbol:e.target.value}))} style={styles.input}><option value="BTCUSDT">BTC / USDT</option><option value="ETHUSDT">ETH / USDT</option><option value="BNBUSDT">BNB / USDT</option></select></label>
        <label style={{fontSize:11}}>判定方向<select value={admin.direction} onChange={e=>setAdmin(x=>({...x,direction:e.target.value}))} style={styles.input}><option value="ABOVE">到期價 ≥ 目標價</option><option value="BELOW">到期價低於目標價</option></select></label>
        <label style={{fontSize:11}}>目標價格（USDT）<input required type="number" min="0.01" step="0.01" value={admin.strikePrice} onChange={e=>setAdmin(x=>({...x,strikePrice:e.target.value}))} style={styles.input}/></label>
        <label style={{fontSize:11}}>截止時間（本地時間）<input required type="datetime-local" step="60" value={admin.closeAt} onChange={e=>setAdmin(x=>({...x,closeAt:e.target.value}))} style={styles.input}/></label>
      </div>
      <button type="submit" disabled={busy==='create'} style={{...styles.button,marginTop:10,width:'100%'}}>{busy==='create'?'建立中…':'建立測試市場'}</button>
    </form>}
    {closed.length>0&&<div style={{marginTop:16}}><b>已結算市場</b>{closed.slice(0,8).map(m=><div key={m.id} style={{fontSize:11,color:'#b8b1a2',padding:'7px 0',borderBottom:'1px solid #302718'}}>{m.title} · {m.status==='resolved'?(m.resolved_outcome?'YES 勝出':'NO 勝出'):'已取消'} · 結算價 {fmt(m.resolution_price,2)} USDT</div>)}</div>}
    <div style={{...styles.muted,marginTop:13}}>機率由虛擬 YES／NO 資金池比例形成，並設 5%–95% 價格上下限；不是交易所報價，也不代表真實勝率。結算依市場建立時公布的規則及 Binance Spot 1 分鐘 K 線收盤價。此版本不支援提前賣出、真實資產、槓桿或保證獲利。</div>
  </section>;
}


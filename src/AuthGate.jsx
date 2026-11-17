import React,{useCallback,useEffect,useState} from 'react';

const ACCESS='ts_access_token',REFRESH='ts_refresh_token';
const getToken=()=>localStorage.getItem(ACCESS)||'';
async function request(path,options={}){
  const token=getToken(),headers={'Content-Type':'application/json',...(options.headers||{})};
  if(token)headers.Authorization='Bearer '+token;
  const response=await fetch('/api'+path,{...options,headers});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload.error||('HTTP '+response.status));
  return payload;
}
function saveSession(data){
  if(data.access_token)localStorage.setItem(ACCESS,data.access_token);
  if(data.refresh_token)localStorage.setItem(REFRESH,data.refresh_token);
}
function clearSession(){localStorage.removeItem(ACCESS);localStorage.removeItem(REFRESH);}
export default function AuthGate({children}){
  const [config,setConfig]=useState(null),[user,setUser]=useState(null),[isAdmin,setIsAdmin]=useState(false);
  const [mode,setMode]=useState('login'),[email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [adminOpen,setAdminOpen]=useState(false),[members,setMembers]=useState([]),[newEmail,setNewEmail]=useState(''),[newPassword,setNewPassword]=useState('');
  const [memberBusy,setMemberBusy]=useState(false);
  const loadMe=useCallback(async()=>{
    const data=await request('/auth/me');setUser(data.user);setIsAdmin(!!data.isAdmin);
  },[]);
  useEffect(()=>{
    let alive=true;
    (async()=>{try{
      const c=await fetch('/api/auth/config').then(r=>r.json());if(!alive)return;setConfig(c);
      if(!c.configured){setError('伺服器尚未完成 Supabase 設定，會員入口暫時無法啟用。');return;}
      if(getToken()){try{await loadMe();}catch(_){
        const refresh=localStorage.getItem(REFRESH);
        if(refresh){const data=await request('/auth/refresh',{method:'POST',body:JSON.stringify({refresh_token:refresh})});saveSession(data);await loadMe();}
        else clearSession();
      }}
    }catch(e){if(alive)setError(e.message);}finally{if(alive)setBusy(false);}})();
    return()=>{alive=false;};
  },[loadMe]);
  useEffect(()=>{
    if(!user)return;
    const timer=setInterval(async()=>{const refresh=localStorage.getItem(REFRESH);if(!refresh)return;
      try{const data=await request('/auth/refresh',{method:'POST',body:JSON.stringify({refresh_token:refresh})});saveSession(data);}catch(_){clearSession();setUser(null);setIsAdmin(false);}
    },45*60*1000);
    return()=>clearInterval(timer);
  },[user]);
  const submit=async(e)=>{
    e.preventDefault();setBusy(true);setError('');setNotice('');
    try{
      if(mode==='signup'){
        const data=await request('/auth/signup',{method:'POST',body:JSON.stringify({email,password})});
        if(data.session){saveSession(data.session);await loadMe();}
        else setNotice('註冊資料已送出。請到 Email 收取 Supabase 驗證信，完成驗證後即可登入。');
      }else{
        const data=await request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});saveSession(data);await loadMe();
      }
    }catch(err){setError(err.message);}finally{setBusy(false);}
  };
  const logout=async()=>{try{await request('/auth/logout',{method:'POST'});}catch(_){}clearSession();setUser(null);setIsAdmin(false);setAdminOpen(false);};
  const loadMembers=async()=>{setMemberBusy(true);try{const data=await request('/admin/members');setMembers(data.users||[]);}catch(e){setError(e.message);}finally{setMemberBusy(false);}};
  const createMember=async(e)=>{e.preventDefault();setMemberBusy(true);setError('');try{await request('/admin/members',{method:'POST',body:JSON.stringify({email:newEmail,password:newPassword})});setNewEmail('');setNewPassword('');await loadMembers();}catch(err){setError(err.message);}finally{setMemberBusy(false);}};
  const toggleMember=async(member)=>{setMemberBusy(true);setError('');try{await request('/admin/members/'+member.id+'/'+(member.banned_until?'enable':'disable'),{method:'POST'});await loadMembers();}catch(err){setError(err.message);}finally{setMemberBusy(false);}};
  if(busy&&!user)return <div style={styles.center}>正在安全連線會員服務…</div>;
  if(!user)return <div style={styles.page}><div style={styles.card}>
    <div style={styles.mark}>TS</div><div style={styles.eyebrow}>TAIWAN STOCK HUNTER</div>
    <h1 style={styles.heading}>台股 AI 智慧操盤中樞</h1><p style={styles.sub}>會員登入與安全註冊</p>
    <div style={styles.tabs}><button style={mode==='login'?styles.activeTab:styles.tab} onClick={()=>{setMode('login');setError('');setNotice('');}}>會員登入</button><button style={mode==='signup'?styles.activeTab:styles.tab} onClick={()=>{setMode('signup');setError('');setNotice('');}}>建立帳號</button></div>
    <form onSubmit={submit} style={{display:'grid',gap:13}}>
      <label style={styles.label}>Email<input style={styles.input} type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="name@example.com"/></label>
      <label style={styles.label}>密碼<input style={styles.input} type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={10} required placeholder="至少 10 個字元"/></label>
      <button style={styles.submit} disabled={busy}>{busy?'處理中…':mode==='login'?'登入系統':'註冊會員'}</button>
    </form>
    {error&&<div style={styles.error}>{error}</div>}{notice&&<div style={styles.notice}>{notice}</div>}
    <div style={styles.foot}>會員資料由 Supabase Auth 管理；未登入無法讀取市場 API。管理員可建立及停用會員。</div>
  </div></div>;
  return <><div style={styles.userbar}><span>{user.email}{isAdmin?' · 管理員':''}</span>{isAdmin&&<button style={styles.smallBtn} onClick={()=>{setAdminOpen(true);setError('');loadMembers();}}>會員管理</button>}<button style={styles.smallBtn} onClick={logout}>登出</button></div>{adminOpen&&<div style={styles.overlay}><div style={styles.modal}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><h2 style={{margin:0}}>會員管理</h2><button style={styles.smallBtn} onClick={()=>setAdminOpen(false)}>關閉</button></div>
    <form onSubmit={createMember} style={styles.createForm}><input style={styles.input} type="email" placeholder="會員 Email" value={newEmail} onChange={e=>setNewEmail(e.target.value)} required/><input style={styles.input} type="password" minLength={10} placeholder="初始密碼（至少 10 字元）" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/><button style={styles.submit} disabled={memberBusy}>新增會員</button></form>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'14px 0 8px'}}><b>會員清單</b><button style={styles.smallBtn} onClick={loadMembers}>重新整理</button></div>
    {members.map(m=><div key={m.id} style={styles.member}><div><b>{m.email}</b><small style={{display:'block',color:'#94a3b8'}}>註冊：{m.created_at?new Date(m.created_at).toLocaleDateString('zh-TW'):'—'} · {m.banned_until?'已停用':'啟用中'}</small></div><button style={styles.smallBtn} disabled={memberBusy} onClick={()=>toggleMember(m)}>{m.banned_until?'恢復':'停用'}</button></div>)}
    {members.length===0&&<p style={{color:'#94a3b8'}}>尚無會員資料，或正在載入。</p>}{error&&<div style={styles.error}>{error}</div>}
    {!config?.adminManagementConfigured&&<div style={styles.notice}>請在 Render 設定 SUPABASE_SERVICE_ROLE_KEY，才能新增／停用會員。</div>}
  </div></div>}
  {children}</>;
}
const styles={
  page:{minHeight:'100vh',background:'radial-gradient(circle at 20% 15%,#142b48 0,#080d18 42%,#050912 100%)',display:'grid',placeItems:'center',padding:20,boxSizing:'border-box',fontFamily:'Inter,system-ui,sans-serif',color:'#e8eef8'},
  center:{minHeight:'100vh',display:'grid',placeItems:'center',background:'#080d18',color:'#cbd5e1',fontFamily:'system-ui'},
  card:{width:'min(100%,430px)',boxSizing:'border-box',background:'rgba(17,26,43,.96)',border:'1px solid #293951',borderRadius:22,padding:'30px 26px',boxShadow:'0 24px 80px #0008'},
  mark:{width:54,height:54,borderRadius:16,display:'grid',placeItems:'center',background:'linear-gradient(135deg,#2563eb,#10b981)',fontWeight:900,fontSize:22},
  eyebrow:{fontSize:10,letterSpacing:3,color:'#60a5fa',marginTop:18},heading:{fontSize:24,margin:'8px 0',color:'#f8fafc'},sub:{fontSize:13,color:'#94a3b8',marginTop:0},
  tabs:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,padding:5,background:'#0b1422',borderRadius:11,margin:'22px 0 18px'},
  tab:{border:0,background:'transparent',color:'#94a3b8',padding:11,borderRadius:8,cursor:'pointer'},activeTab:{border:0,background:'#1d3556',color:'#bfdbfe',padding:11,borderRadius:8,fontWeight:700,cursor:'pointer'},
  label:{display:'grid',gap:7,fontSize:12,color:'#cbd5e1'},input:{width:'100%',boxSizing:'border-box',padding:'13px 12px',borderRadius:10,border:'1px solid #344761',background:'#0b1422',color:'#f8fafc',fontSize:15,outline:'none'},
  submit:{border:0,borderRadius:10,padding:14,background:'linear-gradient(90deg,#2563eb,#0f9f83)',color:'white',fontWeight:800,fontSize:14,cursor:'pointer'},
  error:{marginTop:13,padding:10,borderRadius:9,background:'#451f2a',color:'#fecdd3',fontSize:12},notice:{marginTop:13,padding:10,borderRadius:9,background:'#123b35',color:'#a7f3d0',fontSize:12},
  foot:{marginTop:20,paddingTop:14,borderTop:'1px solid #293951',fontSize:11,color:'#8293aa',lineHeight:1.7},
  userbar:{position:'fixed',zIndex:1000,top:9,right:12,display:'flex',alignItems:'center',gap:7,padding:'6px 8px 6px 12px',border:'1px solid #344761',borderRadius:12,background:'#0b1422ee',color:'#cbd5e1',fontSize:11,boxShadow:'0 4px 20px #0005'},
  smallBtn:{border:'1px solid #3b526e',borderRadius:8,background:'#172338',color:'#dbeafe',padding:'7px 10px',fontSize:11,cursor:'pointer'},
  overlay:{position:'fixed',zIndex:1100,inset:0,background:'#020617cc',display:'grid',placeItems:'center',padding:12},
  modal:{width:'min(100%,650px)',maxHeight:'90vh',overflowY:'auto',boxSizing:'border-box',padding:20,borderRadius:16,background:'#111a2b',border:'1px solid #344761',color:'#e8eef8'},
  createForm:{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,marginTop:16},member:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid #293951',fontSize:12}
};

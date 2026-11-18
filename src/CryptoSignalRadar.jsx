import React,{useMemo,useState} from 'react';
const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const fmt=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:3});
export default function CryptoSignalRadar({rows=[],techMap={},onSelect}){
 const [mode,setMode]=useState('quick'),[direction,setDirection]=useState('all');
 const items=useMemo(()=>rows.map(x=>{const t=techMap[x.id]||{},change=n(x.changePct),vol=n(x.quoteVolume),rsi=n(t.rsi),hist=n(t.macdHistogram),adx=n(t.adx),ema20=n(t.ema20),ema60=n(t.ema60),hasTech=[rsi,hist,adx,ema20,ema60].filter(v=>v!==null).length>=3;
  let bull=0,bear=0;if(change!==null){if(change>0)bull+=1;if(change<0)bear+=1;}if(vol!==null&&vol>0)bull+=1;if(rsi!==null){if(rsi>=52&&rsi<=72)bull+=1;if(rsi<45)bear+=1;if(rsi>78)bear+=1;}if(hist!==null){if(hist>0)bull+=1;if(hist<0)bear+=1;}if(ema20!==null&&ema60!==null){if(ema20>ema60)bull+=1;else bear+=1;}if(adx!==null&&adx>=20){if(bull>bear)bull+=1;else if(bear>bull)bear+=1;}
  const score=Math.round(50+Math.max(-45,Math.min(45,(bull-bear)*9)));const ready=mode==='quick'?change!==null&&vol!==null&&vol>0:hasTech&&change!==null;
  const side=bull>bear?'多方候選':bear>bull?'空方候選':'中立觀察';
  const risk=change!==null&&change>15?'急漲追價風險':rsi!==null&&rsi>78?'超買風險':change!==null&&change< -8?'急跌風險':vol===0?'成交量資料異常':'需確認流動性';
  return {...x,_sig:{score,side,risk,ready,bull,bear,rsi,hist,adx,change,vol,hasTech}};
 }).filter(x=>x._sig.ready&&(direction==='all'||(direction==='bull'&&x._sig.side==='多方候選')||(direction==='bear'&&x._sig.side==='空方候選'))).sort((a,b)=>b._sig.score-a._sig.score),[rows,techMap,mode,direction]);
 const button=a=>({padding:'7px 10px',borderRadius:20,border:'1px solid '+(a?'#60a5fa':'#334155'),background:a?'#203958':'#172338',color:a?'#bfdbfe':'#cbd5e1',fontSize:11,cursor:'pointer'});
 return <section style={{background:'#111a2b',border:'1px solid #293951',borderRadius:12,padding:13,margin:'12px 0',color:'#e8eef8'}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><b>⚡ 訊號幣雷達｜多空快速掃描</b><small style={{color:'#91a1b8'}}>只讀公開行情，不連接錢包或下單</small></div>
  <div style={{display:'flex',gap:7,flexWrap:'wrap',margin:'10px 0'}}><button style={button(mode==='quick')} onClick={()=>setMode('quick')}>快速模式</button><button style={button(mode==='deep')} onClick={()=>setMode('deep')}>加強模式</button>{[['all','全部'],['bull','偏多'],['bear','偏空']].map(([v,t])=><button key={v} style={button(direction===v)} onClick={()=>setDirection(v)}>{t}</button>)}</div>
  <small style={{display:'block',color:'#91a1b8',marginBottom:8}}>{mode==='quick'?'快速：先依 24 小時漲跌與成交額排序；適合大範圍找異動。':'加強：只列出取得至少三項技術因子的交易對，交叉檢查 RSI、MACD、ADX、EMA 趨勢。'}｜候選 {items.length} 檔；加強模式可按「全市場逐幣技術掃描」補齊資料。</small>
  {items.length?<div style={{display:'grid',gap:6}}>{items.slice(0,12).map(x=>{const s=x._sig;return <button key={x.id} onClick={()=>onSelect?.(x)} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:8,textAlign:'left',background:'#172338',border:'1px solid #293951',borderRadius:8,padding:9,color:'#e8eef8',cursor:'pointer'}}><span><b>{x.symbol} · {x.exchange} · {x.marketType==='perpetual'?'永續':'現貨'}</b><small style={{display:'block',color:'#91a1b8',marginTop:4}}>RSI {fmt(s.rsi)} · MACD柱 {fmt(s.hist)} · ADX {fmt(s.adx)} · 成交額 {fmt(s.vol)}</small><small style={{display:'block',color:'#fbbf24',marginTop:3}}>風險：{s.risk}</small></span><span style={{textAlign:'right'}}><b style={{fontSize:19,color:s.side==='多方候選'?'#34d399':s.side==='空方候選'?'#fb7185':'#fbbf24'}}>{s.score}</b><small style={{display:'block',color:'#91a1b8'}}>{s.side}</small><small style={{color:s.change>=0?'#fb7185':'#34d399'}}>{s.change===null?'—':(s.change>0?'+':'')+s.change.toFixed(2)+'%'}</small></span></button>})}</div>:<div style={{padding:11,background:'#172338',borderRadius:8,color:'#91a1b8',fontSize:12}}>尚無足夠資料符合此模式，先更新市場或執行全市場技術掃描。</div>}
  <small style={{display:'block',color:'#91a1b8',marginTop:8,lineHeight:1.6}}>多空分數是技術因子相對計分，不代表漲跌機率。資金費率、未平倉量與清算風險需在個別永續合約詳情交叉驗證；不同交易所交易額不可直接當作同口徑深度。</small>
 </section>;
}

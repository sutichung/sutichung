import React,{useMemo,useState} from 'react';

const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const fmt=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('zh-TW',{maximumFractionDigits:2});
export default function SignalRadar({stocks=[],selected,onSelect}){
 const [mode,setMode]=useState('quick'),[filter,setFilter]=useState('all');
 const items=useMemo(()=>stocks.map(s=>{
  const g=s.indicators||s,price=num(s.price),change=num(s.changePct),rsi=num(g.rsi),vol=num(g.volumeRatio),ema20=num(g.ema20??g.e20),ema60=num(g.ema60??g.e60),macd=num(g.macdHistogram??(num(g.macd)!==null&&num(g.macdSignal??g.signal)!==null?num(g.macd)-num(g.macdSignal??g.signal):null)),flow=num(s.institutionalNet5d??s.foreignNet5d),fresh=s.scorecard?.status==='research-ready'&&s.scorecard?.fresh===true;
  const checks=[change!==null&&change>0,vol!==null&&vol>=1.5, rsi!==null&&rsi>=50&&rsi<=75,ema20!==null&&ema60!==null&&ema20>ema60,macd!==null&&macd>0,flow!==null&&flow>0];
  const available=[change,vol,rsi,ema20,ema60,macd,flow].filter(x=>x!==null).length;
  let score=0; if(change!==null)score+=Math.max(0,Math.min(20,change*2));if(vol!==null)score+=Math.max(0,Math.min(20,(vol-1)*10));if(rsi!==null)score+=rsi>=50&&rsi<=70?15:rsi>70?5:0;if(ema20!==null&&ema60!==null&&ema20>ema60)score+=15;if(macd!==null&&macd>0)score+=15;if(flow!==null&&flow>0)score+=10;if(fresh&&s.scorecard?.direction==='偏向買進')score+=5;
  const risk=change!==null&&change>=8?'急漲追價風險':rsi!==null&&rsi>=78?'過熱風險':change!==null&&change<0?'動能轉弱':'待觀察';
  const ready=mode==='quick'?available>=2&&fresh:available>=4&&fresh;
  return {...s,_signal:{score:Math.min(100,Math.round(score)),checks:checks.filter(Boolean).length,available,ready,change,vol,rsi,ema20,ema60,macd,flow,risk,fresh}};
 }).filter(s=>s._signal.ready&&(filter==='all'||(filter==='hot'&&s._signal.change>=3&&s._signal.vol>=1.5)||(filter==='trend'&&s._signal.ema20>s._signal.ema60)||(filter==='flow'&&s._signal.flow>0))).sort((a,b)=>b._signal.score-a._signal.score),[stocks,mode,filter]);
 const button=(active)=>({padding:'7px 10px',borderRadius:20,border:'1px solid '+(active?'#60a5fa':'#334155'),background:active?'#203958':'#172338',color:active?'#bfdbfe':'#cbd5e1',fontSize:11,cursor:'pointer'});
 return <section style={{background:'#111a2b',border:'1px solid #293951',borderRadius:12,padding:14,color:'#e8eef8',marginBottom:12}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',alignItems:'center'}}><b>🚀 飆股雷達｜快速＋加強分析</b><small style={{color:'#91a1b8'}}>候選排序，不是保證漲停或下單訊號</small></div>
  <div style={{display:'flex',gap:7,flexWrap:'wrap',margin:'11px 0'}}><button style={button(mode==='quick')} onClick={()=>setMode('quick')}>⚡ 快速掃描</button><button style={button(mode==='deep')} onClick={()=>setMode('deep')}>🧠 加強攻防</button>{[['all','全部'],['hot','爆量動能'],['trend','趨勢轉強'],['flow','法人買超']].map(([v,t])=><button key={v} style={button(filter===v)} onClick={()=>setFilter(v)}>{t}</button>)}</div>
  <div style={{fontSize:11,color:'#91a1b8',marginBottom:9}}>{mode==='quick'?'快速模式：必須通過行情與技術指標同交易日檢查，過期指標不列入訊號。':'加強模式：要求研究卡與技術指標同交易日新鮮有效；缺資料不給方向。'}｜符合 {items.length} 檔</div>
  {items.length?<div style={{display:'grid',gap:7}}>{items.slice(0,15).map(s=>{const m=s._signal;return <button key={s.symbol} onClick={()=>onSelect?.(s.symbol)} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:9,textAlign:'left',alignItems:'center',background:selected===s.symbol?'#1c3150':'#172338',border:'1px solid '+(selected===s.symbol?'#60a5fa':'#293951'),borderRadius:9,padding:10,color:'#e8eef8',cursor:'pointer'}}><span style={{minWidth:0}}><b>{s.symbol} {s.name||''}</b><small style={{display:'block',color:'#91a1b8',marginTop:4}}>RSI {fmt(m.rsi)} · 量比 {fmt(m.vol)} · 法人5日 {fmt(m.flow)}</small><small style={{display:'block',color:'#fbbf24',marginTop:3}}>風險：{m.risk} · 可用因子 {m.available}/7</small></span><span style={{textAlign:'right'}}><b style={{fontSize:20,color:m.score>=65?'#34d399':'#fbbf24'}}>{m.score}</b><small style={{display:'block',color:'#91a1b8'}}>研究分數 /100</small><small style={{color:m.change>=0?'#fb7185':'#34d399'}}>{m.change===null?'—':(m.change>0?'+':'')+m.change.toFixed(2)+'%'}</small></span></button>})}</div>:<div style={{padding:12,background:'#172338',borderRadius:8,color:'#91a1b8',fontSize:12}}>目前沒有符合條件且資料足夠的股票。請確認行情與掃描來源，系統不會用假資料補名單。</div>}
  <small style={{display:'block',color:'#91a1b8',lineHeight:1.65,marginTop:9}}>防追高規則：單日急漲、RSI 過熱、量價背離或資料過期會列為風險；加強模式資料不足時不輸出強勢結論。分數是規則式排序，尚非經回測驗證的勝率。</small>
 </section>;
}

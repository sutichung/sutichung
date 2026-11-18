import React,{useMemo} from 'react';
const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const fmt=(v,d=0)=>num(v)===null?'—':Number(v).toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d});
const moneyShares=v=>num(v)===null?'—':(v/1e8).toFixed(2)+' 億股';
const localDate=v=>v?String(v).slice(0,10):'日期未提供';
export default function MarketOverview({universe=[],snapshot={},flows={},sentiment,futures,updatedAt}){
 const indexFor=market=>Object.values(snapshot||{}).find(x=>x?.type==='INDEX'&&x?.market===market)||null;
 const taiex=indexFor('TSE'),otcIndex=indexFor('OTC');
 const breadth=useMemo(()=>{
  const rows=Object.values(snapshot||{}).filter(x=>num(x.changePct)!==null);
  const up=rows.filter(x=>x.changePct>0).length,down=rows.filter(x=>x.changePct<0).length,flat=rows.filter(x=>x.changePct===0).length;
  return {up,down,flat,count:rows.length};
 },[snapshot]);
 const institution=useMemo(()=>{
  const all=Object.entries(flows||{}).map(([symbol,f])=>({symbol,stock:universe.find(s=>s.symbol===symbol),...f}));
  const total=key=>all.reduce((sum,x)=>sum+(num(x[key])??0),0);
  const sectorMap={};
  for(const x of all){const sector=x.stock?.sector||'產業未分類';const row=sectorMap[sector]||(sectorMap[sector]={sector,net:0,count:0});if(num(x.institutionalNet)!==null){row.net+=Number(x.institutionalNet);row.count++;}}
  const sectors=Object.values(sectorMap).filter(x=>x.count).sort((a,b)=>b.net-a.net);
  return {all,foreign:total('foreignNet'),trust:total('trustNet'),dealer:total('dealerNet'),net:total('institutionalNet'),net5d:total('institutionalNet5d'),sectors,buy:all.filter(x=>num(x.institutionalNet)!==null).sort((a,b)=>b.institutionalNet-a.institutionalNet).slice(0,5),sell:all.filter(x=>num(x.institutionalNet)!==null).sort((a,b)=>a.institutionalNet-b.institutionalNet).slice(0,5),asOf:all.map(x=>x.asOf).filter(Boolean).sort().at(-1)};
 },[flows,universe]);
 const fear=num(sentiment?.fearGreed),futuresData=futures?.data||{};
 const card={background:'#111a2b',border:'1px solid #293951',borderRadius:12,padding:13,minWidth:0};
 const tone=v=>v===null?'#91a1b8':v>0?'#fb4545':v<0?'#22c55e':'#a1a1aa';
 const bar=(value,max)=>({height:7,borderRadius:8,background:'#263244',overflow:'hidden',marginTop:6,flex:1, minWidth:0,position:'relative',});
 const gauge=fear===null?null:Math.max(0,Math.min(100,fear));
 return <section style={{display:'grid',gap:12,marginBottom:14,color:'#e8eef8'}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center',flexWrap:'wrap'}}><b style={{fontSize:17}}>📊 台股市場總覽</b><small style={{color:'#91a1b8'}}>行情更新 {updatedAt?new Date(updatedAt).toLocaleTimeString('zh-TW'):'—'}｜各資料依各自日期標示</small></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>
   <div style={{...card,background:'linear-gradient(145deg,#18352f,#111a2b)'}}><small style={{color:'#a9b8c9'}}>台指期日盤</small><b style={{display:'block',fontSize:21,marginTop:7}}>{fmt(futuresData.daySession?.last??futuresData.last,0)}</b><small style={{color:tone(num(futuresData.daySession?.changePct??futuresData.changePct))}}>{num(futuresData.daySession?.changePct??futuresData.changePct)===null?'未取得有效報價':(num(futuresData.daySession?.changePct??futuresData.changePct)>0?'+':'')+fmt(futuresData.daySession?.changePct??futuresData.changePct,2)+'%'}</small></div>
   <div style={{...card,background:'linear-gradient(145deg,#18352f,#111a2b)'}}><small style={{color:'#a9b8c9'}}>台指期夜盤</small><b style={{display:'block',fontSize:21,marginTop:7}}>{fmt(futuresData.nightSession?.last,0)}</b><small style={{color:tone(num(futuresData.nightSession?.changePct))}}>{num(futuresData.nightSession?.changePct)===null?'未取得有效夜盤報價':(num(futuresData.nightSession?.changePct)>0?'+':'')+fmt(futuresData.nightSession?.changePct,2)+'%'}</small><small style={{display:'block',color:'#91a1b8',marginTop:3}}>{futuresData.nightSession?.timestamp?new Date(futuresData.nightSession.timestamp).toLocaleTimeString('zh-TW'):'時間戳未提供'}</small></div>
   <div style={{...card,background:'linear-gradient(145deg,#18352f,#111a2b)'}}><small style={{color:'#a9b8c9'}}>加權指數</small><b style={{display:'block',fontSize:21,marginTop:7}}>{taiex?fmt(taiex.price,2):'未取得指數資料'}</b><small style={{color:taiex?tone(num(taiex.changePct)):'#91a1b8'}}>{taiex&&num(taiex.changePct)!==null?(num(taiex.changePct)>0?'+':'')+fmt(taiex.changePct,2)+'%':'不以個股平均冒充大盤'}</small><small style={{display:'block',color:'#91a1b8',marginTop:3}}>{taiex?.timestamp?new Date(taiex.timestamp).toLocaleTimeString('zh-TW'):'等待官方指數快照'}</small></div>
   <div style={{...card,background:'linear-gradient(145deg,#18352f,#111a2b)'}}><small style={{color:'#a9b8c9'}}>櫃買指數</small><b style={{display:'block',fontSize:21,marginTop:7}}>{otcIndex?fmt(otcIndex.price,2):'未取得指數資料'}</b><small style={{color:otcIndex?tone(num(otcIndex.changePct)):'#91a1b8'}}>{otcIndex&&num(otcIndex.changePct)!==null?(num(otcIndex.changePct)>0?'+':'')+fmt(otcIndex.changePct,2)+'%':'不以個股平均冒充大盤'}</small><small style={{display:'block',color:'#91a1b8',marginTop:3}}>{otcIndex?.timestamp?new Date(otcIndex.timestamp).toLocaleTimeString('zh-TW'):'等待官方指數快照'}</small></div>
  </div>
  <div style={{...card,display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
   <div><b>▥ 漲跌家數</b><small style={{display:'block',color:'#91a1b8',marginTop:3}}>僅統計有漲跌幅的快照股票 {breadth.count.toLocaleString('zh-TW')} 檔</small><div style={{display:'flex',justifyContent:'space-between',marginTop:10,gap:4}}><span style={{color:'#fb4545'}}>上漲 <b>{breadth.up}</b></span><span style={{color:'#a1a1aa'}}>平盤 <b>{breadth.flat}</b></span><span style={{color:'#22c55e'}}>下跌 <b>{breadth.down}</b></span></div><div style={{display:'flex',height:8,overflow:'hidden',borderRadius:9,marginTop:9,background:'#263244'}}><div style={{width:breadth.count?breadth.up/breadth.count*100+'%':0,background:'#ef3030'}}/><div style={{width:breadth.count?breadth.flat/breadth.count*100+'%':0,background:'#888'}}/><div style={{width:breadth.count?breadth.down/breadth.count*100+'%':0,background:'#20bf6b'}}/></div></div>
   <div style={{borderLeft:'1px solid #293951',paddingLeft:12}}><b>◉ 恐懼貪婪指數</b>{gauge===null?<div style={{fontSize:19,fontWeight:800,marginTop:12,color:'#91a1b8'}}>未提供有效指數</div>:<><div style={{fontSize:25,fontWeight:850,marginTop:9,color:gauge<25?'#22c55e':gauge<45?'#f59e0b':gauge<55?'#a1a1aa':gauge<75?'#fb923c':'#fb4545'}}>{gauge}<small style={{fontSize:12,color:'#91a1b8'}}>/100　{sentiment?.label||''}</small></div><div style={{height:8,background:'linear-gradient(90deg,#22c55e,#eab308,#f97316,#ef4444)',borderRadius:8,marginTop:9,position:'relative'}}><i style={{position:'absolute',left:gauge+'%',top:-3,width:3,height:14,background:'#fff'}}/></div></>}<small style={{color:'#91a1b8',display:'block',marginTop:7}}>資料日 {localDate(sentiment?.asOf)}｜沒有指數時不以漲跌家數代替</small></div>
  </div>
  <div style={card}>
   <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><b>🏦 法人資金動向</b><small style={{color:'#91a1b8'}}>資料日 {localDate(institution.asOf)}｜單位：股數</small></div>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,marginTop:12}}><span style={{color:'#91a1b8',fontSize:12}}>三大法人合計買賣超</span><b style={{fontSize:22,color:tone(institution.net)}}>{moneyShares(institution.net)}</b></div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8,marginTop:12}}>{[['外資',institution.foreign],['投信',institution.trust],['自營商',institution.dealer]].map(([label,v])=><div key={label} style={{minWidth:0,borderTop:'1px solid #293951',paddingTop:9}}><small style={{color:'#91a1b8'}}>{label}</small><b style={{display:'block',fontSize:14,color:tone(v),marginTop:4,overflowWrap:'anywhere'}}>{moneyShares(v)}</b></div>)}</div>
   <div style={{marginTop:12,paddingTop:10,borderTop:'1px solid #293951'}}><small style={{color:'#91a1b8'}}>近五個交易日三大法人合計</small><b style={{display:'block',fontSize:17,color:tone(institution.net5d),marginTop:3}}>{moneyShares(institution.net5d)}</b></div>
  </div>
  <div style={{...card,display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
   <div><b style={{color:'#fb4545'}}>法人買超排行</b>{institution.buy.length?institution.buy.map(x=><div key={x.symbol} style={{display:'flex',justifyContent:'space-between',gap:5,borderBottom:'1px solid #293951',padding:'8px 0',fontSize:12}}><span>{x.symbol} {x.stock?.name||''}</span><b style={{color:'#fb4545',whiteSpace:'nowrap'}}>{moneyShares(x.institutionalNet)}</b></div>):<small style={{display:'block',color:'#91a1b8',marginTop:8}}>暫無可用資料</small>}</div>
   <div><b style={{color:'#22c55e'}}>法人賣超排行</b>{institution.sell.length?institution.sell.map(x=><div key={x.symbol} style={{display:'flex',justifyContent:'space-between',gap:5,borderBottom:'1px solid #293951',padding:'8px 0',fontSize:12}}><span>{x.symbol} {x.stock?.name||''}</span><b style={{color:'#22c55e',whiteSpace:'nowrap'}}>{moneyShares(x.institutionalNet)}</b></div>):<small style={{display:'block',color:'#91a1b8',marginTop:8}}>暫無可用資料</small>}</div>
  </div>
  <div style={card}><b>🏭 產業資金流向（法人買賣超股數加總）</b><small style={{display:'block',color:'#91a1b8',marginTop:4}}>依目前可對應產業的個股彙總；不是實際成交金額，也不是完整產業資金流</small>{institution.sectors.length?institution.sectors.slice(0,8).map(x=><div key={x.sector} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:8,alignItems:'center',padding:'8px 0',borderBottom:'1px solid #293951',fontSize:12}}><span>{x.sector} <small style={{color:'#91a1b8'}}>({x.count}檔)</small></span><b style={{color:tone(x.net)}}>{moneyShares(x.net)}</b></div>):<small style={{display:'block',color:'#91a1b8',marginTop:8}}>暫無可用產業分類資料</small>}</div>
  <div style={{...card,fontSize:11,color:'#91a1b8',lineHeight:1.7}}>資料說明：漲跌家數依目前 API 有效報價計算，可能不是全市場完整家數；法人資料為證交所／櫃買中心來源的買賣超股數，依交易日更新；產業排行僅彙總已取得的個股。恐懼貪婪指數只顯示供應商實際提供的數值。台指期日／夜盤分開顯示並依行情時間戳判斷新鮮度。紅漲綠跌。</div>
 </section>;
}

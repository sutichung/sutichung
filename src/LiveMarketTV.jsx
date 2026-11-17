import React, { useState } from 'react';

const CHANNELS = [
  {id:'ebc57',name:'57 東森財經新聞',kind:'youtube',channel:'UCuzqko_GKcj9922M1gUo__w',url:'https://www.youtube.com/@57ETFN/live',note:'官方 24 小時財經新聞直播'},
  {id:'sbn',name:'SBN 全球財經台',kind:'youtube',channel:'UCtNL3hNIPMvwYufr1VKLi1Q',url:'https://www.youtube.com/@SBN1688/live',note:'官方 24 小時財經直播'},
  {id:'ustv-biz',name:'非凡商業台',kind:'youtube',channel:'UCLHsQL4YChylDX-06BCuNQA',url:'https://www.youtube.com/@ustvbiz/live',note:'官方財經節目與直播'},
  {id:'set-inews',name:'三立財經 iNEWS',kind:'external',url:'https://d3uri6atc3b03q.cloudfront.net/live/691',note:'官方直播頁；若無法嵌入請外開播放'},
  {id:'ustv-news',name:'非凡新聞台',kind:'external',url:'https://news.ustv.com.tw/livevideo',note:'官方新聞直播頁；若無法嵌入請外開播放'}
];

export default function LiveMarketTV(){
 const [active,setActive]=useState('ebc57');
 const [muted,setMuted]=useState(false);
 const channel=CHANNELS.find(x=>x.id===active)||CHANNELS[0];
 const embed=channel.kind==='youtube'
  ? 'https://www.youtube-nocookie.com/embed/live_stream?channel='+channel.channel+'&autoplay=0&mute='+(muted?'1':'0')+'&playsinline=1&rel=0'
  : null;
 return <section style={{background:'#111a2b',border:'1px solid #293951',borderRadius:12,padding:14,color:'#e8eef8'}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:10}}>
   <div><b style={{fontSize:16}}>📺 台灣財經直播中心</b><small style={{display:'block',color:'#91a1b8',marginTop:4}}>官方來源｜支援 YouTube 第三方嵌入｜有聲播放</small></div>
   <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
    <button onClick={()=>setMuted(v=>!v)} style={{background:muted?'#293951':'#14532d',color:'#fff',border:0,borderRadius:7,padding:'7px 10px',cursor:'pointer'}}>{muted?'解除靜音':'🔊 聲音開啟'}</button>
    <a href={channel.url} target="_blank" rel="noreferrer" style={{background:'#243248',color:'#93c5fd',borderRadius:7,padding:'7px 10px',textDecoration:'none',fontSize:12}}>官方網站／頻道 ↗</a>
   </div>
  </div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:7,marginBottom:10}}>
   {CHANNELS.map(item=><button key={item.id} onClick={()=>setActive(item.id)} style={{textAlign:'left',background:active===item.id?'#1d426b':'#172338',color:'#e8eef8',border:'1px solid '+(active===item.id?'#60a5fa':'#293951'),borderRadius:8,padding:9,cursor:'pointer'}}>
    <b style={{fontSize:12}}>{item.name}</b><small style={{display:'block',color:'#91a1b8',fontSize:10,marginTop:4}}>{item.kind==='youtube'?'YouTube 可嵌入':'官方外連直播'}</small>
   </button>)}
  </div>
  {embed?<iframe key={channel.id+'-'+muted} title={channel.name+' 官方直播'} src={embed} style={{width:'100%',aspectRatio:'16/9',border:0,background:'#000',borderRadius:8}} allow="autoplay; encrypted-media; picture-in-picture; web-share" allowFullScreen loading="lazy"/>:
   <div style={{background:'#080d18',borderRadius:8,padding:18,textAlign:'center'}}>
    <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>{channel.name}</div><div style={{fontSize:12,color:'#91a1b8',marginBottom:12}}>此來源提供官方直播頁，但未確認允許跨網域內嵌；為避免空白播放器，請從官方頁播放。</div><a href={channel.url} target="_blank" rel="noreferrer" style={{display:'inline-block',background:'#2563eb',color:'#fff',borderRadius:8,padding:'10px 16px',textDecoration:'none'}}>開啟官方直播（可播放聲音）↗</a>
   </div>}
  <div style={{fontSize:11,color:'#91a1b8',lineHeight:1.7,marginTop:8}}>{channel.note}。首次播放請在播放器按播放並確認音量；瀏覽器會限制未經使用者互動的自動發聲。直播由原頻道提供，系統不轉播、不移除廣告或 DRM。</div>
 </section>;
}

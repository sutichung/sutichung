import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

const HLS_CHANNELS = (()=>{try{const value=JSON.parse(process.env.REACT_APP_LIVE_HLS_STREAMS||'[]');return Array.isArray(value)?value.filter(x=>x&&x.id&&x.name&&x.src&&/^https:\/\//i.test(x.src)).map(x=>({...x,url:x.url||x.src,kind:'hls'})):[];}catch(_){return [];}})();
function HlsLivePlayer({src,title}){const ref=useRef(null);useEffect(()=>{const video=ref.current;if(!video)return;let hls;if(video.canPlayType('application/vnd.apple.mpegurl'))video.src=src;else if(Hls.isSupported()){hls=new Hls({enableWorker:true,lowLatencyMode:true});hls.loadSource(src);hls.attachMedia(video);}return()=>{if(hls)hls.destroy();video.removeAttribute('src');video.load();};},[src]);return <video ref={ref} controls playsInline preload="none" aria-label={title} style={{width:'100%',aspectRatio:'16/9',background:'#000',borderRadius:8}}/>;}
const CHANNELS = [
  {id:'ebc57',name:'57 東森財經新聞',kind:'youtube',channel:'UCuzqko_GKcj9922M1gUo__w',url:'https://www.youtube.com/@57ETFN/live',note:'官方財經新聞直播'},
  {id:'sbn',name:'SBN 全球財經台',kind:'youtube',channel:'UCtNL3hNIPMvwYufr1VKLi1Q',url:'https://www.youtube.com/@SBN1688/live',note:'官方財經直播'},
  {id:'ustv-biz',name:'非凡商業台',kind:'youtube',channel:'UCLHsQL4YChylDX-06BCuNQA',url:'https://www.youtube.com/@ustvbiz/live',note:'官方財經節目與直播'},
  {id:'global-money',name:'寰宇財經新聞',kind:'youtube',channel:'UCSZwcE1d1SAGyc1yvQGSOjQ',url:'https://www.youtube.com/@globalmoneytv/live',note:'官方財經頻道；依節目時段直播'},
  {id:'tvbs-finance',name:'TVBS 財經',kind:'youtube',channel:'UCYDaGPmMfSXViITpPYDKIcw',url:'https://www.youtube.com/channel/UCYDaGPmMfSXViITpPYDKIcw/live',note:'官方財經節目頻道'},
  {id:'set-inews',name:'三立財經 iNEWS',kind:'external',url:'https://d3uri6atc3b03q.cloudfront.net/live/691',note:'官方直播頁'},
  {id:'ustv-news',name:'非凡新聞台',kind:'external',url:'https://news.ustv.com.tw/livevideo',note:'官方新聞直播頁'}
];
CHANNELS.push(...HLS_CHANNELS);

export default function LiveMarketTV(){
 const [active,setActive]=useState('ebc57');
 const channel=CHANNELS.find(x=>x.id===active)||CHANNELS[0];
 const openUrl=channel.url;
 return <section style={{background:'#111a2b',border:'1px solid #293951',borderRadius:12,padding:14,color:'#e8eef8'}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:10}}>
   <div><b style={{fontSize:16}}>📺 台灣財經直播中心</b><small style={{display:'block',color:'#91a1b8',marginTop:4}}>官方頻道入口｜免 YouTube API Key｜HLS.js 有聲播放器</small></div>
   <a href={openUrl} target="_blank" rel="noreferrer" style={{background:'#2563eb',color:'#fff',borderRadius:7,padding:'8px 11px',textDecoration:'none',fontSize:12}}>開啟官方直播 ↗</a>
  </div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:7,marginBottom:10}}>
   {CHANNELS.map(item=><button key={item.id} onClick={()=>setActive(item.id)} style={{textAlign:'left',background:active===item.id?'#1d426b':'#172338',color:'#e8eef8',border:'1px solid '+(active===item.id?'#60a5fa':'#293951'),borderRadius:8,padding:9,cursor:'pointer'}}>
    <b style={{fontSize:12}}>{item.name}</b><small style={{display:'block',color:'#91a1b8',fontSize:10,marginTop:4}}>{item.kind==='youtube'?'YouTube 即時直播':item.kind==='hls'?'HLS 有聲播放':'官方直播外連'}</small>
   </button>)}
  </div>
  {channel.kind==='hls'?<HlsLivePlayer key={channel.id} src={channel.src} title={channel.name}/>:channel.kind==='youtube'?
   <iframe key={channel.id} title={channel.name+' 官方直播'} src={'https://www.youtube.com/embed/live_stream?channel='+encodeURIComponent(channel.channel)+'&autoplay=0&playsinline=1&rel=0'} referrerPolicy="strict-origin-when-cross-origin" style={{width:'100%',aspectRatio:'16/9',border:0,background:'#000',borderRadius:8}} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/>:
   <div style={{background:'#080d18',borderRadius:8,padding:20,textAlign:'center',minHeight:150,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',gap:10}}>
    <div style={{fontSize:15,fontWeight:700}}>{channel.name}</div>
    <div style={{fontSize:12,color:'#cbd5e1',lineHeight:1.7}}>此頻道提供官方直播頁，來源不開放穩定的第三方嵌入，請從官方頁播放。</div>
    <a href={openUrl} target="_blank" rel="noreferrer" style={{display:'inline-block',background:'#2563eb',color:'#fff',borderRadius:8,padding:'10px 16px',textDecoration:'none'}}>直接觀看官方直播（含聲音）↗</a>
   </div>}
  <div style={{fontSize:11,color:'#91a1b8',lineHeight:1.7,marginTop:8}}>{channel.note}。YouTube 頻道嵌入不需 Data API Key；但頻道未開播、影片禁止嵌入或 YouTube 改變播放器規則時，站內可能無法播放，請改用官方直播入口。瀏覽器需由使用者按播放才能發出聲音。系統不擷取或轉播未授權影音。</div>
 </section>;
}

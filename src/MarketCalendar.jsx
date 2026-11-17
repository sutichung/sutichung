import React,{useMemo} from 'react';

const EVENTS=[
{date:'2026-01-01',name:'中華民國開國紀念日',type:'休市'},
{date:'2026-02-12',name:'春節前結算交割日',type:'無交易・僅結算交割'},
{date:'2026-02-13',name:'春節前結算交割日',type:'無交易・僅結算交割'},
{date:'2026-02-16',name:'農曆春節',type:'休市'},
{date:'2026-02-17',name:'農曆春節',type:'休市'},
{date:'2026-02-18',name:'農曆春節',type:'休市'},
{date:'2026-02-19',name:'農曆春節',type:'休市'},
{date:'2026-02-20',name:'農曆春節補假',type:'休市'},
{date:'2026-02-27',name:'和平紀念日補假',type:'休市'},
{date:'2026-04-03',name:'兒童節補假',type:'休市'},
{date:'2026-04-06',name:'民族掃墓節補假',type:'休市'},
{date:'2026-05-01',name:'勞動節',type:'休市'},
{date:'2026-06-19',name:'端午節',type:'休市'},
{date:'2026-09-25',name:'中秋節',type:'休市'},
{date:'2026-09-28',name:'教師節',type:'休市'},
{date:'2026-10-09',name:'國慶日補假',type:'休市'},
{date:'2026-10-26',name:'臺灣光復暨金門古寧頭大捷紀念日補假',type:'休市'},
{date:'2026-12-25',name:'行憲紀念日',type:'休市'},
{date:'2027-01-01',name:'中華民國開國紀念日',type:'休市'},
{date:'2027-02-02',name:'春節前結算交割日',type:'無交易・僅結算交割'},
{date:'2027-02-03',name:'春節前結算交割日',type:'無交易・僅結算交割'},
{date:'2027-02-04',name:'農曆春節',type:'休市'},
{date:'2027-02-05',name:'農曆春節',type:'休市'},
{date:'2027-02-08',name:'農曆春節',type:'休市'},
{date:'2027-02-09',name:'農曆春節補假',type:'休市'},
{date:'2027-02-10',name:'農曆春節補假',type:'休市'},
{date:'2027-04-06',name:'兒童節及民族掃墓節補假',type:'休市'},
{date:'2027-04-30',name:'勞動節補假',type:'休市'},
{date:'2027-06-09',name:'端午節',type:'休市'},
{date:'2027-09-15',name:'中秋節',type:'休市'},
{date:'2027-09-28',name:'教師節',type:'休市'},
{date:'2027-10-11',name:'國慶日補假',type:'休市'},
{date:'2027-10-25',name:'臺灣光復暨金門古寧頭大捷紀念日',type:'休市'},
{date:'2027-12-24',name:'行憲紀念日補假',type:'休市'},
{date:'2027-12-31',name:'117年元旦補假',type:'休市'}
];
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export default function MarketCalendar(){
 const now=today();
 const next=useMemo(()=>EVENTS.filter(x=>x.date>=now).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,6),[now]);
 const todayEvent=EVENTS.find(x=>x.date===now);
 const d=new Date(now+'T12:00:00+08:00'),weekend=d.getDay()===0||d.getDay()===6;
 const status=todayEvent?todayEvent.type:weekend?'週末休市':'一般交易日（若有臨時公告以官方公告為準）';
 return <section style={{background:'#111a2b',border:'1px solid #293951',borderRadius:12,padding:14,marginBottom:12,color:'#e8eef8'}}>
 <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',alignItems:'center'}}><b>🗓️ 證交所開休市行事曆</b><a href="https://www.twse.com.tw/zh/trading/holiday.html" target="_blank" rel="noreferrer" style={{color:'#60a5fa',fontSize:11}}>證交所官方公告 ↗</a></div>
 <div style={{marginTop:10,padding:10,background:'#172338',borderRadius:8}}><small style={{color:'#91a1b8'}}>台灣日期 {now}｜今日市場狀態</small><div style={{fontSize:17,fontWeight:800,marginTop:4,color:todayEvent||weekend?'#fbbf24':'#34d399'}}>{status}</div><small style={{color:'#91a1b8'}}>一般集中市場撮合時間：週一至週五 09:00–13:30；委託時間及特殊交易另依證交所規定。</small></div>
 <div style={{fontSize:12,fontWeight:700,margin:'12px 0 6px'}}>接下來的官方休市／特殊日期</div>
 {next.length?next.map(x=><div key={x.date} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'7px 0',borderTop:'1px solid #293951',fontSize:12}}><span>{x.date}　{x.name}</span><span style={{color:x.type.startsWith('無交易')?'#fbbf24':'#fb7185',textAlign:'right'}}>{x.type}</span></div>):<small style={{color:'#91a1b8'}}>目前行事曆沒有後續已列日期。</small>}
 <small style={{display:'block',color:'#91a1b8',marginTop:8,lineHeight:1.6}}>資料涵蓋 2026–2027 年已公告日期；週末依一般規則休市。臨時停市或交易所後續修正，請以證交所最新公告為準。本行事曆不代表即時行情狀態。</small>
 </section>;
}

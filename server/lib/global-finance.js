'use strict';

const INSTITUTIONS = [
  {code:'TW-CBC',name:'中央銀行',country:'台灣',region:'亞洲',flag:'🇹🇼',category:'中央銀行／官方統計',capabilities:'匯率、利率、金融統計',url:'https://www.cbc.gov.tw',status:'directory_only'},
  {code:'TW-FSC',name:'金融監督管理委員會',country:'台灣',region:'亞洲',flag:'🇹🇼',category:'金融監理機關',capabilities:'銀行監理、開放銀行政策',url:'https://www.fsc.gov.tw',status:'directory_only'},
  {code:'TW-FIRST',name:'第一銀行開放 API',country:'台灣',region:'亞洲',flag:'🇹🇼',category:'商業銀行 API',capabilities:'開發者 API（需申請與核准）',url:'https://openapi.firstbank.com.tw/tw/home.html',status:'contract_required'},
  {code:'TW-SINOPAC',name:'永豐銀行 Open Banking',country:'台灣',region:'亞洲',flag:'🇹🇼',category:'商業銀行 API',capabilities:'開放銀行服務（需依服務申請）',url:'https://bank.sinopac.com/sinopacBT/webevents/developer/openbank.html',status:'contract_required'},
  {code:'EU-ECB',name:'European Central Bank',country:'歐元區',region:'歐洲',flag:'🇪🇺',category:'中央銀行／官方資料 API',capabilities:'匯率、利率、貨幣與金融統計',url:'https://data.ecb.europa.eu',status:'public_data_only'},
  {code:'UK-BOE',name:'Bank of England',country:'英國',region:'歐洲',flag:'🇬🇧',category:'中央銀行／統計資料',capabilities:'政策利率、金融統計',url:'https://www.bankofengland.co.uk/boeapps/database',status:'directory_only'},
  {code:'US-FED',name:'Federal Reserve',country:'美國',region:'北美洲',flag:'🇺🇸',category:'中央銀行／官方資料',capabilities:'利率、金融與總體經濟統計',url:'https://www.federalreserve.gov/data.htm',status:'directory_only'},
  {code:'US-FRED',name:'FRED Economic Data',country:'美國',region:'北美洲',flag:'🇺🇸',category:'官方授權經濟資料庫',capabilities:'經濟時間序列（API 需申請 key）',url:'https://fred.stlouisfed.org',status:'contract_required'},
  {code:'CA-BOC',name:'Bank of Canada',country:'加拿大',region:'北美洲',flag:'🇨🇦',category:'中央銀行／資料 API',capabilities:'公開每日匯率與金融統計（Valet API）',url:'https://www.bankofcanada.ca/valet/docs',status:'public_data_only'},
  {code:'BR-BCB',name:'Banco Central do Brasil',country:'巴西',region:'南美洲',flag:'🇧🇷',category:'中央銀行／官方資料',capabilities:'匯率、利率、金融統計',url:'https://www.bcb.gov.br/en',status:'directory_only'},
  {code:'AE-CBUAE',name:'Central Bank of the UAE',country:'阿聯酋',region:'中東',flag:'🇦🇪',category:'中央銀行／官方資料',capabilities:'銀行監理、貨幣與金融統計',url:'https://www.centralbank.ae',status:'directory_only'},
  {code:'IN-RBI',name:'Reserve Bank of India',country:'印度',region:'亞洲',flag:'🇮🇳',category:'中央銀行／官方資料',capabilities:'匯率、利率、銀行統計',url:'https://www.rbi.org.in',status:'directory_only'},
  {code:'HK-HKMA',name:'Hong Kong Monetary Authority',country:'香港',region:'亞洲',flag:'🇭🇰',category:'金融管理局／資料 API',capabilities:'銀行統計、匯率、開放 API',url:'https://www.hkma.gov.hk',status:'directory_only'},
  {code:'SG-MAS',name:'Monetary Authority of Singapore',country:'新加坡',region:'亞洲',flag:'🇸🇬',category:'中央銀行／金融監理',capabilities:'金融統計、監理與 API 資料',url:'https://www.mas.gov.sg',status:'directory_only'},
  {code:'JP-BOJ',name:'Bank of Japan',country:'日本',region:'亞洲',flag:'🇯🇵',category:'中央銀行／官方統計',capabilities:'利率、貨幣與金融統計',url:'https://www.stat-search.boj.or.jp',status:'directory_only'},
  {code:'AU-RBA',name:'Reserve Bank of Australia',country:'澳洲',region:'大洋洲',flag:'🇦🇺',category:'中央銀行／官方統計',capabilities:'匯率、利率與金融統計',url:'https://www.rba.gov.au/statistics/',status:'directory_only'},
  {code:'INT-BIS',name:'Bank for International Settlements',country:'國際',region:'歐洲',flag:'🌐',category:'國際金融機構',capabilities:'國際銀行統計、支付與金融研究',url:'https://data.bis.org',status:'directory_only'},
  {code:'INT-WB',name:'World Bank Open Data',country:'國際',region:'全球',flag:'🌐',category:'國際總體經濟資料 API',capabilities:'GDP、通膨、失業率與跨國發展指標',url:'https://data.worldbank.org',status:'public_data_only'}
];

async function loadFx() {
  const currencies = ['USD','GBP','JPY','CHF','AUD','CAD','CNY','HKD','SGD','KRW','TWD'];
  const rows = [];
  const errors = [];
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= currencies.length) return;
      const currency = currencies[i];
      const url = 'https://data-api.ecb.europa.eu/service/data/EXR/D.'+currency+'.EUR.SP00.A?format=csvdata&lastNObservations=1';
      try {
        const response = await fetch(url,{headers:{accept:'text/csv'},signal:AbortSignal.timeout(10000)});
        if (!response.ok) throw new Error('HTTP '+response.status);
        const csv = await response.text();
        const lines = csv.trim().split(/\r?\n/);
        if (lines.length < 2) throw new Error('empty_csv');
        const header = lines[0].split(',');
        const values = lines[lines.length-1].split(',');
        const dateIndex = header.indexOf('TIME_PERIOD');
        const rateIndex = header.indexOf('OBS_VALUE');
        const date = values[dateIndex];
        const rate = Number(values[rateIndex]);
        if (!date || !Number.isFinite(rate) || rate <= 0) throw new Error('invalid_observation');
        rows.push({currency,rate,asOf:date});
      } catch (error) { errors.push({currency,message:String(error.message||error)}); }
    }
  }
  const [,bankOfCanada]=await Promise.all([Promise.all(Array.from({length:4},worker)),loadBankOfCanadaFx()]);
  rows.sort((a,b)=>currencies.indexOf(a.currency)-currencies.indexOf(b.currency));
  return {rates:rows,errors,crossChecks:[bankOfCanada],base:'EUR',source:'European Central Bank Data Portal · EXR daily reference rates',fetchedAt:new Date().toISOString(),asOf:rows.map(x=>x.asOf).sort().at(-1)||null};
}

async function loadBankOfCanadaFx() {
  const url='https://www.bankofcanada.ca/valet/observations/FXCADUSD/json?recent=1';
  try {
    const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const payload=await response.json();
    const observation=(payload?.observations||[]).find(x=>x&&x.FXCADUSD&&x.FXCADUSD.v!==null&&x.FXCADUSD.v!==undefined);
    const rate=Number(observation?.FXCADUSD?.v);
    if(!observation?.d||!Number.isFinite(rate)||rate<=0)throw new Error('no_valid_FXCADUSD_observation');
    return {status:'connected',pair:'CAD/USD',rate,unit:'USD per CAD',asOf:observation.d,series:'FXCADUSD',frequency:'daily_average',indicative:true,source:'Bank of Canada Valet API',url,caveat:'每日平均指示性匯率，非即時報價或收盤價；發布可能有處理延遲。'};
  } catch(error) {
    return {status:'unavailable',pair:'CAD/USD',series:'FXCADUSD',source:'Bank of Canada Valet API',url,error:String(error.message||error),frequency:'daily_average',indicative:true};
  }
}


async function loadMacro() {
  const countries = [
    {code:'USA',name:'美國'},{code:'CHN',name:'中國'},{code:'JPN',name:'日本'},
    {code:'GBR',name:'英國'},{code:'DEU',name:'德國'},{code:'IND',name:'印度'},
    {code:'BRA',name:'巴西'},{code:'CAN',name:'加拿大'},{code:'AUS',name:'澳洲'},
    {code:'KOR',name:'韓國'},{code:'TWN',name:'台灣'}
  ];
  const indicators = [
    {id:'NY.GDP.MKTP.KD.ZG',label:'GDP 年增率',unit:'%'},
    {id:'FP.CPI.TOTL.ZG',label:'消費者物價通膨',unit:'%'},
    {id:'SL.UEM.TOTL.ZS',label:'失業率',unit:'%'}
  ];
  const countryPath = countries.map(x=>x.code).join(';');
  const tasks = indicators.map(async indicator=>{
    const url='https://api.worldbank.org/v2/country/'+countryPath+'/indicator/'+indicator.id+'?format=json&per_page=1000&date=2021:2026';
    const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const payload=await response.json();
    const rows=Array.isArray(payload?.[1])?payload[1]:[];
    if(!rows.length)throw new Error('no_observations');
    return {indicator,rows};
  });
  const settled=await Promise.allSettled(tasks);
  const data=[];
  let failedIndicators=0;
  for(let i=0;i<settled.length;i++){
    const item=settled[i];
    if(item.status!=='fulfilled'){failedIndicators++;continue;}
    const {indicator,rows}=item.value;
    for(const country of countries){
      const observations=rows.filter(x=>x&&String(x.countryiso3code||x.country?.id||'').toUpperCase()===country.code&&x.value!==null&&Number.isFinite(Number(x.value)));
      observations.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
      const latest=observations[0];
      if(!latest)continue;
      data.push({country:country.code,countryName:country.name,indicator:indicator.id,label:indicator.label,unit:indicator.unit,value:Number(latest.value),year:latest.date,source:'World Bank Open Data',sourceUrl:'https://data.worldbank.org/indicator/'+indicator.id});
    }
  }
  const requested=countries.length*indicators.length;
  const failed=requested-data.length;
  return {data,source:'World Bank Open Data API',fetchedAt:new Date().toISOString(),summary:{requested,received:data.length,failed},status:data.length?'connected':'unavailable',note:'總體經濟年度／季度資料，發布存在時間差，非即時市場報價。'};
}

function getRegistry() {
  return {institutions:INSTITUTIONS,jurisdictions:new Set(INSTITUTIONS.map(x=>x.country)).size,publicDataConnectorsImplemented:3,privateAccountConnectors:0,source:'Curated official institution directory',timestamp:new Date().toISOString()};
}

module.exports = {getRegistry,loadFx,loadBankOfCanadaFx,loadMacro};

'use strict';

// Evidence-first intelligence layer. It never upgrades a rumor into a fact.
const TOPICS = [
  {id:'markets',label:'市場與資金',keywords:['stock','market','股市','成交','資金','法人','funding','volume','etf','傊券','債券']},
  {id:'macro',label:'總體經濟與央行',keywords:['inflation','rate','fed','central bank','cpi','gdp','利率','通膨','央行','經濟']},
  {id:'politics',label:'政治與地緣風險',keywords:['election','war','sanction','tariff','policy','制裁','戰爭','選舉','關稅','政策']},
  {id:'sentiment',label:'市場心理',keywords:['fear','greed','sentiment','panic','情緒','恐慌','貪婪','散戶']},
  {id:'crypto',label:'加密資產',keywords:['bitcoin','ethereum','crypto','加密','btc','eth','liquidation','清算']}
];
function classify(item) {
  const hay = [item.title,item.summary,item.source].join(' ').toLowerCase();
  const hits = TOPICS.map(t=>({...t,score:t.keywords.reduce((n,k)=>n+(hay.includes(k.toLowerCase())?1:0),0)})).filter(t=>t.score>0).sort((a,b)=>b.score-a.score);
  return hits[0]?.id || 'general';
}
function normalize(items,source,kind) {
  return (Array.isArray(items)?items:[]).filter(x=>x&&typeof x==='object').map(x=>({
    title:String(x.title||x.name||'未命名資料').slice(0,300),
    summary:String(x.summary||x.description||'').slice(0,1200),
    url:String(x.url||x.link||''),
    source:String(x.source||source),
    publishedAt:x.publishedAt||x.date||null,
    topic:classify({...x,source:x.source||source}),
    evidenceType:kind,
    verification:'single_source_unverified'
  }));
}
function buildOverview({marketNews=[],cryptoNews=[],fx=null,firewall=null,registry=null}={}) {
  const news=[...normalize(marketNews,'台灣證券交易所／FinMind','exchange_or_provider'),...normalize(cryptoNews,'加密貨幣新聞來源','media')];
  const seen=new Set();
  const deduped=news.filter(x=>{const k=x.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'').slice(0,100);if(!k||seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))).slice(0,100);
  const topicCounts=Object.fromEntries(TOPICS.map(t=>[t.id,deduped.filter(x=>x.topic===t.id).length]));
  const sources=[
    {id:'tw_market_news',label:'台灣交易所／FinMind 新聞',status:marketNews.length?'connected':'empty',items:marketNews.length,coverage:'台灣市場公告或供應商新聞；非全網'},
    {id:'crypto_media',label:'加密貨幣媒體 RSS',status:cryptoNews.length?'connected':'empty',items:cryptoNews.length,coverage:'加密貨幣媒體；需逐篇查證'},
    {id:'ecb_fx',label:'ECB 外匯參考資料',status:fx?.rates?.length?'connected':'unavailable',items:fx?.rates?.length||0,coverage:'歐洲央行每日參考匯率；非即時報價'},
    {id:'politics_official',label:'各國政府／政治政策原始來源',status:'not_connected',items:0,coverage:'尚未建立跨國官方政策事件接收器'},
    {id:'macro_official',label:'全球總經／央行官方資料',status:'partial',items:0,coverage:'目前只有機構目錄與 ECB 匯率；尚未接入完整總經序列'},
    {id:'social_sentiment',label:'公開社群心理訊號',status:'not_connected',items:0,coverage:'未接社群串流；不以未驗證貼文作交易證據'},
    {id:'orderbook_whale',label:'即時委託簿／鏈上巨鯨',status:'not_connected',items:0,coverage:'不可推斷交易者身份或意圖'}
  ];
  const verifiedCount=0;
  return {
    generatedAt:new Date().toISOString(),
    policy:'Evidence first: separate facts, commentary, inference and unknowns. Single-source items are not verified facts.',
    summary:{items:deduped.length,topics:topicCounts,verifiedItems:verifiedCount,unverifiedItems:deduped.length},
    topics:TOPICS.map(t=>({id:t.id,label:t.label,count:topicCounts[t.id]})),
    items:deduped,
    sources,
    security:firewall||{available:false},
    fx:{base:fx?.base||null,asOf:fx?.asOf||null,rates:(fx?.rates||[]).slice(0,20),source:fx?.source||'unavailable'},
    decisionRules:[
      '至少兩個彼此獨立來源支持，才可升級為交叉佐證；官方原始文件優先。',
      '每則資訊保留來源、發布時間、擷取時間及原文連結。',
      '事實、評論、推論、傳聞分開標示；來源矛盾時顯示衝突，不強行下結論。',
      '多空雙方都要提出證據、反證與失效條件。',
      '預測必須保存時間戳與當時資料，追蹤 1 小時、1 天、5 天、20 天結果。',
      '模型分數不是勝率；需以樣本外回測、交易成本、滑價及最大回撤驗證。',
      '異常掛單只標示可疑行為特徵，不直接指控操縱或違法。'
    ],
    limitations:['目前不是全網爬蟲，也不會繞過登入、付費牆或存取限制。','單一新聞來源不等於交叉驗證；本版不宣稱自動學會真相。','跨來源持續歷史資料庫與預測績效追蹤尚待持久化儲存及排程工作者。']
  };
}
module.exports={buildOverview};

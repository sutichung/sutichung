'use strict';

async function postJson(url, body, headers = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', accept: 'application/json', ...headers }, body: JSON.stringify(body) });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch (_) { throw new Error('AI provider returned invalid JSON (' + response.status + ')'); }
    if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + String(data.error && data.error.message || data.message || 'provider request failed').slice(0, 180));
    return data;
  } finally { clearTimeout(timer); }
}

function parseAgentJson(raw) {
  const text = String(raw || '').trim().replace(/^\x60\x60\x60(?:json)?/i, '').replace(/\x60\x60\x60$/, '').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 回覆不是有效 JSON');
  return JSON.parse(text.slice(start, end + 1));
}

async function runAgent(provider, prompt, env) {
  const configs = {
    gemini: { key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || 'gemini-3.8-flash' },
    grok: { key: env.XAI_API_KEY, model: env.XAI_MODEL || 'grok-4.7' },
    deepseek: { key: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL || 'deepseek-flash' }
  };
  const config = configs[provider];
  if (!config.key) return { provider, status: 'not_configured', message: '尚未設定 ' + provider.toUpperCase() + ' API Key' };
  const system = '你是台灣股票市場獨立研究分析員。只能根據提供的行情、K線與籌碼數據判讀；不可捏造新聞、即時報價或未提供的資料。不要輸出隱藏思維鏈，只回傳可公開的結論、可核對依據、看多理由、看空理由、風險與失效條件。若資料不足，direction 必須為「中性」，confidence 降低。score 是方向強度評分，不是勝率或機率。只輸出 JSON，欄位：direction(看多/看空/中性),score(0-100),confidence(0-100),summary,bullReasons(最多4項),bearReasons(最多4項),logic(最多5項),risks(最多3項),invalidation,scenarios。scenarios 必須是 JSON 物件，含 bullish/neutral/bearish 三種劇本；每種包含 trigger(觸發條件)、action(應對)、targetPrice(可由提供資料合理推導才填數字，否則 null)、stopPrice(可合理推導才填數字，否則 null)、risk(主要風險)。不得捏造目標價或停損價，資料不足時填 null 並說明。';
  let raw = '';
  if (provider === 'gemini') {
    const result = await postJson('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(config.model) + ':generateContent', {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 900 }
    }, { 'x-goog-api-key': config.key });
    raw = (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts || []).map(part => part.text || '').join('');
  } else {
    const body = { model: config.model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], temperature: 0.2, max_tokens: 1100, response_format: { type: 'json_object' } };
    if (provider === 'deepseek') body.thinking = { type: 'disabled' };
    const url = provider === 'grok' ? 'https://api.x.ai/v1/chat/completions' : 'https://api.deepseek.com/chat/completions';
    const result = await postJson(url, body, { Authorization: 'Bearer ' + config.key });
    raw = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content || '';
  }
  const parsed = parseAgentJson(raw);
  const score = Number(parsed.score), confidence = Number(parsed.confidence);
  const directions = ['看多', '看空', '中性'];
  const arr = (v, max) => Array.isArray(v) ? v.slice(0, max).map(String) : [];
  return {
    provider, status: 'ok', model: config.model,
    direction: directions.includes(parsed.direction) ? parsed.direction : '中性',
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 50,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, Math.round(confidence))) : 0,
    summary: String(parsed.summary || ''),
    bullReasons: arr(parsed.bullReasons, 4), bearReasons: arr(parsed.bearReasons, 4),
    logic: arr(parsed.logic, 5), risks: arr(parsed.risks, 3),
    invalidation: String(parsed.invalidation || ''), scenarios: Object.fromEntries(['bullish','neutral','bearish'].map(key=>{const value=parsed.scenarios&&parsed.scenarios[key]||{};const number=v=>Number.isFinite(Number(v))&&v!==null&&v!==''?Number(v):null;return [key,{trigger:String(value.trigger||''),action:String(value.action||''),targetPrice:number(value.targetPrice),stopPrice:number(value.stopPrice),risk:String(value.risk||'')}];})), analysisTime: new Date().toISOString()
  };
}

async function buildAiCommittee(symbol, options) {
  const history = await options.getHistory(symbol);
  if (!history || !history.data || !history.data.length) throw new Error((history && history.error) || '沒有歷史K線，暫停 AI 判讀');
  const quotes = options.quotes || {}, scan = options.scan || {}, flows = options.flows || {};
  const quote = quotes[symbol] || {}, technical = scan[symbol] || {}, chip = flows[symbol] || {};
  const last = history.data[history.data.length - 1];
  const facts = {
    symbol, name: technical.name || quote.name || symbol,
    quote: {
      price: quote.price != null ? quote.price : (technical.price != null ? technical.price : last.close),
      changePct: quote.changePct != null ? quote.changePct : (technical.changePct != null ? technical.changePct : null),
      time: quote.timestamp || technical.technicalAsOf || history.asOf || null,
      source: quote.source || (quote.timestamp ? (options.quoteSource || '已取得來源時間戳') : history.source || '歷史日K資料'),
      freshness: quote.delayed ? (quote.quoteType === 'daily-close' ? 'historical-daily-close' : 'delayed-snapshot') : quote.timestamp ? 'timestamped-source-quote' : 'historical-daily-close',
      exchange: quote.market === 'OTC' ? 'TPEx' : technical.exchange || null
    },
    company:{
      sector:technical.sector||null,
      businessDescription:options.fundamentals?.company?.businessDescription||null,
      businessDescriptionNote:options.fundamentals?.company?.businessDescriptionNote||null
    },
    financials:options.fundamentals?.financials?{
      incomeAsOf:options.fundamentals.financials.incomeAsOf||null,
      balanceAsOf:options.fundamentals.financials.balanceAsOf||null,
      cashAsOf:options.fundamentals.financials.cashAsOf||null,
      eps:options.fundamentals.financials.income?.eps??null,
      grossMargin:options.fundamentals.financials.grossMargin??null,
      operatingMargin:options.fundamentals.financials.operatingMargin??null,
      netMargin:options.fundamentals.financials.netMargin??null,
      debtRatio:options.fundamentals.financials.debtRatio??null,
      currentRatio:options.fundamentals.financials.currentRatio??null,
      operatingCashFlow:options.fundamentals.financials.cash?.operatingCashFlow??null,
      cashFlowPeriodBasis:options.fundamentals.financials.cash?.periodBasis||null,
      valuation:options.fundamentals.financials.valuation||null
    }:null,
    dailyKlineAsOf: history.asOf || last.time, historySource: history.source,
    latestCandles: history.data.slice(-30),
    technical: {
      trend:technical.trend|| (history.indicators&&history.indicators.trend)||null,
      rsi:technical.rsi??(history.indicators&&history.indicators.rsi),
      macd:technical.macd??(history.indicators&&history.indicators.macd),
      signal:technical.macdSignal??technical.signal??(history.indicators&&history.indicators.signal),
      macdHistogram:technical.macdHistogram??null,
      sma5:technical.sma5??null,sma20:technical.sma20??null,sma60:technical.sma60??null,
      ema5:technical.ema5??null,ema10:technical.ema10??null,
      ema20:technical.ema20??(history.indicators&&history.indicators.e20),
      ema60:technical.ema60??(history.indicators&&history.indicators.e60),
      bollingerUpper:technical.bollingerUpper??null,bollingerMiddle:technical.bollingerMiddle??null,bollingerLower:technical.bollingerLower??null,
      adx:technical.adx??null,plusDi:technical.plusDi??null,minusDi:technical.minusDi??null,
      cci:technical.cci??null,mfi:technical.mfi??null,k:technical.k??null,d:technical.d??null,williamsR:technical.williamsR??null,
      atr:technical.atr??null,atrPercent:technical.atrPercent??null,
      obv:technical.obv??null,roc20:technical.roc20??null,vwap20:technical.vwap20??null,
      volumeRatio:technical.volumeRatio??(history.indicators&&history.indicators.volumeRatio),
      support:technical.support??(history.indicators&&history.indicators.support),
      resistance:technical.resistance??(history.indicators&&history.indicators.resistance),
      pe:technical.pe??null,pb:technical.pb??null,dividendYield:technical.dividendYield??null,
      priceVsEma20Pct:technical.priceVsEma20Pct??null,priceVsEma60Pct:technical.priceVsEma60Pct??null,
      priceVsVwap20Pct:technical.priceVsVwap20Pct??null
    },
    chips: {
      foreignNet: chip.foreignNet == null ? null : chip.foreignNet,
      trustNet: chip.trustNet == null ? null : chip.trustNet,
      dealerNet: chip.dealerNet == null ? null : chip.dealerNet,
      marginChange: chip.marginChange == null ? null : chip.marginChange,
      shortChange: chip.shortChange == null ? null : chip.shortChange,
      largeHolderPct: chip.largeHolderPct == null ? null : chip.largeHolderPct,
      retailHolderPct: chip.retailHolderPct == null ? null : chip.retailHolderPct,
      asOf: chip.asOf || null, tdccAsOf: chip.tdccAsOf || null
    }
  };
  const roles = {
    gemini: '技術分析專家，重點研判K線型態、SMA/EMA、MACD、RSI、KD、布林通道、ADX、CCI、MFI、ATR、VWAP、支撐壓力與量價結構。',
    grok: '市場事件與多空情境分析師，重點評估市場環境、波動風險、可能催化因素；未提供新聞時明確說明沒有新聞資料。',
    deepseek: '籌碼與風險報酬分析師，重點研判外資投信自營商、融資融券、集保大戶散戶比例、估值 PER/PBR、波動度與風險界線。'
  };
  const providers = ['gemini', 'grok', 'deepseek'];
  const agents = await Promise.all(providers.map(async provider => {
    const prompt = '股票 ' + facts.symbol + ' ' + facts.name + '。你的專長：' + roles[provider] + '\n請只使用以下資料，資料時間不一致時要指出，禁止推測缺漏值。請給出獨立多空評分與可驗證邏輯。\n資料：' + JSON.stringify(facts);
    try { return await runAgent(provider, prompt, options.env || process.env); }
    catch (error) { return { provider, status: 'error', message: String(error.message || error).slice(0, 220) }; }
  }));
  const ready = agents.filter(agent => agent.status === 'ok');
  const bullish = ready.filter(agent => agent.direction === '看多').length;
  const bearish = ready.filter(agent => agent.direction === '看空').length;
  const neutral = ready.length - bullish - bearish;
  const consensus = ready.length ? {
    available: ready.length, direction: bullish > bearish ? '偏多' : bearish > bullish ? '偏空' : '分歧／中性',
    score: Math.round(ready.reduce((sum, agent) => sum + agent.score, 0) / ready.length),
    bullish, bearish, neutral
  } : null;
  return {
    symbol, agents, consensus, quoteTime: facts.quote.time, quoteSource: facts.quote.source,
    historyAsOf: facts.dailyKlineAsOf, historySource: facts.historySource, analysisTime: new Date().toISOString(),
    notice: '各模型獨立產生的摘要與依據；不顯示隱藏思維鏈。分數不是勝率，非投資建議。'
  };
}

module.exports = { buildAiCommittee };

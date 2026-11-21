'use strict';

const TWSE = 'https://openapi.twse.com.tw/v1';
const TPEX = 'https://www.tpex.org.tw/openapi/v1';

function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.aaData)) return payload.aaData;
  return [];
}
function valueOf(row, patterns) {
  for (const pattern of patterns) {
    const key = Object.keys(row || {}).find(name => pattern.test(String(name)));
    if (key && row[key] !== null && row[key] !== undefined && String(row[key]).trim() !== '') return row[key];
  }
  return null;
}
function numberOf(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim().replace(/,/g, '').replace(/[元股張%\s]/g, '').replace(/[▲△]/g, '').replace(/[▼▽]/g, '-').replace(/−/g, '-');
  if (!raw || raw === '--' || raw === '－' || raw === '-') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
function periodOf(row) {
  const raw = String(valueOf(row, [/^資料年月$/, /^年月$/, /^Date$/i, /^日期$/]) || '').trim();
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 5) return String(Number(digits.slice(0, 3)) + 1911) + '-' + digits.slice(3, 5);
  if (digits.length === 6) return digits.slice(0, 4) + '-' + digits.slice(4, 6);
  const year = String(valueOf(row, [/^年度$/, /^年$/]) || '').trim();
  const quarter = String(valueOf(row, [/^季別$/, /^季度$/]) || '').trim();
  if (/^\d{3}$/.test(year) && /^[1-4]$/.test(quarter)) return String(Number(year) + 1911) + '-Q' + quarter;
  return raw || null;
}
function sectorKey(sector) {
  const s = String(sector || '');
  if (/金控/.test(s)) return 'fh';
  if (/證券|期貨/.test(s)) return 'bd';
  if (/保險/.test(s)) return 'ins';
  if (/銀行|金融/.test(s)) return 'basi';
  return 'ci';
}
async function fetchRows(url) {
  const response = await fetch(url, { headers: { accept: 'application/json', 'User-Agent': 'TaiwanStockHunter/1.0' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('official_fundamentals_http_' + response.status);
  const payload = await response.json();
  const rows = rowsOf(payload);
  if (!rows.length) throw new Error('official_fundamentals_empty_response');
  return rows;
}
function bySymbol(rows, symbol) {
  return (rows || []).filter(row => String(valueOf(row, [/^公司代號$/, /^證券代號$/, /^Code$/i, /^SecuritiesCompanyCode$/i]) || '').trim() === symbol);
}
function latest(rows) {
  return (rows || []).slice().sort((a, b) => String(periodOf(a) || '').localeCompare(String(periodOf(b) || ''))).at(-1) || null;
}
function mapIncome(row) {
  if (!row) return null;
  const pick = patterns => numberOf(valueOf(row, patterns));
  return {
    revenue: pick([/營業收入.*合計/, /^營業收入$/, /^收益$/, /^Revenue$/i]),
    grossProfit: pick([/營業毛利.*淨額/, /^營業毛利$/, /^GrossProfit$/i]),
    operatingIncome: pick([/營業利益.*損失/, /^營業利益$/, /^OperatingIncome$/i]),
    netIncome: pick([/本期淨利.*損益/, /^本期淨利$/, /^IncomeAfterTaxes$/i, /^NetIncome$/i]),
    eps: pick([/基本每股盈餘/, /^EPS$/i, /每股盈餘/]),
    period: periodOf(row), unit: '新臺幣千元（每股盈餘除外）'
  };
}
function mapBalance(row) {
  if (!row) return null;
  const pick = patterns => numberOf(valueOf(row, patterns));
  return {
    totalAssets: pick([/^資產總計$/, /^TotalAssets$/i]),
    totalLiabilities: pick([/^負債總計$/, /^TotalLiabilities$/i]),
    totalEquity: pick([/^權益總計$/, /^TotalEquity$/i]),
    currentAssets: pick([/^流動資產合計$/, /^CurrentAssets$/i]),
    currentLiabilities: pick([/^流動負債合計$/, /^CurrentLiabilities$/i]),
    period: periodOf(row), unit: '新臺幣千元'
  };
}
function mapRevenue(row) {
  if (!row) return null;
  return {
    date: periodOf(row),
    revenue: numberOf(valueOf(row, [/營業收入-當月營收/, /^當月營收$/, /^Revenue$/i])),
    yoy: numberOf(valueOf(row, [/營業收入-去年同月增減/, /去年同月增減/, /^YoY$/i])),
    mom: numberOf(valueOf(row, [/營業收入-上月比較增減/, /上月比較增減/, /^MoM$/i])),
    unit: '新臺幣千元（依官方月營收資料欄位）'
  };
}
function mapDividend(row) {
  return {
    year: valueOf(row, [/股利所屬期間/, /^年度$/, /^年$/]) || periodOf(row),
    CashEarningsDistribution: numberOf(valueOf(row, [/現金股利.*元.?股/, /現金股利/ ])),
    StockEarningsDistribution: numberOf(valueOf(row, [/股票股利.*元.?股/, /股票股利/ ])),
    CashExDividendTradingDate: valueOf(row, [/除息交易日/, /除權息交易日/]) || null,
    source: '官方股利分派資料'
  };
}
function mapValuation(row, exchange) {
  if (!row) return null;
  const pe = numberOf(valueOf(row, [/^PEratio$/i, /本益比/, /PriceEarningRatio/i]));
  const pb = numberOf(valueOf(row, [/^PBratio$/i, /股價淨值比/, /PriceBookRatio/i]));
  const dividendYield = numberOf(valueOf(row, [/^DividendYield$/i, /殖利率/, /YieldRatio/i]));
  return { asOf: valueOf(row, [/^Date$/i, /^日期$/]) || null, pe, pb, dividendYield, source: exchange === 'TWSE' ? 'TWSE OpenAPI BWIBBU_ALL' : 'TPEx OpenAPI tpex_mainboard_peratio_analysis' };
}
async function getOfficialFundamentals({ symbol, exchange, sector }) {
  const isTwse = exchange === 'TWSE';
  const base = isTwse ? TWSE : TPEX;
  const suffix = sectorKey(sector);
  const endpoints = isTwse ? {
    revenue: base + '/opendata/t187ap05_L',
    income: base + '/opendata/t187ap06_L_' + suffix,
    balance: base + '/opendata/t187ap07_L_' + suffix,
    valuation: base + '/exchangeReport/BWIBBU_ALL',
    dividends: base + '/opendata/t187ap45_L'
  } : {
    revenue: base + '/mopsfin_t187ap05_O',
    income: base + '/mopsfin_t187ap06_O_' + suffix,
    balance: base + '/mopsfin_t187ap07_O_' + suffix,
    valuation: base + '/tpex_mainboard_peratio_analysis',
    dividends: base + '/mopsfin_t187ap39_O'
  };
  const settled = await Promise.all(Object.entries(endpoints).map(async ([key, url]) => {
    try { return [key, await fetchRows(url), null]; }
    catch (error) { return [key, [], String(error?.message || error).slice(0, 180)]; }
  }));
  const sourceRows = Object.fromEntries(settled.map(([key, rows]) => [key, rows]));
  const errors = Object.fromEntries(settled.filter(([, , error]) => error).map(([key, , error]) => [key, error]));
  const companyRevenue = latest(bySymbol(sourceRows.revenue, symbol));
  const companyIncome = latest(bySymbol(sourceRows.income, symbol));
  const companyBalance = latest(bySymbol(sourceRows.balance, symbol));
  const valuationRows = bySymbol(sourceRows.valuation, symbol);
  const valuation = mapValuation(latest(valuationRows), exchange);
  const revenue = mapRevenue(companyRevenue);
  const income = mapIncome(companyIncome);
  const balance = mapBalance(companyBalance);
  const debtRatio = balance?.totalAssets > 0 && balance.totalLiabilities != null ? balance.totalLiabilities / balance.totalAssets * 100 : null;
  const currentRatio = balance?.currentLiabilities > 0 && balance.currentAssets != null ? balance.currentAssets / balance.currentLiabilities : null;
  const grossMargin = income?.revenue > 0 && income.grossProfit != null ? income.grossProfit / income.revenue * 100 : null;
  const operatingMargin = income?.revenue > 0 && income.operatingIncome != null ? income.operatingIncome / income.revenue * 100 : null;
  const netMargin = income?.revenue > 0 && income.netIncome != null ? income.netIncome / income.revenue * 100 : null;
  const dividendHistory = bySymbol(sourceRows.dividends, symbol).slice(-12).reverse().map(mapDividend);
  const health = [
    ['EPS', income?.eps, v => v > 0 ? 1 : -1],
    ['毛利率', grossMargin, v => v >= 30 ? 1 : v < 10 ? -1 : 0],
    ['營業利益率', operatingMargin, v => v >= 10 ? 1 : v < 0 ? -1 : 0],
    ['稅後淨利率', netMargin, v => v >= 5 ? 1 : v < 0 ? -1 : 0],
    ['負債比', debtRatio, v => v <= 40 ? 1 : v >= 70 ? -1 : 0],
    ['流動比率', currentRatio, v => v >= 1.5 ? 1 : v < 1 ? -1 : 0],
    ['月營收年增率', revenue?.yoy, v => v > 5 ? 1 : v < -5 ? -1 : 0]
  ];
  const available = health.filter(([, value]) => value != null && Number.isFinite(Number(value)));
  const healthScore = available.length ? Math.round(50 + available.reduce((sum, item) => sum + item[2](Number(item[1])), 0) / available.length * 50) : null;
  const isFinancialIndustry = /金融|保險/.test(String(sector || ''));
  const applicable = isFinancialIndustry ? available.filter(x => ['EPS', '稅後淨利率', '月營收年增率'].includes(x[0])) : available;
  const score = applicable.length ? Math.round(50 + applicable.reduce((sum, item) => sum + item[2](Number(item[1])), 0) / applicable.length * 50) : null;
  return {
    financials: {
      incomeAsOf: income?.period || null, balanceAsOf: balance?.period || null, cashAsOf: null,
      income, balance, cash: null, debtRatio, currentRatio, grossMargin, operatingMargin, netMargin,
      financialHealth: { score: applicable.length >= Math.min(4, isFinancialIndustry ? 3 : 7) ? score : null, coverage: applicable.length, total: isFinancialIndustry ? 3 : 7, status: applicable.length < Math.min(4, isFinancialIndustry ? 3 : 7) ? '資料不足' : score >= 65 ? '偏強' : score <= 35 ? '偏弱' : '中性', note: '只採用官方可取得欄位；未提供的現金流量表不補值。' },
      valuation, monthlyRevenue: revenue ? [revenue] : [], dividends: dividendHistory
    },
    datasetErrors: errors,
    source: (isTwse ? 'TWSE OpenAPI / MOPS' : 'TPEx OpenAPI / MOPS') + ' 官方月營收、財報、估值與股利資料',
    timestamp: new Date().toISOString(),
    periodType: '財報為最新已公開季資料；月營收為官方最新申報月份；不是完整歷史序列',
    completeness: { income: !!income, balance: !!balance, revenue: !!revenue, valuation: !!valuation, dividends: dividendHistory.length > 0, cashFlow: false }
  };
}

module.exports = { getOfficialFundamentals, numberOf, periodOf, sectorKey };

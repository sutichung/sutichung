'use strict';

// In-process, bounded micro-batch ant colony. Research-only: never places orders.
// Work is intentionally small and yields to the event loop between batches.
const ROLES = ['scout', 'technical', 'bull', 'bear', 'risk', 'auditor'];
const MAX_QUEUE = 5000;
const MAX_RECENT = 80;
const state = {
  queue: [], running: 0, workers: 6, sequence: 0, cycle: 0,
  enqueued: 0, completed: 0, failed: 0, retried: 0,
  byMarket: {}, recent: [], active: new Map(), lastDispatchAt: null,
  lastCompletedAt: null, lastError: null, seen: new Map()
};
const now = () => new Date().toISOString();
const num = v => v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
function marketState(market) {
  return state.byMarket[market] || (state.byMarket[market] = {enqueued:0,completed:0,failed:0,queued:0});
}
function summarize(role, row) {
  const score = row.scorecard || row.technical || {};
  const ind = row.indicators || score.indicators || row;
  const rsi = num(ind.rsi ?? ind.rsi14);
  const macd = num(ind.macdHistogram ?? ind.macd);
  const atrPct = num(ind.atrPercent ?? (num(ind.atr) !== null && num(row.price ?? row.close) ? ind.atr / (row.price ?? row.close) * 100 : null));
  const volumeRatio = num(ind.volumeRatio ?? ind.volumeRatio20);
  const direction = String(score.direction || score.label || '');
  const reasons = [];
  if (role === 'scout') {
    const asOf = row.asOf || row.timestamp || row.technicalAsOf || score.asOf || null;
    const ageMs = asOf && Number.isFinite(Date.parse(asOf)) ? Math.max(0, Date.now()-Date.parse(asOf)) : null;
    return {status: ageMs === null ? 'unknown' : ageMs > 24*60*60*1000 ? 'stale' : 'fresh', asOf, ageMs};
  }
  if (role === 'technical') {
    if (rsi !== null) reasons.push(rsi >= 50 && rsi <= 70 ? 'RSI 位於偏多區間' : rsi > 70 ? 'RSI 偏熱' : 'RSI 未達偏多區間');
    if (macd !== null) reasons.push(macd > 0 ? 'MACD 動能為正' : 'MACD 動能為負');
    if (volumeRatio !== null) reasons.push(volumeRatio >= 1 ? '量能不低於均量' : '量能低於均量');
  } else if (role === 'bull') {
    if (direction.includes('買') || direction.includes('多')) reasons.push('現有評分偏多');
    if (rsi !== null && rsi >= 50 && rsi <= 70) reasons.push('RSI 支持偏多觀察');
    if (macd !== null && macd > 0) reasons.push('動能支持偏多觀察');
  } else if (role === 'bear') {
    if (direction.includes('賣') || direction.includes('空')) reasons.push('現有評分偏空');
    if (rsi !== null && rsi >= 70) reasons.push('RSI 過熱風險');
    if (macd !== null && macd < 0) reasons.push('動能偏弱');
  } else if (role === 'risk') {
    if (atrPct !== null && atrPct > 5) reasons.push('波動幅度偏高');
    if (rsi !== null && (rsi > 80 || rsi < 20)) reasons.push('RSI 極端區間');
    if (row.quoteDelayed || row.delayed) reasons.push('行情可能延遲或過期');
    if (!reasons.length) reasons.push('目前未觸發已知風險規則；不代表無風險');
  } else if (role === 'auditor') {
    if (score.status !== 'research-ready' || score.fresh === false) reasons.push('評分未達可研究狀態');
    if (!row.source && !score.source) reasons.push('資料來源欄位缺失');
    if (!row.asOf && !row.timestamp && !row.technicalAsOf && !score.asOf) reasons.push('資料時間戳缺失');
    if (!reasons.length) reasons.push('基本欄位檢查通過，仍需人工／策略驗證');
  }
  return {status: reasons.length ? 'reviewed' : 'insufficient', reasons};
}
function pump() {
  while (state.running < state.workers && state.queue.length) {
    const task = state.queue.shift();
    state.running++;
    state.active.set(task.id, {id:task.id, market:task.market, symbol:task.symbol, role:task.role, startedAt:now()});
    setImmediate(() => {
      try {
        const result = summarize(task.role, task.row);
        state.completed++;
        marketState(task.market).completed++;
        state.lastCompletedAt = now();
        state.recent.unshift({id:task.id,market:task.market,symbol:task.symbol,role:task.role,status:result.status,finishedAt:now(),result});
        state.recent = state.recent.slice(0,MAX_RECENT);
      } catch (error) {
        if (task.attempt < 1 && state.queue.length < MAX_QUEUE) {
          task.attempt++; state.queue.push(task); state.retried++;
        } else {
          state.failed++; marketState(task.market).failed++;
          state.lastError = String(error.message || error).slice(0,180);
          state.recent.unshift({id:task.id,market:task.market,symbol:task.symbol,role:task.role,status:'failed',finishedAt:now(),error:state.lastError});
          state.recent = state.recent.slice(0,MAX_RECENT);
        }
      } finally {
        state.active.delete(task.id); state.running--;
        if (!state.running && !state.queue.length) state.lastCompletedAt = now();
        setImmediate(pump);
      }
    });
  }
}
function enqueue(market, rows, sourceTimestamp = null) {
  if (!Array.isArray(rows) || !rows.length) return {accepted:0,duplicate:true};
  const marketName = String(market || 'UNKNOWN').slice(0,16);
  const stamp = String(sourceTimestamp || rows[0]?.asOf || rows[0]?.timestamp || 'unknown');
  const key = marketName + ':' + stamp;
  if (state.seen.has(key)) return {accepted:0,duplicate:true};
  state.seen.set(key, Date.now());
  if (state.seen.size > 100) {
    for (const [k,t] of state.seen) if (Date.now()-t > 24*60*60*1000) state.seen.delete(k);
    while (state.seen.size > 100) state.seen.delete(state.seen.keys().next().value);
  }
  const m = marketState(marketName);
  const bounded = rows.slice(0, Math.max(0, Math.min(rows.length, 1000)));
  let accepted = 0;
  state.cycle++; state.lastDispatchAt = now();
  for (const row of bounded) {
    const symbol = String(row.symbol || row.ticker || row.id || 'UNKNOWN').slice(0,32);
    for (const role of ROLES) {
      if (state.queue.length + state.running >= MAX_QUEUE) break;
      const id = 'ant-' + (++state.sequence);
      state.queue.push({id,market:marketName,symbol,role,row,attempt:0,createdAt:now()});
      state.enqueued++; m.enqueued++; accepted++;
    }
  }
  m.queued = state.queue.filter(x=>x.market===marketName).length;
  pump();
  return {accepted, symbols:bounded.length, roles:ROLES.length, duplicate:false};
}
function getStatus() {
  const byMarket = {};
  for (const [market, counts] of Object.entries(state.byMarket)) {
    byMarket[market] = {...counts, queued:state.queue.filter(x=>x.market===market).length, running:[...state.active.values()].filter(x=>x.market===market).length};
  }
  return {
    mode:'in-process-micro-batch', researchOnly:true, workers:state.workers,
    activeWorkers:state.running, queued:state.queue.length,
    enqueued:state.enqueued, completed:state.completed, failed:state.failed,
    retried:state.retried, completionPct:state.enqueued ? Math.round(state.completed/state.enqueued*1000)/10 : 0,
    cycle:state.cycle, lastDispatchAt:state.lastDispatchAt, lastCompletedAt:state.lastCompletedAt,
    lastError:state.lastError, byMarket,
    active:[...state.active.values()], recent:state.recent.slice(0,30),
    persistence:'memory-only; queue and counters reset when service restarts'
  };
}
module.exports = {enqueue, getStatus};

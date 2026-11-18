'use strict';
import React, { useEffect, useState } from 'react';
const fmt = (v, d = 3) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-US', { maximumFractionDigits: d }) : '—';
export default function CryptoMicrostructure({ symbol, type, exchange, nativeSymbol }) {
 const [data, setData] = useState(null);
 useEffect(() => {
  let active = true;
  const load = async () => {
   try {
    const token = localStorage.getItem('ts_access_token') || '';
    const url = '/api/crypto/microstructure/' + encodeURIComponent(nativeSymbol || symbol) + '?type=' + encodeURIComponent(type) + '&exchange=' + encodeURIComponent(exchange) + '&depth=10&whaleUsd=50000';
    const response = await fetch(url, { headers: { Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'microstructure_unavailable');
    if (active) setData(result);
   } catch (error) { if (active) setData({ error: error.message }); }
  };
  setData(null); load();
  const timer = setInterval(load, 15000);
  return () => { active = false; clearInterval(timer); };
 }, [symbol, type, exchange, nativeSymbol]);
 const book = data?.book, tape = data?.tape;
 const panel = { background: '#111a2b', border: '1px solid #293951', borderRadius: 12, padding: 13, color: '#e8eef8', minWidth: 0 };
 const stat = { background: '#172338', borderRadius: 8, padding: 9, minWidth: 0 };
 return <section style={panel}>
  <b>📚 盤口微結構與鯨魚逐筆成交</b>
  {book ? <>
   <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginTop: 10 }}>
    <div style={stat}><small>買一／賣一</small><div>{fmt(book.bestBid, 8)} / {fmt(book.bestAsk, 8)}</div></div>
    <div style={stat}><small>價差</small><div>{fmt(book.spreadPct, 4)}%</div></div>
    <div style={stat}><small>OBI 盤口失衡</small><div style={{ color: book.obi > 0 ? '#34d399' : book.obi < 0 ? '#fb7185' : '#fbbf24' }}>{fmt(book.obi)}</div></div>
    <div style={stat}><small>前十檔買量／賣量</small><div>{fmt(book.bidDepth)} / {fmt(book.askDepth)}</div></div>
    <div style={stat}><small>大額成交筆數</small><div>{tape?.whaleClassificationAvailable ? fmt(tape.largeTradeCount, 0) : '未提供'}</div></div>
    <div style={stat}><small>主動買入／賣出額</small><div>{'$'}{fmt(tape?.buyQuoteValue, 0)} / {'$'}{fmt(tape?.sellQuoteValue, 0)}</div></div>
   </div>
   <b style={{ display: 'block', marginTop: 12 }}>{tape?.whaleClassificationAvailable ? '大額成交（單筆至少 50,000 ' + tape.quoteCurrency + '）' : '大額成交分類暫不可用'}</b>
   {tape?.whaleClassificationAvailable ? (tape.largeTrades || []).slice(0, 6).map((trade, index) => <div key={trade.id || index} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderBottom: '1px solid #293951', fontSize: 12 }}>
    <b style={{ color: trade.side === 'buy' ? '#34d399' : '#fb7185' }}>{trade.side === 'buy' ? '主動買入' : '主動賣出'}</b>
    <span>{fmt(trade.price, 8)} × {fmt(trade.amount, 5)}</span><b>{fmt(trade.quoteValue, 0)} {tape.quoteCurrency}</b>
   </div>) : <small style={{ display: 'block', color: '#fbbf24', marginTop: 6 }}>報價幣別或合約數量單位無法可靠換算美元，不顯示巨額判定。</small>}
   <small style={{ display: 'block', color: '#91a1b8', marginTop: 8 }}>來源：{data.source}｜交易所來源時間：{data.timestamp ? new Date(data.timestamp).toLocaleString('zh-TW') : '未提供'}｜伺服器接收時間：{data.receivedAt ? new Date(data.receivedAt).toLocaleString('zh-TW') : '—'}。公開 REST 快照，每 15 秒輪詢；不是 WebSocket 逐筆串流。OBI 只代表可見掛單深度，可能受撤單及隱藏流動性影響。</small>
  </> : <small style={{ display: 'block', color: '#91a1b8', marginTop: 8 }}>{data?.error || '盤口資料載入中…'}</small>}
 </section>;
}
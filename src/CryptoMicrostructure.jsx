'use strict';
import React, { useEffect, useState } from 'react';

const fmt = (value, digits = 3) =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
    ? Number(value).toLocaleString('en-US', { maximumFractionDigits: digits })
    : '—';

const timeLabel = value => value ? new Date(value).toLocaleString('zh-TW') : '未提供';

export default function CryptoMicrostructure({ symbol, type, exchange, nativeSymbol }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;
    if (!['Binance', 'Bybit', 'OKX'].includes(exchange)) {
      setData({ error: '委託簿與逐筆成交目前支援 Binance、Bybit、OKX；此交易所尚未接入。' });
      return () => { active = false; };
    }
    const load = async () => {
      try {
        const token = localStorage.getItem('ts_access_token') || '';
        const url = '/api/crypto/microstructure/' + encodeURIComponent(nativeSymbol || symbol)
          + '?type=' + encodeURIComponent(type)
          + '&exchange=' + encodeURIComponent(exchange)
          + '&depth=10&whaleUsd=50000';
        const response = await fetch(url, {
          headers: { Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'microstructure_unavailable');
        if (active) setData(result);
      } catch (error) {
        if (active) setData({ error: error.message || 'microstructure_unavailable' });
      }
    };
    setData(null);
    load();
    const timer = setInterval(load, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [symbol, type, exchange, nativeSymbol]);

  const book = data?.book;
  const tape = data?.tape;
  const panel = {
    background: '#111a2b', border: '1px solid #293951', borderRadius: 12,
    padding: 13, color: '#e8eef8', minWidth: 0
  };
  const stat = { background: '#172338', borderRadius: 8, padding: 9, minWidth: 0 };
  const largeTrades = tape?.whaleClassificationAvailable ? (tape.largeTrades || []) : [];

  return (
    <section style={panel}>
      <b>📚 盤口微結構與大額成交</b>
      {book ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginTop: 10 }}>
            <div style={stat}>
              <small>買一／賣一</small>
              <div>{fmt(book.bestBid, 8)} / {fmt(book.bestAsk, 8)}</div>
            </div>
            <div style={stat}>
              <small>買賣價差</small>
              <div>{fmt(book.spreadPct, 4)}%</div>
            </div>
            <div style={stat}>
              <small>OBI／加權 OBI</small>
              <div>{fmt(book.obi)} / {fmt(book.weightedObi)}</div>
            </div>
            <div style={stat}>
              <small>微價格偏移</small>
              <div>{fmt(book.microPriceDeviationBps, 2)} bps</div>
              <small>微價格 {fmt(book.microPrice, 8)}</small>
            </div>
            <div style={stat}>
              <small>可見買量／賣量</small>
              <div>{fmt(book.bidDepth, 5)} / {fmt(book.askDepth, 5)}</div>
              <small>實際深度 {fmt(book.depth, 0)} 檔</small>
            </div>
            <div style={stat}>
              <small>大額成交筆數</small>
              <div>{tape?.whaleClassificationAvailable ? fmt(tape.largeTradeCount, 0) : '未提供'}</div>
              <small>{tape?.whaleClassificationAvailable ? '單筆門檻 50,000 ' + tape.quoteCurrency : '合約面值／報價幣別未能可靠換算'}</small>
            </div>
            <div style={stat}>
              <small>主動買入／賣出額（{tape?.quoteCurrency || '—'}）</small>
              <div>{fmt(tape?.buyQuoteValue, 0)} / {fmt(tape?.sellQuoteValue, 0)}</div>
            </div>
            <div style={stat}>
              <small>主動買入占比</small>
              <div>{tape?.aggressiveBuyPct == null ? '—' : fmt(tape.aggressiveBuyPct, 1) + '%'}</div>
              <small>成交失衡 {fmt(tape?.tradeImbalance, 3)}</small>
            </div>
          </div>

          {(book.depthBands || []).length > 0 && (
            <div style={{ marginTop: 10 }}>
              <b style={{ fontSize: 12 }}>分層深度失衡</b>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 6 }}>
                {book.depthBands.map(band => (
                  <span key={band.levels} style={{ background: '#172338', borderRadius: 7, padding: '6px 8px', fontSize: 11 }}>
                    前 {band.levels} 檔：{fmt(band.imbalance, 3)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <b style={{ display: 'block', marginTop: 12 }}>
            {tape?.whaleClassificationAvailable ? '大額成交明細（' + tape.quoteCurrency + '）' : '大額成交分類暫不可用'}
          </b>
          {tape?.whaleClassificationAvailable ? (
            largeTrades.length ? largeTrades.slice(0, 6).map((trade, index) => (
              <div key={trade.id || index} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderBottom: '1px solid #293951', fontSize: 12 }}>
                <b style={{ color: trade.side === 'buy' ? '#34d399' : '#fb7185' }}>
                  {trade.side === 'buy' ? '主動買入' : trade.side === 'sell' ? '主動賣出' : '方向未知'}
                </b>
                <span>{fmt(trade.price, 8)} × {fmt(trade.amount, 5)}</span>
                <b>{fmt(trade.quoteValue, 0)} {tape.quoteCurrency}</b>
              </div>
            )) : <small style={{ display: 'block', color: '#91a1b8', marginTop: 6 }}>目前樣本內沒有達到門檻的大額成交。</small>
          ) : (
            <small style={{ display: 'block', color: '#fbbf24', marginTop: 6 }}>
              不以未確認的合約面值或非美元報價幣別推算巨額成交。
            </small>
          )}

          <small style={{ display: 'block', color: '#91a1b8', marginTop: 8 }}>
            來源：{data.source}｜交易所來源時間：{timeLabel(data.timestamp)}｜伺服器接收時間：{timeLabel(data.receivedAt)}。
            公開 REST 快照約每 15 秒輪詢，不是 WebSocket 逐筆串流；OBI 只代表可見掛單，不證明市場操縱。
          </small>
        </>
      ) : (
        <small style={{ display: 'block', color: data?.error ? '#fbbf24' : '#91a1b8', marginTop: 8 }}>
          {data?.error || '盤口資料載入中…'}
        </small>
      )}
    </section>
  );
}

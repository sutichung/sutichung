'use strict';

// Effective-dated TWSE trading rules. Keep historical rules immutable so
// backtests can select the rules that were actually in force on each date.
const SOURCES = {
  phaseOne: 'https://twse-regulation.twse.com.tw/TW/int/DAT01.aspx?FLCODE=FE399225',
  phaseTwo: 'https://twse-regulation.twse.com.tw/TW/int/DAT01.aspx?FLCODE=FE401877',
  announcement: 'https://www.twse.com.tw/staticFiles/news/news/tsecnews/8a8216d6a19afd9c01a1edd070c8053b.pdf'
};

function validDate(value) {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function getTwseTradingRules(date) {
  if (!validDate(date)) throw new TypeError('date must be a valid YYYY-MM-DD date');
  const phaseOne = date >= '2026-12-07';
  const phaseTwo = date >= '2027-07-05';
  return {
    market: 'TWSE',
    date,
    effectivePhase: phaseTwo ? 2 : phaseOne ? 1 : 0,
    regularSession: { orderStart: '08:30', continuousTradingStart: '09:00', close: '13:30' },
    oddLot: phaseOne
      ? {
          orderStart: '08:30',
          firstMatch: '09:00',
          matchingIntervalSeconds: phaseTwo ? 1 : 5,
          preOpenIndicativeIntervalSeconds: 5,
          delayedOpenMechanism: true
        }
      : {
          orderStart: '09:00',
          firstMatch: '09:10',
          matchingIntervalSeconds: 5,
          preOpenIndicativeIntervalSeconds: null,
          delayedOpenMechanism: false
        },
    highPriceTick: {
      thresholdNtd: 1000,
      tickNtd: phaseTwo ? 1 : 5,
      effectiveFrom: '2027-07-05'
    },
    effectiveDates: {
      phaseOne: '2026-12-07',
      phaseTwo: '2027-07-05'
    },
    sources: [SOURCES.phaseOne, SOURCES.phaseTwo, SOURCES.announcement],
    ruleStatus: 'official-announced'
  };
}

module.exports = { getTwseTradingRules, validDate, SOURCES };

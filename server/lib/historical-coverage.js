'use strict';

// Historical coverage policy. A configured provider is not considered licensed or
// operational until a separate authenticated coverage probe confirms it.
const DAILY_HISTORY_START='1990-01-01';
const MARKETS={
  TWSE:{market:'TWSE',targetFrom:DAILY_HISTORY_START,knownArchiveFrom:'1990-01-01',providerEnv:'TWSE_HISTORICAL_PROVIDER_URL',licenseEnv:'TWSE_HISTORICAL_LICENSE_CONFIRMED',frequency:'1d',note:'STOCK90 historical databank is documented from 1990; adapter and data-use rights must be verified.'},
  TPEX:{market:'TPEx',targetFrom:DAILY_HISTORY_START,knownArchiveFrom:'1994-01-05',providerEnv:'TPEX_HISTORICAL_PROVIDER_URL',licenseEnv:'TPEX_HISTORICAL_LICENSE_CONFIRMED',frequency:'1d',note:'Available archive evidence begins in 1994; do not invent 1990-1993 rows.'},
  US:{market:'US equities',targetFrom:DAILY_HISTORY_START,knownArchiveFrom:null,providerEnv:'US_HISTORICAL_PROVIDER_URL',licenseEnv:'US_HISTORICAL_LICENSE_CONFIRMED',frequency:'1d',note:'1990 EOD coverage requires a licensed provider and per-symbol coverage verification.'},
  CRYPTO:{market:'Crypto',targetFrom:'per_listing_start',knownArchiveFrom:null,providerEnv:'CRYPTO_HISTORICAL_PROVIDER_URL',licenseEnv:'CRYPTO_HISTORICAL_LICENSE_CONFIRMED',frequency:'1d',note:'History begins at the earliest verifiable trading/listing date for each exchange and instrument.'},
  OTHER:{market:'Other instruments',targetFrom:'per_instrument_start',knownArchiveFrom:null,providerEnv:'OTHER_HISTORICAL_PROVIDER_URL',licenseEnv:'OTHER_HISTORICAL_LICENSE_CONFIRMED',frequency:'1d',note:'History begins at the first verified trading date for the instrument.'}
};
function getHistoricalCoverage(env=process.env){
  return Object.values(MARKETS).map(x=>{
    const providerConfigured=!!String(env[x.providerEnv]||'').trim();
    const licenseConfirmed=String(env[x.licenseEnv]||'').toLowerCase()==='true';
    return {...x,providerConfigured,licenseConfirmed,coverageVerified:false,status:providerConfigured&&licenseConfirmed?'verification_required':'not_ready',message:providerConfigured&&licenseConfirmed?'Provider configured; run authenticated per-symbol coverage and data-quality probes before enabling historical signals.':'1990/back-to-listing history is not yet enabled; no synthetic backfill is permitted.'};
  });
}
function validateHistoryRange({from='1990-01-01',to=new Date().toISOString().slice(0,10)}={}){
  const valid=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x))&&Number.isFinite(Date.parse(String(x)+'T00:00:00Z'));
  if(!valid(from)||!valid(to)||from>to)throw new Error('invalid_history_range');
  return {from,to};
}
module.exports={DAILY_HISTORY_START,MARKETS,getHistoricalCoverage,validateHistoryRange};

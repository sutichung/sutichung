'use strict';
const { isMarketDataLicensed } = require('./market-data-license');

const SUPPORTED_EXCHANGES=['Binance','Bybit','OKX','Kraken Futures'];
const HISTORY_EXCHANGES=['Binance','Bybit','OKX','Coinbase','Kraken','Kraken Futures'];
function okxLicensed(){return isMarketDataLicensed('OKX');}
function candidates(primary,preferred,marketType='perpetual'){
  const microstructureExchanges=['Binance','Bybit','OKX',...(marketType==='perpetual'?['Kraken Futures']:[])].filter(provider=>isMarketDataLicensed(provider));
  return [...new Set([preferred,primary,...microstructureExchanges].filter(x=>microstructureExchanges.includes(x)))];
}
async function loadRiskHistory({getHistory,symbol,marketType,interval='15m',exchange='Binance',nativeSymbol=symbol,limit=240}){
  const errors=[];
  const eligible=(marketType==='perpetual'?SUPPORTED_EXCHANGES:HISTORY_EXCHANGES).filter(provider=>isMarketDataLicensed(provider));
  const order=[...new Set([exchange,...eligible])].filter(x=>eligible.includes(x));
  for(const candidate of order){
    try{
      const history=await getHistory(symbol,marketType,interval,candidate,candidate===exchange?nativeSymbol:symbol,limit);
      if(!Array.isArray(history?.data)||history.data.length<22)throw new Error('insufficient_valid_candles');
      return {history,exchange:candidate,requestedExchange:exchange,fallbackUsed:candidate!==exchange,errors};
    }catch(error){errors.push({exchange:candidate,error:String(error?.message||error).slice(0,180)});}
  }
  const error=new Error(eligible.length?'all_supported_exchanges_failed_to_supply_risk_candles':'market_data_license_required');
  error.code=eligible.length?'RISK_CANDLES_UNAVAILABLE':'MARKET_DATA_LICENSE_REQUIRED';
  error.attempts=errors;
  throw error;
}
async function loadFreshMicrostructure({safeLoad,fetchMicrostructure,symbol,marketType,requestedExchange='Binance',preferredExchange=requestedExchange,nativeSymbol=symbol,depth=10,whaleThresholdUsd=50000,now=Date.now}){
  const errors=[];
  for(const exchange of candidates(requestedExchange,preferredExchange,marketType)){
    const exchangeSymbol=exchange===requestedExchange?nativeSymbol:symbol;
    const key='crypto-microstructure:'+exchange+':'+marketType+':'+exchangeSymbol+':'+depth+':'+whaleThresholdUsd;
    const result=await safeLoad(key,3000,()=>fetchMicrostructure({exchange,symbol:exchangeSymbol,marketType,depth,whaleThresholdUsd}),error=>({status:'unavailable',error:String(error?.message||error).slice(0,180)}));
    const received=Date.parse(result?.receivedAt||'');
    const fresh=!!(result&&!result.stale&&Number.isFinite(received)&&now()-received>=0&&now()-received<=30000);
    const bookOk=Array.isArray(result?.book?.bids)&&result.book.bids.length>0&&Array.isArray(result?.book?.asks)&&result.book.asks.length>0;
    const tapeOk=Number(result?.tape?.count)>0&&Number(result?.tape?.knownSideCount)>0;
    if(fresh&&bookOk&&tapeOk)return {data:result,exchange,fallbackUsed:exchange!==requestedExchange,errors};
    errors.push({exchange,error:result?.stale?'stale_snapshot':!fresh?'snapshot_not_fresh':!bookOk?'orderbook_unavailable':'trade_tape_unavailable'});
  }
  return {data:null,exchange:null,fallbackUsed:false,errors};
}
module.exports={loadRiskHistory,loadFreshMicrostructure,candidates,HISTORY_EXCHANGES,okxLicensed};

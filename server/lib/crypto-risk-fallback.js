'use strict';

const SUPPORTED_EXCHANGES=['Binance','Bybit','OKX','Kraken Futures'];
const HISTORY_EXCHANGES=['Binance','Bybit','OKX','Coinbase','Kraken','Kraken Futures'];
function okxLicensed(){return process.env.OKX_MARKET_DATA_LICENSE_CONFIRMED==='true';}
function candidates(primary,preferred,marketType='perpetual'){
  const microstructureExchanges=['Binance','Bybit',...(okxLicensed()?['OKX']:[]),...(marketType==='perpetual'?['Kraken Futures']:[])];
  return [...new Set([preferred,primary,...microstructureExchanges].filter(x=>microstructureExchanges.includes(x)))];
}
async function loadRiskHistory({getHistory,symbol,marketType,interval='15m',exchange='Binance',nativeSymbol=symbol,limit=240}){
  const errors=[];
  const eligible=(marketType==='perpetual'?SUPPORTED_EXCHANGES:HISTORY_EXCHANGES).filter(x=>x!=='OKX'||okxLicensed());
  const order=[...new Set([exchange,...eligible])].filter(x=>eligible.includes(x));
  for(const candidate of order){
    try{
      const history=await getHistory(symbol,marketType,interval,candidate,candidate===exchange?nativeSymbol:symbol,limit);
      if(!Array.isArray(history?.data)||history.data.length<22)throw new Error('insufficient_valid_candles');
      return {history,exchange:candidate,requestedExchange:exchange,fallbackUsed:candidate!==exchange,errors};
    }catch(error){errors.push({exchange:candidate,error:String(error?.message||error).slice(0,180)});}
  }
  const error=new Error('all_supported_exchanges_failed_to_supply_risk_candles');
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

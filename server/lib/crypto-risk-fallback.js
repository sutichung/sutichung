'use strict';

const SUPPORTED_EXCHANGES=['Binance','Bybit','OKX'];
function candidates(primary,preferred){
  return [...new Set([preferred,primary,...SUPPORTED_EXCHANGES].filter(x=>SUPPORTED_EXCHANGES.includes(x)))];
}
async function loadRiskHistory({getHistory,symbol,marketType,interval='1d',exchange='Binance',nativeSymbol=symbol,limit=240}){
  const errors=[];
  const order=candidates(exchange,exchange);
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
  for(const exchange of candidates(requestedExchange,preferredExchange)){
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
module.exports={loadRiskHistory,loadFreshMicrostructure,candidates};

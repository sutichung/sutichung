'use strict';
const SUPPORTED_EXCHANGES=['Binance','Bybit','OKX'];
function safeReason(error){return String(error?.message||error||'upstream_unavailable').replace(/https?:\/\/\S+/g,'[upstream]').slice(0,160);}
async function loadCryptoRiskInputs({symbol,type='spot',interval='1d',exchange='Binance',nativeSymbol='',getHistory,getDerivatives,getMicrostructure}={}){
 if(typeof getHistory!=='function')throw new TypeError('getHistory is required');
 const candidates=[exchange,...SUPPORTED_EXCHANGES.filter(x=>x!==exchange)];
 const historyFailures=[];let history=null,dataExchange=null;
 for(const candidate of candidates){
  try{history=await getHistory(symbol,type,interval,candidate,candidate===exchange?nativeSymbol:'');dataExchange=candidate;break;}
  catch(error){historyFailures.push({exchange:candidate,error:safeReason(error)});}
 }
 if(!history)throw new Error('risk_history_unavailable: '+historyFailures.map(x=>x.exchange+' '+x.error).join(' | '));
 const effectiveNativeSymbol=dataExchange===exchange?nativeSymbol:'';
 const [derivativesResult,microResult]=await Promise.allSettled([
  type==='perpetual'&&typeof getDerivatives==='function'?getDerivatives(symbol,dataExchange,effectiveNativeSymbol):Promise.resolve(null),
  typeof getMicrostructure==='function'?getMicrostructure(dataExchange,effectiveNativeSymbol||symbol):Promise.resolve(null)
 ]);
 return {
  history,derivatives:derivativesResult.status==='fulfilled'?derivativesResult.value:null,
  microstructure:microResult.status==='fulfilled'?microResult.value:null,
  requestedExchange:exchange,dataExchange,exchangeFallback:dataExchange!==exchange,historyFailures,
  derivativesError:derivativesResult.status==='rejected'?safeReason(derivativesResult.reason):null,
  microstructureError:microResult.status==='rejected'?safeReason(microResult.reason):null
 };
}
module.exports={loadCryptoRiskInputs};

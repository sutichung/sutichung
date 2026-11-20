'use strict';
const FEE_BPS=500n,BPS=10000n,ADDRESS_RE=/^0x[a-fA-F0-9]{40}$/,TX_RE=/^0x[a-fA-F0-9]{64}$/;
function nonNegativeInteger(value,field){let n;try{n=BigInt(value);}catch(_){throw new Error('invalid_'+field);}if(n<0n)throw new Error('invalid_'+field);return n;}\nfunction positiveInteger(value,field){const n=nonNegativeInteger(value,field);if(n===0n)throw new Error('invalid_'+field);return n;}
function calculateUsdtSplit(raw){const gross=positiveInteger(raw,'gross_usdt'),fee=gross*FEE_BPS/BPS,net=gross-fee;if(net<=0n)throw new Error('payment_below_minimum');return{grossRaw:gross.toString(),feeRaw:fee.toString(),netRaw:net.toString(),feeBps:Number(FEE_BPS)};}
function validateSaleEvent(e,x){
 if(!e||typeof e!=='object')throw new Error('invalid_event');if(!x||typeof x!=='object')throw new Error('missing_expected_config');
 if(Number(e.chainId)!==Number(x.chainId)||Number(x.chainId)!==97)throw new Error('wrong_chain');
 if(!ADDRESS_RE.test(String(x.saleContract||''))||String(e.address||'').toLowerCase()!==String(x.saleContract).toLowerCase())throw new Error('wrong_sale_contract');
 if(e.eventName!=='AntPurchased')throw new Error('wrong_event');if(!ADDRESS_RE.test(String(e.buyer||'')))throw new Error('invalid_buyer');
 if(!TX_RE.test(String(e.transactionHash||'')))throw new Error('invalid_transaction_hash');
 if(!Number.isSafeInteger(Number(e.logIndex))||Number(e.logIndex)<0)throw new Error('invalid_log_index');
 if(!Number.isSafeInteger(Number(e.blockNumber))||Number(e.blockNumber)<=0)throw new Error('invalid_block_number');
 const s=calculateUsdtSplit(e.grossUsdt),fee=nonNegativeInteger(e.feeUsdt,'fee_usdt'),net=positiveInteger(e.netUsdt,'net_usdt');
 const ant=positiveInteger(e.antOut,'ant_out'),price=positiveInteger(e.priceUsdtPerAnt,'oracle_price');
 if(fee.toString()!==s.feeRaw||net.toString()!==s.netRaw)throw new Error('fee_split_mismatch');
 if(fee+net!==BigInt(s.grossRaw))throw new Error('gross_split_mismatch');
 if(!ADDRESS_RE.test(String(x.usdtContract||''))||!ADDRESS_RE.test(String(x.antContract||'')))throw new Error('invalid_asset_config');
 const tx=String(e.transactionHash).toLowerCase(),log=Number(e.logIndex);
 return{chainId:97,saleContract:String(e.address).toLowerCase(),buyer:String(e.buyer).toLowerCase(),transactionHash:tx,logIndex:log,blockNumber:Number(e.blockNumber),grossUsdtRaw:s.grossRaw,feeUsdtRaw:fee.toString(),netUsdtRaw:net.toString(),antOutRaw:ant.toString(),oraclePriceRaw:price.toString(),idempotencyKey:'97:'+tx+':'+log};
}
function getConfirmationState(head,block,required){const h=Number(head),b=Number(block),r=Number(required);if(![h,b,r].every(Number.isSafeInteger)||b<=0||r<1)throw new Error('invalid_confirmation_parameters');if(h<b)return{status:'observed',confirmations:0};const confirmations=h-b+1;return{status:confirmations>=r?'confirmed':'confirming',confirmations};}
function canTransitionOrder(from,to){const a={created:['submitted','observed','expired','failed'],submitted:['observed','expired','failed','manual_review'],observed:['confirming','confirmed','reorged','failed','manual_review'],confirming:['confirmed','reorged','manual_review'],confirmed:['delivered','reorged','manual_review'],delivered:['reorged','manual_review'],reorged:['observed','manual_review'],expired:['manual_review'],failed:['manual_review'],manual_review:['observed','confirming','confirmed','delivered','failed']};return!!(a[from]&&a[from].includes(to));}
module.exports={FEE_BPS:Number(FEE_BPS),calculateUsdtSplit,validateSaleEvent,getConfirmationState,canTransitionOrder};

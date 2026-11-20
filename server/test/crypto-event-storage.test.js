'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const {createCryptoEventStorage,BUCKET}=require('../lib/crypto-event-storage');

test('private crypto bucket is created and minute event batches are gzip JSONL',async()=>{
 const calls=[];
 const fetchImpl=async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('/bucket/'+BUCKET))return new Response('',{status:404});
  if(url.endsWith('/bucket'))return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
  if(url.includes('/storage/v1/object/'+BUCKET+'/ticks/'))return new Response('{}',{status:200});
  return new Response('{}',{status:200});
 };
 const storage=createCryptoEventStorage({env:{SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-secret'},fetchImpl});
 const result=await storage.saveMinuteBatch({minute:'2026-11-20T06:30:00.000Z',exchange:'Binance',marketType:'spot',symbol:'BTCUSDT',events:[{eventType:'ticker',price:100}]});
 assert.equal(result.stored,true);
 assert.equal(result.count,1);
 const upload=calls.find(x=>x.url.includes('/ticks/'));
 assert.equal(upload.options.headers['content-type'],'application/gzip');
 const decoded=zlib.gunzipSync(Buffer.from(upload.options.body)).toString('utf8');
 assert.match(decoded,/"price":100/);
 assert.ok(calls.some(x=>x.url.endsWith('/bucket')));
});

test('crypto storage fails closed when server credentials are missing',async()=>{
 const storage=createCryptoEventStorage({env:{},fetchImpl:async()=>{throw new Error('should_not_fetch');}});
 assert.equal(storage.configured,false);
 await assert.rejects(storage.saveMinuteBatch({minute:'2026-11-20T06:30:00.000Z',exchange:'Binance',marketType:'spot',symbol:'BTCUSDT',events:[{}]}),/crypto_storage_not_configured/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createResearchStorage,BUCKET}=require('../lib/research-storage');

const response=(status,body={})=>({ok:status>=200&&status<300,status,json:async()=>body});
test('creates a private bucket once and stores an outcome report without exposing credentials',async()=>{
 const calls=[];
 const storage=createResearchStorage({env:{SUPABASE_URL:'https://project.supabase.co/',SUPABASE_SERVICE_ROLE_KEY:'server-only-secret'},fetchImpl:async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('/storage/v1/bucket/'+BUCKET))return response(404);
  if(url.endsWith('/storage/v1/bucket'))return response(200,{});
  if(url.includes('/storage/v1/object/'+BUCKET+'/'))return response(200,{});
  throw new Error('unexpected_url '+url);
 }});
 const saved=await storage.saveReport({horizon:'1d',generatedAt:'2026-11-18T05:40:00.000Z',evaluatedCount:12,directionalHitRatePct:58.3});
 assert.equal(saved.stored,true);
 assert.equal(saved.horizon,'1d');
 assert.ok(saved.name.startsWith('outcomes-2026-11-18-1d-'));
 assert.ok(calls.some(x=>x.options.method==='POST'&&x.url.endsWith('/storage/v1/bucket')));
 assert.ok(calls.some(x=>x.options.method==='POST'&&x.url.includes('/storage/v1/object/'+BUCKET+'/')));
 assert.ok(calls.every(x=>!x.url.includes('server-only-secret')));
});

test('rejects invalid horizons, timestamps and oversized reports before upload',async()=>{
 const storage=createResearchStorage({env:{SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret'},fetchImpl:async()=>{throw new Error('must not fetch');}});
 await assert.rejects(()=>storage.saveReport({horizon:'2d',generatedAt:'2026-11-18T00:00:00Z'}),/Unsupported outcome horizon/);
 await assert.rejects(()=>storage.saveReport({horizon:'1d',generatedAt:'bad-date'}),/timestamp is invalid/);
 await assert.rejects(()=>storage.saveReport({horizon:'1d',generatedAt:'2026-11-18T00:00:00Z',blob:'x'.repeat(270000)}),/exceeds 256 KB/);
});

test('lists and reads only outcome JSON reports from the private bucket',async()=>{
 const report={horizon:'5d',generatedAt:'2026-11-18T05:40:00.000Z',evaluatedCount:20};
 const calls=[];
 const storage=createResearchStorage({env:{SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret'},fetchImpl:async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('/storage/v1/bucket/'+BUCKET))return response(200,{});
  if(url.endsWith('/storage/v1/object/list/'+BUCKET))return response(200,[{name:'outcomes-2026-11-18-5d-test.json',created_at:'2026-11-18T05:41:00Z'},{name:'ignore.txt'}]);
  if(url.includes('/storage/v1/object/authenticated/'+BUCKET+'/'))return response(200,report);
  throw new Error('unexpected_url '+url);
 }});
 const result=await storage.listReports(10);
 assert.equal(result.status,'connected');
 assert.equal(result.count,1);
 assert.equal(result.data[0].horizon,'5d');
 assert.equal(result.data[0].storageName,'outcomes-2026-11-18-5d-test.json');
});

'use strict';

const BUCKET='market-research';
const ALLOWED_HORIZONS=new Set(['1h','1d','5d','20d']);

function storageError(code,message,status){
 const error=new Error(message||code);error.code=code;if(status)error.status=status;return error;
}
function createResearchStorage({env=process.env,fetchImpl=fetch}={}){
 const base=String(env.SUPABASE_URL||'').replace(/\/$/,'');
 const serviceKey=String(env.SUPABASE_SERVICE_ROLE_KEY||'');
 function config(){
  if(!base||!serviceKey)throw storageError('storage_not_configured','Supabase Storage service credentials are not configured');
 }
 function headers(extra={}){
  return {apikey:serviceKey,authorization:'Bearer '+serviceKey,accept:'application/json',...extra};
 }
 async function ensureBucket(){
  config();
  const url=base+'/storage/v1/bucket/'+BUCKET;
  const existing=await fetchImpl(url,{headers:headers(),signal:AbortSignal.timeout(10000)});
  if(existing.ok)return;
  if(existing.status!==404)throw storageError('storage_bucket_check_failed','Supabase Storage bucket check failed',existing.status);
  const created=await fetchImpl(base+'/storage/v1/bucket',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({id:BUCKET,name:BUCKET,public:false,file_size_limit:262144,allowed_mime_types:['application/json']}),signal:AbortSignal.timeout(10000)});
  if(!created.ok&&created.status!==409)throw storageError('storage_bucket_create_failed','Supabase Storage bucket creation failed',created.status);
 }
 function normalizeReport(report){
  if(!report||typeof report!=='object'||Array.isArray(report))throw storageError('invalid_report','Outcome report must be a JSON object');
  if(!ALLOWED_HORIZONS.has(String(report.horizon||'')))throw storageError('invalid_report','Unsupported outcome horizon');
  const generated=Date.parse(report.generatedAt||'');
  if(!Number.isFinite(generated))throw storageError('invalid_report','Outcome report timestamp is invalid');
  const json=JSON.stringify(report);
  if(Buffer.byteLength(json,'utf8')>256*1024)throw storageError('report_too_large','Outcome report exceeds 256 KB');
  const timestamp=new Date(generated).toISOString();
  const stamp=timestamp.replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  return {name:'outcomes-'+timestamp.slice(0,10)+'-'+report.horizon+'-'+stamp+'.json',json,timestamp,horizon:report.horizon};
 }
 async function saveReport(report){
  const item=normalizeReport(report);
  await ensureBucket();
  const response=await fetchImpl(base+'/storage/v1/object/'+BUCKET+'/'+item.name,{method:'POST',headers:headers({'content-type':'application/json','x-upsert':'true'}),body:item.json,signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw storageError('storage_upload_failed','Supabase Storage outcome upload failed',response.status);
  return {stored:true,bucket:BUCKET,name:item.name,horizon:item.horizon,generatedAt:item.timestamp,storedAt:new Date().toISOString()};
 }
 async function listReports(limit=30){
  await ensureBucket();
  const bounded=Math.max(1,Math.min(100,Number(limit)||30));
  const response=await fetchImpl(base+'/storage/v1/object/list/'+BUCKET,{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({prefix:'outcomes-',limit:bounded,offset:0,sortBy:{column:'created_at',order:'desc'}}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw storageError('storage_list_failed','Supabase Storage outcome listing failed',response.status);
  const files=(await response.json()).filter(x=>x&&typeof x.name==='string'&&/^outcomes-.*\.json$/.test(x.name)).slice(0,bounded);
  const settled=await Promise.allSettled(files.map(async file=>{
   const item=await fetchImpl(base+'/storage/v1/object/authenticated/'+BUCKET+'/'+encodeURIComponent(file.name),{headers:headers(),signal:AbortSignal.timeout(15000)});
   if(!item.ok)throw storageError('storage_download_failed','Supabase Storage outcome download failed',item.status);
   return {...await item.json(),storageName:file.name,storageCreatedAt:file.created_at||file.updated_at||null};
  }));
  const data=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
  return {status:'connected',source:'Supabase private Storage',fetchedAt:new Date().toISOString(),count:data.length,failedDownloads:settled.length-data.length,data};
 }
 return {saveReport,listReports};
}

module.exports={createResearchStorage,BUCKET,ALLOWED_HORIZONS};

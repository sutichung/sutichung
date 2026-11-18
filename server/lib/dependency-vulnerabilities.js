'use strict';

const fs=require('node:fs/promises');
const CACHE_MS=30*60*1000;

function packageNameFromLockPath(lockPath){
 const marker='node_modules/',index=lockPath.lastIndexOf(marker);
 if(index<0)return null;
 const parts=lockPath.slice(index+marker.length).split('/');
 return parts[0]?.startsWith('@')?parts.slice(0,2).join('/'):parts[0]||null;
}
function collectLockedPackages(lock,manifest={}){
 const prod=new Set(Object.keys(manifest.dependencies||{})),dev=new Set(Object.keys(manifest.devDependencies||{})),unique=new Map();
 for(const [lockPath,entry] of Object.entries(lock?.packages||{})){
  if(!lockPath||!lockPath.includes('node_modules/')||!entry?.version||entry.link)continue;
  const name=entry.name||packageNameFromLockPath(lockPath);if(!name)continue;
  const key=name+'@'+entry.version,scope=prod.has(name)?'production':dev.has(name)?'development':entry.dev===true?'development':'production';
  const old=unique.get(key);
  unique.set(key,{name,version:String(entry.version),direct:prod.has(name)||dev.has(name),scope:old?.scope==='production'||scope==='production'?'production':'development'});
 }
 return [...unique.values()];
}
function normalizeSeverity(value){
 const severity=String(value||'').toLowerCase();
 if(severity==='critical')return 'critical';
 if(severity==='high')return 'high';
 if(severity==='moderate'||severity==='medium')return 'moderate';
 if(severity==='low')return 'low';
 return 'unknown';
}
function scopeForFinding(name,vulnerability,node,lock,manifest){
 if(Object.hasOwn(manifest.dependencies||{},name))return 'production';
 if(Object.hasOwn(manifest.devDependencies||{},name))return 'development';
 const entry=lock?.packages?.[node];
 if(entry)return entry.dev===true?'development':'production';
 return 'unknown';
}
function buildNpmAuditReport(lock,manifest,audit,generatedAt=new Date().toISOString()){
 const packages=collectLockedPackages(lock,manifest);
 const vulnerabilities=audit?.vulnerabilities;
 const meta=audit?.metadata?.vulnerabilities;
 if(!packages.length)throw new Error('package-lock.json 沒有可掃描的鎖定套件');
 if(!vulnerabilities||!meta||!Number.isFinite(Number(meta.total)))throw new Error(audit?.error?.summary||'npm audit 報告不完整，不能判定安全');
 const findings=[];
 for(const [name,vuln] of Object.entries(vulnerabilities)){
  const nodes=Array.isArray(vuln.nodes)?vuln.nodes:[];
  const matched=nodes.map(node=>({node,entry:lock.packages?.[node]})).filter(x=>x.entry?.version);
  const rows=matched.length?matched:[{node:null,entry:null}];
  const advisoryRows=(Array.isArray(vuln.via)?vuln.via:[]).filter(x=>x&&typeof x==='object');
  const advisories=advisoryRows.length?advisoryRows:[{name:'npm:'+name,title:'npm audit reports a vulnerability affecting '+name,severity:vuln.severity,range:vuln.range}];
  for(const row of rows)for(const advisory of advisories){
   const fixedVersions=Array.isArray(advisory.fixedVersions)?advisory.fixedVersions.map(String):advisory.fixedVersion?[String(advisory.fixedVersion)]:[];
   const advisoryFix=advisory.fixAvailable===true;
   const suggested=vuln.fixAvailable&&typeof vuln.fixAvailable==='object'?{
    package:String(vuln.fixAvailable.name||name),
    version:vuln.fixAvailable.version?String(vuln.fixAvailable.version):null,
    isSemVerMajor:vuln.fixAvailable.isSemVerMajor===true
   }:null;
   findings.push({
    package:name,version:row.entry?.version?String(row.entry.version):null,
    scope:scopeForFinding(name,vuln,row.node,lock,manifest),direct:vuln.isDirect===true,
    id:String(advisory.name||advisory.source||('npm:'+name)),
    summary:String(advisory.title||('Affected version range: '+(advisory.range||vuln.range||'not specified'))).slice(0,500),
    severity:normalizeSeverity(advisory.severity||vuln.severity),
    affectedRange:String(advisory.range||vuln.range||'not specified'),
    fixedVersions,
    fixAvailable:fixedVersions.length>0||advisoryFix||advisory.fixAvailable===true,
    suggestedTopLevelChange:suggested,
    references:advisory.url?[String(advisory.url)]:[],
    cwe:Array.isArray(advisory.cwe)?advisory.cwe.slice(0,8):[]
   });
  }
 }
 const severityCounts={critical:Number(meta.critical||0),high:Number(meta.high||0),moderate:Number(meta.moderate||0),low:Number(meta.low||0),unknown:Number(meta.info||0)};
 const rank={critical:0,high:1,moderate:2,low:3,unknown:4};
 findings.sort((a,b)=>rank[a.severity]-rank[b.severity]||a.package.localeCompare(b.package));
 return {
  status:Number(meta.total)>0?'vulnerable':'clean',
  label:Number(meta.total)>0?'發現已知套件漏洞':'本次 npm audit 未查得已知套件漏洞',
  source:'npm audit / npm advisory database',
  generatedAt,
  scannedPackageCount:packages.length,totalPackageCount:packages.length,
  vulnerablePackageCount:Object.keys(vulnerabilities).length,
  vulnerabilityCount:Number(meta.total),
  severityCounts,
  productionVulnerabilityCount:findings.filter(x=>x.scope==='production').length,
  developmentVulnerabilityCount:findings.filter(x=>x.scope==='development').length,
  unknownScopeVulnerabilityCount:findings.filter(x=>x.scope==='unknown').length,
  findings
 };
}
function createDependencyVulnerabilityScanner({lockPath,manifestPath,auditPath,clock=()=>Date.now(),cacheMs=CACHE_MS}={}){
 let cached=null,expiresAt=0,pending=null;
 return {async scan({force=false}={}){
  const now=clock();if(!force&&cached&&now<expiresAt)return cached;if(!force&&pending)return pending;
  pending=(async()=>{
   try{
    const [lockText,manifestText,auditText,stat]=await Promise.all([
     fs.readFile(lockPath,'utf8'),fs.readFile(manifestPath,'utf8'),fs.readFile(auditPath,'utf8'),fs.stat(auditPath)
    ]);
    cached=buildNpmAuditReport(JSON.parse(lockText),JSON.parse(manifestText),JSON.parse(auditText),new Date(stat.mtimeMs).toISOString());
    expiresAt=clock()+cacheMs;return cached;
   }catch(error){
    return {status:'unavailable',label:'漏洞資料暫時無法取得，不能判定安全',source:'npm audit / npm advisory database',generatedAt:new Date(clock()).toISOString(),scannedPackageCount:0,totalPackageCount:0,vulnerablePackageCount:0,vulnerabilityCount:0,severityCounts:{critical:0,high:0,moderate:0,low:0,unknown:0},findings:[],error:String(error?.message||error).slice(0,300)};
   }
  })();
  try{return await pending;}finally{pending=null;}
 }};
}
module.exports={packageNameFromLockPath,collectLockedPackages,normalizeSeverity,scopeForFinding,buildNpmAuditReport,createDependencyVulnerabilityScanner};

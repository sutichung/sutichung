'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {collectLockedPackages,buildReport,severityOf,fixedVersionsOf,createDependencyVulnerabilityScanner}=require('../lib/dependency-vulnerabilities');

test('collects exact locked npm package versions and distinguishes production from development',()=>{
 const lock={packages:{
  '':{name:'app',version:'1.0.0'},
  'node_modules/react':{version:'18.3.1',dev:false},
  'node_modules/@scope/pkg':{version:'2.1.0',dev:true},
  'node_modules/nested/node_modules/left-pad':{version:'1.3.0',dev:true},
  'node_modules/linked':{version:'1.0.0',link:true}
 }};
 const manifest={dependencies:{react:'^18.0.0'},devDependencies:{'@scope/pkg':'^2.0.0'}};
 const rows=collectLockedPackages(lock,manifest);
 assert.equal(rows.length,3);
 assert.deepEqual(rows.find(x=>x.name==='react'),{name:'react',version:'18.3.1',direct:true,scope:'production'});
 assert.deepEqual(rows.find(x=>x.name==='@scope/pkg'),{name:'@scope/pkg',version:'2.1.0',direct:true,scope:'development'});
 assert.equal(rows.find(x=>x.name==='left-pad').direct,false);
});

test('normalizes OSV severity and fixed-version events',()=>{
 assert.equal(severityOf({database_specific:{severity:'HIGH'}}),'high');
 assert.equal(severityOf({severity:[{type:'CVSS_V3',score:'CVSS:3.1/AV:N'}]}),'unknown');
 assert.deepEqual(fixedVersionsOf({affected:[{ranges:[{events:[{introduced:'0'},{fixed:'2.4.1'}]}]}]}),['2.4.1']);
});

test('builds a complete vulnerability report with production and development risk split',()=>{
 const packages=[
  {name:'vite',version:'6.2.7',scope:'development',direct:true},
  {name:'react',version:'18.3.1',scope:'production',direct:true}
 ];
 const batches=[[{vulns:[{id:'GHSA-test',summary:'Test advisory',database_specific:{severity:'HIGH'},affected:[{ranges:[{events:[{introduced:'0'},{fixed:'6.4.6'}]}]}],references:[{url:'https://example.com/advisory'}]}]},{vulns:[]}]];
 batches[0].packageOffset=0;
 const report=buildReport(packages,batches,0,'2026-11-18T00:00:00.000Z');
 assert.equal(report.status,'vulnerable');
 assert.equal(report.scannedPackageCount,2);
 assert.equal(report.vulnerabilityCount,1);
 assert.equal(report.productionVulnerabilityCount,0);
 assert.equal(report.developmentVulnerabilityCount,1);
 assert.equal(report.severityCounts.high,1);
 assert.equal(report.findings[0].fixedVersions[0],'6.4.6');
 assert.equal(report.findings[0].references[0],'https://example.com/advisory');
});

test('partial batches never report a clean security result',()=>{
 const packages=[{name:'a',version:'1.0.0'},{name:'b',version:'1.0.0'}];
 const batches=[[{vulns:[]}]];batches[0].packageOffset=0;
 const report=buildReport(packages,batches,1);
 assert.equal(report.status,'partial');
 assert.match(report.label,/不能判定安全/);
});

async function withScannerFiles(packageCount,run){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vuln-scan-'));
 const packages={'':{name:'test-app',version:'1.0.0'}};
 for(let i=0;i<packageCount;i++)packages['node_modules/pkg-'+i]={version:'1.0.'+i,dev:false};
 const lockPath=path.join(dir,'package-lock.json'),manifestPath=path.join(dir,'package.json');
 await fs.writeFile(lockPath,JSON.stringify({packages}));
 await fs.writeFile(manifestPath,JSON.stringify({dependencies:Object.fromEntries(Array.from({length:packageCount},(_,i)=>['pkg-'+i,'*']))}));
 try{return await run({lockPath,manifestPath});}finally{await fs.rm(dir,{recursive:true,force:true});}
}
test('scanner counts successfully queried locked packages instead of reporting an empty partial result',async()=>{
 await withScannerFiles(2,async({lockPath,manifestPath})=>{
  const scanner=createDependencyVulnerabilityScanner({lockPath,manifestPath,fetchImpl:async(url,options)=>{
   const body=JSON.parse(options.body);
   return {ok:true,status:200,json:async()=>({results:body.queries.map(()=>({vulns:[]}))})};
  }});
  const report=await scanner.scan({force:true});
  assert.equal(report.status,'clean');
  assert.equal(report.scannedPackageCount,2);
  assert.equal(report.totalPackageCount,2);
  assert.equal(report.failedBatchCount,0);
 });
});
test('scanner preserves successful batches and marks failed batches partial',async()=>{
 await withScannerFiles(101,async({lockPath,manifestPath})=>{
  const scanner=createDependencyVulnerabilityScanner({lockPath,manifestPath,fetchImpl:async(url,options)=>{
   const body=JSON.parse(options.body);
   if(body.queries.length===1)throw new Error('simulated_osv_outage');
   return {ok:true,status:200,json:async()=>({results:body.queries.map(()=>({vulns:[]}))})};
  }});
  const report=await scanner.scan({force:true});
  assert.equal(report.status,'partial');
  assert.equal(report.scannedPackageCount,100);
  assert.equal(report.totalPackageCount,101);
  assert.equal(report.failedBatchCount,1);
  assert.match(report.error,/simulated_osv_outage/);
 });
});

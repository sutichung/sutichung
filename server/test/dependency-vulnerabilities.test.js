'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {collectLockedPackages,normalizeSeverity,buildNpmAuditReport}=require('../lib/dependency-vulnerabilities');

test('collects exact locked npm versions and distinguishes production from development',()=>{
 const lock={packages:{
  '':{name:'app',version:'1.0.0'},
  'node_modules/react':{version:'18.3.1',dev:false},
  'node_modules/vite':{version:'6.4.6',dev:true},
  'node_modules/@scope/pkg':{version:'2.1.0',dev:true},
  'node_modules/nested/node_modules/left-pad':{version:'1.3.0',dev:true}
 }};
 const manifest={dependencies:{react:'^18.0.0'},devDependencies:{vite:'6.4.6','@scope/pkg':'^2.0.0'}};
 const rows=collectLockedPackages(lock,manifest);
 assert.equal(rows.length,4);
 assert.deepEqual(rows.find(x=>x.name==='react'),{name:'react',version:'18.3.1',direct:true,scope:'production'});
 assert.deepEqual(rows.find(x=>x.name==='vite'),{name:'vite',version:'6.4.6',direct:true,scope:'development'});
 assert.equal(rows.find(x=>x.name==='left-pad').direct,false);
});

test('normalizes npm advisory severities without inventing unknown ratings',()=>{
 assert.equal(normalizeSeverity('HIGH'),'high');
 assert.equal(normalizeSeverity('moderate'),'moderate');
 assert.equal(normalizeSeverity('critical'),'critical');
 assert.equal(normalizeSeverity('unrated'),'unknown');
});

test('builds vulnerability details and separates production from build-tool risks',()=>{
 const lock={packages:{
  'node_modules/react':{version:'18.3.1',dev:false},
  'node_modules/vite':{version:'6.4.6',dev:true},
  'node_modules/picomatch':{version:'4.0.2',dev:true}
 }};
 const manifest={dependencies:{react:'^18.0.0'},devDependencies:{vite:'6.4.6'}};
 const audit={
  vulnerabilities:{
   vite:{severity:'high',isDirect:true,range:'<=6.4.6',nodes:['node_modules/vite'],via:[{name:'GHSA-vite-test',title:'Vite dev server advisory',severity:'high',range:'<=6.4.6',url:'https://example.com/vite'}],fixAvailable:{name:'vite',version:'6.4.7',isSemVerMajor:false}},
   picomatch:{severity:'high',isDirect:false,range:'<4.0.8',nodes:['node_modules/picomatch'],via:[{name:'GHSA-picomatch-test',title:'Picomatch ReDoS',severity:'high',range:'<4.0.8'}],fixAvailable:false}
  },
  metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:2,critical:0,total:2}}
 };
 const report=buildNpmAuditReport(lock,manifest,audit,'2026-11-18T00:00:00.000Z');
 assert.equal(report.status,'vulnerable');
 assert.equal(report.scannedPackageCount,3);
 assert.equal(report.vulnerabilityCount,2);
 assert.equal(report.productionVulnerabilityCount,0);
 assert.equal(report.developmentVulnerabilityCount,2);
 assert.equal(report.severityCounts.high,2);
 assert.deepEqual(report.findings.find(x=>x.package==='vite').fixedVersions,[]);
 assert.deepEqual(report.findings.find(x=>x.package==='vite').suggestedTopLevelChange,{package:'vite',version:'6.4.7',isSemVerMajor:false});
 assert.equal(report.findings.find(x=>x.package==='vite').fixAvailable,false);
 assert.equal(report.findings.find(x=>x.package==='picomatch').fixAvailable,false);
 assert.equal(report.findings.find(x=>x.package==='picomatch').suggestedTopLevelChange,null);
 assert.equal(report.findings.find(x=>x.package==='vite').references[0],'https://example.com/vite');
});

test('an empty complete npm audit report is clean but a missing report is not clean',()=>{
 const lock={packages:{'node_modules/react':{version:'18.3.1',dev:false}}};
 const manifest={dependencies:{react:'^18.0.0'}};
 const clean=buildNpmAuditReport(lock,manifest,{vulnerabilities:{},metadata:{vulnerabilities:{total:0}}});
 assert.equal(clean.status,'clean');
 assert.throws(()=>buildNpmAuditReport(lock,manifest,{}),/不能判定安全|不完整/);
});

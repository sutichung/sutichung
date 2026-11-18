'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {getRegistry} = require('../lib/global-finance');

test('global finance registry clearly separates public sources from bank account access',()=>{
  const registry=getRegistry();
  assert.ok(registry.institutions.length>=10);
  assert.equal(registry.privateAccountConnectors,0);
  assert.ok(registry.institutions.every(x=>x.code&&x.country&&x.url&&x.status));
});

test('global macro connector returns timestamped observations and explicit coverage',async()=>{
  const original=global.fetch;
  global.fetch=async url=>({ok:true,status:200,json:async()=>[{},[{date:'2024',value:2.5}]]});
  try{
    const {loadMacro}=require('../lib/global-finance');
    const result=await loadMacro();
    assert.equal(result.status,'connected');
    assert.equal(result.data.length,33);
    assert.equal(result.summary.received,33);
    assert.ok(result.data.every(x=>x.source==='World Bank Open Data'&&x.year&&Number.isFinite(x.value)));
  }finally{global.fetch=original;}
});
test('global macro connector reports empty upstream responses instead of fake values',async()=>{
  const original=global.fetch;
  global.fetch=async()=>({ok:true,status:200,json:async()=>[{},[]]});
  try{
    const {loadMacro}=require('../lib/global-finance');
    const result=await loadMacro();
    assert.equal(result.status,'unavailable');
    assert.equal(result.data.length,0);
    assert.equal(result.summary.failed,33);
  }finally{global.fetch=original;}
});

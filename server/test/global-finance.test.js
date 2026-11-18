'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {getRegistry,loadFx} = require('../lib/global-finance');

test('global finance registry clearly separates public sources from bank account access',()=>{
  const registry=getRegistry();
  assert.ok(registry.institutions.length>=10);
  assert.equal(registry.privateAccountConnectors,0);
  assert.equal(registry.publicDataConnectorsImplemented,3);
  assert.ok(registry.institutions.every(x=>x.code&&x.country&&x.url&&x.status));
});

test('global macro connector batches countries per indicator and returns timestamped observations',async()=>{
  const original=global.fetch;
  const countries=['USA','CHN','JPN','GBR','DEU','IND','BRA','CAN','AUS','KOR','TWN'];
  const calls=[];
  global.fetch=async url=>{
    calls.push(String(url));
    const countryRows=countries.map(code=>({countryiso3code:code,country:{id:code},date:'2024',value:2.5}));
    return {ok:true,status:200,json:async()=>[{},countryRows]};
  };
  try{
    const {loadMacro}=require('../lib/global-finance');
    const result=await loadMacro();
    assert.equal(calls.length,3);
    assert.ok(calls.every(url=>countries.every(code=>url.includes(code))));
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

test('official Bank of Canada Valet FX is included as a separate daily-average cross-check',async()=>{
  const original=global.fetch;
  const calls=[];
  global.fetch=async url=>{
    calls.push(String(url));
    if(String(url).includes('/valet/observations/FXCADUSD/json')){
      return {ok:true,status:200,json:async()=>({observations:[{d:'2026-11-17',FXCADUSD:{v:'0.6997'}}]})};
    }
    const currency=String(url).match(/EXR\/D\.([A-Z]{3})\.EUR/)?.[1]||'USD';
    const rates={USD:'1.15',GBP:'0.86',JPY:'180',CHF:'0.93',AUD:'1.75',CAD:'1.60',CNY:'8.2',HKD:'9.0',SGD:'1.5',KRW:'1600',TWD:'34'};
    return {ok:true,status:200,text:async()=>[
      'FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE',
      'D,'+currency+',EUR,SP00,A,2026-11-17,'+rates[currency]
    ].join('\n')};
  };
  try{
    const result=await loadFx();
    assert.equal(result.rates.length,11);
    assert.equal(result.rates.find(x=>x.currency==='USD').rate,1.15);
    assert.equal(result.rates.find(x=>x.currency==='JPY').rate,180);
    assert.equal(result.rates.find(x=>x.currency==='TWD').rate,34);
    assert.equal(result.crossChecks.length,1);
    assert.equal(result.crossChecks[0].status,'connected');
    assert.equal(result.crossChecks[0].pair,'CAD/USD');
    assert.equal(result.crossChecks[0].rate,0.6997);
    assert.equal(result.crossChecks[0].frequency,'daily_average');
    assert.equal(calls.filter(x=>x.includes('/valet/observations/FXCADUSD/json')).length,1);
  }finally{global.fetch=original;}
});

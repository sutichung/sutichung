'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildResearchLists}=require('../lib/research-selection');

test('neutral and insufficient-data rows are never mislabeled as bearish',()=>{
 const rows=[
  {symbol:'BULL',scorecard:{status:'research-ready',direction:'偏向買進',score:82}},
  {symbol:'BEAR',scorecard:{status:'research-ready',direction:'偏向賣出／避險',score:28}},
  {symbol:'NEUTRAL',scorecard:{status:'research-ready',direction:'中性觀望',score:50}},
  {symbol:'WAIT',scorecard:{status:'research-ready',direction:'觀望',score:50}},
  {symbol:'INVALID',scorecard:{status:'insufficient-data',direction:'偏向賣出／避險',score:10}},
  {symbol:'NULL_SCORE',scorecard:{status:'research-ready',direction:'偏向賣出／避險',score:null}}
 ];
 const result=buildResearchLists(rows,30);
 assert.deepEqual(result.topBullish.map(x=>x.symbol),['BULL']);
 assert.deepEqual(result.topBearish.map(x=>x.symbol),['BEAR']);
 assert.equal(result.neutralCount,2);
 assert.equal(result.researchReadyCount,4);
});

test('bearish and bullish candidates are sorted by directional score',()=>{
 const rows=[
  {symbol:'B2',scorecard:{status:'research-ready',direction:'偏向買進',score:75}},
  {symbol:'B1',scorecard:{status:'research-ready',direction:'偏向買進',score:90}},
  {symbol:'S2',scorecard:{status:'research-ready',direction:'偏向賣出／避險',score:30}},
  {symbol:'S1',scorecard:{status:'research-ready',direction:'偏向賣出／避險',score:15}}
 ];
 const result=buildResearchLists(rows,1);
 assert.deepEqual(result.topBullish.map(x=>x.symbol),['B1']);
 assert.deepEqual(result.topBearish.map(x=>x.symbol),['S1']);
});

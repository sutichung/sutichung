'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildOverview}=require('../lib/intelligence');

test('global intelligence separates source evidence and does not claim verification',()=>{
 const out=buildOverview({
  marketNews:[{title:'央行利率政策公告',url:'https://example.test/a',source:'official',publishedAt:'2026-11-18'}],
  cryptoNews:[{title:'Bitcoin liquidation panic',link:'https://example.test/b',source:'media'}],
  fx:{base:'EUR',rates:[{currency:'USD',rate:1.1,asOf:'2026-11-17'}]},
  firewall:{requests:12,blocked:2}
 });
 assert.equal(out.summary.items,2);
 assert.equal(out.summary.verifiedItems,0);
 assert.equal(out.items.find(x=>x.title.includes('央行')).topic,'macro');
 assert.equal(out.items.find(x=>x.title.includes('Bitcoin')).topic,'crypto');
 assert.equal(out.items[0].verification,'single_source_unverified');
 assert.equal(out.security.blocked,2);
});

test('global intelligence deduplicates repeated headlines',()=>{
 const out=buildOverview({marketNews:[{title:'Same headline'},{title:'Same headline'}]});
 assert.equal(out.summary.items,1);
});

test('same headline from independent sources is preserved as corroboration, not fact verification',()=>{
 const out=buildOverview({marketNews:[{title:'Central bank policy update',source:'Outlet A',url:'https://a.example/news'},{title:'Central bank policy update',source:'Outlet B',url:'https://b.example/news'}]});
 assert.equal(out.summary.items,1);
 assert.equal(out.summary.corroboratedHeadlines,1);
 assert.equal(out.summary.verifiedItems,0);
 assert.equal(out.items[0].sourceCount,2);
 assert.equal(out.items[0].sources.length,2);
 assert.equal(out.items[0].corroborationStatus,'multiple_sources_same_headline_unverified');
});

test('unsafe source URLs are discarded',()=>{
 const out=buildOverview({marketNews:[{title:'Unsafe link',url:'javascript:alert(1)'}]});
 assert.equal(out.items[0].url,'');
});

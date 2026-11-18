'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {applyFirewall,getTelemetry}=require('../lib/firewall');

function response(){
 const headers={};let status=0,body='';
 return {headers,get status(){return status;},get body(){return body;},setHeader(k,v){headers[k]=v;},writeHead(s,h){status=s;Object.assign(headers,h);},end(v){body=String(v||'');}};
}
function request(url,method='GET',headers={}){
 return {url,method,headers,socket:{remoteAddress:'127.0.0.1'}};
}

test('firewall adds baseline security headers and permits normal request',()=>{
 const res=response();
 assert.equal(applyFirewall(request('/api/health'),res),true);
 assert.equal(res.headers['X-Content-Type-Options'],'nosniff');
 assert.equal(res.headers['X-Frame-Options'],'SAMEORIGIN');
 assert.equal(res.headers['X-RateLimit-Limit'],'240');
});

test('firewall blocks common secret-file probes',()=>{
 const res=response();
 assert.equal(applyFirewall(request('/.env'),res),false);
 assert.equal(res.status,404);
 assert.match(res.body,/not_found/);
 assert.ok(getTelemetry().probes>=1);
});

test('firewall rejects oversized request bodies before route handling',()=>{
 const res=response();
 assert.equal(applyFirewall(request('/api/market/news','POST',{'content-length':'20000'}),res),false);
 assert.equal(res.status,413);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {verifyGitHubActionsToken}=require('../lib/github-oidc');

function makeToken(pair,overrides={}){
 const now=Math.floor(Date.now()/1000);
 const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const header=b64({alg:'RS256',kid:'test-key',typ:'JWT'});
 const claims=b64({iss:'https://token.actions.githubusercontent.com',aud:'taiwan-stock-hunter-automation',repository:'sutichung/sutichung',ref:'refs/heads/main',workflow_ref:'sutichung/sutichung/.github/workflows/market-automation.yml@refs/heads/main',iat:now,exp:now+300,...overrides});
 const input=header+'.'+claims;
 return input+'.'+crypto.sign('RSA-SHA256',Buffer.from(input),pair.privateKey).toString('base64url');
}
test('accepts signed short-lived token from the exact repository workflow and main ref',async()=>{
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk=pair.publicKey.export({format:'jwk'});Object.assign(jwk,{kid:'test-key',use:'sig',alg:'RS256'});
 const token=makeToken(pair);
 const fetchImpl=async()=>({ok:true,json:async()=>({keys:[jwk]})});
 assert.equal(await verifyGitHubActionsToken(token,{fetchImpl}),true);
});
test('rejects wrong repository, branch, workflow, audience, expiry and signature',async()=>{
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const other=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk=pair.publicKey.export({format:'jwk'});Object.assign(jwk,{kid:'test-key',use:'sig',alg:'RS256'});
 const fetchImpl=async()=>({ok:true,json:async()=>({keys:[jwk]})});
 for(const claims of [{repository:'attacker/repo'},{ref:'refs/heads/dev'},{workflow_ref:'other.yml'},{aud:'wrong-audience'},{exp:1}]){
  assert.equal(await verifyGitHubActionsToken(makeToken(pair,claims),{fetchImpl}),false);
 }
 assert.equal(await verifyGitHubActionsToken(makeToken(other),{fetchImpl}),false);
 assert.equal(await verifyGitHubActionsToken('not-a-jwt',{fetchImpl}),false);
});

'use strict';
const crypto=require('node:crypto');

const ISSUER='https://token.actions.githubusercontent.com';
const JWKS_URL=ISSUER+'/.well-known/jwks';
const EXPECTED={aud:'taiwan-stock-hunter-automation',repository:'sutichung/sutichung',ref:'refs/heads/main'};
const MARKET_WORKFLOW='sutichung/sutichung/.github/workflows/market-automation.yml@refs/heads/main';
const REFRESH_WORKFLOW='sutichung/sutichung/.github/workflows/market-data-refresh.yml@refs/heads/main';
const SMOKE_WORKFLOW='sutichung/sutichung/.github/workflows/production-smoke.yml@refs/heads/main';
let cachedKeys=null,keysExpiresAt=0;

function decodePart(value){
  return JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
}
async function signingKeys(fetchImpl,now){
  if(cachedKeys&&now<keysExpiresAt)return cachedKeys;
  const response=await fetchImpl(JWKS_URL,{headers:{accept:'application/json'},signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('github_oidc_jwks_unavailable');
  const payload=await response.json();
  if(!Array.isArray(payload.keys)||!payload.keys.length)throw new Error('github_oidc_jwks_empty');
  cachedKeys=payload.keys;
  keysExpiresAt=now+60*60*1000;
  return cachedKeys;
}
async function verifyGitHubActionsToken(token,{fetchImpl=fetch,now=Date.now(),allowProductionSmoke=false}={}){
  if(typeof token!=='string'||token.length>12000) return false;
  const parts=token.split('.');
  if(parts.length!==3)return false;
  try{
    const header=decodePart(parts[0]),claims=decodePart(parts[1]);
    if(header.alg!=='RS256'||typeof header.kid!=='string')return false;
    const seconds=Math.floor(now/1000);
    if(claims.iss!==ISSUER||claims.aud!==EXPECTED.aud)return false;
    if(claims.repository!==EXPECTED.repository||claims.ref!==EXPECTED.ref)return false;
    const allowedWorkflowEvent=([MARKET_WORKFLOW,REFRESH_WORKFLOW].includes(claims.workflow_ref)&&['schedule','workflow_dispatch'].includes(claims.event_name))||
      (allowProductionSmoke&&claims.workflow_ref===SMOKE_WORKFLOW&&['push','workflow_run'].includes(claims.event_name));
    if(!allowedWorkflowEvent)return false;
    if(!Number.isFinite(claims.exp)||claims.exp<seconds-30||!Number.isFinite(claims.iat)||claims.iat>seconds+30)return false;
    if(claims.nbf!=null&&(!Number.isFinite(claims.nbf)||claims.nbf>seconds+30))return false;
    const keys=await signingKeys(fetchImpl,now);
    const jwk=keys.find(key=>key.kid===header.kid&&key.kty==='RSA'&&(!key.use||key.use==='sig'));
    if(!jwk)return false;
    const publicKey=crypto.createPublicKey({key:jwk,format:'jwk'});
    return crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),publicKey,Buffer.from(parts[2],'base64url'));
  }catch(_){return false;}
}
module.exports={verifyGitHubActionsToken};

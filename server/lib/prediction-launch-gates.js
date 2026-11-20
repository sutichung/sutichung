'use strict';

// ZENTRAX launch controls. The public preview is non-redeemable paper simulation only.
// Real-money access is deny-by-default and requires multiple independently recorded gates.
const REAL_MONEY_GATES = Object.freeze([
  'ZENTRAX_REAL_MONEY_ENABLED',
  'ZENTRAX_UK_LEGAL_APPROVAL_ID',
  'ZENTRAX_UK_REGULATORY_APPROVAL_ID',
  'ZENTRAX_CUSTODY_AUDIT_ID',
  'ZENTRAX_SECURITY_AUDIT_ID'
]);

function realMoneyReadiness(env = process.env) {
  const missing = REAL_MONEY_GATES.filter((key) => !String(env[key] || '').trim());
  const explicitlyEnabled = String(env.ZENTRAX_REAL_MONEY_ENABLED || '').toLowerCase() === 'true';
  return {
    enabled: explicitlyEnabled && missing.length === 0,
    jurisdiction: 'GB',
    targetJurisdictions: ['GB'],
    blockedJurisdictions: 'ALL_EXCEPT_EXPLICITLY_APPROVED_GB',
    minimumAge: 18,
    missingGates: missing,
    mode: 'paper-preview-only'
  };
}

function assertRealMoneyAllowed({ jurisdiction, age, env = process.env } = {}) {
  const readiness = realMoneyReadiness(env);
  if (!readiness.enabled) {
    const error = new Error('real_money_launch_not_approved');
    error.status = 403;
    error.details = { missingGates: readiness.missingGates };
    throw error;
  }
  if (String(jurisdiction || '').toUpperCase() !== 'GB') {
    const error = new Error('jurisdiction_not_approved');
    error.status = 403;
    throw error;
  }
  if (!Number.isInteger(age) || age < 18) {
    const error = new Error('adult_age_verification_required');
    error.status = 403;
    throw error;
  }
  return true;
}

module.exports = { REAL_MONEY_GATES, realMoneyReadiness, assertRealMoneyAllowed };

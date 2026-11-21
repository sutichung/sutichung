'use strict';

// All values are raw USDT integer units. The 60/25/10/5 split applies only
// after an explicitly supplied tax/statutory reserve has been withheld.
function calculateCreatorAllocation(feeRaw, taxReserveRaw = '0') {
  const fee = parseRaw(feeRaw, 'fee');
  const tax = parseRawAllowZero(taxReserveRaw, 'tax_reserve');
  if (tax > fee) throw new Error('tax_reserve_exceeds_fee');
  const distributable = fee - tax;
  const creator = distributable * 60n / 100n;
  const product = distributable * 25n / 100n;
  const security = distributable * 10n / 100n;
  // Reserve receives the stated 5% plus any integer-rounding remainder.
  const reserve = distributable - creator - product - security;
  return {
    feeRaw: fee.toString(),
    taxReserveRaw: tax.toString(),
    distributableRaw: distributable.toString(),
    creatorRaw: creator.toString(),
    productRaw: product.toString(),
    securityRaw: security.toString(),
    reserveRaw: reserve.toString()
  };
}
function parseRaw(value, field) {
  const raw = String(value ?? '');
  if (!/^\d{1,78}$/.test(raw) || BigInt(raw) <= 0n) throw new Error('invalid_' + field);
  return BigInt(raw);
}
function parseRawAllowZero(value, field) {
  const raw = String(value ?? '');
  if (!/^\d{1,78}$/.test(raw)) throw new Error('invalid_' + field);
  return BigInt(raw);
}
module.exports = { calculateCreatorAllocation };

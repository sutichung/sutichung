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

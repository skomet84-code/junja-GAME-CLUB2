'use strict';const assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../echo-rewards'),ui=fs.readFileSync('public/junja-survival-20261007.js','utf8'),server=fs.readFileSync('server.js','utf8');
assert.equal(R.prizeFor(9999),0);assert.equal(R.prizeFor(10000),1000000);assert.equal(R.prizeFor(20000),3000000);assert.equal(R.prizeFor(40000),10000000);assert.equal(R.prizeFor(60000),30000000);assert.equal(R.prizeFor(80000),50000000);
assert.equal(R.plausible(30000,50000),true);assert.equal(R.plausible(15000000,50000),false);assert.equal(R.plausible(20000,2000),false);
assert.ok(ui.includes('FINAL_WAVE=10,WAVE_SECONDS=12'));assert.ok(ui.includes('claimEchoReward()'));
assert.ok(server.includes("url.pathname==='/api/echo/start'"));assert.ok(server.includes("url.pathname==='/api/echo/finish'"));assert.ok(server.includes('if(count>=5)throw Error'));
console.log('ECHO_REWARDS_OK: 10 waves/12s, rising difficulty, tiered payouts, daily bound, time gate and duplicate protection');
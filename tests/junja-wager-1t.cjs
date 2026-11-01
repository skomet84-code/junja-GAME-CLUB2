'use strict';const assert=require('node:assert/strict'),fs=require('node:fs');
const b=fs.readFileSync('admin-unlimited-start.js','utf8'),s=fs.readFileSync('server.js','utf8'),h=fs.readFileSync('public/index.html','utf8');
assert.ok(b.includes('cap=1000000000000'));assert.ok(s.includes('cap=Math.min(1000000000000,Math.floor(Number(balance||0)))'));
assert.ok(s.includes('빅휠 최대 베팅은 1조'));assert.ok(h.includes('id="horseBet" class="no-spinner" type="number" min="1000" max="1000000000000"'));
assert.ok(s.includes("['yut','seotda','gostop'].includes(game)&&buyIn>1000000000000"));
console.log('WAGER_1T_CAP_OK: non-poker 1T server and UI, historical explicit 100k ceilings overridden');

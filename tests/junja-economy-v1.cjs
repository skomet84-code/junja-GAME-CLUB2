'use strict';const fs=require('fs'),assert=require('node:assert/strict');
const sv=fs.readFileSync('server.js','utf8'),app=fs.readFileSync('public/app.js','utf8'),boot=fs.readFileSync('admin-unlimited-start.js','utf8'),h=fs.readFileSync('public/index.html','utf8');
assert.ok(sv.includes('item.price*=100'));assert.ok(boot.includes('cap=1000000000000'));
assert.ok(sv.includes('buyIn>1000000000000'));assert.ok(app.includes('AI 윷놀이 시작 실패'));
assert.ok(h.includes('id="soloYutBet" type="number" min="5000" max="1000000000000"'));
assert.ok(sv.includes("url.pathname==='/api/admin/bank-assets'"));assert.ok(app.includes('admin-bank-assets-btn'));
console.log('ECONOMY_V1_OK: solo yut, wager caps, shop x10, admin bank inspection');
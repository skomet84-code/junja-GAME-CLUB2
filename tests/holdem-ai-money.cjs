'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ai=require('../holdem-ai'),money=require('../public/money-format');
let seed=9026;const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const src=fs.readFileSync('server.js','utf8'),ctx={};vm.createContext(ctx);
vm.runInContext(src.slice(src.indexOf('function rankVal'),src.indexOf('function handName')),ctx);
const deck=[...'SHDC'].flatMap(s=>[...'23456789TJQKA'].map(r=>r+s));
for(let i=0;i<1500;i++){
  const pool=deck.slice(),cards=[];while(cards.length<7)cards.push(pool.splice(Math.floor(rng()*pool.length),1)[0]);
  const ref=ctx.eval7(cards);let score=0;for(let n=0;n<6;n++)score=score*15+(ref[n]||0);
  assert.equal(ai.rank(cards),score,JSON.stringify(cards));
}
const base={hole:['AS','AH'],board:[],stack:100000,roundBet:100,currentBet:100000,minRaise:99900,bigBlind:100,pot:100100,opponentStack:0,opponentRoundBet:100000,looseness:.18};
for(let i=0;i<12;i++){
  assert.equal(ai.decide(base,rng).action,'call','AA defends an all-in');
  assert.equal(ai.decide({...base,hole:['2S','7H']},rng).action,'fold','trash must not pay enormous shoves');
  assert.equal(ai.decide({...base,hole:['AS','KS'],board:['QS','JS','TS','2H','3D']},rng).action,'call','nuts never folds');
  assert.equal(ai.decide({...base,hole:['2S','7H'],board:['AC','KD','9S','5H','3D']},rng).action,'fold','river air folds');
}
assert.equal(ai.decide({...base,hole:['2H','3H'],board:['AS','KS','QS','JS','TS']},rng).action,'call','shared nuts must not fold a guaranteed chop');
let raises=0;
for(let i=0;i<60;i++){
 const d=ai.decide({...base,currentBet:100,opponentStack:99900,opponentRoundBet:100,pot:200,minRaise:100},rng);
 assert.notEqual(d.action,'fold','a free check must not fold');
 if(d.action==='raise'){raises++;assert.ok(d.raiseTo>=200&&d.raiseTo<=100100);}
}
assert.ok(raises>25,'strong hands actively raise');
// Identical observations yield identical decisions regardless of hidden state.
const s=seed;const first=ai.decide({...base,hole:['KH','QH']},rng);seed=s;
assert.deepEqual(ai.decide({...base,hole:['KH','QH'],opponentHole:['AS','AH'],deck:['2S']},rng),first);
const room={},hand={};ai.observe(room,hand,'raise');const count=room.holdemOpponent.aggressive;
ai.observe(room,hand,'raise');assert.equal(room.holdemOpponent.aggressive,count);
for(let i=0;i<20;i++)ai.observe(room,{},'raise');assert.ok(room.holdemOpponent.aggressive/room.holdemOpponent.hands>.75);
assert.equal(money.compact(999999999999),'999,999,999,999');
assert.equal(money.compact(1e12),'1조');assert.equal(money.compact(1234500000000),'1조 2,345억');
assert.equal(money.compact(-1234500000000),'-1조 2,345억');
assert.equal(money.compact(1000000000001),'약 1조');
assert.equal(money.exact(1234567890123),'1,234,567,890,123');
assert.equal(money.compact(Number.MAX_SAFE_INTEGER),'약 9,007조 1,992억');
const start=performance.now();for(let i=0;i<100;i++)ai.decide({...base,board:['QS','JD','2C']},rng);
console.log('HOLDEM_AI_MONEY_OK: evaluator 1500 hands; all-in/raise/privacy/legal/money cases; average decision '+((performance.now()-start)/100).toFixed(1)+'ms');

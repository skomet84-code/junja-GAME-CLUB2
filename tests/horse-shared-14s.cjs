'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const server=fs.readFileSync('server.js','utf8');
const ui=fs.readFileSync('public/app.js','utf8');
const slice=server.slice(server.indexOf('function horseStartIfReady('),server.indexOf('function horsePlaceBet('));
const roundFactory=(tick)=>({id:'SHARED42',phase:'betting',openedAt:0,card:{},bets:new Map([[41,{bet:1000,type:'win',picks:[1]}],[42,{bet:2000,type:'win',picks:[2]}]]),ready:new Set([41]),results:new Map()});
let tick=1000,settles=[];
const ctx={now:()=>tick,horseMeet:null,HORSE_BET_MS:14000,HORSE_RUN_MS:6500,HORSE_RESULT_MS:4200,horseRun:()=>[{id:1},{id:2}],
settleRace:(id,bet,type,picks)=>{settles.push(id);return {won:id===41,placeBonus:false,payout:id===41?9000:0}},
escrowDelete:()=>{},userPublic:(id)=>({nickname:'FRIEND'+id,avatar:null,cosmetics:{}}),
newHorseMeet:()=>({id:'NEXT',phase:'betting',openedAt:tick,card:{},bets:new Map(),ready:new Set(),results:new Map()})};
vm.createContext(ctx);vm.runInContext(slice,ctx);
ctx.horseMeet=roundFactory();
for(tick of [1000,5000,13999]){
 const first=ctx.horseMeetPublic(41).round,second=ctx.horseMeetPublic(42).round;
 assert.equal(first.id,second.id,'everyone must see the same live round');
 assert.equal(first.phase,'betting','a ready player cannot close the shared window');
 assert.equal(first.participants.length,2);
 assert.equal(second.myBet.bet,2000);
 assert.equal(first.participants[0].payout,undefined,'no result before finish');
}
tick=14000;
let live=ctx.horseMeetPublic(41).round;
assert.equal(live.phase,'running');
assert.equal(live.startedAt,14000);
assert.deepEqual(settles,[41,42],'one settlement for each participant');
ctx.horseMeetPublic(42);
assert.deepEqual(settles,[41,42],'polling must not settle again');
assert.equal(live.participants[0].payout,undefined,'results are not exposed during race');
tick=20500;
const final=ctx.horseMeetPublic(42).round;
assert.equal(final.phase,'result');assert.equal(final.participants.length,2);
assert.equal(final.participants.find(p=>p.userId===41).payout,9000);
assert.equal(final.participants.find(p=>p.userId===42).payout,0);
assert.equal(final.myResult.payout,0);
tick=24700;
const next=ctx.horseMeetPublic(42).round;
assert.equal(next.id,'NEXT');assert.equal(next.phase,'betting');assert.equal(next.myBet,null);
assert.ok(ui.includes("if(r.myBet)return false"),'bets must not require a second Ready button');
assert.ok(!ui.includes("const ready=await api('/api/horse/ready'"),'one-click bet avoids legacy readiness side effect');
assert.ok(ui.includes('horse-friend-ticket'),'roster displays each participant');
console.log('HORSE_SHARED_14S_OK: two players, fixed betting window, one shared result, no double settlement, next round');
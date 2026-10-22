'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const server=fs.readFileSync('server.js','utf8');
const source=server.slice(server.indexOf('const BIG_WHEEL_DEFS ='),server.indexOf('const SICBO_TOTAL_GROSS='));
let index=0, balance=0, ledger=[], stats=[], free=false;
const ctx=vm.createContext({
 crypto:{randomInt:n=>{assert.equal(n,77);return index}},
 gameWager:b=>b,userPublic:()=>({balance}),
 consumeRankFreePlay:()=>({free}),
 socialRankPerksForUser:()=>({freeSlotBet:10000000}),
 walletChange:(id,amount,type,note)=>{balance+=amount;ledger.push({amount,type,note})},
 formatMoney:String, db:{prepare:()=>({run:(...args)=>stats.push(args)})}
});
vm.runInContext(source+'\nthis.spin=bigWheelSpin;this.keys=BIG_WHEEL_KEYS;this.defs=BIG_WHEEL_DEFS;',ctx);
assert.deepEqual(Array.from(ctx.keys.flatMap((key,i)=>key==='junja'?[i]:[])),[0,38]);
let cases=0;
for(free of [false,true])for(index=0;index<77;index++)for(const key of Object.keys(ctx.defs)){
 balance=1000000000;ledger=[];stats=[];
 const bet=free?10000000:10000, landed=ctx.keys[index], won=landed==='junja'||landed===key;
 const expected=won?bet*ctx.defs[landed].mult:0;
 const r=ctx.spin('test-user',10000,key,free);
 assert.equal(r.payout,expected);assert.equal(r.won,won);
 assert.equal(r.jackpot,landed==='junja');
 assert.equal(balance,1000000000-(free?0:bet)+expected);
 assert.equal(ledger.filter(x=>x.type==='bigwheel_win').length,won?1:0);
 assert.equal(stats[0][0],won?1:0);assert.equal(stats[0][1],expected-(free?0:bet));
 if(landed==='junja')assert.match(ledger.at(-1).note,/JUNJA 잭팟 x100/);
 cases++;
}
const app=fs.readFileSync('public/app.js','utf8');
const expression=app.match(/target=(.*?),start=performance.now/)[1];
const tau=2*Math.PI, step=tau/77;
for(let round=0,angle=0;round<154;round++){
 const idx=round%77,current=angle%tau,desired=-(idx*step+step/2),turns=8;
 const target=vm.runInNewContext(expression,{bigWheelAngle:angle,current,desired,turns,Math});
 assert.ok(target>angle);
 const pocket=Math.floor(((-target%tau+tau)%tau)/step);
 assert.equal(pocket,idx);angle=target;
}
console.log('PASS: '+cases+' payout/wallet/stats cases; both JUNJA pockets; paid/free spins; 154 consecutive visual stops');

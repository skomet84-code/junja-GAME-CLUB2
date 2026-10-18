'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const exactWallet=require('../exact-wallet');

const source=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const begin=source.indexOf('function bigWheelSpin(userId,bet,key,useRankFree=false){');
const end=source.indexOf('\nconst SICBO_TOTAL_GROSS',begin);
assert(begin>=0 && end>begin,'Big Wheel server function is available');
const fnSource=source.slice(begin,end);
assert(fnSource.includes("db.exec('BEGIN IMMEDIATE')"),'Big Wheel must settle atomically');

function harness({index=0,balance='25000',free=false,failWin=false,freeBet=200000}={}){
  let state={
    user:{balance:exactWallet.mirror(BigInt(balance)),balance_exact:balance,balance_base:String(exactWallet.mirror(BigInt(balance)))},
    ledger:[],stats:{plays:0,wins:0,profit:0},freeUsed:0
  };
  let snapshot=null;
  const db={
    exec(sql){
      if(sql==='BEGIN IMMEDIATE'){assert.equal(snapshot,null);snapshot=structuredClone(state);}
      else if(sql==='COMMIT'){assert(snapshot);snapshot=null;}
      else if(sql==='ROLLBACK'){assert(snapshot);state=snapshot;snapshot=null;}
      else throw Error('Unexpected SQL transaction: '+sql);
    },
    prepare(sql){
      if(sql.startsWith('SELECT balance,balance_exact,balance_base FROM users'))
        return {get:()=>({...state.user})};
      if(sql.startsWith('UPDATE users SET balance=?,balance_exact=?,balance_base=?'))
        return {run:(balance,exact,base)=>{Object.assign(state.user,{balance,balance_exact:exact,balance_base:base});return {changes:1};}};
      if(sql.startsWith('INSERT INTO ledger('))
        return {run:(...args)=>{if(failWin&&args[5]==='bigwheel_win')throw Error('injected payout-ledger failure');state.ledger.push(args);return {changes:1};}};
      if(sql.startsWith('UPDATE stats SET bigwheel_plays='))
        return {run:(won,profit)=>{state.stats.plays++;state.stats.wins+=won;state.stats.profit+=profit;return {changes:1};}};
      throw Error('Unexpected SQL: '+sql);
    }
  };
  const segments=Array.from({length:77},(_,i)=>i===0||i===38?{key:'junja',label:'JUNJA',mult:100}:{key:'x2',label:'×2',mult:2});
  const ctx={
    db,exactWallet,
    BIG_WHEEL_SEGMENTS:segments,
    BIG_WHEEL_BETS:[segments[0],segments[1]],
    crypto:{randomInt:(max)=>{assert.equal(max,77);return index;}},
    gameWager:(n,min,max,step)=>{assert(Number.isSafeInteger(n)&&n>=min&&n<=max&&n%step===0);return n;},
    consumeRankFreePlay:(_userId,kind,useFree)=>{assert.equal(kind,'wheel');assert.equal(useFree,free);if(free)state.freeUsed++;return {free,used:state.freeUsed,limit:free?1:0,left:free?0:0};},
    socialRankPerksForUser:()=>({freeSlotBet:freeBet}),
    formatMoney:n=>String(n),
    now:()=>1729200000000
  };
  const spin=vm.runInNewContext(fnSource+'\nbigWheelSpin',ctx);
  return {spin:(bet,key)=>spin(1,bet,key,free),state:()=>state,read:()=>exactWallet.read(state.user)};
}
{
  const h=harness({index:0});
  const r=h.spin(10000,'junja');
  assert.equal(r.won,true);assert.equal(r.payout,1000000);assert.equal(r.profit,990000);
  assert.equal(h.read(),1015000n);
  assert.deepEqual(h.state().ledger.map(e=>e[5]),['bigwheel_bet','bigwheel_win']);
  assert.deepEqual(h.state().ledger.map(e=>e[3]),['-10000','1000000']);
  assert.equal(r.settlement.balanceAfter,1015000);
}
{
  const h=harness({index:38});
  const r=h.spin(1000,'junja');
  assert.equal(r.won,true);assert.equal(r.payout,100000);
  assert.equal(h.read(),124000n);
}
{
  const h=harness({index:0});
  const r=h.spin(1000,'x2');
  assert.equal(r.won,false,'JUNJA landing is a win only if JUNJA was selected');
  assert.equal(r.payout,0);assert.equal(h.read(),24000n);
  assert.deepEqual(h.state().ledger.map(e=>e[5]),['bigwheel_bet']);
}
{
  const h=harness({index:38,free:true,freeBet:200000});
  const r=h.spin(1000,'junja');
  assert.equal(r.won,true);assert.equal(r.payout,20000000);
  assert.equal(h.read(),20025000n);assert.equal(h.state().freeUsed,1);
  assert.deepEqual(h.state().ledger.map(e=>e[5]),['bigwheel_win']);
}
{
  const initial='123456789012345678901234';
  const h=harness({index:0,balance:initial});
  const r=h.spin(10000000,'junja');
  assert.equal(r.payout,1000000000);
  assert.equal(h.read(),BigInt(initial)+990000000n);
  assert.equal(r.settlement.balanceAfter,(BigInt(initial)+990000000n).toString());
}
{
  const h=harness({index:0,failWin:true,free:true});
  assert.throws(()=>h.spin(1000,'junja'),/injected payout-ledger failure/);
  assert.equal(h.read(),25000n);
  assert.equal(h.state().freeUsed,0,'a failed payout must restore the free ticket');
  assert.equal(h.state().ledger.length,0,'a failed payout must not leave a partial ledger');
  assert.equal(h.state().stats.plays,0,'failed rounds must not count');
}
{
  const h=harness({index:0,failWin:true});
  assert.throws(()=>h.spin(1000,'junja'),/injected payout-ledger failure/);
  assert.equal(h.read(),25000n,'a failed payout must roll back the wager');
  assert.equal(h.state().ledger.length,0);
}
console.log('BIGWHEEL_JUNJA_ATOMIC_PAYOUT_TESTS_OK');
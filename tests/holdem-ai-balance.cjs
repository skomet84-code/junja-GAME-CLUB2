'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
let runtime='';
class RuntimeModule {static _nodeModulePaths(){return [];} _compile(s){runtime=s;new vm.Script(s);}}
const boot={require:n=>n==='node:module'?RuntimeModule:n==='node:fs'?{...fs}:require(n),__dirname:root,module:{},Buffer,console};
vm.runInNewContext(fs.readFileSync(path.join(root,'admin-unlimited-start.js'),'utf8'),boot);
assert.ok(runtime.includes('function holdemBotRangeWeight'));
let seed=934751,clock=1;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const wallets=new Map(),escrow=new Map();
const ctx={crypto:{randomInt:n=>Math.floor(random()*n)},Math:Object.assign(Object.create(Math),{random}),now:()=>clock++,formatMoney:String,soloHoldem:new Map(),roomPlayer:(r,id)=>r.players.find(p=>p.userId===id),db:{prepare:()=>({run(){}})},escrowSet:(rid,id,n)=>escrow.set(id,n),escrowDelete:(rid,id)=>escrow.delete(id),walletChange:(id,n)=>wallets.set(id,(wallets.get(id)||0)+n)};
vm.createContext(ctx);
vm.runInContext(runtime.slice(runtime.indexOf('function cardDeck'),runtime.indexOf('// ---------- Yut engine')),ctx);
vm.runInContext(runtime.slice(runtime.indexOf('function soloPokerBotId'),runtime.indexOf('// ---------- Solo Yut AI')),ctx);
// Entry/cashout: the cap never drains the excess wallet; no duplicate credits.
wallets.set(1,25000000000000);
let room=ctx.soloPokerStart({id:1,balance:wallets.get(1),nickname:'QA',avatar:0});
assert.equal(room.buyIn,10000000000000);assert.equal(room.bigBlind,1000000000);assert.equal(wallets.get(1),15000000000000);assert.equal(escrow.get(1),10000000000000);
const human=ctx.roomPlayer(room,1);ctx.pokerAction(room,1,'fold');const chips=human.stack;
ctx.soloPokerCashout(1);assert.equal(wallets.get(1),15000000000000+chips);ctx.soloPokerCashout(1);assert.equal(wallets.get(1),15000000000000+chips);
wallets.set(2,1000000);room=ctx.soloPokerStart({id:2,balance:1000000,nickname:'QA2',avatar:0});assert.equal(room.bigBlind,10000);ctx.soloPokerCashout(2);
// Decisions use the bot's cards and public actions only, not opponent hole cards/deck.
function decision(hole,equity,allin=false){
 const id=3,bid=ctx.soloPokerBotId(id),r={solo:true,game:'holdem',bigBlind:10,players:[{userId:id,stack:900},{userId:bid,stack:990}],hand:{phase:'preflop',board:[],currentBet:100,minRaise:90,turnUserId:bid,p:{[id]:{hole:['2S','3H'],roundBet:100,totalBet:100,allIn:allin},[bid]:{hole,roundBet:10,totalBet:10}}}};
 const realEq=ctx.holdemBotEquity,realAction=ctx.pokerAction;ctx.holdemBotEquity=()=>equity;let action;ctx.pokerAction=(r,id,a)=>{action=a;r.hand.phase='complete';};ctx.pokerBotDrive(r,id);ctx.holdemBotEquity=realEq;ctx.pokerAction=realAction;return action;
}
assert.notEqual(decision(['AS','AH'],.85),'fold','strong hands defend against a raise');
assert.notEqual(decision(['KS','KH'],.68,true),'fold','profitable all-in calls no longer require 80% equity');
assert.equal(decision(['2S','7H'],.18,true),'fold','weak cards do not blindly call');
const strong=ctx.holdemBotRangeWeight(['AS','AH'],[],3,0,.8),weak=ctx.holdemBotRangeWeight(['2S','7H'],[],3,0,.8),loose=ctx.holdemBotRangeWeight(['2S','7H'],[],3,1,0);
assert.ok(strong>weak*5);assert.ok(loose>weak);
const nuts=ctx.holdemBotEquity({hole:['AS','KS']},['QS','JS','TS','2H','3D'],128,{pressure:3,trap:1});assert.equal(nuts,1);
console.log('ENTRY_CASHOUT_RANGE_AND_DECISION_CHECKS_OK');
// Fixed-seed adversarial play against the actual engine. No live accounts or DB.
function simulate(name,hands,mode){
 const id=10,bid=ctx.soloPokerBotId(id),buy=10000000000000,bb=1000000000;
 const r={id:'SIM',solo:true,game:'holdem',name:'QA',bigBlind:bb,smallBlind:bb/2,buyIn:buy,players:[{userId:id,seat:0,stack:buy,nickname:'Human'},{userId:bid,seat:1,stack:buy,nickname:'Bot'}]};
 let net=0,won=0,decisions=0,maxMs=0;const start=Date.now();
 for(let n=0;n<hands;n++){
   r.players.forEach(p=>p.stack=buy);ctx.pokerStart(r);let guard=0;
   while(r.hand.phase!=='complete'&&guard++<100){
    if(r.hand.turnUserId!==id){const t=Date.now();ctx.pokerBotDrive(r,id);maxMs=Math.max(maxMs,Date.now()-t);decisions++;continue;}
    const h=r.hand,hp=h.p[id],rp=ctx.roomPlayer(r,id),call=h.currentBet-hp.roundBet,max=hp.roundBet+rp.stack,min=h.currentBet+h.minRaise;
    let action=call?'call':'check',amount=0;
    const prof=ctx.holdemBotHoleProfile(hp.hole);
    if(mode==='raise'){
      if(h.phase==='preflop'&&!hp.acted&&max>=min){action='raise';amount=Math.min(max,Math.max(min,buy*.1));}
      else if(call>bb*3)action='fold';
    }else if(mode==='trap'){
      const status=ctx.pokerHandStatus([...hp.hole,...h.board]);
      if((h.board.length===0&&hp.hole[0][0]===hp.hole[1][0]&&'TJQKA'.includes(hp.hole[0][0]))||(h.board.length>=3&&status.rankLevel>=2)){
        if(max>h.currentBet){action='raise';amount=max;}
      }else if(call>bb*2)action='fold';
    }else{
      if(call>bb*5&&prof.score<.65)action='fold';
      else if(prof.premium&&max>=min&&h.phase==='preflop'){action='raise';amount=Math.min(max,Math.max(min,h.currentBet+bb*3));}
    }
    ctx.pokerAction(r,id,action,amount);
   }
   assert.equal(r.hand.phase,'complete','hand cannot stall');
   assert.equal(r.players.reduce((s,p)=>s+p.stack,0),buy*2,'all chips conserved');
   const gain=r.players[0].stack-buy;net+=gain;if(gain>0)won++;
 }
 return {strategy:name,hands,humanNetBB:net/bb,humanBBPer100:net/bb/hands*100,humanWinningHands:won,maxBotDriveMs:maxMs,totalMs:Date.now()-start,decisions};
}
const count=Number(process.env.SIM_HANDS||120);
for(const [name,mode] of [['10% opening bluff','raise'],['cheap calls then value shove','trap'],['mixed baseline','mixed']])console.log(JSON.stringify(simulate(name,count,mode)));

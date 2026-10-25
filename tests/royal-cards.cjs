'use strict';
const assert=require('node:assert/strict');
const factory=require('../royal-cards-server');
const {meldKind,attachable,findThank,cardDeck,attackValue,combinations}=factory._test;
assert.equal(cardDeck(true).length,54);
assert.equal(cardDeck(false).length,52);
assert.equal(new Set(cardDeck(true)).size,54);
assert.equal(meldKind(['S7']),'seven');
assert.equal(meldKind(['S4','H4','C4']),'set');
assert.equal(meldKind(['S4','S5','S6']),'run');
assert.equal(meldKind(['S12','S13','S1']),null);
assert.equal(meldKind(['H4','H4','C4']),null);
assert.equal(attachable(['H7'],'H6','seven'),true);
assert.equal(attachable(['H7'],'D6','seven'),false);
assert.equal(attachable(['H5','H6','H7'],'H8','run'),true);
assert.equal(attachable(['S4','H4','C4'],'D4','set'),true);
assert.deepEqual(findThank(['S3','S4','H6'],'S2'),['S2','S3','S4']);
assert.equal(attackValue('JOKR'),7);
assert.equal(attackValue('S1'),5);
assert.equal(attackValue('H2'),2);
assert.ok(combinations(['S4','H4','C4','D4']).some(cs=>cs.length===4&&meldKind(cs)==='set'),'4-card meld highlighted');
assert.ok(combinations(['H3','H4','H5','H6','H7']).some(cs=>cs.length===5&&meldKind(cs)==='run'),'5-card run highlighted');
const p1={id:11,nickname:'원카드 참가자'},p2={id:12,nickname:'훌라 참가자'};
let user=p1,index=0,activeTimers=[];
const rows=new Map();
const db={prepare(sql){return {get:key=>rows.has(key)?{value:rows.get(key)}:null,run:(key,value)=>{if(sql.startsWith('INSERT INTO game_state'))rows.set(key,value);}}}};
const crypto={randomInt:n=>index++%n,randomBytes:()=>({toString:()=>String(++index).padStart(14,'0')})};
const engine=factory({db,crypto,requireAuth:()=>user,readBody:async req=>req.body||{},json:(res,status,data)=>{res.status=status;res.data=data},rateLimit:()=>true,otherBusy:()=>false,notify:()=>{},setTimer:fn=>{const t={fn,active:true,unref(){}};activeTimers.push(t);return t;},clearTimer:t=>t.active=false});
async function req(who,path,body){
 user=who;const res={};
 await engine.handle({method:body===undefined?'GET':'POST',body},res,{pathname:'/api/royalcards'+path,searchParams:{get:()=>null}});
 return res;
}
(async()=>{
 const created=await req(p1,'/create',{game:'onecard',mode:'multi',max:3});
 assert.equal(created.status,201);
 const id=created.data.room.id;
 assert.equal(created.data.room.players.length,1);
 let denied=await req(p2,'/'+id,undefined);
 assert.equal(denied.status,403); // unauthorized room state should never leak private cards
 const joined=await req(p2,'/'+id+'/join',{});
 assert.equal(joined.status,200);
 const w1=await req(p1,'/'+id,undefined);
 assert.equal(w1.data.room.hand.length,0);
 await req(p1,'/'+id+'/ready',{ready:true});
 await req(p2,'/'+id+'/ready',{ready:true});
 const start=await req(p1,'/'+id+'/start',{});
 assert.equal(start.status,200);
 assert.equal(start.data.room.hand.length,7);
 const oppView=await req(p2,'/'+id,undefined);
 assert.equal(oppView.status,200);
 assert.equal(oppView.data.room.hand.length,7);
 assert.equal(oppView.data.room.players[0].cardCount,7);
 assert.equal(Object.keys(oppView.data.room.players[0]).includes('hand'),false);
 const wrong=await req(p2,'/'+id+'/draw',{});
 assert.equal(wrong.status,400);
 const replay=await req(p1,'/'+id+'/draw',{});
 assert.equal(replay.status,200);
 assert.equal(replay.data.room.turnId,p2.id);
 assert.equal((await req(p1,'/'+id+'/draw',{})).status,400);
 assert.equal((await req(p1,'/create',{game:'hula',mode:'ai'})).status,400);
 const leave=await req(p1,'/'+id+'/leave',{});
 assert.equal(leave.status,200);
 const solo=await req(p1,'/create',{game:'hula',mode:'ai'});
 assert.equal(solo.status,201);
 const rh=solo.data.room,hid=rh.id;
 assert.equal(rh.game,'hula');assert.equal(rh.players.length,2);assert.equal(rh.hand.length,7);
 assert.equal((await req(p1,'/'+hid+'/meld',{cards:['S1','S2','S3']})).status,400);
 assert.equal((await req(p1,'/'+hid+'/attach',{card:rh.hand[0],index:0})).status,400);
 const afterTake=await req(p1,'/'+hid+'/take',{source:'stock'});
 assert.equal(afterTake.status,200);
 assert.equal(afterTake.data.room.hand.length,8);
 assert.equal(afterTake.data.room.drew,true);
 assert.ok(Array.isArray(afterTake.data.room.allowedMelds),'검증된 등록 조합');
 assert.ok(Array.isArray(afterTake.data.room.allowedAttachments),'검증된 붙이기 카드');
 assert.equal((await req(p1,'/'+hid+'/take',{source:'stock'})).status,400);
 const afterDiscard=await req(p1,'/'+hid+'/discard',{card:afterTake.data.room.hand[0]});
 assert.equal(afterDiscard.status,200);assert.equal(afterDiscard.data.room.players[1].bot,true);
 assert.ok(['playing','thank'].includes(afterDiscard.data.room.phase));
 // Server-controlled bot may call THANK YOU before its normal turn.
 let next;
 for(let i=0;i<6;i++){
  next=await req(p1,'/'+hid,undefined);
  assert.equal(next.status,200);
  if(next.data.room.phase==='done'||next.data.room.phase==='playing'&&next.data.room.turnId===p1.id)break;
  const timer=activeTimers.find(t=>t.active);
  assert.ok(timer, 'bot must always be scheduled');
  timer.active=false;timer.fn();
 }
 assert.ok(['playing','done'].includes(next.data.room.phase));
 if(next.data.room.phase==='playing')assert.equal(next.data.room.turnId,p1.id);
 assert.equal((await req(p2,'/'+hid,undefined)).status,403);
 const gameMode=await req(p1,'',undefined);
 assert.equal(gameMode.status,200);
 assert.ok(gameMode.data.room);

 // Real out-of-turn Hula reaction: another player claims a discard without being the active player.
 let seeded=1,clock=100000,turnUser=p1,issued=0;
 const reactionTimers=[];
 const seededCrypto={randomBytes:()=>({toString:()=>String(++issued).padStart(14,'0')}),randomInt(n){seeded=(Math.imul(seeded,1664525)+1013904223)>>>0;return seeded%n}};
 const reaction=factory({db,crypto:seededCrypto,requireAuth:()=>turnUser,readBody:async r=>r.body||{},json:(r,status,data)=>{r.status=status;r.data=data},
   rateLimit:()=>true,otherBusy:()=>false,notify:()=>{},now:()=>clock,
   setTimer:fn=>{const t={fn,active:true,unref(){}};reactionTimers.push(t);return t;},clearTimer:t=>t.active=false});
 async function reactAs(who,path,body){
  turnUser=who;const res={};
  await reaction.handle({method:body===undefined?'GET':'POST',body},res,{pathname:'/api/royalcards'+path,searchParams:{get:()=>null}});
  return res;
 }
 const hulaRoom=(await reactAs(p1,'/create',{game:'hula',mode:'multi',max:2})).data.room;
 await reactAs(p2,'/'+hulaRoom.id+'/join',{});
 await reactAs(p1,'/'+hulaRoom.id+'/ready',{ready:true});
 await reactAs(p2,'/'+hulaRoom.id+'/ready',{ready:true});
 const hulaStart=(await reactAs(p1,'/'+hulaRoom.id+'/start',{})).data.room;
 const other=(await reactAs(p2,'/'+hulaRoom.id)).data.room;
 const thankCard=hulaStart.hand.find(c=>findThank(other.hand,c));
 assert.ok(thankCard,'deterministic seed must offer a legitimate Hula THANK YOU opportunity');
 assert.equal((await reactAs(p1,'/'+hulaRoom.id+'/take',{source:'stock'})).status,200);
 const discarded=await reactAs(p1,'/'+hulaRoom.id+'/discard',{card:thankCard});
 assert.equal(discarded.status,200);
 assert.equal(discarded.data.room.phase,'thank');
 const offer=(await reactAs(p2,'/'+hulaRoom.id)).data.room;
 assert.equal(offer.canThank,true);
 assert.equal((await reactAs(p1,'/'+hulaRoom.id+'/thank',{})).status,400,'discarder cannot steal own discard');
 const claim=await reactAs(p2,'/'+hulaRoom.id+'/thank',{});
 assert.equal(claim.status,200);
 assert.equal(claim.data.room.turnId,p2.id);
 assert.equal(claim.data.room.drew,true);
 assert.equal(claim.data.room.phase,'playing');
 assert.equal((await reactAs(p2,'/'+hulaRoom.id+'/take',{source:'discard'})).status,400,'discard must be claimed only during reaction window');
 assert.equal((await reactAs(p2,'/'+hulaRoom.id+'/discard',{card:claim.data.room.hand[0]})).status,200);
 // The game NEVER needs to update users, sessions, wallet or historical ledger.
 const forbiddenUpdates=['UPDATE users','INSERT INTO users','UPDATE room_escrow','DELETE FROM users','walletChange'];
 const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../royal-cards-server.js'),'utf8');
 for(const word of forbiddenUpdates)assert.ok(!src.includes(word),'Royal cards must be independent from real user wallets: '+word);

 console.log('ROYAL_CARDS_OK: auth/privacy, 2-player multi, AI Hula, 54/52 decks, off-turn THANK YOU, stats without wallet changes');
})().catch(e=>{console.error(e);process.exitCode=1});
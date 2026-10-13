'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const createLiar=require('../liar-server');
function harness(){
 const values=new Map(),users=Object.fromEntries(Array.from({length:12},(_,i)=>[i+1,{id:i+1,nickname:'Player'+(i+1)}]));
 let clock=1000000;
 const db={prepare(sql){return{
  get:key=>sql.includes('SELECT value FROM game_state')?(values.has(key)?{value:values.get(key)}:null):{nickname:users[key]?.nickname||'회원'},
  all:()=>[...values].map(([key,value])=>({key,value})),
  run:(key,value)=>values.set(key,value)
 };}};
 const game=createLiar({db,crypto,now:()=>clock,readBody:async req=>req.body||{},requireAuth:req=>req.user,
  json:(res,status,data)=>{res.status=status;res.data=data;},rateLimit:()=>true,notify:()=>{},
  setTimer:()=>({unref(){}}),clearTimer:()=>{}});
 async function call(id,method,path,body={}){const res={};await game.handle({user:users[id],method,body},res,{pathname:path});return res;}
 return {call,game,advance:ms=>clock+=ms};
}
async function startRoom(h,ids=[1,2,3,4],config={}){
 const {call}=h;let r=await call(ids[0],'POST','/api/liar/create',{name:'라이어 테스트',clueRounds:1,category:'음식',...config});
 assert.equal(r.status,201);const base='/api/liar/'+r.data.room.id;
 for(const id of ids.slice(1))assert.equal((await call(id,'POST',base+'/join')).status,200);
 for(const id of ids)assert.equal((await call(id,'POST',base+'/ready',{ready:true})).status,200);
 r=await call(ids[0],'POST',base+'/start');
 assert.equal(r.status,200);
 return base;
}
async function testFlexibleReadyCount(){
 const h=harness(),{call}=h;
 const made=await call(1,'POST','/api/liar/create',{max:10,clueRounds:1});
 const base='/api/liar/'+made.data.room.id;
 for(const id of [2,3,4,5])assert.equal((await call(id,'POST',base+'/join')).status,200);
 for(const id of [1,2])assert.equal((await call(id,'POST',base+'/ready',{ready:true})).status,200);
 assert.equal((await call(1,'POST',base+'/start')).status,409,'two ready people cannot start');
 assert.equal((await call(3,'POST',base+'/ready',{ready:true})).status,200);
 const r=await call(1,'POST',base+'/start');
 assert.equal(r.status,200,'three ready people start in a room with ten places');
 assert.deepEqual(r.data.room.players.map(x=>x.id),[1,2,3],'only ready participants start');
 assert.equal((await call(4,'GET',base)).status,403,'unready players cannot see secrets');
 assert.equal((await call(5,'GET','/api/liar')).data.room,null,'excluded users are not stuck in old room');
 assert.equal((await call(4,'POST','/api/liar/create',{max:10})).status,201,'unready player can play elsewhere');
 h.game.close();
 const five=harness(),fiveRoom=await startRoom(five,[1,2,3,4,5],{max:10});
 assert.equal((await five.call(1,'GET',fiveRoom)).data.room.players.length,5,'five ready can start');
 five.game.close();
 const ten=harness(),tenRoom=await startRoom(ten,[1,2,3,4,5,6,7,8,9,10],{max:10});
 assert.equal((await ten.call(1,'GET',tenRoom)).data.room.players.length,10,'full 10 player match works');
 ten.game.close();
 const host=harness(),made2=await host.call(1,'POST','/api/liar/create',{max:10}),base2='/api/liar/'+made2.data.room.id;
 for(const id of [2,3,4]){await host.call(id,'POST',base2+'/join');await host.call(id,'POST',base2+'/ready',{ready:true});}
 assert.equal((await host.call(1,'POST',base2+'/start')).status,409,'host must press ready');
 host.game.close();
}
async function testRolesAndGame(){
 const h=harness(),{call}=h,base=await startRoom(h);
 const views=await Promise.all([1,2,3,4].map(id=>call(id,'GET',base)));
 const spies=views.filter(x=>x.data.room.role==='liar');
 assert.equal(spies.length,1,'exactly one liar');
 assert.equal(spies[0].data.room.secret,null,'liar must not receive word');
 const liar=spies[0].data.room.selfId;
 const citizens=views.filter(x=>x.data.room.role==='citizen');
 assert.equal(new Set(citizens.map(x=>x.data.room.secret)).size,1);
 const word=citizens[0].data.room.secret;
 assert.ok(word.length>0);
 assert.ok(views.every(x=>x.data.room.liarId===null),'liar identity must not leak');
 assert.equal((await call(5,'GET',base)).status,403,'spectators cannot inspect active room');
 assert.equal((await call(5,'POST',base+'/join')).status,409,'late joins blocked');
 let r=views[0].data.room;
 const notTurn=[1,2,3,4].find(id=>id!==r.turnId);
 assert.equal((await call(notTurn,'POST',base+'/clue',{text:'도전 힌트'})).status,409);
 assert.equal((await call(r.turnId,'POST',base+'/clue',{text:word})).status,409,'secret must not be spoken as clue');
 for(let n=0;n<4;n++){
  r=(await call(1,'GET',base)).data.room;
  assert.equal(r.phase,'clue');
  assert.equal((await call(r.turnId,'POST',base+'/clue',{text:'적절한 힌트 '+n})).status,200);
 }
 r=(await call(1,'GET',base)).data.room;assert.equal(r.phase,'discussion');
 assert.equal((await call(2,'POST',base+'/chat',{text:word})).status,409,'cannot leak secret in chat');
 assert.equal((await call(2,'POST',base+'/chat',{text:'첫 번째 힌트 수상한데요?'})).status,200);
 assert.equal((await call(2,'POST',base+'/discussion-end')).status,409,'only host can advance');
 assert.equal((await call(1,'POST',base+'/discussion-end')).status,200);
 assert.equal((await call(1,'POST',base+'/vote',{targetId:1})).status,409,'self-vote forbidden');
 for(let id=1;id<=4;id++){
  const targetId=id===liar?(liar===1?2:1):liar;
  const vote=await call(id,'POST',base+'/vote',{targetId});
  assert.equal(vote.status,200);
 }
 r=(await call(liar,'GET',base)).data.room;assert.equal(r.phase,'guess');
 assert.equal((await call(1,'POST',base+'/guess',{text:word})).status,liar===1?200:409,'only liar can guess');
 if(liar!==1)assert.equal((await call(liar,'POST',base+'/guess',{text:word})).status,200);
 r=(await call(1,'GET',base)).data.room;
 assert.equal(r.winner,'liar');
 assert.equal(r.liarId,liar,'liar revealed only after game');
 assert.equal((await call(liar,'GET','/api/liar')).data.stats.liarWins,1);
 assert.equal((await call(1,'POST',base+'/next')).status,200);
 for(let id=1;id<=4;id++)assert.equal((await call(id,'POST',base+'/ready',{ready:true})).status,200);
 r=(await call(1,'POST',base+'/start')).data.room;
 for(let n=0;n<4;n++){r=(await call(1,'GET',base)).data.room;await call(r.turnId,'POST',base+'/clue',{text:'참고 힌트 '+n});}
 await call(1,'POST',base+'/discussion-end');
 const again=await Promise.all([1,2,3,4].map(id=>call(id,'GET',base)));
 const secondLiar=again.find(x=>x.data.room.role==='liar').data.room.selfId;
 for(let id=1;id<=4;id++)await call(id,'POST',base+'/vote',{targetId:id===secondLiar?(id===1?2:1):secondLiar});
 r=(await call(1,'GET',base)).data.room;assert.equal(r.phase,'guess');
 await call(secondLiar,'POST',base+'/guess',{text:'어떤 단어도 아닌 잘못된 정답'});
 r=(await call(1,'GET',base)).data.room;assert.equal(r.winner,'citizens');
 const stats=(await call(1,'GET','/api/liar')).data.stats;assert.equal(stats.games,2);
 gameCleanup(h);
}
function gameCleanup(h){h.game.close();}
async function testTimeoutAndPrivacy(){
 const h=harness(),{call,advance}=h,base=await startRoom(h,[1,2,3],{private:true});
 assert.ok(!(await call(5,'GET','/api/liar')).data.rooms.some(x=>x.id===base.split('/').pop()),'private room hidden');
 let r=(await call(1,'GET',base)).data.room;
 advance(46000);r=(await call(1,'GET',base)).data.room;
 assert.equal(r.clues.length,1,'clue auto skipped on timeout');
 assert.equal(r.clues[0].skipped,true);
 while(r.phase==='clue'){await call(r.turnId,'POST',base+'/clue',{text:'두 글자 힌트'});r=(await call(1,'GET',base)).data.room;}
 assert.equal(r.phase,'discussion');
 advance(71000);r=(await call(1,'GET',base)).data.room;assert.equal(r.phase,'vote','discussion auto advance');
 advance(46000);r=(await call(1,'GET',base)).data.room;assert.equal(r.phase,'complete');
 assert.equal(r.winner,'liar','no votes => liar escapes');
 h.game.close();
}
(async()=>{await testRolesAndGame();await testTimeoutAndPrivacy();await testFlexibleReadyCount();console.log('LIAR GAME PASS: roles, privacy, clues, voting, final guess, rematch, timers, stats, flexible ready count');})().catch(e=>{console.error(e);process.exitCode=1;});

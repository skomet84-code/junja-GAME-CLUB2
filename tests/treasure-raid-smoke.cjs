'use strict';
const assert=require('node:assert/strict');
const createTreasureRaid=require('../treasure-raid-server');

const START=500_000_000;
const users=new Map([
  [1,{id:1,nickname:'준자',avatar:0,balance:START}],
  [2,{id:2,nickname:'행운이',avatar:1,balance:START}],
  [3,{id:3,nickname:'더블클릭',avatar:2,balance:START}],
  [4,{id:4,nickname:'잠수맨',avatar:3,balance:START}],
]);
const escrows=new Map();
let ints=[];
let clock=1_000_000;
const crypto={
  randomBytes(){return Buffer.from([0xAB,0xCD]);},
  randomInt(n){const v=ints.length?ints.shift():50;return Math.max(0,Math.min(n-1,v));}
};
const now=()=>clock;
const advance=ms=>{clock+=ms};
function publicUser(id){const u=users.get(Number(id));return u?{...u,cosmetics:{},rank:{}}:null}
function walletChange(id,amt){
  const u=users.get(Number(id));if(!u)throw Error('missing user');
  if(u.balance+amt<0)throw Error('게임머니가 부족합니다.');
  u.balance+=amt;return u.balance;
}
function escrowSet(room,id,amt,game){escrows.set(`${room}:${id}`,{amount:amt,game})}
function escrowDelete(room,id){escrows.delete(`${room}:${id}`)}
function makeRes(){return {code:null,data:null}}
function json(res,code,data){res.code=code;res.data=data;return data}
function req(userId,method,body,delay=0){return {userId,method,body,delay}}
async function readBody(r){if(r.delay)await new Promise(x=>setTimeout(x,r.delay));return r.body||{}}
function requireAuth(r,res){const u=publicUser(r.userId);if(!u){json(res,401,{error:'auth'});return null}return u}
const raid=createTreasureRaid({
  crypto,now,readBody,requireAuth,json,walletChange,userPublic:publicUser,
  escrowSet,escrowDelete,pushRefresh(){},formatMoney:n=>String(n),
  rateLimit(){return true},isUserBusy(){return false}
});
async function call(userId,method,path,body={},delay=0){
  const res=makeRes();
  await raid.handle(req(userId,method,body,delay),res,new URL('http://test'+path));
  return res;
}

(async()=>{
  // 1P room can start without another player and returns secured money on manual quit.
  const solo=await call(3,'POST','/api/treasure-raid/rooms',{entry:1_000_000,maxPlayers:1});
  assert.equal(solo.code,201);
  assert.equal(users.get(3).balance,START-1_000_000);
  const soloId=solo.data.room.id;
  const soloStart=await call(3,'POST',`/api/treasure-raid/rooms/${soloId}/start`);
  assert.equal(soloStart.code,200);
  assert.equal(soloStart.data.room.players[0].status,'choosing');
  assert.equal((await call(3,'POST',`/api/treasure-raid/rooms/${soloId}/leave`)).code,200);
  assert.equal(users.get(3).balance,START);

  // Concurrent room creation must charge only once.
  const [a,b]=await Promise.all([
    call(3,'POST','/api/treasure-raid/rooms',{entry:1_000_000,maxPlayers:2},10),
    call(3,'POST','/api/treasure-raid/rooms',{entry:1_000_000,maxPlayers:2},10),
  ]);
  assert.deepEqual([a.code,b.code].sort(),[201,409]);
  assert.equal(users.get(3).balance,START-1_000_000);
  const duplicateRoom=(a.code===201?a.data:b.data).room;
  await call(3,'POST',`/api/treasure-raid/rooms/${duplicateRoom.id}/leave`);
  assert.equal(users.get(3).balance,START);

  // Multiplayer participants may choose different stakes.
  const c=await call(1,'POST','/api/treasure-raid/rooms',{entry:1_000_000,maxPlayers:4});
  assert.equal(c.code,201);
  const id=c.data.room.id;
  const j=await call(2,'POST',`/api/treasure-raid/rooms/${id}/join`,{entry:10_000_000});
  assert.equal(j.code,200);
  assert.equal(j.data.room.players.find(x=>x.userId===1).entry,1_000_000);
  assert.equal(j.data.room.players.find(x=>x.userId===2).entry,10_000_000);
  assert.equal(users.get(1).balance,START-1_000_000);
  assert.equal(users.get(2).balance,START-10_000_000);

  await call(1,'POST',`/api/treasure-raid/rooms/${id}/ready`);
  await call(2,'POST',`/api/treasure-raid/rooms/${id}/ready`);
  const started=await call(1,'POST',`/api/treasure-raid/rooms/${id}/start`);
  assert.equal(started.code,200);
  assert.equal(started.data.room.choiceMs,30_000);

  // Double tap must apply only once.
  ints=[70,70];
  const [p1,p2]=await Promise.all([
    call(1,'POST',`/api/treasure-raid/rooms/${id}/pick`,{chest:1},10),
    call(1,'POST',`/api/treasure-raid/rooms/${id}/pick`,{chest:2},10),
  ]);
  assert.deepEqual([p1.code,p2.code].sort(),[200,409]);
  const accepted=p1.code===200?p1:p2;
  const u1=accepted.data.room.players.find(x=>x.userId===1);
  assert.equal(u1.bank,2_000_000);
  assert.equal(escrows.get(`${id}:1`).amount,2_000_000);

  // Other players are independent; a sleeping player auto-cashes out after 30 seconds.
  ints=[50];
  const pUser2=await call(2,'POST',`/api/treasure-raid/rooms/${id}/pick`,{chest:4});
  assert.equal(pUser2.code,200);
  assert.equal(pUser2.data.room.players.find(x=>x.userId===2).bank,10_000_000);
  advance(31_000);
  raid.sweepNow();
  const afterTimeout=await call(1,'GET',`/api/treasure-raid/rooms/${id}`);
  const timed1=afterTimeout.data.room.players.find(x=>x.userId===1);
  const timed2=afterTimeout.data.room.players.find(x=>x.userId===2);
  assert.equal(timed1.status,'escaped');
  assert.equal(timed2.status,'escaped');
  assert.equal(users.get(1).balance,START+1_000_000);
  assert.equal(users.get(2).balance,START);
  assert.equal(afterTimeout.data.room.phase,'complete');

  // Finished multiplayer room can immediately ready up and replay without leaving/recreating.
  const replayReady1=await call(1,'POST',`/api/treasure-raid/rooms/${id}/ready`);
  assert.equal(replayReady1.code,200);
  assert.equal(replayReady1.data.room.phase,'waiting');
  assert.equal(replayReady1.data.room.players.find(x=>x.userId===1).ready,true);
  assert.equal(users.get(1).balance,START+1_000_000);
  const replayReady2=await call(2,'POST',`/api/treasure-raid/rooms/${id}/ready`);
  assert.equal(replayReady2.code,200);
  const replayStart=await call(1,'POST',`/api/treasure-raid/rooms/${id}/start`);
  assert.equal(replayStart.code,200);
  assert.equal(replayStart.data.room.phase,'playing');
  assert.equal(users.get(1).balance,START);
  assert.equal(users.get(2).balance,START-10_000_000);
  assert.equal(replayStart.data.room.players.find(x=>x.userId===1).entry,1_000_000);
  assert.equal(replayStart.data.room.players.find(x=>x.userId===2).entry,10_000_000);

  await call(1,'POST',`/api/treasure-raid/rooms/${id}/leave`);
  await call(2,'POST',`/api/treasure-raid/rooms/${id}/leave`);
  assert.equal(users.get(1).balance,START+1_000_000);
  assert.equal(users.get(2).balance,START);

  // Host can start with ready players and refund/remove AFK unready players.
  const f1=await call(1,'POST','/api/treasure-raid/rooms',{entry:1_000_000,maxPlayers:3});
  const fid=f1.data.room.id;
  await call(4,'POST',`/api/treasure-raid/rooms/${fid}/join`,{entry:100_000_000});
  await call(1,'POST',`/api/treasure-raid/rooms/${fid}/ready`);
  const blocked=await call(1,'POST',`/api/treasure-raid/rooms/${fid}/start`);
  assert.equal(blocked.code,409);
  const forced=await call(1,'POST',`/api/treasure-raid/rooms/${fid}/start`,{force:true});
  assert.equal(forced.code,200);
  assert.equal(forced.data.room.players.length,1);
  assert.equal(users.get(4).balance,START);
  await call(1,'POST',`/api/treasure-raid/rooms/${fid}/leave`);

  console.log('TREASURE_RAID_TESTS_OK');
})().catch(err=>{console.error(err);process.exitCode=1});

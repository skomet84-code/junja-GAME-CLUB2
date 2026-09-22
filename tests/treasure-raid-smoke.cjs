'use strict';
const assert=require('node:assert/strict');
const createTreasureRaid=require('../treasure-raid-server');

const users=new Map([
  [1,{id:1,nickname:'준자',avatar:0,balance:1_000_000}],
  [2,{id:2,nickname:'행운이',avatar:1,balance:1_000_000}],
  [3,{id:3,nickname:'더블클릭',avatar:2,balance:1_000_000}],
]);
const escrows=new Map();
let ints=[];
const crypto={
  randomBytes(){return Buffer.from([0xAB,0xCD]);},
  randomInt(n){const v=ints.length?ints.shift():50;return Math.max(0,Math.min(n-1,v));}
};
const now=(()=>{let t=1000;return()=>++t})();
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
  // Concurrent room creation must charge only once.
  const [a,b]=await Promise.all([
    call(3,'POST','/api/treasure-raid/rooms',{entry:10000,maxPlayers:2},10),
    call(3,'POST','/api/treasure-raid/rooms',{entry:10000,maxPlayers:2},10),
  ]);
  assert.deepEqual([a.code,b.code].sort(),[201,409]);
  assert.equal(users.get(3).balance,990000);
  assert.equal(raid.roomCount(),1);
  const created=(a.code===201?a.data:b.data).room;
  await call(3,'POST',`/api/treasure-raid/rooms/${created.id}/leave`);
  assert.equal(users.get(3).balance,1_000_000);

  // Shared JUNJA wallet + room escrow flow.
  const c=await call(1,'POST','/api/treasure-raid/rooms',{entry:10000,maxPlayers:2});
  assert.equal(c.code,201);
  const id=c.data.room.id;
  assert.equal(users.get(1).balance,990000);
  const j=await call(2,'POST',`/api/treasure-raid/rooms/${id}/join`);
  assert.equal(j.code,200);
  assert.equal(users.get(2).balance,990000);
  await call(1,'POST',`/api/treasure-raid/rooms/${id}/ready`);
  await call(2,'POST',`/api/treasure-raid/rooms/${id}/ready`);
  assert.equal((await call(1,'POST',`/api/treasure-raid/rooms/${id}/start`)).code,200);

  // Successful reward must update restart-recovery escrow to the secured bank.
  ints=[70];
  const pick=await call(1,'POST',`/api/treasure-raid/rooms/${id}/pick`,{chest:1});
  assert.equal(pick.code,200);
  const p1=pick.data.room.players.find(x=>x.userId===1);
  assert.equal(p1.bank,20000);
  assert.equal(escrows.get(`${id}:1`).amount,20000);

  // Concurrent double-tap must apply one chest result only.
  await call(1,'POST',`/api/treasure-raid/rooms/${id}/continue`);
  ints=[50,70];
  const [p2a,p2b]=await Promise.all([
    call(2,'POST',`/api/treasure-raid/rooms/${id}/pick`,{chest:2},10),
    call(2,'POST',`/api/treasure-raid/rooms/${id}/pick`,{chest:3},10),
  ]);
  assert.deepEqual([p2a.code,p2b.code].sort(),[200,409]);
  const accepted=p2a.code===200?p2a:p2b;
  const p2=accepted.data.room.players.find(x=>x.userId===2);
  assert.equal(p2.round,1);
  assert.equal(p2.bank,10000);

  // Cashout returns exactly the secured amount to the normal JUNJA wallet.
  const out=await call(2,'POST',`/api/treasure-raid/rooms/${id}/cashout`);
  assert.equal(out.code,200);
  assert.equal(users.get(2).balance,1_000_000);
  assert.equal(escrows.has(`${id}:2`),false);

  console.log('TREASURE_RAID_TESTS_OK');
})().catch(err=>{console.error(err);process.exitCode=1});

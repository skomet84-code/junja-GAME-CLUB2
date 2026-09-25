'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('public/app.js','utf8');
const start=source.indexOf('let roomRefreshPending=false;');
const end=source.indexOf('function notifyRoomJoins',start);
assert(start>=0&&end>start);
let replies=[],renders=[],reads=0;
const ctx={currentRoomId:'A',currentGame:'holdem',roomRefreshBusy:false,lastRoomVersion:1,
  api:()=>{reads++;return new Promise(resolve=>replies.push(resolve));},
  renderRoom:r=>{renders.push(r.version);},refreshMe:async()=>{},toast:()=>{},
  stopRoomPolling:()=>{},loadRooms:()=>{},$:()=>null};
vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  const first=ctx.loadCurrentRoom(true);
  await ctx.loadCurrentRoom(true);
  await ctx.loadCurrentRoom(true);
  assert.equal(reads,1,'concurrent room reads must coalesce');
  replies.shift()({room:{version:2}});await first;await flush();
  assert.equal(reads,2,'an event during a request must receive one trailing read');
  replies.shift()({room:{version:3}});await flush();
  assert.deepEqual(renders,[2,3]);
  const stale=ctx.loadCurrentRoom(true);ctx.lastRoomVersion=5;
  replies.shift()({room:{version:4}});await stale;
  assert.deepEqual(renders,[2,3],'old GET cannot overwrite newer action response');
  const departed=ctx.loadCurrentRoom(true);ctx.currentRoomId='B';
  replies.shift()({room:{version:6}});await departed;
  assert.deepEqual(renders,[2,3],'departed room cannot redraw current room');
  assert.match(source,/if\(currentRoomId&&currentView===currentGame\)\{await loadCurrentRoom\(true\);return;\}/);
  console.log('HOLDEM_REFRESH_RACE_TESTS_OK');
})().catch(e=>{console.error(e);process.exitCode=1;});

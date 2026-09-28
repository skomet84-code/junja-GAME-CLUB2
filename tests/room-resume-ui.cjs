'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const source=app.slice(app.indexOf('async function resumeMyRoom(){'),app.indexOf('function roomParticipantChips'));
(async()=>{
  let room={id:'A',game:'holdem',name:'test'},rendered=null,entered=null,message='';
  const nodes=new Map();
  function node(key){if(!nodes.has(key)){const classes=new Set(key.includes('MultiArea')?['hidden']:[]);nodes.set(key,{classes,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}})}return nodes.get(key)}
  const ctx={api:async()=>({room}),currentRoomId:null,currentGame:null,currentView:'holdem',lastRoomVersion:0,
    $:node,$$:()=>[],window:{scrollTo(){},JunjaTreasureRaid:{leaveView(){}}},
    renderRoom:r=>rendered=r,startRoomPolling(){},stopRoomPolling(){},startLiveFloor(){},LIVE_GAME_VIEWS:new Set(),
    go:async view=>entered=view,toast:m=>message=m,finishRoomExit:()=>{ctx.currentRoomId=null}};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  await ctx.resumeMyRoom();
  assert.equal(rendered.id,'A');assert.equal(node('#holdemMultiArea').classes.has('hidden'),false);
  assert.equal(node('#holdemSoloArea').classes.has('hidden'),true);
  room={id:'T',game:'treasure',name:'원정대'};await ctx.resumeMyRoom();
  assert.equal(entered,'treasure');assert.equal(ctx.currentRoomId,null);
  ctx.api=async()=>{throw Error('offline')};await ctx.resumeMyRoom();assert.match(message,/offline/);
  console.log('ROOM_RESUME_UI_TESTS_OK');
})().catch(e=>{console.error(e);process.exitCode=1});

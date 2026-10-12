'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const createOmok=require('../omok-server');
(async()=>{
 const values=new Map(),db={prepare(sql){return {
  get:key=>sql.includes('SELECT value FROM game_state')?(values.has(key)?{value:values.get(key)}:null):{nickname:'테스터'},
  all:()=>[...values].map(([key,value])=>({key,value})),
  run:(key,value)=>{values.set(key,value);return {};}
 };}};
 const game=createOmok({db,crypto,readBody:async req=>req.body||{},requireAuth:req=>req.user,
  json:(res,status,data)=>{res.status=status;res.data=data;},rateLimit:()=>true,
  aiDecide:async(board,color)=>color===1?{x:7,y:7}:{x:8,y:7},
  setTimer:()=>({unref(){}}),clearTimer:()=>{}});
 const call=async(method,path,body={})=>{
  const res={};await game.handle({user:{id:9,nickname:'극한도전자'},method,body},res,{pathname:path});return res;
 };
 const poll=async(id,color)=>{
  for(let i=0;i<90;i++){const r=await call('GET','/api/omok/'+id);if(!r.data.room.aiThinking&&r.data.room.turn===color)return r.data.room;
   await new Promise(ok=>setTimeout(ok,10));}
  throw Error('AI did not respond');
 };
 let r=await call('POST','/api/omok/create-ai');
 assert.equal(r.status,201,'AI room created');
 let room=r.data.room;
 assert.equal(room.aiMode,true);
 assert.equal(room.players.length,2);
 assert.equal(room.myColor,1);
 const id=room.id,url='/api/omok/'+id;
 assert.equal((await call('POST',url+'/move',{x:6,y:7})).status,409,'opening rule');
 r=await call('POST',url+'/move',{x:7,y:7});
 assert.equal(r.status,200);
 room=await poll(id,1);
 assert.equal(room.board[7][7],1);
 assert.equal(room.board[7][8],2);
 assert.equal(room.moves,2,'AI took its turn without browser authority');
 assert.equal((await call('POST','/api/omok/create-ai')).status,409,'one room/account');
 r=await call('POST',url+'/resign');
 assert.equal(r.data.room.winner,0,'AI wins by human surrender');
 let home=await call('GET','/api/omok');
 assert.equal(home.data.aiStats.losses,1,'solo record increments');
 assert.equal(home.data.stats.games,0,'PvP leaderboard unchanged');
 r=await call('POST',url+'/rematch');
 assert.equal(r.data.room.round,2);
 assert.equal(r.data.room.myColor,2,'color swap');
 room=await poll(id,2);
 assert.equal(room.board[7][7],1,'AI black starts at center');
 assert.equal(room.turn,2,'human white turn');
 r=await call('POST',url+'/leave');
 assert.equal(r.status,200);
 home=await call('GET','/api/omok');
 assert.equal(home.data.room,null,'solo room leaves cleanly');
 assert.equal(home.data.aiStats.losses,2);
 game.close();
 console.log('OMOK_AI_ROOM_OK: immediate start, AI move, isolated record, rematch colors, leave');
})().catch(err=>{console.error(err);process.exitCode=1;});

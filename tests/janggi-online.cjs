'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const R=require('../public/janggi/engine.js');
const create=require('../janggi-server.js');
const piece=(s,t)=>({s,t});
function mateBoard(){
 const b=Array.from({length:10},()=>Array(9).fill(null));
 b[1][4]=piece('h','king');b[8][4]=piece('c','king');
 b[3][3]=piece('c','rook');b[3][5]=piece('c','rook');b[5][4]=piece('c','rook');
 return b;
}
function harness(override){
 const users=Object.fromEntries([1,2,3].map(id=>[id,{id,nickname:'Player'+id}]));
 const state=new Map(),credited=[],alerts=[];let clock=1000000;
 const db={prepare(sql){return{
   get:key=>state.has(key)?{value:state.get(key)}:null,
   run:(key,value)=>{state.set(key,value);return{};}
 };}};
 const game=create({db,crypto,now:()=>clock,readBody:async req=>req.body||{},requireAuth:req=>req.user,
  json:(res,status,data)=>{res.status=status;res.data=data;},rateLimit:()=>true,
  credit:(userId,amount,key)=>credited.push({userId,amount,key}),
  notify:(ids,roomId)=>alerts.push([ids,roomId]),aiDecide:(board,side)=>R.legal(board,side)[0],
  initialBoard:override?()=>override():null,
  setTimer:()=>({unref(){}}),clearTimer:()=>{}});
 const call=async(id,method,path,body={})=>{const res={};await game.handle({user:users[id],method,body},res,{pathname:path});return res;};
 return {call,game,credited,alerts,advance:ms=>clock+=ms};
}
async function multiplayer(){
 const {call,game,credited}=harness();
 const cr=await call(1,'POST','/api/janggi/create',{name:'두 사람 온라인 테스트',cFormation:'outer',hFormation:'left'});
 assert.equal(cr.status,201);const base='/api/janggi/'+cr.data.room.id;
 assert.equal((await call(1,'POST',base+'/start')).status,409,'must have remote opponent');
 assert.equal((await call(2,'POST',base+'/join')).status,200);
 assert.equal((await call(3,'POST',base+'/join')).status,409,'third member rejected');
 assert.equal((await call(3,'GET',base)).status,403,'non member cannot inspect game');
 assert.equal((await call(1,'POST',base+'/ready',{ready:true})).status,200);
 assert.equal((await call(2,'POST',base+'/ready',{ready:true})).status,200);
 const started=await call(1,'POST',base+'/start');
 assert.equal(started.status,200);
 assert.equal(started.data.room.players.length,2);
 assert.equal(started.data.room.phase,'playing');
 assert.equal(started.data.room.myTurn,true);
 assert.equal(started.data.room.board[9][1].t,'elephant','online PvP chosen CHO outer elephant');
 assert.equal(started.data.room.board[0][1].t,'elephant','online PvP chosen HAN left elephant');
 assert.equal((await call(2,'POST',base+'/move',{x:0,y:3,tx:0,ty:4})).status,409,'turn locked');
 assert.equal((await call(1,'POST',base+'/move',{x:0,y:6,tx:0,ty:5})).status,200,'player1 move accepted');
 assert.equal((await call(2,'POST',base+'/move',{x:0,y:3,tx:0,ty:4})).status,200,'player2 move accepted');
 const a=(await call(1,'GET',base)).data.room,b=(await call(2,'GET',base)).data.room;
 assert.deepEqual(a.board,b.board,'same board on both phones');
 assert.equal((await call(1,'POST',base+'/resign')).status,200);
 assert.equal(credited.length,0,'PvP winner does not earn AI prize');
 game.close();
}
async function aiAward(){
 const {call,game,credited}=harness(mateBoard);
 const board=mateBoard(),finishes=R.legal(board,'c').filter(m=>R.status(R.moved(board,m),'h').winner==='c');
 assert.ok(finishes.length,'test fixture must contain a real legal checkmate');
 let r=await call(1,'POST','/api/janggi/create-ai',{side:'c'});
 assert.equal(r.status,201);const base='/api/janggi/'+r.data.room.id;
 assert.equal(r.data.room.ai,true);
 assert.equal((await call(2,'POST',base+'/join')).status,409,'AI room must not accept another member');
 assert.equal((await call(2,'GET',base)).status,403,'no board visibility for strangers');
 const m=finishes[0];r=await call(1,'POST',base+'/move',{x:m.x,y:m.y,tx:m.tx,ty:m.ty});
 assert.equal(r.status,200,'real checkmate move accepted');
 assert.equal(r.data.room.phase,'complete');
 assert.equal(r.data.room.winner,1);
 assert.equal(r.data.room.payout,1000000000000);
 assert.equal(credited.length,1,'payout exactly once');
 assert.equal(credited[0].amount,1000000000000n);
 assert.ok(credited[0].key.startsWith('janggi:'),'stable request key');
 assert.equal((await call(1,'POST',base+'/move',{x:m.x,y:m.y,tx:m.tx,ty:m.ty})).status,409,'post-result move rejected');
 assert.equal(credited.length,1,'duplicate request cannot mint prize again');
 assert.equal((await call(1,'POST',base+'/rematch')).status,200,'AI rematch starts');
 assert.equal(credited.length,1,'rematch itself must not pay');
 assert.equal((await call(1,'POST',base+'/resign')).status,200);
 assert.equal(credited.length,1,'forfeiting never earns reward');
 assert.equal((await call(1,'POST',base+'/leave')).status,200);
 game.close();
}
async function onlineSetup(){
 const {call,game}=harness();
 const r=await call(1,'POST','/api/janggi/create-ai',{side:'c',cFormation:'right',hFormation:'outer'});
 assert.equal(r.status,201);
 assert.equal(r.data.room.mySide,'c');
 assert.equal(r.data.room.formations.cFormation,'right');
 assert.equal(r.data.room.formations.hFormation,'outer');
 assert.equal(r.data.room.board[9][1].t,'horse','AI match uses the chosen CHO right formation');
 assert.equal(r.data.room.board[0][1].t,'elephant','AI match uses the selected opponent formation');
 await call(1,'POST','/api/janggi/'+r.data.room.id+'/leave');
 game.close();
 const fs=require('node:fs'),path=require('node:path');
 const src=fs.readFileSync(path.join(__dirname,'../public/janggi/online.js'),'utf8');
 for(const k of ['aiSide','aiFormation','pvpCho','pvpHan'])assert.ok(src.includes("choiceButtons('"+k+"'"),'touch control missing: '+k);
 assert.ok(src.includes("cFormation:p.aiSide==='c'?p.aiFormation:'inner'"),'AI side formation must reach server');
 assert.ok(src.includes("cFormation:state.prefs.pvpCho"),'PvP CHO layout must reach server');
 assert.ok(src.includes("hFormation:state.prefs.pvpHan"),'PvP HAN layout must reach server');
 const html=fs.readFileSync(path.join(__dirname,'../public/janggi/online.html'),'utf8');
 assert.ok(html.includes('online.js?v=2'),'iOS script cache must be refreshed');
}
(async()=>{await multiplayer();await aiAward();await onlineSetup();console.log('JANGGI_ONLINE_OK: PvP, AI payout and all online opening formations with touch selector wiring');})().catch(e=>{console.error(e);process.exitCode=1;});

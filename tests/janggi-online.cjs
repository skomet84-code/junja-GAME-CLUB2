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
 const cr=await call(1,'POST','/api/janggi/create',{name:'두 사람 개별 포진',formation:'outer'});
 assert.equal(cr.status,201);const base='/api/janggi/'+cr.data.room.id;
 assert.equal(cr.data.room.players[0].formation,null,'host must choose formation inside the room too');
 assert.equal((await call(1,'POST',base+'/ready',{ready:true})).status,409,'host cannot ready before choosing');
 assert.equal((await call(1,'POST',base+'/start')).status,409,'opponent required');
 const joined=await call(2,'POST',base+'/join');
 assert.equal(joined.status,200);
 assert.equal(joined.data.room.players.find(p=>p.id===2).formation,null,'guest needs own selection');
 assert.equal((await call(2,'POST',base+'/ready',{ready:true})).status,409,'no ready without selection');
 assert.equal((await call(3,'POST',base+'/join')).status,409,'third player blocked');
 assert.equal((await call(3,'GET',base)).status,403,'stranger blocked');
 assert.equal((await call(2,'POST',base+'/formation',{formation:'oops'})).status,409,'bad opening rejected');
 assert.equal((await call(2,'POST',base+'/formation',{formation:'left'})).status,200);
 assert.equal((await call(1,'POST',base+'/formation',{formation:'outer'})).status,200);
 await call(1,'POST',base+'/ready',{ready:true});
 await call(2,'POST',base+'/ready',{ready:true});
 const changed=await call(2,'POST',base+'/formation',{formation:'right'});
 assert.equal(changed.data.room.players[1].ready,false,'changing opening un-readies only that player');
 await call(2,'POST',base+'/formation',{formation:'left'});
 assert.equal((await call(1,'POST',base+'/start')).status,409,'must ready again');
 await call(2,'POST',base+'/ready',{ready:true});
 const started=await call(1,'POST',base+'/start');
 assert.equal(started.status,200);
 assert.equal(started.data.room.mySide,'c');
 assert.equal(started.data.room.board[9][1].t,'elephant','host CHO outer from own view');
 assert.equal(started.data.room.board[0][1].t,'horse','HAN left maps to canonical right');
 assert.equal(started.data.room.board[0][7].t,'elephant','guest left side is left in guest view');
 assert.equal((await call(2,'POST',base+'/formation',{formation:'inner'})).status,409,'no formation edits mid-game');
 assert.equal((await call(2,'POST',base+'/move',{x:0,y:3,tx:0,ty:4})).status,409,'turn locked');
 assert.equal((await call(1,'POST',base+'/move',{x:0,y:6,tx:0,ty:5})).status,200);
 assert.equal((await call(2,'POST',base+'/move',{x:0,y:3,tx:0,ty:4})).status,200);
 const a=(await call(1,'GET',base)).data.room,b=(await call(2,'GET',base)).data.room;
 assert.deepEqual(a.board,b.board,'both devices see the same authoritative board');
 assert.equal(a.mySide,'c');assert.equal(b.mySide,'h');
 assert.equal((await call(1,'POST',base+'/resign')).status,200);
 assert.equal(credited.length,0,'PvP never pays AI reward');
 const rematch=await call(1,'POST',base+'/rematch');
 assert.equal(rematch.status,200);
 assert.equal(rematch.data.room.mySide,null,'waiting clears previous colors');
 assert.equal(rematch.data.room.players[0].formation,'outer');
 assert.equal(rematch.data.room.players[1].formation,'left');
 await call(1,'POST',base+'/ready',{ready:true});
 await call(2,'POST',base+'/ready',{ready:true});
 const next=await call(1,'POST',base+'/start');
 assert.equal(next.status,200);
 assert.equal(next.data.room.mySide,'h','next round reverses assigned sides');
 assert.equal(next.data.room.board[0][1].t,'elephant','host HAN outer retained');
 assert.equal(next.data.room.board[9][1].t,'elephant','guest CHO left retained');
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
 assert.deepEqual(R.viewPoint('h',0,9),{x:8,y:0},'HAN board turns 180 degrees');
 assert.deepEqual(R.viewPoint('c',0,9),{x:0,y:9},'CHO board remains stable');
 assert.equal(R.formationForView('h','left'),'right','HAN local left maps to canonical right');
 assert.equal(R.formationForView('h','right'),'left','HAN local right maps to canonical left');
 assert.equal(R.formationForView('c','left'),'left','CHO left unchanged');
 const fs=require('node:fs'),path=require('node:path');
 const src=fs.readFileSync(path.join(__dirname,'../public/janggi/online.js'),'utf8');
 for(const k of ['aiSide','aiFormation','roomFormation'])assert.ok(src.includes("choiceButtons('"+k+"'"),'touch control missing: '+k);
 assert.ok(src.includes("bottomSide==='h'?{x:R.W-1-x,y:R.H-1-y}:{x,y}"),'HAN screen rotates both axes while moves remain canonical');
 assert.ok(src.includes("dataset.perspective=bottomSide"),'client perspective must be explicit');
 assert.ok(src.includes("act('/create',{name:"),'host creates without imposing a formation');
 assert.ok(src.includes("'/formation',{formation:value}"),'each guest may choose via server');
 const html=fs.readFileSync(path.join(__dirname,'../public/janggi/online.html'),'utf8');
 assert.ok(html.includes('online.js?v=20261025-perspective-formation'),'new iOS asset version');
 for(const id of ['jgTopName','jgBottomName','jgFormationSetup'])assert.ok(html.includes('id="'+id+'"'),'missing UI element: '+id);
}
(async()=>{await multiplayer();await aiAward();await onlineSetup();console.log('JANGGI_ONLINE_OK: independent openings, both perspectives, rematch and AI payout');})().catch(e=>{console.error(e);process.exitCode=1;});

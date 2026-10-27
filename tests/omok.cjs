
'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const rules=require('../omok-engine');
const createOmok=require('../omok-server');
function mustBoard(stones){const b=rules.fresh();for(const [x,y,c] of stones)b[y][x]=c;return b;}
function checkRules(){
 let b=rules.fresh();
 assert.equal(rules.place(b,7,7,1).ok,true);
 assert.equal(rules.place(b,7,7,2).ok,false,'occupied intersection');
 b=mustBoard([[3,7,1],[4,7,1],[5,7,1],[6,7,1]]);
 assert.equal(rules.place(b,7,7,1).win,true,'black exact five');
 b=mustBoard([[3,7,1],[4,7,1],[5,7,1],[6,7,1],[7,7,1]]);
 assert.match(rules.place(b,8,7,1).error,/장목/,'black overline');
 assert.equal(b[7][8],0,'forbidden move does not persist');
 b=mustBoard([[2,7,2],[3,7,2],[4,7,2],[5,7,2],[6,7,2]]);
 assert.equal(rules.place(b,7,7,2).win,true,'white 6 allowed');
 b=mustBoard([[6,7,1],[8,7,1],[7,6,1],[7,8,1]]);
 assert.match(rules.place(b,7,7,1).error,/3-3/,'double three');
 b=mustBoard([[5,7,1],[6,7,1],[8,7,1],[7,5,1],[7,6,1],[7,8,1]]);
 assert.match(rules.place(b,7,7,1).error,/4-4/,'double four');
 b=mustBoard([[3,7,1],[4,7,1],[5,7,1],[6,7,1],[7,6,1],[7,8,1]]);
 assert.equal(rules.place(b,7,7,1).win,true,'exact 5 wins before 3-3 test');
 assert.equal(rules.place(rules.fresh(),15,1,1).ok,false,'out of board');
 // Regression: the black defence intersections shown in the support screenshot
 // are legal, including the square in front of white's horizontal three.
 const screenshot=mustBoard([
  [7,5,1],[4,6,1],[6,7,1],[7,7,1],[6,8,1],[7,8,1],[8,8,1],[9,8,1],[8,10,1],
  [8,5,2],[5,6,2],[7,6,2],[8,6,2],[9,6,2],[9,7,2],[5,8,2],[10,8,2],[9,9,2]
 ]);
 for(const [x,y] of [[6,6],[10,6]]){
  const attempt=screenshot.map(row=>row.slice());
  assert.equal(rules.place(attempt,x,y,1).ok,true,'black must be allowed to defend white three at '+x+','+y);
 }
 b=mustBoard([[2,7,1],[3,7,1],[4,7,1],[5,7,1],[6,7,1],[7,3,1],[7,4,1],[7,5,1],[7,6,1]]);
 assert.equal(rules.place(b,7,7,1).win,true,'exact 5 outranks simultaneous overline');
}
async function checkRooms(){
 const values=new Map();let time=1000000;
 const db={prepare(sql){return{
  get:key=>sql.includes('SELECT value FROM game_state')?(values.has(key)?{value:values.get(key)}:null):{nickname:key===1?'준자':'키드'},
  all:()=>[...values].map(([key,value])=>({key,value})),
  run:(key,value)=>values.set(key,value)
 };}};
 const game=createOmok({db,crypto,readBody:async req=>req.body||{},requireAuth:req=>req.user,
  json:(res,status,data)=>{res.status=status;res.data=data;},
  rateLimit:()=>true,now:()=>time,notify:()=>{},setTimer:()=>({unref(){}}),clearTimer:()=>{}});
 async function call(id,method,path,body={}){
  const res={};
  await game.handle({user:{id,nickname:id===1?'준자':'키드'},method,body},res,{pathname:path});
  return res;
 }
 let r=await call(1,'POST','/api/omok/create',{name:'테스트 대국'});
 assert.equal(r.status,201);const path='/api/omok/'+r.data.room.id;
 assert.equal((await call(2,'POST',path+'/join')).status,200);
 assert.equal((await call(2,'POST',path+'/move',{x:7,y:7})).status,409,'cannot move before start');
 await call(1,'POST',path+'/ready',{ready:true});
 await call(2,'POST',path+'/ready',{ready:true});
 r=await call(1,'POST',path+'/start');
 assert.equal(r.data.room.myTurn,true);
 assert.equal(r.data.room.myColor,1);
 assert.match((await call(1,'POST',path+'/move',{x:6,y:7})).data.error,/중앙/,'first black move must be center');
 assert.equal((await call(2,'POST',path+'/move',{x:7,y:7})).status,409,'white cannot go first');
 assert.equal((await call(1,'POST',path+'/move',{x:7,y:7})).data.room.board[7][7],1);
 assert.equal((await call(2,'POST',path+'/move',{x:7,y:7})).status,409,'same square');
 assert.equal((await call(2,'POST',path+'/move',{x:8,y:7})).data.room.board[7][8],2);
 r=await call(1,'POST',path+'/resign');
 assert.equal(r.data.room.winner,2);
 assert.equal(JSON.parse(values.get('omok:stats:2')).wins,1);
 await call(1,'POST',path+'/rematch');
 r=await call(2,'POST',path+'/rematch');
 assert.equal(r.data.room.round,2);
 assert.equal(r.data.room.myColor,1,'colors switch for rematch');
 time+=91000;
 r=await call(1,'GET',path);
 assert.equal(r.data.room.phase,'complete');
 assert.equal(r.data.room.winner,1,'timeout opponent wins');
 assert.equal((await call(2,'POST',path+'/leave')).data.room,null);
 assert.equal(JSON.parse(values.get('omok:stats:1')).wins,1);
 game.close();
}
(async()=>{checkRules();await checkRooms();console.log('Omok rules and room smoke tests: PASS');})().catch(e=>{console.error(e);process.exitCode=1;});

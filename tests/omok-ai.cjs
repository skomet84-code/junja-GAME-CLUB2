'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const rules=require('../omok-engine');
const ai=require('../omok-ai');
const createOmok=require('../omok-server');
function board(stones){const b=rules.fresh();for(const [x,y,c] of stones)b[y][x]=c;return b;}
async function run(){
  assert.deepEqual(ai.choose(rules.fresh(),1),{x:7,y:7},'black opening is center');
  let b=board([[3,7,2],[4,7,2],[5,7,2],[6,7,2]]);
  let m=ai.choose(b,2,{timeMs:180,maxNodes:400});
  assert.equal(rules.place(b,m.x,m.y,2).win,true,'AI takes a direct winning move');
  b=board([[3,7,2],[4,7,1],[5,7,1],[6,7,1],[7,7,1]]);
  m=ai.choose(b,2,{timeMs:180,maxNodes:400});
  assert.deepEqual(m,{x:8,y:7},'AI defends an unavoidable open-end immediate threat');
  b=board([[7,7,1]]);
  m=ai.choose(b,2,{timeMs:180,maxNodes:400});
  assert.ok(rules.place(b,m.x,m.y,2).ok,'AI makes legal Renju moves');
  const values=new Map();
  const db={prepare(sql){return{
    get:key=>sql.includes('SELECT value FROM game_state')?(values.has(key)?{value:values.get(key)}:null):{nickname:'준자'},
    all:()=>[...values].map(([key,value])=>({key,value})),
    run:(key,value)=>values.set(key,value)
  };}};
  const game=createOmok({db,crypto,readBody:async req=>req.body||{},requireAuth:req=>req.user,
    json:(res,status,data)=>{res.status=status;res.data=data;},rateLimit:()=>true,notify:()=>{},
    setTimer:()=>({unref(){}}),clearTimer:()=>{}});
  async function call(method,path,body={}){
    const res={};await game.handle({user:{id:1,nickname:'준자'},method,body},res,{pathname:path});return res;
  }
  let r=await call('POST','/api/omok/create',{vsAi:true});
  assert.equal(r.status,201);
  assert.equal(r.data.room.ai,true);
  const path='/api/omok/'+r.data.room.id;
  r=await call('POST',path+'/move',{x:7,y:7});
  assert.equal(r.status,200);
  assert.equal(r.data.room.moves,2,'AI responds with one move');
  assert.equal(r.data.room.turn,1,'turn comes back to human');
  r=await call('POST',path+'/resign');
  assert.equal(r.data.room.winner,-1);
  assert.equal(JSON.parse(values.get('omok:stats:1')).losses,1);
  assert.equal(values.has('omok:stats:-1'),false,'AI must never be saved as a user');
  r=await call('POST',path+'/rematch');
  assert.equal(r.status,200);
  assert.equal(r.data.room.round,2);
  assert.equal(r.data.room.myColor,2);
  assert.equal(r.data.room.board[7][7],1,'AI makes mandatory black opening');
  assert.equal(r.data.room.moves,1);
  await call('POST',path+'/leave');
  assert.equal(game.roomCount(),0,'solo room is immediately deleted when user leaves');
  game.close();
  console.log('Omok ultimate AI tactical and solo room tests: PASS');
}
run().catch(e=>{console.error(e);process.exitCode=1;});

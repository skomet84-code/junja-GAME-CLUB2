
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

 // JUNJA LAND also bans visible semi-open and split 3-3 crossings.
 b=mustBoard([[6,7,1],[8,7,1],[7,6,1],[7,8,1],[9,7,2],[7,9,2]]);
 assert.equal(rules.openThreeGroups((()=>{const copy=b.map(row=>row.slice());copy[7][7]=1;return copy;})(),7,7),0,
  'old open-three-only check misses semi-open double three');
 assert.match(rules.place(b,7,7,1).error,/3-3/,'semi-open double three');
 assert.equal(b[7][7],0,'rejected black 3-3 does not alter board');
 b=mustBoard([[5,7,1],[8,7,1],[7,6,1],[7,8,1],[9,7,2],[7,9,2]]);
 assert.match(rules.place(b,7,7,1).error,/3-3/,'split/semi-open double three');
 assert.equal(b[7][7],0,'rejected broken double three leaves turn board intact');
 b=mustBoard([[6,7,1],[8,7,1],[7,6,1],[7,8,1],[5,7,2],[9,7,2],[7,5,2],[7,9,2]]);
 assert.equal(rules.place(b,7,7,1).ok,true,'fully blocked lines do not count as three threats');
 b=mustBoard([[6,7,2],[8,7,2],[7,6,2],[7,8,2],[9,7,1],[7,9,1]]);
 assert.match(rules.place(b,7,7,2).error,/백돌 3-3/,'white semi-open 3-3 forbidden');
 assert.equal(b[7][7],0,'white forbidden move does not persist');

 b=mustBoard([[5,7,1],[6,7,1],[8,7,1],[7,5,1],[7,6,1],[7,8,1]]);
 assert.match(rules.place(b,7,7,1).error,/4-4/,'double four');
 b=mustBoard([[3,7,1],[4,7,1],[5,7,1],[6,7,1],[7,6,1],[7,8,1]]);
 assert.equal(rules.place(b,7,7,1).win,true,'exact 5 wins before 3-3 test');
 assert.equal(rules.place(rules.fresh(),15,1,1).ok,false,'out of board');
 // Support screenshot: black must be able to block white's horizontal three.
 b=mustBoard([
  [7,5,1],[4,6,1],[6,7,1],[7,7,1],[6,8,1],[7,8,1],[8,8,1],[9,8,1],[8,10,1],
  [8,5,2],[5,6,2],[7,6,2],[8,6,2],[9,6,2],[9,7,2],[5,8,2],[10,8,2],[9,9,2]
 ]);
 for(const [x,y] of [[6,6],[10,6]]){
  const copy=b.map(row=>row.slice());
  assert.equal(rules.place(copy,x,y,1).ok,true,'black defensive block accepted at '+x+','+y);
  assert.equal(copy[y][x],1,'defence persisted on board');
 }
 // Blocking the gap of an opposing split three is a defence, for both colors.
  for(const defending of [1,2]){
    const attacking=3-defending;
    const setup=mustBoard([[5,7,attacking],[6,7,attacking],[8,7,attacking],[6,8,defending],[8,8,defending],[7,6,defending],[7,8,defending]]);
    assert.equal(rules.place(setup,7,7,defending).ok,true,'split-three blocking is legal color '+defending);
  }
  // An actual open double three remains forbidden, even when a nearby white
 // diagonal run of three is also adjacent to the move.
 b=mustBoard([[6,7,1],[8,7,1],[7,6,1],[7,8,1],[8,8,2],[9,9,2],[10,10,2]]);
 assert.match(rules.place(b,7,7,1).error,/3-3/,'true open 3-3 remains forbidden while defending');
 b=mustBoard([[2,7,1],[3,7,1],[4,7,1],[5,7,1],[6,7,1],[7,3,1],[7,4,1],[7,5,1],[7,6,1]]);
 assert.equal(rules.place(b,7,7,1).win,true,'exact 5 outranks simultaneous overline');
}
function checkBothColors(){
 const cases=[
  {name:'open cross',stones:[[6,7],[8,7],[7,6],[7,8]],blocked:[],ok:false},
  {name:'diagonal cross',stones:[[6,6],[8,8],[6,8],[8,6]],blocked:[],ok:false},
  {name:'split cross',stones:[[5,7],[8,7],[7,5],[7,8]],blocked:[],ok:false},
  {name:'single three',stones:[[6,7],[8,7]],blocked:[],ok:true},
  {name:'blocked cross',stones:[[6,7],[8,7],[7,6],[7,8]],blocked:[[5,7],[9,7],[7,5],[7,9]],ok:true}
 ];
 for(const c of [1,2])for(const t of cases){
  const b=mustBoard([...t.stones.map(([x,y])=>[x,y,c]),...t.blocked.map(([x,y])=>[x,y,3-c])]);
  const before=JSON.stringify(b),result=rules.place(b,7,7,c);
  assert.equal(result.ok,t.ok,t.name+' color '+c);
  if(!t.ok){assert.match(result.error,/3-3/);assert.equal(JSON.stringify(b),before);}
 }
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
 const actual=game.findUserRoom(1);
 for(const color of [1,2]){
  actual.board=mustBoard([[6,7,color],[8,7,color],[7,6,color],[7,8,color]]);
  actual.turn=color;actual.moves=8;
  const before=JSON.stringify(actual.board),version=actual.version;
  const rejected=await call(color,'POST',path+'/move',{x:7,y:7});
  assert.equal(rejected.status,409,'server rejects 3-3 for color '+color);
  assert.match(rejected.data.error,/3-3/);
  assert.equal(JSON.stringify(actual.board),before);
  assert.equal(actual.turn,color);assert.equal(actual.version,version);assert.equal(actual.moves,8);
 }
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

async function checkClientRequestRaces(){
 const vm=require('node:vm'),fs=require('node:fs');
 const original=fs.readFileSync('public/omok/game.js','utf8');
 const tail="refresh(true);\n})();";
 assert.ok(original.includes(tail),'omok script has a known harness injection point');
 const instrumented=original.replace(tail,"window.__omokTest={state,accept,refresh,act};\nrefresh(true);\n})();");
 const pending=[],listeners={};
 const root={innerHTML:'',addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null};
 const notice={textContent:''},back={addEventListener:(ev,fn)=>{listeners[ev]=fn;}};
 const doc={hidden:false,readyState:'complete',getElementById:id=>id==='omokRoot'?root:id==='omokMessage'?notice:null,
  querySelector:q=>q==='.omk-back'?back:null,addEventListener(){}};
 const location={href:'https://example.test/omok/index.html',origin:'https://example.test',
  redirected:null,assign(path){this.redirected=path;}};
 const window={confirm:()=>true,addEventListener(){},prompt:()=>''};
 const fetch=(url,opts)=>new Promise(resolve=>pending.push({url,opts,resolve}));
 const ctx={document:doc,window,location,fetch,URL,history:{replaceState(){}},
  navigator:{},console,setTimeout,clearTimeout,setInterval:()=>0,clearInterval:()=>{}};
 vm.runInNewContext(instrumented,ctx);
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 const respond=(item,data,status=200)=>{
  assert.ok(item,'expected an outstanding HTTP response');
  item.resolve({ok:status<400,status,json:async()=>data});
 };
 assert.equal(pending.length,1,'initial lobby load requested');
 respond(pending.shift(),{room:null,rooms:[],stats:{},aiStats:{},leaders:[]});await flush();
 const t=window.__omokTest,board=rules.fresh();board[7][7]=1;
 const live={id:'OM123456789abcde',version:5,phase:'playing',round:1,moves:1,board,last:[7,7],line:[],
  name:'경합 테스트',selfId:1,hostId:1,players:[
   {id:1,nickname:'준자',color:1,ready:true},{id:2,nickname:'친구',color:2,ready:true}],
  turn:2,myTurn:false,deadline:Date.now()+90000,serverNow:Date.now(),winner:null,reason:'',aiMode:false};
 t.accept({room:live});
 const oldPoll=t.refresh(true);
 assert.equal(pending.length,1,'a poll is in flight');
 const move=t.act('/'+live.id+'/move',{x:8,y:7});
 assert.equal(pending.length,2,'a player action overlaps the older poll');
 const newer={...live,version:6,turn:1,myTurn:true,moves:2,board:live.board.map(row=>row.slice())};
 newer.board[7][8]=2;
 respond(pending.pop(),{room:newer});await move;
 respond(pending.shift(),{room:live});await oldPoll;
 assert.equal(t.state.room.version,6,'out-of-order GET cannot erase a newer turn');
 assert.equal(t.state.room.board[7][8],2,'the newest stone remains displayed');
 const late=t.refresh(true);
 const leave=t.act('/'+live.id+'/leave',{});
 respond(pending.pop(),{room:null});await flush();
 // The action loads the lobby after leaving.
 assert.ok(pending.some(x=>x.url==='/api/omok'));
 const home=pending.findIndex(x=>x.url==='/api/omok');
 respond(pending.splice(home,1)[0],{room:null,rooms:[],stats:{},aiStats:{},leaders:[]});
 await leave;
 respond(pending.shift(),{room:live});await late;
 assert.equal(t.state.room,null,'old poll cannot resurrect a room after exit');
 t.accept({room:live});
 let prevented=false;
 const backClick=listeners.click({preventDefault(){prevented=true;}});
 assert.equal(prevented,true,'lobby link waits for server leave');
 assert.ok(pending.at(-1).url.endsWith('/leave'),'lobby navigation calls room leave');
 respond(pending.pop(),{room:null});await backClick;
 assert.equal(location.redirected,'/','lobby opens after successful room departure');
 console.log('OMOK_CLIENT_RACES_OK: stale GET, action overlap, room exit and lobby navigation');
}

(async()=>{checkRules();checkBothColors();await checkRooms();await checkClientRequestRaces();console.log('Omok rules and room smoke tests: PASS');})().catch(e=>{console.error(e);process.exitCode=1;});

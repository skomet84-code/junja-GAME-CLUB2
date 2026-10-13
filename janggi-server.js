'use strict';
// Server-authoritative online Korean Janggi: remote 1v1 and ranked master-AI challenge.
// Only server-validated AI victories can credit 1 trillion JUNJA game-money.
const R=require('./public/janggi/engine.js');
const {Worker}=require('node:worker_threads');
const REWARD=1000000000000n,TURN=180000,WAIT=1800000,DONE=1200000;
const AI={id:0,nickname:'J-BOT · GRANDMASTER'};
function comparable(m,n){return m&&n&&m.x===n.x&&m.y===n.y&&m.tx===n.tx&&m.ty===n.ty;}
module.exports=function createJanggi({db,crypto,readBody,requireAuth,json,rateLimit,credit,notify=()=>{},now=Date.now,isUserBusy=()=>false,setTimer=setTimeout,clearTimer=clearTimeout,aiDecide=null,initialBoard=null}){
 const rooms=new Map(),timers=new Map();
 function write(key,value){db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(key,JSON.stringify(value),now());}
 function read(key,init){const row=db.prepare('SELECT value FROM game_state WHERE key=?').get(key);return row?JSON.parse(row.value):init;}
 const stats=id=>read('janggi:stats:'+id,{games:0,wins:0,losses:0,draws:0,aiWins:0,earnings:0});
 function publish(r){r.version++;r.updated=now();notify(r.players.filter(p=>p.id).map(p=>p.id),r.id);}
 function disarm(r){if(timers.has(r.id))clearTimer(timers.get(r.id));timers.delete(r.id);}
 function arm(r){disarm(r);r.deadline=now()+TURN;const deadline=r.deadline;const t=setTimer(()=>{if(rooms.get(r.id)===r&&r.phase==='playing'&&r.deadline===deadline)expire(r);},TURN+80);t?.unref?.();timers.set(r.id,t);}
 function finish(r,winner,reason,eligible=true){
  if(r.phase!=='playing')return;
  disarm(r);r.phase='complete';r.deadline=0;r.thinking=false;r.winner=winner;r.reason=reason;r.completed=now();r.payout=0;r.payoutError=null;
  if(r.ai&&winner===r.players.find(p=>p.id!==AI.id)?.id&&eligible){
   // Do NOT trust the browser: credit is reached solely from authoritative result.
   // Wallet request key is durable and idempotent even across retries.
   try{credit(winner,REWARD,'janggi:'+r.id+':'+r.round);r.payout=Number(REWARD);}
   catch(e){r.payoutError='상금 정산 확인이 필요합니다.';console.error('[JANGGI PAYOUT]',e.message);}
  }
  if(!r.recorded){
   r.recorded=true;
   for(const p of r.players.filter(p=>p.id!==AI.id)){
    const s=stats(p.id);s.games++;
    if(!winner)s.draws++;else if(winner===p.id)s.wins++;else s.losses++;
    if(r.ai&&winner===p.id)s.aiWins++;
    if(p.id===winner&&r.payout)s.earnings+=r.payout;
    write('janggi:stats:'+p.id,s);
   }
  }
  publish(r);
 }
 function expire(r){
  if(r.phase==='playing'&&!r.thinking&&r.deadline&&now()>=r.deadline){
   const loser=r.players.find(p=>r.colors[p.id]===r.turn);
   finish(r,r.ai?AI.id:r.players.find(p=>p.id!==loser?.id)?.id,'착수 제한시간 초과',false);
  }
 }
 function cleanup(){
  for(const r of rooms.values()){expire(r);
   if(r.phase==='waiting'&&now()-r.updated>WAIT||r.phase==='complete'&&now()-r.completed>DONE){disarm(r);rooms.delete(r.id);}
  }
 }
 function mine(id){cleanup();return [...rooms.values()].find(r=>r.players.some(p=>p.id===Number(id)))||null;}
 function roomView(r,id){const my=r.players.find(p=>p.id===Number(id));return {
   id:r.id,version:r.version,name:r.name,ai:r.ai,phase:r.phase,hostId:r.hostId,selfId:Number(id),
   players:r.players.map(p=>({id:p.id,nickname:p.nickname,ready:!!p.ready,color:r.colors[p.id]||null})),
   board:r.board,turn:r.turn,colors:r.colors,mySide:r.colors[Number(id)]||null,
   myTurn:r.phase==='playing'&&!r.thinking&&r.colors[Number(id)]===r.turn,
   thinking:r.thinking,moves:r.moves,round:r.round,last:r.last,passes:r.passes,
   winner:r.winner,reason:r.reason,payout:r.payout||0,payoutError:r.payoutError,
   deadline:r.deadline,serverNow:now(),formations:r.formations
 };}
 function overview(r){return {id:r.id,name:r.name,host:r.players.find(p=>p.id===r.hostId)?.nickname||'방장',players:r.players.length};}
 function aiWork(board,side){
  if(aiDecide)return Promise.resolve().then(()=>aiDecide(board,side));
  return new Promise((resolve,reject)=>{
   const w=new Worker(require.resolve('./janggi-node-worker.js'),{workerData:{board,side,timeMs:7700},resourceLimits:{maxOldGenerationSizeMb:96}});
   let ended=false;const timeout=setTimeout(()=>end(Error('AI timeout')),11000);timeout.unref?.();
   function end(err,m){if(ended)return;ended=true;clearTimeout(timeout);w.terminate();if(err)reject(err);else resolve(m);}
   w.once('message',m=>m.error?end(Error(m.error)):end(null,m.move));
   w.once('error',err=>end(err));w.once('exit',code=>{if(code!==0)end(Error('AI worker exited'));});
  });
 }
 function aiTurn(r){
  if(!r.ai||r.phase!=='playing'||r.thinking||r.turn!==r.colors[AI.id])return;
  disarm(r);r.deadline=0;r.thinking=true;publish(r);
  const marker=r.version,board=r.board.map(row=>row.slice()),side=r.turn;
  aiWork(board,side).then(move=>{
   if(rooms.get(r.id)!==r||r.phase!=='playing'||r.version!==marker||!r.thinking)return;
   const legal=R.legal(r.board,side),chosen=legal.find(m=>comparable(m,move));
   r.thinking=false;
   if(!chosen){finish(r,null,'AI 연산 오류 · 상금 지급 없이 종료',false);return;}
   execute(r,chosen);
  }).catch(e=>{console.error('[JANGGI AI]',e.message);if(rooms.get(r.id)===r&&r.phase==='playing'&&r.version===marker)finish(r,null,'AI 연결 오류 · 상금 지급 없이 종료',false);});
 }
 function execute(r,m,pass=false){
  const side=r.turn,p=r.board[m?.y]?.[m?.x]||null,cap=r.board[m?.ty]?.[m?.tx]||null;
  if(pass){r.passes++;r.moves.push({side,pass:true});r.last=null;}
  else{r.board=R.moved(r.board,m);r.moves.push({side,p,m,capture:cap});r.last=m;r.passes=0;}
  r.turn=R.ENEMY(side);
  if(r.passes>=2){
   const values={rook:13,cannon:7,horse:5,elephant:3,guard:3,soldier:2,king:0};
   let c=0,h=1.5;for(const row of r.board)for(const item of row)if(item){if(item.s==='c')c+=values[item.t];else h+=values[item.t];}
   const champ=c===h?null:r.players.find(p=>r.colors[p.id]===(c>h?'c':'h'))?.id??null;
   finish(r,champ,'연속 차례 넘김 · 점수 판정',false);return;
  }
  const st=R.status(r.board,r.turn);
  if(st.winner){finish(r,r.players.find(p=>r.colors[p.id]===st.winner)?.id??null,'외통 승리');return;}
  if(st.draw||r.moves.length>=240){finish(r,null,'무승부',false);return;}
  if(r.ai&&r.turn===r.colors[AI.id])aiTurn(r);
  else{arm(r);publish(r);}
 }
 function start(r,again=false){
  if(r.players.length!==2)throw Error('상대 한 명이 참가해야 대국을 시작할 수 있습니다.');
  if(!r.ai&&!r.players.every(p=>p.ready))throw Error('두 사람 모두 준비를 눌러주세요.');
  const a=r.players[0],b=r.players[1];r.round++;
  const cFirst=r.ai?(r.preferredSide||'c'):(r.round%2===1?'c':'h');
  r.colors={[a.id]:cFirst,[b.id]:R.ENEMY(cFirst)};
  r.players.forEach(p=>p.ready=false);r.board=initialBoard?initialBoard(r):R.fresh(r.formations);
  r.turn='c';r.moves=[];r.passes=0;r.last=null;r.winner=null;r.reason='';r.phase='playing';
  r.thinking=false;r.payout=0;r.payoutError=null;r.recorded=false;
  if(r.ai&&r.colors[AI.id]==='c')aiTurn(r);
  else {arm(r);publish(r);}
 }
 function makeRoom(id,person,ai,b){
  const formation=name=>Object.hasOwn(R.FORMATIONS,name)?name:'inner';
  const r={id:'JG'+crypto.randomBytes(7).toString('hex'),name:ai?'최강 AI · 1조 챌린지':String(b.name||'준자 온라인 장기').trim().slice(0,28)||'준자 온라인 장기',
   hostId:id,ai,phase:'waiting',players:[{id,nickname:person.nickname,ready:ai}],colors:{},round:0,
   board:R.fresh(),turn:'c',moves:[],passes:0,deadline:0,version:0,updated:now(),recorded:false,thinking:false,
   formations:{cFormation:formation(b.cFormation),hFormation:formation(b.hFormation)},preferredSide:b.side==='h'?'h':'c'};
  rooms.set(r.id,r);
  if(ai){r.players.push({...AI,ready:true});start(r);}else publish(r);
  return r;
 }
 async function handle(req,res,url){
  if(!url.pathname.startsWith('/api/janggi'))return false;
  const user=requireAuth(req,res);if(!user)return true;
  const reply=(status,data)=>{json(res,status,data);return true;};
  try{
   if(!rateLimit('janggi:'+user.id,120,60000))return reply(429,{error:'요청이 너무 빠릅니다.'});
   const b=req.method==='POST'?await readBody(req):{};
   cleanup();
   if(url.pathname==='/api/janggi'&&req.method==='GET')return reply(200,{
    room:mine(user.id)?roomView(mine(user.id),user.id):null,
    rooms:[...rooms.values()].filter(r=>!r.ai&&r.phase==='waiting'&&r.players.length<2).map(overview),
    stats:stats(user.id),reward:Number(REWARD)
   });
   if(url.pathname==='/api/janggi/create'&&req.method==='POST'||url.pathname==='/api/janggi/create-ai'&&req.method==='POST'){
    if(mine(user.id)||isUserBusy(user.id))throw Error('진행 중인 다른 게임방에서 먼저 나와주세요.');
    const ai=url.pathname.endsWith('create-ai');
    if(!rateLimit('janggi-create:'+user.id,8,60000))throw Error('새 방 생성은 잠시 후 다시 시도하세요.');
    const r=makeRoom(Number(user.id),user,ai,b);return reply(201,{room:roomView(r,user.id)});
   }
   const match=url.pathname.match(/^\/api\/janggi\/(JG[a-f0-9]{14})(?:\/(join|ready|start|move|pass|resign|leave|rematch))?$/);
   if(!match)return reply(404,{error:'지원하지 않는 장기 요청입니다.'});
   const r=rooms.get(match[1]),op=match[2];if(!r)return reply(404,{error:'장기 대국방을 찾을 수 없습니다.'});
   expire(r);
   if(op==='join'&&req.method==='POST'){
    const exists=r.players.some(p=>p.id===Number(user.id));
    if(exists)return reply(200,{room:roomView(r,user.id)});
    if(mine(user.id)||isUserBusy(user.id))throw Error('다른 게임방에서 먼저 나와주세요.');
    if(r.ai||r.phase!=='waiting'||r.players.length>=2)throw Error('참가할 수 없는 대국방입니다.');
    r.players.push({id:Number(user.id),nickname:user.nickname,ready:false});publish(r);return reply(200,{room:roomView(r,user.id)});
   }
   if(!r.players.some(p=>p.id===Number(user.id)))return reply(403,{error:'참가자만 대국을 볼 수 있습니다.'});
   if(!op&&req.method==='GET')return reply(200,{room:roomView(r,user.id)});
   if(req.method!=='POST')return reply(405,{error:'잘못된 요청입니다.'});
   if(op==='ready'){
    if(r.ai||r.phase!=='waiting')throw Error('지금 준비할 수 없습니다.');
    r.players.find(p=>p.id===Number(user.id)).ready=b.ready===true;publish(r);
   }else if(op==='start'){
    if(r.ai||r.hostId!==Number(user.id)||r.phase!=='waiting')throw Error('방장만 시작할 수 있습니다.');
    start(r);
   }else if(op==='move'){
    if(r.phase!=='playing'||r.thinking||r.colors[user.id]!==r.turn)throw Error('지금은 내 차례가 아닙니다.');
    const m={x:b.x,y:b.y,tx:b.tx,ty:b.ty};
    if(!R.isLegal(r.board,r.turn,m))throw Error('올바르지 않은 착수입니다.');
    execute(r,m);
   }else if(op==='pass'){
    if(r.phase!=='playing'||r.thinking||r.colors[user.id]!==r.turn||R.checked(r.board,r.turn))throw Error('장군 상태이거나 내 차례가 아닙니다.');
    execute(r,null,true);
   }else if(op==='resign'){
    if(r.phase!=='playing')throw Error('진행 중인 대국이 아닙니다.');
    finish(r,r.players.find(p=>p.id!==Number(user.id))?.id||null,'상대 기권',false);
   }else if(op==='rematch'){
    if(r.phase!=='complete')throw Error('대국 종료 후 재대결할 수 있습니다.');
    if(r.ai){start(r,true);}
    else{r.phase='waiting';r.players.forEach(p=>p.ready=false);publish(r);}
   }else if(op==='leave'){
    if(r.phase==='playing')finish(r,r.players.find(p=>p.id!==Number(user.id))?.id||null,'상대 퇴장 · 기권',false);
    r.players=r.players.filter(p=>p.id!==Number(user.id));
    if(!r.players.length||r.ai){disarm(r);rooms.delete(r.id);}
    else{r.hostId=r.players[0].id;r.phase='waiting';r.players[0].ready=false;publish(r);}
    return reply(200,{room:null});
   }else throw Error('지원하지 않는 장기 요청입니다.');
   return reply(200,{room:roomView(r,user.id)});
  }catch(e){return reply(409,{error:e.message||'장기 대국 처리 오류'});}
 }
 return {handle,hasUser:id=>!!mine(id),findUserRoom:mine,roomCount:()=>rooms.size,close(){for(const t of timers.values())clearTimer(t);}};
};

'use strict';
const rules=require('./omok-engine');
const {Worker}=require('node:worker_threads');
const {selectMove}=require('./omok-ai');
module.exports=function createOmok({db,crypto,readBody,requireAuth,json,rateLimit,now=Date.now,isUserBusy=()=>false,notify=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,aiDecide=null}){
  const rooms=new Map(),timers=new Map();
  const AI_ID=0,AI_NICKNAME='J-BOT · EXTREME';
  const TURN_MS=90000,WAIT_MS=30*60000,DONE_MS=15*60000;
  const getStats=id=>{
    const row=db.prepare('SELECT value FROM game_state WHERE key=?').get('omok:stats:'+id);
    return row?JSON.parse(row.value):{games:0,wins:0,losses:0,draws:0,streak:0,bestStreak:0};
  };
  function putStats(id,s){
    db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
      .run('omok:stats:'+id,JSON.stringify(s),now());
  }
  function aiStats(id){
    const row=db.prepare('SELECT value FROM game_state WHERE key=?').get('omok:ai-stats:'+id);
    return row?JSON.parse(row.value):{games:0,wins:0,losses:0,draws:0};
  }
  function record(r,winner){
    if(r.aiMode){
      if(r.recorded)return;
      const person=r.players.find(p=>p.id!==AI_ID);
      if(!person)return;
      const s=aiStats(person.id);s.games++;
      if(winner==null)s.draws++;
      else if(winner===person.id)s.wins++;
      else s.losses++;
      db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
        .run('omok:ai-stats:'+person.id,JSON.stringify(s),now());
      r.recorded=true;
      return;
    }
    if(r.recorded||r.players.length!==2)return;
    r.recorded=true;
    for(const p of r.players){
      const s=getStats(p.id);s.games++;
      if(winner==null){s.draws++;s.streak=0;}
      else if(p.id===winner){s.wins++;s.streak++;s.bestStreak=Math.max(s.bestStreak,s.streak);}
      else {s.losses++;s.streak=0;}
      putStats(p.id,s);
    }
  }
  function publish(r){
    r.updated=now();r.version++;
    notify(r.players.map(p=>p.id),r.id);
  }
  function disarm(r){const timer=timers.get(r.id);if(timer)clearTimer(timer);timers.delete(r.id);}
  function finish(r,winner,reason,line=[]){
    if(r.phase!=='playing')return;
    disarm(r);r.phase='complete';r.aiThinking=false;r.winner=winner;r.reason=reason;r.line=line;r.deadline=0;r.completedAt=now();
    record(r,winner);publish(r);
  }
  function expire(r){
    if(r.phase==='playing'&&r.deadline&&now()>=r.deadline){
      const loser=r.players.find(p=>r.colors[p.id]===r.turn);
      finish(r,r.players.find(p=>p.id!==loser?.id)?.id||null,'시간 초과');
    }
  }
  function arm(r){
    disarm(r);r.deadline=now()+TURN_MS;
    const id=r.id,revision=r.version+1;
    const timer=setTimer(()=>{const current=rooms.get(id);if(current&&current===r&&current.phase==='playing'&&current.version===revision)expire(current);},TURN_MS+50);
    if(typeof timer.unref==='function')timer.unref();
    timers.set(id,timer);
  }
  function cleanup(){
    for(const r of rooms.values()){
      expire(r);
      if(r.phase==='waiting'&&now()-r.updated>WAIT_MS||r.phase==='complete'&&now()-(r.completedAt||r.updated)>DONE_MS){
        disarm(r);rooms.delete(r.id);
      }
    }
  }
  function mine(id){cleanup();return [...rooms.values()].find(r=>r.players.some(p=>p.id===Number(id)))||null;}
  function workerThink(board,color){
    return new Promise((resolve,reject)=>{
      const worker=new Worker(require.resolve('./omok-ai-worker.js'),{
        workerData:{board,color,timeMs:7000},resourceLimits:{maxOldGenerationSizeMb:80}});
      let done=false;
      const timer=setTimeout(()=>{if(done)return;done=true;worker.terminate();reject(Error('AI search timed out'));},8600);
      if(typeof timer.unref==='function')timer.unref();
      const finish=(error,move)=>{
        if(done)return;done=true;clearTimeout(timer);worker.terminate();
        if(error)reject(error);else resolve(move);
      };
      worker.once('message',msg=>msg.error?finish(Error(msg.error)):finish(null,msg.move));
      worker.once('error',err=>finish(err));
      worker.once('exit',code=>{if(code!==0)finish(Error('AI worker exited: '+code));});
    });
  }
  function queueAi(r){
    if(!r.aiMode||r.phase!=='playing'||r.turn!==r.colors[AI_ID]||r.aiThinking)return;
    r.aiThinking=true;disarm(r);r.deadline=0;publish(r);
    const stamp=r.version;
    const board=r.board.map(row=>row.slice()),color=r.turn;
    Promise.resolve().then(()=>aiDecide?aiDecide(board,color):workerThink(board,color))
      .catch(()=>selectMove(board,color,{timeMs:140}))
      .then(move=>{
        if(rooms.get(r.id)!==r||r.version!==stamp||r.phase!=='playing'||r.turn!==color)return;
        const options=[move,...(function*(){
          for(let y=0;y<15;y++)for(let x=0;x<15;x++)if(!r.board[y][x])yield {x,y};
        })()];
        let chosen=null,result;
        for(const m of options){
          if(!m||!Number.isInteger(m.x)||!Number.isInteger(m.y)||m.x<0||m.y<0||m.x>14||m.y>14)continue;
          if(r.moves===0&&(m.x!==7||m.y!==7))continue;
          const check=rules.place(r.board,m.x,m.y,color);
          if(check.ok){chosen=m;result=check;break;}
        }
        r.aiThinking=false;
        if(!chosen){finish(r,null,'무승부');return;}
        r.last=[chosen.x,chosen.y];r.moves++;
        if(result.win)finish(r,AI_ID,'AI 오목 완성',result.line);
        else if(result.draw)finish(r,null,'무승부');
        else {r.turn=3-color;arm(r);publish(r);}
      }).catch(error=>{
        // Never leave a user trapped in a stalled computer turn.
        console.error('[OMOK AI]',error.message);
        if(rooms.get(r.id)===r&&r.phase==='playing'&&r.turn===color){r.aiThinking=false;finish(r,r.players.find(p=>p.id!==AI_ID).id,'AI 연산 오류');}
      });
  }
  function pub(r,id){
    return {id:r.id,version:r.version,phase:r.phase,round:r.round,board:r.board,last:r.last,line:r.line,
      name:r.name,hostId:r.hostId,players:r.players.map(p=>({id:p.id,nickname:p.nickname,ready:p.ready,rematch:p.rematch,color:r.colors[p.id]||0})),
      selfId:Number(id),myColor:r.colors[id]||0,myTurn:r.phase==='playing'&&r.colors[id]===r.turn,
      turn:r.turn,deadline:r.deadline,serverNow:now(),winner:r.winner,reason:r.reason,moves:r.moves,
      aiMode:!!r.aiMode,aiThinking:!!r.aiThinking};
  }
  function start(r,again=false){
    if(r.players.length!==2)throw Error('두 명이 모두 입장해야 합니다.');
    const p0=r.players[0],p1=r.players[1];
    r.round=(r.round||0)+1;
    r.colors={};
    r.colors[p0.id]=r.round%2===1?1:2;
    r.colors[p1.id]=r.round%2===1?2:1;
    r.players.forEach(p=>{p.ready=false;p.rematch=false;});
    r.board=rules.fresh();r.last=null;r.line=[];r.moves=0;r.turn=1;r.winner=null;r.reason='';
    r.phase='playing';r.recorded=false;r.aiThinking=false;
    if(r.aiMode&&r.colors[AI_ID]===r.turn)queueAi(r);
    else {arm(r);publish(r);}
  }
  function list(){
    return [...rooms.values()].filter(r=>!r.aiMode&&r.phase==='waiting'&&r.players.length<2).map(r=>({
      id:r.id,name:r.name,host:r.players[0].nickname,players:r.players.length
    }));
  }
  async function handle(req,res,url){
    if(!url.pathname.startsWith('/api/omok'))return false;
    const user=requireAuth(req,res);if(!user)return true;
    const reply=(status,data)=>{json(res,status,data);return true;};
    try{
      if(!rateLimit('omok:'+user.id,180,60000))return reply(429,{error:'요청이 너무 빠릅니다.'});
      const b=req.method==='POST'?await readBody(req):{};
      cleanup();
      if(url.pathname==='/api/omok'&&req.method==='GET'){
        const r=mine(user.id);
        const leaders=db.prepare("SELECT key,value FROM game_state WHERE key LIKE 'omok:stats:%'").all()
          .map(row=>({...JSON.parse(row.value),id:Number(row.key.slice('omok:stats:'.length))}))
          .filter(s=>s.games>0).sort((a,b)=>b.wins-a.wins||b.bestStreak-a.bestStreak).slice(0,10)
          .map(s=>({...s,nickname:db.prepare('SELECT nickname FROM users WHERE id=?').get(s.id)?.nickname||'탈퇴 회원'}));
        return reply(200,{room:r?pub(r,user.id):null,rooms:list(),stats:getStats(user.id),aiStats:aiStats(user.id),leaders});
      }
      if(url.pathname==='/api/omok/create-ai'&&req.method==='POST'){
        if(mine(user.id)||isUserBusy(user.id))throw Error('진행 중인 게임방에서 먼저 나와주세요.');
        if(!rateLimit('omok-ai-create:'+user.id,10,60000))throw Error('AI 대국은 잠시 뒤 다시 시작해주세요.');
        const id='OM'+crypto.randomBytes(7).toString('hex');
        const room={id,name:'극한 AI 챌린지',hostId:user.id,
          players:[{id:user.id,nickname:user.nickname,ready:true,rematch:false},{id:AI_ID,nickname:AI_NICKNAME,ready:true,rematch:false}],
          colors:{},aiMode:true,aiThinking:false,phase:'waiting',round:0,board:rules.fresh(),last:null,line:[],
          moves:0,turn:1,winner:null,reason:'',version:0,updated:now(),deadline:0,recorded:false};
        rooms.set(id,room);start(room);
        return reply(201,{room:pub(room,user.id)});
      }
      if(url.pathname==='/api/omok/create'&&req.method==='POST'){
        if(mine(user.id)||isUserBusy(user.id))throw Error('진행 중인 게임방에서 먼저 나와주세요.');
        if(!rateLimit('omok-create:'+user.id,8,60000))throw Error('방 생성은 잠시 뒤 다시 해주세요.');
        const id='OM'+crypto.randomBytes(7).toString('hex');
        const room={id,name:String(b.name||'준자 오목 대결').trim().slice(0,28)||'준자 오목 대결',
          hostId:user.id,players:[{id:user.id,nickname:user.nickname,ready:false,rematch:false}],colors:{},
          phase:'waiting',round:0,board:rules.fresh(),last:null,line:[],moves:0,turn:1,
          winner:null,reason:'',version:0,updated:now(),deadline:0,recorded:false};
        rooms.set(id,room);publish(room);return reply(201,{room:pub(room,user.id)});
      }
      const match=url.pathname.match(/^\/api\/omok\/(OM[a-f0-9]{14})(?:\/(join|ready|start|move|resign|rematch|leave))?$/);
      if(!match)return reply(404,{error:'존재하지 않는 오목 요청입니다.'});
      const r=rooms.get(match[1]),op=match[2];
      if(!r)return reply(404,{error:'종료된 오목방입니다. 홈에서 다시 참가해주세요.'});
      if(op==='join'&&req.method==='POST'){
        if(r.players.some(p=>p.id===user.id))return reply(200,{room:pub(r,user.id)});
        if(mine(user.id)||isUserBusy(user.id))throw Error('다른 게임방에서 먼저 나와주세요.');
        if(r.aiMode||r.phase!=='waiting'||r.players.length!==1)throw Error('이미 시작됐거나 가득 찬 방입니다.');
        r.players.push({id:user.id,nickname:user.nickname,ready:false,rematch:false});
        publish(r);return reply(200,{room:pub(r,user.id)});
      }
      const p=r.players.find(p=>p.id===user.id);
      if(!p)return reply(403,{error:'이 방의 참가자가 아닙니다.'});
      if(!op&&req.method==='GET')return reply(200,{room:pub(r,user.id)});
      if(req.method!=='POST')return reply(405,{error:'허용되지 않은 요청입니다.'});
      if(op==='ready'){
        if(r.phase!=='waiting')throw Error('이미 진행 중인 대국입니다.');
        p.ready=b.ready===true;publish(r);
      }else if(op==='start'){
        if(r.phase!=='waiting'||r.hostId!==user.id)throw Error('방장만 시작할 수 있습니다.');
        if(r.players.length!==2||r.players.some(p=>!p.ready))throw Error('두 사람 모두 준비를 눌러주세요.');
        start(r);
      }else if(op==='move'){
        expire(r);
        if(r.phase!=='playing')throw Error('이미 종료된 대국입니다.');
        if(r.colors[user.id]!==r.turn)throw Error('상대방 차례입니다.');
        const x=b.x,y=b.y;
        if(r.moves===0&&(x!==7||y!==7))throw Error('첫 수는 오목판 중앙(8열 8행)에 놓아주세요.');
        const result=rules.place(r.board,x,y,r.turn);
        if(!result.ok)throw Error(result.error);
        r.last=[x,y];r.moves++;
        if(result.win)finish(r,user.id,'오목 완성',result.line);
        else if(result.draw)finish(r,null,'무승부');
        else {r.turn=r.turn===1?2:1;if(r.aiMode)queueAi(r);else {arm(r);publish(r);}}
      }else if(op==='resign'){
        if(r.phase!=='playing')throw Error('대국 중에만 기권할 수 있습니다.');
        finish(r,r.players.find(x=>x.id!==user.id).id,'기권');
      }else if(op==='rematch'){
        if(r.phase!=='complete'||r.players.length!==2)throw Error('재대결을 진행할 수 없습니다.');
        if(r.aiMode){start(r,true);return reply(200,{room:pub(r,user.id)});}
        p.rematch=true;
        if(r.players.every(x=>x.rematch))start(r,true);else publish(r);
      }else if(op==='leave'){
        if(r.phase==='playing')finish(r,r.players.find(x=>x.id!==user.id).id,'상대 퇴장');
        r.players=r.players.filter(x=>x.id!==user.id);
        if(!r.players.length){disarm(r);rooms.delete(r.id);}
        else {if(r.hostId===user.id)r.hostId=r.players[0].id;publish(r);}
        return reply(200,{room:null});
      }else throw Error('지원하지 않는 요청입니다.');
      return reply(200,{room:pub(r,user.id)});
    }catch(error){return reply(409,{error:error.message});}
  }
  return {handle,hasUser:id=>!!mine(id),findUserRoom:mine,roomCount:()=>rooms.size,close:()=>{for(const t of timers.values())clearTimer(t)}};
};

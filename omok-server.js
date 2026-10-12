'use strict';
const rules=require('./omok-engine');
module.exports=function createOmok({db,crypto,readBody,requireAuth,json,rateLimit,now=Date.now,isUserBusy=()=>false,notify=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
  const rooms=new Map(),timers=new Map();
  const TURN_MS=90000,WAIT_MS=30*60000,DONE_MS=15*60000;
  const getStats=id=>{
    const row=db.prepare('SELECT value FROM game_state WHERE key=?').get('omok:stats:'+id);
    return row?JSON.parse(row.value):{games:0,wins:0,losses:0,draws:0,streak:0,bestStreak:0};
  };
  function putStats(id,s){
    db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
      .run('omok:stats:'+id,JSON.stringify(s),now());
  }
  function record(r,winner){
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
    disarm(r);r.phase='complete';r.winner=winner;r.reason=reason;r.line=line;r.deadline=0;r.completedAt=now();
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
  function pub(r,id){
    return {id:r.id,version:r.version,phase:r.phase,round:r.round,board:r.board,last:r.last,line:r.line,
      name:r.name,hostId:r.hostId,players:r.players.map(p=>({id:p.id,nickname:p.nickname,ready:p.ready,rematch:p.rematch,color:r.colors[p.id]||0})),
      selfId:Number(id),myColor:r.colors[id]||0,myTurn:r.phase==='playing'&&r.colors[id]===r.turn,
      turn:r.turn,deadline:r.deadline,serverNow:now(),winner:r.winner,reason:r.reason,moves:r.moves};
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
    r.phase='playing';r.recorded=false;arm(r);publish(r);
  }
  function list(){
    return [...rooms.values()].filter(r=>r.phase==='waiting'&&r.players.length<2).map(r=>({
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
        return reply(200,{room:r?pub(r,user.id):null,rooms:list(),stats:getStats(user.id),leaders});
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
        if(r.phase!=='waiting'||r.players.length!==1)throw Error('이미 시작됐거나 가득 찬 방입니다.');
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
        const result=rules.place(r.board,x,y,r.turn);
        if(!result.ok)throw Error(result.error);
        r.last=[x,y];r.moves++;
        if(result.win)finish(r,user.id,'오목 완성',result.line);
        else if(result.draw)finish(r,null,'무승부');
        else {r.turn=r.turn===1?2:1;arm(r);publish(r);}
      }else if(op==='resign'){
        if(r.phase!=='playing')throw Error('대국 중에만 기권할 수 있습니다.');
        finish(r,r.players.find(x=>x.id!==user.id).id,'기권');
      }else if(op==='rematch'){
        if(r.phase!=='complete'||r.players.length!==2)throw Error('재대결을 진행할 수 없습니다.');
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

'use strict';
const E=require('./public/sichuan/engine');
module.exports=function createSichuanBattle({db,crypto,readBody,requireAuth,json,rateLimit}){
 const rooms=new Map(),levels=[6,12,18,24];
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}};
 function money(id,amount,type,memo){
  const u=db.prepare('SELECT CAST(balance AS TEXT) AS balance FROM users WHERE id=?').get(id);if(!u||BigInt(u.balance)+BigInt(amount)<0n)throw Error('참가자의 게임머니가 부족합니다.');
  const balance=BigInt(u.balance)+BigInt(amount);if(balance>9000000000000000000n)throw Error('보유 게임머니 저장 한도를 초과합니다.');db.prepare('UPDATE users SET balance=? WHERE id=?').run(balance,id);
  db.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)').run(id,amount,balance,type,memo,Date.now());
 }
 // Only this game's interrupted stakes are refunded atomically; other games retain their recovery path.
 tx(()=>{for(const e of db.prepare("SELECT * FROM room_escrow WHERE game='sichuan'").all()){money(e.user_id,e.amount,'sichuan_refund','사천성 서버 재시작 · 참가금 반환');db.prepare('DELETE FROM room_escrow WHERE room_id=? AND user_id=?').run(e.room_id,e.user_id);}});
 const player=u=>({userId:u.id,nickname:u.nickname,ready:false,pairs:0,score:0,combo:0,done:false,cleared:false,forfeit:false,left:false,finishedAt:null,actions:[],payout:0,net:0});
 function compare(a,b){return Number(a.forfeit)-Number(b.forfeit)||Number(b.cleared)-Number(a.cleared)||(a.cleared&&b.cleared?a.finishedAt-b.finishedAt:0)||b.pairs-a.pairs||b.score-a.score;}
 function ranked(r){const rows=r.players.slice().sort(compare);let rank=1;return rows.map((p,i)=>{if(i&&compare(rows[i-1],p)!==0)rank=i+1;return {...p,rank};});}
 function pub(r,id){return {code:r.code,roundId:r.roundId,status:r.status,roundNo:r.roundNo,seconds:r.seconds,maxPlayers:r.maxPlayers,bet:r.bet,pot:r.pot||0,level:r.level,seed:r.status==='waiting'?null:r.seed,hostId:r.hostId,me:id,myActions:r.players.find(p=>p.userId===id)?.actions||[],startedAt:r.startedAt,endedAt:r.endedAt,winnerId:r.winnerId,winnerIds:r.winnerIds||[],players:ranked(r).map(({actions,...p})=>p)};}
 function reset(r,level=r.level){r.players=r.players.filter(p=>!p.left);r.level=level;r.roundNo=r.roundNo||1;r.seconds=Math.max(60,E.config(level).seconds-(r.roundNo-1)*12);r.status='waiting';r.roundId=crypto.randomUUID();r.seed=null;r.startedAt=null;r.endedAt=null;r.winnerId=null;r.winnerIds=[];r.pot=0;r.updatedAt=Date.now();r.players=r.players.map(p=>player({id:p.userId,nickname:p.nickname}));}
 function settle(r){
  if(r.status!=='playing')return;
  const t=Date.now(),expired=t>r.startedAt+r.seconds*1000+5000;
  if(expired)r.players.forEach(p=>{if(!p.done){p.done=true;p.finishedAt=t;}});
  const active=r.players.filter(p=>!p.forfeit);
  if(!expired&&!r.players.every(p=>p.done)&&active.length>1)return;
  const rs=ranked(r).filter(p=>!p.forfeit),payouts=new Map();
  if(!rs.length){r.players.forEach(p=>payouts.set(p.userId,r.bet));}
  else{
   // 2 remaining: winner takes all; 3: 70/30; 4–8: 60/30/10.
   // Ties split the prizes for their occupied positions (e.g. joint 1st splits 1st+2nd).
   const weights=rs.length<=2?[100]:rs.length===3?[70,30]:[60,30,10];
   const prizes=weights.map(w=>Math.floor(r.pot*w/100));prizes[0]+=r.pot-prizes.reduce((a,b)=>a+b,0);
   for(let i=0;i<rs.length;){let end=i+1;while(end<rs.length&&compare(rs[i],rs[end])===0)end++;
    const group=rs.slice(i,end).sort((a,b)=>a.userId-b.userId),total=prizes.slice(i,end).reduce((a,b)=>a+b,0),share=Math.floor(total/group.length),rem=total%group.length;
    group.forEach((p,j)=>payouts.set(p.userId,share+(j<rem?1:0)));i=end;
   }
  }
  const winners=rs.filter(p=>p.rank===1);
  tx(()=>{for(const p of r.players){const held=db.prepare('SELECT amount FROM room_escrow WHERE room_id=? AND user_id=?').get(r.roundId,p.userId);if(!held||held.amount!==r.bet)throw Error('사천성 정산 확인이 필요합니다.');const payout=payouts.get(p.userId)||0;if(payout)money(p.userId,payout,'sichuan_payout','사천성 순위전 상금');db.prepare('DELETE FROM room_escrow WHERE room_id=? AND user_id=?').run(r.roundId,p.userId);}});
  for(const p of r.players){p.payout=payouts.get(p.userId)||0;p.net=p.payout-r.bet;}
  r.winnerIds=winners.map(p=>p.userId);r.winnerId=winners.length===1?winners[0].userId:null;r.status='complete';r.endedAt=t;r.updatedAt=t;
 }
 function cleanup(){for(const [code,r] of rooms){settle(r);if(r.status!=='playing'&&Date.now()-r.updatedAt>20*60000)rooms.delete(code);}}
 const timer=setInterval(()=>{try{cleanup();}catch(e){console.error('Sichuan settlement:',e.message);}},5000);timer.unref();
 function activeRoom(id){return [...rooms.values()].find(r=>r.status!=='complete'&&r.players.some(p=>p.userId===id&&!p.left));}
 function start(r){
  if(r.players.length!==r.maxPlayers||!r.players.every(p=>p.ready))return;
  tx(()=>{for(const p of r.players){money(p.userId,-r.bet,'sichuan_bet','사천성 참가금');db.prepare('INSERT INTO room_escrow(room_id,user_id,amount,game,created_at) VALUES(?,?,?,?,?)').run(r.roundId,p.userId,r.bet,'sichuan',Date.now());}});
  r.seed=crypto.randomInt(1,0x7fffffff);r.startedAt=Date.now()+3500;r.status='playing';r.pot=r.bet*r.players.length;
 }
 // Replay the legal moves on the authoritative seeded board. Client score/clear claims are never trusted.
 function replay(r,p,actions){
  if(!Array.isArray(actions)||actions.length>45)throw Error('잘못된 플레이 기록입니다.');
  if(actions.length<p.actions.length)return null;
  if(JSON.stringify(actions.slice(0,p.actions.length))!==JSON.stringify(p.actions))throw Error('이미 확인된 기록은 변경할 수 없습니다.');
  const g=E.create(r.level,r.seed);let pairs=0,score=0,combo=0,bestCombo=0,last=-Infinity,fever=0,hints=3,shuffles=2,prev=-1;
  for(const a of actions){
   if(!Number.isInteger(a.t)||a.t<prev||a.t<0||a.t>r.seconds*1000||a.t>Date.now()-r.startedAt+1000)throw Error('플레이 시간을 확인해주세요.');prev=a.t;
   if(a.kind==='match'){
    if(a.t-last<200||!Number.isInteger(a.a)||!Number.isInteger(a.b)||!E.path(g.board,g.cols,g.rows,a.a,a.b))throw Error('연결할 수 없는 패입니다.');
    combo=a.t-last<=g.comboWindow?combo+1:1;last=a.t;bestCombo=Math.max(bestCombo,combo);if(combo%5===0)fever=a.t+12000;score+=100*(a.t<fever?3:combo>=3?2:1);pairs++;g.board[a.a]=g.board[a.b]=0;g.board=E.compact(g.board,g.cols,g.rows,g.gravity);
    if(g.board.some(Boolean)&&!E.moves(g.board,g.cols,g.rows,true).length)g.board=E.reshuffle(g.board,g.cols,g.rows,E.rng(r.seed+pairs+91));
   }else if(a.kind==='hint'){if(--hints<0)throw Error('힌트 횟수를 초과했습니다.');}
   else if(a.kind==='shuffle'){if(--shuffles<0)throw Error('재배치 횟수를 초과했습니다.');combo=0;g.board=E.reshuffle(g.board,g.cols,g.rows,E.rng(r.seed+pairs+shuffles+17));}
   else throw Error('알 수 없는 플레이 기록입니다.');
  }
  return {actions,pairs,score,combo:bestCombo,cleared:!g.board.some(Boolean)};
 }
 async function handle(req,res,url){
  if(!url.pathname.startsWith('/api/sichuan/battle'))return false;
  const u=requireAuth(req,res);if(!u)return true;cleanup();
  const reply=(s,d)=>{json(res,s,d);return true;};
  try{
   if(url.pathname==='/api/sichuan/battle/rooms'&&req.method==='GET')return reply(200,{rooms:[...rooms.values()].filter(r=>r.status==='waiting'&&r.players.length<r.maxPlayers).slice(-30).reverse().map(r=>({code:r.code,host:r.players.find(p=>p.userId===r.hostId)?.nickname||'방장',level:r.level,roundNo:r.roundNo,seconds:r.seconds,bet:r.bet,players:r.players.length,maxPlayers:r.maxPlayers})),activeCode:activeRoom(u.id)?.code||null});
   if(url.pathname==='/api/sichuan/battle/create'&&req.method==='POST'){
    const b=await readBody(req);if(!rateLimit('sichuan_create:'+u.id,10,60000))return reply(429,{error:'잠시 후 방을 만들어주세요.'});
    if(activeRoom(u.id))return reply(409,{error:'참가 중인 사천성 방에서 먼저 나가주세요.'});
    const maxPlayers=Number(b.maxPlayers||2),bet=Number(b.bet??1000000);
    if(!Number.isInteger(maxPlayers)||maxPlayers<2||maxPlayers>8)throw Error('참가 인원은 2~8명으로 선택해주세요.');
    if(!Number.isSafeInteger(bet)||bet<1000||bet>100000000000000||bet%1000)throw Error('베팅은 1,000G~100조G, 1,000G 단위로 입력해주세요.');
    let code;do{code=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(rooms.has(code));
    const r={code,hostId:u.id,maxPlayers,bet,players:[player(u)]};reset(r,levels.includes(Number(b.level))?Number(b.level):18);rooms.set(code,r);return reply(201,{room:pub(r,u.id)});
   }
   const m=url.pathname.match(/^\/api\/sichuan\/battle\/([A-Z0-9]{6})(?:\/(join|ready|progress|leave|rematch|theme))?$/i);
   if(!m)return reply(404,{error:'대전 요청을 찾을 수 없습니다.'});
   const code=m[1].toUpperCase(),op=m[2]||'';
   // Consume POST bodies before looking up mutable state to avoid a ready/theme/rematch race.
   const b=req.method==='POST'?await readBody(req):{};const r=rooms.get(code);if(!r)return reply(404,{error:'대전방을 찾을 수 없습니다.'});
   let p=r.players.find(p=>p.userId===u.id);
   if(!op&&req.method==='GET'){if(!p)return reply(403,{error:'이 방 참가자가 아닙니다.'});r.updatedAt=Date.now();return reply(200,{room:pub(r,u.id)});}
   if(req.method!=='POST')return reply(405,{error:'지원하지 않는 요청입니다.'});
   if(op==='join'){
    if(p?.left)throw Error('이미 나간 판입니다. 다음 라운드에 참가해주세요.');
    if(!p){if(activeRoom(u.id))throw Error('기존 사천성 방에서 먼저 나가주세요.');if(r.status!=='waiting'||r.players.length>=r.maxPlayers)throw Error('시작되었거나 인원이 가득 찬 방입니다.');p=player(u);r.players.push(p);r.players.forEach(x=>x.ready=false);}
   }else{
    if(!p||p.left)return reply(403,{error:'이 방 참가자가 아닙니다.'});
    if(op==='leave'){
     if(r.status==='playing'){if(!p.done){p.forfeit=true;p.done=true;p.finishedAt=Date.now();}p.left=true;p.ready=false;settle(r);}else r.players=r.players.filter(x=>x!==p);
     if(r.hostId===u.id)r.hostId=r.players.find(x=>!x.left)?.userId||r.hostId;
     if(!r.players.length)rooms.delete(code);return reply(200,{ok:true});
    }
    if(op==='rematch'||op==='theme'){
     if(r.hostId!==u.id)throw Error('방장만 재대결과 테마를 변경할 수 있습니다.');if(r.status==='playing')throw Error('진행 중에는 변경할 수 없습니다.');
     if(op==='theme'&&!levels.includes(Number(b.level)))throw Error('선택할 수 없는 테마입니다.');if(op==='rematch'&&r.status!=='complete')throw Error('이번 판 종료 후 다음 라운드로 이동할 수 있습니다.');r.roundNo=op==='rematch'?r.roundNo+1:1;reset(r,op==='theme'?Number(b.level):r.level);
    }else if(op==='ready'){
     if(r.status!=='waiting'||b.roundId!==r.roundId)throw Error('대기실을 새로 확인해주세요.');p.ready=b.ready!==false;try{start(r);}catch(e){r.players.forEach(x=>x.ready=false);throw e;}
    }else if(op==='progress'){
     if(b.roundId!==r.roundId)throw Error('종료된 판의 기록입니다.');if(r.status==='complete')return reply(200,{room:pub(r,u.id)});
     if(r.status!=='playing'||Date.now()<r.startedAt)throw Error('아직 시작하지 않았습니다.');
     if(!rateLimit('sichuan_progress:'+u.id,90,60000))return reply(429,{error:'플레이 기록 전송이 너무 빠릅니다.'});
     if(!p.done){const result=replay(r,p,b.actions);if(result){Object.assign(p,result);if(p.cleared||b.done){p.done=true;p.finishedAt=Date.now();}}}settle(r);
    }else throw Error('지원하지 않는 요청입니다.');
   }
   r.updatedAt=Date.now();return reply(200,{room:pub(r,u.id)});
  }catch(e){return reply(400,{error:e.message});}
 }
 return {handle,roomCount:()=>rooms.size,close:()=>clearInterval(timer)};
};

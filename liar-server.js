'use strict';
// JUNJA LAND Liar Game: authoritative roles, turns, votes and timers stay server-side.
const CATEGORIES={
  음식:['떡볶이','김치찌개','삼겹살','붕어빵','초밥','비빔밥','햄버거','마라탕','라면','냉면','짜장면','치킨','피자','수박','김밥','순대'],
  장소:['놀이공원','도서관','찜질방','공항','동물원','영화관','편의점','병원','미용실','노래방','학교','헬스장','지하철역','수영장','캠핑장'],
  동물:['호랑이','펭귄','기린','고양이','돌고래','판다','독수리','코끼리','토끼','악어','여우','해파리','사자','앵무새','거북이'],
  직업:['소방관','의사','요리사','경찰관','가수','유튜버','변호사','교사','우주비행사','택배기사','아나운서','사진작가','마술사','파일럿','디자이너'],
  생활:['에어컨','우산','휴대전화','충전기','선글라스','자전거','냉장고','선풍기','칫솔','거울','이어폰','베개','리모컨','알람시계','텀블러'],
  취미:['등산','낚시','캠핑','축구','배드민턴','볼링','요가','수영','사진촬영','독서','노래','춤','게임','요리','보드게임'],
  여행:['제주도','부산','서울','파리','도쿄','베트남','태국','하와이','스위스','뉴욕','경주','강릉','오사카','로마','발리'],
  문화:['드라마','영화','웹툰','콘서트','뮤지컬','연극','아이돌','축제','노래방','악기','전시회','사진전','애니메이션','패션쇼','팬미팅']
};
const NAMES=Object.keys(CATEGORIES);
const DURATIONS={clue:45000,discussion:70000,vote:45000,guess:30000};
const MAX_PLAYERS=10;
module.exports=function createLiarGame({db,crypto,readBody,requireAuth,json,rateLimit,now=Date.now,isUserBusy=()=>false,notify=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
 const rooms=new Map(),timers=new Map();
 const freshStats=()=>({games:0,wins:0,losses:0,liarGames:0,liarWins:0,caught:0,streak:0,bestStreak:0});
 const getStats=id=>{try{const row=db.prepare('SELECT value FROM game_state WHERE key=?').get('liar:stats:'+id);return row?{...freshStats(),...JSON.parse(row.value)}:freshStats();}catch{return freshStats();}};
 function setStats(id,stats){db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run('liar:stats:'+id,JSON.stringify(stats),now());}
 const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
 const clean=s=>String(s??'').trim();
 const normalize=s=>clean(s).toLocaleLowerCase('ko').replace(/[\s\p{P}\p{S}]/gu,'');
 const member=(r,id)=>r.players.find(p=>p.id===Number(id));
 function publish(r){r.version++;r.updated=now();notify(r.players.map(p=>p.id),r.id);}
 function disarm(r){const timer=timers.get(r.id);if(timer)clearTimer(timer);timers.delete(r.id);}
 function arm(r,phase,ms){disarm(r);r.phase=phase;r.deadline=now()+ms;const deadline=r.deadline;const timer=setTimer(()=>{if(rooms.get(r.id)===r&&r.deadline===deadline)expire(r);},ms+80);if(timer&&typeof timer.unref==='function')timer.unref();timers.set(r.id,timer);publish(r);}
 function log(r,text){r.events.push({text,at:now()});if(r.events.length>20)r.events.shift();}
 function finish(r,camp,reason,valid=true){
  disarm(r);r.phase='complete';r.deadline=0;r.winner=camp;r.reason=reason;r.completedAt=now();
  if(valid&&!r.recorded){
   r.recorded=true;
   for(const p of r.players){const s=getStats(p.id),won=(camp==='liar')===(p.id===r.liarId);
    s.games++;if(p.id===r.liarId){s.liarGames++;if(won)s.liarWins++;}else if(camp==='citizens')s.caught++;
    if(won){s.wins++;s.streak++;s.bestStreak=Math.max(s.bestStreak,s.streak);}else{s.losses++;s.streak=0;}setStats(p.id,s);
   }
  }
  log(r,reason);publish(r);
 }
 function startVote(r,eligible=null){
  r.votes={};r.voteOptions=eligible||r.players.filter(p=>!p.left).map(p=>p.id);
  arm(r,'vote',DURATIONS.vote);
  log(r,eligible?'동점자 재투표가 시작되었습니다.':'투표가 시작되었습니다.');
 }
 function tally(r){
  const active=r.players.filter(p=>!p.left);
  const counts=new Map(r.voteOptions.map(id=>[id,0]));
  for(const p of active){const id=r.votes[p.id];if(counts.has(id))counts.set(id,counts.get(id)+1);}
  const highest=Math.max(0,...counts.values());
  const tied=[...counts].filter(([,v])=>v===highest).map(([id])=>id);
  if(highest===0){finish(r,'liar','아무도 투표하지 않아 라이어가 살아남았습니다.');return;}
  if(tied.length>1){
   if(r.runoff===0){r.runoff=1;startVote(r,tied);return;}
   finish(r,'liar','재투표에서도 동점! 라이어가 의심을 피했습니다.');return;
  }
  r.suspectId=tied[0];
  if(r.suspectId!==r.liarId){finish(r,'liar','엉뚱한 사람을 지목했습니다. 라이어 승리!');return;}
  arm(r,'guess',DURATIONS.guess);log(r,'라이어를 잡았습니다! 라이어에게 마지막 정답 기회가 주어집니다.');
 }
 function advanceClue(r){
  const total=r.order.length*r.clueRounds;
  let cursor=r.cursor+1;
  while(cursor<total&&member(r,r.order[cursor%r.order.length])?.left)cursor++;
  r.cursor=cursor;
  if(cursor>=total){arm(r,'discussion',DURATIONS.discussion);log(r,'모든 힌트가 끝났습니다. 토론을 시작하세요.');}
  else arm(r,'clue',DURATIONS.clue);
 }
 function expire(r){
  let guard=0;
  while(r.deadline&&now()>=r.deadline&&guard++<8){
   if(r.phase==='clue'){const id=r.order[r.cursor%r.order.length];r.clues.push({userId:id,round:Math.floor(r.cursor/r.order.length)+1,text:'시간 초과 · 힌트 없음',skipped:true});advanceClue(r);}
   else if(r.phase==='discussion')startVote(r);
   else if(r.phase==='vote')tally(r);
   else if(r.phase==='guess')finish(r,'citizens','라이어가 정답을 맞히지 못했습니다. 시민 승리!');
   else break;
  }
 }
 function cleanup(){
  for(const r of rooms.values()){
   expire(r);
   if(r.phase==='waiting'&&now()-r.updated>30*60000||r.phase==='complete'&&now()-r.completedAt>20*60000){disarm(r);rooms.delete(r.id);}
  }
 }
 function mine(id){cleanup();return [...rooms.values()].find(r=>member(r,id))||null;}
 function overview(r){return {id:r.id,name:r.name,host:r.players.find(p=>p.id===r.hostId)?.nickname||'방장',players:r.players.length,max:r.max,private:r.private,clueRounds:r.clueRounds};}
 function view(r,id){
  const p=member(r,id),done=r.phase==='complete',live=r.phase!=='waiting'&&!done,liar=p.id===r.liarId;
  return {id:r.id,name:r.name,version:r.version,phase:r.phase,hostId:r.hostId,selfId:Number(id),players:r.players.map(x=>({id:x.id,nickname:x.nickname,ready:x.ready,left:!!x.left})),max:r.max,private:r.private,round:r.round,clueRounds:r.clueRounds,
   category:live||done?r.category:null,secret:live?(liar?null:r.word):done?r.word:null,role:live?(liar?'liar':'citizen'):done?(liar?'liar':'citizen'):null,
   clues:r.clues||[],messages:r.messages||[],events:r.events||[],cursor:r.cursor||0,order:r.order||[],votesCast:Object.keys(r.votes||{}).map(Number),votedFor:r.votes?.[id]||null,voteOptions:r.voteOptions||[],runoff:r.runoff||0,
   suspectId:done?r.suspectId||null:null,liarId:done?r.liarId:null,winner:done?r.winner:null,reason:done?r.reason:null,guess:done?r.guess:null,
   turnId:r.phase==='clue'?r.order[r.cursor%r.order.length]:null,clueRound:r.phase==='clue'?Math.floor(r.cursor/r.order.length)+1:null,deadline:r.deadline,serverNow:now()};
 }
 function newRound(r){
  if(r.players.length<3||r.players.length>r.max)throw Error('3명 이상 모여야 시작할 수 있습니다.');
  if(r.players.some(p=>!p.ready))throw Error('모든 참가자가 준비해야 합니다.');
  r.round++;const category=r.requestedCategory==='랜덤'?NAMES[crypto.randomInt(NAMES.length)]:r.requestedCategory;
  const options=CATEGORIES[category].filter(w=>!r.recent.includes(w));const word=(options.length?options:CATEGORIES[category])[crypto.randomInt((options.length?options:CATEGORIES[category]).length)];
  r.recent.push(word);r.recent=r.recent.slice(-8);r.category=category;r.word=word;
  r.liarId=r.players[crypto.randomInt(r.players.length)].id;r.order=shuffle(r.players.map(p=>p.id));r.cursor=0;
  r.players.forEach(p=>{p.ready=false;p.left=false;});
  r.clues=[];r.messages=[];r.events=[];r.votes={};r.voteOptions=[];r.runoff=0;r.guess=null;r.suspectId=null;r.winner=null;r.reason=null;r.recorded=false;
  log(r,'역할과 제시어가 비밀 배정되었습니다.');arm(r,'clue',DURATIONS.clue);
 }
 async function handle(req,res,url){
  if(!url.pathname.startsWith('/api/liar'))return false;
  const user=requireAuth(req,res);if(!user)return true;
  const reply=(status,data)=>{json(res,status,data);return true;};
  try{
   if(!rateLimit('liar:'+user.id,180,60000))return reply(429,{error:'요청이 너무 빠릅니다.'});
   const b=req.method==='POST'?await readBody(req):{};
   cleanup();
   if(url.pathname==='/api/liar'&&req.method==='GET'){
    const r=mine(user.id);
    const leaders=db.prepare("SELECT key,value FROM game_state WHERE key LIKE 'liar:stats:%'").all()
     .map(row=>({...JSON.parse(row.value),id:Number(row.key.slice(11))})).filter(s=>s.games>0)
     .sort((a,b)=>b.wins-a.wins||b.bestStreak-a.bestStreak).slice(0,10)
     .map(s=>({...s,nickname:db.prepare('SELECT nickname FROM users WHERE id=?').get(s.id)?.nickname||'회원'}));
    return reply(200,{room:r?view(r,user.id):null,rooms:[...rooms.values()].filter(r=>r.phase==='waiting'&&!r.private&&r.players.length<r.max).map(overview),stats:getStats(user.id),leaders,categories:['랜덤',...NAMES]});
   }
   if(url.pathname==='/api/liar/create'&&req.method==='POST'){
    if(mine(user.id)||isUserBusy(user.id))throw Error('참가 중인 다른 게임방에서 먼저 나와주세요.');
    if(!rateLimit('liar-create:'+user.id,6,60000))throw Error('방 생성은 잠시 후 다시 시도하세요.');
    const category=NAMES.includes(b.category)?b.category:'랜덤',max=Math.max(3,Math.min(10,Math.trunc(Number(b.max)||8)));
    const r={id:'LI'+crypto.randomBytes(7).toString('hex'),name:clean(b.name).slice(0,28)||'준자 라이어 파티',max,private:b.private===true,requestedCategory:category,clueRounds:b.clueRounds===1?1:2,
     hostId:user.id,players:[{id:user.id,nickname:user.nickname,ready:false,left:false}],phase:'waiting',version:0,round:0,recent:[],deadline:0,updated:now(),events:[]};
    rooms.set(r.id,r);publish(r);return reply(201,{room:view(r,user.id)});
   }
   const m=url.pathname.match(/^\/api\/liar\/(LI[a-f0-9]{14})(?:\/(join|ready|start|clue|chat|vote|guess|next|kick|leave))?$/);
   if(!m)return reply(404,{error:'지원하지 않는 라이어게임 요청입니다.'});
   const r=rooms.get(m[1]);if(!r)return reply(404,{error:'종료된 라이어게임 방입니다. 로비로 돌아가주세요.'});
   expire(r);const op=m[2];
   if(op==='join'&&req.method==='POST'){
    if(member(r,user.id))return reply(200,{room:view(r,user.id)});
    if(mine(user.id)||isUserBusy(user.id))throw Error('다른 게임방에서 먼저 나와주세요.');
    if(r.phase!=='waiting'||r.players.length>=r.max)throw Error('이미 시작했거나 정원이 가득 찬 방입니다.');
    r.players.push({id:user.id,nickname:user.nickname,ready:false,left:false});publish(r);return reply(200,{room:view(r,user.id)});
   }
   const p=member(r,user.id);
   if(!p)return reply(403,{error:'이 게임방 참가자가 아닙니다.'});
   if(!op&&req.method==='GET')return reply(200,{room:view(r,user.id)});
   if(req.method!=='POST')return reply(405,{error:'지원하지 않는 요청 방식입니다.'});
   if(op==='ready'){
    if(r.phase!=='waiting')throw Error('현재 준비할 수 없습니다.');
    p.ready=b.ready===true;publish(r);
   }else if(op==='start'){
    if(r.phase!=='waiting'||r.hostId!==user.id)throw Error('방장만 게임을 시작할 수 있습니다.');
    newRound(r);
   }else if(op==='clue'){
    if(r.phase!=='clue'||p.left||r.order[r.cursor%r.order.length]!==user.id)throw Error('지금은 내 힌트 차례가 아닙니다.');
    const clue=clean(b.text).replace(/\s+/g,' ').slice(0,48);
    if(clue.length<2)throw Error('힌트는 두 글자 이상 입력해주세요.');
    if(normalize(clue).includes(normalize(r.word)))throw Error('정답 단어를 직접 말하면 안 됩니다.');
    r.clues.push({userId:user.id,round:Math.floor(r.cursor/r.order.length)+1,text:clue});
    advanceClue(r);
   }else if(op==='chat'){
    if(!['discussion','vote'].includes(r.phase)||p.left)throw Error('토론 시간에만 메시지를 보낼 수 있습니다.');
    if(!rateLimit('liar-chat:'+user.id,7,10000))throw Error('채팅은 잠시 천천히 입력해주세요.');
    const message=clean(b.text).replace(/\s+/g,' ').slice(0,160);
    if(!message)throw Error('메시지를 입력해주세요.');
    if(normalize(message).includes(normalize(r.word)))throw Error('제시어 자체는 공개할 수 없습니다.');
    r.messages.push({id:crypto.randomBytes(5).toString('hex'),userId:user.id,nickname:p.nickname,text:message,at:now()});r.messages=r.messages.slice(-80);publish(r);
   }else if(op==='vote'){
    if(r.phase!=='vote'||p.left)throw Error('투표 시간이 아닙니다.');
    if(r.votes[user.id])throw Error('이미 투표했습니다.');
    const target=Number(b.targetId);
    if(!r.voteOptions.includes(target)||target===user.id)throw Error('자신이 아닌 투표 후보를 선택해주세요.');
    r.votes[user.id]=target;publish(r);
    if(r.players.filter(x=>!x.left).every(x=>r.votes[x.id]))tally(r);
   }else if(op==='guess'){
    if(r.phase!=='guess'||user.id!==r.liarId)throw Error('라이어만 최후의 정답을 제출할 수 있습니다.');
    const guess=clean(b.text).slice(0,40);if(!guess)throw Error('정답을 입력해주세요.');
    r.guess=guess;finish(r,normalize(guess)===normalize(r.word)?'liar':'citizens',normalize(guess)===normalize(r.word)?'라이어가 제시어를 맞혔습니다!':'라이어가 제시어를 틀렸습니다. 시민 승리!');
   }else if(op==='next'){
    if(r.phase!=='complete'||r.hostId!==user.id)throw Error('방장만 다음 판을 준비할 수 있습니다.');
    r.phase='waiting';r.deadline=0;r.players.forEach(p=>p.ready=false);r.liarId=null;r.word=null;r.events=[];r.clues=[];r.messages=[];r.votes={};publish(r);
   }else if(op==='kick'){
    if(r.phase!=='waiting'||r.hostId!==user.id)throw Error('대기실에서 방장만 내보낼 수 있습니다.');
    const target=Number(b.targetId);if(target===user.id||!member(r,target))throw Error('대상을 확인해주세요.');
    r.players=r.players.filter(x=>x.id!==target);publish(r);
   }else if(op==='leave'){
    if(r.phase==='clue'||r.phase==='discussion'||r.phase==='vote'||r.phase==='guess'){
     p.left=true;
     const active=r.players.filter(x=>!x.left);
     if(p.id===r.liarId)finish(r,'citizens','라이어가 게임 중 퇴장했습니다. 시민 승리!');
     else if(active.length<3)finish(r,null,'인원 부족으로 게임이 중단되었습니다.',false);
     else if(r.phase==='clue'&&r.order[r.cursor%r.order.length]===p.id)advanceClue(r);
     else if(r.phase==='vote'&&active.every(x=>r.votes[x.id]))tally(r);
     else publish(r);
    }
    r.players=r.players.filter(x=>x.id!==user.id);
    if(!r.players.length){disarm(r);rooms.delete(r.id);}
    else{if(r.hostId===user.id)r.hostId=r.players[0].id;publish(r);}
    return reply(200,{room:null});
   }else throw Error('지원하지 않는 게임 동작입니다.');
   return reply(200,{room:view(r,user.id)});
  }catch(e){return reply(409,{error:e.message||'처리 중 오류가 발생했습니다.'});}
 }
 return {handle,hasUser:id=>!!mine(id),findUserRoom:mine,roomCount:()=>rooms.size,close:()=>{for(const timer of timers.values())clearTimer(timer);}};
};

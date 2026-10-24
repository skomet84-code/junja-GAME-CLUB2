'use strict';
// JUNJA ROYAL CARDS · authoritative multiplayer + bot game server.
// Game money/accounts never manipulated; only optional win/loss statistics in game_state.
const SUITS=['S','H','D','C'];
const LABEL={S:'♠',H:'♥',D:'♦',C:'♣'};
const isBot=p=>!!p.bot;
const rank=c=>c.startsWith('JOK')?0:Number(c.slice(1));
const suit=c=>c.startsWith('JOK')?'J':c[0];
const value=c=>rank(c)||15;
const cardDeck=(joker=false)=>SUITS.flatMap(s=>Array.from({length:13},(_,i)=>s+(i+1))).concat(joker?['JOKB','JOKR']:[]);
const sameCards=(cards)=>new Set(cards).size===cards.length;
const sum=cards=>cards.reduce((n,c)=>n+value(c),0);
function meldKind(cards){
 if(!cards.length||!sameCards(cards)||cards.some(c=>suit(c)==='J'))return null;
 if(cards.length===1&&rank(cards[0])===7)return 'seven';
 if(cards.length<3)return null;
 const ranks=cards.map(rank);
 if(ranks.every(n=>n===ranks[0])&&new Set(cards.map(suit)).size===cards.length&&cards.length<=4)return 'set';
 if(cards.every(c=>suit(c)===suit(cards[0]))){
  const s=ranks.slice().sort((a,b)=>a-b);
  if(s.every((v,i)=>!i||v===s[i-1]+1))return 'run';
 }
 return null;
}
function attachable(cards,card,kind){
 if(cards.includes(card)||suit(card)==='J')return false;
 if(kind==='set')return cards.length<4&&rank(card)===rank(cards[0])&&!cards.some(c=>suit(c)===suit(card));
 if(kind==='seven')return suit(card)===suit(cards[0])&&[6,8].includes(rank(card));
 if(kind==='run')return suit(card)===suit(cards[0])&&Math.min(...cards.map(rank))-1===rank(card)||kind==='run'&&suit(card)===suit(cards[0])&&Math.max(...cards.map(rank))+1===rank(card);
 return false;
}
function findThank(hand,discard){
 if(!discard)return null;
 if(rank(discard)===7)return [discard];
 for(let a=0;a<hand.length;a++)for(let b=a+1;b<hand.length;b++){
  const pair=[discard,hand[a],hand[b]];
  if(meldKind(pair))return pair;
 }
 return null;
}
function combinations(arr){
 const out=[];
 for(let i=0;i<arr.length;i++)if(rank(arr[i])===7)out.push([arr[i]]);
 for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++)for(let k=j+1;k<arr.length;k++){
  const cs=[arr[i],arr[j],arr[k]];
  if(meldKind(cs))out.push(cs);
 }
 return out.sort((a,b)=>sum(b)-sum(a));
}
const attackValue=c=>c==='JOKR'?7:c==='JOKB'?5:rank(c)===2?2:rank(c)===1?(suit(c)==='S'?5:3):0;
const attackLevel=c=>c==='JOKR'?5:c==='JOKB'?4:rank(c)===1?3:rank(c)===2?2:0;
module.exports=function createRoyalCards({db,crypto,requireAuth,readBody,json,rateLimit=()=>true,otherBusy=()=>false,notify=()=>{},now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}){
 const rooms=new Map(),timers=new Map();
 const shuffle=a=>{for(let i=a.length-1;i>0;i--){let j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
 const player=(r,id)=>r.players.find(p=>String(p.id)===String(id));
 const current=r=>r.players[r.turn];
 const log=(r,msg)=>{r.events.push({text:msg,at:now()});r.events=r.events.slice(-16);};
 const saveStat=(id,game,won)=>{
  if(typeof id!=='number')return;
  const key='royalcards:stats:'+game+':'+id;
  let stats={games:0,wins:0,bestStreak:0,streak:0};
  try{const rec=db.prepare('SELECT value FROM game_state WHERE key=?').get(key);if(rec)stats={...stats,...JSON.parse(rec.value)};}catch{}
  stats.games++;if(won){stats.wins++;stats.streak++;stats.bestStreak=Math.max(stats.bestStreak,stats.streak);}else stats.streak=0;
  db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(key,JSON.stringify(stats),now());
 };
 const publicStats=(id,game)=>{try{const r=db.prepare('SELECT value FROM game_state WHERE key=?').get('royalcards:stats:'+game+':'+id);return r?JSON.parse(r.value):{games:0,wins:0,bestStreak:0,streak:0};}catch{return {games:0,wins:0,bestStreak:0,streak:0};}};
 function publish(r){r.version++;r.updated=now();notify(r.players.filter(p=>!p.bot).map(p=>p.id),r.id);}
 function clear(r){let t=timers.get(r.id);if(t)clearTimer(t);timers.delete(r.id);r.deadline=0;}
 function finish(r,p,why){
  if(r.phase==='done')return;
  clear(r);r.phase='done';r.winner=p.id;r.reason=why;r.finishedAt=now();
  log(r,p.name+' 승리 · '+why);
  if(!r.recorded){r.recorded=true;for(const who of r.players)if(!who.bot)saveStat(who.id,r.game,who.id===p.id);}
  publish(r);
 }
 function advance(r,steps=1){
  r.turn=(r.turn+(steps*r.direction)+r.players.length*50)%r.players.length;
  if(r.game==='hula')r.drew=false;
  arm(r);
 }
 function arm(r){
  clear(r);if(r.phase!=='playing')return;
  const p=current(r),stamp=r.version;
  r.deadline=now()+(p.bot?1100:50000);publish(r);
  const timer=setTimer(()=>{
   if(rooms.get(r.id)!==r||r.phase!=='playing'||r.version!==stamp+1)return;
   try{if(p.bot)botAct(r);else timeout(r);}catch(err){console.error('[ROYAL CARDS]',err.message);timeout(r);}
  },p.bot?850:50100);
  if(timer&&timer.unref)timer.unref();
  timers.set(r.id,timer);
 }
 function fresh(r){
  clear(r);r.phase='playing';r.round++;r.direction=1;r.turn=0;r.deck=shuffle(cardDeck(r.game==='onecard'));
  r.discard=[];r.melds=[];r.pending=0;r.attackRank=0;r.suit=null;r.drew=false;r.thankWindow=null;r.winner=null;r.reason=null;r.recorded=false;
  r.players.forEach(p=>{p.ready=false;p.hand=[];for(let i=0;i<7;i++)p.hand.push(r.deck.pop());});
  if(r.game==='onecard'){
   const first=r.deck.findIndex(c=>!attackValue(c)&&![7,11,12,13].includes(rank(c)));
   r.discard.push(first<0?r.deck.pop():r.deck.splice(first,1)[0]);
   r.suit=suit(r.discard.at(-1));
  }else r.discard.push(r.deck.pop());
  log(r,'새 라운드 시작! '+r.players.length+'명 입장');arm(r);
 }
 function view(r,id){
  const p=player(r,id),active=current(r),last=r.discard.at(-1);
  const legal=r.game==='onecard'&&r.phase==='playing'&&p.id===active.id?p.hand.filter(c=>canPlay(r,c)): [];
  const allowedMelds=r.game==='hula'&&r.phase==='playing'&&p.id===active.id&&r.drew?combinations(p.hand):[];
  return {id:r.id,name:r.name,game:r.game,mode:r.mode,round:r.round,phase:r.phase,version:r.version,selfId:id,hostId:r.hostId,
   players:r.players.map(x=>({id:x.id,name:x.name,bot:x.bot||false,ready:x.ready,cardCount:x.hand.length,score:r.game==='hula'?null:undefined})),
   max:r.max,turnId:active?.id,direction:r.direction,deadline:r.deadline,serverNow:now(),
   hand:p.hand.slice(),deckCount:r.deck.length,discard:last,suit:r.suit,pending:r.pending,attackRank:r.attackRank,
   drew:r.drew,legal,allowedMelds,canThank:r.phase==='thank'&&r.thankWindow?.eligible.includes(p.id),thankDeadline:r.thankWindow?.until||0,melds:r.melds.map(m=>({owner:m.owner,cards:m.cards.slice(),kind:m.kind})),
   events:r.events.slice(-10),winner:r.winner,reason:r.reason,
   finalScores:r.phase==='done'&&r.game==='hula'?r.players.map(x=>({id:x.id,score:sum(x.hand),cards:x.hand.slice()})):null};
 }
 function mine(id){return [...rooms.values()].find(r=>player(r,id));}
 function cleanup(){for(const r of rooms.values())if(r.phase==='done'&&now()-r.finishedAt>30*60000||r.phase==='waiting'&&now()-r.updated>50*60000){clear(r);rooms.delete(r.id);}}
 function replenish(r){if(r.deck.length)return;if(r.discard.length>1){const top=r.discard.pop();r.deck=shuffle(r.discard);r.discard=[top];}}
 function draw(r,p,n){for(let i=0;i<n;i++){replenish(r);if(!r.deck.length)break;p.hand.push(r.deck.pop());}}
 function canPlay(r,c){
  const top=r.discard.at(-1);
  if(r.pending){return attackValue(c)>0&&attackLevel(c)>=r.attackRank || r.attackRank===2 && rank(c)===3 && suit(c)===suit(r.discard.at(-1));}
  if(c.startsWith('JOK'))return true;
  return rank(c)===rank(top)||suit(c)===r.suit||rank(c)===7&&suit(c)===r.suit;
 }
 function onePlay(r,p,card,chosen,call){
  if(!p.hand.includes(card))throw Error('보유하지 않은 카드야.');
  if(!canPlay(r,card))throw Error('색·숫자 또는 공격 규칙이 맞지 않아.');
  if((rank(card)===7||suit(card)==='J')&&!SUITS.includes(chosen))throw Error('바꿀 무늬를 선택해줘.');
  p.hand.splice(p.hand.indexOf(card),1);r.discard.push(card);
  if(suit(card)!=='J')r.suit=suit(card);
  if(rank(card)===7||suit(card)==='J')r.suit=chosen;
  const attack=attackValue(card);
  if(attack){r.pending+=attack;r.attackRank=attackLevel(card);}
  else if(r.pending&&rank(card)===3){r.pending=0;r.attackRank=0;log(r,p.name+' · 3 방어 성공');}
  log(r,p.name+' · '+(suit(card)==='J'?'JOKER':LABEL[suit(card)]+(rank(card)===1?'A':rank(card)===11?'J':rank(card)===12?'Q':rank(card)===13?'K':rank(card)))+(attack?' 공격 +'+attack:''));
  if(p.hand.length===1&&!call){draw(r,p,2);log(r,p.name+' 원카드 선언 누락 · 벌칙 2장');}
  if(!p.hand.length){finish(r,p,'ONE CARD 완주');return;}
  if(rank(card)===12){r.direction*=-1;}
  if(rank(card)===13){arm(r);return;}
  advance(r,rank(card)===11?2:1);
 }
 function oneDraw(r,p){
  if(r.pending){const n=r.pending;r.pending=0;r.attackRank=0;draw(r,p,n);log(r,p.name+' 공격 누적 '+n+'장 받기');advance(r);return;}
  draw(r,p,1);log(r,p.name+' 한 장 받기');advance(r);
 }
 function hulaMeld(r,p,cards,logIt=true){
  if(!Array.isArray(cards)||!cards.length||!sameCards(cards)||cards.some(c=>!p.hand.includes(c)))throw Error('내 손패에서 등록할 카드를 선택해줘.');
  const kind=meldKind(cards);
  if(!kind)throw Error('등록은 동일 숫자 3장, 같은 무늬 연속 3장, 또는 7 한 장만 가능해.');
  const priorRegistration=p.registered;
  cards.forEach(c=>p.hand.splice(p.hand.indexOf(c),1));
  r.melds.push({owner:p.id,cards:cards.slice(),kind});p.registered=true;
  if(logIt)log(r,p.name+' · '+(kind==='seven'?'세븐 등록':kind==='set'?'땡 등록':'연속 등록'));
  if(!p.hand.length)finish(r,p,priorRegistration?'모두 등록하고 완주':'훌라!');
 }
 function hulaAttach(r,p,card,index){
  const m=r.melds[index];if(!m||!p.hand.includes(card)||!p.registered)throw Error('등록 후 바닥 조합에 붙일 수 있어.');
  if(!attachable(m.cards,card,m.kind))throw Error('붙일 수 없는 카드야.');
  p.hand.splice(p.hand.indexOf(card),1);m.cards.push(card);
  if(m.kind==='seven')m.kind='run';
  log(r,p.name+' · 붙이기 '+LABEL[suit(card)]+rank(card));
  if(!p.hand.length)finish(r,p,'모두 붙이고 완주');
 }
 function hulaDraw(r,p,source){
  if(r.drew)throw Error('이미 카드를 받았어.');
  if(source==='discard'){
   const c=r.discard.at(-1),cards=findThank(p.hand,c);
   if(!cards)throw Error('버림패로 즉시 등록할 조합이 없어. 더미에서 받아줘.');
   r.discard.pop();p.hand.push(c);r.drew=true;
   hulaMeld(r,p,cards);log(r,p.name+' · 땡큐!');
  }else{
   replenish(r);
   if(!r.deck.length){const a=r.players.slice().sort((x,y)=>sum(x.hand)-sum(y.hand))[0];finish(r,a,'카드 소진 · 최저 점수');return;}
   p.hand.push(r.deck.pop());r.drew=true;log(r,p.name+' · 더미에서 한 장 받기');
  }
  if(r.phase==='playing')arm(r);
 }
 function startThank(r,p){
  const possible=r.players.filter(x=>x!==p&&findThank(x.hand,r.discard.at(-1)));
  if(!possible.length){advance(r);return;}
  clear(r);r.phase='thank';r.thankWindow={eligible:possible.map(x=>x.id),until:now()+6200,discardedBy:p.id};
  log(r,'땡큐! 마지막 버림패로 등록할 수 있는 참가자에게 6초 기회');publish(r);
  const stamp=r.version;
  const bot=possible.find(x=>x.bot),delay=bot?1100:6200;
  const timer=setTimer(()=>{
   if(rooms.get(r.id)!==r||r.phase!=='thank'||r.version!==stamp)return;
   if(bot){try{thank(r,bot);}catch(e){console.warn('[CARDS] bot thank:',e.message);resumeThank(r);}}
   else resumeThank(r);
  },delay);
  if(timer?.unref)timer.unref();timers.set(r.id,timer);
 }
 function resumeThank(r){clear(r);r.thankWindow=null;r.phase='playing';advance(r);}
 function thank(r,p){
  if(r.phase!=='thank'||!r.thankWindow||!r.thankWindow.eligible.includes(p.id))throw Error('지금 땡큐로 받을 수 있는 카드가 없어.');
  if(now()>r.thankWindow.until)throw Error('땡큐 시간이 끝났어.');
  const top=r.discard.at(-1),cards=findThank(p.hand,top);
  if(!cards)throw Error('등록 가능한 땡큐 조합이 없어.');
  clear(r);r.phase='playing';r.thankWindow=null;r.turn=r.players.indexOf(p);r.drew=true;
  r.discard.pop();p.hand.push(top);hulaMeld(r,p,cards);log(r,p.name+' · 땡큐! 차례 가져오기');
  if(r.phase==='playing')arm(r);
 }
 function hulaDiscard(r,p,card){
  if(!r.drew)throw Error('먼저 카드를 받아줘.');
  if(!p.hand.includes(card))throw Error('내 패 중에서 버릴 카드를 골라줘.');
  p.hand.splice(p.hand.indexOf(card),1);r.discard.push(card);
  log(r,p.name+' · 버리기 '+LABEL[suit(card)]+(rank(card)===1?'A':rank(card)));
  if(!p.hand.length){finish(r,p,p.registered?'완주':'훌라!');return;}
  startThank(r,p);
 }
 function hulaStop(r,p){
  if(r.drew||r.round===0)throw Error('스톱은 내 차례의 첫 행동에서만 가능해.');
  const points=sum(p.hand);if(points>10)throw Error('스톱은 손패 10점 이하에서 가능해.');
  const other=r.players.filter(x=>x!==p).sort((a,b)=>sum(a.hand)-sum(b.hand));
  const rival=other[0];
  if(rival&&sum(rival.hand)<=points)finish(r,rival,p.name+' 스톱 실패 · '+points+'점');
  else finish(r,p,'스톱 성공 · '+points+'점');
 }
 function timeout(r){
  if(r.phase!=='playing')return;
  const p=current(r);log(r,p.name+' 제한시간 만료 · 자동 진행');
  if(r.game==='onecard'){oneDraw(r,p);return;}
  if(!r.drew){hulaDraw(r,p,'stock');}
  if(r.phase==='playing'){const worst=p.hand.slice().sort((a,b)=>value(b)-value(a))[0];if(worst)hulaDiscard(r,p,worst);}
 }
 function botAct(r){
  if(r.phase!=='playing'||!current(r).bot)return;
  const p=current(r);
  if(r.game==='onecard'){
   const cards=p.hand.filter(c=>canPlay(r,c));
   if(!cards.length){oneDraw(r,p);return;}
   cards.sort((a,b)=>{
    const prefer=c=>(attackValue(c)?6:0)+(rank(c)===7?4:0)+(rank(c)===13?3:0)+(rank(c)===11?3:0)+(rank(c)===12?2:0);
    return prefer(b)-prefer(a);
   });
   const c=cards[0],remaining=p.hand.filter(x=>x!==c),suitCounts=SUITS.map(s=>[s,remaining.filter(x=>suit(x)===s).length]).sort((a,b)=>b[1]-a[1]);
   onePlay(r,p,c,suitCounts[0][0],true);return;
  }
  if(!r.drew){
   const top=r.discard.at(-1);
   hulaDraw(r,p,findThank(p.hand,top)?'discard':'stock');
   if(r.phase!=='playing'||current(r)!==p)return;
  }
  let max=15;
  while(r.phase==='playing'&&max-->0){
   const found=combinations(p.hand)[0];if(found){hulaMeld(r,p,found);continue;}
   if(!p.registered)break;
   const cand=p.hand.find(c=>r.melds.some(m=>attachable(m.cards,c,m.kind)));
   if(!cand)break;
   hulaAttach(r,p,cand,r.melds.findIndex(m=>attachable(m.cards,cand,m.kind)));
  }
  if(r.phase!=='playing')return;
  const preferred=p.hand.slice().sort((a,b)=>{
   const synergy=c=>p.hand.filter(x=>x!==c&&rank(x)===rank(c)||x!==c&&suit(x)===suit(c)&&Math.abs(rank(x)-rank(c))<=2).length;
   return (value(b)-synergy(b)*10)-(value(a)-synergy(a)*10);
  })[0];
  if(preferred)hulaDiscard(r,p,preferred);
 }
 function create(game,host,mode,max,name){
  const r={id:'RC'+crypto.randomBytes(7).toString('hex'),game,mode,hostId:host.id,name:String(name|| (game==='onecard'?'로얄 원카드':'로얄 훌라')).trim().slice(0,36)||'ROYAL CARDS',
   phase:'waiting',version:0,round:0,max,players:[{id:host.id,name:host.nickname,ready:false,hand:[],registered:false,meldBefore:false}],direction:1,turn:0,
   updated:now(),events:[],deck:[],discard:[],melds:[],deadline:0};
  if(mode==='ai'){r.players.push({id:'ai:'+r.id,name:game==='onecard'?'J-BOT · 에이스':'J-BOT · 타짜',bot:true,ready:true,hand:[],registered:false});}
  rooms.set(r.id,r);if(mode==='ai')fresh(r);else publish(r);return r;
 }
 function newRound(r){
  r.players.forEach(p=>{p.registered=false;p.meldBefore=false;});
  fresh(r);
 }
 async function handle(req,res,url){
  if(!url.pathname.startsWith('/api/royalcards'))return false;
  const u=requireAuth(req,res);if(!u)return true;
  const reply=(code,body)=>{json(res,code,body);return true;};
  try{
   if(!rateLimit('royalcards:'+u.id,160,60000))return reply(429,{error:'잠시 후 다시 시도해줘.'});
   cleanup();
   const b=req.method==='POST'?await readBody(req):{};
   if(url.pathname==='/api/royalcards'&&req.method==='GET'){
    const game=url.searchParams.get('game')==='hula'?'hula':'onecard',m=mine(u.id);
    return reply(200,{room:m?view(m,u.id):null,rooms:[...rooms.values()].filter(r=>r.game===game&&r.mode==='multi'&&r.phase==='waiting'&&r.players.length<r.max).map(r=>({id:r.id,name:r.name,players:r.players.length,max:r.max,host:r.players[0]?.name})),stats:publicStats(u.id,game)});
   }
   if(url.pathname==='/api/royalcards/create'&&req.method==='POST'){
    if(mine(u.id)||otherBusy(u.id))throw Error('다른 게임을 종료하고 다시 입장해줘.');
    const game=b.game==='hula'?'hula':'onecard',mode=b.mode==='ai'?'ai':'multi';
    const r=create(game,u,mode,Math.max(2,Math.min(4,Math.trunc(Number(b.max)||4))),b.name);return reply(201,{room:view(r,u.id)});
   }
   const m=url.pathname.match(/^\/api\/royalcards\/(RC[a-f0-9]{14})(?:\/(join|ready|start|play|draw|take|meld|attach|discard|thank|stop|rematch|leave))?$/);
   if(!m)return reply(404,{error:'존재하지 않는 카드 게임 요청이야.'});
   const r=rooms.get(m[1]);if(!r)return reply(404,{error:'종료된 방이야. 로비에서 다시 시작해줘.'});
   const op=m[2];const exists=player(r,u.id);
   if(op==='join'&&req.method==='POST'){
    if(exists)return reply(200,{room:view(r,u.id)});
    if(mine(u.id)||otherBusy(u.id))throw Error('다른 게임방에 참가하고 있어.');
    if(r.phase!=='waiting'||r.players.length>=r.max)throw Error('시작되었거나 정원이 찬 방이야.');
    r.players.push({id:u.id,name:u.nickname,ready:false,hand:[],registered:false});publish(r);return reply(200,{room:view(r,u.id)});
   }
   if(!exists)return reply(403,{error:'이 방의 참가자가 아니야.'});
   if(!op&&req.method==='GET')return reply(200,{room:view(r,u.id)});
   if(op==='thank'&&req.method==='POST'){
    thank(r,exists);return reply(200,{room:view(r,u.id)});
   }
   if(req.method!=='POST')return reply(405,{error:'허용되지 않은 요청이야.'});
   if(op==='leave'){
    const idx=r.players.indexOf(exists);
    if(r.phase==='playing'){
     const remaining=r.players.filter(p=>p!==exists);
     if(remaining.length){finish(r,remaining[0],exists.name+' 퇴장');}
    }
    if(r.phase==='thank'&&r.thankWindow){r.thankWindow.eligible=r.thankWindow.eligible.filter(id=>id!==exists.id);if(!r.thankWindow.eligible.length)resumeThank(r);}
    r.players.splice(idx,1);
    if(!r.players.length||r.mode==='ai'){clear(r);rooms.delete(r.id);}
    else {if(r.hostId===u.id)r.hostId=r.players[0].id;publish(r);}
    return reply(200,{ok:true});
   }
   if(op==='ready'){
    if(r.phase!=='waiting')throw Error('대기실에서만 준비할 수 있어.');
    exists.ready=b.ready===true;publish(r);
   }else if(op==='start'){
    if(r.mode!=='multi'||r.phase!=='waiting'||r.hostId!==u.id)throw Error('방장만 시작할 수 있어.');
    if(r.players.length<2||r.players.some(p=>!p.ready))throw Error('2명 이상 모두 준비 완료해야 시작할 수 있어.');
    newRound(r);
   }else if(op==='rematch'){
    if(r.phase!=='done')throw Error('게임 종료 후에 다시 시작할 수 있어.');
    if(r.mode==='ai')newRound(r);
    else{r.phase='waiting';r.players.forEach(p=>p.ready=false);publish(r);}
   }else{
    if(r.phase!=='playing'||current(r).id!==u.id)throw Error('지금 네 차례가 아니야.');
    if(r.game==='onecard'){
     if(op==='play')onePlay(r,exists,String(b.card||''),String(b.suit||''),b.call===true);
     else if(op==='draw')oneDraw(r,exists);
     else throw Error('원카드에서 지원하지 않는 동작이야.');
    }else{
     if(op==='take')hulaDraw(r,exists,b.source==='discard'?'discard':'stock');
     else if(op==='stop')hulaStop(r,exists);
     else{
      if(!r.drew)throw Error('먼저 더미 또는 땡큐로 카드를 받아줘.');
      if(op==='meld')hulaMeld(r,exists,b.cards);
      else if(op==='attach')hulaAttach(r,exists,String(b.card||''),Number(b.index));
      else if(op==='discard')hulaDiscard(r,exists,String(b.card||''));
      else throw Error('지원하지 않는 훌라 동작이야.');
      if(r.phase==='playing'&&op!=='discard')arm(r);
     }
    }
   }
   return reply(200,{room:view(r,u.id)});
  }catch(e){return reply(400,{error:e.message});}
 }
 return {handle,hasUser:id=>!!mine(id),findUserRoom:id=>{const r=mine(id);return r?{id:r.id,game:r.game,name:r.name}:null;},roomCount:()=>rooms.size,helpers:{meldKind,attachable,findThank,cardDeck}};
};
module.exports._test={meldKind,attachable,findThank,cardDeck,attackValue,attackLevel};
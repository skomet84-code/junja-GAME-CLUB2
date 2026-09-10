'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'club.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_salt TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  nickname TEXT NOT NULL UNIQUE COLLATE NOCASE,
  balance INTEGER NOT NULL DEFAULT 1000000,
  created_at INTEGER NOT NULL,
  last_daily TEXT,
  avatar INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  type TEXT NOT NULL,
  memo TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slot_spins INTEGER NOT NULL DEFAULT 0,
  slot_wins INTEGER NOT NULL DEFAULT 0,
  slot_profit INTEGER NOT NULL DEFAULT 0,
  poker_hands INTEGER NOT NULL DEFAULT 0,
  poker_wins INTEGER NOT NULL DEFAULT 0,
  yut_games INTEGER NOT NULL DEFAULT 0,
  yut_wins INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS room_escrow (
  room_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  game TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(room_id, user_id)
);
`);

// If the server restarted while rooms were active, return virtual chips safely.
const staleEscrows = db.prepare('SELECT room_id,user_id,amount,game FROM room_escrow').all();
for (const e of staleEscrows) {
  if (e.amount > 0) walletChange(e.user_id, e.amount, 'recovery', `${e.game} 방 서버 재시작 자동 환급`);
}
db.exec('DELETE FROM room_escrow');

db.exec('DELETE FROM sessions WHERE expires_at < ' + Date.now());

const rooms = new Map();
const sseClients = new Map();
const authAttempts = new Map();

const AVATARS = ['🧑‍💼','😎','🧢','👑','🐯','🐻','🦊','🐼','🐸','🦁'];
const SLOT_SYMBOLS = [
  {s:'🍒',w:28},{s:'🍋',w:24},{s:'🍊',w:20},{s:'🔔',w:13},{s:'⭐',w:9},{s:'💎',w:5},{s:'7️⃣',w:3}
];
const SLOT_MULT = {'🍒':4,'🍋':5,'🍊':7,'🔔':12,'⭐':20,'💎':50,'7️⃣':120};

function now(){ return Date.now(); }
function kstDate(){ return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
function randomToken(bytes=32){ return crypto.randomBytes(bytes).toString('hex'); }
function hashPassword(password,salt){ return crypto.scryptSync(password,salt,64).toString('hex'); }
function safeEqualHex(a,b){ try { const A=Buffer.from(a,'hex'),B=Buffer.from(b,'hex'); return A.length===B.length && crypto.timingSafeEqual(A,B); } catch { return false; } }
function clampInt(v,min,max){ v=Math.floor(Number(v)); return Number.isFinite(v)?Math.max(min,Math.min(max,v)):min; }
function escText(s,max=80){ return String(s||'').trim().replace(/[\u0000-\u001f]/g,'').slice(0,max); }
function formatMoney(n){ return new Intl.NumberFormat('ko-KR').format(n); }

function walletChange(userId, amount, type, memo){
  const tx = db.transaction ? db.transaction : null;
  db.exec('BEGIN IMMEDIATE');
  try{
    const u=db.prepare('SELECT balance FROM users WHERE id=?').get(userId);
    if(!u) throw new Error('사용자를 찾을 수 없습니다.');
    const next=u.balance+amount;
    if(next<0) throw new Error('게임머니가 부족합니다.');
    db.prepare('UPDATE users SET balance=? WHERE id=?').run(next,userId);
    db.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)')
      .run(userId,amount,next,type,memo,now());
    db.exec('COMMIT');
    return next;
  }catch(e){ db.exec('ROLLBACK'); throw e; }
}

function userPublic(userId){
  const u=db.prepare(`SELECT u.id,u.username,u.nickname,u.balance,u.avatar,u.created_at,u.last_daily,
    s.slot_spins,s.slot_wins,s.slot_profit,s.poker_hands,s.poker_wins,s.yut_games,s.yut_wins
    FROM users u JOIN stats s ON s.user_id=u.id WHERE u.id=?`).get(userId);
  if(!u) return null;
  return {...u, avatarEmoji:AVATARS[u.avatar%AVATARS.length], dailyAvailable:u.last_daily!==kstDate()};
}

function parseCookies(req){
  const out={};
  String(req.headers.cookie||'').split(';').forEach(p=>{const i=p.indexOf('=');if(i>0)out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim())});
  return out;
}
function authUser(req){
  const token=parseCookies(req).sid;
  if(!token) return null;
  const s=db.prepare('SELECT user_id,expires_at FROM sessions WHERE token=?').get(token);
  if(!s || s.expires_at<now()) return null;
  return userPublic(s.user_id);
}
function requireAuth(req,res){ const u=authUser(req); if(!u){json(res,401,{error:'로그인이 필요합니다.'});return null;} return u; }

function json(res,status,data,extra={}){
  const body=JSON.stringify(data);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),...securityHeaders(),...extra});
  res.end(body);
}
function securityHeaders(){return {
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'"
};}
function setSessionCookie(res,token,req){
  const secure=String(req.headers['x-forwarded-proto']||'').includes('https');
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60*60*24*14}${secure?'; Secure':''}`;
}
function readBody(req,limit=65536){ return new Promise((resolve,reject)=>{let b=''; req.on('data',c=>{b+=c;if(b.length>limit){reject(new Error('요청이 너무 큽니다.'));req.destroy();}});req.on('end',()=>{try{resolve(b?JSON.parse(b):{});}catch{reject(new Error('잘못된 JSON 요청입니다.'));}});req.on('error',reject);}); }
function sameOriginPost(req){
  if(req.method==='GET'||req.method==='HEAD') return true;
  const o=req.headers.origin; if(!o) return true;
  try{return new URL(o).host===req.headers.host;}catch{return false;}
}
function rateLimit(key,max=12,windowMs=60000){
  const t=now(); let a=authAttempts.get(key)||[]; a=a.filter(x=>t-x<windowMs); if(a.length>=max){authAttempts.set(key,a);return false;} a.push(t);authAttempts.set(key,a);return true;
}
function pushRefresh(roomId=null){
  for(const [,c] of sseClients){
    try{c.res.write(`event: refresh\ndata: ${JSON.stringify({roomId,t:now()})}\n\n`);}catch{}
  }
}
function onlineCount(){ return sseClients.size; }

function roomSummary(r){return {id:r.id,name:r.name,game:r.game,buyIn:r.buyIn,maxPlayers:r.maxPlayers,players:r.players.length,hostNickname:r.players.find(p=>p.userId===r.hostId)?.nickname||'호스트',status:roomStatus(r),smallBlind:r.smallBlind,bigBlind:r.bigBlind};}
function roomStatus(r){ if(r.game==='holdem') return r.hand && r.hand.phase!=='complete'?'PLAYING':'WAITING'; if(r.game==='yut') return r.yut?.phase==='playing'?'PLAYING':'WAITING'; return 'WAITING'; }
function findRoom(id){ return rooms.get(String(id)); }
function roomPlayer(r,userId){ return r.players.find(p=>p.userId===userId); }
function findUserRoom(userId){ return [...rooms.values()].find(r=>roomPlayer(r,userId)); }
function makeRoomId(){ let id;do{id=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(id));return id; }
function nextSeat(r){ for(let i=0;i<r.maxPlayers;i++) if(!r.players.some(p=>p.seat===i)) return i; return -1; }

function escrowSet(roomId,userId,amount,game){
  db.prepare(`INSERT INTO room_escrow(room_id,user_id,amount,game,created_at) VALUES(?,?,?,?,?)
    ON CONFLICT(room_id,user_id) DO UPDATE SET amount=excluded.amount`).run(roomId,userId,amount,game,now());
}
function escrowDelete(roomId,userId){ db.prepare('DELETE FROM room_escrow WHERE room_id=? AND user_id=?').run(roomId,userId); }

// ---------- Poker engine ----------
function cardDeck(){ const suits=['S','H','D','C'], ranks=['2','3','4','5','6','7','8','9','T','J','Q','K','A']; const d=[];for(const s of suits)for(const r of ranks)d.push(r+s);return d; }
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a; }
function rankVal(r){return '23456789TJQKA'.indexOf(r)+2;}
function eval5(cards){
  const vals=cards.map(c=>rankVal(c[0])).sort((a,b)=>b-a), suits=cards.map(c=>c[1]);
  const counts=new Map(); for(const v of vals) counts.set(v,(counts.get(v)||0)+1);
  const groups=[...counts.entries()].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  const flush=suits.every(s=>s===suits[0]);
  const uniq=[...new Set(vals)]; if(uniq[0]===14)uniq.push(1);
  let straightHigh=0; for(let i=0;i<=uniq.length-5;i++) if(uniq[i]-uniq[i+4]===4){straightHigh=uniq[i];break;}
  if(flush&&straightHigh)return [8,straightHigh];
  if(groups[0][1]===4)return [7,groups[0][0],groups.find(g=>g[1]===1)[0]];
  if(groups[0][1]===3&&groups[1]?.[1]===2)return [6,groups[0][0],groups[1][0]];
  if(flush)return [5,...vals];
  if(straightHigh)return [4,straightHigh];
  if(groups[0][1]===3)return [3,groups[0][0],...groups.filter(g=>g[1]===1).map(g=>g[0]).sort((a,b)=>b-a)];
  const pairs=groups.filter(g=>g[1]===2).map(g=>g[0]).sort((a,b)=>b-a);
  if(pairs.length>=2){const hi=pairs[0],lo=pairs[1],k=groups.filter(g=>g[1]===1).map(g=>g[0]).sort((a,b)=>b-a)[0];return [2,hi,lo,k];}
  if(pairs.length===1)return [1,pairs[0],...groups.filter(g=>g[1]===1).map(g=>g[0]).sort((a,b)=>b-a)];
  return [0,...vals];
}
function combos5(a){const out=[];for(let i=0;i<a.length-4;i++)for(let j=i+1;j<a.length-3;j++)for(let k=j+1;k<a.length-2;k++)for(let l=k+1;l<a.length-1;l++)for(let m=l+1;m<a.length;m++)out.push([a[i],a[j],a[k],a[l],a[m]]);return out;}
function compareRank(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return d;}return 0;}
function eval7(cards){let best=null;for(const c of combos5(cards)){const r=eval5(c);if(!best||compareRank(r,best)>0)best=r;}return best;}
function handName(rank){return ['하이카드','원페어','투페어','트리플','스트레이트','플러시','풀하우스','포카드','스트레이트 플러시'][rank[0]];}
function orderedPlayers(r){ return [...r.players].sort((a,b)=>a.seat-b.seat); }
function nextEligibleIndex(arr,startIdx,pred){ for(let step=1;step<=arr.length;step++){const i=(startIdx+step)%arr.length;if(pred(arr[i]))return i;}return -1; }
function pokerHandPlayers(r){return r.hand?orderedPlayers(r).filter(p=>r.hand.p[p.userId]):[];}
function pokerPot(h){return Object.values(h.p).reduce((s,p)=>s+p.totalBet,0);}
function pokerStart(r){
  const seated=orderedPlayers(r).filter(p=>p.stack>0);
  if(seated.length<2) throw new Error('칩이 있는 플레이어가 2명 이상 필요합니다.');
  r.dealerSeat = r.dealerSeat==null ? seated[0].seat : (()=>{const cur=seated.findIndex(p=>p.seat===r.dealerSeat);return seated[(cur+1+seated.length)%seated.length].seat})();
  const dealerIdx=seated.findIndex(p=>p.seat===r.dealerSeat);
  const sbIdx=seated.length===2?dealerIdx:nextEligibleIndex(seated,dealerIdx,()=>true);
  const bbIdx=nextEligibleIndex(seated,sbIdx,()=>true);
  const deck=shuffle(cardDeck());
  const h={phase:'preflop',deck,board:[],p:{},currentBet:0,minRaise:r.bigBlind,turnUserId:null,startedAt:now(),result:null,dealerSeat:r.dealerSeat};
  for(const rp of seated) h.p[rp.userId]={hole:[deck.pop(),deck.pop()],roundBet:0,totalBet:0,folded:false,allIn:false,acted:false};
  r.hand=h;
  const post=(rp,amt)=>{const hp=h.p[rp.userId],pay=Math.min(amt,rp.stack);rp.stack-=pay;hp.roundBet+=pay;hp.totalBet+=pay;if(rp.stack===0)hp.allIn=true;};
  post(seated[sbIdx],r.smallBlind);post(seated[bbIdx],r.bigBlind);h.currentBet=Math.max(h.p[seated[sbIdx].userId].roundBet,h.p[seated[bbIdx].userId].roundBet);
  const firstIdx=nextEligibleIndex(seated,bbIdx,p=>!h.p[p.userId].folded&&!h.p[p.userId].allIn);
  h.turnUserId=firstIdx>=0?seated[firstIdx].userId:null;
  if(!h.turnUserId) pokerRunout(r);
}
function pokerAdvanceTurn(r,currentUserId){
  const h=r.hand, arr=pokerHandPlayers(r), idx=arr.findIndex(p=>p.userId===currentUserId);
  const ni=nextEligibleIndex(arr,idx,p=>{const hp=h.p[p.userId];return !hp.folded&&!hp.allIn;});
  h.turnUserId=ni>=0?arr[ni].userId:null;
}
function pokerRoundComplete(r){
  const h=r.hand; const active=pokerHandPlayers(r).filter(p=>!h.p[p.userId].folded);
  const actors=active.filter(p=>!h.p[p.userId].allIn);
  if(active.length<=1)return true;
  if(actors.length===0)return true;
  return actors.every(p=>h.p[p.userId].acted && h.p[p.userId].roundBet===h.currentBet);
}
function pokerRunout(r){ const h=r.hand; while(h.board.length<5) h.board.push(h.deck.pop()); pokerShowdown(r); }
function pokerAdvanceStreet(r){
  const h=r.hand;
  for(const hp of Object.values(h.p)){hp.roundBet=0;hp.acted=false;}
  h.currentBet=0;h.minRaise=r.bigBlind;
  if(h.phase==='preflop'){h.phase='flop';h.board.push(h.deck.pop(),h.deck.pop(),h.deck.pop());}
  else if(h.phase==='flop'){h.phase='turn';h.board.push(h.deck.pop());}
  else if(h.phase==='turn'){h.phase='river';h.board.push(h.deck.pop());}
  else if(h.phase==='river'){pokerShowdown(r);return;}
  const active=pokerHandPlayers(r).filter(p=>!h.p[p.userId].folded);
  const canAct=active.filter(p=>!h.p[p.userId].allIn);
  if(canAct.length<=1){pokerRunout(r);return;}
  const arr=pokerHandPlayers(r), dealerIdx=arr.findIndex(p=>p.seat===h.dealerSeat);
  const ni=nextEligibleIndex(arr,dealerIdx,p=>{const hp=h.p[p.userId];return !hp.folded&&!hp.allIn;});
  h.turnUserId=ni>=0?arr[ni].userId:null;
}
function pokerAwardSingle(r,winner){
  const h=r.hand,pot=pokerPot(h);winner.stack+=pot;
  h.phase='complete';h.turnUserId=null;h.result={type:'fold',winners:[winner.userId],awards:{[winner.userId]:pot},pot,summary:`${winner.nickname} 승리 (상대 폴드)`};
  pokerAfterHand(r,[winner.userId]);
}
function pokerShowdown(r){
  const h=r.hand, arr=pokerHandPlayers(r); const active=arr.filter(p=>!h.p[p.userId].folded);
  const levels=[...new Set(arr.map(p=>h.p[p.userId].totalBet).filter(x=>x>0))].sort((a,b)=>a-b);
  let prev=0; const awards={}; const ranks={};
  for(const p of active)ranks[p.userId]=eval7([...h.p[p.userId].hole,...h.board]);
  for(const level of levels){
    const contrib=arr.filter(p=>h.p[p.userId].totalBet>=level); const amount=(level-prev)*contrib.length; prev=level;
    if(amount<=0)continue;
    const eligible=contrib.filter(p=>!h.p[p.userId].folded); if(!eligible.length)continue;
    let best=null,w=[];for(const p of eligible){const rk=ranks[p.userId];if(!best||compareRank(rk,best)>0){best=rk;w=[p];}else if(compareRank(rk,best)===0)w.push(p);}
    const share=Math.floor(amount/w.length),rem=amount-share*w.length;w.forEach((p,i)=>awards[p.userId]=(awards[p.userId]||0)+share+(i<rem?1:0));
  }
  for(const p of arr) if(awards[p.userId]) p.stack+=awards[p.userId];
  const winnerIds=Object.entries(awards).sort((a,b)=>b[1]-a[1]).filter(([,v],_,all)=>v===all[0][1]).map(([id])=>Number(id));
  const names=winnerIds.map(id=>roomPlayer(r,id)?.nickname).filter(Boolean).join(', ');
  h.phase='complete';h.turnUserId=null;h.result={type:'showdown',winners:winnerIds,awards,pot:pokerPot(h),ranks:Object.fromEntries(active.map(p=>[p.userId,{rank:ranks[p.userId],name:handName(ranks[p.userId])}])),summary:`${names} 승리 · ${handName(ranks[winnerIds[0]])}`};
  pokerAfterHand(r,winnerIds);
}
function pokerAfterHand(r,winnerIds){
  const arr=pokerHandPlayers(r);
  for(const p of arr){
    db.prepare('UPDATE stats SET poker_hands=poker_hands+1, poker_wins=poker_wins+? WHERE user_id=?').run(winnerIds.includes(p.userId)?1:0,p.userId);
    escrowSet(r.id,p.userId,p.stack,'holdem');
  }
}
function pokerAction(r,userId,action,raiseTo){
  const h=r.hand;if(!h||h.phase==='complete')throw new Error('진행 중인 핸드가 없습니다.');if(h.turnUserId!==userId)throw new Error('지금은 당신 차례가 아닙니다.');
  const rp=roomPlayer(r,userId),hp=h.p[userId];if(!rp||!hp||hp.folded||hp.allIn)throw new Error('행동할 수 없습니다.');
  const toCall=Math.max(0,h.currentBet-hp.roundBet);
  if(action==='fold'){hp.folded=true;hp.acted=true;}
  else if(action==='check'){if(toCall!==0)throw new Error('체크할 수 없습니다.');hp.acted=true;}
  else if(action==='call'){
    const pay=Math.min(toCall,rp.stack);rp.stack-=pay;hp.roundBet+=pay;hp.totalBet+=pay;hp.acted=true;if(rp.stack===0)hp.allIn=true;
  } else if(action==='raise'){
    const maxTo=hp.roundBet+rp.stack; raiseTo=Math.floor(Number(raiseTo));
    if(!Number.isFinite(raiseTo)||raiseTo<=h.currentBet||raiseTo>maxTo)throw new Error('올바른 레이즈 금액이 아닙니다.');
    const delta=raiseTo-h.currentBet; const isAllIn=raiseTo===maxTo;
    if(delta<h.minRaise&&!isAllIn)throw new Error(`최소 레이즈는 ${formatMoney(h.currentBet+h.minRaise)}G까지입니다.`);
    const prev=h.currentBet,pay=raiseTo-hp.roundBet;rp.stack-=pay;hp.roundBet+=pay;hp.totalBet+=pay;h.currentBet=raiseTo;
    if(delta>=h.minRaise)h.minRaise=delta;
    for(const p of Object.values(h.p)) if(p!==hp&&!p.folded&&!p.allIn)p.acted=false;
    hp.acted=true;if(rp.stack===0)hp.allIn=true;
  } else throw new Error('지원하지 않는 액션입니다.');
  const active=pokerHandPlayers(r).filter(p=>!h.p[p.userId].folded);
  if(active.length===1){pokerAwardSingle(r,active[0]);return;}
  if(pokerRoundComplete(r)){pokerAdvanceStreet(r);return;}
  pokerAdvanceTurn(r,userId);
}
function pokerView(r,userId){
  const h=r.hand;if(!h)return null;
  const reveal=h.phase==='complete'&&h.result?.type==='showdown';
  const players={};for(const rp of pokerHandPlayers(r)){const hp=h.p[rp.userId];players[rp.userId]={roundBet:hp.roundBet,totalBet:hp.totalBet,folded:hp.folded,allIn:hp.allIn,acted:hp.acted,hole:(rp.userId===userId||reveal&&!hp.folded)?hp.hole:['XX','XX']};}
  const me=players[userId];
  return {phase:h.phase,board:h.board,players,currentBet:h.currentBet,minRaise:h.minRaise,turnUserId:h.turnUserId,pot:pokerPot(h),dealerSeat:h.dealerSeat,result:h.result,legal:me&&h.turnUserId===userId?{toCall:Math.max(0,h.currentBet-me.roundBet),minRaiseTo:h.currentBet+h.minRaise,maxRaiseTo:(roomPlayer(r,userId)?.stack||0)+me.roundBet}:null};
}

// ---------- Yut engine ----------
function yutStart(r){
  if(r.players.length<2)throw new Error('2명 이상 필요합니다.');
  r.yut={phase:'playing',turnIndex:0,positions:Object.fromEntries(r.players.map(p=>[p.userId,[-1,-1,-1,-1]])),pending:null,last:null,winner:null,startedAt:now()};
}
function yutThrow(r,userId){
  const y=r.yut;if(!y||y.phase!=='playing')throw new Error('게임이 진행 중이 아닙니다.');
  const cur=r.players[y.turnIndex];if(cur.userId!==userId)throw new Error('지금은 당신 차례가 아닙니다.');if(y.pending)throw new Error('먼저 움직일 말을 선택하세요.');
  const sticks=[0,0,0,0].map(()=>crypto.randomInt(2)); const backs=sticks.filter(x=>x===0).length;
  let move,name,extra=false;
  if(backs===1){move=1;name='도';}else if(backs===2){move=2;name='개';}else if(backs===3){move=3;name='걸';}else if(backs===4){move=4;name='윷';extra=true;}else{move=5;name='모';extra=true;}
  y.pending={move,name,extra};y.last={userId,name,move,at:now()};return y.pending;
}
function yutMove(r,userId,pieceIndex){
  const y=r.yut;if(!y||y.phase!=='playing'||!y.pending)throw new Error('던지기부터 하세요.');
  const cur=r.players[y.turnIndex];if(cur.userId!==userId)throw new Error('당신 차례가 아닙니다.');
  pieceIndex=clampInt(pieceIndex,0,3);let pos=y.positions[userId][pieceIndex];if(pos===20)throw new Error('이미 완주한 말입니다.');
  const next=Math.min(20,(pos<0?0:pos)+y.pending.move); y.positions[userId][pieceIndex]=next;
  let captured=[];
  if(next>0&&next<20){for(const p of r.players){if(p.userId===userId)continue;y.positions[p.userId].forEach((v,i)=>{if(v===next){y.positions[p.userId][i]=-1;captured.push({userId:p.userId,piece:i});}});}}
  const won=y.positions[userId].every(v=>v===20); const wasExtra=y.pending.extra||captured.length>0; const lastName=y.pending.name; y.pending=null;
  if(won){
    y.phase='complete';y.winner=userId; const prize=r.buyIn*r.players.length;
    for(const p of r.players){escrowDelete(r.id,p.userId);db.prepare('UPDATE stats SET yut_games=yut_games+1, yut_wins=yut_wins+? WHERE user_id=?').run(p.userId===userId?1:0,p.userId);}
    walletChange(userId,prize,'yut_win',`${r.name} 윷놀이 우승 상금`);
  } else if(!wasExtra){ y.turnIndex=(y.turnIndex+1)%r.players.length; }
  y.last={userId,name:lastName,move:next,captured,at:now()};
}

function personalizedRoom(r,userId){
  return {
    id:r.id,name:r.name,game:r.game,buyIn:r.buyIn,maxPlayers:r.maxPlayers,hostId:r.hostId,status:roomStatus(r),smallBlind:r.smallBlind,bigBlind:r.bigBlind,
    players:orderedPlayers(r).map(p=>({...p,avatarEmoji:AVATARS[p.avatar%AVATARS.length]})),chat:r.chat.slice(-40),
    hand:r.game==='holdem'?pokerView(r,userId):null,yut:r.game==='yut'?r.yut:null
  };
}

function serveStatic(req,res,url){
  let p=url.pathname==='/'?'/index.html':url.pathname;
  if(p.includes('..')){res.writeHead(400);res.end();return;}
  const file=path.join(__dirname,'public',p);
  if(!file.startsWith(path.join(__dirname,'public'))||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404,securityHeaders());res.end('Not found');return;}
  const ext=path.extname(file).toLowerCase();const ct={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'}[ext]||'application/octet-stream';
  const st=fs.statSync(file);res.writeHead(200,{'Content-Type':ct,'Content-Length':st.size,'Cache-Control':ext==='.html'?'no-cache':'public, max-age=3600',...securityHeaders()});fs.createReadStream(file).pipe(res);
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(!sameOriginPost(req)){return json(res,403,{error:'잘못된 요청 출처입니다.'});}
    if(url.pathname==='/healthz')return json(res,200,{ok:true,rooms:rooms.size,online:onlineCount()});

    if(url.pathname==='/api/register'&&req.method==='POST'){
      const ip=req.socket.remoteAddress||'ip';if(!rateLimit('reg:'+ip,6,60000))return json(res,429,{error:'잠시 후 다시 시도하세요.'});
      const b=await readBody(req);const username=escText(b.username,20).toLowerCase(),nickname=escText(b.nickname,14),password=String(b.password||'');
      if(!/^[a-z0-9_]{4,20}$/.test(username))return json(res,400,{error:'아이디는 영문 소문자/숫자/_ 4~20자로 입력하세요.'});
      if(nickname.length<2)return json(res,400,{error:'닉네임은 2자 이상 입력하세요.'});
      if(password.length<6||password.length>72)return json(res,400,{error:'비밀번호는 6~72자로 입력하세요.'});
      const salt=randomToken(16),hash=hashPassword(password,salt),avatar=crypto.randomInt(AVATARS.length),t=now();
      try{
        db.exec('BEGIN IMMEDIATE');
        const r=db.prepare('INSERT INTO users(username,pass_salt,pass_hash,nickname,balance,created_at,avatar) VALUES(?,?,?,?,?,?,?)').run(username,salt,hash,nickname,1000000,t,avatar);
        const uid=Number(r.lastInsertRowid);db.prepare('INSERT INTO stats(user_id) VALUES(?)').run(uid);db.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)').run(uid,1000000,1000000,'signup','가입 웰컴머니',t);db.exec('COMMIT');
        const token=randomToken();db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(token,uid,t+14*86400000);
        return json(res,201,{user:userPublic(uid)},{'Set-Cookie':setSessionCookie(res,token,req)});
      }catch(e){try{db.exec('ROLLBACK')}catch{};if(String(e).includes('UNIQUE'))return json(res,409,{error:'이미 사용 중인 아이디 또는 닉네임입니다.'});throw e;}
    }
    if(url.pathname==='/api/login'&&req.method==='POST'){
      const ip=req.socket.remoteAddress||'ip';if(!rateLimit('login:'+ip,12,60000))return json(res,429,{error:'로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.'});
      const b=await readBody(req),username=escText(b.username,20).toLowerCase(),password=String(b.password||'');
      const u=db.prepare('SELECT * FROM users WHERE username=?').get(username);
      if(!u||!safeEqualHex(hashPassword(password,u.pass_salt),u.pass_hash))return json(res,401,{error:'아이디 또는 비밀번호가 올바르지 않습니다.'});
      const token=randomToken();db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(token,u.id,now()+14*86400000);
      return json(res,200,{user:userPublic(u.id)},{'Set-Cookie':setSessionCookie(res,token,req)});
    }
    if(url.pathname==='/api/logout'&&req.method==='POST'){
      const token=parseCookies(req).sid;if(token)db.prepare('DELETE FROM sessions WHERE token=?').run(token);return json(res,200,{ok:true},{'Set-Cookie':'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'});
    }
    if(url.pathname==='/api/me'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;return json(res,200,{user:u,online:onlineCount()});}
    if(url.pathname==='/api/events'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive',...securityHeaders()});
      res.write(`event: hello\ndata: ${JSON.stringify({t:now()})}\n\n`);const id=randomToken(8);sseClients.set(id,{res,userId:u.id});pushRefresh();
      const hb=setInterval(()=>{try{res.write(`: ping ${now()}\n\n`)}catch{}},25000);
      req.on('close',()=>{clearInterval(hb);sseClients.delete(id);pushRefresh();});return;
    }
    if(url.pathname==='/api/daily'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const d=kstDate();if(u.last_daily===d)return json(res,409,{error:'오늘 출석 보너스는 이미 받았습니다.'});
      db.prepare('UPDATE users SET last_daily=? WHERE id=?').run(d,u.id);const bal=walletChange(u.id,50000,'daily','오늘의 출석 보너스');pushRefresh();return json(res,200,{balance:bal,amount:50000});
    }
    if(url.pathname==='/api/ledger'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;const rows=db.prepare('SELECT amount,balance_after,type,memo,created_at FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 30').all(u.id);return json(res,200,{rows});
    }
    if(url.pathname==='/api/leaderboard'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;const rows=db.prepare(`SELECT u.nickname,u.balance,u.avatar,s.poker_wins,s.yut_wins,s.slot_profit FROM users u JOIN stats s ON s.user_id=u.id ORDER BY u.balance DESC LIMIT 20`).all().map(x=>({...x,avatarEmoji:AVATARS[x.avatar%AVATARS.length]}));return json(res,200,{rows});
    }
    if(url.pathname==='/api/slot/spin'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const b=await readBody(req),bet=clampInt(b.bet,1000,50000);if(![1000,5000,10000,25000,50000].includes(bet))return json(res,400,{error:'지원하지 않는 베팅 금액입니다.'});
      if(u.balance<bet)return json(res,400,{error:'게임머니가 부족합니다.'});
      walletChange(u.id,-bet,'slot_bet',`슬롯 베팅 ${formatMoney(bet)}G`);
      const pick=()=>{const total=SLOT_SYMBOLS.reduce((s,x)=>s+x.w,0);let n=crypto.randomInt(total);for(const x of SLOT_SYMBOLS){if(n<x.w)return x.s;n-=x.w;}return '🍒';};
      const reels=[pick(),pick(),pick()];let mult=0;
      if(reels[0]===reels[1]&&reels[1]===reels[2])mult=SLOT_MULT[reels[0]];
      else if(new Set(reels).size===2)mult=.5;
      else if(reels.filter(x=>x==='🍒').length===2)mult=1;
      const payout=Math.floor(bet*mult);if(payout>0)walletChange(u.id,payout,'slot_win',`슬롯 당첨 x${mult}`);
      const profit=payout-bet;db.prepare('UPDATE stats SET slot_spins=slot_spins+1, slot_wins=slot_wins+?, slot_profit=slot_profit+? WHERE user_id=?').run(payout>bet?1:0,profit,u.id);pushRefresh();
      return json(res,200,{reels,bet,payout,profit,user:userPublic(u.id),jackpot:mult>=50});
    }
    if(url.pathname==='/api/rooms'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;const game=url.searchParams.get('game');const list=[...rooms.values()].filter(r=>!game||r.game===game).map(roomSummary).sort((a,b)=>a.status.localeCompare(b.status));return json(res,200,{rooms:list});
    }
    if(url.pathname==='/api/rooms'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;if(findUserRoom(u.id))return json(res,409,{error:'이미 다른 게임방에 참가 중입니다. 먼저 그 방에서 나와주세요.'});const b=await readBody(req),game=b.game==='yut'?'yut':'holdem',name=escText(b.name,24)||`${u.nickname}의 방`;
      const maxPlayers=game==='holdem'?clampInt(b.maxPlayers,2,6):clampInt(b.maxPlayers,2,4);const buyIn=clampInt(b.buyIn,10000,500000);
      if(u.balance<buyIn)return json(res,400,{error:'방 참가금보다 보유 게임머니가 적습니다.'});
      const id=makeRoomId();walletChange(u.id,-buyIn,`${game}_buyin`,`${name} 참가금`);
      const r={id,name,game,buyIn,maxPlayers,hostId:u.id,smallBlind:game==='holdem'?Math.max(100,Math.floor(buyIn/100)):0,bigBlind:game==='holdem'?Math.max(200,Math.floor(buyIn/50)):0,players:[{userId:u.id,nickname:u.nickname,avatar:u.avatar,seat:0,stack:game==='holdem'?buyIn:0}],chat:[],createdAt:now(),hand:null,yut:null,dealerSeat:null};
      rooms.set(id,r);escrowSet(id,u.id,buyIn,game);pushRefresh(id);return json(res,201,{room:personalizedRoom(r,u.id)});
    }
    const roomMatch=url.pathname.match(/^\/api\/rooms\/([A-F0-9]+)(?:\/(.*))?$/);
    if(roomMatch){
      const u=requireAuth(req,res);if(!u)return;const r=findRoom(roomMatch[1]);if(!r)return json(res,404,{error:'방을 찾을 수 없습니다.'});const op=roomMatch[2]||'';
      if(!op&&req.method==='GET')return json(res,200,{room:personalizedRoom(r,u.id)});
      if(op==='join'&&req.method==='POST'){
        if(roomPlayer(r,u.id))return json(res,200,{room:personalizedRoom(r,u.id)});if(findUserRoom(u.id))return json(res,409,{error:'이미 다른 게임방에 참가 중입니다. 먼저 그 방에서 나와주세요.'});if(roomStatus(r)==='PLAYING')return json(res,409,{error:'게임 진행 중에는 입장할 수 없습니다.'});if(r.players.length>=r.maxPlayers)return json(res,409,{error:'방이 가득 찼습니다.'});if(u.balance<r.buyIn)return json(res,400,{error:'게임머니가 부족합니다.'});
        walletChange(u.id,-r.buyIn,`${r.game}_buyin`,`${r.name} 참가금`);r.players.push({userId:u.id,nickname:u.nickname,avatar:u.avatar,seat:nextSeat(r),stack:r.game==='holdem'?r.buyIn:0});escrowSet(r.id,u.id,r.buyIn,r.game);pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});
      }
      if(op==='leave'&&req.method==='POST'){
        const p=roomPlayer(r,u.id);if(!p)return json(res,200,{ok:true});if(roomStatus(r)==='PLAYING')return json(res,409,{error:'게임 진행 중에는 나갈 수 없습니다.'});
        const refund=r.game==='holdem'?p.stack:(r.yut?.phase==='complete'?0:r.buyIn); if(refund>0)walletChange(u.id,refund,`${r.game}_cashout`,`${r.name} 퇴장 환급`);escrowDelete(r.id,u.id);r.players=r.players.filter(x=>x.userId!==u.id);
        if(!r.players.length)rooms.delete(r.id);else if(r.hostId===u.id)r.hostId=r.players[0].userId;pushRefresh(r.id);return json(res,200,{ok:true});
      }
      if(op==='chat'&&req.method==='POST'){
        if(!roomPlayer(r,u.id))return json(res,403,{error:'방 참가자만 채팅할 수 있습니다.'});const b=await readBody(req),message=escText(b.message,120);if(!message)return json(res,400,{error:'메시지를 입력하세요.'});r.chat.push({id:randomToken(4),userId:u.id,nickname:u.nickname,message,at:now()});r.chat=r.chat.slice(-50);pushRefresh(r.id);return json(res,200,{ok:true});
      }
      if(op==='start'&&req.method==='POST'){
        if(r.hostId!==u.id)return json(res,403,{error:'방장만 시작할 수 있습니다.'});if(r.game==='holdem'){if(r.hand&&r.hand.phase!=='complete')return json(res,409,{error:'이미 핸드가 진행 중입니다.'});pokerStart(r);}else{if(r.yut?.phase==='playing')return json(res,409,{error:'이미 게임 중입니다.'});if(r.yut?.phase==='complete')return json(res,409,{error:'윷놀이는 한 판이 끝났습니다. 새 방을 만들어 다시 참가해주세요.'});yutStart(r);}pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});
      }
      if(op==='poker/action'&&req.method==='POST'){
        if(r.game!=='holdem')return json(res,400,{error:'홀덤 방이 아닙니다.'});const b=await readBody(req);pokerAction(r,u.id,b.action,b.raiseTo);pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});
      }
      if(op==='yut/throw'&&req.method==='POST'){
        if(r.game!=='yut')return json(res,400,{error:'윷놀이 방이 아닙니다.'});const result=yutThrow(r,u.id);pushRefresh(r.id);return json(res,200,{result,room:personalizedRoom(r,u.id)});
      }
      if(op==='yut/move'&&req.method==='POST'){
        if(r.game!=='yut')return json(res,400,{error:'윷놀이 방이 아닙니다.'});const b=await readBody(req);yutMove(r,u.id,b.pieceIndex);pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});
      }
    }

    if(url.pathname.startsWith('/api/'))return json(res,404,{error:'API를 찾을 수 없습니다.'});
    return serveStatic(req,res,url);
  }catch(e){console.error(e); if(!res.headersSent)json(res,500,{error:e.message||'서버 오류가 발생했습니다.'});else try{res.end()}catch{}}
});

server.listen(PORT,HOST,()=>console.log(`JUNJA GAME CLUB listening on http://${HOST}:${PORT}`));

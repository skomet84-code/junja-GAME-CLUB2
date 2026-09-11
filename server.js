'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('./persistent-db');

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const ADMIN_NICKNAME = String(process.env.ADMIN_NICKNAME || '관리자').trim().slice(0,14) || '관리자';
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
CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  memo TEXT NOT NULL,
  created_at INTEGER NOT NULL
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

function ensureColumn(table, column, sql){
  const cols=db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name);
  if(!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sql}`);
}
ensureColumn('stats','seotda_games','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','seotda_wins','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','gostop_games','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','gostop_wins','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','solo_poker_wins','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','solo_yut_wins','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','horse_races','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','horse_wins','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','horse_profit','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','bigwheel_plays','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','bigwheel_wins','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','bigwheel_profit','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','sicbo_plays','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','sicbo_wins','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','sicbo_profit','INTEGER NOT NULL DEFAULT 0');
ensureColumn('users','is_admin','INTEGER NOT NULL DEFAULT 0');
ensureColumn('users','is_disabled','INTEGER NOT NULL DEFAULT 0');

// If the server restarted while rooms were active, return virtual chips safely.
const staleEscrows = db.prepare('SELECT room_id,user_id,amount,game FROM room_escrow').all();
for (const e of staleEscrows) {
  if (e.amount > 0) walletChange(e.user_id, e.amount, 'recovery', `${e.game} 방 서버 재시작 자동 환급`);
}
db.exec('DELETE FROM room_escrow');

db.exec('DELETE FROM sessions WHERE expires_at < ' + Date.now());

const rooms = new Map();
const soloHoldem = new Map();
const soloYut = new Map();
const soloSeotda = new Map();
const soloGostop = new Map();
const raceCards = new Map();
const sseClients = new Map();
const authAttempts = new Map();

const AVATARS = ['🧑‍💼','😎','🧢','👑','🐯','🐻','🦊','🐼','🐸','🦁'];
const ROOM_REACTIONS = {
  frustrated:{emoji:'😫',label:'답답해'},
  hurry:{emoji:'⏩',label:'빨리빨리'},
  cry:{emoji:'😭',label:'우는 중'},
  laugh:{emoji:'😂',label:'웃겨'},
  wow:{emoji:'😲',label:'놀람'},
  sad:{emoji:'😢',label:'슬퍼'}
};
const SLOT_SYMBOLS = [
  {s:'🍒',w:140},{s:'🍋',w:120},{s:'🍊',w:100},{s:'🔔',w:65},{s:'⭐',w:45},{s:'💎',w:25},{s:'7️⃣',w:7},{s:'J',w:1}
];
const SLOT_MULT = {'🍒':2,'🍋':2,'🍊':3,'🔔':5,'⭐':8,'💎':15,'7️⃣':1000,'J':500};
const SLOT_LINES = [
  { key:'top', label:'TOP', cssClass:'top', cells:[[0,0],[0,1],[0,2]] },
  { key:'mid', label:'MIDDLE', cssClass:'mid', cells:[[1,0],[1,1],[1,2]] },
  { key:'bot', label:'BOTTOM', cssClass:'bot', cells:[[2,0],[2,1],[2,2]] },
  { key:'diag1', label:'DIAGONAL ↘', cssClass:'diag1', cells:[[0,0],[1,1],[2,2]] },
  { key:'diag2', label:'DIAGONAL ↗', cssClass:'diag2', cells:[[2,0],[1,1],[0,2]] }
];

function now(){ return Date.now(); }
function kstDate(){ return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
function randomToken(bytes=32){ return crypto.randomBytes(bytes).toString('hex'); }
function hashPassword(password,salt){ return crypto.scryptSync(password,salt,64).toString('hex'); }
function safeEqualHex(a,b){ try { const A=Buffer.from(a,'hex'),B=Buffer.from(b,'hex'); return A.length===B.length && crypto.timingSafeEqual(A,B); } catch { return false; } }
function clampInt(v,min,max){ v=Math.floor(Number(v)); return Number.isFinite(v)?Math.max(min,Math.min(max,v)):min; }
function gameWager(v,min=1000,max=5000000,step=1000){
  const n=Math.floor(Number(v));
  if(!Number.isFinite(n)||n<min||n>max||n%step!==0) throw new Error(`금액은 ${formatMoney(min)}G~${formatMoney(max)}G 범위에서 ${formatMoney(step)}G 단위로 입력하세요.`);
  return n;
}
function escText(s,max=80){ return String(s||'').trim().replace(/[\u0000-\u001f]/g,'').slice(0,max); }
function containsContactInfo(s){
  const v=String(s||'').trim();
  if(/(?:https?:\/\/|www\.|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|카톡|카카오톡|오픈채팅|telegram|텔레그램|instagram|인스타|discord|디스코드|line\s*id|라인\s*id)/i.test(v)) return true;
  const digits=v.replace(/\D/g,'');
  return digits.length>=9;
}
function formatMoney(n){ return new Intl.NumberFormat('ko-KR').format(n); }

function ensureAdminAccount(){
  if(!ADMIN_USERNAME || !ADMIN_PASSWORD) return;
  if(!/^[a-z0-9_]{4,20}$/.test(ADMIN_USERNAME)) throw new Error('ADMIN_USERNAME 형식이 올바르지 않습니다.');
  if(ADMIN_PASSWORD.length<8 || ADMIN_PASSWORD.length>72) throw new Error('ADMIN_PASSWORD는 8~72자로 설정하세요.');
  const existing=db.prepare('SELECT * FROM users WHERE username=?').get(ADMIN_USERNAME);
  const salt=randomToken(16),hash=hashPassword(ADMIN_PASSWORD,salt),t=now();
  if(existing){
    db.prepare('UPDATE users SET pass_salt=?,pass_hash=?,is_admin=1,is_disabled=0 WHERE id=?').run(salt,hash,existing.id);
    console.log(`Admin account ready: ${ADMIN_USERNAME}`);
    return;
  }
  let nickname=ADMIN_NICKNAME;
  if(db.prepare('SELECT id FROM users WHERE nickname=?').get(nickname)) nickname=(nickname+'J').slice(0,14);
  const r=db.prepare('INSERT INTO users(username,pass_salt,pass_hash,nickname,balance,created_at,avatar,is_admin,is_disabled) VALUES(?,?,?,?,?,?,?,?,?)').run(ADMIN_USERNAME,salt,hash,nickname,1000000,t,3,1,0);
  const uid=Number(r.lastInsertRowid);
  db.prepare('INSERT INTO stats(user_id) VALUES(?)').run(uid);
  db.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)').run(uid,1000000,1000000,'admin_seed','관리자 계정 초기 게임머니',t);
  console.log(`Admin account created: ${ADMIN_USERNAME}`);
}
ensureAdminAccount();

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
  const u=db.prepare(`SELECT u.id,u.username,u.nickname,u.balance,u.avatar,u.created_at,u.last_daily,u.is_admin,u.is_disabled,
    s.slot_spins,s.slot_wins,s.slot_profit,s.poker_hands,s.poker_wins,s.yut_games,s.yut_wins,
    s.seotda_games,s.seotda_wins,s.gostop_games,s.gostop_wins,s.solo_poker_wins,s.solo_yut_wins,
    s.horse_races,s.horse_wins,s.horse_profit,s.bigwheel_plays,s.bigwheel_wins,s.bigwheel_profit,s.sicbo_plays,s.sicbo_wins,s.sicbo_profit
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
  const u=userPublic(s.user_id);
  if(!u || u.is_disabled) return null;
  return u;
}
function requireAuth(req,res){ const u=authUser(req); if(!u){json(res,401,{error:'로그인이 필요합니다.'});return null;} return u; }
function requireAdmin(req,res){ const u=requireAuth(req,res); if(!u)return null; if(!u.is_admin){json(res,403,{error:'관리자 권한이 필요합니다.'});return null;} return u; }

function json(res,status,data,extra={}){
  const body=JSON.stringify(data);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store, max-age=0',...securityHeaders(),...extra});
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

function roomStatus(r){ if(r.game==='holdem') return r.hand && r.hand.phase!=='complete'?'PLAYING':'WAITING'; if(r.game==='yut') return r.yut?.phase==='playing'?'PLAYING':'WAITING'; return 'WAITING'; }
function roomReadyCount(r){return r.players.filter(p=>p.ready).length;}
function roomSummary(r){return {id:r.id,name:r.name,game:r.game,buyIn:r.buyIn,maxPlayers:r.maxPlayers,players:r.players.length,hostNickname:r.players.find(p=>p.userId===r.hostId)?.nickname||'호스트',status:roomStatus(r),smallBlind:r.smallBlind,bigBlind:r.bigBlind,yutMode:r.yutMode||'individual',yutModeLabel:yutModeLabel(r.yutMode||'individual'),readyCount:roomReadyCount(r),version:r.version||0,updatedAt:r.updatedAt||r.createdAt,participants:orderedPlayers(r).map(p=>({userId:p.userId,nickname:p.nickname,avatar:p.avatar,ready:!!p.ready,seat:p.seat}))};}
function findRoom(id){ return rooms.get(String(id)); }
function roomPlayer(r,userId){ return r.players.find(p=>p.userId===userId); }
function findUserRoom(userId){ return [...rooms.values()].find(r=>roomPlayer(r,userId)); }
function makeRoomId(){ let id;do{id=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(id));return id; }
function nextSeat(r){ for(let i=0;i<r.maxPlayers;i++) if(!r.players.some(p=>p.seat===i)) return i; return -1; }
function touchRoom(r){r.updatedAt=now();r.version=(r.version||0)+1;}
function currentTurnUserId(r){if(r.game==='holdem')return r.hand?.phase!=='complete'?r.hand?.turnUserId:null;if(r.game==='yut'&&r.yut?.phase==='playing')return yutCurrentPlayer(r,r.yut)?.userId||null;return null;}
function closeRoomAndRefund(r,reason='방 종료 환급'){
  const playing=roomStatus(r)==='PLAYING';
  for(const p of [...r.players]){
    let refund=0;
    if(r.game==='holdem'){
      const hp=r.hand?.p?.[p.userId];
      refund=playing&&hp ? Math.max(0,Math.floor(p.stack+(hp.totalBet||0))) : Math.max(0,Math.floor(p.stack||0));
    } else refund=r.yut?.phase==='complete'?0:Math.max(0,Math.floor(r.buyIn||0));
    if(refund>0) walletChange(p.userId,refund,`${r.game}_recovery`,`${r.name} ${reason}`);
    escrowDelete(r.id,p.userId);
  }
  rooms.delete(r.id);pushRefresh(r.id);
}

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
function pokerHandStatus(cards){
  const clean=(cards||[]).filter(c=>c&&c!=='XX');
  if(!clean.length)return {name:'카드 대기',detail:'카드가 배분되면 현재 패를 분석해줘.',draws:[]};
  let name='하이카드',detail='',rank=null;
  if(clean.length>=5){
    let best=null;for(const c of combos5(clean)){const r=eval5(c);if(!best||compareRank(r,best)>0)best=r;}
    rank=best;name=handName(best);
  }else{
    const vals=clean.map(c=>rankVal(c[0])),counts=new Map();for(const v of vals)counts.set(v,(counts.get(v)||0)+1);
    const groups=[...counts.entries()].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
    const pairs=groups.filter(g=>g[1]===2).length;
    if(groups[0]?.[1]===4)name='포카드';else if(groups[0]?.[1]===3)name='트리플';else if(pairs>=2)name='투페어';else if(pairs===1)name='원페어';
    else name='하이카드';
  }
  const draws=[];
  const suitCounts={S:0,H:0,D:0,C:0};for(const c of clean)suitCounts[c[1]]=(suitCounts[c[1]]||0)+1;
  if(Object.values(suitCounts).some(n=>n===4))draws.push('플러시 드로우');
  const uniq=[...new Set(clean.map(c=>rankVal(c[0])))].sort((a,b)=>a-b);if(uniq.includes(14))uniq.unshift(1);
  let straightDraw=false;for(let start=1;start<=10;start++){let hits=0;for(let v=start;v<start+5;v++)if(uniq.includes(v))hits++;if(hits===4){straightDraw=true;break;}}
  if(straightDraw&&!/스트레이트/.test(name))draws.push('스트레이트 드로우');
  const high=Math.max(...clean.map(c=>rankVal(c[0])));const highLabel=high===14?'A':high===13?'K':high===12?'Q':high===11?'J':String(high);
  detail=rank?`${name} 완성`:(name==='하이카드'?`${highLabel} 하이`:name);
  const rankLevel=rank?Number(rank[0]||0):Math.max(0,['하이카드','원페어','투페어','트리플','스트레이트','플러시','풀하우스','포카드','스트레이트 플러시'].indexOf(name));
  return {name,detail,draws,rankLevel};
}
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
    if(p.userId>0){
      db.prepare('UPDATE stats SET poker_hands=poker_hands+1, poker_wins=poker_wins+? WHERE user_id=?').run(winnerIds.includes(p.userId)?1:0,p.userId);
      if(r.solo) escrowSet(r.id,p.userId,p.stack,'solo_holdem'); else escrowSet(r.id,p.userId,p.stack,'holdem');
    }
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
  const myCards=me?[...(me.hole||[]),...(h.board||[])].filter(c=>c&&c!=='XX'):[];
  return {phase:h.phase,startedAt:h.startedAt,board:h.board,players,currentBet:h.currentBet,minRaise:h.minRaise,turnUserId:h.turnUserId,pot:pokerPot(h),dealerSeat:h.dealerSeat,result:h.result,myHand:pokerHandStatus(myCards),legal:me&&h.turnUserId===userId?{toCall:Math.max(0,h.currentBet-me.roundBet),minRaiseTo:h.currentBet+h.minRaise,maxRaiseTo:(roomPlayer(r,userId)?.stack||0)+me.roundBet}:null};
}

// ---------- Yut engine v0.7: stacking / shortcuts / teams ----------
const YUT_SIDE_COLORS=['#f5cb58','#5ba8ff','#ff6f8e','#65d49a','#b784ff','#ff9b57'];
function yutModeLabel(mode){return ({individual:'개인전','2v2':'2:2 팀전','3v3':'3:3 팀전'})[mode]||'개인전';}
function yutNewPiece(){return {node:'START',route:'outer'};}
function yutClonePiece(p){return {node:p.node,route:p.route||'outer'};}
function yutPhysical(p){if(!p)return'START';if(p.node==='CA'||p.node==='CB')return'C';return p.node;}
function yutFinished(p){return p?.node==='FINISH';}
function yutNextStep(p,firstStep){
  const node=p.node,route=p.route||'outer';
  if(node==='FINISH')return yutClonePiece(p);
  if(node==='START')return {node:'O1',route:'outer'};
  if(node==='O5')return firstStep?{node:'A1',route:'A'}:{node:'O6',route:'outer'};
  if(node==='O10')return firstStep?{node:'B1',route:'B'}:{node:'O11',route:'outer'};
  if(/^O\d+$/.test(node)){
    const n=Number(node.slice(1));
    if(n<20)return {node:`O${n+1}`,route:'outer'};
    return {node:'FINISH',route:'outer'};
  }
  const map={A1:['A2','A'],A2:['CA','A'],CA:['A4','A'],A4:['A5','A'],A5:['O15','outer'],B1:['B2','B'],B2:['CB','B'],CB:['B4','B'],B4:['B5','B'],B5:['FINISH','B']};
  if(map[node])return {node:map[node][0],route:map[node][1]};
  return {node:'START',route:'outer'};
}
function yutAdvance(piece,move){
  let p=yutClonePiece(piece);const trace=[];
  for(let i=0;i<move;i++){p=yutNextStep(p,i===0);trace.push(yutPhysical(p));if(p.node==='FINISH')break;}
  return {piece:p,trace};
}
function throwYut(){
  const sticks=[0,0,0,0].map(()=>crypto.randomInt(2));const backs=sticks.filter(x=>x===0).length;
  if(backs===1)return {move:1,name:'도',extra:false,sticks};
  if(backs===2)return {move:2,name:'개',extra:false,sticks};
  if(backs===3)return {move:3,name:'걸',extra:false,sticks};
  if(backs===4)return {move:4,name:'윷',extra:true,sticks};
  return {move:5,name:'모',extra:true,sticks};
}
function yutMakeSides(r){
  const ps=orderedPlayers(r);
  if(r.yutMode==='2v2'||r.yutMode==='3v3'){
    const a=ps.filter((_,i)=>i%2===0),b=ps.filter((_,i)=>i%2===1);
    return [
      {id:'A',label:'청룡팀',color:YUT_SIDE_COLORS[0],playerIds:a.map(p=>p.userId),pieces:Array.from({length:4},yutNewPiece)},
      {id:'B',label:'백호팀',color:YUT_SIDE_COLORS[1],playerIds:b.map(p=>p.userId),pieces:Array.from({length:4},yutNewPiece)}
    ];
  }
  return ps.map((p,i)=>({id:`U${p.userId}`,label:p.nickname,color:YUT_SIDE_COLORS[i%YUT_SIDE_COLORS.length],playerIds:[p.userId],pieces:Array.from({length:4},yutNewPiece)}));
}
function yutSideForUser(y,userId){return y.sides.find(s=>s.playerIds.includes(userId));}
function yutCurrentPlayer(r,y){return orderedPlayers(r)[y.turnIndex%orderedPlayers(r).length];}
function yutStart(r){
  if(r.players.length<2)throw new Error('2명 이상 필요합니다.');
  if((r.yutMode==='2v2'||r.yutMode==='3v3')&&r.players.length!==r.maxPlayers)throw new Error(`${yutModeLabel(r.yutMode)}은 ${r.maxPlayers}명이 모두 입장해야 시작할 수 있습니다.`);
  r.yut={phase:'playing',turnIndex:0,sides:yutMakeSides(r),pending:[],awaitingThrow:true,captureBonus:0,last:null,winnerSideId:null,startedAt:now(),ruleSet:'club-standard-v07'};
}
function yutThrow(r,userId){
  const y=r.yut;if(!y||y.phase!=='playing')throw new Error('게임이 진행 중이 아닙니다.');
  const cur=yutCurrentPlayer(r,y);if(!cur||cur.userId!==userId)throw new Error('지금은 당신 차례가 아닙니다.');
  if(!y.awaitingThrow)throw new Error('먼저 나온 윷 결과로 말을 이동하세요.');
  const result=throwYut();y.pending.push(result);y.awaitingThrow=!!result.extra;
  y.last={type:'throw',userId,sideId:yutSideForUser(y,userId)?.id,name:result.name,move:result.move,sticks:result.sticks,at:now()};
  return result;
}
function yutSettle(r,y,winnerSide){
  y.phase='complete';y.winnerSideId=winnerSide.id;y.awaitingThrow=false;y.pending=[];
  const total=r.buyIn*r.players.length,winners=winnerSide.playerIds,base=Math.floor(total/winners.length),rem=total-base*winners.length;
  for(const p of r.players){
    escrowDelete(r.id,p.userId);
    db.prepare('UPDATE stats SET yut_games=yut_games+1, yut_wins=yut_wins+? WHERE user_id=?').run(winners.includes(p.userId)?1:0,p.userId);
  }
  winners.forEach((uid,i)=>walletChange(uid,base+(i===0?rem:0),'yut_win',`${r.name} ${winnerSide.label} 우승 상금`));
}
function yutMove(r,userId,pieceIndex,moveIndex=0){
  const y=r.yut;if(!y||y.phase!=='playing'||!y.pending.length)throw new Error('던지기부터 하세요.');
  if(y.awaitingThrow)throw new Error('윷/모 보너스 던지기를 먼저 진행하세요.');
  const cur=yutCurrentPlayer(r,y);if(!cur||cur.userId!==userId)throw new Error('당신 차례가 아닙니다.');
  const side=yutSideForUser(y,userId);if(!side)throw new Error('말을 찾을 수 없습니다.');
  pieceIndex=clampInt(pieceIndex,0,3);moveIndex=clampInt(moveIndex,0,y.pending.length-1);
  const selected=side.pieces[pieceIndex];if(yutFinished(selected))throw new Error('이미 완주한 말입니다.');
  const moveResult=y.pending[moveIndex],fromPhysical=yutPhysical(selected);
  const stackIndexes=fromPhysical==='START'? [pieceIndex] : side.pieces.map((p,i)=>yutPhysical(p)===fromPhysical&&!yutFinished(p)?i:-1).filter(i=>i>=0);
  const advanced=yutAdvance(selected,moveResult.move),dest=advanced.piece,destPhysical=yutPhysical(dest);
  stackIndexes.forEach(i=>side.pieces[i]=yutClonePiece(dest));
  // If the moving stack lands on friendly pieces, all pieces become one stack and inherit the incoming route.
  if(destPhysical!=='START'&&destPhysical!=='FINISH') side.pieces.forEach((p,i)=>{if(yutPhysical(p)===destPhysical)side.pieces[i]=yutClonePiece(dest);});
  const captured=[];
  if(destPhysical!=='START'&&destPhysical!=='FINISH'){
    for(const other of y.sides){
      if(other.id===side.id)continue;
      other.pieces.forEach((p,i)=>{if(yutPhysical(p)===destPhysical){captured.push({sideId:other.id,pieceIndex:i});other.pieces[i]=yutNewPiece();}});
    }
  }
  y.pending.splice(moveIndex,1);
  if(captured.length)y.captureBonus++;
  const stacked=destPhysical!=='START'&&destPhysical!=='FINISH'?side.pieces.filter(p=>yutPhysical(p)===destPhysical).length:stackIndexes.length;
  y.last={type:'move',userId,sideId:side.id,name:moveResult.name,move:moveResult.move,sticks:moveResult.sticks,from:fromPhysical,to:destPhysical,trace:advanced.trace,captured,stacked,at:now()};
  if(side.pieces.every(yutFinished)){yutSettle(r,y,side);return;}
  if(y.pending.length){y.awaitingThrow=false;return;}
  if(y.captureBonus>0){y.captureBonus--;y.awaitingThrow=true;return;}
  y.turnIndex=(y.turnIndex+1)%orderedPlayers(r).length;y.awaitingThrow=true;
}
// ---------- Solo Hold'em AI ----------
function soloPokerBotId(userId){ return -100000-userId; }
function pokerBotDrive(r,userId){
  let guard=0;
  while(r.hand && r.hand.phase!=='complete' && r.hand.turnUserId!==userId && guard++<20){
    const botId=soloPokerBotId(userId), h=r.hand, hp=h.p[botId], rp=roomPlayer(r,botId);
    if(!hp||!rp)break;
    const toCall=Math.max(0,h.currentBet-hp.roundBet);
    let action='check',raiseTo=0;
    const boardCount=h.board.length;
    const aggression=boardCount>=3 ? 0.28 : 0.20;
    if(toCall===0){
      if(rp.stack>r.bigBlind*4 && Math.random()<aggression){action='raise';raiseTo=Math.min(hp.roundBet+rp.stack,Math.max(h.currentBet+h.minRaise,h.currentBet+r.bigBlind*2));}
    }else{
      const pressure=toCall/Math.max(1,rp.stack+toCall);
      if(pressure>.45 && Math.random()<.52) action='fold';
      else if(rp.stack>toCall+r.bigBlind*5 && Math.random()<.16){action='raise';raiseTo=Math.min(hp.roundBet+rp.stack,h.currentBet+Math.max(h.minRaise,r.bigBlind*2));}
      else action='call';
    }
    try{pokerAction(r,botId,action,raiseTo)}catch{try{pokerAction(r,botId,toCall?'call':'check',0)}catch{break}}
  }
}
function soloPokerStart(user,buyIn){
  buyIn=gameWager(buyIn,10000,100000,1000);
  if(soloHoldem.has(user.id))throw new Error('이미 AI 홀덤 테이블이 열려 있습니다.');
  if(user.balance<buyIn)throw new Error('게임머니가 부족합니다.');
  walletChange(user.id,-buyIn,'solo_holdem_buyin',`AI 홀덤 바이인 ${formatMoney(buyIn)}G`);
  const botId=soloPokerBotId(user.id);
  const r={id:`SOLOH${user.id}`,solo:true,name:'J-BOT HEADS UP',game:'holdem',buyIn,maxPlayers:2,hostId:user.id,smallBlind:Math.max(500,Math.floor(buyIn/100)),bigBlind:Math.max(1000,Math.floor(buyIn/50)),players:[
    {userId:user.id,nickname:user.nickname,avatar:user.avatar,seat:0,stack:buyIn},
    {userId:botId,nickname:'J-BOT',avatar:6,seat:1,stack:buyIn,bot:true}
  ],createdAt:now(),hand:null,dealerSeat:null};
  soloHoldem.set(user.id,r); escrowSet(r.id,user.id,buyIn,'solo_holdem'); pokerStart(r); pokerBotDrive(r,user.id); return r;
}
function soloPokerNext(userId){
  const r=soloHoldem.get(userId);if(!r)throw new Error('AI 홀덤 테이블이 없습니다.');
  if(r.hand&&r.hand.phase!=='complete')throw new Error('현재 핸드가 아직 끝나지 않았습니다.');
  const me=roomPlayer(r,userId),bot=roomPlayer(r,soloPokerBotId(userId));
  if(!me||me.stack<=0||!bot||bot.stack<=0)throw new Error('칩이 소진되었습니다. 테이블을 나가고 새로 시작하세요.');
  pokerStart(r);pokerBotDrive(r,userId);return r;
}
function soloPokerCashout(userId){
  const r=soloHoldem.get(userId);if(!r)return 0;
  if(r.hand&&r.hand.phase!=='complete'){
    const h=r.hand;if(h.turnUserId===userId){try{pokerAction(r,userId,'fold',0)}catch{}}
    else { const hp=h.p[userId]; if(hp&&!hp.folded){hp.folded=true;hp.acted=true;const bot=roomPlayer(r,soloPokerBotId(userId));pokerAwardSingle(r,bot);} }
  }
  const me=roomPlayer(r,userId);const amt=Math.max(0,me?.stack||0);
  if(amt>0)walletChange(userId,amt,'solo_holdem_cashout','AI 홀덤 테이블 정산');
  escrowDelete(r.id,userId);
  const won=(me?.stack||0)>r.buyIn; if(won)db.prepare('UPDATE stats SET solo_poker_wins=solo_poker_wins+1 WHERE user_id=?').run(userId);
  soloHoldem.delete(userId);return amt;
}

// ---------- Solo Yut AI v0.7 ----------
function soloYutStartGame(user,bet){
  bet=gameWager(bet,5000,100000,1000);
  if(soloYut.has(user.id))throw new Error('이미 AI 윷놀이가 진행 중입니다.');if(user.balance<bet)throw new Error('게임머니가 부족합니다.');
  walletChange(user.id,-bet,'solo_yut_bet',`AI 윷놀이 참가금 ${formatMoney(bet)}G`);
  const s={bet,phase:'playing',turn:'user',sides:{user:Array.from({length:4},yutNewPiece),bot:Array.from({length:4},yutNewPiece)},pending:[],awaitingThrow:true,captureBonus:0,last:null,winner:null,startedAt:now()};
  soloYut.set(user.id,s);escrowSet(`SOLOY${user.id}`,user.id,bet,'solo_yut');return s;
}
function soloYutPhysicalPieces(s,side,physical){return s.sides[side].map((p,i)=>yutPhysical(p)===physical?i:-1).filter(i=>i>=0);}
function soloYutMoveSide(s,side,pieceIndex,moveIndex=0){
  if(!s.pending.length)throw new Error('먼저 윷을 던져야 합니다.');if(s.awaitingThrow)throw new Error('윷/모 보너스 던지기를 먼저 진행하세요.');
  pieceIndex=clampInt(pieceIndex,0,3);moveIndex=clampInt(moveIndex,0,s.pending.length-1);const piece=s.sides[side][pieceIndex];if(yutFinished(piece))throw new Error('이미 완주한 말입니다.');
  const moveResult=s.pending[moveIndex],from=yutPhysical(piece),stack=from==='START'?[pieceIndex]:soloYutPhysicalPieces(s,side,from),adv=yutAdvance(piece,moveResult.move),dest=adv.piece,to=yutPhysical(dest);
  stack.forEach(i=>s.sides[side][i]=yutClonePiece(dest));
  if(to!=='START'&&to!=='FINISH')s.sides[side].forEach((p,i)=>{if(yutPhysical(p)===to)s.sides[side][i]=yutClonePiece(dest)});
  const other=side==='user'?'bot':'user',captured=[];
  if(to!=='START'&&to!=='FINISH')s.sides[other].forEach((p,i)=>{if(yutPhysical(p)===to){s.sides[other][i]=yutNewPiece();captured.push(i)}});
  s.pending.splice(moveIndex,1);if(captured.length)s.captureBonus++;
  s.last={type:'move',side,name:moveResult.name,move:moveResult.move,sticks:moveResult.sticks,from,to,trace:adv.trace,captured,stacked:soloYutPhysicalPieces(s,side,to).length};
  if(s.sides[side].every(yutFinished)){s.phase='complete';s.winner=side;s.pending=[];s.awaitingThrow=false;return;}
  if(s.pending.length){s.awaitingThrow=false;return;}
  if(s.captureBonus>0){s.captureBonus--;s.awaitingThrow=true;return;}
  s.turn=other;s.awaitingThrow=true;
}
function soloYutThrowFor(s,side){
  if(!s.awaitingThrow)throw new Error('먼저 말을 이동하세요.');const r=throwYut();s.pending.push(r);s.awaitingThrow=!!r.extra;s.last={type:'throw',side,...r};return r;
}
function soloYutBestMove(s,side){
  const other=side==='user'?'bot':'user';let best={pieceIndex:0,moveIndex:0,score:-1e9};
  s.pending.forEach((mv,mi)=>s.sides[side].forEach((p,pi)=>{
    if(yutFinished(p))return;const adv=yutAdvance(p,mv.move),to=yutPhysical(adv.piece);let score=adv.trace.length*2;
    if(to==='FINISH')score+=80;
    if(['O5','O10'].includes(to))score+=22;
    if(['A1','A2','CA','A4','A5','B1','B2','CB','B4','B5'].includes(adv.piece.node))score+=12;
    const enemy=s.sides[other].filter(op=>yutPhysical(op)===to).length;if(enemy)score+=55+enemy*8;
    const friendly=s.sides[side].filter((op,i)=>i!==pi&&yutPhysical(op)===to&&to!=='START').length;if(friendly)score+=20+friendly*5;
    // approximate progress preference
    const prog={'START':0,'O1':1,'O2':2,'O3':3,'O4':4,'O5':5,'A1':7,'A2':9,'CA':11,'A4':13,'A5':15,'O6':6,'O7':7,'O8':8,'O9':9,'O10':10,'B1':12,'B2':14,'CB':16,'B4':18,'B5':20,'O11':11,'O12':12,'O13':13,'O14':14,'O15':15,'O16':16,'O17':17,'O18':18,'O19':19,'O20':20,'FINISH':30}[adv.piece.node]||0;score+=prog;
    if(score>best.score)best={pieceIndex:pi,moveIndex:mi,score};
  }));return best;
}
function soloYutBotDrive(userId){
  const s=soloYut.get(userId);let guard=0;
  while(s&&s.phase==='playing'&&s.turn==='bot'&&guard++<30){
    while(s.awaitingThrow&&guard++<30){const r=soloYutThrowFor(s,'bot');if(!r.extra)break;}
    if(s.phase!=='playing'||s.turn!=='bot')break;
    if(!s.pending.length){s.awaitingThrow=true;continue;}
    const b=soloYutBestMove(s,'bot');soloYutMoveSide(s,'bot',b.pieceIndex,b.moveIndex);
  }
  return s;
}
function settleSoloYut(userId){const s=soloYut.get(userId);if(!s||s.phase!=='complete'||s.settled)return;s.settled=true;escrowDelete(`SOLOY${userId}`,userId);db.prepare('UPDATE stats SET yut_games=yut_games+1, yut_wins=yut_wins+?, solo_yut_wins=solo_yut_wins+? WHERE user_id=?').run(s.winner==='user'?1:0,s.winner==='user'?1:0,userId);if(s.winner==='user')walletChange(userId,s.bet*2,'solo_yut_win','AI 윷놀이 승리 상금');}

// ---------- Horse Racing v0.7 ----------
const HORSES=[
  {id:1,name:'번개제왕',emoji:'🐎',speed:94,stamina:82,finish:91,color:'#ffd166'},
  {id:2,name:'블루문',emoji:'🐎',speed:88,stamina:92,finish:84,color:'#67b7ff'},
  {id:3,name:'레드폭스',emoji:'🐎',speed:91,stamina:80,finish:95,color:'#ff6f7d'},
  {id:4,name:'골든윈드',emoji:'🐎',speed:85,stamina:96,finish:86,color:'#f7c85a'},
  {id:5,name:'나이트킹',emoji:'🐎',speed:90,stamina:88,finish:89,color:'#a98cff'},
  {id:6,name:'실버스타',emoji:'🐎',speed:84,stamina:90,finish:93,color:'#d5dde9'},
  {id:7,name:'썬더J',emoji:'🐎',speed:93,stamina:86,finish:90,color:'#56e3b4'}
];
function horseCard(){
  const entries=HORSES.map(h=>{const power=h.speed*.45+h.stamina*.25+h.finish*.30;return {...h,power,form:(crypto.randomInt(91,111)/100)}});
  const total=entries.reduce((a,h)=>a+h.power*h.form,0);
  const horses=entries.map(h=>({...h,winOdds:Number(Math.max(1.6,total/(h.power*h.form)*.78).toFixed(1))}));
  return {id:randomToken(6),horses,createdAt:now()};
}
function horseRun(card){
  return card.horses.map(h=>{let score=h.power*h.form+(crypto.randomInt(0,2200)/100)-11;score+=h.finish*(crypto.randomInt(0,100)/100)*.09;return {...h,raceScore:score};}).sort((a,b)=>b.raceScore-a.raceScore);
}
function raceMultiplier(type,picks,card){
  const hs=card.horses;const by=id=>hs.find(h=>h.id===Number(id));
  if(type==='win'){const h=by(picks[0]);return h?h.winOdds:0;}
  const a=by(picks[0]),b=by(picks[1]);if(!a||!b||a.id===b.id)return 0;
  const base=(a.winOdds*b.winOdds);
  if(type==='quinella')return Number(Math.max(3.0,base*.72).toFixed(1));
  if(type==='exacta')return Number(Math.max(5.0,base*1.15).toFixed(1));
  return 0;
}
function settleRace(userId,bet,type,picks,card,order){
  let won=false,placeBonus=false,finishRank=null;
  if(type==='win'){
    const picked=Number(picks[0]);finishRank=order.findIndex(h=>h.id===picked)+1;won=finishRank===1;placeBonus=finishRank===2;
  }
  else if(type==='quinella'){const top=[order[0].id,order[1].id].sort().join(',');won=top===[Number(picks[0]),Number(picks[1])].sort().join(',');}
  else if(type==='exacta')won=order[0].id===Number(picks[0])&&order[1].id===Number(picks[1]);
  const winMult=raceMultiplier(type,picks,card),mult=won?winMult:(placeBonus?.5:0),payout=won?Math.floor(bet*winMult):(placeBonus?Math.floor(bet*.5):0);
  if(payout>0)walletChange(userId,payout,won?'horse_win':'horse_place_bonus',won?`경마 ${type} 적중 x${winMult}`:'경마 단승 2위 위로금 x0.5');
  db.prepare('UPDATE stats SET horse_races=horse_races+1, horse_wins=horse_wins+?, horse_profit=horse_profit+? WHERE user_id=?').run(won?1:0,payout-bet,userId);
  return {won,placeBonus,finishRank,mult,payout,winMult};
}
// ---------- Big Wheel & Sic Bo v1.3 ----------
const BIG_WHEEL_SEGMENTS = [
  ...Array(10).fill({key:'x2',label:'×2',mult:2}),
  ...Array(6).fill({key:'x3',label:'×3',mult:3}),
  ...Array(4).fill({key:'x5',label:'×5',mult:5}),
  ...Array(2).fill({key:'x10',label:'×10',mult:10}),
  {key:'x15',label:'×15',mult:15},
  {key:'junja',label:'JUNJA',mult:20}
];
const BIG_WHEEL_BETS = [...new Map(BIG_WHEEL_SEGMENTS.map(x=>[x.key,x])).values()];
function bigWheelSpin(userId,bet,key){
  bet=gameWager(bet,1000,100000,1000);
  const u=userPublic(userId);if(!u||u.balance<bet)throw new Error('게임머니가 부족합니다.');
  const target=BIG_WHEEL_BETS.find(x=>x.key===key);if(!target)throw new Error('배당 선택을 확인해주세요.');
  walletChange(userId,-bet,'bigwheel_bet',`빅휠 ${target.label} 베팅 ${formatMoney(bet)}G`);
  const index=crypto.randomInt(BIG_WHEEL_SEGMENTS.length),landed=BIG_WHEEL_SEGMENTS[index],won=landed.key===target.key,payout=won?bet*target.mult:0;
  if(payout)walletChange(userId,payout,'bigwheel_win',`빅휠 ${target.label} 적중 x${target.mult}`);
  db.prepare('UPDATE stats SET bigwheel_plays=bigwheel_plays+1, bigwheel_wins=bigwheel_wins+?, bigwheel_profit=bigwheel_profit+? WHERE user_id=?').run(won?1:0,payout-bet,userId);
  return {index,landed,target,won,payout,profit:payout-bet,segments:BIG_WHEEL_SEGMENTS.length};
}
const SICBO_TOTAL_GROSS={4:51,5:19,6:15,7:13,8:9,9:7,10:6,11:6,12:7,13:9,14:13,15:15,16:19,17:51};
function sicboBetMeta(key){
  if(['small','big','odd','even','any-triple'].includes(key))return {key,label:{small:'SMALL 4–10',big:'BIG 11–17',odd:'ODD',even:'EVEN','any-triple':'ANY TRIPLE'}[key],mult:key==='any-triple'?31:2};
  const m=String(key||'').match(/^total-(\d{1,2})$/);if(m){const n=Number(m[1]);if(SICBO_TOTAL_GROSS[n])return {key:`total-${n}`,label:`TOTAL ${n}`,mult:SICBO_TOTAL_GROSS[n],total:n};}
  return null;
}
function sicboWon(meta,dice){
  const total=dice.reduce((a,b)=>a+b,0),triple=dice[0]===dice[1]&&dice[1]===dice[2];
  if(meta.key==='small')return !triple&&total>=4&&total<=10;
  if(meta.key==='big')return !triple&&total>=11&&total<=17;
  if(meta.key==='odd')return !triple&&total%2===1;
  if(meta.key==='even')return !triple&&total%2===0;
  if(meta.key==='any-triple')return triple;
  if(meta.total)return total===meta.total;
  return false;
}
function sicboRoll(userId,bet,key){
  bet=gameWager(bet,1000,100000,1000);const u=userPublic(userId);if(!u||u.balance<bet)throw new Error('게임머니가 부족합니다.');
  const meta=sicboBetMeta(key);if(!meta)throw new Error('다이사이 베팅 항목을 선택해주세요.');
  walletChange(userId,-bet,'sicbo_bet',`다이사이 ${meta.label} ${formatMoney(bet)}G`);
  const dice=[crypto.randomInt(1,7),crypto.randomInt(1,7),crypto.randomInt(1,7)],total=dice.reduce((a,b)=>a+b,0),triple=dice[0]===dice[1]&&dice[1]===dice[2],won=sicboWon(meta,dice),payout=won?bet*meta.mult:0;
  if(payout)walletChange(userId,payout,'sicbo_win',`다이사이 ${meta.label} 적중 x${meta.mult}`);
  db.prepare('UPDATE stats SET sicbo_plays=sicbo_plays+1, sicbo_wins=sicbo_wins+?, sicbo_profit=sicbo_profit+? WHERE user_id=?').run(won?1:0,payout-bet,userId);
  return {dice,total,triple,bet:meta,won,payout,profit:payout-bet};
}

// ---------- Seotda ----------
function seotdaDeck(){const d=[];for(let m=1;m<=10;m++){d.push({m,g:[1,3,8].includes(m),id:`${m}G`});d.push({m,g:false,id:`${m}N`});}return shuffle(d);}
function seotdaRank(cards){
  const a=cards[0],b=cards[1],m=[a.m,b.m].sort((x,y)=>x-y),key=m.join('-');
  const bothG=a.g&&b.g; if(bothG&&key==='3-8')return [100,'38광땡'];if(bothG&&key==='1-8')return [99,'18광땡'];if(bothG&&key==='1-3')return [98,'13광땡'];
  if(m[0]===m[1])return [70+m[0],`${m[0]===10?'장':m[0]}땡`];
  const specials={'1-2':[69,'알리'],'1-4':[68,'독사'],'1-9':[67,'구삥'],'1-10':[66,'장삥'],'4-10':[65,'장사'],'4-6':[64,'세륙']};if(specials[key])return specials[key];
  const k=(m[0]+m[1])%10;return [k,k===9?'갑오':k===0?'망통':`${k}끗`];
}
function soloSeotdaStart(user,bet){bet=gameWager(bet,5000,100000,1000);if(user.balance<bet)throw new Error('게임머니가 부족합니다.');const old=soloSeotda.get(user.id);if(old&&old.phase!=='complete')throw new Error('이미 섯다 판이 진행 중입니다.');if(old)soloSeotda.delete(user.id);walletChange(user.id,-bet,'seotda_bet',`AI 섯다 판돈 ${formatMoney(bet)}G`);escrowSet(`SEOTDA${user.id}`,user.id,bet,'seotda');const d=seotdaDeck();const s={bet,phase:'decision',userCards:[d.pop(),d.pop()],botCards:[d.pop(),d.pop()],revealed:false,result:null};soloSeotda.set(user.id,s);return s;}
function soloSeotdaResolve(userId,action){const s=soloSeotda.get(userId);if(!s||s.phase!=='decision')throw new Error('진행 중인 섯다 판이 없습니다.');let stake=s.bet;if(action==='double'){const u=userPublic(userId);if(u.balance<s.bet)throw new Error('두 배 승부에 필요한 게임머니가 부족합니다.');walletChange(userId,-s.bet,'seotda_double','AI 섯다 두 배 승부 추가 베팅');stake=s.bet*2;escrowSet(`SEOTDA${userId}`,userId,stake,'seotda');}if(action==='fold'){escrowDelete(`SEOTDA${userId}`,userId);s.phase='complete';s.revealed=true;s.result={winner:'bot',text:'다이 · J-BOT 승리',payout:0};db.prepare('UPDATE stats SET seotda_games=seotda_games+1 WHERE user_id=?').run(userId);return s;}const ur=seotdaRank(s.userCards),br=seotdaRank(s.botCards);const cmp=ur[0]-br[0];let payout=0,winner='tie';if(cmp>0){winner='user';payout=stake*2;}else if(cmp===0){payout=stake;}escrowDelete(`SEOTDA${userId}`,userId);if(payout)walletChange(userId,payout,'seotda_win',`AI 섯다 ${winner==='user'?'승리':'무승부'} 정산`);db.prepare('UPDATE stats SET seotda_games=seotda_games+1, seotda_wins=seotda_wins+? WHERE user_id=?').run(winner==='user'?1:0,userId);s.phase='complete';s.revealed=true;s.result={winner,payout,userRank:ur[1],botRank:br[1],text:winner==='user'?`${ur[1]} 승리!`:winner==='bot'?`${br[1]}에 패배`:`${ur[1]} 무승부`};return s;}

// ---------- Go-stop / Matgo simplified full 48-card engine ----------
const HWATU_MONTH_NAMES=['송학','매조','벚꽃','흑싸리','난초','모란','홍싸리','공산','국화','단풍','오동','비'];
function hwatuDeck(){
  const bright=new Set(['1:0','3:0','8:0','11:0','12:0']);const animal=new Set(['2:0','4:0','5:0','6:0','7:0','8:1','9:0','10:0']);const ribbon=new Set(['1:1','2:1','3:1','4:1','5:1','6:1','7:1','9:1','10:1']);const d=[];
  for(let m=1;m<=12;m++)for(let i=0;i<4;i++){const k=`${m}:${i}`;let type=bright.has(k)?'광':animal.has(k)?'열끗':ribbon.has(k)?'띠':'피';d.push({m,i,type,id:`${m}-${i}`});}return shuffle(d);
}
function gostopScore(captured){const count=t=>captured.filter(c=>c.type===t).length;const g=count('광'),a=count('열끗'),r=count('띠'),p=count('피');let score=0;if(g>=3)score+=g===5?15:g===4?4:3;if(a>=5)score+=a-4;if(r>=5)score+=r-4;if(p>=10)score+=p-9;return {score,g,a,r,p};}
function captureMatch(s,side,card){const matches=s.floor.filter(c=>c.m===card.m);let captured=[card];if(matches.length){captured.push(...matches);s.floor=s.floor.filter(c=>c.m!==card.m);s.captured[side].push(...captured);return true;}s.floor.push(card);return false;}
function gostopDrawAndCapture(s,side){const card=s.deck.pop();if(card)captureMatch(s,side,card);}
function gostopCanDecision(s,side){const sc=gostopScore(s.captured[side]).score;return sc>=7&&sc>s.lastDecisionScore[side];}
function gostopFinish(userId,winner,reason){const s=soloGostop.get(userId);if(!s||s.phase==='complete')return;escrowDelete(`GOSTOP${userId}`,userId);s.phase='complete';s.winner=winner;const us=gostopScore(s.captured.user),bs=gostopScore(s.captured.bot);let payout=0;if(winner==='user'){const mult=Math.max(1,us.score)*(1+s.goCount.user);payout=s.bet*Math.max(2,mult);walletChange(userId,payout,'gostop_win',`AI 고스톱 승리 x${Math.max(2,mult)}`);}db.prepare('UPDATE stats SET gostop_games=gostop_games+1, gostop_wins=gostop_wins+? WHERE user_id=?').run(winner==='user'?1:0,userId);s.result={reason,payout,userScore:us,botScore:bs};}
function gostopBotTurn(userId){const s=soloGostop.get(userId);if(!s||s.phase!=='playing')return;let guard=0;while(s.turn==='bot'&&s.phase==='playing'&&guard++<4){let best=0,bestScore=-1;s.hands.bot.forEach((c,i)=>{const matches=s.floor.filter(f=>f.m===c.m).length;const typeScore={광:8,'열끗':4,'띠':3,'피':1}[c.type]||0;const score=matches*20+typeScore;if(score>bestScore){bestScore=score;best=i}});const card=s.hands.bot.splice(best,1)[0];captureMatch(s,'bot',card);gostopDrawAndCapture(s,'bot');const sc=gostopScore(s.captured.bot);if(gostopCanDecision(s,'bot')){s.lastDecisionScore.bot=sc.score;if(sc.score>=10||s.hands.bot.length<=2||Math.random()<.35){gostopFinish(userId,'bot','J-BOT이 스톱을 선언했습니다.');return;}s.goCount.bot++;}if(!s.hands.bot.length&&!s.deck.length){const us=gostopScore(s.captured.user).score,bs=sc.score;gostopFinish(userId,us>bs?'user':'bot','패가 모두 소진되었습니다.');return;}s.turn='user';}}
function soloGostopStart(user,bet){bet=gameWager(bet,5000,100000,1000);if(user.balance<bet)throw new Error('게임머니가 부족합니다.');const old=soloGostop.get(user.id);if(old&&old.phase!=='complete')throw new Error('이미 고스톱 판이 진행 중입니다.');if(old)soloGostop.delete(user.id);walletChange(user.id,-bet,'gostop_bet',`AI 고스톱 판돈 ${formatMoney(bet)}G`);escrowSet(`GOSTOP${user.id}`,user.id,bet,'gostop');const d=hwatuDeck(),s={bet,phase:'playing',hands:{user:[],bot:[]},floor:[],captured:{user:[],bot:[]},deck:d,turn:'user',goCount:{user:0,bot:0},lastDecisionScore:{user:0,bot:0},needDecision:false,winner:null,result:null};for(let i=0;i<10;i++){s.hands.user.push(d.pop());s.hands.bot.push(d.pop());}for(let i=0;i<8;i++)s.floor.push(d.pop());soloGostop.set(user.id,s);return s;}
function soloGostopPlay(userId,cardId){const s=soloGostop.get(userId);if(!s||s.phase!=='playing')throw new Error('진행 중인 고스톱이 없습니다.');if(s.turn!=='user'||s.needDecision)throw new Error('지금은 패를 낼 수 없습니다.');const idx=s.hands.user.findIndex(c=>c.id===cardId);if(idx<0)throw new Error('손패에 없는 카드입니다.');const card=s.hands.user.splice(idx,1)[0];captureMatch(s,'user',card);gostopDrawAndCapture(s,'user');if(gostopCanDecision(s,'user')){s.needDecision=true;s.lastDecisionScore.user=gostopScore(s.captured.user).score;return s;}if(!s.hands.user.length&&!s.deck.length){const us=gostopScore(s.captured.user).score,bs=gostopScore(s.captured.bot).score;gostopFinish(userId,us>=bs?'user':'bot','패가 모두 소진되었습니다.');return s;}s.turn='bot';gostopBotTurn(userId);return s;}
function soloGostopDecision(userId,decision){const s=soloGostop.get(userId);if(!s||!s.needDecision)throw new Error('고/스톱을 선택할 차례가 아닙니다.');s.needDecision=false;if(decision==='stop'){gostopFinish(userId,'user','스톱!');return s;}s.goCount.user++;s.turn='bot';gostopBotTurn(userId);return s;}
function publicGostop(s){if(!s)return null;const {deck,...rest}=s;return {...rest,hands:{user:s.hands.user,bot:s.phase==='complete'?s.hands.bot:s.hands.bot.map(()=>({id:'XX'}))},deckCount:s.deck.length,score:{user:gostopScore(s.captured.user),bot:gostopScore(s.captured.bot)}};}

function activeRoomReactions(r){
  const t=now();
  r.reactions=r.reactions||{};
  for(const [uid,x] of Object.entries(r.reactions)){if(!x||Number(x.expiresAt||0)<=t)delete r.reactions[uid];}
  return Object.values(r.reactions).map(x=>({userId:x.userId,nickname:x.nickname,key:x.key,emoji:x.emoji,label:x.label,at:x.at,expiresAt:x.expiresAt}));
}

function personalizedRoom(r,userId){
  const turnUserId=currentTurnUserId(r),turnPlayer=turnUserId!=null?roomPlayer(r,turnUserId):null;
  return {
    id:r.id,name:r.name,game:r.game,buyIn:r.buyIn,maxPlayers:r.maxPlayers,hostId:r.hostId,status:roomStatus(r),smallBlind:r.smallBlind,bigBlind:r.bigBlind,yutMode:r.yutMode||'individual',yutModeLabel:yutModeLabel(r.yutMode||'individual'),
    version:r.version||0,updatedAt:r.updatedAt||r.createdAt,readyCount:roomReadyCount(r),allReady:r.players.length>=2&&r.players.every(p=>!!p.ready),
    turnUserId,turnNickname:turnPlayer?.nickname||null,myTurn:turnUserId===userId,
    players:orderedPlayers(r).map(p=>({...p,ready:!!p.ready,avatarEmoji:AVATARS[p.avatar%AVATARS.length]})),
    reactions:activeRoomReactions(r),
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
      if(containsContactInfo(nickname))return json(res,400,{error:'닉네임에는 전화번호, 이메일, SNS ID, 링크 같은 개인정보를 사용할 수 없습니다.'});
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
      if(u.is_disabled)return json(res,403,{error:'이 계정은 관리자에 의해 이용이 중지되었습니다.'});
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
      const u=requireAuth(req,res);if(!u)return;const rows=db.prepare(`SELECT u.nickname,u.balance,u.avatar,s.poker_wins,s.yut_wins,s.slot_profit,s.seotda_wins,s.gostop_wins FROM users u JOIN stats s ON s.user_id=u.id ORDER BY u.balance DESC LIMIT 20`).all().map(x=>({...x,avatarEmoji:AVATARS[x.avatar%AVATARS.length]}));return json(res,200,{rows});
    }
    if(url.pathname==='/api/admin/users'&&req.method==='GET'){
      const admin=requireAdmin(req,res);if(!admin)return;
      const q=escText(url.searchParams.get('q')||'',30);
      const like=`%${q}%`;
      const rows=db.prepare(`SELECT u.id,u.username,u.nickname,u.balance,u.created_at,u.is_admin,u.is_disabled,u.avatar,
        s.slot_spins,s.slot_profit,s.poker_hands,s.poker_wins,s.yut_games,s.yut_wins,s.seotda_games,s.seotda_wins,s.gostop_games,s.gostop_wins,s.horse_races,s.horse_wins,s.horse_profit,s.bigwheel_plays,s.bigwheel_wins,s.bigwheel_profit,s.sicbo_plays,s.sicbo_wins,s.sicbo_profit
        FROM users u JOIN stats s ON s.user_id=u.id
        WHERE (?='' OR u.username LIKE ? OR u.nickname LIKE ?)
        ORDER BY u.is_admin DESC,u.id DESC LIMIT 100`).all(q,like,like).map(x=>({...x,avatarEmoji:AVATARS[x.avatar%AVATARS.length]}));
      return json(res,200,{rows});
    }
    if(url.pathname==='/api/admin/audit'&&req.method==='GET'){
      const admin=requireAdmin(req,res);if(!admin)return;
      const rows=db.prepare(`SELECT a.id,a.action,a.amount,a.memo,a.created_at,au.nickname admin_nickname,tu.nickname target_nickname,tu.username target_username
        FROM admin_audit a JOIN users au ON au.id=a.admin_user_id JOIN users tu ON tu.id=a.target_user_id ORDER BY a.id DESC LIMIT 80`).all();
      return json(res,200,{rows});
    }
    if(url.pathname==='/api/admin/wallet'&&req.method==='POST'){
      const admin=requireAdmin(req,res);if(!admin)return;
      const b=await readBody(req);const targetId=Number(b.userId),memo=escText(b.memo,60)||'관리자 조정';
      const target=db.prepare('SELECT id,balance FROM users WHERE id=?').get(targetId);
      if(!Number.isInteger(targetId)||!target)return json(res,404,{error:'대상 회원을 찾을 수 없습니다.'});
      const raw=Math.abs(Math.trunc(Number(b.amount)||0)),direction=String(b.direction||'');
      if(!Number.isInteger(raw)||raw<1||raw>1000000000)return json(res,400,{error:'조정 금액은 1~1,000,000,000 G 범위의 정수로 입력하세요.'});
      let amount=direction==='debit'?-raw:direction==='credit'?raw:Number(b.amount);
      if(!Number.isInteger(amount)||amount===0)amount=raw;
      if(amount<0&&raw>target.balance)return json(res,400,{error:`현재 잔액 ${formatMoney(target.balance)}G보다 많이 차감할 수 없습니다.`});
      let balance;
      try{balance=walletChange(targetId,amount,amount>0?'admin_credit':'admin_debit',`관리자 조정 · ${memo}`);}catch(e){return json(res,400,{error:e.message});}
      db.prepare('INSERT INTO admin_audit(admin_user_id,target_user_id,action,amount,memo,created_at) VALUES(?,?,?,?,?,?)').run(admin.id,targetId,amount>0?'credit':'debit',amount,memo,now());
      pushRefresh();return json(res,200,{ok:true,balance,user:userPublic(targetId)});
    }
    if(url.pathname==='/api/admin/status'&&req.method==='POST'){
      const admin=requireAdmin(req,res);if(!admin)return;
      const b=await readBody(req);const targetId=Number(b.userId),disabled=b.disabled?1:0;
      const target=db.prepare('SELECT id,is_admin FROM users WHERE id=?').get(targetId);if(!target)return json(res,404,{error:'대상 회원을 찾을 수 없습니다.'});
      if(target.is_admin)return json(res,400,{error:'관리자 계정은 중지할 수 없습니다.'});
      db.prepare('UPDATE users SET is_disabled=? WHERE id=?').run(disabled,targetId);
      if(disabled)db.prepare('DELETE FROM sessions WHERE user_id=?').run(targetId);
      db.prepare('INSERT INTO admin_audit(admin_user_id,target_user_id,action,amount,memo,created_at) VALUES(?,?,?,?,?,?)').run(admin.id,targetId,disabled?'disable':'enable',0,disabled?'계정 이용중지':'계정 이용재개',now());
      pushRefresh();return json(res,200,{ok:true,user:userPublic(targetId)});
    }

    if(url.pathname==='/api/admin/rooms'&&req.method==='GET'){
      const admin=requireAdmin(req,res);if(!admin)return;const list=[...rooms.values()].map(r=>roomSummary(r)).sort((a,b)=>b.updatedAt-a.updatedAt);return json(res,200,{rows:list});
    }
    if(url.pathname==='/api/admin/rooms/clear-waiting'&&req.method==='POST'){
      const admin=requireAdmin(req,res);if(!admin)return;let count=0;for(const r of [...rooms.values()]){if(roomStatus(r)==='WAITING'){closeRoomAndRefund(r,'관리자 대기실 정리 환급');count++;}}return json(res,200,{ok:true,count});
    }
    const adminRoomClose=url.pathname.match(/^\/api\/admin\/rooms\/([A-F0-9]+)\/close$/);
    if(adminRoomClose&&req.method==='POST'){
      const admin=requireAdmin(req,res);if(!admin)return;const r=findRoom(adminRoomClose[1]);if(!r)return json(res,404,{error:'방을 찾을 수 없습니다.'});closeRoomAndRefund(r,'관리자 강제 종료 환급');return json(res,200,{ok:true});
    }

    if(url.pathname==='/api/slot/spin'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);let bet;try{bet=gameWager(b.bet,1000,100000,1000)}catch(e){return json(res,400,{error:e.message})};
      if(u.balance<bet)return json(res,400,{error:'게임머니가 부족합니다.'});
      walletChange(u.id,-bet,'slot_bet',`슬롯 베팅 ${formatMoney(bet)}G`);
      const pick=()=>{const total=SLOT_SYMBOLS.reduce((s,x)=>s+x.w,0);let n=crypto.randomInt(total);for(const x of SLOT_SYMBOLS){if(n<x.w)return x.s;n-=x.w;}return '🍒';};
      const grid=Array.from({length:3},()=>Array.from({length:3},()=>pick()));
      const winLines=[];
      let totalMultiplier=0;
      for(const line of SLOT_LINES){
        const symbols=line.cells.map(([r,c])=>grid[r][c]);
        if(symbols.every(s=>s===symbols[0])){
          const mult=SLOT_MULT[symbols[0]]||0;
          if(mult>0){
            totalMultiplier+=mult;
            winLines.push({label:line.label,cssClass:line.cssClass,cells:line.cells,symbols,mult});
          }
        }
      }
      const hasJLine=winLines.some(w=>w.symbols?.[0]==='J');
      if(!hasJLine){
        const jCells=[];
        for(let r=0;r<3;r++)for(let c=0;c<3;c++)if(grid[r][c]==='J')jCells.push([r,c]);
        if(jCells.length){
          const scatterMult=jCells.length*20;
          totalMultiplier+=scatterMult;
          winLines.push({label:'J SCATTER',cssClass:null,cells:jCells,symbols:jCells.map(()=> 'J'),mult:scatterMult,scatter:true});
        }
      }
      if(winLines.filter(w=>!w.scatter).length>=3) totalMultiplier+=15;
      const payout=Math.floor(bet*totalMultiplier);
      if(payout>0)walletChange(u.id,payout,'slot_win',`슬롯 당첨 x${totalMultiplier}`);
      const profit=payout-bet;db.prepare('UPDATE stats SET slot_spins=slot_spins+1, slot_wins=slot_wins+?, slot_profit=slot_profit+? WHERE user_id=?').run(payout>bet?1:0,profit,u.id);pushRefresh();
      const jackpotLine=winLines.find(w=>!w.scatter&&(w.symbols?.[0]==='7️⃣'||w.symbols?.[0]==='J'));
      return json(res,200,{grid,bet,payout,profit,totalMultiplier,winLines,user:userPublic(u.id),jackpot:!!jackpotLine,jackpotSymbol:jackpotLine?.symbols?.[0]||null});
    }

    // ---- Solo game routes ----
    if(url.pathname==='/api/solo/holdem/start'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);const r=soloPokerStart(u,Number(b.buyIn));return json(res,200,{room:personalizedRoom(r,u.id),user:userPublic(u.id)});}
    if(url.pathname==='/api/solo/holdem'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;const r=soloHoldem.get(u.id);return json(res,200,{room:r?personalizedRoom(r,u.id):null});}
    if(url.pathname==='/api/solo/holdem/action'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const r=soloHoldem.get(u.id);if(!r)return json(res,404,{error:'AI 홀덤 테이블이 없습니다.'});const b=await readBody(req);pokerAction(r,u.id,b.action,b.raiseTo);pokerBotDrive(r,u.id);return json(res,200,{room:personalizedRoom(r,u.id)});}
    if(url.pathname==='/api/solo/holdem/next'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const r=soloPokerNext(u.id);return json(res,200,{room:personalizedRoom(r,u.id)});}
    if(url.pathname==='/api/solo/holdem/leave'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const amount=soloPokerCashout(u.id);return json(res,200,{cashout:amount,user:userPublic(u.id)});}

    if(url.pathname==='/api/solo/yut/start'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);const game=soloYutStartGame(u,Number(b.bet));return json(res,200,{game,user:userPublic(u.id)});}
    if(url.pathname==='/api/solo/yut'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;const game=soloYut.get(u.id);return json(res,200,{game});}
    if(url.pathname==='/api/solo/yut/throw'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const s=soloYut.get(u.id);if(!s||s.phase!=='playing')return json(res,404,{error:'진행 중인 AI 윷놀이가 없습니다.'});if(s.turn!=='user')return json(res,409,{error:'지금은 J-BOT 차례입니다.'});if(!s.awaitingThrow)return json(res,409,{error:'먼저 움직일 말을 선택하세요.'});soloYutThrowFor(s,'user');return json(res,200,{game:s});}
    if(url.pathname==='/api/solo/yut/move'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const s=soloYut.get(u.id);if(!s)return json(res,404,{error:'AI 윷놀이가 없습니다.'});const b=await readBody(req);soloYutMoveSide(s,'user',Number(b.pieceIndex),Number(b.moveIndex||0));if(s.phase==='complete'){settleSoloYut(u.id);}else{soloYutBotDrive(u.id);settleSoloYut(u.id);}return json(res,200,{game:s,user:userPublic(u.id)});}
    if(url.pathname==='/api/solo/yut/quit'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const s=soloYut.get(u.id);if(s&&!s.settled)escrowDelete(`SOLOY${u.id}`,u.id);soloYut.delete(u.id);if(s&&!s.settled)db.prepare('UPDATE stats SET yut_games=yut_games+1 WHERE user_id=?').run(u.id);return json(res,200,{ok:true,user:userPublic(u.id)});}

    if(url.pathname==='/api/solo/seotda/start'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);let game;try{game=soloSeotdaStart(u,Number(b.bet))}catch(e){return json(res,400,{error:e.message})}return json(res,200,{game,user:userPublic(u.id)});}
    if(url.pathname==='/api/solo/seotda'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;return json(res,200,{game:soloSeotda.get(u.id)||null});}
    if(url.pathname==='/api/solo/seotda/action'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);const game=soloSeotdaResolve(u.id,b.action);return json(res,200,{game,user:userPublic(u.id)});}
    if(url.pathname==='/api/solo/seotda/reset'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const s=soloSeotda.get(u.id);if(s&&s.phase!=='complete')return json(res,409,{error:'진행 중인 판은 초기화할 수 없습니다.'});soloSeotda.delete(u.id);return json(res,200,{ok:true});}

    if(url.pathname==='/api/solo/gostop/start'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);let game;try{game=soloGostopStart(u,Number(b.bet))}catch(e){return json(res,400,{error:e.message})}return json(res,200,{game:publicGostop(game),user:userPublic(u.id)});}
    if(url.pathname==='/api/solo/gostop'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;return json(res,200,{game:publicGostop(soloGostop.get(u.id)||null)});}
    if(url.pathname==='/api/solo/gostop/play'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);const game=soloGostopPlay(u.id,String(b.cardId||''));return json(res,200,{game:publicGostop(game),user:userPublic(u.id)});}
    if(url.pathname==='/api/solo/gostop/decision'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);const game=soloGostopDecision(u.id,b.decision);return json(res,200,{game:publicGostop(game),user:userPublic(u.id)});}
    if(url.pathname==='/api/solo/gostop/reset'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const s=soloGostop.get(u.id);if(s&&s.phase!=='complete')return json(res,409,{error:'진행 중인 판은 초기화할 수 없습니다.'});soloGostop.delete(u.id);return json(res,200,{ok:true});}


    if(url.pathname==='/api/bigwheel/spin'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);let result;
      try{result=bigWheelSpin(u.id,Number(b.bet),String(b.key||''));}catch(e){return json(res,400,{error:e.message});}
      pushRefresh();return json(res,200,{result,user:userPublic(u.id)});
    }
    if(url.pathname==='/api/sicbo/roll'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);let result;
      try{result=sicboRoll(u.id,Number(b.bet),String(b.key||''));}catch(e){return json(res,400,{error:e.message});}
      pushRefresh();return json(res,200,{result,user:userPublic(u.id)});
    }

    if(url.pathname==='/api/horse/card'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;const card=horseCard();raceCards.set(u.id,card);return json(res,200,{card});
    }
    if(url.pathname==='/api/horse/race'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const b=await readBody(req),card=raceCards.get(u.id);if(!card)return json(res,409,{error:'먼저 새 경주표를 받아주세요.'});
      let bet;try{bet=gameWager(b.bet,1000,100000,1000)}catch(e){return json(res,400,{error:e.message})};
      if(u.balance<bet)return json(res,400,{error:'게임머니가 부족합니다.'});const type=['win','quinella','exacta'].includes(b.type)?b.type:'win';const picks=Array.isArray(b.picks)?b.picks.map(Number):[];
      if((type==='win'&&picks.length<1)||(type!=='win'&&picks.length<2)||new Set(picks).size!==picks.length)return json(res,400,{error:'말 선택을 확인해주세요.'});
      walletChange(u.id,-bet,'horse_bet',`경마 ${type} 베팅 ${formatMoney(bet)}G`);const order=horseRun(card);const result=settleRace(u.id,bet,type,picks,card,order);raceCards.delete(u.id);pushRefresh();
      return json(res,200,{order:order.map((h,i)=>({id:h.id,name:h.name,color:h.color,finish:i+1})),result,user:userPublic(u.id)});
    }
    if(url.pathname==='/api/my-room'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;const r=findUserRoom(u.id);return json(res,200,{room:r?personalizedRoom(r,u.id):null});
    }
    if(url.pathname==='/api/rooms'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;const game=url.searchParams.get('game');const list=[...rooms.values()].filter(r=>!game||r.game===game).map(roomSummary).sort((a,b)=>a.status.localeCompare(b.status));return json(res,200,{rooms:list});
    }
    if(url.pathname==='/api/rooms'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;if(findUserRoom(u.id))return json(res,409,{error:'이미 다른 게임방에 참가 중입니다. 먼저 그 방에서 나와주세요.'});const b=await readBody(req),game=b.game==='yut'?'yut':'holdem';
      const yutMode=game==='yut'&&['individual','2v2','3v3'].includes(b.yutMode)?b.yutMode:'individual';const maxPlayers=game==='holdem'?clampInt(b.maxPlayers,2,6):(yutMode==='2v2'?4:yutMode==='3v3'?6:clampInt(b.maxPlayers,2,6));let buyIn;try{buyIn=gameWager(b.buyIn,5000,100000,1000)}catch(e){return json(res,400,{error:e.message})};
      if(u.balance<buyIn)return json(res,400,{error:'방 참가금보다 보유 게임머니가 적습니다.'});
      const id=makeRoomId();const name=game==='holdem'?`홀덤 테이블 ${id}`:`윷놀이 방 ${id}`;walletChange(u.id,-buyIn,`${game}_buyin`,`${name} 참가금`);
      const t=now();const r={id,name,game,buyIn,maxPlayers,hostId:u.id,smallBlind:game==='holdem'?Math.max(100,Math.floor(buyIn/100)):0,bigBlind:game==='holdem'?Math.max(200,Math.floor(buyIn/50)):0,players:[{userId:u.id,nickname:u.nickname,avatar:u.avatar,seat:0,stack:game==='holdem'?buyIn:0,ready:false,joinedAt:t}],createdAt:t,updatedAt:t,version:1,hand:null,yut:null,yutMode,dealerSeat:null,reactions:{}};
      rooms.set(id,r);escrowSet(id,u.id,buyIn,game);pushRefresh(id);return json(res,201,{room:personalizedRoom(r,u.id)});
    }
    const roomMatch=url.pathname.match(/^\/api\/rooms\/([A-F0-9]+)(?:\/(.*))?$/);
    if(roomMatch){
      const u=requireAuth(req,res);if(!u)return;const r=findRoom(roomMatch[1]);if(!r)return json(res,404,{error:'방을 찾을 수 없습니다.'});const op=roomMatch[2]||'';
      if(!op&&req.method==='GET')return json(res,200,{room:personalizedRoom(r,u.id)});
      if(op==='ready'&&req.method==='POST'){
        if(roomStatus(r)==='PLAYING')return json(res,409,{error:'게임 진행 중에는 준비 상태를 바꿀 수 없습니다.'});
        const p=roomPlayer(r,u.id);if(!p)return json(res,403,{error:'이 방 참가자가 아닙니다.'});p.ready=!p.ready;touchRoom(r);pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});
      }
      if(op==='reaction'&&req.method==='POST'){
        const p=roomPlayer(r,u.id);if(!p)return json(res,403,{error:'이 방 참가자가 아닙니다.'});
        const b=await readBody(req),key=String(b.key||'');const def=ROOM_REACTIONS[key];
        if(!def)return json(res,400,{error:'지원하지 않는 이모티콘입니다.'});
        r.reactions=r.reactions||{};const t=now();const prev=r.reactions[u.id];
        if(prev&&t-Number(prev.at||0)<700)return json(res,429,{error:'이모티콘은 잠깐 기다렸다가 다시 보내줘.'});
        r.reactions[u.id]={userId:u.id,nickname:p.nickname,key,emoji:def.emoji,label:def.label,at:t,expiresAt:t+4500};
        touchRoom(r);pushRefresh(r.id);return json(res,200,{ok:true,room:personalizedRoom(r,u.id)});
      }
      if(op==='close'&&req.method==='POST'){
        if(r.hostId!==u.id&&!u.is_admin)return json(res,403,{error:'방장 또는 관리자만 방을 비울 수 있습니다.'});
        closeRoomAndRefund(r,'방 비우기 환급');return json(res,200,{ok:true});
      }
      if(op==='recover'&&req.method==='POST'){
        if(!roomPlayer(r,u.id))return json(res,403,{error:'이 방 참가자가 아닙니다.'});
        const idle=now()-(r.updatedAt||r.createdAt||0);if(r.hostId!==u.id&&!u.is_admin&&roomStatus(r)==='PLAYING'&&idle<60000)return json(res,409,{error:`진행 중인 방은 ${Math.ceil((60000-idle)/1000)}초 후 강제 복구할 수 있습니다.`});
        closeRoomAndRefund(r,'오류 복구 환급');return json(res,200,{ok:true});
      }
      if(op==='join'&&req.method==='POST'){
        if(roomPlayer(r,u.id))return json(res,200,{room:personalizedRoom(r,u.id)});if(findUserRoom(u.id))return json(res,409,{error:'이미 다른 게임방에 참가 중입니다. 먼저 그 방에서 나와주세요.'});if(roomStatus(r)==='PLAYING')return json(res,409,{error:'게임 진행 중에는 입장할 수 없습니다.'});if(r.players.length>=r.maxPlayers)return json(res,409,{error:'방이 가득 찼습니다.'});if(u.balance<r.buyIn)return json(res,400,{error:'게임머니가 부족합니다.'});
        walletChange(u.id,-r.buyIn,`${r.game}_buyin`,`${r.name} 참가금`);r.players.push({userId:u.id,nickname:u.nickname,avatar:u.avatar,seat:nextSeat(r),stack:r.game==='holdem'?r.buyIn:0,ready:false,joinedAt:now()});escrowSet(r.id,u.id,r.buyIn,r.game);touchRoom(r);pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});
      }
      if(op==='leave'&&req.method==='POST'){
        const p=roomPlayer(r,u.id);if(!p)return json(res,200,{ok:true});if(roomStatus(r)==='PLAYING')return json(res,409,{error:'게임 진행 중에는 나갈 수 없습니다.'});
        const refund=r.game==='holdem'?p.stack:(r.yut?.phase==='complete'?0:r.buyIn); if(refund>0)walletChange(u.id,refund,`${r.game}_cashout`,`${r.name} 퇴장 환급`);escrowDelete(r.id,u.id);r.players=r.players.filter(x=>x.userId!==u.id);
        if(!r.players.length)rooms.delete(r.id);else {if(r.hostId===u.id)r.hostId=r.players[0].userId;touchRoom(r);}pushRefresh(r.id);return json(res,200,{ok:true});
      }
      if(op==='start'&&req.method==='POST'){
        if(r.hostId!==u.id)return json(res,403,{error:'방장만 시작할 수 있습니다.'});
        if(r.players.length<2)return json(res,409,{error:'최소 2명이 입장해야 시작할 수 있습니다.'});
        const notReady=r.players.filter(p=>!p.ready);if(notReady.length)return json(res,409,{error:`아직 준비하지 않은 참가자: ${notReady.map(p=>p.nickname).join(', ')}`});
        if(r.game==='holdem'){if(r.hand&&r.hand.phase!=='complete')return json(res,409,{error:'이미 핸드가 진행 중입니다.'});pokerStart(r);}else{
          if(r.yut?.phase==='playing')return json(res,409,{error:'이미 게임 중입니다.'});
          if(r.yut?.phase==='complete'){
            for(const p of r.players){const pu=userPublic(p.userId);if(!pu||pu.balance<r.buyIn)return json(res,409,{error:`${p.nickname}의 게임머니가 부족해 재경기를 시작할 수 없습니다.`});}
            for(const p of r.players){walletChange(p.userId,-r.buyIn,'yut_rebuy',`${r.name} 재경기 참가금`);escrowSet(r.id,p.userId,r.buyIn,'yut');}
          }
          yutStart(r);
        }
        touchRoom(r);pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});
      }
      if(op==='poker/action'&&req.method==='POST'){
        if(r.game!=='holdem')return json(res,400,{error:'홀덤 방이 아닙니다.'});const b=await readBody(req);pokerAction(r,u.id,b.action,b.raiseTo);touchRoom(r);pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});
      }
      if(op==='yut/throw'&&req.method==='POST'){
        if(r.game!=='yut')return json(res,400,{error:'윷놀이 방이 아닙니다.'});const result=yutThrow(r,u.id);touchRoom(r);pushRefresh(r.id);return json(res,200,{result,room:personalizedRoom(r,u.id)});
      }
      if(op==='yut/move'&&req.method==='POST'){
        if(r.game!=='yut')return json(res,400,{error:'윷놀이 방이 아닙니다.'});const b=await readBody(req);yutMove(r,u.id,b.pieceIndex,b.moveIndex||0);touchRoom(r);pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});
      }
    }

    if(url.pathname.startsWith('/api/'))return json(res,404,{error:'API를 찾을 수 없습니다.'});
    return serveStatic(req,res,url);
  }catch(e){console.error(e); if(!res.headersSent)json(res,500,{error:e.message||'서버 오류가 발생했습니다.'});else try{res.end()}catch{}}
});

server.listen(PORT,HOST,()=>console.log(`JUNJA GAME CLUB listening on http://${HOST}:${PORT}`));

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('./persistent-db');
const createTreasureRaid = require('./treasure-raid-server');

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const ADMIN_NICKNAME = '갓준자';
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
CREATE TABLE IF NOT EXISTS user_inventory (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  purchase_price INTEGER NOT NULL,
  purchased_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,item_id)
);
CREATE TABLE IF NOT EXISTS user_loadout (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  character TEXT,
  costume TEXT,
  frame TEXT,
  title TEXT,
  pet TEXT,
  table_skin TEXT,
  card_back TEXT,
  bubble_pack TEXT
);
CREATE TABLE IF NOT EXISTS game_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS room_escrow (
  room_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  game TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(room_id, user_id)
);
CREATE TABLE IF NOT EXISTS daily_draw_picks (
  draw_date TEXT NOT NULL,
  number INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  prize INTEGER NOT NULL,
  picked_at INTEGER NOT NULL,
  PRIMARY KEY(draw_date, number),
  UNIQUE(draw_date, user_id)
);
CREATE TABLE IF NOT EXISTS daily_draw_bonus_picks (
  draw_date TEXT NOT NULL,
  number INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pick_slot INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  prize INTEGER NOT NULL,
  picked_at INTEGER NOT NULL,
  PRIMARY KEY(draw_date, number),
  UNIQUE(draw_date, user_id, pick_slot)
);
`);

function ensureColumn(table, column, sql){
  const cols=db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name);
  if(!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sql}`);
}
ensureColumn('users','last_rank_salary','TEXT');
ensureColumn('users','rank_free_slot_date','TEXT');
ensureColumn('users','rank_free_slot_used','INTEGER NOT NULL DEFAULT 0');
ensureColumn('users','rank_free_wheel_date','TEXT');
ensureColumn('users','rank_free_wheel_used','INTEGER NOT NULL DEFAULT 0');
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
ensureColumn('stats','seven_games','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','seven_wins','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','baccarat_games','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','baccarat_wins','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','baccarat_profit','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','roulette_plays','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','roulette_wins','INTEGER NOT NULL DEFAULT 0');
ensureColumn('stats','roulette_profit','INTEGER NOT NULL DEFAULT 0');
ensureColumn('users','is_admin','INTEGER NOT NULL DEFAULT 0');
ensureColumn('users','is_disabled','INTEGER NOT NULL DEFAULT 0');
ensureColumn('users','rank_level','INTEGER NOT NULL DEFAULT 0');
ensureColumn('user_loadout','character','TEXT');

const SLOT_JACKPOT_BASE = 50000000;
function gameStateGet(key,fallback=null){
  const row=db.prepare('SELECT value FROM game_state WHERE key=?').get(String(key));
  if(!row)return fallback;
  try{return JSON.parse(row.value)}catch{return row.value}
}
function gameStateSet(key,value){
  db.prepare(`INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).run(String(key),JSON.stringify(value),now());
  return value;
}
function slotJackpotPool(){
  const n=Number(gameStateGet('slot_jackpot_pool',SLOT_JACKPOT_BASE));
  return Number.isSafeInteger(n)&&n>=SLOT_JACKPOT_BASE?n:SLOT_JACKPOT_BASE;
}
if(gameStateGet('slot_jackpot_pool',null)==null)gameStateSet('slot_jackpot_pool',SLOT_JACKPOT_BASE);
const SLOT_777_EVENT_CHANCE = 0.10;
function slot777EventActive(){return gameStateGet('slot_777_event_active',false)===true;}


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
const liveFloors = new Map();
const soloSeven = new Map();
const baccaratRooms = new Map();

const AVATARS = ['🧑‍💼','😎','🧢','👑','🐯','🐻','🦊','🐼','🐸','🦁'];
const LIVE_GAMES = new Set(['slot','holdem','sevenpoker','yut','seotda','gostop','horse','bigwheel','sicbo','baccarat','roulette']);
const ROOM_REACTIONS = {
  frustrated:{emoji:'😫',label:'답답해!',pack:'base'},
  hurry:{emoji:'⏩',label:'빨리빨리!',pack:'base'},
  cry:{emoji:'😭',label:'으앙 ㅠㅠ',pack:'base'},
  laugh:{emoji:'😂',label:'ㅋㅋㅋㅋ',pack:'base'},
  wow:{emoji:'😲',label:'헐?!',pack:'base'},
  sad:{emoji:'😢',label:'슬퍼...',pack:'base'},
  nice:{emoji:'😎',label:'나이스~',pack:'base'},
  go:{emoji:'🔥',label:'가즈아!',pack:'base'},
  lucky:{emoji:'🍀',label:'오늘 느낌 온다!',pack:'bubble_hype'},
  gg:{emoji:'🤝',label:'굿게임!',pack:'bubble_hype'},
  boom:{emoji:'💥',label:'터졌다!',pack:'bubble_hype'},
  clutch:{emoji:'🎯',label:'딱 맞췄다!',pack:'bubble_hype'},
  heart:{emoji:'💖',label:'좋아좋아!',pack:'bubble_cute'},
  wink:{emoji:'😉',label:'찡긋~',pack:'bubble_cute'},
  pout:{emoji:'🥺',label:'한 번만...',pack:'bubble_cute'},
  clap:{emoji:'👏',label:'박수!',pack:'bubble_cute'},
  crown:{emoji:'👑',label:'품격 있게~',pack:'bubble_royal'},
  sparkle:{emoji:'✨',label:'클래스가 다르지',pack:'bubble_royal'},
  salute:{emoji:'🫡',label:'인정!',pack:'bubble_royal'},
  throne:{emoji:'🪑',label:'왕좌는 내 자리',pack:'bubble_royal'},
  bigbet:{emoji:'💸',label:'큰 판 간다!',pack:'bubble_highroller'},
  chips:{emoji:'🪙',label:'칩 쌓아!',pack:'bubble_highroller'},
  allin:{emoji:'🔥',label:'올인 감성!',pack:'bubble_highroller'},
  myday:{emoji:'😎',label:'오늘은 내 날',pack:'bubble_highroller'},
  legend:{emoji:'⚡',label:'전설 등장!',pack:'bubble_legend'},
  classup:{emoji:'👑',label:'이게 클래스',pack:'bubble_legend'},
  mood:{emoji:'✨',label:'분위기 잡았다',pack:'bubble_legend'},
  finish:{emoji:'🏆',label:'끝내자!',pack:'bubble_legend'}
};

const SHOP_ITEMS = [
  {id:'char_f_happy_exclusive',category:'character',gender:'F',asset:'/art/special/happy-exclusive.png',name:'HAPPY ♥',icon:'♥',rarity:'prestige',price:0,desc:'햅피 전용 · 사쿠라 핑크 애니메이션 미소녀 스페셜 캐릭터',happyOnly:true,featured:true},
  {id:'char_lim_f_black_rose',category:'character',gender:'F',asset:'/art/special/limited-f-black-rose.webp',name:'블랙로즈 딜러',icon:'♠',rarity:'limited',price:10000000000,collection:'limited',featured:true,desc:'LIMITED COLLECTION · 기간 한정 스페셜 캐릭터'},
  {id:'char_lim_f_sakura',category:'character',gender:'F',asset:'/art/special/limited-f-sakura.webp',name:'벚꽃 무녀',icon:'🌸',rarity:'limited',price:10000000000,collection:'limited',featured:true,desc:'LIMITED COLLECTION · 기간 한정 스페셜 캐릭터'},
  {id:'char_lim_f_summer',category:'character',gender:'F',asset:'/art/special/limited-f-golden-princess.webp',name:'골든 프린세스',icon:'☀',rarity:'limited',price:10000000000,collection:'limited',featured:true,desc:'LIMITED COLLECTION · 기간 한정 스페셜 캐릭터'},
  {id:'char_lim_f_halloween',category:'character',gender:'F',asset:'/art/special/limited-f-halloween.webp',name:'할로윈 마녀',icon:'🎃',rarity:'limited',price:10000000000,collection:'limited',featured:true,desc:'LIMITED COLLECTION · 기간 한정 스페셜 캐릭터'},
  {id:'char_lim_f_winter',category:'character',gender:'F',asset:'/art/special/limited-f-winter.webp',name:'백야의 여제',icon:'❄',rarity:'limited',price:10000000000,collection:'limited',featured:true,desc:'LIMITED COLLECTION · 기간 한정 스페셜 캐릭터'},
  
  
  
  
  
  // TREASURE EXPLORERS · 프리미엄 세로형 컬렉션
  {id:'char_treasure_elisia',category:'character',gender:'F',asset:'/art/special/treasure-elisia.webp',name:'엘리시아',icon:'🧭',rarity:'mythic',price:30000000000,rankTier:2,collection:'treasure',featured:true,adminOnly:true,privateOnly:true,desc:'TREASURE EXPLORER · 관리자 비공개 컬렉션'},
  {id:'char_treasure_serena',category:'character',gender:'F',asset:'/art/special/treasure-serena.webp',name:'세레나',icon:'🗺️',rarity:'mythic',price:30000000000,rankTier:2,collection:'treasure',featured:true,adminOnly:true,privateOnly:true,desc:'TREASURE EXPLORER · 관리자 비공개 컬렉션'},
  {id:'char_treasure_kaira',category:'character',gender:'F',asset:'/art/special/treasure-kaira.webp',name:'카이라',icon:'💎',rarity:'mythic',price:30000000000,rankTier:2,collection:'treasure',featured:true,adminOnly:true,privateOnly:true,desc:'TREASURE EXPLORER · 관리자 비공개 컬렉션'},
  {id:'char_treasure_ruby',category:'character',gender:'F',asset:'/art/special/treasure-ruby.webp',name:'루비',icon:'🏮',rarity:'mythic',price:30000000000,rankTier:2,collection:'treasure',featured:true,adminOnly:true,privateOnly:true,desc:'TREASURE EXPLORER · 관리자 비공개 컬렉션'},
  {id:'char_treasure_bella',category:'character',gender:'F',asset:'/art/special/treasure-bella.webp',name:'벨라',icon:'🔮',rarity:'mythic',price:30000000000,rankTier:2,collection:'treasure',featured:true,adminOnly:true,privateOnly:true,desc:'TREASURE EXPLORER · 관리자 비공개 컬렉션'},
  {id:'char_treasure_natsu',category:'character',gender:'F',asset:'/art/special/treasure-natsu.webp',name:'나츠',icon:'⚙️',rarity:'prestige',price:50000000000,rankTier:2,collection:'treasure',featured:true,adminOnly:true,privateOnly:true,desc:'TREASURE EXPLORER · 관리자 비공개 컬렉션'},
  {id:'char_treasure_arne',category:'character',gender:'F',asset:'/art/special/treasure-arne.webp',name:'아르네',icon:'📜',rarity:'prestige',price:50000000000,rankTier:2,collection:'treasure',featured:true,adminOnly:true,privateOnly:true,desc:'TREASURE EXPLORER · 관리자 비공개 컬렉션'},
  {id:'char_treasure_camilla',category:'character',gender:'F',asset:'/art/special/treasure-camilla.webp',name:'카밀라',icon:'🏴‍☠️',rarity:'prestige',price:50000000000,rankTier:2,collection:'treasure',featured:true,adminOnly:true,privateOnly:true,desc:'TREASURE EXPLORER · 관리자 비공개 컬렉션'},
  {id:'char_treasure_mirea',category:'character',gender:'F',asset:'/art/special/treasure-mirea.webp',name:'미레아',icon:'🔥',rarity:'prestige',price:50000000000,rankTier:2,collection:'treasure',featured:true,adminOnly:true,privateOnly:true,desc:'TREASURE EXPLORER · 관리자 비공개 컬렉션'},
  {id:'char_treasure_shana',category:'character',gender:'F',asset:'/art/special/treasure-shana.webp',name:'샤나',icon:'🏺',rarity:'prestige',price:50000000000,rankTier:2,collection:'treasure',featured:true,adminOnly:true,privateOnly:true,desc:'TREASURE EXPLORER · 관리자 비공개 컬렉션'},

  // ROYAL CLUB · 왕 이상 전용 한정 컬렉션
  {id:'char_royalclub_m1',category:'character',gender:'M',asset:'/art/special/royal-club-m1.webp',name:'ROYAL CLUB M01',icon:'♔',rarity:'prestige',price:100000000000,rankTier:3,collection:'royalclub',featured:true,hideName:true,desc:'ROYAL CLUB · 왕 이상 전용 한정 컬렉션'},
  {id:'char_royalclub_m2',category:'character',gender:'M',asset:'/art/special/royal-club-m2.webp',name:'ROYAL CLUB M02',icon:'♔',rarity:'prestige',price:100000000000,rankTier:3,collection:'royalclub',featured:true,hideName:true,desc:'ROYAL CLUB · 왕 이상 전용 한정 컬렉션'},
  {id:'char_royalclub_m3',category:'character',gender:'M',asset:'/art/special/royal-club-m3.webp',name:'ROYAL CLUB M03',icon:'♔',rarity:'prestige',price:100000000000,rankTier:3,collection:'royalclub',featured:true,hideName:true,desc:'ROYAL CLUB · 왕 이상 전용 한정 컬렉션'},
  {id:'char_royalclub_f1',category:'character',gender:'F',asset:'/art/special/royal-club-f1.webp',name:'ROYAL CLUB F01',icon:'♔',rarity:'prestige',price:100000000000,rankTier:3,collection:'royalclub',featured:true,hideName:true,desc:'ROYAL CLUB · 왕 이상 전용 한정 컬렉션'},
  {id:'char_royalclub_f2',category:'character',gender:'F',asset:'/art/special/royal-club-f2.webp',name:'ROYAL CLUB F02',icon:'♔',rarity:'prestige',price:100000000000,rankTier:3,collection:'royalclub',featured:true,hideName:true,desc:'ROYAL CLUB · 왕 이상 전용 한정 컬렉션'},
  {id:'char_royalclub_f3',category:'character',gender:'F',asset:'/art/special/royal-club-f3.webp',name:'ROYAL CLUB F03',icon:'♔',rarity:'prestige',price:100000000000,rankTier:3,collection:'royalclub',featured:true,hideName:true,desc:'ROYAL CLUB · 왕 이상 전용 한정 컬렉션'},

  // PREMIUM CHARACTERS · 대표 아바타. 구매/장착 후 전 게임에서 사용
  {id:'char_m_luca',category:'character',gender:'M',asset:'/art/v26/characters/char_m_luca.webp',name:'루카',icon:'♠',rarity:'rare',price:5000000,desc:'부드러운 미소와 블루 수트. 부담 없이 시작하는 프리미엄 남캐'},
  {id:'char_m_jay',category:'character',gender:'M',asset:'/art/v26/characters/char_m_jay.webp',name:'제이',icon:'J',rarity:'rare',price:8000000,desc:'청록 네온 무드의 스트리트 하이롤러'},
  {id:'char_m_ryan',category:'character',gender:'M',asset:'/art/v26/characters/char_m_ryan.webp',name:'라이언',icon:'✦',rarity:'rare',price:12000000,desc:'보랏빛 웨이브 헤어와 세련된 나이트 룩'},
  {id:'char_m_noir',category:'character',gender:'M',asset:'/art/v26/characters/char_m_noir.webp',name:'노아르',icon:'♣',rarity:'rare',price:20000000,desc:'블랙 수트와 선글라스의 차가운 카지노 젠틀맨'},
  {id:'char_m_ace',category:'character',gender:'M',asset:'/art/v26/characters/char_m_ace.webp',name:'에이스 준',icon:'A♠',rarity:'epic',price:35000000,desc:'레드 블랙 수트와 에이스 핀. 카드 테이블 전용 분위기'},
  {id:'char_m_kai',category:'character',gender:'M',asset:'/art/v26/characters/char_m_kai.webp',name:'카이',icon:'◆',rarity:'epic',price:50000000,desc:'블루 스틸 무드의 깔끔한 포커 플레이어'},
  {id:'char_m_leon',category:'character',gender:'M',asset:'/art/v26/characters/char_m_leon.webp',name:'레온',icon:'♛',rarity:'epic',price:70000000,desc:'골드 포인트와 클래식 파트 헤어의 로열 남캐'},
  {id:'char_m_dante',category:'character',gender:'M',asset:'/art/v26/characters/char_m_dante.webp',name:'단테',icon:'♦',rarity:'epic',price:90000000,desc:'다크 레드 무드와 작은 흉터가 있는 승부사'},
  {id:'char_m_victor',category:'character',gender:'M',asset:'/art/v26/characters/char_m_victor.webp',name:'빅터 로열',icon:'V',rarity:'legendary',price:150000000,desc:'에메랄드 수트와 보석 브로치의 정통 VIP'},
  {id:'char_m_phantom',category:'character',gender:'M',asset:'/art/v26/characters/char_m_phantom.webp',name:'팬텀 K',icon:'K',rarity:'legendary',price:220000000,desc:'퍼플 마스크와 블랙 망토 분위기의 미스터리 캐릭터'},
  {id:'char_m_crown',category:'character',gender:'M',asset:'/art/v26/characters/char_m_crown.webp',name:'크라운 제이드',icon:'♚',rarity:'legendary',price:300000000,desc:'골드 왕실 무드와 크라운 핀을 가진 상위 컬렉터 남캐'},
  {id:'char_m_cosmos',category:'character',gender:'M',asset:'/art/v26/characters/char_m_cosmos.webp',name:'코스모스 레이',icon:'★',rarity:'legendary',price:450000000,desc:'별빛 블루 수트와 코스믹 오라가 흐르는 캐릭터'},
  {id:'char_m_emperor',category:'character',gender:'M',asset:'/art/v26/characters/char_m_emperor.webp',name:'엠퍼러 J',icon:'J♛',rarity:'mythic',price:650000000,desc:'황제 골드와 J 시그니처를 결합한 신화급 남캐'},
  {id:'char_m_royal',category:'character',gender:'M',asset:'/art/v26/characters/char_m_royal.webp',name:'로열 아르카나',icon:'✧',rarity:'mythic',price:800000000,desc:'퍼플 젬과 아르카나 무드의 최상위 로열 캐릭터'},
  {id:'char_m_junja',category:'character',gender:'M',asset:'/art/v26/characters/char_m_junja.webp',name:'JUNJA KING',icon:'♛',rarity:'prestige',price:1000000000,desc:'10억 G 프레스티지. 왕관·골드 오라를 가진 남캐 최종 컬렉션',featured:true},

  {id:'char_f_aria',category:'character',gender:'F',asset:'/art/v26/characters/char_f_aria.webp',name:'아리아',icon:'♥',rarity:'rare',price:5000000,desc:'핑크 리본과 단발 헤어의 밝고 세련된 여성 캐릭터'},
  {id:'char_f_yuna',category:'character',gender:'F',asset:'/art/v26/characters/char_f_yuna.webp',name:'유나',icon:'✦',rarity:'rare',price:8000000,desc:'블루 퍼플 드레스와 롱헤어의 청순 VIP'},
  {id:'char_f_sena',category:'character',gender:'F',asset:'/art/v26/characters/char_f_sena.webp',name:'세나',icon:'◆',rarity:'rare',price:12000000,desc:'민트 포니테일과 모던 딜러 룩'},
  {id:'char_f_ruby',category:'character',gender:'F',asset:'/art/v26/characters/char_f_ruby.webp',name:'루비',icon:'♦',rarity:'rare',price:20000000,desc:'루비 이어링과 레드 드레스의 화려한 캐릭터'},
  {id:'char_f_luna',category:'character',gender:'F',asset:'/art/v26/characters/char_f_luna.webp',name:'루나',icon:'☾',rarity:'epic',price:35000000,desc:'달빛 퍼플 무드와 긴 머리의 신비로운 캐릭터'},
  {id:'char_f_chloe',category:'character',gender:'F',asset:'/art/v26/characters/char_f_chloe.webp',name:'클로이',icon:'●',rarity:'epic',price:50000000,desc:'샴페인 골드 무드와 진주 포인트의 클래식 캐릭터'},
  {id:'char_f_ivy',category:'character',gender:'F',asset:'/art/v26/characters/char_f_ivy.webp',name:'아이비',icon:'❧',rarity:'epic',price:70000000,desc:'에메랄드 드레스와 자연스러운 웨이브 헤어'},
  {id:'char_f_vega',category:'character',gender:'F',asset:'/art/v26/characters/char_f_vega.webp',name:'베가',icon:'★',rarity:'epic',price:90000000,desc:'사파이어 포니테일과 스타 장식의 나이트 캐릭터'},
  {id:'char_f_belle',category:'character',gender:'F',asset:'/art/v26/characters/char_f_belle.webp',name:'벨 로열',icon:'♛',rarity:'legendary',price:150000000,desc:'골드 크라운 핀과 로열 드레스의 프리미엄 캐릭터'},
  {id:'char_f_noir',category:'character',gender:'F',asset:'/art/v26/characters/char_f_noir.webp',name:'느와르 레이디',icon:'♠',rarity:'legendary',price:220000000,desc:'블랙 마스크와 퍼플 드레스의 미스터리 VIP'},
  {id:'char_f_aurora',category:'character',gender:'F',asset:'/art/v26/characters/char_f_aurora.webp',name:'오로라',icon:'✧',rarity:'legendary',price:300000000,desc:'오로라 헤어와 빛나는 액세서리의 상위 컬렉터 캐릭터'},
  {id:'char_f_seraph',category:'character',gender:'F',asset:'/art/v26/characters/char_f_seraph.webp',name:'세라프',icon:'☼',rarity:'legendary',price:450000000,desc:'화이트 골드 드레스와 천상 오라의 세라프'},
  {id:'char_f_empress',category:'character',gender:'F',asset:'/art/v26/characters/char_f_empress.webp',name:'엠프레스 J',icon:'J♛',rarity:'mythic',price:650000000,desc:'황제 크라운과 J 시그니처를 가진 신화급 여성 캐릭터'},
  {id:'char_f_venus',category:'character',gender:'F',asset:'/art/v26/characters/char_f_venus.webp',name:'비너스 로열',icon:'✦',rarity:'mythic',price:800000000,desc:'로즈 젬과 로열 드레스의 최상위 여성 캐릭터'},
  {id:'char_f_junja',category:'character',gender:'F',asset:'/art/v26/characters/char_f_junja.webp',name:'JUNJA EMPRESS',icon:'♕',rarity:'prestige',price:1000000000,desc:'10억 G 프레스티지. 황금 왕관과 오라를 가진 여캐 최종 컬렉션',featured:true},

  {id:'char_m_blade',category:'character',gender:'M',asset:'/art/v29/characters/char_m_blade.png',name:'블레이드 렌',icon:'⚔',rarity:'mythic',price:120000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_m_sirius',category:'character',gender:'M',asset:'/art/v29/characters/char_m_sirius.png',name:'시리우스',icon:'✦',rarity:'mythic',price:180000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_m_kaiser',category:'character',gender:'M',asset:'/art/v29/characters/char_m_kaiser.png',name:'카이저',icon:'♜',rarity:'mythic',price:260000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_m_raven',category:'character',gender:'M',asset:'/art/v29/characters/char_m_raven.png',name:'레이븐',icon:'♠',rarity:'mythic',price:340000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_m_orion',category:'character',gender:'M',asset:'/art/v29/characters/char_m_orion.png',name:'오리온',icon:'★',rarity:'mythic',price:420000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_m_zephyr',category:'character',gender:'M',asset:'/art/v29/characters/char_m_zephyr.png',name:'제피르',icon:'♨',rarity:'mythic',price:520000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_m_sol',category:'character',gender:'M',asset:'/art/v29/characters/char_m_sol.png',name:'솔 레갈리아',icon:'☀',rarity:'mythic',price:620000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_m_abyss',category:'character',gender:'M',asset:'/art/v29/characters/char_m_abyss.png',name:'어비스',icon:'◆',rarity:'mythic',price:720000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_m_valor',category:'character',gender:'M',asset:'/art/v29/characters/char_m_valor.png',name:'발러',icon:'♛',rarity:'mythic',price:850000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_m_celest',category:'character',gender:'M',asset:'/art/v29/characters/char_m_celest.png',name:'셀레스트 킹',icon:'✧',rarity:'mythic',price:950000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_f_sakura',category:'character',gender:'F',asset:'/art/v29/characters/char_f_sakura.png',name:'사쿠라 벨',icon:'❀',rarity:'mythic',price:120000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_f_elise',category:'character',gender:'F',asset:'/art/v29/characters/char_f_elise.png',name:'엘리제',icon:'♫',rarity:'mythic',price:180000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_f_rose',category:'character',gender:'F',asset:'/art/v29/characters/char_f_rose.png',name:'블랙 로즈',icon:'♥',rarity:'mythic',price:260000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_f_angel',category:'character',gender:'F',asset:'/art/v29/characters/char_f_angel.png',name:'셀레스티아',icon:'✧',rarity:'mythic',price:340000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_f_lilith',category:'character',gender:'F',asset:'/art/v29/characters/char_f_lilith.png',name:'릴리스',icon:'♠',rarity:'mythic',price:420000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_f_regina',category:'character',gender:'F',asset:'/art/v29/characters/char_f_regina.png',name:'레지나',icon:'♕',rarity:'mythic',price:520000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_f_nova',category:'character',gender:'F',asset:'/art/v29/characters/char_f_nova.png',name:'노바',icon:'★',rarity:'mythic',price:620000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_f_mirage',category:'character',gender:'F',asset:'/art/v29/characters/char_f_mirage.png',name:'미라주',icon:'◇',rarity:'mythic',price:720000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_f_valkyrie',category:'character',gender:'F',asset:'/art/v29/characters/char_f_valkyrie.png',name:'발키리',icon:'⚜',rarity:'mythic',price:850000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_f_serenity',category:'character',gender:'F',asset:'/art/v29/characters/char_f_serenity.png',name:'세레니티',icon:'☾',rarity:'mythic',price:950000000,desc:'JUNJA LAND 신규 프리미엄 컬렉션 캐릭터'},
  {id:'char_admin_godjunja',category:'character',gender:'M',asset:'/art/v29/characters/char_admin_godjunja.png',name:'GOD JUNJA',icon:'👑',rarity:'prestige',price:0,adminOnly:true,featured:true,desc:'오직 갓준자 관리자만 사용할 수 있는 절대적 시그니처 캐릭터'},

  // COSTUMES · 보여지는 존재감 중심
  {id:'costume_dealer',category:'costume',name:'VIP 딜러',icon:'🎩',rarity:'rare',price:2000000,desc:'골드 딜러 햇과 하이롤러 무드'},
  {id:'costume_rabbit',category:'costume',name:'럭키 래빗',icon:'🐰',rarity:'rare',price:5000000,desc:'행운을 부르는 럭키 래빗 코스튬'},
  {id:'costume_tuxedo',category:'costume',name:'블랙 타이',icon:'🕴️',rarity:'rare',price:12000000,desc:'클래식 카지노 블랙 타이 스타일'},
  {id:'costume_royal',category:'costume',name:'로열 크라운',icon:'👑',rarity:'epic',price:25000000,desc:'입장 순간 시선이 모이는 왕관'},
  {id:'costume_angel',category:'costume',name:'헤븐 윙',icon:'😇',rarity:'epic',price:40000000,desc:'은은한 천상 오라의 화이트 윙'},
  {id:'costume_devil',category:'costume',name:'레드 데빌',icon:'😈',rarity:'epic',price:40000000,desc:'승부욕을 드러내는 레드 데빌'},
  {id:'costume_robot',category:'costume',name:'J-ROBOT MK.II',icon:'🤖',rarity:'legendary',price:80000000,desc:'메탈릭 JUNJA 미래형 코스튬'},
  {id:'costume_phantom',category:'costume',name:'팬텀 킹',icon:'🦹',rarity:'legendary',price:120000000,desc:'블랙 망토와 미스터리 하이롤러 무드'},
  {id:'costume_dragon',category:'costume',name:'골든 드래곤',icon:'🐲',rarity:'legendary',price:250000000,desc:'황금 용의 기운을 두른 상위 컬렉터 코스튬'},
  {id:'costume_emperor',category:'costume',name:'다이아 엠퍼러',icon:'💠',rarity:'mythic',price:500000000,desc:'다이아 광채가 흐르는 황제급 코스튬'},
  {id:'costume_junja',category:'costume',name:'JUNJA SIGNATURE',icon:'J',rarity:'mythic',price:750000000,desc:'클럽 최상위 시그니처 J 코스튬'},
  {id:'costume_imperator',category:'costume',name:'JUNJA IMPERATOR',icon:'♛',rarity:'prestige',price:1000000000,desc:'10억 G 프레스티지. JUNJA CLUB 최상위 황제 코스튬',featured:true},

  // PROFILE BORDERS · 실제 구매/장착 가능한 프로필 테두리
  {id:'frame_silver',category:'frame',name:'실버 라인',icon:'◌',rarity:'common',price:1000000,desc:'깔끔한 실버 메탈 프로필 테두리'},
  {id:'frame_bronze',category:'frame',name:'브론즈 링',icon:'◉',rarity:'common',price:2000000,desc:'클래식 브론즈 카지노 링'},
  {id:'frame_neon',category:'frame',name:'네온 베가스',icon:'✦',rarity:'rare',price:5000000,desc:'보라·블루 네온이 살아 움직이는 테두리'},
  {id:'frame_ruby',category:'frame',name:'루비 블레이즈',icon:'♦',rarity:'rare',price:10000000,desc:'붉은 루비광이 흐르는 프로필 테두리'},
  {id:'frame_sapphire',category:'frame',name:'사파이어 링',icon:'🔷',rarity:'rare',price:15000000,desc:'차가운 블루 사파이어 글로우'},
  {id:'frame_royal',category:'frame',name:'로열 골드',icon:'♛',rarity:'epic',price:30000000,desc:'왕실 골드 라인이 겹쳐지는 고급 테두리'},
  {id:'frame_blackcrown',category:'frame',name:'블랙 크라운',icon:'♚',rarity:'epic',price:50000000,desc:'블랙·골드 하이롤러 전용 테두리'},
  {id:'frame_aurora',category:'frame',name:'오로라',icon:'🌌',rarity:'epic',price:80000000,desc:'오로라 컬러가 순환하는 프레임'},
  {id:'frame_diamond',category:'frame',name:'다이아몬드',icon:'💎',rarity:'legendary',price:150000000,desc:'다이아 입자가 반짝이는 최고급 프로필 링'},
  {id:'frame_inferno',category:'frame',name:'인페르노',icon:'🔥',rarity:'legendary',price:200000000,desc:'불꽃이 맥동하는 강렬한 테두리'},
  {id:'frame_galaxy',category:'frame',name:'갤럭시 크라운',icon:'🌠',rarity:'legendary',price:300000000,desc:'은하빛과 별가루가 흐르는 프레임'},
  {id:'frame_emperor',category:'frame',name:'엠퍼러 골드',icon:'🏛️',rarity:'mythic',price:500000000,desc:'황제급 골드 레이어와 왕관 광채'},
  {id:'frame_junjaroyal',category:'frame',name:'JUNJA ROYAL',icon:'J',rarity:'mythic',price:750000000,desc:'J 시그니처 광채가 흐르는 최상급 테두리'},
  {id:'frame_legend',category:'frame',name:'LEGEND 1B',icon:'👑',rarity:'prestige',price:1000000000,desc:'10억 G 프레스티지. 소유 자체가 랭크인 전설 테두리',featured:true},

  // TITLES
  {id:'title_vip',category:'title',name:'VIP',icon:'VIP',rarity:'common',price:2000000,desc:'닉네임 아래 표시되는 VIP 칭호'},
  {id:'title_highroller',category:'title',name:'HIGH ROLLER',icon:'HR',rarity:'rare',price:8000000,desc:'큰 판을 즐기는 플레이어 칭호'},
  {id:'title_pokerace',category:'title',name:'POKER ACE',icon:'A♠',rarity:'epic',price:15000000,desc:'카드 테이블에 어울리는 에이스 칭호'},
  {id:'title_raceboss',category:'title',name:'RACE BOSS',icon:'🏁',rarity:'epic',price:20000000,desc:'그랜드 레이스 전용 감성 칭호'},
  {id:'title_jackpot',category:'title',name:'JACKPOT KING',icon:'777',rarity:'epic',price:30000000,desc:'잭팟 헌터의 존재감을 드러내는 칭호'},
  {id:'title_casinoking',category:'title',name:'CASINO KING',icon:'♛',rarity:'legendary',price:80000000,desc:'클럽 전체를 지배하는 카지노 킹'},
  {id:'title_grandmaster',category:'title',name:'GRAND MASTER',icon:'GM',rarity:'legendary',price:150000000,desc:'상위 컬렉터를 위한 그랜드 마스터'},
  {id:'title_legend',category:'title',name:'JUNJA LEGEND',icon:'J★',rarity:'mythic',price:300000000,desc:'JUNJA CLUB 레전드 칭호'},
  {id:'title_royalone',category:'title',name:'THE ROYAL ONE',icon:'♔',rarity:'mythic',price:600000000,desc:'단 한 명의 왕처럼 보이는 로열 칭호'},
  {id:'title_thejunja',category:'title',name:'THE JUNJA',icon:'J∞',rarity:'prestige',price:1000000000,desc:'10억 G 프레스티지. 최상위 명예 칭호',featured:true},

  // PETS
  {id:'pet_cat',category:'pet',name:'카지노 캣',icon:'🐈',rarity:'common',price:2000000,desc:'옆에서 조용히 응원하는 카지노 고양이'},
  {id:'pet_shiba',category:'pet',name:'럭키 시바',icon:'🐕',rarity:'rare',price:5000000,desc:'행운을 지켜보는 럭키 시바'},
  {id:'pet_fox',category:'pet',name:'루비 폭스',icon:'🦊',rarity:'rare',price:10000000,desc:'붉은 보석빛 여우 펫'},
  {id:'pet_robot',category:'pet',name:'칩봇 X',icon:'🤖',rarity:'epic',price:20000000,desc:'칩을 지키는 미니 카지노 로봇'},
  {id:'pet_panda',category:'pet',name:'VIP 판다',icon:'🐼',rarity:'epic',price:30000000,desc:'블랙&화이트 VIP 판다'},
  {id:'pet_dragon',category:'pet',name:'베이비 드래곤',icon:'🐉',rarity:'legendary',price:80000000,desc:'테이블 옆을 지키는 작은 용'},
  {id:'pet_tiger',category:'pet',name:'골든 타이거',icon:'🐅',rarity:'legendary',price:120000000,desc:'황금빛 승부사의 수호 호랑이'},
  {id:'pet_phoenix',category:'pet',name:'골든 피닉스',icon:'🦅',rarity:'legendary',price:250000000,desc:'황금 불꽃 오라를 가진 전설 펫'},
  {id:'pet_whale',category:'pet',name:'셀레스티얼 웨일',icon:'🐋',rarity:'mythic',price:500000000,desc:'별빛을 머금은 신화급 수호 펫'},
  {id:'pet_guardian',category:'pet',name:'JUNJA GUARDIAN',icon:'🦁',rarity:'prestige',price:1000000000,desc:'10억 G 프레스티지. 최상위 수호자 펫',featured:true},

  // TABLE SKINS
  {id:'table_emerald',category:'table_skin',name:'에메랄드 클래식',icon:'♣',rarity:'common',price:5000000,desc:'정통 카지노 에메랄드 펠트'},
  {id:'table_royalred',category:'table_skin',name:'로열 레드',icon:'♥',rarity:'rare',price:12000000,desc:'고급 레드 벨벳 테이블'},
  {id:'table_midnight',category:'table_skin',name:'미드나잇 블랙',icon:'♠',rarity:'epic',price:25000000,desc:'블랙&실버 하이롤러 룸'},
  {id:'table_neon',category:'table_skin',name:'네온 베가스',icon:'✦',rarity:'epic',price:50000000,desc:'보라·블루 네온 카지노 테이블'},
  {id:'table_diamond',category:'table_skin',name:'다이아 살롱',icon:'♦',rarity:'legendary',price:120000000,desc:'다이아 광택이 흐르는 프리미엄 살롱'},
  {id:'table_marble',category:'table_skin',name:'블랙 마블',icon:'⬢',rarity:'legendary',price:200000000,desc:'검은 대리석과 골드 인레이 테이블'},
  {id:'table_emperor',category:'table_skin',name:'엠퍼러 룸',icon:'🏛️',rarity:'mythic',price:500000000,desc:'황제 전용 프라이빗 카지노 룸'},
  {id:'table_palace',category:'table_skin',name:'JUNJA PALACE',icon:'👑',rarity:'prestige',price:1000000000,desc:'10억 G 프레스티지. JUNJA CLUB 최상위 테이블',featured:true},

  // CARD BACKS
  {id:'card_obsidian',category:'card_back',name:'옵시디언 백',icon:'🂠',rarity:'common',price:2000000,desc:'딥 블랙 옵시디언 카드 뒷면'},
  {id:'card_ruby',category:'card_back',name:'루비 백',icon:'♦',rarity:'rare',price:5000000,desc:'붉은 루비 보석 카드 뒷면'},
  {id:'card_sapphire',category:'card_back',name:'사파이어 백',icon:'♠',rarity:'rare',price:8000000,desc:'블루 사파이어 패턴 카드'},
  {id:'card_gold',category:'card_back',name:'24K 골드 백',icon:'♛',rarity:'epic',price:20000000,desc:'24K 골드 패턴 카드 뒷면'},
  {id:'card_cosmic',category:'card_back',name:'코스믹 J 백',icon:'J',rarity:'epic',price:50000000,desc:'J 로고가 빛나는 우주 테마'},
  {id:'card_dragon',category:'card_back',name:'드래곤 씰',icon:'🐲',rarity:'legendary',price:100000000,desc:'황금 용 문양의 카드 백'},
  {id:'card_diamond',category:'card_back',name:'다이아 데크',icon:'💎',rarity:'legendary',price:250000000,desc:'다이아 결정 패턴의 럭셔리 카드 백'},
  {id:'card_junja',category:'card_back',name:'JUNJA ROYAL DECK',icon:'J♛',rarity:'mythic',price:500000000,desc:'JUNJA 시그니처 로열 카드 백'},

  // SPEECH BUBBLE PACKS
  {id:'bubble_hype',category:'bubble_pack',name:'하이프 팩',icon:'💥',rarity:'rare',price:2000000,desc:'오늘 느낌 온다! · 굿게임! · 터졌다! · 딱 맞췄다!'},
  {id:'bubble_cute',category:'bubble_pack',name:'큐트 팩',icon:'💖',rarity:'rare',price:2000000,desc:'좋아좋아! · 찡긋~ · 한 번만... · 박수!'},
  {id:'bubble_royal',category:'bubble_pack',name:'로열 팩',icon:'👑',rarity:'epic',price:5000000,desc:'품격 있게~ · 클래스가 다르지 · 인정! · 왕좌는 내 자리'},
  {id:'bubble_highroller',category:'bubble_pack',name:'하이롤러 팩',icon:'💸',rarity:'legendary',price:10000000,desc:'큰 판 간다 · 칩 쌓아 · 올인 감성 · 오늘은 내 날'},
  {id:'bubble_legend',category:'bubble_pack',name:'레전드 팩',icon:'⚡',rarity:'mythic',price:25000000,desc:'전설 등장 · 이게 클래스 · 분위기 잡았다 · 끝내자'},
  {id:'title_rank_baron',category:'title',name:'골든 남작',icon:'♜',rarity:'epic',price:50000000,rankTier:1,desc:'신분 상점 TIER 1 · 남작 이상 전용 칭호'},
  {id:'title_rank_marquis',category:'title',name:'로열 후작',icon:'⚜',rarity:'legendary',price:200000000,rankTier:2,desc:'신분 상점 TIER 2 · 후작 이상 전용 칭호'},
  {id:'title_rank_king',category:'title',name:'카지노 킹',icon:'♔',rarity:'legendary',price:500000000,rankTier:3,desc:'신분 상점 TIER 3 · 왕 이상 전용 칭호'},
  {id:'title_rank_emperor',category:'title',name:'황금 황제',icon:'🏰',rarity:'mythic',price:1000000000,rankTier:4,desc:'신분 상점 TIER 4 · 황제 이상 전용 칭호'},
  {id:'title_rank_royal',category:'title',name:'JUNJA ROYAL',icon:'J',rarity:'prestige',price:3000000000,rankTier:5,desc:'신분 상점 TIER 5 · JUNJA ROYAL 전용 칭호'}
]
// v2.3 Luxury perks: equipped premium pieces provide tiny transparent benefits, hard-capped.
const SHOP_PERKS={char_m_junja:{slotLuckPct:.4,dailyBonusPct:2},char_f_junja:{slotLuckPct:.4,dailyBonusPct:2},char_m_royal:{slotLuckPct:.2},char_f_empress:{slotLuckPct:.2},frame_legend:{slotLuckPct:.3},frame_junjaroyal:{slotLuckPct:.2},pet_guardian:{slotLuckPct:.3,dailyBonusPct:2},pet_phoenix:{slotLuckPct:.15},title_thejunja:{dailyBonusPct:1}};
for(const item of SHOP_ITEMS){if(SHOP_PERKS[item.id])item.perk={...SHOP_PERKS[item.id]};}
const SHOP_BY_ID = Object.fromEntries(SHOP_ITEMS.map(x=>[x.id,Object.freeze({...x})]));
const LOADOUT_FIELDS = new Set(['character','costume','frame','title','pet','table_skin','card_back','bubble_pack']);
const SLOT_SYMBOLS = [
  // v2.8.14: slightly lower slot hit rate. 7 and J are 1.5% each before any explicit equipped-item perk.
  // 🍀/👑 remain removed. Regular symbols share the remaining 97%.
  {s:'🍒',w:23},{s:'🍋',w:20},{s:'🍊',w:18},{s:'🔔',w:15},{s:'⭐',w:12},{s:'💎',w:9},{s:'7️⃣',w:1.5},{s:'J',w:1.5}
];
const SLOT_MULT = {'🍒':1,'🍋':3,'🍊':5,'🔔':8,'⭐':10,'💎':20,'7️⃣':1000,'J':800};
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
function walletWager(v,balance,min=1000,step=1000){
  const n=Math.floor(Number(v)),cap=Math.floor(Number(balance||0));
  if(!Number.isSafeInteger(n)||n<min||n%step!==0) throw new Error(`금액은 최소 ${formatMoney(min)}G부터 ${formatMoney(step)}G 단위로 입력하세요.`);
  if(n>cap) throw new Error(`보유 게임머니(${formatMoney(cap)}G)를 초과해서 걸 수 없습니다.`);
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
    db.prepare('UPDATE users SET pass_salt=?,pass_hash=?,nickname=?,is_admin=1,is_disabled=0 WHERE id=?').run(salt,hash,ADMIN_NICKNAME,existing.id);
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

function dailyDrawPrize(rank){return rank===1?100000000000:rank===2?50000000000:rank===3?1000000000:10000000;}
function dailyDrawRanks(date){
  const key='daily_draw_ranks_'+date;let ranks=gameStateGet(key,null);
  if(Array.isArray(ranks)&&ranks.length===77)return ranks;
  ranks=Array.from({length:77},(_,i)=>i+1);for(let i=ranks.length-1;i>0;i--){const j=crypto.randomInt(i+1);[ranks[i],ranks[j]]=[ranks[j],ranks[i]];}gameStateSet(key,ranks);return ranks;
}
function dailyDrawState(userId){
  const date=kstDate(),ranks=dailyDrawRanks(date),perks=socialRankPerksForUser(userId);
  const base=db.prepare('SELECT number,user_id,rank,prize,picked_at FROM daily_draw_picks WHERE draw_date=? ORDER BY picked_at').all(date);
  const bonus=db.prepare('SELECT number,user_id,pick_slot,rank,prize,picked_at FROM daily_draw_bonus_picks WHERE draw_date=? ORDER BY picked_at').all(date);
  const used=[...base,...bonus].sort((a,b)=>a.picked_at-b.picked_at),mine=used.filter(x=>Number(x.user_id)===Number(userId));
  const top3=used.filter(x=>Number(x.rank)>=1&&Number(x.rank)<=3).sort((a,b)=>Number(a.rank)-Number(b.rank)).map(x=>{const u=db.prepare('SELECT nickname FROM users WHERE id=?').get(Number(x.user_id));return {rank:Number(x.rank),number:Number(x.number),prize:Number(x.prize),nickname:u?.nickname||'알 수 없음'};});
  return {date,usedNumbers:used.map(x=>x.number),top3,mine:mine.length?{number:mine[mine.length-1].number,rank:mine[mine.length-1].rank,prize:mine[mine.length-1].prize,pickedAt:mine[mine.length-1].picked_at}:null,
    myPicks:mine.map(x=>({number:x.number,rank:x.rank,prize:x.prize,pickedAt:x.picked_at})),usedAttempts:mine.length,maxAttempts:perks.dailyDraws,attemptsLeft:Math.max(0,perks.dailyDraws-mine.length),
    remaining:77-used.length,rankPerks:perks,prizes:{1:100000000000,2:50000000000,3:1000000000,other:10000000}};
}
function dailyDrawPick(userId,number){
  number=Number(number);if(!Number.isInteger(number)||number<1||number>77)throw new Error('1~77번 중 하나를 선택해주세요.');
  const date=kstDate(),ranks=dailyDrawRanks(date),perks=socialRankPerksForUser(userId);db.exec('BEGIN IMMEDIATE');
  try{
    const baseMine=db.prepare('SELECT COUNT(*) n FROM daily_draw_picks WHERE draw_date=? AND user_id=?').get(date,userId).n;
    const bonusMine=db.prepare('SELECT COUNT(*) n FROM daily_draw_bonus_picks WHERE draw_date=? AND user_id=?').get(date,userId).n;
    const usedAttempts=Number(baseMine)+Number(bonusMine);
    if(usedAttempts>=perks.dailyDraws)throw new Error(`오늘의 77 뽑기 ${perks.dailyDraws}회를 모두 사용했습니다.`);
    if(db.prepare('SELECT 1 FROM daily_draw_picks WHERE draw_date=? AND number=?').get(date,number)||db.prepare('SELECT 1 FROM daily_draw_bonus_picks WHERE draw_date=? AND number=?').get(date,number))throw new Error('이미 다른 유저가 선택한 번호입니다.');
    const rank=Number(ranks[number-1]),prize=dailyDrawPrize(rank),pickedAt=now();
    if(usedAttempts===0)db.prepare('INSERT INTO daily_draw_picks(draw_date,number,user_id,rank,prize,picked_at) VALUES(?,?,?,?,?,?)').run(date,number,userId,rank,prize,pickedAt);
    else db.prepare('INSERT INTO daily_draw_bonus_picks(draw_date,number,user_id,pick_slot,rank,prize,picked_at) VALUES(?,?,?,?,?,?,?)').run(date,number,userId,usedAttempts+1,rank,prize,pickedAt);
    const u=db.prepare('SELECT balance FROM users WHERE id=?').get(userId),next=Number(u.balance)+prize;if(!Number.isSafeInteger(next))throw new Error('보유 게임머니 한도를 초과합니다.');
    db.prepare('UPDATE users SET balance=? WHERE id=?').run(next,userId);
    db.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)').run(userId,prize,next,'daily_draw',`77 출석 뽑기 ${number}번 · ${rank}등 · ${usedAttempts+1}/${perks.dailyDraws}회`,pickedAt);
    db.exec('COMMIT');return {number,rank,prize,balance:next,state:dailyDrawState(userId)};
  }catch(e){try{db.exec('ROLLBACK')}catch{}throw e;}
}

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


function transferGameMoney(senderId,targetId,amount){
  senderId=Number(senderId);targetId=Number(targetId);amount=Math.trunc(Number(amount));
  if(!Number.isInteger(senderId)||!Number.isInteger(targetId)||senderId<1||targetId<1) throw new Error('회원 정보가 올바르지 않습니다.');
  if(senderId===targetId) throw new Error('자기 자신에게는 보낼 수 없습니다.');
  if(!Number.isSafeInteger(amount)||amount<1) throw new Error('보낼 금액은 1G 이상 보유 게임머니 범위의 정수로 입력하세요.');
  db.exec('BEGIN IMMEDIATE');
  try{
    const sender=db.prepare('SELECT id,nickname,balance,is_disabled FROM users WHERE id=?').get(senderId);
    const target=db.prepare('SELECT id,nickname,balance,is_disabled FROM users WHERE id=?').get(targetId);
    if(!sender) throw new Error('보내는 회원을 찾을 수 없습니다.');
    if(!target||target.is_disabled) throw new Error('받는 친구를 찾을 수 없습니다.');
    if(sender.is_disabled) throw new Error('현재 계정에서는 보낼 수 없습니다.');
    const feePct=Number(socialRankPerksForUser(senderId).transferFeePct||0),fee=Math.max(0,Math.floor(amount*feePct/100)),total=amount+fee;
    if(sender.balance<total) throw new Error(`송금액과 수수료를 포함해 ${formatMoney(total)}G가 필요합니다.`);
    const senderNext=sender.balance-total,targetNext=target.balance+amount,t=now();
    if(!Number.isSafeInteger(senderNext)||!Number.isSafeInteger(targetNext))throw new Error('게임머니 한도를 초과합니다.');
    db.prepare('UPDATE users SET balance=? WHERE id=?').run(senderNext,senderId);
    db.prepare('UPDATE users SET balance=? WHERE id=?').run(targetNext,targetId);
    db.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)').run(senderId,-total,senderNext,'friend_send',`${target.nickname}님에게 게임머니 보내기 · 송금 ${formatMoney(amount)}G · 신분 수수료 ${formatMoney(fee)}G (${feePct}%)`,t);
    db.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)').run(targetId,amount,targetNext,'friend_receive',`${sender.nickname}님에게 받은 게임머니`,t);
    db.exec('COMMIT');
    return {senderBalance:senderNext,targetBalance:targetNext,amount,fee,feePct,total,target:{id:target.id,nickname:target.nickname}};
  }catch(e){try{db.exec('ROLLBACK')}catch{};throw e;}
}

function ensureLoadout(userId){
  let row=db.prepare('SELECT * FROM user_loadout WHERE user_id=?').get(userId);
  if(!row){db.prepare('INSERT INTO user_loadout(user_id) VALUES(?)').run(userId);row=db.prepare('SELECT * FROM user_loadout WHERE user_id=?').get(userId);}
  return row;
}
function inventoryIds(userId){return new Set(db.prepare('SELECT item_id FROM user_inventory WHERE user_id=?').all(userId).map(x=>x.item_id));}
function collectionTier(count){
  if(count>=60)return {name:'CROWN COLLECTOR',icon:'👑',level:7};
  if(count>=45)return {name:'ROYAL COLLECTOR',icon:'♛',level:6};
  if(count>=32)return {name:'DIAMOND COLLECTOR',icon:'💎',level:5};
  if(count>=22)return {name:'GOLD COLLECTOR',icon:'🏆',level:4};
  if(count>=12)return {name:'SILVER COLLECTOR',icon:'✦',level:3};
  if(count>=5)return {name:'BRONZE COLLECTOR',icon:'★',level:2};
  if(count>=1)return {name:'ROOKIE COLLECTOR',icon:'•',level:1};
  return {name:'NEW MEMBER',icon:'◇',level:0};
}
function itemPublic(id){const x=SHOP_BY_ID[id];return x?{...x}:null;}
function cosmeticsPublic(userId,includePrivate=false){
  userId=Number(userId);
  const empty=()=>{const out={ownedCount:0,collection:collectionTier(0),perks:{slotLuckPct:0,dailyBonusPct:0}};for(const f of LOADOUT_FIELDS)out[f]=null;return out;};
  if(!Number.isInteger(userId)||userId<1||!db.prepare('SELECT 1 FROM users WHERE id=?').get(userId))return empty();
  const load=ensureLoadout(userId),owned=inventoryIds(userId),count=owned.size;
  const out={ownedCount:count,collection:collectionTier(count)};let slotLuckPct=0,dailyBonusPct=0;
  for(const f of LOADOUT_FIELDS){out[f]=load[f]?itemPublic(load[f]):null;if(out[f]?.happyOnly&&!isHappyUser(userId))out[f]=null;if(out[f]?.privateOnly&&!includePrivate)out[f]=null;const perk=out[f]?.perk||{};slotLuckPct+=Number(perk.slotLuckPct||0);dailyBonusPct+=Number(perk.dailyBonusPct||0);}
  out.perks={slotLuckPct:Math.min(1,Math.round(slotLuckPct*100)/100),dailyBonusPct:Math.min(5,Math.round(dailyBonusPct*100)/100)};
  return out;
}
function reactionAllowed(userId,key){
  const def=ROOM_REACTIONS[key];if(!def)return false;if(def.pack==='base')return true;
  const load=ensureLoadout(userId);return load.bubble_pack===def.pack && inventoryIds(userId).has(def.pack);
}
function isHappyUser(userId){const u=db.prepare('SELECT username,nickname FROM users WHERE id=?').get(userId);return !!u&&(String(u.username||'').trim().toLowerCase()==='햅피'||String(u.username||'').trim().toLowerCase()==='happy'||String(u.nickname||'').trim().toLowerCase()==='햅피'||String(u.nickname||'').trim().toLowerCase()==='happy');}
function shopState(userId){
  const load=ensureLoadout(userId),owned=inventoryIds(userId),u=db.prepare('SELECT is_admin FROM users WHERE id=?').get(userId),happy=isHappyUser(userId),shopTier=Number(socialRankPerksForUser(userId).shopTier||0);
  if(u?.is_admin)for(const item of SHOP_ITEMS)if(item.adminOnly)owned.add(item.id);
  if(happy)owned.add('char_f_happy_exclusive');
  return {items:SHOP_ITEMS.filter(x=>(!x.adminOnly||u?.is_admin)&&(!x.happyOnly||happy)).map(x=>({...x,owned:owned.has(x.id),equipped:load[x.category]===x.id,rankShopUnlocked:shopTier>=Number(x.rankTier||0),rankShopTier:shopTier})),loadout:cosmeticsPublic(userId,true),ownedCount:owned.size,rankShopTier:shopTier,rankShopUnlocked:shopTier>0};
}
function buyShopItem(userId,itemId){
  const item=SHOP_BY_ID[String(itemId||'')];if(!item)throw new Error('존재하지 않는 상점 아이템입니다.');
  if(item.adminOnly)throw new Error('GOD JUNJA는 갓준자 관리자 전용 캐릭터입니다.');
  if(item.happyOnly)throw new Error('HAPPY 캐릭터는 햅피 전용 캐릭터입니다.');
  if(Number(item.rankTier||0)>Number(socialRankPerksForUser(userId).shopTier||0))throw new Error(`현재 신분으로는 구매할 수 없는 신분 전용 아이템입니다.`);
  if(db.prepare('SELECT 1 FROM user_inventory WHERE user_id=? AND item_id=?').get(userId,item.id))throw new Error('이미 보유한 아이템입니다.');
  const oldMemo=`JUNJA BOUTIQUE · ${item.name} 구매`,newMemo=`${oldMemo} · 자동 장착`;
  const priorPurchase=db.prepare("SELECT amount,created_at FROM ledger WHERE user_id=? AND type='shop_purchase' AND amount=? AND (memo=? OR memo=?) ORDER BY id DESC LIMIT 1").get(userId,-item.price,oldMemo,newMemo);
  if(priorPurchase){
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare('INSERT INTO user_inventory(user_id,item_id,purchase_price,purchased_at) VALUES(?,?,?,?)').run(userId,item.id,Math.abs(Number(priorPurchase.amount||item.price)),Number(priorPurchase.created_at||now()));
      ensureLoadout(userId);
      if(LOADOUT_FIELDS.has(item.category))db.prepare(`UPDATE user_loadout SET ${item.category}=? WHERE user_id=?`).run(item.id,userId);
      db.exec('COMMIT');
      return {balance:db.prepare('SELECT balance FROM users WHERE id=?').get(userId)?.balance||0,item,recovered:true};
    }catch(e){try{db.exec('ROLLBACK')}catch{};throw e;}
  }
  db.exec('BEGIN IMMEDIATE');
  try{
    const u=db.prepare('SELECT balance FROM users WHERE id=?').get(userId);if(!u)throw new Error('사용자를 찾을 수 없습니다.');
    if(u.balance<item.price)throw new Error(`게임머니가 부족합니다. ${formatMoney(item.price)}G가 필요합니다.`);
    const next=u.balance-item.price,t=now();
    db.prepare('UPDATE users SET balance=? WHERE id=?').run(next,userId);
    db.prepare('INSERT INTO user_inventory(user_id,item_id,purchase_price,purchased_at) VALUES(?,?,?,?)').run(userId,item.id,item.price,t);
    ensureLoadout(userId);
    if(LOADOUT_FIELDS.has(item.category))db.prepare(`UPDATE user_loadout SET ${item.category}=? WHERE user_id=?`).run(item.id,userId);
    db.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)').run(userId,-item.price,next,'shop_purchase',`JUNJA BOUTIQUE · ${item.name} 구매 · 자동 장착`,t);
    const ownedNow=!!db.prepare('SELECT 1 FROM user_inventory WHERE user_id=? AND item_id=?').get(userId,item.id);
    const loadNow=ensureLoadout(userId);
    if(!ownedNow||LOADOUT_FIELDS.has(item.category)&&loadNow[item.category]!==item.id)throw new Error('구매 저장 검증에 실패했습니다. 결제는 취소됩니다.');
    db.exec('COMMIT');return {balance:next,item};
  }catch(e){try{db.exec('ROLLBACK')}catch{};throw e;}
}
function equipShopItem(userId,category,itemId){
  category=String(category||'');if(!LOADOUT_FIELDS.has(category))throw new Error('잘못된 장착 슬롯입니다.');
  ensureLoadout(userId);
  if(itemId==null||itemId==='') {db.prepare(`UPDATE user_loadout SET ${category}=NULL WHERE user_id=?`).run(userId);return cosmeticsPublic(userId,true);}
  const item=SHOP_BY_ID[String(itemId)];if(!item||item.category!==category)throw new Error('이 슬롯에 장착할 수 없는 아이템입니다.');
  const owner=db.prepare('SELECT is_admin FROM users WHERE id=?').get(userId);
  if(item.adminOnly&&!owner?.is_admin)throw new Error('갓준자 관리자 전용 캐릭터입니다.');
  if(item.happyOnly&&!isHappyUser(userId))throw new Error('HAPPY 캐릭터는 햅피 계정만 장착할 수 있습니다.');
  if(Number(item.rankTier||0)>Number(socialRankPerksForUser(userId).shopTier||0)&&!db.prepare('SELECT 1 FROM user_inventory WHERE user_id=? AND item_id=?').get(userId,item.id))throw new Error('현재 신분으로는 장착할 수 없는 신분 전용 아이템입니다.');
  if(!item.adminOnly&&!item.happyOnly&&!db.prepare('SELECT 1 FROM user_inventory WHERE user_id=? AND item_id=?').get(userId,item.id))throw new Error('먼저 아이템을 구매해주세요.');
  db.prepare(`UPDATE user_loadout SET ${category}=? WHERE user_id=?`).run(item.id,userId);const saved=ensureLoadout(userId);if(saved[category]!==item.id)throw new Error('장착 저장 검증에 실패했습니다.');return cosmeticsPublic(userId,true);
}

const SOCIAL_RANKS = [
  {level:0,name:'평민',icon:'◇',cost:0,className:'commoner'},
  {level:1,name:'상인',icon:'🪙',cost:100000000,className:'merchant'},
  {level:2,name:'부호',icon:'💎',cost:1000000000,className:'tycoon'},
  {level:3,name:'귀족',icon:'✦',cost:10000000000,className:'noble'},
  {level:4,name:'남작',icon:'♜',cost:50000000000,className:'baron'},
  {level:5,name:'자작',icon:'♞',cost:100000000000,className:'viscount'},
  {level:6,name:'백작',icon:'♛',cost:300000000000,className:'count'},
  {level:7,name:'후작',icon:'⚜',cost:500000000000,className:'marquis'},
  {level:8,name:'공작',icon:'👑',cost:1000000000000,className:'duke'},
  {level:9,name:'왕',icon:'♔',cost:3000000000000,className:'king'},
  {level:10,name:'황제',icon:'🏰',cost:10000000000000,className:'emperor'},
  {level:11,name:'JUNJA ROYAL',icon:'J',cost:30000000000000,className:'royal'},
  {level:12,name:'GOD JUNJA',icon:'G',cost:100000000000000,className:'god'}
];
function socialRankPerks(level){
  level=Math.max(0,Math.min(SOCIAL_RANKS.length-1,Number(level)||0));
  const extraDraws=level>=12?6:level>=11?4:level>=9?3:level>=6?2:level>=3?1:0;
  const dailyBonusPct=[0,5,10,15,20,30,40,50,65,80,100,150,300][level]||0;
  const dailySalary=[0,1000000,3000000,10000000,30000000,70000000,150000000,300000000,600000000,1200000000,2500000000,5000000000,10000000000][level]||0;
  const transferFeePct=[2,2,1.8,1.6,1.4,1.2,1,0.8,0.6,0.4,0.2,0,0][level]||0;
  const freeSlots=[0,0,0,5,8,12,18,25,35,50,70,100,200][level]||0;
  const freeSlotBet=[0,0,0,100000,200000,300000,500000,1000000,2000000,3000000,5000000,10000000,10000000][level]||0;
  const freeBigWheel=[0,0,0,5,8,12,18,25,35,50,70,100,200][level]||0;
  const horseWinBonusPct=[0,0,0,0,0,2,3,4,5,6,8,10,15][level]||0;
  const gameEntryDiscountPct=[0,0,0,0,2,3,4,5,6,8,10,12,20][level]||0;
  const giftBonusPct=[0,0,0,0,0,2,3,4,5,6,8,10,20][level]||0;
  const dailyInterestPct=[0,0,0,0,0,0,0,0.001,0.002,0.003,0.004,0.005,0.01][level]||0;
  const shopTier=level>=12?6:level>=11?5:level>=10?4:level>=9?3:level>=7?2:level>=4?1:0;
  const appearanceTier=level>=12?6:level>=11?5:level>=10?4:level>=9?3:level>=7?2:level>=4?1:0;
  return {extraDraws,dailyBonusPct,dailyDraws:1+extraDraws,dailySalary,transferFeePct,freeSlots,freeSlotBet,freeBigWheel,horseWinBonusPct,gameEntryDiscountPct,giftBonusPct,dailyInterestPct,shopTier,appearanceTier};
}
function socialRankPerksForUser(userId){
  const row=db.prepare('SELECT rank_level FROM users WHERE id=?').get(Number(userId));
  return socialRankPerks(row?.rank_level||0);
}
function consumeRankFreePlay(userId,kind,useFree=false){
  const d=kstDate(),slot=kind==='slot',dateCol=slot?'rank_free_slot_date':'rank_free_wheel_date',usedCol=slot?'rank_free_slot_used':'rank_free_wheel_used',limit=Number(socialRankPerksForUser(userId)[slot?'freeSlots':'freeBigWheel']||0);
  const row=db.prepare(`SELECT ${dateCol} d,${usedCol} used FROM users WHERE id=?`).get(userId);let used=row?.d===d?Number(row?.used||0):0;
  if(!useFree)return {free:false,used,limit,left:Math.max(0,limit-used)};
  if(limit<1)throw new Error('현재 신분에는 사용할 수 있는 무료권이 없습니다.');
  if(used>=limit)throw new Error('오늘 사용할 수 있는 신분 무료권을 모두 사용했습니다.');
  const info=db.prepare(`UPDATE users SET ${dateCol}=?,${usedCol}=? WHERE id=? AND (${dateCol} IS NULL OR ${dateCol}<>? OR ${usedCol}<?)`).run(d,used+1,userId,d,limit);
  if(info.changes!==1)throw new Error('무료권 사용 상태가 변경되었습니다. 다시 시도해주세요.');
  used++;return {free:true,used,limit,left:Math.max(0,limit-used)};
}
function rankFreePlayState(userId,kind){
  const d=kstDate(),slot=kind==='slot',dateCol=slot?'rank_free_slot_date':'rank_free_wheel_date',usedCol=slot?'rank_free_slot_used':'rank_free_wheel_used',limit=Number(socialRankPerksForUser(userId)[slot?'freeSlots':'freeBigWheel']||0);
  const row=db.prepare(`SELECT ${dateCol} d,${usedCol} used FROM users WHERE id=?`).get(Number(userId));const used=row?.d===d?Number(row?.used||0):0;
  return {used,limit,left:Math.max(0,limit-used)};
}
function socialRankPublic(userId){
  const row=db.prepare('SELECT rank_level FROM users WHERE id=?').get(Number(userId));
  const level=Math.max(0,Math.min(SOCIAL_RANKS.length-1,Number(row?.rank_level||0)));
  const current=SOCIAL_RANKS[level],next=SOCIAL_RANKS[level+1]||null;
  return {level,name:current.name,icon:current.icon,className:current.className,perks:socialRankPerks(level),freePlay:{slot:rankFreePlayState(userId,'slot'),wheel:rankFreePlayState(userId,'wheel')},maxLevel:!next,next:next?{level:next.level,name:next.name,icon:next.icon,cost:next.cost,className:next.className,perks:socialRankPerks(next.level)}:null};
}
function promoteSocialRank(userId){
  db.exec('BEGIN IMMEDIATE');
  try{
    const u=db.prepare('SELECT balance,rank_level FROM users WHERE id=?').get(userId);
    if(!u)throw new Error('사용자를 찾을 수 없습니다.');
    const level=Math.max(0,Math.min(SOCIAL_RANKS.length-1,Number(u.rank_level||0)));
    const next=SOCIAL_RANKS[level+1];
    if(!next)throw new Error('이미 GOD JUNJA 최고 신분입니다.');
    if(u.balance<next.cost)throw new Error(`신분 상승에 ${formatMoney(next.cost)} G가 필요합니다.`);
    const balance=u.balance-next.cost,t=now();
    db.prepare('UPDATE users SET balance=?,rank_level=? WHERE id=?').run(balance,next.level,userId);
    db.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)').run(userId,-next.cost,balance,'rank_promotion',`신분 상승 · ${next.name}`,t);
    db.exec('COMMIT');
    return {balance,rank:socialRankPublic(userId)};
  }catch(e){try{db.exec('ROLLBACK')}catch{};throw e;}
}

function userPublic(userId){
  const u=db.prepare(`SELECT u.id,u.username,u.nickname,u.balance,u.avatar,u.created_at,u.last_daily,u.is_admin,u.is_disabled,
    s.slot_spins,s.slot_wins,s.slot_profit,s.poker_hands,s.poker_wins,s.yut_games,s.yut_wins,
    s.seotda_games,s.seotda_wins,s.gostop_games,s.gostop_wins,s.solo_poker_wins,s.solo_yut_wins,
    s.horse_races,s.horse_wins,s.horse_profit,s.bigwheel_plays,s.bigwheel_wins,s.bigwheel_profit,s.sicbo_plays,s.sicbo_wins,s.sicbo_profit,
    s.seven_games,s.seven_wins,s.baccarat_games,s.baccarat_wins,s.baccarat_profit,s.roulette_plays,s.roulette_wins,s.roulette_profit
    FROM users u JOIN stats s ON s.user_id=u.id WHERE u.id=?`).get(userId);
  if(!u) return null;
  return {...u, avatarEmoji:AVATARS[u.avatar%AVATARS.length], cosmetics:cosmeticsPublic(userId,true), rank:socialRankPublic(userId), dailyAvailable:u.last_daily!==kstDate()};
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
function onlineCount(){ return new Set([...sseClients.values()].map(x=>Number(x.userId)).filter(Number.isFinite)).size; }

const PRESENCE_GAME_LABEL={slot:'슬롯',holdem:'텍사스 홀덤',sevenpoker:'세븐포커',baccarat:'바카라',yut:'윷놀이',seotda:'섯다',gostop:'야심찬 맞고',horse:'경마',bigwheel:'빅휠',sicbo:'다이사이',roulette:'룰렛'};
function presenceLiveEntry(userId){
  const uid=Number(userId);
  for(const game of LIVE_GAMES){const map=cleanLiveFloor(game),member=map.get(uid);if(member)return {game,member};}
  return null;
}
function presenceSoloState(game,userId,fallback='WAITING'){
  if(game==='holdem'){const r=soloHoldem.get(userId);if(r?.hand)return r.hand.phase!=='complete'?'PLAYING':'WAITING';}
  if(game==='yut'){const g=soloYut.get(userId);if(g)return String(g.phase||'').toLowerCase()==='complete'?'WAITING':'PLAYING';}
  if(game==='seotda'){const g=soloSeotda.get(userId);if(g)return String(g.phase||'').toLowerCase()==='complete'?'WAITING':'PLAYING';}
  if(game==='gostop'){const g=soloGostop.get(userId);if(g)return String(g.phase||'').toLowerCase()==='complete'?'WAITING':'PLAYING';}
  if(game==='sevenpoker'){const g=soloSeven.get(userId);if(g)return g.complete?'WAITING':'PLAYING';}
  return fallback==='PLAYING'?'PLAYING':'WAITING';
}
function presenceStateForGameUser(game,userId,fallback='WAITING'){
  const r=findUserRoom(userId);if(r&&r.game===game)return roomStatus(r)==='PLAYING'?'PLAYING':'WAITING';
  if(game==='baccarat'){const b=baccaratFindUser(userId);if(b)return b.phase==='dealing'?'PLAYING':'WAITING';}
  return presenceSoloState(game,userId,fallback);
}
function presenceSnapshot(){
  const ids=[...new Set([...sseClients.values()].map(x=>Number(x.userId)).filter(Number.isFinite))];
  return ids.map(userId=>{
    const u=userPublic(userId);if(!u)return null;
    let game=null,state='WAITING',mode='LOBBY',roomName='';
    const r=findUserRoom(userId);
    if(r){game=r.game;state=roomStatus(r)==='PLAYING'?'PLAYING':'WAITING';mode='MULTI';roomName=r.name||'';}
    else{
      const b=baccaratFindUser(userId);
      if(b){game='baccarat';state=b.phase==='dealing'?'PLAYING':'WAITING';mode='MULTI';roomName=b.name||'';}
      else{
        const live=presenceLiveEntry(userId);
        if(live){game=live.game;state=presenceStateForGameUser(game,userId,live.member?.state);mode=['holdem','sevenpoker','yut','seotda','gostop'].includes(game)&&state==='PLAYING'?'AI':'SOLO';}
      }
    }
    return {userId,nickname:u.nickname,avatar:u.avatar,cosmetics:cosmeticsPublic(userId),game,gameLabel:game?(PRESENCE_GAME_LABEL[game]||game):'로비',state,stateLabel:state==='PLAYING'?'게임중':'대기중',mode,roomName};
  }).filter(Boolean).sort((a,b)=>a.state===b.state?String(a.nickname).localeCompare(String(b.nickname),'ko'):a.state==='PLAYING'?-1:1);
}

function liveGameKey(v){
  const game=String(v||'').toLowerCase();
  if(!LIVE_GAMES.has(game)) throw new Error('지원하지 않는 라이브 게임입니다.');
  return game;
}
function liveFloorMap(game){
  game=liveGameKey(game);
  if(!liveFloors.has(game)) liveFloors.set(game,new Map());
  return liveFloors.get(game);
}
function cleanLiveFloor(game){
  const map=liveFloorMap(game),t=now();
  for(const [uid,p] of map){
    if(!p||t-Number(p.lastSeen||0)>18000) map.delete(uid);
    else if(p.reaction&&Number(p.reaction.expiresAt||0)<=t) p.reaction=null;
  }
  return map;
}
function liveFloorTouch(user,game,state=null){
  game=liveGameKey(game);const map=cleanLiveFloor(game),t=now(),prev=map.get(user.id),nextState=state==='PLAYING'||state==='WAITING'?state:(prev?.state||'WAITING');
  const p=prev||{userId:user.id,nickname:user.nickname,avatar:user.avatar,joinedAt:t,reaction:null,state:'WAITING'};
  const stateChanged=!!prev&&p.state!==nextState;
  p.nickname=user.nickname;p.avatar=user.avatar;p.state=nextState;p.lastSeen=t;map.set(user.id,p);
  return {isNew:!prev,stateChanged,member:p};
}
function liveFloorLeave(userId,game){
  try{const map=liveFloorMap(game);return map.delete(Number(userId));}catch{return false}
}
function liveFloorMembers(game){
  const t=now();
  return [...cleanLiveFloor(game).values()].sort((a,b)=>a.joinedAt-b.joinedAt).map(p=>({
    userId:p.userId,nickname:p.nickname,avatar:p.avatar,cosmetics:cosmeticsPublic(p.userId),joinedAt:p.joinedAt,lastSeen:p.lastSeen,state:presenceStateForGameUser(game,p.userId,p.state),
    reaction:p.reaction&&p.reaction.expiresAt>t?{key:p.reaction.key,emoji:p.reaction.emoji,label:p.reaction.label,at:p.reaction.at,expiresAt:p.reaction.expiresAt}:null
  }));
}

function roomStatus(r){ if(r.game==='holdem') return r.hand && r.hand.phase!=='complete'?'PLAYING':'WAITING'; if(r.game==='sevenpoker') return r.seven && !r.seven.complete?'PLAYING':'WAITING'; if(r.game==='seotda') return r.seotda&&r.seotda.phase!=='complete'?'PLAYING':'WAITING'; if(r.game==='yut') return r.yut?.phase==='playing'?'PLAYING':'WAITING'; if(r.game==='gostop') return r.gostop&&r.gostop.phase==='playing'?'PLAYING':'WAITING'; return 'WAITING'; }
function roomReadyCount(r){return r.players.filter(p=>p.ready).length;}
function holdemAutoStartEligible(r){
  return !!r&&r.game==='holdem'&&roomStatus(r)==='WAITING'&&r.players.length>=2&&r.players.every(p=>!!p.ready)&&r.players.filter(p=>Number(p.stack||0)>0).length>=2;
}
function holdemAutoStartAt(r){
  if(!holdemAutoStartEligible(r)){r.holdemAutoStartAt=null;return null;}
  const current=Number(r.holdemAutoStartAt||0);
  if(!Number.isFinite(current)||current<=0)r.holdemAutoStartAt=now()+5000;
  return Number(r.holdemAutoStartAt);
}
function maybeAutoStartHoldem(r){
  const at=holdemAutoStartAt(r);
  if(!at||now()<at)return false;
  r.holdemAutoStartAt=null;
  try{pokerStart(r);touchRoom(r);pushRefresh(r.id);return true;}
  catch(e){console.warn('[HOLDem auto-start]',e.message);return false;}
}
// Production-safe server sweep: first hand and every following hand start even if a client poll is delayed/paused.
const holdemAutoStartSweep=setInterval(()=>{
  for(const r of rooms.values())if(r?.game==='holdem')maybeAutoStartHoldem(r);
},1000);
holdemAutoStartSweep.unref?.();
function roomSummary(r){return {id:r.id,name:r.name,game:r.game,buyIn:r.buyIn,allWallet:!!r.allWallet,maxPlayers:r.maxPlayers,players:r.players.length,hostNickname:r.players.find(p=>p.userId===r.hostId)?.nickname||'호스트',status:roomStatus(r),smallBlind:r.smallBlind,bigBlind:r.bigBlind,yutMode:r.yutMode||'individual',yutModeLabel:yutModeLabel(r.yutMode||'individual'),readyCount:roomReadyCount(r),version:r.version||0,updatedAt:r.updatedAt||r.createdAt,participants:orderedPlayers(r).map(p=>({userId:p.userId,nickname:p.nickname,avatar:p.avatar,cosmetics:cosmeticsPublic(p.userId),ready:!!p.ready,seat:p.seat}))};}
function findRoom(id){ return rooms.get(String(id)); }
function roomPlayer(r,userId){ return r.players.find(p=>p.userId===userId); }
function findUserRoom(userId){ return [...rooms.values()].find(r=>roomPlayer(r,userId)); }
function makeRoomId(){ let id;do{id=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(id));return id; }
function nextSeat(r){ for(let i=0;i<r.maxPlayers;i++) if(!r.players.some(p=>p.seat===i)) return i; return -1; }
function touchRoom(r){r.updatedAt=now();r.version=(r.version||0)+1;}
function currentTurnUserId(r){if(r.game==='holdem')return r.hand?.phase!=='complete'?r.hand?.turnUserId:null;if(r.game==='sevenpoker')return r.seven&&!r.seven.complete?r.seven.turnUserId:null;if(r.game==='yut'&&r.yut?.phase==='playing')return yutCurrentPlayer(r,r.yut)?.userId||null;if(r.game==='gostop'&&r.gostop?.phase==='playing')return r.gostop.turn==='user'?r.gostop.userA:r.gostop.userB;return null;}
function closeRoomAndRefund(r,reason='방 종료 환급'){
  const playing=roomStatus(r)==='PLAYING';
  for(const p of [...r.players]){
    let refund=0;
    if(r.game==='holdem'){
      const hp=r.hand?.p?.[p.userId];
      refund=playing&&hp ? Math.max(0,Math.floor(p.stack+(hp.totalBet||0))) : Math.max(0,Math.floor(p.stack||0));
    } else if(r.game==='sevenpoker'){
      const committed=playing?Number(r.seven?.committed?.[p.userId]||0):0;refund=Math.max(0,Math.floor((p.stack||0)+committed));
    } else if(r.game==='seotda'){
      refund=r.seotda?.phase==='complete'?0:Math.max(0,Math.floor(r.buyIn||0));
    } else if(r.game==='gostop'){
      refund=r.gostop?.phase==='complete'?0:Math.max(0,Math.floor(r.buyIn||0));
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
  const h={phase:'preflop',deck,board:[],p:{},currentBet:0,minRaise:r.bigBlind,turnUserId:null,startedAt:now(),turnStartedAt:now(),result:null,dealerSeat:r.dealerSeat};
  for(const rp of seated) h.p[rp.userId]={hole:[deck.pop(),deck.pop()],roundBet:0,totalBet:0,folded:false,allIn:false,acted:false};
  r.hand=h;
  const post=(rp,amt)=>{const hp=h.p[rp.userId],pay=Math.min(amt,rp.stack);rp.stack-=pay;hp.roundBet+=pay;hp.totalBet+=pay;if(rp.stack===0)hp.allIn=true;};
  post(seated[sbIdx],r.smallBlind);post(seated[bbIdx],r.bigBlind);h.currentBet=Math.max(h.p[seated[sbIdx].userId].roundBet,h.p[seated[bbIdx].userId].roundBet);
  const firstIdx=nextEligibleIndex(seated,bbIdx,p=>!h.p[p.userId].folded&&!h.p[p.userId].allIn);
  h.turnUserId=firstIdx>=0?seated[firstIdx].userId:null;
  h.turnStartedAt=now();
  if(!h.turnUserId) pokerRunout(r);
}
function pokerAdvanceTurn(r,currentUserId){
  const h=r.hand, arr=pokerHandPlayers(r), idx=arr.findIndex(p=>p.userId===currentUserId);
  const ni=nextEligibleIndex(arr,idx,p=>{const hp=h.p[p.userId];return !hp.folded&&!hp.allIn;});
  h.turnUserId=ni>=0?arr[ni].userId:null;
  h.turnStartedAt=now();
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
  h.turnStartedAt=now();
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
  return {phase:h.phase,startedAt:h.startedAt,turnStartedAt:h.turnStartedAt,turnDeadlineAt:r.solo?null:Number(h.turnStartedAt||now())+15000,board:h.board,players,currentBet:h.currentBet,minRaise:h.minRaise,turnUserId:h.turnUserId,pot:pokerPot(h),dealerSeat:h.dealerSeat,result:h.result,myHand:pokerHandStatus(myCards),legal:me&&h.turnUserId===userId?{toCall:Math.max(0,h.currentBet-me.roundBet),minRaiseTo:h.currentBet+h.minRaise,maxRaiseTo:(roomPlayer(r,userId)?.stack||0)+me.roundBet}:null};
}

// ---------- Yut engine v0.7: stacking / shortcuts / teams ----------
const YUT_SIDE_COLORS=['#f5cb58','#5ba8ff','#ff6f8e','#65d49a','#b784ff','#ff9b57'];
function yutModeLabel(mode){return ({individual:'개인전','2v2':'2:2 팀전','3v3':'3:3 팀전'})[mode]||'개인전';}
function yutNewPiece(){return {node:'READY',route:'outer',path:[]};}
function yutClonePiece(p){return {node:p.node,route:p.route||'outer',path:Array.isArray(p.path)?p.path.map(x=>({node:x.node,route:x.route||'outer'})):[]};}
function yutPhysical(p){if(!p)return'READY';if(p.node==='CA'||p.node==='CB')return'C';return p.node||'READY';}
function yutFinished(p){return p?.node==='FINISH';}
function yutNextStep(p,firstStep,routeChoice='shortcut'){
  const node=p.node,route=p.route||'outer';
  if(node==='FINISH')return yutClonePiece(p);
  if(node==='READY')return {node:'O1',route:'outer'};
  if(node==='START')return {node:'FINISH',route:'outer'};
  if(node==='O5')return firstStep&&routeChoice!=='outer'?{node:'A1',route:'A'}:{node:'O6',route:'outer'};
  if(node==='O10')return firstStep&&routeChoice!=='outer'?{node:'B1',route:'B'}:{node:'O11',route:'outer'};
  if(/^O\d+$/.test(node)){
    const n=Number(node.slice(1));
    if(n<20)return {node:`O${n+1}`,route:'outer'};
    return {node:'START',route:'outer'};
  }
  const map={A1:['A2','A'],A2:['CA','A'],CA:['A4','A'],A4:['A5','A'],A5:['O15','outer'],B1:['B2','B'],B2:['CB','B'],CB:['B4','B'],B4:['B5','B'],B5:['START','B']};
  if(map[node])return {node:map[node][0],route:map[node][1]};
  return {node:'READY',route:'outer'};
}
function yutAdvance(piece,move,routeChoice='shortcut'){
  let p=yutClonePiece(piece);const trace=[];
  if(move<0){
    if(p.node==='READY'||p.node==='FINISH'||!p.path.length)return {piece:p,trace,legal:false};
    const prev=p.path.pop();p={node:prev.node,route:prev.route||'outer',path:p.path};trace.push(yutPhysical(p));return {piece:p,trace,legal:true};
  }
  for(let i=0;i<move;i++){const history={node:p.node,route:p.route||'outer'};const next=yutNextStep(p,i===0,routeChoice);p={...next,path:[...p.path,history]};trace.push(yutPhysical(p));if(p.node==='FINISH')break;}
  return {piece:p,trace,legal:true};
}
function throwYut(){
  const sticks=[0,0,0,0].map(()=>crypto.randomInt(2));const backs=sticks.filter(x=>x===0).length;
  if(backs===1&&sticks[0]===0)return {move:-1,name:'빽도',extra:false,sticks,backdo:true};
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
  r.yut={phase:'playing',turnIndex:0,sides:yutMakeSides(r),pending:[],awaitingThrow:true,captureBonus:0,last:null,winnerSideId:null,startedAt:now(),ruleSet:'club-standard-v09-home-exit-finish'};
}
function yutThrow(r,userId){
  const y=r.yut;if(!y||y.phase!=='playing')throw new Error('게임이 진행 중이 아닙니다.');
  const cur=yutCurrentPlayer(r,y);if(!cur||cur.userId!==userId)throw new Error('지금은 당신 차례가 아닙니다.');
  if(!y.awaitingThrow)throw new Error('먼저 나온 윷 결과로 말을 이동하세요.');
  const result=throwYut(),side=yutSideForUser(y,userId);
  if(result.backdo&&!y.pending.length&&!side.pieces.some(p=>!['READY','FINISH'].includes(yutPhysical(p)))){
    y.awaitingThrow=true;y.turnIndex=(y.turnIndex+1)%orderedPlayers(r).length;
    y.last={type:'throw',userId,sideId:side?.id,name:result.name,move:result.move,sticks:result.sticks,backdo:true,skipped:true,message:'빽도! 이동할 말이 없어 이번 차례는 쉬어갑니다.',at:now()};return result;
  }
  y.pending.push(result);y.awaitingThrow=!!result.extra;
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
function yutMove(r,userId,pieceIndex,moveIndex=0,routeChoice='shortcut'){
  const y=r.yut;if(!y||y.phase!=='playing'||!y.pending.length)throw new Error('던지기부터 하세요.');
  if(y.awaitingThrow)throw new Error('윷/모 보너스 던지기를 먼저 진행하세요.');
  const cur=yutCurrentPlayer(r,y);if(!cur||cur.userId!==userId)throw new Error('당신 차례가 아닙니다.');
  const side=yutSideForUser(y,userId);if(!side)throw new Error('말을 찾을 수 없습니다.');
  pieceIndex=clampInt(pieceIndex,0,3);moveIndex=clampInt(moveIndex,0,y.pending.length-1);
  const selected=side.pieces[pieceIndex];if(yutFinished(selected))throw new Error('이미 완주한 말입니다.');
  const moveResult=y.pending[moveIndex],fromPhysical=yutPhysical(selected);
  if(moveResult.move<0&&['READY','FINISH'].includes(fromPhysical))throw new Error('빽도는 판 위에 있는 말을 선택해야 합니다.');
  const stackIndexes=fromPhysical==='READY'? [pieceIndex] : side.pieces.map((p,i)=>yutPhysical(p)===fromPhysical&&!yutFinished(p)?i:-1).filter(i=>i>=0);
  const advanced=yutAdvance(selected,moveResult.move,routeChoice);if(!advanced.legal)throw new Error('이 말은 뒤로 이동할 수 없습니다.');const dest=advanced.piece,destPhysical=yutPhysical(dest);
  stackIndexes.forEach(i=>side.pieces[i]=yutClonePiece(dest));
  // If the moving stack lands on friendly pieces, all pieces become one stack and inherit the incoming route.
  if(destPhysical!=='READY'&&destPhysical!=='FINISH') side.pieces.forEach((p,i)=>{if(yutPhysical(p)===destPhysical)side.pieces[i]=yutClonePiece(dest);});
  const captured=[];
  if(destPhysical!=='READY'&&destPhysical!=='FINISH'){
    for(const other of y.sides){
      if(other.id===side.id)continue;
      other.pieces.forEach((p,i)=>{if(yutPhysical(p)===destPhysical){captured.push({sideId:other.id,pieceIndex:i});other.pieces[i]=yutNewPiece();}});
    }
  }
  y.pending.splice(moveIndex,1);
  if(captured.length)y.captureBonus++;
  const stacked=destPhysical!=='READY'&&destPhysical!=='FINISH'?side.pieces.filter(p=>yutPhysical(p)===destPhysical).length:stackIndexes.length;
  const message=captured.length?`상대 말 ${captured.length}개를 잡았다! 한 번 더!`:stacked>stackIndexes.length?`우리 말 ${stacked}개가 업혔다! 함께 이동!`:moveResult.backdo?'빽도! 한 칸 뒤로 이동!':`${moveResult.name} · ${Math.abs(moveResult.move)}칸 이동`;
  y.last={type:'move',userId,sideId:side.id,name:moveResult.name,move:moveResult.move,sticks:moveResult.sticks,backdo:!!moveResult.backdo,from:fromPhysical,to:destPhysical,trace:advanced.trace,captured,stacked,message,at:now()};
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
    const boardCount=h.board.length,status=pokerHandStatus([...(hp.hole||[]),...(h.board||[])]),strength=Math.max(0,Number(status.rankLevel||0));
    const aggression=Math.min(.72,(boardCount>=3?.24:.14)+strength*.09);
    if(toCall===0){
      if(rp.stack>r.bigBlind*4 && Math.random()<aggression){action='raise';const size=strength>=3?Math.max(h.minRaise,Math.floor(Math.max(r.bigBlind*2,pokerPot(h)*.65)/r.bigBlind)*r.bigBlind):Math.max(h.minRaise,r.bigBlind*2);raiseTo=Math.min(hp.roundBet+rp.stack,h.currentBet+size);}
    }else{
      const pressure=toCall/Math.max(1,rp.stack+toCall),potPressure=toCall/Math.max(1,pokerPot(h));
      const foldChance=Math.max(.04,Math.min(.9,.14+pressure*.75+potPressure*.35-strength*.17));
      if(Math.random()<foldChance) action='fold';
      else if(strength>=2&&rp.stack>toCall+r.bigBlind*4&&Math.random()<.22+strength*.06){action='raise';raiseTo=Math.min(hp.roundBet+rp.stack,h.currentBet+Math.max(h.minRaise,Math.floor(Math.max(r.bigBlind*2,pokerPot(h)*.55)/r.bigBlind)*r.bigBlind));}
      else action='call';
    }
    try{pokerAction(r,botId,action,raiseTo)}catch{try{pokerAction(r,botId,toCall?'call':'check',0)}catch{break}}
  }
}
function soloPokerStart(user){
  const buyIn=Math.floor(Number(user.balance||0));
  if(soloHoldem.has(user.id))throw new Error('이미 AI 홀덤 테이블이 열려 있습니다.');
  if(!Number.isSafeInteger(buyIn)||buyIn<1000)throw new Error('홀덤 테이블 입장에는 최소 1,000G가 필요합니다.');
  walletChange(user.id,-buyIn,'solo_holdem_buyin',`AI 홀덤 전액 스택 입장 ${formatMoney(buyIn)}G`);
  const botId=soloPokerBotId(user.id),smallBlind=Math.max(1000,Math.min(50000,Math.floor((buyIn*.002)/1000)*1000||1000)),bigBlind=smallBlind*2;
  const r={id:`SOLOH${user.id}`,solo:true,name:'J-BOT HEADS UP',game:'holdem',buyIn,maxPlayers:2,hostId:user.id,smallBlind,bigBlind,players:[
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
  const s={bet,phase:'playing',turn:'user',sides:{user:Array.from({length:4},yutNewPiece),bot:Array.from({length:4},yutNewPiece)},pending:[],awaitingThrow:true,captureBonus:0,last:null,replay:[],winner:null,startedAt:now()};
  soloYut.set(user.id,s);escrowSet(`SOLOY${user.id}`,user.id,bet,'solo_yut');return s;
}
function soloYutPhysicalPieces(s,side,physical){return s.sides[side].map((p,i)=>yutPhysical(p)===physical?i:-1).filter(i=>i>=0);}
function soloYutMoveSide(s,side,pieceIndex,moveIndex=0,routeChoice='shortcut'){
  if(!s.pending.length)throw new Error('먼저 윷을 던져야 합니다.');if(s.awaitingThrow)throw new Error('윷/모 보너스 던지기를 먼저 진행하세요.');
  pieceIndex=clampInt(pieceIndex,0,3);moveIndex=clampInt(moveIndex,0,s.pending.length-1);const piece=s.sides[side][pieceIndex];if(yutFinished(piece))throw new Error('이미 완주한 말입니다.');
  const moveResult=s.pending[moveIndex],from=yutPhysical(piece);if(moveResult.move<0&&['READY','FINISH'].includes(from))throw new Error('빽도는 판 위에 있는 말을 선택해야 합니다.');const stack=from==='READY'?[pieceIndex]:soloYutPhysicalPieces(s,side,from),adv=yutAdvance(piece,moveResult.move,routeChoice);if(!adv.legal)throw new Error('이 말은 뒤로 이동할 수 없습니다.');const dest=adv.piece,to=yutPhysical(dest);
  stack.forEach(i=>s.sides[side][i]=yutClonePiece(dest));
  if(to!=='READY'&&to!=='FINISH')s.sides[side].forEach((p,i)=>{if(yutPhysical(p)===to)s.sides[side][i]=yutClonePiece(dest)});
  const other=side==='user'?'bot':'user',captured=[];
  if(to!=='READY'&&to!=='FINISH')s.sides[other].forEach((p,i)=>{if(yutPhysical(p)===to){s.sides[other][i]=yutNewPiece();captured.push(i)}});
  s.pending.splice(moveIndex,1);if(captured.length)s.captureBonus++;
  const stacked=to!=='READY'&&to!=='FINISH'?soloYutPhysicalPieces(s,side,to).length:stack.length;
  const message=captured.length?`상대 말을 잡았다! 한 번 더!`:stacked>stack.length?`우리 말 ${stacked}개가 업혔다!`:moveResult.backdo?'빽도! 한 칸 뒤로 이동!':`${moveResult.name} · ${Math.abs(moveResult.move)}칸 이동`;
  s.last={type:'move',side,name:moveResult.name,move:moveResult.move,sticks:moveResult.sticks,backdo:!!moveResult.backdo,from,to,trace:adv.trace,captured,stacked,message,at:now()};if(side==='bot')s.replay.push({...s.last});
  if(s.sides[side].every(yutFinished)){s.phase='complete';s.winner=side;s.pending=[];s.awaitingThrow=false;return;}
  if(s.pending.length){s.awaitingThrow=false;return;}
  if(s.captureBonus>0){s.captureBonus--;s.awaitingThrow=true;return;}
  s.turn=other;s.awaitingThrow=true;
}
function soloYutThrowFor(s,side){
  if(!s.awaitingThrow)throw new Error('먼저 말을 이동하세요.');const r=throwYut();
  if(r.backdo&&!s.pending.length&&!s.sides[side].some(p=>!['READY','FINISH'].includes(yutPhysical(p)))){s.turn=side==='user'?'bot':'user';s.awaitingThrow=true;s.last={type:'throw',side,...r,skipped:true,message:'빽도! 이동할 말이 없어 차례를 넘깁니다.',at:now()};if(side==='bot')s.replay.push({...s.last});return r;}
  s.pending.push(r);s.awaitingThrow=!!r.extra;s.last={type:'throw',side,...r,message:r.backdo?'빽도! 한 칸 뒤로!':`${r.name} · ${r.move}칸`,at:now()};if(side==='bot')s.replay.push({...s.last});return r;
}
function soloYutBestMove(s,side){
  const other=side==='user'?'bot':'user';let best={pieceIndex:0,moveIndex:0,score:-1e9};
  s.pending.forEach((mv,mi)=>s.sides[side].forEach((p,pi)=>{
    if(yutFinished(p)||(mv.move<0&&yutPhysical(p)==='READY'))return;const adv=yutAdvance(p,mv.move);if(!adv.legal)return;const to=yutPhysical(adv.piece);let score=adv.trace.length*2;
    if(to==='FINISH')score+=80;
    if(['O5','O10'].includes(to))score+=22;
    if(['A1','A2','CA','A4','A5','B1','B2','CB','B4','B5'].includes(adv.piece.node))score+=12;
    const enemy=s.sides[other].filter(op=>yutPhysical(op)===to).length;if(enemy)score+=55+enemy*8;
    const friendly=s.sides[side].filter((op,i)=>i!==pi&&yutPhysical(op)===to&&to!=='READY').length;if(friendly)score+=20+friendly*5;
    // approximate progress preference
    const prog={'READY':-1,'START':29,'O1':1,'O2':2,'O3':3,'O4':4,'O5':5,'A1':7,'A2':9,'CA':11,'A4':13,'A5':15,'O6':6,'O7':7,'O8':8,'O9':9,'O10':10,'B1':12,'B2':14,'CB':16,'B4':18,'B5':20,'O11':11,'O12':12,'O13':13,'O14':14,'O15':15,'O16':16,'O17':17,'O18':18,'O19':19,'O20':20,'FINISH':30}[adv.piece.node]||0;score+=prog;
    if(score>best.score)best={pieceIndex:pi,moveIndex:mi,score};
  }));return best;
}
function soloYutBotDrive(userId){
  const s=soloYut.get(userId);let guard=0;if(s)s.replay=[];
  while(s&&s.phase==='playing'&&s.turn==='bot'&&guard++<30){
    while(s.awaitingThrow&&guard++<30){const r=soloYutThrowFor(s,'bot');if(!r.extra)break;}
    if(s.phase!=='playing'||s.turn!=='bot')break;
    if(!s.pending.length){s.awaitingThrow=true;continue;}
    const b=soloYutBestMove(s,'bot');soloYutMoveSide(s,'bot',b.pieceIndex,b.moveIndex);
  }
  return s;
}
function settleSoloYut(userId){const s=soloYut.get(userId);if(!s||s.phase!=='complete'||s.settled)return;s.settled=true;escrowDelete(`SOLOY${userId}`,userId);db.prepare('UPDATE stats SET yut_games=yut_games+1, yut_wins=yut_wins+?, solo_yut_wins=solo_yut_wins+? WHERE user_id=?').run(s.winner==='user'?1:0,s.winner==='user'?1:0,userId);if(s.winner==='user')walletChange(userId,s.bet*2,'solo_yut_win','AI 윷놀이 승리 상금');}

// ---------- JUNJA GRAND RACE v2.2 · shared live meet ----------
const HORSES=[
  {id:1,name:'우니',speed:91,stamina:86,finish:89,color:'#f4cc62',coat:'#5a321f'},
  {id:2,name:'도도',speed:87,stamina:94,finish:84,color:'#55a8ff',coat:'#41291f'},
  {id:3,name:'아라',speed:94,stamina:80,finish:92,color:'#ff667b',coat:'#713b26'},
  {id:4,name:'돼지',speed:83,stamina:97,finish:86,color:'#ef9d5b',coat:'#39251d'},
  {id:5,name:'햅피',speed:90,stamina:88,finish:94,color:'#a985ff',coat:'#6a3c24'},
  {id:6,name:'신동',speed:86,stamina:91,finish:90,color:'#d9e1ed',coat:'#4b3024'},
  {id:7,name:'준자',speed:95,stamina:85,finish:96,color:'#5ae0ad',coat:'#2e211b'}
];
// Racing odds are displayed and settled as whole-number multipliers.
function oddsRound(n,min,max){return Math.floor(Math.max(min,Math.min(max,n)));}
function horseCard(){
  // Shuffle the draw order every meet so a horse is not tied to one lane.
  const laneDraw=[...HORSES];
  for(let i=laneDraw.length-1;i>0;i--){const j=crypto.randomInt(i+1);[laneDraw[i],laneDraw[j]]=[laneDraw[j],laneDraw[i]];}
  const entries=laneDraw.map((h,laneIndex)=>{
    const power=h.speed*.44+h.stamina*.24+h.finish*.32;
    const form=crypto.randomInt(84,117)/100;
    const raw=Math.pow((power*form)/100,4.7);
    return {...h,lane:laneIndex+1,power:Number(power.toFixed(2)),form:Number(form.toFixed(2)),raw};
  });
  const total=entries.reduce((a,h)=>a+h.raw,0)||1;
  const horses=entries.map(h=>{
    const probability=h.raw/total;
    return {...h,probability,winOdds:oddsRound(.91/probability,1.8,28)};
  });
  const quinellaOdds={},exactaOdds={};
  for(const a of horses)for(const b of horses){
    if(a.id===b.id)continue;
    const pa=a.probability,pb=b.probability;
    const pAB=pa*(pb/Math.max(.0001,1-pa));
    const pBA=pb*(pa/Math.max(.0001,1-pb));
    exactaOdds[`${a.id}>${b.id}`]=oddsRound(1.16/Math.max(.0001,pAB),10,420);
    if(a.id<b.id)quinellaOdds[`${a.id}-${b.id}`]=oddsRound(1.06/Math.max(.0001,pAB+pBA),6,240);
  }
  return {id:randomToken(6),horses,quinellaOdds,exactaOdds,createdAt:now()};
}
function horseRun(card){
  return card.horses.map(h=>{
    const u=(crypto.randomInt(1,1000000000))/1000000000;
    const key=-Math.log(u)/Math.max(.000001,h.probability);
    return {...h,raceKey:key};
  }).sort((a,b)=>a.raceKey-b.raceKey);
}
function raceMultiplier(type,picks,card){
  const ids=(picks||[]).map(Number);const by=id=>card.horses.find(h=>h.id===id);
  if(type==='win'){const h=by(ids[0]);return h?h.winOdds:0;}
  const a=by(ids[0]),b=by(ids[1]);if(!a||!b||a.id===b.id)return 0;
  if(type==='quinella'){const k=[a.id,b.id].sort((x,y)=>x-y).join('-');return Number(card.quinellaOdds?.[k]||0);}
  if(type==='exacta')return Number(card.exactaOdds?.[`${a.id}>${b.id}`]||0);
  return 0;
}
function settleRace(userId,bet,type,picks,card,order){
  let won=false,placeBonus=false,finishRank=null;
  if(type==='win'){
    const picked=Number(picks[0]);finishRank=order.findIndex(h=>h.id===picked)+1;won=finishRank===1;placeBonus=finishRank===2;
  } else if(type==='quinella'){
    const top=[order[0].id,order[1].id].sort((a,b)=>a-b).join(',');won=top===[Number(picks[0]),Number(picks[1])].sort((a,b)=>a-b).join(',');
  } else if(type==='exacta')won=order[0].id===Number(picks[0])&&order[1].id===Number(picks[1]);
  const winMult=raceMultiplier(type,picks,card),mult=won?winMult:(placeBonus?.5:0),basePayout=won?Math.floor(bet*winMult):(placeBonus?Math.floor(bet*.5):0),rankBonusPct=won?Number(socialRankPerksForUser(userId).horseWinBonusPct||0):0,rankBonus=won?Math.floor(Math.max(0,basePayout-bet)*rankBonusPct/100):0,payout=basePayout+rankBonus;
  if(payout>0)walletChange(userId,payout,won?'horse_win':'horse_place_bonus',won?`경마 ${type} 적중 x${winMult}${rankBonus?` · 신분 순이익 보너스 +${rankBonusPct}%`:''}`:'경마 단승 2위 위로금 x0.5');
  db.prepare('UPDATE stats SET horse_races=horse_races+1, horse_wins=horse_wins+?, horse_profit=horse_profit+? WHERE user_id=?').run(won?1:0,payout-bet,userId);
  return {won,placeBonus,finishRank,mult,payout,basePayout,rankBonus,rankBonusPct,winMult};
}
let horseMeet=null;
const HORSE_RUN_MS=6500,HORSE_RESULT_MS=5000;
function newHorseMeet(){
  const t=now();horseMeet={id:randomToken(5).toUpperCase(),card:horseCard(),phase:'betting',openedAt:t,startedAt:null,finishAt:null,resultUntil:null,order:null,bets:new Map(),ready:new Set(),results:new Map()};return horseMeet;
}
function horseStartIfReady(r){
  if(r.phase!=='betting'||r.bets.size<1)return r;
  for(const uid of r.bets.keys())if(!r.ready.has(uid))return r;
  const t=now();r.order=horseRun(r.card);r.phase='running';r.startedAt=t;r.finishAt=t+HORSE_RUN_MS;
  for(const [uid,b] of r.bets){
    try{const result=settleRace(uid,b.bet,b.type,b.picks,r.card,r.order);r.results.set(uid,result);}catch(e){console.error('[HORSE] settle failed',uid,e.message);}
    escrowDelete(`HORSE_${r.id}`,uid);
  }
  return r;
}
function horseAdvanceMeet(){
  let r=horseMeet||newHorseMeet(),t=now();horseStartIfReady(r);
  if(r.phase==='running'&&t>=r.finishAt){r.phase='result';r.resultUntil=t+HORSE_RESULT_MS;}
  if(r.phase==='result'&&t>=r.resultUntil){r=newHorseMeet();}
  return r;
}
function horseMeetPublic(userId){
  const r=horseAdvanceMeet(),uid=Number(userId),myBet=r.bets.get(uid)||null,myResult=r.results.get(uid)||null;
  const participants=[...r.bets.entries()].map(([id,b])=>{const u=userPublic(id);return u?{userId:id,nickname:u.nickname,avatar:u.avatar,cosmetics:u.cosmetics,type:b.type,picks:b.picks,bet:b.bet,ready:r.ready.has(id)}:null}).filter(Boolean);
  return {round:{id:r.id,phase:r.phase,openedAt:r.openedAt,startedAt:r.startedAt,finishAt:r.finishAt,resultUntil:r.resultUntil,card:r.card,order:r.order?r.order.map((h,i)=>({id:h.id,name:h.name,color:h.color,coat:h.coat,finish:i+1})):null,participants,myBet,myReady:r.ready.has(uid),myResult,serverNow:now()}};
}
function horsePlaceBet(user,body){
  const r=horseAdvanceMeet();if(r.phase!=='betting')throw new Error('현재 경주는 접수가 마감됐어. 다음 경주를 기다려줘.');
  if(r.bets.has(user.id))throw new Error('이번 경주에는 이미 베팅했어.');
  const type=['win','quinella','exacta'].includes(body.type)?body.type:'win';const picks=(Array.isArray(body.picks)?body.picks:[]).map(Number);const need=type==='win'?1:2;
  if(picks.length!==need||picks.some(x=>!r.card.horses.some(h=>h.id===x))||(need===2&&picks[0]===picks[1]))throw new Error('선택한 말을 확인해줘.');
  const bet=gameWager(body.bet,1000,10000000,1000);if(user.balance<bet)throw new Error('게임머니가 부족합니다.');
  const mult=raceMultiplier(type,picks,r.card);if(!mult)throw new Error('배당 정보를 확인할 수 없어.');
  walletChange(user.id,-bet,'horse_bet',`경마 ${type} ${picks.join('/')} · x${mult} · ${formatMoney(bet)}G`);
  r.bets.set(user.id,{userId:user.id,type,picks,bet,mult,placedAt:now()});escrowSet(`HORSE_${r.id}`,user.id,bet,'horse');return horseMeetPublic(user.id);
}
function horseReady(user){
  const r=horseAdvanceMeet();if(r.phase!=='betting')throw new Error('이미 경주가 시작됐어.');
  if(!r.bets.has(user.id))throw new Error('먼저 베팅을 접수해줘.');
  r.ready.add(user.id);horseStartIfReady(r);return horseMeetPublic(user.id);
}
// ---------- European Roulette · v2.3 ----------
const ROULETTE_WHEEL=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const ROULETTE_RED=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function rouletteColor(n){return n===0?'green':ROULETTE_RED.has(n)?'red':'black';}
function rouletteRows(row){row=Number(row);if(row<1||row>12)return[];return [row*3-2,row*3-1,row*3];}
function rouletteValidateBet(b){
  const kind=String(b?.kind||''),amount=Math.floor(Number(b?.amount||0));if(!Number.isSafeInteger(amount)||amount<1000)throw new Error('룰렛 칩은 최소 1,000G부터 걸 수 있습니다.');const target=b?.target;
  if(kind==='straight'){const n=Number(target);if(!Number.isInteger(n)||n<0||n>36)throw new Error('잘못된 숫자 베팅입니다.');return {kind,target:n,amount,mult:36,label:String(n)};}
  if(kind==='split'){const a=(Array.isArray(target)?target:[]).map(Number).sort((x,y)=>x-y);if(a.length!==2||a[0]===a[1]||a.some(n=>n<0||n>36))throw new Error('스플릿 숫자를 확인해주세요.');const valid=(a[0]===0&&[1,2,3].includes(a[1]))||(a[0]>0&&((Math.abs(a[0]-a[1])===3)||(a[1]-a[0]===1&&Math.floor((a[0]-1)/3)===Math.floor((a[1]-1)/3))));if(!valid)throw new Error('서로 붙어 있는 두 숫자만 SPLIT 가능해.');return {kind,target:a,amount,mult:18,label:a.join('/')};}
  if(kind==='street'){const row=Number(target);if(!rouletteRows(row).length)throw new Error('STREET를 확인해줘.');return {kind,target:row,amount,mult:12,label:rouletteRows(row).join('-')};}
  if(kind==='corner'){const a=(Array.isArray(target)?target:[]).map(Number).sort((x,y)=>x-y);if(a.length!==4||a.some(n=>n<1||n>36))throw new Error('CORNER 숫자를 확인해줘.');const r1=Math.floor((a[0]-1)/3)+1,r2=r1+1,c1=((a[0]-1)%3)+1,expect=[(r1-1)*3+c1,(r1-1)*3+c1+1,(r2-1)*3+c1,(r2-1)*3+c1+1].sort((x,y)=>x-y);if(c1>=3||a.join(',')!==expect.join(','))throw new Error('맞닿은 4개 숫자만 CORNER 가능해.');return {kind,target:a,amount,mult:9,label:a.join('/')};}
  if(kind==='sixline'){const row=Number(target);if(row<1||row>11)throw new Error('SIX LINE을 확인해줘.');const nums=[...rouletteRows(row),...rouletteRows(row+1)];return {kind,target:row,amount,mult:6,label:nums.join('-')};}
  if(kind==='dozen'){const n=Number(target);if(![1,2,3].includes(n))throw new Error('DOZEN을 확인해줘.');return {kind,target:n,amount,mult:3,label:`${(n-1)*12+1}-${n*12}`};}
  if(kind==='column'){const n=Number(target);if(![1,2,3].includes(n))throw new Error('COLUMN을 확인해줘.');return {kind,target:n,amount,mult:3,label:`COLUMN ${n}`};}
  if(['red','black','odd','even','low','high'].includes(kind))return {kind,target:null,amount,mult:2,label:kind.toUpperCase()};throw new Error('지원하지 않는 룰렛 베팅입니다.');
}
let rouletteEventArmed=false;
function rouletteBetWins(b,n){if(b.kind==='straight')return n===b.target;if(b.kind==='split'||b.kind==='corner')return b.target.includes(n);if(b.kind==='street')return rouletteRows(b.target).includes(n);if(b.kind==='sixline')return [...rouletteRows(b.target),...rouletteRows(b.target+1)].includes(n);if(b.kind==='dozen')return n>=1+(b.target-1)*12&&n<=b.target*12;if(b.kind==='column')return n>0&&((n-1)%3)+1===b.target;if(b.kind==='red')return rouletteColor(n)==='red';if(b.kind==='black')return rouletteColor(n)==='black';if(b.kind==='odd')return n>0&&n%2===1;if(b.kind==='even')return n>0&&n%2===0;if(b.kind==='low')return n>=1&&n<=18;if(b.kind==='high')return n>=19&&n<=36;return false;}
function rouletteSpin(user,rawBets){if(!Array.isArray(rawBets)||!rawBets.length)throw new Error('룰렛 베팅을 하나 이상 올려줘.');if(rawBets.length>30)throw new Error('한 라운드에는 최대 30개 베팅까지 가능해.');const bets=rawBets.map(rouletteValidateBet),totalBet=bets.reduce((a,b)=>a+b.amount,0);if(totalBet>user.balance)throw new Error('전체 베팅금이 보유 게임머니보다 많아.');walletChange(user.id,-totalBet,'roulette_bet',`유럽식 룰렛 ${bets.length}개 베팅 · ${formatMoney(totalBet)}G`);const ROULETTE_EVENT_RATE=.10;const eventHit=rouletteEventArmed&&crypto.randomInt(10000)<Math.floor(ROULETTE_EVENT_RATE*10000);const winningNumbers=[];for(let n=0;n<=36;n++){if(bets.some(b=>rouletteBetWins(b,n)))winningNumbers.push(n);}const eventWinner=eventHit&&winningNumbers.length>0;const number=eventWinner?winningNumbers[crypto.randomInt(winningNumbers.length)]:crypto.randomInt(37),color=rouletteColor(number);if(eventWinner)rouletteEventArmed=false;let payout=0;const settled=bets.map(b=>{const won=rouletteBetWins(b,number),returned=won?b.amount*b.mult:0;payout+=returned;return {...b,won,returned};});if(payout>0)walletChange(user.id,payout,'roulette_win',`룰렛 ${number} ${color.toUpperCase()} · 지급 ${formatMoney(payout)}G`);const profit=payout-totalBet;db.prepare('UPDATE stats SET roulette_plays=roulette_plays+1,roulette_wins=roulette_wins+?,roulette_profit=roulette_profit+? WHERE user_id=?').run(payout>0?1:0,profit,user.id);pushRefresh();return {number,color,index:ROULETTE_WHEEL.indexOf(number),bets:settled,totalBet,payout,profit};}

// ---------- Big Wheel & Sic Bo v1.3 ----------
const BIG_WHEEL_DEFS = {
  x2:{key:'x2',label:'×2',mult:2},
  x3:{key:'x3',label:'×3',mult:3},
  x5:{key:'x5',label:'×5',mult:5},
  x10:{key:'x10',label:'×10',mult:10},
  x15:{key:'x15',label:'×15',mult:15},
  junja:{key:'junja',label:'JUNJA',mult:100}
};
const BIG_WHEEL_KEYS=['junja','x2','x3','x2','x3','x2','x3','x2','x3','x2','x3','x2','x3','x2','x5','x2','x3','x2','x5','x2','x3','x2','x5','x2','x3','x2','x5','x2','x3','x2','x5','x2','x3','x2','x5','x2','x3','x2','junja','x2','x5','x2','x3','x2','x5','x2','x3','x2','x10','x2','x5','x2','x3','x2','x15','x2','x10','x5','x3','x2','x15','x10','x5','x3','x2','x15','x10','x5','x3','x2','x15','x10','x5','x3','x2','x15','x10'];
const BIG_WHEEL_SEGMENTS=BIG_WHEEL_KEYS.map(key=>BIG_WHEEL_DEFS[key]);
const BIG_WHEEL_BETS = [...new Map(BIG_WHEEL_SEGMENTS.map(x=>[x.key,x])).values()];
function bigWheelSpin(userId,bet,key,useRankFree=false){
  bet=gameWager(bet,1000,10000000,1000);if(bet>10000000)throw new Error('빅휠 최대 베팅은 10,000,000G입니다.');
  const u=userPublic(userId);if(!u)throw new Error('사용자를 찾을 수 없습니다.');
  const target=BIG_WHEEL_BETS.find(x=>x.key===key);if(!target)throw new Error('배당 선택을 확인해주세요.');
  const freePlay=consumeRankFreePlay(userId,'wheel',!!useRankFree);if(freePlay.free)bet=Number(socialRankPerksForUser(userId).freeSlotBet||10000000);if(!freePlay.free&&u.balance<bet)throw new Error('게임머니가 부족합니다.');if(!freePlay.free)walletChange(userId,-bet,'bigwheel_bet',`빅휠 ${target.label} 베팅 ${formatMoney(bet)}G`);
  const index=crypto.randomInt(BIG_WHEEL_SEGMENTS.length),landed=BIG_WHEEL_SEGMENTS[index],won=landed.key===target.key,payout=won?bet*target.mult:0;
  if(payout)walletChange(userId,payout,'bigwheel_win',`빅휠 ${target.label} 적중 x${target.mult}`);
  db.prepare('UPDATE stats SET bigwheel_plays=bigwheel_plays+1, bigwheel_wins=bigwheel_wins+?, bigwheel_profit=bigwheel_profit+? WHERE user_id=?').run(won?1:0,payout-(freePlay.free?0:bet),userId);
  return {index,landed,target,won,payout,profit:payout-(freePlay.free?0:bet),segments:BIG_WHEEL_SEGMENTS.length,rankFreePlay:freePlay};
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
function seotdaBestPair(cards){
  let best=null,bestCards=null,discard=null;
  for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){
    const pair=[cards[i],cards[j]],rk=seotdaRank(pair);if(!best||rk[0]>best[0]){best=rk;bestCards=pair;discard=cards.find((_,k)=>k!==i&&k!==j)||null;}
  }
  return {rank:best,cards:bestCards,discard};
}
function soloSeotdaPublic(s){
  if(!s)return null;const done=s.phase==='complete';
  return {...s,deck:undefined,botCards:done?s.botCards:s.botCards.map(c=>s.botDiscard?.id===c.id?c:{id:'XX'}),botBest:done?s.botBest:null};
}
function soloSeotdaStart(user,bet){
  bet=walletWager(bet,user.balance,5000,1000);const old=soloSeotda.get(user.id);if(old&&old.phase!=='complete')throw new Error('이미 섯다 판이 진행 중입니다.');if(old)soloSeotda.delete(user.id);
  walletChange(user.id,-bet,'seotda_bet',`AI 섯다 판돈 ${formatMoney(bet)}G`);escrowSet(`SEOTDA${user.id}`,user.id,bet,'seotda');const d=seotdaDeck();
  const s={bet,stake:bet,phase:'draw',deck:d,userCards:[d.pop(),d.pop()],botCards:[d.pop(),d.pop()],userDiscard:null,botDiscard:null,userBest:null,botBest:null,revealed:false,result:null};soloSeotda.set(user.id,s);return s;
}
function soloSeotdaDraw(userId){
  const s=soloSeotda.get(userId);if(!s||s.phase!=='draw')throw new Error('추가 패를 받을 차례가 아닙니다.');s.userCards.push(s.deck.pop());s.botCards.push(s.deck.pop());const bot=seotdaBestPair(s.botCards);s.botDiscard=bot.discard;s.botBest=bot;s.phase='discard';return s;
}
function soloSeotdaFold(userId){
  const s=soloSeotda.get(userId);if(!s||s.phase==='complete')throw new Error('진행 중인 섯다 판이 없습니다.');escrowDelete(`SEOTDA${userId}`,userId);s.phase='complete';s.revealed=true;s.result={winner:'bot',text:'다이 · J-BOT 승리',payout:0,userRank:null,botRank:s.botBest?.rank?.[1]||seotdaRank(s.botCards.slice(0,2))[1]};db.prepare('UPDATE stats SET seotda_games=seotda_games+1 WHERE user_id=?').run(userId);return s;
}
function soloSeotdaDiscard(userId,cardId,double=false){
  const s=soloSeotda.get(userId);if(!s||s.phase!=='discard')throw new Error('버릴 패를 선택할 차례가 아닙니다.');const card=s.userCards.find(c=>c.id===String(cardId));if(!card)throw new Error('버릴 카드가 올바르지 않습니다.');
  if(double){const u=userPublic(userId);if(u.balance<s.bet)throw new Error('두 배 승부에 필요한 게임머니가 부족합니다.');walletChange(userId,-s.bet,'seotda_double','AI 섯다 3장 승부 추가 베팅');s.stake=s.bet*2;escrowSet(`SEOTDA${userId}`,userId,s.stake,'seotda');}
  s.userDiscard=card;const userPair=s.userCards.filter(c=>c.id!==card.id);const botPair=s.botCards.filter(c=>c.id!==s.botDiscard.id);const ur=seotdaRank(userPair),br=seotdaRank(botPair);s.userBest={cards:userPair,rank:ur};s.botBest={cards:botPair,rank:br,discard:s.botDiscard};
  const cmp=ur[0]-br[0];let payout=0,winner='tie';if(cmp>0){winner='user';payout=s.stake*2;}else if(cmp<0){winner='bot';}else{payout=s.stake;}
  escrowDelete(`SEOTDA${userId}`,userId);if(payout)walletChange(userId,payout,'seotda_win',`AI 3장 섯다 ${winner==='user'?'승리':'무승부'} 정산`);db.prepare('UPDATE stats SET seotda_games=seotda_games+1, seotda_wins=seotda_wins+? WHERE user_id=?').run(winner==='user'?1:0,userId);
  s.phase='complete';s.revealed=true;s.result={winner,payout,userRank:ur[1],botRank:br[1],text:winner==='user'?`${ur[1]} 승리!`:winner==='bot'?`${br[1]}에 패배`:`${ur[1]} 무승부`};return s;
}
function soloSeotdaResolve(userId,action,cardId){const s=soloSeotda.get(userId);if(!s)throw new Error('진행 중인 섯다 판이 없습니다.');if(action==='fold')return soloSeotdaFold(userId);if(s.phase==='draw')return soloSeotdaDraw(userId);if(s.phase==='discard'){const id=cardId||s.userCards[0]?.id;return soloSeotdaDiscard(userId,id,action==='double');}throw new Error('이미 승부가 끝났습니다.');}

function seotdaMultiStart(r){
  if(r.players.length!==2)throw new Error('섯다 멀티는 2명이 필요합니다.');const d=seotdaDeck(),cards={},drawn={},discard={};for(const p of r.players){cards[p.userId]=[d.pop(),d.pop()];drawn[p.userId]=false;discard[p.userId]=null;p.ready=false;}
  r.seotda={phase:'draw',deck:d,cards,drawn,discard,result:null,startedAt:now()};touchRoom(r);return r.seotda;
}
function seotdaMultiDraw(r,userId){const s=r.seotda;if(!s||s.phase!=='draw')throw new Error('지금은 추가 패를 받을 수 없습니다.');if(!roomPlayer(r,userId))throw new Error('참가자가 아닙니다.');if(s.drawn[userId])throw new Error('이미 세 번째 패를 받았습니다.');s.cards[userId].push(s.deck.pop());s.drawn[userId]=true;if(r.players.every(p=>s.drawn[p.userId]))s.phase='discard';touchRoom(r);return s;}
function seotdaMultiDiscard(r,userId,cardId){
  const s=r.seotda;if(!s||s.phase!=='discard')throw new Error('지금은 버릴 패를 선택할 수 없습니다.');if(s.discard[userId])throw new Error('이미 버릴 패를 선택했습니다.');const cards=s.cards[userId]||[],card=cards.find(c=>c.id===String(cardId));if(!card)throw new Error('내 패 중 한 장을 선택해 버려주세요.');s.discard[userId]=card;touchRoom(r);
  if(r.players.every(p=>!!s.discard[p.userId]))seotdaMultiShowdown(r);return s;
}
function seotdaMultiShowdown(r){
  const s=r.seotda;if(!s||s.phase==='complete')return;const [a,b]=r.players,pa=s.cards[a.userId].filter(c=>c.id!==s.discard[a.userId].id),pb=s.cards[b.userId].filter(c=>c.id!==s.discard[b.userId].id),ra=seotdaRank(pa),rb=seotdaRank(pb);const cmp=ra[0]-rb[0];let winnerId=null;if(cmp>0)winnerId=a.userId;else if(cmp<0)winnerId=b.userId;
  const pot=r.buyIn*2;if(winnerId){walletChange(winnerId,pot,'seotda_multi_win',`${r.name} ${winnerId===a.userId?ra[1]:rb[1]} 승리`);}else{walletChange(a.userId,r.buyIn,'seotda_multi_tie',`${r.name} 무승부 환급`);walletChange(b.userId,r.buyIn,'seotda_multi_tie',`${r.name} 무승부 환급`);}
  for(const p of r.players){escrowDelete(r.id,p.userId);db.prepare('UPDATE stats SET seotda_games=seotda_games+1, seotda_wins=seotda_wins+? WHERE user_id=?').run(winnerId===p.userId?1:0,p.userId);}
  s.phase='complete';s.result={winnerId,pot,ranks:{[a.userId]:ra[1],[b.userId]:rb[1]},kept:{[a.userId]:pa,[b.userId]:pb},completedAt:now()};r.players.forEach(p=>p.ready=false);touchRoom(r);pushRefresh(r.id);
}
function seotdaMultiPublic(r,userId){
  const s=r.seotda;if(!s)return null;const out={phase:s.phase,drawn:s.drawn,discard:s.discard,result:s.result,cards:{}};for(const p of r.players){const cards=s.cards[p.userId]||[];out.cards[p.userId]=p.userId===userId||s.phase==='complete'?cards:cards.map(c=>s.discard[p.userId]?.id===c.id?c:{id:'XX'});}return out;
}
function seotdaMultiRematch(r){
  if(r.game!=='seotda'||r.players.length!==2)throw new Error('섯다 재대결은 2명이 필요합니다.');
  if(!r.seotda||r.seotda.phase!=='complete')throw new Error('현재 판이 끝난 뒤 재대결할 수 있습니다.');
  if(!r.players.every(p=>p.ready))throw new Error('두 명 모두 다음 판 READY가 필요합니다.');
  const wallets=r.players.map(p=>({p,u:userPublic(p.userId)}));if(wallets.some(x=>!x.u))throw new Error('참가자 계정을 확인할 수 없습니다.');
  const affordable=Math.floor(Math.min(...wallets.map(x=>Number(x.u.balance||0)))/1000)*1000;if(affordable<5000)throw new Error('한 명의 잔액이 5,000G 미만이라 다음 판을 시작할 수 없습니다.');
  r.stakeAdjustedFrom=null;if(affordable<r.buyIn){r.stakeAdjustedFrom=r.buyIn;r.buyIn=affordable;}
  for(const {p} of wallets){walletChange(p.userId,-r.buyIn,'seotda_rebuy',`${r.name} 연속 재대결 판돈`);escrowSet(r.id,p.userId,r.buyIn,'seotda');}
  return seotdaMultiStart(r);
}

// ---------- Yashimchan Matgo / full 48-card engine ----------
const HWATU_MONTH_NAMES=['송학','매조','벚꽃','흑싸리','난초','모란','홍싸리','공산','국화','단풍','오동','비'];
function hwatuDeck(){
  const bright=new Set(['1:0','3:0','8:0','11:0','12:0']);const animal=new Set(['2:0','4:0','5:0','6:0','7:0','8:1','9:0','10:0']);const ribbon=new Set(['1:1','2:1','3:1','4:1','5:1','6:1','7:1','9:1','10:1']);const d=[];
  const red=new Set(['1:1','2:1','3:1']),blue=new Set(['6:1','9:1','10:1']),grass=new Set(['4:1','5:1','7:1']),birds=new Set(['2:0','4:0','8:1']);
  for(let m=1;m<=12;m++)for(let i=0;i<4;i++){const k=`${m}:${i}`;let type=bright.has(k)?'광':animal.has(k)?'열끗':ribbon.has(k)?'띠':'피';d.push({m,i,type,id:`${m}-${i}`,name:HWATU_MONTH_NAMES[m-1],rainBright:k==='12:0',doublePi:(m===11&&i===3)||(m===12&&i===3),ribbon:red.has(k)?'홍단':blue.has(k)?'청단':grass.has(k)?'초단':null,bird:birds.has(k)});}return shuffle(d);
}
function gostopScore(captured){
  const cards=captured.filter(c=>c&&c.id!=='XX'),brights=cards.filter(c=>c.type==='광'),animals=cards.filter(c=>c.type==='열끗'),ribbons=cards.filter(c=>c.type==='띠');
  const g=brights.length,a=animals.length,r=ribbons.length,p=cards.filter(c=>c.type==='피').reduce((n,c)=>n+(c.doublePi?2:1),0);let score=0;const combos=[];
  if(g===3){const rain=brights.some(c=>c.rainBright);score+=rain?2:3;combos.push(rain?'비삼광':'삼광');}else if(g===4){score+=4;combos.push('사광');}else if(g===5){score+=15;combos.push('오광');}
  if(a>=5)score+=a-4;if(animals.filter(c=>c.bird).length===3){score+=5;combos.push('고도리');}
  if(r>=5)score+=r-4;for(const name of ['홍단','청단','초단'])if(ribbons.filter(c=>c.ribbon===name).length===3){score+=3;combos.push(name);}
  if(p>=10)score+=p-9;return {score,g,a,r,p,combos};
}
function takeOnePi(s,from,to){const pile=s.captured[from];let idx=pile.findIndex(c=>c.type==='피'&&!c.doublePi);if(idx<0)idx=pile.findIndex(c=>c.type==='피');if(idx<0)return false;const [card]=pile.splice(idx,1);s.captured[to].push(card);return true;}
function matgoEvent(s,text,tone='normal'){s.events.unshift({text,tone,at:Date.now()});s.events=s.events.slice(0,7);}
function matgoCapture(s,side,card,choiceId=null){const matches=s.floor.filter(c=>c.m===card.m);if(matches.length===2&&!choiceId)return {choice:matches};let picked=[];if(matches.length===1)picked=matches;else if(matches.length===2)picked=[matches.find(c=>c.id===choiceId)||matches[0]];else if(matches.length>=3)picked=matches;if(!picked.length){s.floor.push(card);return {matched:false};}const ids=new Set(picked.map(c=>c.id));s.floor=s.floor.filter(c=>!ids.has(c.id));s.captured[side].push(card,...picked);return {matched:true,count:picked.length};}
function addMatgoBonusPi(s){const bonus=[{m:0,i:0,type:'피',id:'BONUS-2',name:'보너스 쌍피',doublePi:true,bonusPi:true},{m:0,i:1,type:'피',id:'BONUS-1',name:'보너스 피',doublePi:false,bonusPi:true}];for(const card of bonus){const at=Math.max(0,Math.min(s.deck.length,crypto.randomInt(s.deck.length+1)));s.deck.splice(at,0,card);}}
function takeBonusPi(s,side,card){s.captured[side].push(card);takeOnePi(s,side==='user'?'bot':'user',side);matgoEvent(s,`${card.doublePi?'보너스 쌍피':'보너스 피'}! 상대 피 1장 획득`,'gold');}
function matgoBomb(s,side,month){month=Number(month);const hand=s.hands[side].filter(c=>Number(c.m)===month),floor=s.floor.filter(c=>Number(c.m)===month);if(hand.length<3||floor.length!==1)throw new Error('폭탄 조건이 아닙니다.');const ids=new Set(hand.slice(0,3).map(c=>c.id));s.hands[side]=s.hands[side].filter(c=>!ids.has(c.id));s.floor=s.floor.filter(c=>Number(c.m)!==month);s.captured[side].push(...hand.slice(0,3),...floor);s.shakes[side]++;takeOnePi(s,side==='user'?'bot':'user',side);for(let i=0;i<2&&s.deck.length;i++){const bonus=s.deck.pop();if(bonus.bonusPi)takeBonusPi(s,side,bonus);else s.hands[side].push(bonus);}matgoEvent(s,`💣 ${month}월 폭탄! 상대 피 1장 획득 · 더미패 2장 보충 · 2배`,'red');gostopDrawAndCapture(s,side,{playedMonth:month,playMatched:true});}
function matgoShake(s,side,month){month=Number(month);const hand=s.hands[side].filter(c=>Number(c.m)===month);if(hand.length<3)throw new Error('흔들기 조건이 아닙니다.');if((s.shakenMonths?.[side]||[]).includes(month))throw new Error('이미 흔든 패입니다.');s.shakenMonths[side].push(month);s.shakes[side]++;matgoEvent(s,`🔥 ${month}월 흔들기! 승리 시 2배`,'gold');}
function matgoSweep(s,side){if(s.floor.length===0&&takeOnePi(s,side==='user'?'bot':'user',side))matgoEvent(s,'싹쓸이! 상대 피 1장 획득','gold');}
function gostopDrawAndCapture(s,side,context={}){const card=s.deck.pop();if(!card)return {done:true};s.lastDraw=card;if(card.bonusPi){takeBonusPi(s,side,card);return gostopDrawAndCapture(s,side,context);}const matches=s.floor.filter(c=>c.m===card.m);let result;if(matches.length===2){const best=[...matches].sort((a,b)=>({광:4,'열끗':3,'띠':2,'피':1}[b.type]-({광:4,'열끗':3,'띠':2,'피':1}[a.type])))[0];result=matgoCapture(s,side,card,best.id);}else result=matgoCapture(s,side,card);if(context.playedMonth===card.m&&context.playMatched===false&&result.matched){if(takeOnePi(s,side==='user'?'bot':'user',side))matgoEvent(s,'쪽! 상대 피 1장 획득','red');}if(context.playedMonth===card.m&&context.playMatched&&result.matched){if(takeOnePi(s,side==='user'?'bot':'user',side))matgoEvent(s,'따닥! 상대 피 1장 획득','red');}if(result.count>=3&&takeOnePi(s,side==='user'?'bot':'user',side))matgoEvent(s,'판쓸이! 상대 피 1장 획득','gold');matgoSweep(s,side);return result;}
function gostopCanDecision(s,side){const sc=gostopScore(s.captured[side]).score;return sc>=7&&sc>s.lastDecisionScore[side];}
function matgoMultiplier(s,winner){const loser=winner==='user'?'bot':'user',ws=gostopScore(s.captured[winner]),ls=gostopScore(s.captured[loser]);let mult=1;const reasons=[];if(ws.g>=3&&ls.g===0){mult*=2;reasons.push('광박');}if(ws.p>=10&&ls.p>0&&ls.p<=7){mult*=2;reasons.push('피박');}if(ws.a>=7){mult*=2;reasons.push('멍박');}if(s.goCount[loser]>0){mult*=2;reasons.push('고박');}if(s.shakes[winner]>0){mult*=2**s.shakes[winner];reasons.push(`${s.shakes[winner]}흔들`);}if(s.goCount[winner]>=3){mult*=2**(s.goCount[winner]-2);reasons.push(`${s.goCount[winner]}고`);}return {mult,reasons,ws,ls};}
function gostopFinish(userId,winner,reason){const s=soloGostop.get(userId);if(!s||s.phase==='complete')return;escrowDelete(`GOSTOP${userId}`,userId);s.phase='complete';s.winner=winner;const calc=matgoMultiplier(s,winner);let payout=0;const base=Math.max(1,calc.ws.score+s.goCount[winner]);if(winner==='user'){payout=s.bet*base*calc.mult;walletChange(userId,payout,'gostop_win',`야심찬 맞고 승리 ${base}점 x${calc.mult}`);}db.prepare('UPDATE stats SET gostop_games=gostop_games+1, gostop_wins=gostop_wins+? WHERE user_id=?').run(winner==='user'?1:0,userId);s.result={reason,payout,userScore:calc.ws,botScore:calc.ls,base,multiplier:calc.mult,bonuses:calc.reasons};matgoEvent(s,`${reason} · ${base}점 ×${calc.mult}`,'gold');}
function gostopAfterTurn(userId,side){const s=soloGostop.get(userId);if(gostopCanDecision(s,side)){s.lastDecisionScore[side]=gostopScore(s.captured[side]).score;if(side==='user'){s.needDecision=true;return;}const sc=gostopScore(s.captured.bot).score;if(sc>=9||s.hands.bot.length<=2||Math.random()<.48){gostopFinish(userId,'bot','J-BOT 스톱');return;}s.goCount.bot++;matgoEvent(s,`J-BOT ${s.goCount.bot}고`,'red');}if(!s.hands[side].length&&!s.deck.length){const us=gostopScore(s.captured.user).score,bs=gostopScore(s.captured.bot).score;if(Math.max(us,bs)<7){s.phase='complete';s.winner=null;s.result={reason:'나가리',payout:0,userScore:gostopScore(s.captured.user),botScore:gostopScore(s.captured.bot),base:0,multiplier:2,bonuses:['다음 판 2배']};escrowDelete(`GOSTOP${userId}`,userId);db.prepare('UPDATE stats SET gostop_games=gostop_games+1 WHERE user_id=?').run(userId);return;}gostopFinish(userId,us>=bs?'user':'bot','패 소진');}}
function gostopBotTurn(userId){const s=soloGostop.get(userId);if(!s||s.phase!=='playing')return;let best=0,bestScore=-1;s.hands.bot.forEach((c,i)=>{const matches=s.floor.filter(f=>f.m===c.m).length;const score=matches*30+({광:8,'열끗':5,'띠':3,'피':1}[c.type]||0)+(c.bird||c.ribbon?4:0);if(score>bestScore){bestScore=score;best=i}});const card=s.hands.bot.splice(best,1)[0],matches=s.floor.filter(c=>c.m===card.m);const choice=matches.length===2?[...matches].sort((a,b)=>({광:4,'열끗':3,'띠':2,'피':1}[b.type]-({광:4,'열끗':3,'띠':2,'피':1}[a.type])))[0].id:null;const played=matgoCapture(s,'bot',card,choice);gostopDrawAndCapture(s,'bot',{playedMonth:card.m,playMatched:played.matched});gostopAfterTurn(userId,'bot');if(s.phase==='playing'&&!s.needDecision)s.turn='user';}
function soloGostopStart(user,bet){bet=walletWager(bet,user.balance,5000,1000);if(bet>1000000)throw new Error('고스톱 최대 배팅금액은 1,000,000G입니다.');const old=soloGostop.get(user.id);if(old&&old.phase!=='complete')throw new Error('이미 맞고 판이 진행 중입니다.');const previousWinner=old?.phase==='complete'?old.winner:null;if(old)soloGostop.delete(user.id);walletChange(user.id,-bet,'gostop_bet',`야심찬 맞고 판돈 ${formatMoney(bet)}G`);escrowSet(`GOSTOP${user.id}`,user.id,bet,'gostop');const d=hwatuDeck(),opening=previousWinner?null:matgoOpeningDraw(d),starter=previousWinner||opening.starter,s={bet,phase:'playing',hands:{user:[],bot:[]},floor:[],captured:{user:[],bot:[]},deck:d,turn:starter,goCount:{user:0,bot:0},lastDecisionScore:{user:0,bot:0},needDecision:false,pendingChoice:null,shakes:{user:0,bot:0},shakenMonths:{user:[],bot:[]},bombSkips:{user:0,bot:0},events:[],lastDraw:null,winner:null,result:null,opening};for(let i=0;i<10;i++){s.hands.user.push(d.pop());s.hands.bot.push(d.pop());}for(let i=0;i<8;i++)s.floor.push(d.pop());addMatgoBonusPi(s);matgoEvent(s,opening?`선 정하기 · 나 ${opening.user.m}월 vs J-BOT ${opening.bot.m}월 · 높은 패가 선`:'지난 판 승자가 선','gold');soloGostop.set(user.id,s);if(starter==='bot')gostopBotTurn(user.id);return s;}
function soloGostopSpecial(userId,action,month){const s=soloGostop.get(userId);if(!s||s.phase!=='playing')throw new Error('진행 중인 맞고가 없습니다.');if(s.turn!=='user'||s.needDecision)throw new Error('지금은 특수패를 사용할 수 없습니다.');if(action==='shake'){matgoShake(s,'user',month);return s;}if(action==='bomb'){matgoBomb(s,'user',month);gostopAfterTurn(userId,'user');if(s.phase==='playing'&&!s.needDecision){s.turn='bot';gostopBotTurn(userId);}return s;}throw new Error('지원하지 않는 맞고 특수 액션입니다.');}
function soloGostopPlay(userId,cardId,choiceId=null){const s=soloGostop.get(userId);if(!s||s.phase!=='playing')throw new Error('진행 중인 맞고가 없습니다.');if(s.turn!=='user'||s.needDecision)throw new Error('지금은 패를 낼 수 없습니다.');if(s.pendingChoice){if(!choiceId)throw new Error('먹을 바닥패를 선택해주세요.');const p=s.pendingChoice;s.pendingChoice=null;const played=matgoCapture(s,'user',p.card,choiceId);gostopDrawAndCapture(s,'user',{playedMonth:p.card.m,playMatched:played.matched});gostopAfterTurn(userId,'user');if(s.phase==='playing'&&!s.needDecision){s.turn='bot';gostopBotTurn(userId);}return s;}const idx=s.hands.user.findIndex(c=>c.id===cardId);if(idx<0)throw new Error('손패에 없는 카드입니다.');const card=s.hands.user.splice(idx,1)[0],matches=s.floor.filter(c=>c.m===card.m);if(matches.length===2){s.pendingChoice={card,options:matches};matgoEvent(s,`${card.m}월 패 중 먹을 패 선택`);return s;}const played=matgoCapture(s,'user',card);gostopDrawAndCapture(s,'user',{playedMonth:card.m,playMatched:played.matched});gostopAfterTurn(userId,'user');if(s.phase==='playing'&&!s.needDecision){s.turn='bot';gostopBotTurn(userId);}return s;}
function soloGostopDecision(userId,decision){const s=soloGostop.get(userId);if(!s||s.phase!=='playing')throw new Error('진행 중인 맞고가 없습니다.');if(s.turn!=='user')throw new Error('지금은 내 결정 차례가 아닙니다.');const score=gostopScore(s.captured.user).score;if(!s.needDecision&&score<7)throw new Error('고/스톱을 선택할 차례가 아닙니다.');s.needDecision=false;s.lastDecisionScore.user=Math.max(Number(s.lastDecisionScore.user||0),score);if(decision==='stop'){gostopFinish(userId,'user','스톱!');return s;}if(decision!=='go')throw new Error('고 또는 스톱을 선택해주세요.');s.goCount.user++;matgoEvent(s,`나 ${s.goCount.user}고`,'gold');if(!s.hands.user.length){if(!s.deck.length){gostopAfterTurn(userId,'user');return s;}gostopDrawAndCapture(s,'user',{playedMonth:null,playMatched:false});matgoEvent(s,'손패가 없어 더미에서 한 장 뒤집음','gold');gostopAfterTurn(userId,'user');if(s.phase==='playing'&&!s.needDecision){s.turn='bot';gostopBotTurn(userId);}return s;}s.turn='bot';gostopBotTurn(userId);return s;}
function publicGostop(s){if(!s)return null;const {deck,...rest}=s;return {...rest,hands:{user:s.hands.user,bot:s.phase==='complete'?s.hands.bot:s.hands.bot.map(()=>({id:'XX'}))},deckCount:s.deck.length,score:{user:gostopScore(s.captured.user),bot:gostopScore(s.captured.bot)}};}



function matgoOpeningValue(card){return (({'광':4,'열끗':3,'띠':2,'피':1}[card?.type]||0)*100)+Number(card?.m||0)}
function matgoOpeningDraw(d){let a=d.pop(),b=d.pop();while(matgoOpeningValue(a)===matgoOpeningValue(b)){d.push(b);shuffle(d);b=d.pop()}const starter=matgoOpeningValue(a)>matgoOpeningValue(b)?'user':'bot';const opening={user:a,bot:b,starter};d.push(a,b);shuffle(d);return opening}
function roomGostopStart(r){
  if(r.players.length!==2)throw new Error('맞고는 2명이 있어야 시작할 수 있습니다.');
  const ps=orderedPlayers(r),previousWinner=r.gostop?.phase==='complete'?r.gostop.winner:null,d=hwatuDeck(),opening=previousWinner?null:matgoOpeningDraw(d),starter=previousWinner||opening.starter,s={bet:r.buyIn,phase:'playing',userA:ps[0].userId,userB:ps[1].userId,hands:{user:[],bot:[]},floor:[],captured:{user:[],bot:[]},deck:d,turn:starter,goCount:{user:0,bot:0},lastDecisionScore:{user:0,bot:0},needDecision:false,pendingChoice:null,shakes:{user:0,bot:0},shakenMonths:{user:[],bot:[]},bombSkips:{user:0,bot:0},events:[],lastDraw:null,winner:null,result:null,opening};
  for(let i=0;i<10;i++){s.hands.user.push(d.pop());s.hands.bot.push(d.pop())}for(let i=0;i<8;i++)s.floor.push(d.pop());addMatgoBonusPi(s);matgoEvent(s,opening?`선 정하기 · ${opening.user.m}월 vs ${opening.bot.m}월 · 높은 패가 선`:`지난 판 승자가 선`,'gold');r.gostop=s;for(const p of r.players)p.ready=false;
}
function roomGostopSide(s,userId){if(Number(userId)===Number(s.userA))return'user';if(Number(userId)===Number(s.userB))return'bot';throw new Error('이 맞고방 참가자가 아닙니다.')}
function roomGostopFinish(r,winner,reason){
 const s=r.gostop;if(!s||s.phase==='complete')return;s.phase='complete';s.winner=winner;const winnerId=winner==='user'?s.userA:winner==='bot'?s.userB:null;
 const us=gostopScore(s.captured.user),bs=gostopScore(s.captured.bot),calc=winner?matgoMultiplier(s,winner):null;
 const base=winner?Math.max(1,calc.ws.score+s.goCount[winner]):0,multiplier=calc?calc.mult:1,netWin=winnerId?Math.floor(r.buyIn*base*multiplier):0;
 s.result={reason,base,multiplier,payout:netWin,bonuses:calc?.reasons||[]};
 for(const p of r.players)escrowDelete(r.id,p.userId);
 if(winnerId){
   const loserId=winnerId===s.userA?s.userB:s.userA,extra=Math.max(0,netWin-r.buyIn);
   if(extra)walletChange(loserId,-extra,'gostop_multi_loss',`${r.name} 맞고 ${base}점 x${multiplier}`);
   walletChange(winnerId,netWin+r.buyIn,'gostop_multi_win',`${r.name} 맞고 승리 ${base}점 x${multiplier}`);
   db.prepare('UPDATE stats SET gostop_games=gostop_games+1, gostop_wins=gostop_wins+1 WHERE user_id=?').run(winnerId);
   db.prepare('UPDATE stats SET gostop_games=gostop_games+1 WHERE user_id=?').run(loserId);
 } else {for(const p of r.players)walletChange(p.userId,r.buyIn,'gostop_multi_draw',`${r.name} 나가리 환급`);for(const p of r.players)db.prepare('UPDATE stats SET gostop_games=gostop_games+1 WHERE user_id=?').run(p.userId);}
 matgoEvent(s,`${reason}${winner?' · '+base+'점 ×'+multiplier:''}`,'gold');
}
function roomGostopAfterTurn(r,side){
 const s=r.gostop,sc=gostopScore(s.captured[side]).score;if(sc>=7&&sc>s.lastDecisionScore[side]){s.lastDecisionScore[side]=sc;s.needDecision=true;s.turn=side;return}
 if(!s.hands[side].length&&!s.deck.length){const us=gostopScore(s.captured.user).score,bs=gostopScore(s.captured.bot).score;if(Math.max(us,bs)<7)return roomGostopFinish(r,null,'나가리');return roomGostopFinish(r,us===bs?null:(us>bs?'user':'bot'),'패 소진')}
 s.turn=side==='user'?'bot':'user';
}
function roomGostopPlay(r,userId,cardId,choiceId=null,action=null,month=null){
 const s=r.gostop;if(!s||s.phase!=='playing')throw new Error('진행 중인 맞고가 없습니다.');const side=roomGostopSide(s,userId);if(s.turn!==side||s.needDecision)throw new Error('지금은 내 차례가 아닙니다.');
 if(action==='bomb'){matgoBomb(s,side,month);roomGostopAfterTurn(r,side);return}if(action==='shake'){matgoShake(s,side,month);return}
 if(s.pendingChoice){if(s.pendingChoice.side!==side||!choiceId)throw new Error('먹을 바닥패를 선택해주세요.');const p=s.pendingChoice;s.pendingChoice=null;const played=matgoCapture(s,side,p.card,choiceId);gostopDrawAndCapture(s,side,{playedMonth:p.card.m,playMatched:played.matched});roomGostopAfterTurn(r,side);return}
 const idx=s.hands[side].findIndex(x=>x.id===cardId);if(idx<0)throw new Error('손패에 없는 카드입니다.');const card=s.hands[side].splice(idx,1)[0],matches=s.floor.filter(x=>x.m===card.m);if(matches.length===2){s.pendingChoice={side,card,options:matches};return}
 const played=matgoCapture(s,side,card);gostopDrawAndCapture(s,side,{playedMonth:card.m,playMatched:played.matched});roomGostopAfterTurn(r,side);
}
function roomGostopDecision(r,userId,decision){
 const s=r.gostop;if(!s||s.phase!=='playing'||!s.needDecision)throw new Error('고/스톱을 선택할 차례가 아닙니다.');const side=roomGostopSide(s,userId);if(s.turn!==side)throw new Error('지금은 내 결정 차례가 아닙니다.');s.needDecision=false;if(decision==='stop')return roomGostopFinish(r,side,'스톱!');if(decision!=='go')throw new Error('고 또는 스톱을 선택해주세요.');s.goCount[side]++;if(!s.hands[side].length){if(!s.deck.length)return roomGostopAfterTurn(r,side);gostopDrawAndCapture(s,side,{playedMonth:null,playMatched:false});matgoEvent(s,'손패가 없어 더미에서 한 장 뒤집음','gold');roomGostopAfterTurn(r,side);return}s.turn=side==='user'?'bot':'user';
}
function roomGostopPublic(r,userId){
 const s=r.gostop;if(!s)return null;const my=roomGostopSide(s,userId),aSide=Number(s.userA)===Number(userId)?my:(my==='user'?'bot':'user'),map={a:'user',b:'bot'}; // a is always userA/internal user
 const conv=(side)=>s.phase==='complete'||side===my?s.hands[side]:s.hands[side].map(()=>({id:'XX'}));
 return {phase:s.phase,userA:s.userA,userB:s.userB,turn:s.turn==='user'?'a':'b',opening:s.opening,shakes:{a:s.shakes.user,b:s.shakes.bot},hands:{a:conv('user'),b:conv('bot')},floor:s.floor,captured:{a:s.captured.user,b:s.captured.bot},goCount:{a:s.goCount.user,b:s.goCount.bot},score:{a:gostopScore(s.captured.user),b:gostopScore(s.captured.bot)},needDecision:s.needDecision&&s.turn===my,pendingChoice:s.pendingChoice&&s.pendingChoice.side===my?{card:s.pendingChoice.card,options:s.pendingChoice.options}:null,deckCount:s.deck.length,winnerUserId:s.winner==='user'?s.userA:s.winner==='bot'?s.userB:null,result:s.result,events:s.events};
}

// ---------- Seven Poker (7-card stud) ----------
function sevenKey(userId){ return `SEVEN${userId}`; }
function sevenSideUserId(s,side){ return side==='user'?s.userId:s.botId; }
function sevenOther(side){ return side==='user'?'bot':'user'; }
function sevenVisibleCards(s,side){ return s.cards[side].filter((_,i)=>s.faceUp[side][i]); }
function sevenAllIn(s,side){ return s.stack[side]<=0; }
function sevenPot(s){ return s.pot; }
function sevenCurrentStatus(s,side){ return pokerHandStatus(s.cards[side]||[]); }
function sevenOpeningSide(s){
  const u=sevenVisibleCards(s,'user'), b=sevenVisibleCards(s,'bot');
  const score=(cards)=>{ if(!cards.length)return [0,0]; if(cards.length>=5)return eval7(cards); const st=pokerHandStatus(cards); return [st.rankLevel||0, Math.max(...cards.map(c=>rankVal(c[0])))]; };
  const ur=score(u),br=score(b),cmp=compareRank(ur,br);
  if(s.street===3) return cmp<=0?'user':'bot'; // third street: lower board opens
  return cmp>=0?'user':'bot';
}
function sevenEscrowSync(s){
  if(!s||s.complete)return;
  const userCommitted=s.handContrib?.user||0;
  escrowSet(sevenKey(s.userId),s.userId,Math.max(0,Math.floor(s.stack.user+userCommitted)),'seven_poker');
}
function sevenPay(s,side,amount){
  amount=Math.max(0,Math.min(Math.floor(amount),s.stack[side]));
  s.stack[side]-=amount;s.roundBet[side]+=amount;s.handContrib[side]+=amount;s.pot+=amount;
  sevenEscrowSync(s);return amount;
}
function sevenDealCard(s,side,faceUp){ s.cards[side].push(s.deck.pop());s.faceUp[side].push(!!faceUp); }
function sevenBeginHand(s){
  if(s.stack.user<1000)throw new Error('테이블 칩이 1,000G 미만이야. 칩 정산 후 다시 입장해줘.');
  if(s.stack.bot<1000)s.stack.bot=Math.max(s.buyIn,s.stack.user);
  s.handNo=(s.handNo||0)+1;s.handStartStack=Number(s.stack.user||0);s.street=3;s.phase='playing';s.complete=false;s.result=null;s.pot=0;s.deck=shuffle(cardDeck());
  s.cards={user:[],bot:[]};s.faceUp={user:[],bot:[]};s.roundBet={user:0,bot:0};s.handContrib={user:0,bot:0};s.currentBet=0;s.minRaise=Math.max(1000,Math.floor(s.buyIn/20/1000)*1000);s.acted={user:false,bot:false};s.folded={user:false,bot:false};s.lastAction='새 핸드';s.startedAt=now();
  const ante=Math.max(1000,Math.min(5000,Math.floor(s.buyIn/50/1000)*1000||1000));s.ante=ante;
  sevenPay(s,'user',Math.min(ante,s.stack.user));sevenPay(s,'bot',Math.min(ante,s.stack.bot));
  // Ante는 팟/총투입금에는 포함되지만 각 스트리트의 베팅액에는 포함하지 않는다.
  // 여기서 초기화하지 않으면 3rd street에서 check-check 후에도 라운드가 끝나지 않는다.
  s.roundBet={user:0,bot:0};s.currentBet=0;
  for(let i=0;i<2;i++){sevenDealCard(s,'user',false);sevenDealCard(s,'bot',false);}sevenDealCard(s,'user',true);sevenDealCard(s,'bot',true);
  s.turn=sevenOpeningSide(s);s.acted={user:false,bot:false};
}
function sevenRoundDone(s){
  const active=['user','bot'].filter(x=>!s.folded?.[x]);if(active.length<2)return true;
  const can=active.filter(x=>!sevenAllIn(s,x));if(can.length<=1)return true;
  return can.every(x=>s.acted[x]&&s.roundBet[x]===s.currentBet);
}
function sevenFinishFold(s,winner){
  s.stack[winner]+=s.pot;s.phase='complete';s.complete=true;s.turn=null;
  const userNet=Number(s.stack.user||0)-Number(s.handStartStack||0),sessionNet=Number(s.stack.user||0)-Number(s.buyIn||0);
  s.result={winner,reason:`${winner==='user'?'J-BOT':'내가'} 폴드`,pot:s.pot,userRank:null,botRank:null,userNet,sessionNet,text:winner==='user'?'내 승리! 상대가 폴드했어.':'J-BOT 승리 · 내가 폴드'};
  db.prepare('UPDATE stats SET seven_games=seven_games+1, seven_wins=seven_wins+? WHERE user_id=?').run(winner==='user'?1:0,s.userId);
  escrowSet(sevenKey(s.userId),s.userId,s.stack.user,'seven_poker');
}
function sevenShowdown(s){
  while(s.cards.user.length<7){const up=s.cards.user.length<6;sevenDealCard(s,'user',up);sevenDealCard(s,'bot',up);}
  const ur=eval7(s.cards.user),br=eval7(s.cards.bot),cmp=compareRank(ur,br);let winner='tie';
  if(cmp>0){winner='user';s.stack.user+=s.pot;}else if(cmp<0){winner='bot';s.stack.bot+=s.pot;}else{const half=Math.floor(s.pot/2);s.stack.user+=half;s.stack.bot+=s.pot-half;}
  s.phase='complete';s.complete=true;s.turn=null;
  const userNet=Number(s.stack.user||0)-Number(s.handStartStack||0),sessionNet=Number(s.stack.user||0)-Number(s.buyIn||0);
  s.result={winner,pot:s.pot,userRank:handName(ur),botRank:handName(br),userRankLevel:ur[0],botRankLevel:br[0],userNet,sessionNet,text:winner==='user'?`승리 · ${handName(ur)}`:winner==='bot'?`J-BOT 승리 · ${handName(br)}`:`무승부 · ${handName(ur)}`};
  db.prepare('UPDATE stats SET seven_games=seven_games+1, seven_wins=seven_wins+? WHERE user_id=?').run(winner==='user'?1:0,s.userId);
  escrowSet(sevenKey(s.userId),s.userId,s.stack.user,'seven_poker');
}
function sevenAdvanceStreet(s){
  if(sevenAllIn(s,'user')||sevenAllIn(s,'bot')){sevenShowdown(s);return;}
  if(s.street>=7){sevenShowdown(s);return;}
  s.street+=1;const faceUp=s.street<7;sevenDealCard(s,'user',faceUp);sevenDealCard(s,'bot',faceUp);
  s.roundBet={user:0,bot:0};s.currentBet=0;s.acted={user:false,bot:false};s.turn=sevenOpeningSide(s);s.lastAction=`${s.street===7?'RIVER':' '+s.street+'TH STREET'} 카드 오픈`;
}
function sevenAfterAction(s,side){
  if(s.complete)return;
  if(sevenRoundDone(s)){sevenAdvanceStreet(s);return;}
  s.turn=sevenOther(side);
  if(sevenAllIn(s,s.turn)){ if(sevenRoundDone(s))sevenAdvanceStreet(s); else s.turn=side; }
}
function sevenEffectiveMaxTo(s,side){
  const other=sevenOther(side),mine=(s.roundBet?.[side]||0)+(s.stack?.[side]||0),cover=(s.roundBet?.[other]||0)+(s.stack?.[other]||0);
  return Math.max(Number(s.currentBet||0),Math.min(mine,cover));
}
function sevenAction(s,side,action,raiseTo){
  if(!s||s.complete||s.phase!=='playing')throw new Error('진행 중인 세븐포커 핸드가 없어.');
  if(s.turn!==side)throw new Error('지금은 네 차례가 아니야.');
  const other=sevenOther(side),call=Math.max(0,s.currentBet-s.roundBet[side]);
  if(action==='fold'){s.folded=s.folded||{};s.folded[side]=true;sevenFinishFold(s,other);return;}
  if(action==='check'){if(call>0)throw new Error('상대 베팅이 있어 체크할 수 없어.');s.acted[side]=true;s.lastAction=`${side==='user'?'나':'J-BOT'} 체크`;sevenAfterAction(s,side);return;}
  if(action==='call'){
    const paid=sevenPay(s,side,call);s.acted[side]=true;s.lastAction=`${side==='user'?'나':'J-BOT'} ${paid?`콜 ${formatMoney(paid)}G`:'체크'}`;sevenAfterAction(s,side);return;
  }
  if(action==='raise'){
    let target=Math.floor(Number(raiseTo));if(!Number.isFinite(target))throw new Error('레이즈 금액을 확인해줘.');
    const maxTarget=sevenEffectiveMaxTo(s,side),minTarget=s.currentBet===0?s.minRaise:s.currentBet+s.minRaise;
    if(maxTarget<=s.currentBet)throw new Error('상대가 더 이상 받을 수 있는 칩이 없어. CALL 또는 CHECK를 선택해줘.');
    target=Math.min(maxTarget,target);
    if(target<=s.currentBet&&maxTarget>s.currentBet)throw new Error(`최소 ${formatMoney(Math.min(minTarget,maxTarget))}G 이상으로 레이즈해줘.`);
    if(target<minTarget&&target!==maxTarget)throw new Error(`최소 ${formatMoney(Math.min(minTarget,maxTarget))}G 이상으로 레이즈해줘.`);
    const pay=target-s.roundBet[side];sevenPay(s,side,pay);const old=s.currentBet;s.currentBet=Math.max(s.currentBet,s.roundBet[side]);if(s.currentBet>old)s.minRaise=Math.max(s.minRaise,s.currentBet-old);s.acted={user:false,bot:false};s.acted[side]=true;s.lastAction=`${side==='user'?'나':'J-BOT'} 레이즈 ${formatMoney(s.currentBet)}G`;sevenAfterAction(s,side);return;
  }
  throw new Error('지원하지 않는 액션이야.');
}
function sevenBotDrive(s){
  let guard=0;while(s&&!s.complete&&s.turn==='bot'&&guard++<5){
    const call=Math.max(0,s.currentBet-s.roundBet.bot),status=sevenCurrentStatus(s,'bot'),pot=Math.max(1,s.pot),pressure=call/pot,roll=Math.random();
    if(call>0 && status.rankLevel===0 && pressure>.45 && roll<.5){sevenAction(s,'bot','fold');continue;}
    const strong=status.rankLevel>=2 || (status.rankLevel>=1&&s.street>=5);
    if(strong&&s.stack.bot>call+s.minRaise&&roll<.38){const target=Math.min(s.roundBet.bot+s.stack.bot,Math.max(s.currentBet+s.minRaise,Math.floor((s.currentBet+Math.max(s.minRaise,pot*.45))/1000)*1000));sevenAction(s,'bot','raise',target);continue;}
    sevenAction(s,'bot',call>0?'call':'check');
  }
}
function sevenPublic(s){
  if(!s)return null;const botCards=s.cards.bot.map((c,i)=>s.complete||s.faceUp.bot[i]?c:'XX');
  const userRound=Number(s.roundBet?.user||0),call=Math.max(0,Number(s.currentBet||0)-userRound),maxRaiseTo=sevenEffectiveMaxTo(s,'user'),allInAmount=Math.max(0,maxRaiseTo-userRound),rawMin=Number(s.currentBet||0)===0?Number(s.minRaise||1000):Number(s.currentBet||0)+Number(s.minRaise||1000);
  const legal=s.turn==='user'&&!s.complete?{toCall:call,maxRaiseTo,allInAmount,tableStack:Number(s.stack?.user||0),opponentStack:Number(s.stack?.bot||0),minRaiseTo:Math.min(maxRaiseTo,rawMin),canRaise:maxRaiseTo>Number(s.currentBet||0)}:null;
  return {buyIn:s.buyIn,handNo:s.handNo,phase:s.phase,complete:s.complete,street:s.street,pot:s.pot,ante:s.ante,turn:s.turn,lastAction:s.lastAction,stack:s.stack,roundBet:s.roundBet,currentBet:s.currentBet,minRaise:s.minRaise,legal,cards:{user:s.cards.user,bot:botCards},faceUp:s.faceUp,result:s.result,userStatus:sevenCurrentStatus(s,'user'),botVisibleStatus:pokerHandStatus(sevenVisibleCards(s,'bot'))};
}
function sevenStart(user){
  const buyIn=Math.floor(Number(user.balance||0));if(!Number.isSafeInteger(buyIn)||buyIn<1000)throw new Error('세븐포커 테이블 입장에는 최소 1,000G가 필요해.');if(soloSeven.has(user.id))throw new Error('이미 세븐포커 테이블에 앉아 있어.');
  walletChange(user.id,-buyIn,'seven_buyin',`세븐포커 전액 스택 입장 ${formatMoney(buyIn)}G`);const s={userId:user.id,botId:-200000-user.id,buyIn,stack:{user:buyIn,bot:buyIn},handNo:0};soloSeven.set(user.id,s);escrowSet(sevenKey(user.id),user.id,buyIn,'seven_poker');sevenBeginHand(s);sevenBotDrive(s);return s;
}
function sevenNext(userId){const s=soloSeven.get(userId);if(!s)throw new Error('세븐포커 테이블이 없어.');if(!s.complete)throw new Error('현재 핸드가 아직 끝나지 않았어.');sevenBeginHand(s);sevenBotDrive(s);return s;}
function sevenCashout(userId){const s=soloSeven.get(userId);if(!s)return 0;if(!s.complete)throw new Error('진행 중인 핸드가 끝난 뒤 정산할 수 있어.');const amt=Math.max(0,Math.floor(s.stack.user));if(amt)walletChange(userId,amt,'seven_cashout','세븐포커 테이블 칩 정산');escrowDelete(sevenKey(userId),userId);soloSeven.delete(userId);return amt;}

// ---------- Seven Poker multiplayer · 2-player stud table ----------
function sevenMIds(r){return orderedPlayers(r).map(p=>p.userId);}
function sevenMOther(r,uid){return sevenMIds(r).find(id=>id!==Number(uid));}
function sevenMMaxRaiseTo(r,s,uid){
  uid=Number(uid);const p=roomPlayer(r,uid),mine=Number(s.roundBet?.[uid]||0)+Number(p?.stack||0);
  const covers=sevenMIds(r).filter(id=>id!==uid&&!s.folded?.[id]).map(id=>Number(s.roundBet?.[id]||0)+Number(roomPlayer(r,id)?.stack||0));
  const cover=covers.length?Math.max(...covers):mine;
  return Math.max(Number(s.currentBet||0),Math.min(mine,cover));
}
function sevenMPot(s){return Object.values(s.committed||{}).reduce((a,b)=>a+Number(b||0),0);}
function sevenMVisible(s,uid){return (s.cards[uid]||[]).filter((_,i)=>s.faceUp[uid]?.[i]);}
function sevenMOpening(r,s){
  const ids=sevenMIds(r);let best=ids[0],bestScore=-1;for(const id of ids){const c=sevenMVisible(s,id).at(-1);const sc=c?rankVal(c[0])*10+['C','D','H','S'].indexOf(c[1]):0;if(sc>bestScore){bestScore=sc;best=id;}}
  return best;
}
function sevenMPay(r,s,uid,amount){const p=roomPlayer(r,uid);amount=Math.max(0,Math.min(Math.floor(amount),p?.stack||0));if(!p||amount<=0)return 0;p.stack-=amount;s.roundBet[uid]=(s.roundBet[uid]||0)+amount;s.committed[uid]=(s.committed[uid]||0)+amount;if(p.stack===0)s.allIn[uid]=true;return amount;}
function sevenMDeal(s,uid,faceUp){s.cards[uid].push(s.deck.pop());s.faceUp[uid].push(!!faceUp);}
function sevenMStart(r){
  if(r.players.length<2||r.players.length>6)throw new Error('세븐포커 멀티는 2~6명이 필요합니다.');if(r.seven&&!r.seven.complete)throw new Error('이미 핸드가 진행 중입니다.');
  const ids=sevenMIds(r);if(ids.some(id=>(roomPlayer(r,id)?.stack||0)<1000))throw new Error('모든 플레이어에게 최소 1,000G 이상의 테이블 칩이 필요합니다.');
  const ante=Math.max(1000,Math.min(5000,Math.floor(r.buyIn/40/1000)*1000||1000)),handStartStacks=Object.fromEntries(ids.map(id=>[id,Number(roomPlayer(r,id)?.stack||0)])),s={phase:'playing',complete:false,handNo:(r.seven?.handNo||0)+1,street:3,deck:shuffle(cardDeck()),cards:{},faceUp:{},roundBet:{},committed:{},allIn:{},acted:{},folded:{},handStartStacks,currentBet:0,minRaise:ante,turnUserId:null,lastAction:'3RD STREET · 카드 배분',result:null,ante,startedAt:now()};
  for(const id of ids){s.cards[id]=[];s.faceUp[id]=[];s.roundBet[id]=0;s.committed[id]=0;s.allIn[id]=false;s.acted[id]=false;s.folded[id]=false;sevenMPay(r,s,id,ante);}
  for(let i=0;i<2;i++)for(const id of ids)sevenMDeal(s,id,false);for(const id of ids)sevenMDeal(s,id,true);s.currentBet=0;for(const id of ids)s.roundBet[id]=0;s.turnUserId=sevenMOpening(r,s);r.seven=s;r.players.forEach(p=>p.ready=false);touchRoom(r);return s;
}
function sevenMRoundDone(r,s){const ids=sevenMIds(r).filter(id=>!s.folded[id]),actors=ids.filter(id=>!s.allIn[id]);if(ids.length<=1||actors.length<=1)return true;return actors.every(id=>s.acted[id]&&s.roundBet[id]===s.currentBet);}
function sevenMFinish(r,winnerId,type='fold'){
  const s=r.seven,pot=sevenMPot(s),winner=roomPlayer(r,winnerId);if(winner)winner.stack+=pot;s.phase='complete';s.complete=true;s.turnUserId=null;
  const netByUser=Object.fromEntries(r.players.map(p=>[p.userId,Number(p.stack||0)-Number(s.handStartStacks?.[p.userId]||0)]));
  s.result={type,winnerId,pot,summary:`${winner?.nickname||'승자'} 승리`,ranks:{},netByUser};sevenMAfterHand(r,winnerId?[winnerId]:[]);
}
function sevenMShowdown(r){
  const s=r.seven,ids=sevenMIds(r).filter(id=>!s.folded[id]);while((s.cards[ids[0]]||[]).length<7){const faceUp=(s.cards[ids[0]].length)<6;for(const id of ids)sevenMDeal(s,id,faceUp);}
  const ranks={};for(const id of ids)ranks[id]=eval7(s.cards[id]);let best=null,winners=[];for(const id of ids){const rk=ranks[id];if(!best||compareRank(rk,best)>0){best=rk;winners=[id];}else if(compareRank(rk,best)===0)winners.push(id);}
  const pot=sevenMPot(s),share=Math.floor(pot/winners.length),rem=pot-share*winners.length;winners.forEach((id,i)=>{roomPlayer(r,id).stack+=share+(i<rem?1:0)});s.phase='complete';s.complete=true;s.turnUserId=null;
  const netByUser=Object.fromEntries(r.players.map(p=>[p.userId,Number(p.stack||0)-Number(s.handStartStacks?.[p.userId]||0)]));
  s.result={type:'showdown',winnerIds:winners,pot,ranks:Object.fromEntries(ids.map(id=>[id,{rank:ranks[id],name:handName(ranks[id])}])),netByUser,summary:`${winners.map(id=>roomPlayer(r,id)?.nickname).join(', ')} · ${handName(best)}`};sevenMAfterHand(r,winners);
}
function sevenMAfterHand(r,winners){for(const p of r.players){if(p.sevenSessionStart==null)p.sevenSessionStart=Number(r.seven?.handStartStacks?.[p.userId]??p.stack??0);db.prepare('UPDATE stats SET seven_games=seven_games+1, seven_wins=seven_wins+? WHERE user_id=?').run(winners.includes(p.userId)?1:0,p.userId);escrowSet(r.id,p.userId,Math.max(0,p.stack),'sevenpoker');p.ready=false;}touchRoom(r);pushRefresh(r.id);}
function sevenMAdvance(r){const s=r.seven;if(sevenMIds(r).some(id=>s.allIn[id])){sevenMShowdown(r);return;}if(s.street>=7){sevenMShowdown(r);return;}s.street++;for(const id of sevenMIds(r))sevenMDeal(s,id,s.street<7);for(const id of sevenMIds(r)){s.roundBet[id]=0;s.acted[id]=false;}s.currentBet=0;s.turnUserId=sevenMOpening(r,s);s.lastAction=`${s.street===7?'7TH · RIVER':s.street+'TH STREET'} 카드 배분`;}
function sevenMAction(r,userId,action,raiseTo){
  const s=r.seven,uid=Number(userId);if(!s||s.complete)throw new Error('진행 중인 세븐포커 핸드가 없습니다.');if(s.turnUserId!==uid)throw new Error('지금은 내 차례가 아닙니다.');if(s.folded[uid]||s.allIn[uid])throw new Error('행동할 수 없습니다.');const other=sevenMOther(r,uid),call=Math.max(0,s.currentBet-s.roundBet[uid]);
  if(action==='fold'){s.folded[uid]=true;s.acted[uid]=true;const active=sevenMIds(r).filter(id=>!s.folded[id]);if(active.length===1){sevenMFinish(r,active[0],'fold');return;}}
  if(action==='check'){if(call>0)throw new Error('상대 베팅이 있어 체크할 수 없습니다.');s.acted[uid]=true;s.lastAction=`${roomPlayer(r,uid)?.nickname} 체크`;}
  else if(action==='call'){const paid=sevenMPay(r,s,uid,call);s.acted[uid]=true;s.lastAction=`${roomPlayer(r,uid)?.nickname} ${paid?`콜 ${formatMoney(paid)}G`:'체크'}`;}
  else if(action==='raise'){
    const p=roomPlayer(r,uid),maxTo=sevenMMaxRaiseTo(r,s,uid);let target=Math.floor(Number(raiseTo)),minTo=s.currentBet===0?s.minRaise:s.currentBet+s.minRaise;if(!Number.isFinite(target))throw new Error('레이즈 금액을 확인해주세요.');if(maxTo<=s.currentBet)throw new Error('상대가 더 이상 받을 수 있는 칩이 없습니다. CALL 또는 CHECK를 선택해주세요.');target=Math.min(maxTo,target);if(target<=s.currentBet&&maxTo>s.currentBet)throw new Error(`최소 ${formatMoney(Math.min(minTo,maxTo))}G 이상 레이즈해주세요.`);if(target<minTo&&target!==maxTo)throw new Error(`최소 ${formatMoney(Math.min(minTo,maxTo))}G 이상 레이즈해주세요.`);const old=s.currentBet;sevenMPay(r,s,uid,target-s.roundBet[uid]);s.currentBet=Math.max(s.currentBet,s.roundBet[uid]);if(s.currentBet>old)s.minRaise=Math.max(s.minRaise,s.currentBet-old);for(const id of sevenMIds(r))if(id!==uid&&!s.folded[id]&&!s.allIn[id])s.acted[id]=false;s.acted[uid]=true;s.lastAction=`${p.nickname} 레이즈 ${formatMoney(s.currentBet)}G`;
  } else throw new Error('지원하지 않는 액션입니다.');
  if(sevenMRoundDone(r,s)){sevenMAdvance(r);return;}const ids=sevenMIds(r),idx=ids.indexOf(uid);let next=null;for(let step=1;step<=ids.length;step++){const id=ids[(idx+step)%ids.length];if(!s.folded[id]&&!s.allIn[id]){next=id;break;}}s.turnUserId=next;if(!next)sevenMAdvance(r);touchRoom(r);
}
function sevenMPublic(r,userId){
  const s=r.seven;if(!s)return null;const reveal=s.complete&&s.result?.type==='showdown',cards={},statuses={};for(const p of r.players){const id=p.userId;cards[id]=(s.cards[id]||[]).map((c,i)=>id===userId||reveal&&!s.folded[id]||s.faceUp[id]?.[i]?c:'XX');statuses[id]=id===userId?pokerHandStatus(s.cards[id]||[]):pokerHandStatus(sevenMVisible(s,id));}
  const meId=Number(userId),p=roomPlayer(r,meId),myRound=Number(s.roundBet?.[meId]||0),call=Math.max(0,s.currentBet-myRound),maxRaiseTo=sevenMMaxRaiseTo(r,s,meId),allInAmount=Math.max(0,maxRaiseTo-myRound),rawMin=s.currentBet===0?s.minRaise:s.currentBet+s.minRaise;
  const sessionStart=Number(p?.sevenSessionStart??s.handStartStacks?.[meId]??p?.stack??0),sessionNet=s.complete?Number(p?.stack||0)-sessionStart:null;
  return {phase:s.phase,complete:s.complete,handNo:s.handNo,street:s.street,ante:s.ante,pot:sevenMPot(s),turnUserId:s.turnUserId,lastAction:s.lastAction,cards,faceUp:s.faceUp,roundBet:s.roundBet,currentBet:s.currentBet,minRaise:s.minRaise,folded:s.folded,allIn:s.allIn,result:s.result,statuses,sessionNet,legal:s.turnUserId===meId&&!s.complete?{toCall:call,minRaiseTo:Math.min(maxRaiseTo,rawMin),maxRaiseTo,allInAmount,canRaise:maxRaiseTo>s.currentBet,tableStack:Number(p?.stack||0)}:null};
}

// ---------- Baccarat Duel (2-player, equal virtual stakes) ----------
function baccaratMakeId(){let id;do{id=crypto.randomBytes(3).toString('hex').toUpperCase()}while(baccaratRooms.has(id)||rooms.has(id));return id;}
function baccaratFindUser(userId){return [...baccaratRooms.values()].find(r=>r.players.some(p=>p.userId===userId));}
function baccaratPlayer(r,userId){return r.players.find(p=>p.userId===userId);}
function baccaratTouch(r){r.version=(r.version||0)+1;r.updatedAt=now();}
function baccaratCardValue(card){const r=card[0];return r==='A'?1:['T','J','Q','K'].includes(r)?0:Number(r);}
function baccaratPoint(cards){return cards.reduce((n,c)=>n+baccaratCardValue(c),0)%10;}
function baccaratShoe(){const d=[];for(let k=0;k<8;k++)d.push(...cardDeck());return shuffle(d);}
function baccaratDeal(){
  const d=baccaratShoe(),player=[d.pop(),d.pop()],banker=[d.pop(),d.pop()];let pp=baccaratPoint(player),bp=baccaratPoint(banker),p3=null;
  if(!(pp>=8||bp>=8)){
    if(pp<=5){p3=d.pop();player.push(p3);pp=baccaratPoint(player);}
    const p3v=p3?baccaratCardValue(p3):null;let bankerDraw=false;
    if(p3===null)bankerDraw=bp<=5;else if(bp<=2)bankerDraw=true;else if(bp===3)bankerDraw=p3v!==8;else if(bp===4)bankerDraw=p3v>=2&&p3v<=7;else if(bp===5)bankerDraw=p3v>=4&&p3v<=7;else if(bp===6)bankerDraw=p3v>=6&&p3v<=7;
    if(bankerDraw){banker.push(d.pop());bp=baccaratPoint(banker);}
  }
  return {player,banker,playerPoint:pp,bankerPoint:bp,winner:pp>bp?'player':bp>pp?'banker':'tie'};
}
function baccaratMaxStake(r){if(r.players.length<2)return 0;const a=userPublic(r.players[0].userId),b=userPublic(r.players[1].userId);return Math.max(0,Math.min(Number(a?.balance||0),Number(b?.balance||0)));}
function baccaratSettleBalances(r,winnerUserId,loserUserId,stake){
  db.exec('BEGIN IMMEDIATE');try{
    const w=db.prepare('SELECT balance FROM users WHERE id=?').get(winnerUserId),l=db.prepare('SELECT balance FROM users WHERE id=?').get(loserUserId);if(!w||!l)throw new Error('참가자 계정을 찾을 수 없어.');if(l.balance<stake||w.balance<stake)throw new Error('두 참가자 중 한 명의 게임머니가 부족해.');
    const wn=w.balance+stake,ln=l.balance-stake,t=now();db.prepare('UPDATE users SET balance=? WHERE id=?').run(wn,winnerUserId);db.prepare('UPDATE users SET balance=? WHERE id=?').run(ln,loserUserId);
    db.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)').run(winnerUserId,stake,wn,'baccarat_win',`바카라 대전 승리 +${formatMoney(stake)}G`,t);
    db.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)').run(loserUserId,-stake,ln,'baccarat_loss',`바카라 대전 패배 -${formatMoney(stake)}G`,t);
    db.prepare('UPDATE stats SET baccarat_games=baccarat_games+1,baccarat_wins=baccarat_wins+1,baccarat_profit=baccarat_profit+? WHERE user_id=?').run(stake,winnerUserId);
    db.prepare('UPDATE stats SET baccarat_games=baccarat_games+1,baccarat_profit=baccarat_profit-? WHERE user_id=?').run(stake,loserUserId);db.exec('COMMIT');
  }catch(e){try{db.exec('ROLLBACK')}catch{};throw e;}
}
function baccaratPlay(r){
  if(r.players.length!==2)throw new Error('상대가 입장해야 시작할 수 있어.');if(r.phase==='dealing')throw new Error('현재 카드가 배분 중이야.');
  const bothReady=r.players.every(p=>p.ready||p.auto);if(!bothReady)throw new Error('두 플레이어 모두 READY가 필요해.');const max=baccaratMaxStake(r);if(max<1000)throw new Error('두 참가자 모두 최소 1,000G가 필요해.');
  const stake=Math.min(Math.floor(Number(r.stake||10000)),max);if(!Number.isSafeInteger(stake)||stake<1000)throw new Error('베팅금은 최소 1,000G야.');r.stake=stake;r.phase='dealing';baccaratTouch(r);
  const deal=baccaratDeal();r.roundNo=(r.roundNo||0)+1;const bankerIndex=(r.startBankerIndex+r.roundNo-1)%2;const bankerUserId=r.players[bankerIndex].userId,playerUserId=r.players[1-bankerIndex].userId;
  let winnerUserId=null,loserUserId=null;if(deal.winner==='banker'){winnerUserId=bankerUserId;loserUserId=playerUserId;}else if(deal.winner==='player'){winnerUserId=playerUserId;loserUserId=bankerUserId;}
  if(winnerUserId)baccaratSettleBalances(r,winnerUserId,loserUserId,stake);else{db.prepare('UPDATE stats SET baccarat_games=baccarat_games+1 WHERE user_id IN (?,?)').run(r.players[0].userId,r.players[1].userId);}
  r.result={...deal,stake,bankerUserId,playerUserId,winnerUserId,loserUserId,at:now()};r.phase='result';for(const p of r.players)p.ready=!!p.auto;baccaratTouch(r);pushRefresh();return r;
}
function baccaratPublic(r,userId){
  const maxStake=baccaratMaxStake(r);if(maxStake>0&&r.stake>maxStake)r.stake=Math.max(1000,Math.floor(maxStake));
  return {id:r.id,game:'baccarat',name:r.name,hostId:r.hostId,phase:r.phase,stake:r.stake,maxStake,roundNo:r.roundNo||0,version:r.version||0,updatedAt:r.updatedAt,players:r.players.map((p,i)=>{const u=userPublic(p.userId);return {...p,balance:u?.balance||0,avatarEmoji:AVATARS[p.avatar%AVATARS.length],cosmetics:u?.cosmetics||null,isMe:p.userId===userId,role:r.result?(r.result.bankerUserId===p.userId?'BANKER':'PLAYER'):(((r.startBankerIndex+(r.roundNo||0))%2)===i?'BANKER':'PLAYER')};}),result:r.result||null};
}
function baccaratSummary(r){return {id:r.id,game:'baccarat',name:r.name,hostId:r.hostId,players:r.players.length,maxPlayers:2,status:r.players.length<2?'WAITING':r.phase==='dealing'?'PLAYING':'READY',stake:r.stake,maxStake:baccaratMaxStake(r),updatedAt:r.updatedAt,participants:r.players.map(p=>({userId:p.userId,nickname:p.nickname,avatar:p.avatar,cosmetics:cosmeticsPublic(p.userId),ready:!!p.ready,auto:!!p.auto}))};}
function baccaratClose(r){baccaratRooms.delete(r.id);pushRefresh();}

function activeRoomReactions(r){
  const t=now();
  r.reactions=r.reactions||{};
  for(const [uid,x] of Object.entries(r.reactions)){if(!x||Number(x.expiresAt||0)<=t)delete r.reactions[uid];}
  return Object.values(r.reactions).map(x=>({userId:x.userId,nickname:x.nickname,key:x.key,emoji:x.emoji,label:x.label,at:x.at,expiresAt:x.expiresAt}));
}

function expirePokerTurn(r){
  const h=r?.hand;if(r?.solo||r?.game!=='holdem'||!h||h.phase==='complete'||!h.turnUserId)return;
  if(now()-Number(h.turnStartedAt||h.startedAt||now())<15000)return;
  const expired=h.turnUserId;
  try{pokerAction(r,expired,'fold',0);if(h.result)h.result.timeoutUserId=expired;touchRoom(r);}catch(e){console.warn('[HOLDem timeout]',e.message);}
}

function personalizedRoom(r,userId){
  expirePokerTurn(r);
  maybeAutoStartHoldem(r);
  const turnUserId=currentTurnUserId(r),turnPlayer=turnUserId!=null?roomPlayer(r,turnUserId):null;
  return {
    id:r.id,name:r.name,game:r.game,buyIn:r.buyIn,allWallet:!!r.allWallet,maxPlayers:r.maxPlayers,hostId:r.hostId,status:roomStatus(r),smallBlind:r.smallBlind,bigBlind:r.bigBlind,yutMode:r.yutMode||'individual',yutModeLabel:yutModeLabel(r.yutMode||'individual'),
    version:r.version||0,updatedAt:r.updatedAt||r.createdAt,readyCount:roomReadyCount(r),allReady:r.players.length>=2&&r.players.every(p=>!!p.ready),autoStartAt:holdemAutoStartAt(r),
    turnUserId,turnNickname:turnPlayer?.nickname||null,myTurn:turnUserId===userId,
    players:orderedPlayers(r).map(p=>({...p,ready:!!p.ready,avatarEmoji:AVATARS[p.avatar%AVATARS.length],cosmetics:cosmeticsPublic(p.userId)})),
    reactions:activeRoomReactions(r),
    gostop:r.game==='gostop'?roomGostopPublic(r,userId):null,
    hand:r.game==='holdem'?pokerView(r,userId):null,seven:r.game==='sevenpoker'?sevenMPublic(r,userId):null,seotda:r.game==='seotda'?seotdaMultiPublic(r,userId):null,yut:r.game==='yut'?r.yut:null
  };
}

const treasureRaid=createTreasureRaid({
  crypto,now,readBody,requireAuth,json,walletChange,userPublic,escrowSet,escrowDelete,pushRefresh,formatMoney,rateLimit,
  isUserBusy:userId=>!!findUserRoom(userId)||!!baccaratFindUser(userId)
});

function serveStatic(req,res,url){
  let p=url.pathname==='/'?'/index.html':url.pathname;
  if(p.includes('..')){res.writeHead(400);res.end();return;}
  const file=path.join(__dirname,'public',p);
  if(!file.startsWith(path.join(__dirname,'public'))||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404,securityHeaders());res.end('Not found');return;}
  const ext=path.extname(file).toLowerCase();const ct={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'}[ext]||'application/octet-stream';
  const st=fs.statSync(file);const appShell=['.html','.js','.css','.webmanifest'].includes(ext);res.writeHead(200,{'Content-Type':ct,'Content-Length':st.size,'Cache-Control':appShell?'no-cache, no-store, must-revalidate':'public, max-age=86400',...securityHeaders()});fs.createReadStream(file).pipe(res);
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(!sameOriginPost(req)){return json(res,403,{error:'잘못된 요청 출처입니다.'});}
    if(url.pathname.startsWith('/api/treasure-raid')){if(await treasureRaid.handle(req,res,url))return;}
    if(url.pathname==='/healthz')return json(res,200,{ok:true,rooms:rooms.size+baccaratRooms.size+treasureRaid.roomCount(),online:onlineCount()});
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
    if(url.pathname==='/api/me'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;return json(res,200,{user:u,online:onlineCount(),presence:presenceSnapshot()});}
    if(url.pathname==='/api/rank'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;return json(res,200,{rank:socialRankPublic(u.id),user:userPublic(u.id),ranks:SOCIAL_RANKS});}
    if(url.pathname==='/api/rank/promote'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;
      if(!rateLimit('rank_promote:'+u.id,6,60000))return json(res,429,{error:'신분 상승 요청이 너무 빠릅니다.'});
      try{const result=promoteSocialRank(u.id);pushRefresh();return json(res,200,{ok:true,...result,user:userPublic(u.id)});}catch(e){return json(res,400,{error:e.message});}
    }
    if(url.pathname==='/api/shop'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;return json(res,200,{...shopState(u.id),user:userPublic(u.id)});}
    if(url.pathname==='/api/shop/buy'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;if(!rateLimit('shop_buy:'+u.id,20,60000))return json(res,429,{error:'구매를 너무 빠르게 반복하고 있어. 잠시 후 다시 시도해줘.'});
      const b=await readBody(req);try{const r=buyShopItem(u.id,b.itemId);await db.flush();pushRefresh();return json(res,200,{ok:true,item:r.item,user:userPublic(u.id),state:shopState(u.id)});}catch(e){return json(res,400,{error:e.message});}
    }
    if(url.pathname==='/api/shop/equip'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);try{const cosmetics=equipShopItem(u.id,b.category,b.itemId);await db.flush();pushRefresh();return json(res,200,{ok:true,cosmetics,user:userPublic(u.id),state:shopState(u.id)});}catch(e){return json(res,400,{error:e.message});}
    }
    if(url.pathname==='/api/member/lookup'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;
      if(!rateLimit('member_lookup:'+u.id,30,60000))return json(res,429,{error:'친구 확인을 너무 자주 했어. 잠시 후 다시 시도해줘.'});
      const nickname=escText(url.searchParams.get('nickname')||'',14);
      if(nickname.length<2)return json(res,400,{error:'친구 닉네임을 정확히 입력해줘.'});
      const target=db.prepare('SELECT id,nickname,avatar,is_disabled FROM users WHERE nickname=? COLLATE NOCASE').get(nickname);
      if(!target||target.is_disabled)return json(res,404,{error:'해당 닉네임의 친구를 찾을 수 없어.'});
      if(Number(target.id)===Number(u.id))return json(res,400,{error:'자기 자신에게는 보낼 수 없어.'});
      const owned=inventoryIds(target.id);const ownedItems=SHOP_ITEMS.filter(x=>owned.has(x.id)&&!x.adminOnly).map(itemPublic).slice(0,60);return json(res,200,{user:{id:target.id,nickname:target.nickname,avatar:target.avatar,avatarEmoji:AVATARS[target.avatar%AVATARS.length],cosmetics:cosmeticsPublic(target.id),rank:socialRankPublic(target.id),ownedCount:owned.size,ownedItems}});
    }
    if(url.pathname==='/api/shop/gift'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;
      if(!rateLimit('shop_gift:'+u.id,10,60000))return json(res,429,{error:'아이템 선물을 너무 빠르게 반복하고 있어. 잠시 후 다시 시도해줘.'});
      const b=await readBody(req),targetId=Number(b.targetId),item=SHOP_BY_ID[String(b.itemId||'')];
      if(!Number.isInteger(targetId)||targetId<1||targetId===Number(u.id))return json(res,400,{error:'선물할 친구를 다시 확인해줘.'});
      if(!item||item.adminOnly)return json(res,400,{error:'선물할 수 없는 아이템이야.'});
      const target=db.prepare('SELECT id,nickname,is_disabled FROM users WHERE id=?').get(targetId);
      if(!target||target.is_disabled)return json(res,404,{error:'선물 받을 친구를 찾을 수 없어.'});
      if(Number(item.rankTier||0)>Number(socialRankPerksForUser(targetId).shopTier||0))return json(res,403,{error:'친구의 현재 신분으로는 받을 수 없는 신분 전용 아이템이야.'});
      if(db.prepare('SELECT 1 FROM user_inventory WHERE user_id=? AND item_id=?').get(targetId,item.id))return json(res,409,{error:'그 친구가 이미 보유한 아이템이야.'});
      db.exec('BEGIN IMMEDIATE');
      try{
        const sender=db.prepare('SELECT balance FROM users WHERE id=?').get(u.id);if(!sender)throw new Error('사용자를 찾을 수 없습니다.');
        const giftBonusPct=Number(socialRankPerksForUser(u.id).giftBonusPct||0),giftBonus=Math.min(10000000,Math.max(0,Math.floor(item.price*giftBonusPct/100))),charged=Math.max(0,item.price-giftBonus);
        if(sender.balance<charged)throw new Error('게임머니가 부족해.');
        const next=sender.balance-charged,t=now();
        db.prepare('UPDATE users SET balance=? WHERE id=?').run(next,u.id);
        db.prepare('INSERT INTO user_inventory(user_id,item_id,purchase_price,purchased_at) VALUES(?,?,?,?)').run(targetId,item.id,0,t);
        db.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)').run(u.id,-charged,next,'shop_gift',`선물 · ${target.nickname} · ${item.name}${giftBonus?` · 신분 혜택 ${formatMoney(giftBonus)}G 할인`:''}`,t);
        const tb=db.prepare('SELECT balance FROM users WHERE id=?').get(targetId)?.balance||0;
        db.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)').run(targetId,0,tb,'gift_received',`선물 받음 · ${item.name}`,t);
        db.exec('COMMIT');pushRefresh();return json(res,200,{ok:true,item:itemPublic(item),target:{id:target.id,nickname:target.nickname},giftBonus,giftBonusPct,charged,user:userPublic(u.id)});
      }catch(e){try{db.exec('ROLLBACK')}catch{};return json(res,400,{error:e.message});}
    }
    if(url.pathname==='/api/wallet/transfer'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;
      if(!rateLimit('wallet_transfer:'+u.id,12,60000))return json(res,429,{error:'게임머니 보내기를 너무 자주 했어. 잠시 후 다시 시도해줘.'});
      const b=await readBody(req),targetId=Number(b.targetId),amount=Math.trunc(Number(b.amount));
      if(!Number.isInteger(targetId)||targetId<1)return json(res,400,{error:'받는 친구를 다시 확인해줘.'});
      if(!Number.isInteger(amount)||amount<1)return json(res,400,{error:'보낼 금액을 올바르게 입력해줘.'});
      try{const result=transferGameMoney(u.id,targetId,amount);pushRefresh();return json(res,200,{ok:true,amount,fee:result.fee,feePct:result.feePct,total:result.total,target:result.target,user:userPublic(u.id)});}catch(e){return json(res,400,{error:e.message});}
    }
    if(url.pathname==='/api/events'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive',...securityHeaders()});
      res.write(`event: hello\ndata: ${JSON.stringify({t:now()})}\n\n`);const id=randomToken(8);sseClients.set(id,{res,userId:u.id});pushRefresh();
      const hb=setInterval(()=>{try{res.write(`: ping ${now()}\n\n`)}catch{}},25000);
      req.on('close',()=>{clearInterval(hb);sseClients.delete(id);pushRefresh();});return;
    }
    if(url.pathname==='/api/daily-draw'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;return json(res,200,dailyDrawState(u.id));}
    if(url.pathname==='/api/daily-draw/pick'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;if(!rateLimit('daily_draw:'+u.id,8,60000))return json(res,429,{error:'뽑기 요청이 너무 빠릅니다.'});const b=await readBody(req);try{const result=dailyDrawPick(u.id,b.number);pushRefresh();return json(res,200,{ok:true,...result,user:userPublic(u.id)});}catch(e){return json(res,409,{error:e.message,state:dailyDrawState(u.id)});}}
    if(url.pathname==='/api/daily'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const d=kstDate();if(u.last_daily===d)return json(res,409,{error:'오늘 출석 보너스는 이미 받았습니다.'});
      const cosmeticPct=Number(cosmeticsPublic(u.id,true)?.perks?.dailyBonusPct||0),rankPerks=socialRankPerksForUser(u.id),rankPct=Number(rankPerks.dailyBonusPct||0),dailyPct=cosmeticPct+rankPct;db.exec('BEGIN IMMEDIATE');try{const fresh=db.prepare('SELECT balance,last_daily,last_rank_salary FROM users WHERE id=?').get(u.id);if(!fresh)throw new Error('사용자를 찾을 수 없습니다.');if(fresh.last_daily===d){db.exec('ROLLBACK');return json(res,409,{error:'오늘 출석 보너스는 이미 받았습니다.'});}const dailyAmount=Math.floor(50000*(1+dailyPct/100)),salary=(fresh.last_rank_salary===d?0:Number(rankPerks.dailySalary||0)),interestPct=Number(rankPerks.dailyInterestPct||0),interest=Math.min(100000000,Math.max(0,Math.floor(Number(fresh.balance||0)*interestPct/100))),total=dailyAmount+salary+interest,bal=Number(fresh.balance||0)+total;if(!Number.isSafeInteger(bal))throw new Error('게임머니 한도를 초과합니다.');db.prepare('UPDATE users SET balance=?,last_daily=?,last_rank_salary=? WHERE id=?').run(bal,d,d,u.id);db.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)').run(u.id,total,bal,'daily',`오늘의 출석 ${formatMoney(dailyAmount)}G${salary?` · 신분 월급 ${formatMoney(salary)}G`:''}${interest?` · 신분 이자 ${formatMoney(interest)}G`:''}`,now());db.exec('COMMIT');pushRefresh();return json(res,200,{balance:bal,amount:total,attendanceAmount:dailyAmount,rankSalary:salary,rankInterest:interest,rankInterestPct:interestPct,dailyBonusPct:dailyPct,rankBonusPct:rankPct});}catch(e){try{db.exec('ROLLBACK')}catch{}throw e;}
    }
    if(url.pathname==='/api/ledger'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;const rows=db.prepare('SELECT amount,balance_after,type,memo,created_at FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 30').all(u.id);return json(res,200,{rows});
    }
    if(url.pathname==='/api/leaderboard'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;const rows=db.prepare(`SELECT u.id,u.nickname,u.balance,u.avatar,s.poker_wins,s.yut_wins,s.slot_profit,s.seotda_wins,s.gostop_wins FROM users u JOIN stats s ON s.user_id=u.id ORDER BY u.balance DESC LIMIT 20`).all().map(x=>({...x,avatarEmoji:AVATARS[x.avatar%AVATARS.length],cosmetics:cosmeticsPublic(x.id),rank:socialRankPublic(x.id)}));return json(res,200,{rows});
    }
    if(url.pathname==='/api/admin/users'&&req.method==='GET'){
      const admin=requireAdmin(req,res);if(!admin)return;
      const q=escText(url.searchParams.get('q')||'',30);
      const like=`%${q}%`;
      const rows=db.prepare(`SELECT u.id,u.username,u.nickname,u.balance,u.created_at,u.is_admin,u.is_disabled,u.avatar,
        s.slot_spins,s.slot_profit,s.poker_hands,s.poker_wins,s.yut_games,s.yut_wins,s.seotda_games,s.seotda_wins,s.gostop_games,s.gostop_wins,s.horse_races,s.horse_wins,s.horse_profit,s.bigwheel_plays,s.bigwheel_wins,s.bigwheel_profit,s.sicbo_plays,s.sicbo_wins,s.sicbo_profit,
    s.seven_games,s.seven_wins,s.baccarat_games,s.baccarat_wins,s.baccarat_profit,s.roulette_plays,s.roulette_wins,s.roulette_profit
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
      const admin=requireAdmin(req,res);if(!admin)return;const list=[...rooms.values()].map(r=>roomSummary(r)).concat([...baccaratRooms.values()].map(baccaratSummary)).sort((a,b)=>b.updatedAt-a.updatedAt);return json(res,200,{rows:list});
    }
    if(url.pathname==='/api/admin/rooms/clear-waiting'&&req.method==='POST'){
      const admin=requireAdmin(req,res);if(!admin)return;let count=0;for(const r of [...rooms.values()]){if(roomStatus(r)==='WAITING'){closeRoomAndRefund(r,'관리자 대기실 정리 환급');count++;}}for(const r of [...baccaratRooms.values()]){if(r.phase!=='dealing'){baccaratClose(r);count++;}}return json(res,200,{ok:true,count});
    }
    const adminRoomClose=url.pathname.match(/^\/api\/admin\/rooms\/([A-F0-9]+)\/close$/);
    if(adminRoomClose&&req.method==='POST'){
      const admin=requireAdmin(req,res);if(!admin)return;const r=findRoom(adminRoomClose[1]);if(r){closeRoomAndRefund(r,'관리자 강제 종료 환급');return json(res,200,{ok:true});}const br=baccaratRooms.get(adminRoomClose[1]);if(br){baccaratClose(br);return json(res,200,{ok:true});}return json(res,404,{error:'방을 찾을 수 없습니다.'});
    }

    if(url.pathname==='/api/admin/slot-777-event'&&req.method==='GET'){
      const admin=requireAdmin(req,res);if(!admin)return;
      return json(res,200,{ok:true,active:slot777EventActive(),chance:SLOT_777_EVENT_CHANCE});
    }
    if(url.pathname==='/api/admin/slot-777-event'&&req.method==='POST'){
      const admin=requireAdmin(req,res);if(!admin)return;const b=await readBody(req);
      const active=b.active===false?false:true;
      gameStateSet('slot_777_event_active',active);pushRefresh();
      return json(res,200,{ok:true,active,chance:SLOT_777_EVENT_CHANCE});
    }
    if(url.pathname==='/api/slot/jackpot'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;return json(res,200,{pool:slotJackpotPool(),base:SLOT_JACKPOT_BASE});
    }
    if(url.pathname==='/api/slot/spin'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const b=await readBody(req),royalSlotUnlimited=Number(u.rank?.level||0)>=9;let bet;try{bet=b.useRankFree?1000:(royalSlotUnlimited?walletWager(b.bet,u.balance,1000,1000):gameWager(b.bet,1000,1000000000,1000))}catch(e){return json(res,400,{error:e.message})};
      const freePlay=consumeRankFreePlay(u.id,'slot',!!b.useRankFree);if(freePlay.free)bet=Number(socialRankPerksForUser(u.id).freeSlotBet||10000000);if(!freePlay.free&&u.balance<bet)return json(res,400,{error:'게임머니가 부족합니다.'});
      if(!freePlay.free)walletChange(u.id,-bet,'slot_bet',`슬롯 베팅 ${formatMoney(bet)}G`);
      const slotLuck=0;const pick=()=>{const weighted=SLOT_SYMBOLS,total=100;let n=(crypto.randomInt(1000000)/1000000)*total;for(const x of weighted){if(n<x.w)return x.s;n-=x.w;}return '🍒';};
      let grid=Array.from({length:3},()=>Array.from({length:3},()=>pick()));
      const slot777EventTriggered=slot777EventActive()&&(crypto.randomInt(1000000)/1000000)<SLOT_777_EVENT_CHANCE;
      if(slot777EventTriggered){
        const eventLine=SLOT_LINES[crypto.randomInt(SLOT_LINES.length)];
        for(const [r,c] of eventLine.cells)grid[r][c]='7️⃣';
      }
      const winLines=[];let totalMultiplier=0;
      for(const line of SLOT_LINES){
        const symbols=line.cells.map(([r,c])=>grid[r][c]);
        if(symbols.every(s=>s===symbols[0])){
          const mult=SLOT_MULT[symbols[0]]||0;if(mult>0){totalMultiplier+=mult;winLines.push({label:line.label,cssClass:line.cssClass,cells:line.cells,symbols,mult});}
        }
      }
      const hasJLine=winLines.some(w=>w.symbols?.[0]==='J');
      if(!hasJLine){
        const jCells=[];for(let r=0;r<3;r++)for(let c=0;c<3;c++)if(grid[r][c]==='J')jCells.push([r,c]);
        if(jCells.length){const scatterMult=jCells.length*2;totalMultiplier+=scatterMult;winLines.push({label:'J SCATTER',cssClass:null,cells:jCells,symbols:jCells.map(()=> 'J'),mult:scatterMult,scatter:true});}
      }
      if(winLines.filter(w=>!w.scatter).length>=3) totalMultiplier+=15;
      const regularPayout=Math.floor(bet*totalMultiplier);
      const sevenJackpot=winLines.some(w=>!w.scatter&&w.symbols?.[0]==='7️⃣');
      const jJackpot=winLines.some(w=>!w.scatter&&w.symbols?.[0]==='J');
      let jackpotAward=0,jackpotContribution=0,pool=slotJackpotPool();
      if(regularPayout>0)walletChange(u.id,regularPayout,'slot_win',`슬롯 당첨 x${totalMultiplier}`);
      if(sevenJackpot){
        jackpotAward=pool;if(jackpotAward>0)walletChange(u.id,jackpotAward,'slot_jackpot_pool',`777 누적 JACKPOT ${formatMoney(jackpotAward)}G`);
        pool=gameStateSet('slot_jackpot_pool',SLOT_JACKPOT_BASE);
        if(slot777EventActive())gameStateSet('slot_777_event_active',false);
      }else{
        const actualLoss=freePlay.free?0:Math.max(0,bet-regularPayout);jackpotContribution=Math.floor(actualLoss*.13);
        if(jackpotContribution>0)pool=gameStateSet('slot_jackpot_pool',pool+jackpotContribution);
      }
      const payout=regularPayout+jackpotAward,profit=payout-(freePlay.free?0:bet);
      db.prepare('UPDATE stats SET slot_spins=slot_spins+1, slot_wins=slot_wins+?, slot_profit=slot_profit+? WHERE user_id=?').run(payout>(freePlay.free?0:bet)?1:0,profit,u.id);if(sevenJackpot||slot777EventTriggered)pushRefresh();
      const jackpotLine=winLines.find(w=>!w.scatter&&(w.symbols?.[0]==='7️⃣'||w.symbols?.[0]==='J'));
      return json(res,200,{grid,bet,payout,regularPayout,profit,totalMultiplier,winLines,user:userPublic(u.id),jackpot:!!jackpotLine,jackpotSymbol:jackpotLine?.symbols?.[0]||null,poolJackpot:sevenJackpot,jackpotAward,jackpotContribution,jackpotPool:pool,jackpotBase:SLOT_JACKPOT_BASE,slotLuckPct:slotLuck,rankFreePlay:freePlay});
    }

    if(url.pathname==='/api/roulette/spin'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);try{const result=rouletteSpin(u,b.bets);return json(res,200,{result,user:userPublic(u.id)});}catch(e){return json(res,400,{error:e.message});}
    }

    // ---- Solo game routes ----
    if(url.pathname==='/api/solo/holdem/start'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);const r=soloPokerStart(u);return json(res,200,{room:personalizedRoom(r,u.id),user:userPublic(u.id)});}
    if(url.pathname==='/api/solo/holdem'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;const r=soloHoldem.get(u.id);return json(res,200,{room:r?personalizedRoom(r,u.id):null});}
    if(url.pathname==='/api/solo/holdem/action'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const r=soloHoldem.get(u.id);if(!r)return json(res,404,{error:'AI 홀덤 테이블이 없습니다.'});const b=await readBody(req);pokerAction(r,u.id,b.action,b.raiseTo);pokerBotDrive(r,u.id);return json(res,200,{room:personalizedRoom(r,u.id)});}
    if(url.pathname==='/api/solo/holdem/next'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const r=soloPokerNext(u.id);return json(res,200,{room:personalizedRoom(r,u.id)});}
    if(url.pathname==='/api/solo/holdem/leave'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const amount=soloPokerCashout(u.id);return json(res,200,{cashout:amount,user:userPublic(u.id)});}

    if(url.pathname==='/api/solo/yut/start'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);const game=soloYutStartGame(u,Number(b.bet));return json(res,200,{game,user:userPublic(u.id)});}
    if(url.pathname==='/api/solo/yut'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;const game=soloYut.get(u.id);return json(res,200,{game});}
    if(url.pathname==='/api/solo/yut/throw'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const s=soloYut.get(u.id);if(!s||s.phase!=='playing')return json(res,404,{error:'진행 중인 AI 윷놀이가 없습니다.'});if(s.turn!=='user')return json(res,409,{error:'지금은 J-BOT 차례입니다.'});if(!s.awaitingThrow)return json(res,409,{error:'먼저 움직일 말을 선택하세요.'});soloYutThrowFor(s,'user');return json(res,200,{game:s});}
    if(url.pathname==='/api/solo/yut/move'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const s=soloYut.get(u.id);if(!s)return json(res,404,{error:'AI 윷놀이가 없습니다.'});const b=await readBody(req);soloYutMoveSide(s,'user',Number(b.pieceIndex),Number(b.moveIndex||0),String(b.routeChoice||'shortcut'));if(s.phase==='complete'){settleSoloYut(u.id);}else{soloYutBotDrive(u.id);settleSoloYut(u.id);}return json(res,200,{game:s,user:userPublic(u.id)});}
    if(url.pathname==='/api/solo/yut/quit'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const s=soloYut.get(u.id);if(s&&!s.settled)escrowDelete(`SOLOY${u.id}`,u.id);soloYut.delete(u.id);if(s&&!s.settled)db.prepare('UPDATE stats SET yut_games=yut_games+1 WHERE user_id=?').run(u.id);return json(res,200,{ok:true,user:userPublic(u.id)});}

    if(url.pathname==='/api/solo/seotda/start'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);let game;try{game=soloSeotdaStart(u,Number(b.bet))}catch(e){return json(res,400,{error:e.message})}return json(res,200,{game:soloSeotdaPublic(game),user:userPublic(u.id)});}
    if(url.pathname==='/api/solo/seotda'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;return json(res,200,{game:soloSeotdaPublic(soloSeotda.get(u.id)||null)});}
    if(url.pathname==='/api/solo/seotda/draw'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;try{const game=soloSeotdaDraw(u.id);return json(res,200,{game:soloSeotdaPublic(game),user:userPublic(u.id)});}catch(e){return json(res,409,{error:e.message});}}
    if(url.pathname==='/api/solo/seotda/discard'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);try{const game=soloSeotdaDiscard(u.id,String(b.cardId||''),!!b.double);return json(res,200,{game:soloSeotdaPublic(game),user:userPublic(u.id)});}catch(e){return json(res,409,{error:e.message});}}
    if(url.pathname==='/api/solo/seotda/fold'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;try{const game=soloSeotdaFold(u.id);return json(res,200,{game:soloSeotdaPublic(game),user:userPublic(u.id)});}catch(e){return json(res,409,{error:e.message});}}
    if(url.pathname==='/api/solo/seotda/action'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);try{const game=soloSeotdaResolve(u.id,b.action,b.cardId);return json(res,200,{game:soloSeotdaPublic(game),user:userPublic(u.id)});}catch(e){return json(res,409,{error:e.message});}}
    if(url.pathname==='/api/solo/seotda/reset'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const s=soloSeotda.get(u.id);if(s&&s.phase!=='complete')return json(res,409,{error:'진행 중인 판은 초기화할 수 없습니다.'});soloSeotda.delete(u.id);return json(res,200,{ok:true});}

    if(url.pathname==='/api/solo/gostop/start'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);let game;try{game=soloGostopStart(u,Number(b.bet))}catch(e){return json(res,400,{error:e.message})}return json(res,200,{game:publicGostop(game),user:userPublic(u.id)});}
    if(url.pathname==='/api/solo/gostop'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;return json(res,200,{game:publicGostop(soloGostop.get(u.id)||null)});}
    if(url.pathname==='/api/solo/gostop/play'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);try{const game=b.action?soloGostopSpecial(u.id,String(b.action),Number(b.month)):soloGostopPlay(u.id,String(b.cardId||''),b.choiceId?String(b.choiceId):null);return json(res,200,{game:publicGostop(game),user:userPublic(u.id)});}catch(e){return json(res,409,{error:e.message,restartRequired:e.message==='진행 중인 맞고가 없습니다.'});}}
    if(url.pathname==='/api/solo/gostop/decision'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);try{const game=soloGostopDecision(u.id,b.decision);return json(res,200,{game:publicGostop(game),user:userPublic(u.id)});}catch(e){return json(res,409,{error:e.message,restartRequired:e.message==='진행 중인 맞고가 없습니다.'||e.message.includes('선택할 차례')});}}
    if(url.pathname==='/api/solo/gostop/reset'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const s=soloGostop.get(u.id);if(s&&s.phase!=='complete'){escrowDelete(`GOSTOP${u.id}`,u.id);walletChange(u.id,-Math.max(0,Number(s.bet||0)),'gostop_forfeit','야심찬 맞고 중도 종료');db.prepare('UPDATE stats SET gostop_games=gostop_games+1 WHERE user_id=?').run(u.id);}soloGostop.delete(u.id);return json(res,200,{ok:true,user:userPublic(u.id)});}


    if(url.pathname==='/api/bigwheel/spin'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);let result;
      try{result=bigWheelSpin(u.id,Number(b.bet),String(b.key||''),!!b.useRankFree);}catch(e){return json(res,400,{error:e.message});}
      pushRefresh();return json(res,200,{result,user:userPublic(u.id)});
    }
    if(url.pathname==='/api/sicbo/roll'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);let result;
      try{result=sicboRoll(u.id,Number(b.bet),String(b.key||''));}catch(e){return json(res,400,{error:e.message});}
      pushRefresh();return json(res,200,{result,user:userPublic(u.id)});
    }



    // Seven Poker AI
    if(url.pathname==='/api/solo/seven/start'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);try{const g=sevenStart(u);return json(res,200,{game:sevenPublic(g),user:userPublic(u.id)});}catch(e){return json(res,400,{error:e.message});}}
    if(url.pathname==='/api/solo/seven'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;return json(res,200,{game:sevenPublic(soloSeven.get(u.id)||null)});}
    if(url.pathname==='/api/solo/seven/action'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;const s=soloSeven.get(u.id);if(!s)return json(res,404,{error:'세븐포커 테이블이 없어.'});const b=await readBody(req);try{sevenAction(s,'user',String(b.action||''),b.raiseTo);sevenBotDrive(s);return json(res,200,{game:sevenPublic(s),user:userPublic(u.id)});}catch(e){return json(res,400,{error:e.message});}}
    if(url.pathname==='/api/solo/seven/next'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;try{const s=sevenNext(u.id);return json(res,200,{game:sevenPublic(s),user:userPublic(u.id)});}catch(e){return json(res,400,{error:e.message});}}
    if(url.pathname==='/api/solo/seven/leave'&&req.method==='POST'){const u=requireAuth(req,res);if(!u)return;try{const amount=sevenCashout(u.id);pushRefresh();return json(res,200,{cashout:amount,user:userPublic(u.id)});}catch(e){return json(res,409,{error:e.message});}}

    // Baccarat duel rooms
    if(url.pathname==='/api/baccarat/rooms'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;return json(res,200,{rooms:[...baccaratRooms.values()].map(baccaratSummary).sort((a,b)=>b.updatedAt-a.updatedAt)});}
    if(url.pathname==='/api/baccarat/rooms'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;if(findUserRoom(u.id)||baccaratFindUser(u.id)||treasureRaid.hasUser(u.id))return json(res,409,{error:'이미 참가 중인 게임방이 있어. 먼저 나가줘.'});const id=baccaratMakeId(),t=now();
      const r={id,game:'baccarat',name:`바카라 듀얼 ${id}`,hostId:u.id,phase:'waiting',stake:10000,roundNo:0,startBankerIndex:crypto.randomInt(2),players:[{userId:u.id,nickname:u.nickname,avatar:u.avatar,ready:false,auto:false,joinedAt:t}],result:null,createdAt:t,updatedAt:t,version:1};baccaratRooms.set(id,r);pushRefresh();return json(res,201,{room:baccaratPublic(r,u.id)});
    }
    const baccaratMatch=url.pathname.match(/^\/api\/baccarat\/rooms\/([A-F0-9]+)(?:\/(.*))?$/);
    if(baccaratMatch){
      const u=requireAuth(req,res);if(!u)return;const r=baccaratRooms.get(baccaratMatch[1]);if(!r)return json(res,404,{error:'바카라 방을 찾을 수 없어.'});const op=baccaratMatch[2]||'';
      if(!op&&req.method==='GET'){if(!baccaratPlayer(r,u.id))return json(res,403,{error:'이 바카라 방 참가자가 아니야.'});return json(res,200,{room:baccaratPublic(r,u.id)});}
      if(op==='join'&&req.method==='POST'){if(baccaratPlayer(r,u.id))return json(res,200,{room:baccaratPublic(r,u.id)});if(findUserRoom(u.id)||baccaratFindUser(u.id)||treasureRaid.hasUser(u.id))return json(res,409,{error:'이미 참가 중인 게임방이 있어.'});if(r.players.length>=2)return json(res,409,{error:'이미 두 명이 참가 중이야.'});r.players.push({userId:u.id,nickname:u.nickname,avatar:u.avatar,ready:false,auto:false,joinedAt:now()});r.stake=Math.max(1000,Math.min(10000,Math.floor(baccaratMaxStake(r))));r.phase='waiting';baccaratTouch(r);pushRefresh();return json(res,200,{room:baccaratPublic(r,u.id)});}
      if(op==='leave'&&req.method==='POST'){const p=baccaratPlayer(r,u.id);if(!p)return json(res,200,{ok:true});r.players=r.players.filter(x=>x.userId!==u.id);if(!r.players.length)baccaratRooms.delete(r.id);else{r.hostId=r.players[0].userId;r.phase='waiting';r.result=null;r.players[0].ready=false;r.players[0].auto=false;baccaratTouch(r);}pushRefresh();return json(res,200,{ok:true});}
      if(op==='ready'&&req.method==='POST'){const p=baccaratPlayer(r,u.id);if(!p)return json(res,403,{error:'참가자가 아니야.'});p.ready=!p.ready;baccaratTouch(r);pushRefresh();return json(res,200,{room:baccaratPublic(r,u.id)});}
      if(op==='auto'&&req.method==='POST'){const p=baccaratPlayer(r,u.id);if(!p)return json(res,403,{error:'참가자가 아니야.'});const b=await readBody(req);p.auto=!!b.enabled;if(p.auto)p.ready=true;baccaratTouch(r);pushRefresh();return json(res,200,{room:baccaratPublic(r,u.id)});}
      if(op==='stake'&&req.method==='POST'){if(r.hostId!==u.id)return json(res,403,{error:'방장만 베팅금을 정할 수 있어.'});if(r.players.length<2)return json(res,409,{error:'상대가 입장한 뒤 베팅금을 정할 수 있어.'});const b=await readBody(req),max=baccaratMaxStake(r);let stake=Math.floor(Number(b.stake));if(!Number.isSafeInteger(stake)||stake<1000)return json(res,400,{error:'베팅금은 1,000G 이상으로 입력해줘.'});if(stake>max)return json(res,400,{error:`현재 대전 최대 베팅은 ${formatMoney(max)}G야. (보유머니가 낮은 참가자 기준)`});r.stake=stake;r.players.forEach(p=>{if(!p.auto)p.ready=false});baccaratTouch(r);pushRefresh();return json(res,200,{room:baccaratPublic(r,u.id)});}
      if(op==='start'&&req.method==='POST'){if(r.hostId!==u.id)return json(res,403,{error:'방장만 딜을 시작할 수 있어.'});try{baccaratPlay(r);return json(res,200,{room:baccaratPublic(r,u.id),user:userPublic(u.id)});}catch(e){r.phase=r.result?'result':'waiting';return json(res,409,{error:e.message});}}
    }

    if(url.pathname==='/api/live'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;
      let game;try{game=liveGameKey(url.searchParams.get('game'))}catch(e){return json(res,400,{error:e.message})}
      const touched=liveFloorTouch(u,game);if(touched.isNew)pushRefresh();
      return json(res,200,{game,members:liveFloorMembers(game),selfId:u.id});
    }
    if(url.pathname==='/api/live/heartbeat'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);
      let game;try{game=liveGameKey(b.game)}catch(e){return json(res,400,{error:e.message})}
      const touched=liveFloorTouch(u,game,b.state);if(touched.isNew||touched.stateChanged)pushRefresh();
      return json(res,200,{ok:true,game,members:liveFloorMembers(game),joined:touched.isNew,stateChanged:touched.stateChanged});
    }
    if(url.pathname==='/api/live/reaction'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);
      let game;try{game=liveGameKey(b.game)}catch(e){return json(res,400,{error:e.message})}
      const key=String(b.key||''),def=ROOM_REACTIONS[key];if(!def||!reactionAllowed(u.id,key))return json(res,400,{error:'사용할 수 없는 말풍선입니다. 상점에서 말풍선 팩을 장착했는지 확인해줘.'});
      const map=cleanLiveFloor(game);let p=map.get(u.id);if(!p)p=liveFloorTouch(u,game).member;
      const t=now();if(p.reaction&&t-Number(p.reaction.at||0)<700)return json(res,429,{error:'말풍선은 잠깐 기다렸다가 다시 보내줘.'});
      p.reaction={key,emoji:def.emoji,label:def.label,at:t,expiresAt:t+5000};p.lastSeen=t;map.set(u.id,p);pushRefresh();
      return json(res,200,{ok:true,game,members:liveFloorMembers(game)});
    }
    if(url.pathname==='/api/live/leave'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);
      let game;try{game=liveGameKey(b.game)}catch(e){return json(res,400,{error:e.message})}
      const removed=liveFloorLeave(u.id,game);if(removed)pushRefresh();
      return json(res,200,{ok:true});
    }

    if(url.pathname==='/api/horse/meet'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;return json(res,200,{...horseMeetPublic(u.id),user:userPublic(u.id)});
    }
    if(url.pathname==='/api/horse/bet'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const b=await readBody(req);try{const out=horsePlaceBet(u,b);return json(res,200,{...out,user:userPublic(u.id)});}catch(e){return json(res,409,{error:e.message});}
    }
    if(url.pathname==='/api/horse/ready'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;try{const out=horseReady(u);return json(res,200,{...out,user:userPublic(u.id)});}catch(e){return json(res,409,{error:e.message});}
    }
    // Legacy endpoints are kept so an old cached PWA can still finish a race safely.
    if(url.pathname==='/api/horse/card'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;const card=horseCard();raceCards.set(u.id,card);return json(res,200,{card});
    }
    if(url.pathname==='/api/horse/race'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;const b=await readBody(req),card=raceCards.get(u.id);if(!card)return json(res,409,{error:'먼저 새 경주표를 받아주세요.'});
      let bet;try{bet=gameWager(b.bet,1000,100000,1000)}catch(e){return json(res,400,{error:e.message})};
      if(u.balance<bet)return json(res,400,{error:'게임머니가 부족합니다.'});const type=['win','quinella','exacta'].includes(b.type)?b.type:'win';const picks=Array.isArray(b.picks)?b.picks.map(Number):[];
      if((type==='win'&&picks.length<1)||(type!=='win'&&picks.length<2)||new Set(picks).size!==picks.length)return json(res,400,{error:'말 선택을 확인해주세요.'});
      walletChange(u.id,-bet,'horse_bet',`경마 ${type} 베팅 ${formatMoney(bet)}G`);const order=horseRun(card);const result=settleRace(u.id,bet,type,picks,card,order);raceCards.delete(u.id);pushRefresh();
      return json(res,200,{order:order.map((h,i)=>({id:h.id,name:h.name,color:h.color,coat:h.coat,finish:i+1})),result,user:userPublic(u.id)});
    }
    if(url.pathname==='/api/my-room'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;const r=findUserRoom(u.id);if(r)return json(res,200,{room:personalizedRoom(r,u.id)});const br=baccaratFindUser(u.id);return json(res,200,{room:br?baccaratPublic(br,u.id):null});
    }
    if(url.pathname==='/api/rooms'&&req.method==='GET'){
      const u=requireAuth(req,res);if(!u)return;const game=url.searchParams.get('game');const list=[...rooms.values()].filter(r=>!game||r.game===game).map(roomSummary).sort((a,b)=>a.status.localeCompare(b.status));return json(res,200,{rooms:list});
    }
    if(url.pathname==='/api/rooms'&&req.method==='POST'){
      const u=requireAuth(req,res);if(!u)return;if(findUserRoom(u.id)||baccaratFindUser(u.id)||treasureRaid.hasUser(u.id))return json(res,409,{error:'이미 다른 게임방에 참가 중입니다. 먼저 그 방에서 나와주세요.'});const b=await readBody(req),requested=String(b.game||'holdem'),game=['holdem','yut','seotda','sevenpoker','gostop'].includes(requested)?requested:'holdem';
      const yutMode=game==='yut'&&['individual','2v2','3v3'].includes(b.yutMode)?b.yutMode:'individual';const maxPlayers=(game==='holdem'||game==='sevenpoker')?clampInt(b.maxPlayers,2,6):game==='yut'?(yutMode==='2v2'?4:yutMode==='3v3'?6:clampInt(b.maxPlayers,2,6)):2;const chipGame=game==='holdem'||game==='sevenpoker';let buyIn;try{buyIn=chipGame?Math.floor(Number(u.balance||0)):game==='seotda'?walletWager(b.buyIn,u.balance,5000,1000):game==='gostop'?gameWager(b.buyIn,5000,Number.MAX_SAFE_INTEGER,1000):gameWager(b.buyIn,5000,100000,1000)}catch(e){return json(res,400,{error:e.message})};
      if(!Number.isSafeInteger(buyIn)||buyIn<1000)return json(res,400,{error:'포커 테이블 입장에는 최소 1,000G가 필요합니다.'});if(u.balance<buyIn)return json(res,400,{error:'방 참가금보다 보유 게임머니가 적습니다.'});
      const id=makeRoomId();const name=game==='holdem'?`홀덤 테이블 ${id}`:game==='yut'?`윷놀이 방 ${id}`:game==='seotda'?`3장 섯다 듀얼 ${id}`:game==='gostop'?`맞고 대전방 ${id}`:`세븐포커 테이블 ${id}`;walletChange(u.id,-buyIn,`${game}_buyin`,chipGame?`${name} 전액 스택 입장`:`${name} 참가금`);
      const t=now(),sb=game==='holdem'?Math.max(1000,Math.min(50000,Math.floor((buyIn*.002)/1000)*1000||1000)):0;const r={id,name,game,buyIn,maxPlayers,allWallet:chipGame,hostId:u.id,smallBlind:sb,bigBlind:game==='holdem'?sb*2:0,players:[{userId:u.id,nickname:u.nickname,avatar:u.avatar,seat:0,stack:chipGame?buyIn:0,ready:false,joinedAt:t}],createdAt:t,updatedAt:t,version:1,hand:null,seven:null,seotda:null,gostop:null,yut:null,yutMode,dealerSeat:null,reactions:{}};
      rooms.set(id,r);escrowSet(id,u.id,buyIn,game);pushRefresh(id);return json(res,201,{room:personalizedRoom(r,u.id)});
    }
    const roomMatch=url.pathname.match(/^\/api\/rooms\/([A-F0-9]+)(?:\/(.*))?$/);
    if(roomMatch){
      const u=requireAuth(req,res);if(!u)return;const r=findRoom(roomMatch[1]);if(!r)return json(res,404,{error:'방을 찾을 수 없습니다.'});const op=roomMatch[2]||'';
      if(!op&&req.method==='GET')return json(res,200,{room:personalizedRoom(r,u.id)});
      if(op==='ready'&&req.method==='POST'){
        if(roomStatus(r)==='PLAYING')return json(res,409,{error:'게임 진행 중에는 준비 상태를 바꿀 수 없습니다.'});
        const p=roomPlayer(r,u.id);if(!p)return json(res,403,{error:'이 방 참가자가 아닙니다.'});p.ready=!p.ready;
        if(r.game==='seotda'&&r.seotda?.phase==='complete'&&r.players.length===2&&r.players.every(x=>x.ready)){
          try{seotdaMultiRematch(r);}catch(e){p.ready=false;touchRoom(r);pushRefresh(r.id);return json(res,409,{error:e.message,room:personalizedRoom(r,u.id)});}
        }else if(r.game==='gostop'&&r.gostop?.phase==='complete'&&r.players.length===2&&r.players.every(x=>x.ready)){
          try{for(const rp of r.players){const pu=userPublic(rp.userId);if(!pu||pu.balance<r.buyIn)throw new Error(`${rp.nickname}의 게임머니가 부족합니다.`)}for(const rp of r.players){walletChange(rp.userId,-r.buyIn,'gostop_rebuy',`${r.name} 재경기 참가금`);escrowSet(r.id,rp.userId,r.buyIn,'gostop')}roomGostopStart(r);touchRoom(r);}catch(e){p.ready=false;touchRoom(r);pushRefresh(r.id);return json(res,409,{error:e.message,room:personalizedRoom(r,u.id)});}
        }else touchRoom(r);
        pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});
      }
      if(op==='reaction'&&req.method==='POST'){
        const p=roomPlayer(r,u.id);if(!p)return json(res,403,{error:'이 방 참가자가 아닙니다.'});
        const b=await readBody(req),key=String(b.key||'');const def=ROOM_REACTIONS[key];
        if(!def||!reactionAllowed(u.id,key))return json(res,400,{error:'사용할 수 없는 말풍선입니다. 상점에서 말풍선 팩을 장착했는지 확인해줘.'});
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
        if(roomPlayer(r,u.id))return json(res,200,{room:personalizedRoom(r,u.id)});if(findUserRoom(u.id)||baccaratFindUser(u.id)||treasureRaid.hasUser(u.id))return json(res,409,{error:'이미 다른 게임방에 참가 중입니다. 먼저 그 방에서 나와주세요.'});if(roomStatus(r)==='PLAYING')return json(res,409,{error:'게임 진행 중에는 입장할 수 없습니다.'});if(r.players.length>=r.maxPlayers)return json(res,409,{error:'방이 가득 찼습니다.'});const chipGame=r.game==='holdem'||r.game==='sevenpoker',entry=chipGame?Math.floor(Number(u.balance||0)):r.buyIn;if(entry<1000||u.balance<entry)return json(res,400,{error:'게임머니가 부족합니다.'});
        walletChange(u.id,-entry,`${r.game}_buyin`,chipGame?`${r.name} 전액 스택 입장`:`${r.name} 참가금`);r.players.push({userId:u.id,nickname:u.nickname,avatar:u.avatar,seat:nextSeat(r),stack:chipGame?entry:0,ready:false,joinedAt:now()});escrowSet(r.id,u.id,entry,r.game);touchRoom(r);pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});
      }
      if(op==='leave'&&req.method==='POST'){
        const p=roomPlayer(r,u.id);if(!p)return json(res,200,{ok:true});if(roomStatus(r)==='PLAYING')return json(res,409,{error:'게임 진행 중에는 나갈 수 없습니다.'});
        const refund=(r.game==='holdem'||r.game==='sevenpoker')?Math.max(0,p.stack):(r.game==='seotda'?(r.seotda?.phase==='complete'?0:r.buyIn):r.game==='gostop'?(r.gostop?.phase==='complete'?0:r.buyIn):(r.yut?.phase==='complete'?0:r.buyIn)); if(refund>0)walletChange(u.id,refund,`${r.game}_cashout`,`${r.name} 퇴장 환급`);escrowDelete(r.id,u.id);r.players=r.players.filter(x=>x.userId!==u.id);
        if(!r.players.length)rooms.delete(r.id);else {if(r.hostId===u.id)r.hostId=r.players[0].userId;touchRoom(r);}pushRefresh(r.id);return json(res,200,{ok:true});
      }
      if(op==='start'&&req.method==='POST'){
        if(r.hostId!==u.id)return json(res,403,{error:'방장만 시작할 수 있습니다.'});
        if(r.players.length<2)return json(res,409,{error:'최소 2명이 입장해야 시작할 수 있습니다.'});
        const notReady=r.players.filter(p=>!p.ready);if(notReady.length)return json(res,409,{error:`아직 준비하지 않은 참가자: ${notReady.map(p=>p.nickname).join(', ')}`});
        if(r.game==='holdem'){if(r.hand&&r.hand.phase!=='complete')return json(res,409,{error:'이미 핸드가 진행 중입니다.'});pokerStart(r);}else if(r.game==='sevenpoker'){
          try{sevenMStart(r);}catch(e){return json(res,409,{error:e.message});}
        }else if(r.game==='seotda'){
          if(r.seotda&&r.seotda.phase!=='complete')return json(res,409,{error:'이미 섯다 승부가 진행 중입니다.'});
          if(r.seotda?.phase==='complete'){
            try{seotdaMultiRematch(r);}catch(e){return json(res,409,{error:e.message});}
          }else seotdaMultiStart(r);
        }else if(r.game==='gostop'){
          if(r.gostop&&r.gostop.phase!=='complete')return json(res,409,{error:'이미 맞고가 진행 중입니다.'});
          if(r.gostop?.phase==='complete'){for(const p of r.players){const pu=userPublic(p.userId);if(!pu||pu.balance<r.buyIn)return json(res,409,{error:`${p.nickname}의 게임머니가 부족합니다.`})}for(const p of r.players){walletChange(p.userId,-r.buyIn,'gostop_rebuy',`${r.name} 재경기 참가금`);escrowSet(r.id,p.userId,r.buyIn,'gostop')}}
          roomGostopStart(r);
        }else{
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
      if(op==='seven/action'&&req.method==='POST'){
        if(r.game!=='sevenpoker')return json(res,400,{error:'세븐포커 방이 아닙니다.'});const b=await readBody(req);try{sevenMAction(r,u.id,String(b.action||''),b.raiseTo);touchRoom(r);pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});}catch(e){return json(res,409,{error:e.message});}
      }
      if(op==='seotda/draw'&&req.method==='POST'){
        if(r.game!=='seotda')return json(res,400,{error:'섯다 방이 아닙니다.'});try{seotdaMultiDraw(r,u.id);touchRoom(r);pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});}catch(e){return json(res,409,{error:e.message});}
      }
      if(op==='seotda/discard'&&req.method==='POST'){
        if(r.game!=='seotda')return json(res,400,{error:'섯다 방이 아닙니다.'});const b=await readBody(req);try{seotdaMultiDiscard(r,u.id,String(b.cardId||''));touchRoom(r);pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});}catch(e){return json(res,409,{error:e.message});}
      }
      if(op==='gostop/play'&&req.method==='POST'){
        if(r.game!=='gostop')return json(res,400,{error:'맞고 방이 아닙니다.'});const b=await readBody(req);try{roomGostopPlay(r,u.id,String(b.cardId||''),b.choiceId?String(b.choiceId):null,b.action?String(b.action):null,b.month);touchRoom(r);pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});}catch(e){return json(res,409,{error:e.message});}
      }
      if(op==='gostop/decision'&&req.method==='POST'){
        if(r.game!=='gostop')return json(res,400,{error:'맞고 방이 아닙니다.'});const b=await readBody(req);try{roomGostopDecision(r,u.id,String(b.decision||''));touchRoom(r);pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});}catch(e){return json(res,409,{error:e.message});}
      }
      if(op==='yut/throw'&&req.method==='POST'){
        if(r.game!=='yut')return json(res,400,{error:'윷놀이 방이 아닙니다.'});const result=yutThrow(r,u.id);touchRoom(r);pushRefresh(r.id);return json(res,200,{result,room:personalizedRoom(r,u.id)});
      }
      if(op==='yut/move'&&req.method==='POST'){
        if(r.game!=='yut')return json(res,400,{error:'윷놀이 방이 아닙니다.'});const b=await readBody(req);yutMove(r,u.id,b.pieceIndex,b.moveIndex||0,String(b.routeChoice||'shortcut'));touchRoom(r);pushRefresh(r.id);return json(res,200,{room:personalizedRoom(r,u.id)});
      }
    }

    if(url.pathname.startsWith('/api/'))return json(res,404,{error:'API를 찾을 수 없습니다.'});
    return serveStatic(req,res,url);
  }catch(e){console.error(e); if(!res.headersSent)json(res,500,{error:e.message||'서버 오류가 발생했습니다.'});else try{res.end()}catch{}}
});

server.listen(PORT,HOST,()=>console.log(`JUNJA GAME CLUB listening on http://${HOST}:${PORT}`));

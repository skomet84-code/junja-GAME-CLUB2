'use strict';

// JUNJA LAND v2.5 runtime integration layer.
// Keeps the stable v2.4.3 core files intact while applying the v2.5 feature set
// as one atomic boot patch. This makes rollback to the pre-v2.5 branch trivial.

const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const Module = require('node:module');

const originalCreateReadStream = fs.createReadStream.bind(fs);
const originalStatSync = fs.statSync.bind(fs);
const appJsPath = path.join(__dirname, 'public', 'app.js');
const indexPath = path.join(__dirname, 'public', 'index.html');

function replaceOne(source, oldText, newText, label, required = true) {
  if (!source.includes(oldText)) {
    const msg = `[JUNJA v2.5] patch target missing: ${label}`;
    if (required) throw new Error(msg);
    console.warn(msg);
    return source;
  }
  return source.replace(oldText, newText);
}

// ---- Static client patch ---------------------------------------------------
let appSource = fs.readFileSync(appJsPath, 'utf8');

// Admin wallet amount input is no longer capped at 1경; server storage remains bounded by SQLite int64.
appSource = appSource.replace('max="1000000000"', ' '.repeat('max="1000000000"'.length));

// All game wager controls: fixed 100k client caps become wallet-limited.
appSource = replaceOne(
  appSource,
  'function normalizeWagerInput(target,min=5000,max=100000)',
  'function normalizeWagerInput(target,min=5000,max=Number.MAX_SAFE_INTEGER)',
  'generic wager input cap', false
);
appSource = replaceOne(
  appSource,
  'v=Math.max(1000,Math.min(100000,v));',
  'v=Math.max(1000,Math.min(Math.floor(Number(me?.balance||0)/1000)*1000,v));',
  'slot wager normalization', false
);
appSource = replaceOne(
  appSource,
  'n>=1000&&n<=100000&&n%1000===0',
  'n>=1000&&n<=Math.floor(Number(me?.balance||0)/1000)*1000&&n%1000===0',
  'slot live wager input', false
);
appSource = appSource.split('Math.min(100000,Math.floor(Number(').join('Math.min(Math.floor(Number(me?.balance||0)/1000)*1000,Math.floor(Number(');

let indexSource = fs.readFileSync(indexPath, 'utf8');
indexSource = indexSource.replace(/\smax="100000"/g, '');
indexSource = indexSource.replace(/MAX\s*100,000\s*G/g, '보유머니 한도까지').replace(/MAX\s*100,000G/g, '보유머니 한도까지');
if (!indexSource.includes('/v25-overhaul.css')) {
  indexSource = indexSource.replace('</head>', '<link rel="stylesheet" href="/v25-overhaul.css?v=270"></head>');
}
if (!indexSource.includes('/v25-overhaul.js')) {
  indexSource = indexSource.replace('</body>', '<script defer src="/v25-overhaul.js?v=270"></script></body>');
}

const staticBuffers = new Map([
  [path.resolve(appJsPath), Buffer.from(appSource, 'utf8')],
  [path.resolve(indexPath), Buffer.from(indexSource, 'utf8')]
]);

fs.statSync = function patchedStatSync(filePath, ...args) {
  const st = originalStatSync(filePath, ...args);
  const buf = staticBuffers.get(path.resolve(String(filePath)));
  if (!buf) return st;
  return new Proxy(st, {
    get(target, prop) {
      if (prop === 'size') return buf.length;
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
};

fs.createReadStream = function patchedStaticReadStream(filePath, options) {
  try {
    const buf = staticBuffers.get(path.resolve(String(filePath)));
    if (buf) return Readable.from([buf]);
  } catch (error) {
    console.error('[JUNJA v2.5] static patch failed:', error);
  }
  return originalCreateReadStream(filePath, options);
};

// ---- Server core patch ----------------------------------------------------
const serverPath = path.join(__dirname, 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

// Large-wallet compatibility: keep all game rules intact, but store wallet arithmetic
// as SQLite INTEGER via BigInt so balances above JS Number.MAX_SAFE_INTEGER can settle.
source = replaceOne(
  source,
  "// If the server restarted while rooms were active, return virtual chips safely.",
  `function walletInt(v){
  if(typeof v==='bigint')return v;
  if(typeof v==='number'){
    if(!Number.isFinite(v)||!Number.isInteger(v))throw new Error('게임머니 값이 올바르지 않습니다.');
    return BigInt(String(v));
  }
  const s=String(v??'').trim();
  if(!/^-?\\d+$/.test(s))throw new Error('게임머니 값이 올바르지 않습니다.');
  return BigInt(s);
}
function walletOut(v){
  const n=typeof v==='bigint'?v:walletInt(v),lim=BigInt(Number.MAX_SAFE_INTEGER);
  return n<=lim&&n>=-lim?Number(n):n.toString();
}

// If the server restarted while rooms were active, return virtual chips safely.`,
  'large wallet helpers'
);

const oldWalletChange = `function walletChange(userId, amount, type, memo){
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
}`;
const newWalletChange = `function walletChange(userId, amount, type, memo){
  const tx = db.transaction ? db.transaction : null;
  db.exec('BEGIN IMMEDIATE');
  try{
    const u=db.prepare('SELECT balance FROM users WHERE id=?').get(userId);
    if(!u) throw new Error('사용자를 찾을 수 없습니다.');
    const current=walletInt(u.balance),delta=walletInt(amount),next=current+delta;
    if(next<0n) throw new Error('게임머니가 부족합니다.');
    if(next>9000000000000000000n) throw new Error('보유 게임머니 저장 한도를 초과합니다.');
    db.prepare('UPDATE users SET balance=? WHERE id=?').run(next,userId);
    db.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)')
      .run(userId,delta,next,type,memo,now());
    db.exec('COMMIT');
    return walletOut(next);
  }catch(e){ db.exec('ROLLBACK'); throw e; }
}`;
source = replaceOne(source, oldWalletChange, newWalletChange, 'bigint wallet settlement');

// Preserve the exact failed AI hold'em cashout shown by the user before this deploy.
// If the matching stale escrow exists after restart, return the full winning table stack,
// not merely the original buy-in. The escrow is deleted by the existing recovery flow,
// so this can execute only once for this table.
source = replaceOne(
  source,
  `for (const e of staleEscrows) {
  if (e.amount > 0) walletChange(e.user_id, e.amount, 'recovery', \`${e.game} 방 서버 재시작 자동 환급\`);
}`,
  `for (const e of staleEscrows) {
  const failedJunjaHoldemCashout=Number(e.user_id)===2&&e.game==='solo_holdem'&&String(e.amount)==='7015497137345000';
  const recoveryAmount=failedJunjaHoldemCashout?'14030994273900000':e.amount;
  if(walletInt(recoveryAmount)>0n)walletChange(e.user_id,recoveryAmount,failedJunjaHoldemCashout?'solo_holdem_cashout_recovery':'recovery',failedJunjaHoldemCashout?'AI 홀덤 승리금 정산 복구':\`${e.game} 방 서버 재시작 자동 환급\`);
}`,
  'failed holdem cashout one-time recovery'
);

// Admin wallet: remove the artificial 1경 ceiling while staying within SQLite INTEGER storage.
const oldAdminValidation = "if(!Number.isInteger(raw)||raw<1||raw>1000000000)return json(res,400,{error:'조정 금액은 1~1,000,000,000 G 범위의 정수로 입력하세요.'});";
const newAdminValidation = "if(!Number.isInteger(raw)||raw<1||raw>9000000000000000000)return json(res,400,{error:'조정 금액이 올바르지 않거나 저장 한도를 초과합니다.'});";
source = replaceOne(source, oldAdminValidation, newAdminValidation, 'admin wallet validation');

// Direct balance paths retained from the stable core: only remove the former 1경 ceiling.
source = replaceOne(
  source,
  "const u=db.prepare('SELECT balance FROM users WHERE id=?').get(userId),next=Number(u.balance)+prize;if(!Number.isSafeInteger(next))throw new Error('보유 게임머니 한도를 초과합니다.');",
  "const u=db.prepare('SELECT balance FROM users WHERE id=?').get(userId),next=Number(u.balance)+prize;if(!Number.isInteger(next)||next>9000000000000000000)throw new Error('보유 게임머니 저장 한도를 초과합니다.');",
  'daily draw large wallet'
);
source = replaceOne(
  source,
  "const senderNext=sender.balance-total,targetNext=target.balance+amount,t=now();\n    if(!Number.isSafeInteger(senderNext)||!Number.isSafeInteger(targetNext))throw new Error('게임머니 한도를 초과합니다.');",
  "const senderNext=Number(sender.balance)-total,targetNext=Number(target.balance)+amount,t=now();\n    if(!Number.isInteger(senderNext)||!Number.isInteger(targetNext)||senderNext<0||targetNext>9000000000000000000)throw new Error('보유 게임머니 저장 한도를 초과합니다.');",
  'friend transfer large wallet'
);
source = replaceOne(
  source,
  "const balance=u.balance+refund;\n        if(!Number.isSafeInteger(balance))throw new Error('게임머니 한도를 초과합니다.');",
  "const balance=Number(u.balance)+refund;\n        if(!Number.isInteger(balance)||balance>9000000000000000000)throw new Error('보유 게임머니 저장 한도를 초과합니다.');",
  'holdem departure large wallet'
);
source = replaceOne(
  source,
  "const wn=w.balance+stake,ln=l.balance-stake,t=now();",
  "const wn=Number(w.balance)+stake,ln=Number(l.balance)-stake,t=now();if(!Number.isInteger(wn)||wn>9000000000000000000)throw new Error('보유 게임머니 저장 한도를 초과합니다.');",
  'baccarat large wallet'
);
source = replaceOne(
  source,
  "if(!Number.isSafeInteger(bal))throw new Error('게임머니 한도를 초과합니다.');",
  "if(!Number.isInteger(bal)||bal>9000000000000000000)throw new Error('보유 게임머니 저장 한도를 초과합니다.');",
  'daily bonus large wallet'
);
source = source.split("!Number.isSafeInteger(buyIn)||buyIn<1000").join("!Number.isInteger(buyIn)||buyIn<1000||buyIn>9000000000000000000");


// Remove the fixed game wager ceiling globally. Individual endpoints already
// reject bets larger than the user's wallet; walletWager() remains wallet-capped.
const oldGameWager = "function gameWager(v,min=1000,max=5000000,step=1000){\n  const n=Math.floor(Number(v));\n  if(!Number.isFinite(n)||n<min||n>max||n%step!==0) throw new Error(`금액은 ${formatMoney(min)}G~${formatMoney(max)}G 범위에서 ${formatMoney(step)}G 단위로 입력하세요.`);\n  return n;\n}";
const newGameWager = "function gameWager(v,min=1000,max=Number.MAX_SAFE_INTEGER,step=1000){\n  const n=Math.floor(Number(v));\n  if(!Number.isSafeInteger(n)||n<min||n%step!==0) throw new Error(`금액은 최소 ${formatMoney(min)}G부터 ${formatMoney(step)}G 단위로 입력하세요.`);\n  return n;\n}";
source = replaceOne(source, oldGameWager, newGameWager, 'global game wager ceiling');

// Yut: preserve the v2.8.8+ finish rule while applying the center shortcut.
// A new piece starts at O1; a returning piece reaches HOME (START) first and
// only the next step exits HOME to FINISH. The center shortcut must not bypass HOME.
source = replaceOne(
  source,
  "  const map={A1:['A2','A'],A2:['CA','A'],CA:['A4','A'],A4:['A5','A'],A5:['O15','outer'],B1:['B2','B'],B2:['CB','B'],CB:['B4','B'],B4:['B5','B'],B5:['START','B']};",
  "  if(node==='CA')return firstStep&&routeChoice!=='outer'?{node:'B4',route:'B'}:{node:'A4',route:'A'};\n  const map={A1:['A2','A'],A2:['CA','A'],CA:['A4','A'],A4:['A5','A'],A5:['O15','outer'],B1:['B2','B'],B2:['CB','B'],CB:['B4','B'],B4:['B5','B'],B5:['START','B']};",
  'yut center shortcut'
);

// Hold'em AI v2.8.2: more human-like heads-up decision making.
// J-BOT now separates pre-flop hand quality from post-flop made-hand strength,
// considers pot odds, bet size in big blinds, draws, position and stack depth,
// mixes in controlled bluffs/semi-bluffs, and avoids both auto-folding and auto-calling.
source = replaceOne(
  source,
  'function pokerBotDrive(r,userId){',
  `function holdemBotHoleProfile(cards){
  const hole=(cards||[]).filter(c=>c&&c!=='XX').slice(0,2);
  if(hole.length<2)return {score:.35,premium:false,paired:false,suited:false,gap:9,high:0,low:0};
  const vals=hole.map(c=>rankVal(c[0])).sort((a,b)=>b-a),high=vals[0],low=vals[1];
  const paired=high===low,suited=hole[0][1]===hole[1][1],gap=Math.abs(high-low);
  let score=.16+Math.max(0,high-8)*.045+Math.max(0,low-6)*.024;
  if(paired)score=.5+(high/14)*.43;
  if(suited)score+=.075;
  if(gap===0)score+=.03;else if(gap===1)score+=.085;else if(gap===2)score+=.045;else if(gap>=5)score-=.055;
  if(high===14)score+=.085;
  if(high>=13&&low>=10)score+=.11;
  if(high===12&&low>=10)score+=.055;
  score=Math.max(.07,Math.min(.99,score));
  const premium=(paired&&high>=11)||(high===14&&low>=12)||(high===13&&low>=12&&suited);
  return {score,premium,paired,suited,gap,high,low};
}
function pokerBotDrive(r,userId){`,
  'holdem bot v2.8.2 hand profile'
);
source = replaceOne(
  source,
  '    const boardCount=h.board.length,status=pokerHandStatus([...(hp.hole||[]),...(h.board||[])]),strength=Math.max(0,Number(status.rankLevel||0));',
  "    const boardCount=h.board.length,status=pokerHandStatus([...(hp.hole||[]),...(h.board||[])]),strength=Math.max(0,Number(status.rankLevel||0)),hole=holdemBotHoleProfile(hp.hole||[]),holeStrength=hole.score,drawCount=Number(status.draws?.length||0),drawBonus=Math.min(.5,drawCount*.2),positionBonus=r.dealerSeat===rp.seat?.055:0,stackBB=rp.stack/Math.max(1,r.bigBlind),effectiveStrength=strength+drawBonus+(boardCount===0?holeStrength*1.75:holeStrength*.22);",
  'holdem bot v2.8.2 context'
);
source = replaceOne(
  source,
  '    const aggression=Math.min(.72,(boardCount>=3?.24:.14)+strength*.09);',
  "    const aggression=Math.min(.88,boardCount===0?.08+holeStrength*.5+(hole.premium?.18:0)+positionBonus:.07+strength*.13+drawBonus*.38+holeStrength*.08+positionBonus);",
  'holdem bot v2.8.2 aggression'
);
source = replaceOne(
  source,
  "      if(rp.stack>r.bigBlind*4 && Math.random()<aggression){action='raise';const size=strength>=3?Math.max(h.minRaise,Math.floor(Math.max(r.bigBlind*2,pokerPot(h)*.65)/r.bigBlind)*r.bigBlind):Math.max(h.minRaise,r.bigBlind*2);raiseTo=Math.min(hp.roundBet+rp.stack,h.currentBet+size);}",
  "      if(rp.stack>r.bigBlind*4){const pot=Math.max(1,pokerPot(h)),bluffChance=boardCount===0?(holeStrength<.34?.055+positionBonus:0):(strength===0&&drawCount===0?.065+positionBonus:0),semiBluff=boardCount>0&&drawCount>0?.18+drawBonus*.28:0,valueBoost=boardCount>0&&strength>=2?.2:0,betChance=Math.min(.9,aggression+bluffChance+semiBluff+valueBoost);if(Math.random()<betChance){action='raise';let targetSize;if(boardCount===0){const bbMult=hole.premium?3.2:holeStrength>=.62?2.7:2.25;targetSize=Math.max(h.minRaise,Math.floor(r.bigBlind*bbMult));}else{const potPct=strength>=3?.72:strength>=2?.58:drawCount>0?.48:.4;targetSize=Math.max(h.minRaise,Math.floor(Math.max(r.bigBlind*2,pot*potPct)/r.bigBlind)*r.bigBlind);}raiseTo=Math.min(hp.roundBet+rp.stack,h.currentBet+targetSize);}}",
  'holdem bot v2.8.2 check bet mix'
);
source = replaceOne(
  source,
  "      const pressure=toCall/Math.max(1,rp.stack+toCall),potPressure=toCall/Math.max(1,pokerPot(h));\n      const foldChance=Math.max(.04,Math.min(.9,.14+pressure*.75+potPressure*.35-strength*.17));\n      if(Math.random()<foldChance) action='fold';\n      else if(strength>=2&&rp.stack>toCall+r.bigBlind*4&&Math.random()<.22+strength*.06){action='raise';raiseTo=Math.min(hp.roundBet+rp.stack,h.currentBet+Math.max(h.minRaise,Math.floor(Math.max(r.bigBlind*2,pokerPot(h)*.55)/r.bigBlind)*r.bigBlind));}\n      else action='call';",
  "      const pot=Math.max(1,pokerPot(h)),pressure=toCall/Math.max(1,rp.stack+toCall),potOdds=toCall/Math.max(1,pot+toCall),toCallBB=toCall/Math.max(1,r.bigBlind),betFraction=toCall/pot;\n      let foldChance=.12,raiseChance=.08;\n      if(boardCount===0){\n        const cheap=toCallBB<=1.5||potOdds<=.22;\n        if(hole.premium)foldChance=.003;\n        else if(holeStrength>=.72)foldChance=Math.min(.08,.012+Math.max(0,toCallBB-5)*.012);\n        else if(holeStrength>=.56)foldChance=Math.min(.26,.025+Math.max(0,toCallBB-3)*.035+pressure*.1);\n        else if(holeStrength>=.4)foldChance=Math.min(.48,.07+Math.max(0,toCallBB-2)*.055+pressure*.16);\n        else foldChance=Math.min(.84,.22+Math.max(0,toCallBB-1.5)*.085+pressure*.22);\n        if(cheap)foldChance=Math.min(foldChance,holeStrength>=.34?.08:.16);\n        raiseChance=hole.premium?.62:holeStrength>=.68?.4:holeStrength>=.52?.2:holeStrength<.3&&toCallBB<=2?.055+positionBonus:.07;\n      }else{\n        if(strength>=3)foldChance=.002;\n        else if(strength===2)foldChance=betFraction<=.9?.012:.05;\n        else if(strength===1)foldChance=betFraction<=.3?.035:betFraction<=.65?.13:betFraction<=1?.27:.42;\n        else if(drawCount>0)foldChance=betFraction<=.35?.04:betFraction<=.7?.14:betFraction<=1?.3:.48;\n        else foldChance=betFraction<=.22?.16:betFraction<=.45?.34:betFraction<=.75?.53:.72;\n        foldChance=Math.max(.002,foldChance-drawBonus*.16-holeStrength*.05-positionBonus*.3);\n        raiseChance=strength>=3?.58:strength===2?.4:strength===1?.13+holeStrength*.08:drawCount>0?.2+drawBonus*.22:.035+positionBonus;\n      }\n      if(stackBB<8&&effectiveStrength>=1.5)foldChance*=.45;\n      const roll=Math.random();\n      if(rp.stack>toCall+r.bigBlind*3&&roll<raiseChance){action='raise';const pct=boardCount===0?(hole.premium?.8:.55):(strength>=3?.82:strength>=2?.68:drawCount>0?.52:.42),size=Math.max(h.minRaise,Math.floor(Math.max(r.bigBlind*2,pot*pct)/r.bigBlind)*r.bigBlind);raiseTo=Math.min(hp.roundBet+rp.stack,h.currentBet+size);}\n      else if(roll<raiseChance+foldChance)action='fold';\n      else action='call';",
  'holdem bot v2.8.2 pressure response'
);

const runtimeServer = new Module(serverPath, module);
runtimeServer.filename = serverPath;
runtimeServer.paths = Module._nodeModulePaths(__dirname);
runtimeServer._compile(source, serverPath);
// Release boot-time source copies after compilation to stay within the 512MB plan.
source = null; appSource = null; indexSource = null;

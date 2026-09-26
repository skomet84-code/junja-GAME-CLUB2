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

// Previous one-time hold'em payout repair has been retired; future deploys must not modify balances.

// Safety guard for the known Render overlap artifact only.
// It fires solely on the exact duplicated wallet value observed in deployment logs.
source = replaceOne(
  source,
  "db.exec('DELETE FROM room_escrow');",
  "db.exec('DELETE FROM room_escrow');\nconst overlapDup=28061988547800000n,overlapTarget=14030994273900000n;\nconst overlapUser=db.prepare(\"SELECT id,balance FROM users WHERE id=2 AND username='junja_admin'\").get();\nif(overlapUser&&walletInt(overlapUser.balance)===overlapDup){\n  const delta=overlapTarget-overlapDup;\n  walletChange(overlapUser.id,delta,'deploy_overlap_repair','Render 교체 배포 중복 정산값 정확 일치 1회 보정');\n  console.log('[DEPLOY OVERLAP REPAIR] corrected exact duplicate wallet to '+String(overlapTarget));\n}",
  'exact deploy overlap wallet repair'
);

// Render deploys overlap old/new instances briefly. Flush the corrected new state
// once after the old instance has exited, then verify the remote snapshot.
source = replaceOne(
  source,
  "if(process.env.DATABASE_URL)setTimeout(()=>db.verifySavedState().catch(e=>console.error('[SAVED STATE VERIFY]',e.message)),30000).unref();",
  "if(process.env.DATABASE_URL)setTimeout(async()=>{try{await db.flush();await db.verifySavedState();}catch(e){console.error('[SAVED STATE VERIFY]',e.message)}},30000).unref();",
  'post-deploy persistence flush'
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

// SOLO CARD AI · EXTREME mode.
// Only the AI decision layer is replaced. No wallet, payout, multiplayer,
// shop, collection, save, rank or other game rules are changed.
const oldHoldemBot = `function pokerBotDrive(r,userId){
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
}`;

const newHoldemBot = `function holdemBotHoleProfile(cards){
  const hole=(cards||[]).filter(Boolean).slice(0,2);
  if(hole.length<2)return {score:.3,premium:false};
  const vals=hole.map(c=>rankVal(c[0])).sort((a,b)=>b-a),hi=vals[0],lo=vals[1],pair=hi===lo,suited=hole[0][1]===hole[1][1],gap=hi-lo;
  let score=.12+(hi-2)*.035+(lo-2)*.018;
  if(pair)score=.48+hi*.035;
  if(suited)score+=.07;
  if(gap===1)score+=.075;else if(gap===2)score+=.035;else if(gap>=5)score-=.06;
  if(hi===14)score+=.09;
  if(hi>=13&&lo>=10)score+=.1;
  const premium=(pair&&hi>=11)||(hi===14&&lo>=12)||(hi===13&&lo===12&&suited);
  return {score:Math.max(.05,Math.min(.99,score)),premium};
}
function holdemBotTrackHuman(r,userId,action,raiseTo,toCall,hp,rp){
  if(!r||!r.solo||r.game!=='holdem'||userId<=0||!r.hand)return;
  const read=r._holdemBotRead||(r._holdemBotRead={hands:[]}),key=String(r.hand.startedAt||'')+'|'+String(r.hand.dealerSeat??'');
  let hand=read.hands[read.hands.length-1];
  if(!hand||hand.key!==key){hand={key,actions:0,passive:0,raises:0,allIn:false,folded:false};read.hands.push(hand);if(read.hands.length>31)read.hands.splice(0,read.hands.length-31);}
  hand.actions++;
  if(action==='fold'){hand.folded=true;return;}
  if(action==='check'||action==='call')hand.passive++;
  if(action==='raise'){
    hand.raises++;
    const maxTo=Number(hp?.roundBet||0)+Number(rp?.stack||0),n=Number(raiseTo);
    if(Number.isFinite(n)&&n>=maxTo)hand.allIn=true;
  }else if(action==='call'&&Number(rp?.stack||0)>0&&Number(toCall)>=Number(rp.stack))hand.allIn=true;
}
function holdemBotReadStats(r){
  const hands=(r?._holdemBotRead?.hands||[]).slice(-31),current=hands[hands.length-1]||null,prior=hands.slice(0,-1).slice(-30),n=prior.length;
  const actions=prior.reduce((a,h)=>a+Number(h.actions||0),0),passive=prior.reduce((a,h)=>a+Number(h.passive||0),0);
  const allInRate=n?prior.filter(h=>h.allIn).length/n:.12,foldRate=n?prior.filter(h=>h.folded).length/n:.25,passiveRate=actions?passive/actions:.5;
  const clamp01=v=>Math.max(0,Math.min(1,v));
  let trap=n>=4?clamp01((.14-allInRate)/.14)*.5+clamp01((passiveRate-.55)/.35)*.35+clamp01((foldRate-.18)/.5)*.15:.15;
  if(current?.allIn&&Number(current.passive||0)>0)trap=Math.min(1,trap+.12+Math.min(.18,Number(current.passive||0)*.06));
  return {hands:n,allInRate,foldRate,passiveRate,trap,currentPassive:Number(current?.passive||0)};
}
function holdemBotEquity(hp,board,samples=84,oppMinScore=0){
  const hole=(hp?.hole||[]).filter(Boolean),known=new Set([...hole,...(board||[])]),base=cardDeck().filter(c=>!known.has(c)),needBoard=Math.max(0,5-(board||[]).length);
  let wins=0,ties=0,total=0;
  for(let n=0;n<samples;n++){
    const pool=[...base],take=()=>{const i=crypto.randomInt(pool.length);return pool.splice(i,1)[0];};
    let opp=null;
    if(oppMinScore>0&&base.length>=2){
      for(let tries=0;tries<28&&!opp;tries++){const a=crypto.randomInt(base.length),b0=crypto.randomInt(base.length-1),b=b0>=a?b0+1:b0,cand=[base[a],base[b]];if(holdemBotHoleProfile(cand).score>=oppMinScore)opp=cand;}
    }
    if(opp){for(const c of opp){const i=pool.indexOf(c);if(i>=0)pool.splice(i,1);}}else opp=[take(),take()];
    const run=[...(board||[])];for(let i=0;i<needBoard;i++)run.push(take());
    const a=eval7([...hole,...run]),b=eval7([...opp,...run]),cmp=compareRank(a,b);
    if(cmp>0)wins++;else if(cmp===0)ties++;total++;
  }
  return total?(wins+ties*.5)/total:.5;
}
function pokerBotDrive(r,userId){
  let guard=0;
  while(r.hand&&r.hand.phase!=='complete'&&r.hand.turnUserId!==userId&&guard++<20){
    const botId=soloPokerBotId(userId),h=r.hand,hp=h.p[botId],rp=roomPlayer(r,botId),uh=h.p[userId];
    if(!hp||!rp)break;
    const toCall=Math.max(0,h.currentBet-hp.roundBet),pot=Math.max(1,pokerPot(h)),profile=holdemBotHoleProfile(hp.hole),boardCount=h.board.length,callFrac=toCall/Math.max(1,rp.stack),userAllIn=!!uh?.allIn,read=holdemBotReadStats(r);
    const rangeFloor=userAllIn?Math.min(.82,.54+read.trap*.25+(read.currentPassive>0?.035:0)):0;
    const equity=holdemBotEquity(hp,h.board,userAllIn?104:84,rangeFloor),potOdds=toCall/Math.max(1,pot+toCall);
    let action='check',raiseTo=0;
    const maxTo=hp.roundBet+rp.stack,minTo=h.currentBet+h.minRaise;
    const passivePressure=read.hands>=4?Math.max(0,Math.min(.28,(read.passiveRate-.55)*.65)):0;
    const raiseBy=(pct,minBB=2)=>Math.min(maxTo,Math.max(minTo,h.currentBet+Math.max(h.minRaise,Math.floor(Math.max(r.bigBlind*minBB,pot*pct)/r.bigBlind)*r.bigBlind)));
    if(toCall===0){
      let betChance=equity>=.78?.94:equity>=.66?.82:equity>=.57?.64:equity>=.5?.38:.08;
      if(boardCount===0)betChance=Math.max(betChance,profile.premium?.96:profile.score>=.66?.82:profile.score>=.5?.58:.14);
      betChance=Math.min(.97,betChance+passivePressure);
      if(rp.stack>r.bigBlind*3&&Math.random()<betChance){
        action='raise';
        const pct=(equity>=.8?.88:equity>=.68?.7:equity>=.57?.54:.4)+passivePressure*.45;
        raiseTo=raiseBy(pct,boardCount===0?(profile.premium?3.5:2.7):2.2);
      }
    }else{
      let margin=userAllIn?.085:callFrac>.65?.065:callFrac>.35?.045:.025;
      if(boardCount===0&&!profile.premium&&callFrac>.55)margin+=.035;
      let required=Math.min(.95,potOdds+margin);
      if(userAllIn){
        const adaptiveFloor=read.hands>=4?.57+read.trap*.23:.58;
        required=Math.max(required,Math.min(.86,adaptiveFloor+(read.currentPassive>0?.025:0)));
      }
      const monster=equity>=.81,veryStrong=equity>=.71,profitable=equity>=required;
      if(!profitable){
        action='fold';
      }else{
        let raiseChance=monster?.84:veryStrong?.54:equity>=.61?.24:.04;
        if(userAllIn)raiseChance=0;
        if(rp.stack>toCall+r.bigBlind*3&&Math.random()<raiseChance){
          action='raise';raiseTo=raiseBy(monster?.94:veryStrong?.72:.52,2.7);
        }else action='call';
      }
    }
    try{pokerAction(r,botId,action,raiseTo)}catch{try{pokerAction(r,botId,toCall?'call':'check',0)}catch{break}}
  }
}`;
source = replaceOne(source, oldHoldemBot, newHoldemBot, 'holdem extreme AI');

source = replaceOne(
  source,
  "  const toCall=Math.max(0,h.currentBet-hp.roundBet);\n  if(action==='fold'){hp.folded=true;hp.acted=true;}",
  "  const toCall=Math.max(0,h.currentBet-hp.roundBet);\n  if(r.solo&&userId>0)holdemBotTrackHuman(r,userId,action,raiseTo,toCall,hp,rp);\n  if(action==='fold'){hp.folded=true;hp.acted=true;}",
  'holdem adaptive human action tracker'
);

const oldSevenBot = `function sevenBotDrive(s){
  let guard=0;while(s&&!s.complete&&s.turn==='bot'&&guard++<5){
    const call=Math.max(0,s.currentBet-s.roundBet.bot),status=sevenCurrentStatus(s,'bot'),pot=Math.max(1,s.pot),pressure=call/pot,roll=Math.random();
    if(call>0 && status.rankLevel===0 && pressure>.45 && roll<.5){sevenAction(s,'bot','fold');continue;}
    const strong=status.rankLevel>=2 || (status.rankLevel>=1&&s.street>=5);
    if(strong&&s.stack.bot>call+s.minRaise&&roll<.38){const target=Math.min(s.roundBet.bot+s.stack.bot,Math.max(s.currentBet+s.minRaise,Math.floor((s.currentBet+Math.max(s.minRaise,pot*.45))/1000)*1000));sevenAction(s,'bot','raise',target);continue;}
    sevenAction(s,'bot',call>0?'call':'check');
  }
}`;

const newSevenBot = `function sevenBotEquity(s,samples=72){
  const botNow=(s.cards?.bot||[]).filter(Boolean),userUp=sevenVisibleCards(s,'user'),known=new Set([...botNow,...userUp]);
  const base=cardDeck().filter(c=>!known.has(c)),botNeed=Math.max(0,7-botNow.length),userNeed=Math.max(0,7-userUp.length);
  let wins=0,ties=0,total=0;
  for(let n=0;n<samples;n++){
    const pool=[...base],take=()=>{const i=crypto.randomInt(pool.length);return pool.splice(i,1)[0];};
    const bot=[...botNow],user=[...userUp];for(let i=0;i<botNeed;i++)bot.push(take());for(let i=0;i<userNeed;i++)user.push(take());
    const cmp=compareRank(eval7(bot),eval7(user));if(cmp>0)wins++;else if(cmp===0)ties++;total++;
  }
  return total?(wins+ties*.5)/total:.5;
}
function sevenVisibleThreat(s){
  const up=sevenVisibleCards(s,'user'),st=pokerHandStatus(up),vals=up.map(c=>rankVal(c[0]));
  const high=vals.length?Math.max(...vals):0,paired=st.rankLevel>=1;
  return Math.min(.22,(paired?.11:0)+(high>=13?.05:0)+(Number(st.draws?.length||0)*.035));
}
function sevenBotDrive(s){
  let guard=0;while(s&&!s.complete&&s.turn==='bot'&&guard++<7){
    const call=Math.max(0,s.currentBet-s.roundBet.bot),pot=Math.max(1,s.pot),equity=sevenBotEquity(s,72),threat=sevenVisibleThreat(s),potOdds=call/Math.max(1,pot+call),callFrac=call/Math.max(1,s.stack.bot),maxTo=sevenEffectiveMaxTo(s,'bot');
    const allInCall=call>=s.stack.bot||s.stack.user<=0;
    let action=call>0?'call':'check',target=0;
    if(call>0){
      let margin=allInCall?.08:callFrac>.6?.065:callFrac>.3?.04:.02;
      const required=Math.min(.94,potOdds+margin+threat*.12);
      if(equity<required){sevenAction(s,'bot','fold');continue;}
      const raiseChance=allInCall?0:equity>=.8?.86:equity>=.7?.62:equity>=.61?.32:.06;
      if(maxTo>s.currentBet&&s.stack.bot>call+s.minRaise&&Math.random()<raiseChance){
        const pct=equity>=.8?.95:equity>=.7?.72:.52;
        target=Math.min(maxTo,Math.max(s.currentBet+s.minRaise,Math.floor((s.currentBet+Math.max(s.minRaise,pot*pct))/1000)*1000));
        action='raise';
      }
    }else{
      const openChance=equity>=.78?.96:equity>=.68?.84:equity>=.58?.63:equity>=.5?.3:Math.max(.025,.08-threat*.2);
      if(maxTo>s.currentBet&&s.stack.bot>s.minRaise&&Math.random()<openChance){
        const pct=equity>=.78?.9:equity>=.68?.7:equity>=.58?.52:.36;
        target=Math.min(maxTo,Math.max(s.currentBet+s.minRaise,Math.floor((s.currentBet+Math.max(s.minRaise,pot*pct))/1000)*1000));
        action='raise';
      }
    }
    sevenAction(s,'bot',action,target);
  }
}`;
source = replaceOne(source, oldSevenBot, newSevenBot, 'seven poker extreme AI');

const runtimeServer = new Module(serverPath, module);
runtimeServer.filename = serverPath;
runtimeServer.paths = Module._nodeModulePaths(__dirname);
runtimeServer._compile(source, serverPath);
// Release boot-time source copies after compilation to stay within the 512MB plan.
source = null; appSource = null; indexSource = null;

'use strict';

const fs=require('node:fs');

function replaceOne(source,oldText,newText,label){
  if(!source.includes(oldText))throw new Error(`patch target missing: ${label}`);
  return source.replace(oldText,newText);
}

// ----- server.js -----
let server=fs.readFileSync('server.js','utf8');
server=replaceOne(server,
"function roomReadyCount(r){return r.players.filter(p=>p.ready).length;}\nfunction roomSummary(r){",
`function roomReadyCount(r){return r.players.filter(p=>p.ready).length;}
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
function roomSummary(r){`,
'holdem auto-start helpers');

server=replaceOne(server,
"function personalizedRoom(r,userId){\n  expirePokerTurn(r);\n  const turnUserId=currentTurnUserId(r),turnPlayer=turnUserId!=null?roomPlayer(r,turnUserId):null;",
"function personalizedRoom(r,userId){\n  expirePokerTurn(r);\n  maybeAutoStartHoldem(r);\n  const turnUserId=currentTurnUserId(r),turnPlayer=turnUserId!=null?roomPlayer(r,turnUserId):null;",
'personalized room auto-start');

server=replaceOne(server,
"    version:r.version||0,updatedAt:r.updatedAt||r.createdAt,readyCount:roomReadyCount(r),allReady:r.players.length>=2&&r.players.every(p=>!!p.ready),",
"    version:r.version||0,updatedAt:r.updatedAt||r.createdAt,readyCount:roomReadyCount(r),allReady:r.players.length>=2&&r.players.every(p=>!!p.ready),autoStartAt:holdemAutoStartAt(r),",
'personalized room auto-start timestamp');

fs.writeFileSync('server.js',server);

// ----- public/app.js -----
let app=fs.readFileSync('public/app.js','utf8');
app=replaceOne(app,
"    const version=d.room.version||0;if(version!==lastRoomVersion||!silent){lastRoomVersion=version;renderRoom(d.room)}",
"    const version=d.room.version||0;if(version!==lastRoomVersion||!silent||(currentGame==='holdem'&&d.room.autoStartAt)){lastRoomVersion=version;renderRoom(d.room)}",
'holdem countdown polling render');

app=replaceOne(app,
"  const sec=h?.turnDeadlineAt?Math.max(0,Math.ceil((h.turnDeadlineAt-Date.now())/1000)):null;root.innerHTML=`${roomToolbar(room)}${result}${h?.phase!=='complete'&&sec!==null?`<div class=\"holdem-countdown ${sec<=3?'urgent':''}\">⏱ ${html(room.turnNickname||'플레이어')} 행동시간 <b>${sec}</b>초 · 0초면 자동 폴드</div>`:''}<div class=\"table-wrap\">",
"  const sec=h?.turnDeadlineAt?Math.max(0,Math.ceil((h.turnDeadlineAt-Date.now())/1000)):null,autoSec=room.autoStartAt?Math.max(0,Math.ceil((room.autoStartAt-Date.now())/1000)):null;root.innerHTML=`${roomToolbar(room)}${result}${room.status==='WAITING'&&autoSec!==null?`<div class=\"holdem-countdown\">🃏 ${h?.phase==='complete'?'다음 핸드':'첫 핸드'} 자동 시작 <b>${autoSec}</b>초 · 전원 READY 유지 시 자동으로 시작합니다.</div>`:''}${h?.phase!=='complete'&&sec!==null?`<div class=\"holdem-countdown ${sec<=3?'urgent':''}\">⏱ ${html(room.turnNickname||'플레이어')} 행동시간 <b>${sec}</b>초 · 0초면 자동 폴드</div>`:''}<div class=\"table-wrap\">",
'holdem multi countdown banner');

fs.writeFileSync('public/app.js',app);

// ----- index cache/version -----
let index=fs.readFileSync('public/index.html','utf8');
if(!index.includes('VERSION 2.8.4'))throw new Error('index version target missing');
index=index.replace(/\?v=284/g,'?v=285').replace('VERSION 2.8.4','VERSION 2.8.5');
fs.writeFileSync('public/index.html',index);

let sw=fs.readFileSync('public/sw.js','utf8');
if(!sw.includes('v284'))throw new Error('service worker v284 target missing');
sw=sw.replace(/v284/g,'v285').replace(/\?v=284/g,'?v=285');
fs.writeFileSync('public/sw.js',sw);

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
pkg.version='2.8.5';
pkg.description='JUNJA LAND v2.8.5 - multiplayer Holdem starts and restarts automatically 5 seconds after all players are READY, with synchronized countdown; Big Wheel 77/JUNJA x100 preserved.';
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.writeFileSync('VERSION.txt','JUNJA LAND v2.8.5 · HOLD’EM MULTI 5S AUTO START + BIG WHEEL 77/JUNJA x100 + LIVE PRESENCE\n');

console.log('v2.8.5 patch applied');

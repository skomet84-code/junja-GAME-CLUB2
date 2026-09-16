'use strict';

const fs=require('node:fs');

function replaceOne(source,oldText,newText,label){
  if(!source.includes(oldText))throw new Error(`patch target missing: ${label}`);
  return source.replace(oldText,newText);
}
function assertWheel(source,label){
  const m=source.match(/const BIG_WHEEL_KEYS=(\[[^\n]+\]);/);
  if(!m)throw new Error(`${label}: BIG_WHEEL_KEYS missing`);
  const keys=Function('return '+m[1])();
  const counts=Object.fromEntries(['x2','x3','x5','x10','x15','junja'].map(k=>[k,keys.filter(x=>x===k).length]));
  if(keys.length!==77)throw new Error(`${label}: wheel length ${keys.length}`);
  if(keys.filter(x=>x==='junja').length!==2||keys[0]!=='junja'||keys[38]!=='junja')throw new Error(`${label}: JUNJA layout mismatch`);
  if(keys.some((x,i)=>x===keys[(i+1)%keys.length]))throw new Error(`${label}: adjacent duplicate payout`);
  if(JSON.stringify(counts)!==JSON.stringify({x2:32,x3:19,x5:13,x10:6,x15:5,junja:2}))throw new Error(`${label}: counts mismatch ${JSON.stringify(counts)}`);
  if(!/junja:\{key:'junja',label:'JUNJA',mult:100\}/.test(source))throw new Error(`${label}: JUNJA x100 missing`);
  return counts;
}

// ----- server: make multiplayer Hold'em 5-second auto-start independent of client polling -----
let server=fs.readFileSync('server.js','utf8');
assertWheel(server,'server');
server=replaceOne(server,
`function maybeAutoStartHoldem(r){
  const at=holdemAutoStartAt(r);
  if(!at||now()<at)return false;
  r.holdemAutoStartAt=null;
  try{pokerStart(r);touchRoom(r);pushRefresh(r.id);return true;}
  catch(e){console.warn('[HOLDem auto-start]',e.message);return false;}
}
function roomSummary(r){`,
`function maybeAutoStartHoldem(r){
  const at=holdemAutoStartAt(r);
  if(!at||now()<at)return false;
  r.holdemAutoStartAt=null;
  try{pokerStart(r);touchRoom(r);pushRefresh(r.id);return true;}
  catch(e){console.warn('[HOLDem auto-start]',e.message);return false;}
}
// Production-safe server sweep: first hand and every following hand start even if a client poll is delayed/paused.
const holdemAutoStartSweep=setInterval(()=>{
  for(const r of rooms.values())if(r?.game==='holdem')maybeAutoStartHoldem(r);
},250);
holdemAutoStartSweep.unref?.();
function roomSummary(r){`,
'holdem server sweep');
fs.writeFileSync('server.js',server);

// ----- client: make automatic behavior unmistakable -----
let app=fs.readFileSync('public/app.js','utf8');
assertWheel(app,'client');
app=replaceOne(app,
"    return `<div class=\"turn-banner waiting\"><strong>대기실 · READY ${room.readyCount||0}/${room.players.length}</strong><span>${room.players.length<2?'한 명 이상 더 입장해야 시작할 수 있어.':need?`${need}명이 아직 준비 전이야.`:'전원 READY · 방장이 시작할 수 있어!'}</span></div>`;",
"    return `<div class=\"turn-banner waiting\"><strong>대기실 · READY ${room.readyCount||0}/${room.players.length}</strong><span>${room.players.length<2?'한 명 이상 더 입장해야 시작할 수 있어.':need?`${need}명이 아직 준비 전이야.`:(room.game==='holdem'?'전원 READY · 5초 뒤 자동 시작!':'전원 READY · 방장이 시작할 수 있어!')}</span></div>`;",
'holdem ready banner');
app=replaceOne(app,
"${room.allReady?'게임 시작':'전원 READY 대기'}",
"${room.allReady?(room.game==='holdem'?'즉시 시작 · 자동 5초':'게임 시작'):'전원 READY 대기'}",
'holdem host start label');
app=replaceOne(app,
"`<div class=\"action-bar\"><span class=\"waiting-text\">핸드 종료. 방장이 다음 게임을 시작할 수 있어.</span></div>`;",
"`<div class=\"action-bar\"><span class=\"waiting-text\">핸드 종료 · 전원 READY 상태면 5초 뒤 다음 핸드가 자동 시작돼.</span></div>`;",
'holdem completed-hand copy');
fs.writeFileSync('public/app.js',app);

// ----- version/cache bump: force browsers and Render to pick up this verified build -----
let index=fs.readFileSync('public/index.html','utf8');
if(!index.includes('VERSION 2.8.5'))throw new Error('index v2.8.5 marker missing');
if(!index.includes('총 <b>77칸</b>')||!index.includes('★ ×100 · 단 2칸 ★')||!index.includes('JUNJA 제발'))throw new Error('Big Wheel 77/JUNJA UI copy missing');
index=index.replace(/\?v=285/g,'?v=286').replace('VERSION 2.8.5','VERSION 2.8.6');
fs.writeFileSync('public/index.html',index);

let sw=fs.readFileSync('public/sw.js','utf8');
if(!sw.includes('v285'))throw new Error('service worker v285 marker missing');
sw=sw.replace(/v285/g,'v286').replace(/\?v=285/g,'?v=286');
fs.writeFileSync('public/sw.js',sw);

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
pkg.version='2.8.6';
pkg.description='JUNJA LAND v2.8.6 - verified Big Wheel 77/JUNJA x100 plus server-driven 5-second multiplayer Holdem first-hand and next-hand auto start.';
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.writeFileSync('VERSION.txt','JUNJA LAND v2.8.6 · VERIFIED BIG WHEEL 77/JUNJA x100 + SERVER-DRIVEN HOLD’EM MULTI 5S AUTO START/RESTART\n');

console.log('v2.8.6 live-sync patch applied and wheel definition verified');

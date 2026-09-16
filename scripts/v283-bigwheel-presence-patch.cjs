'use strict';

const fs = require('node:fs');

function replaceOne(source, oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`patch target missing: ${label}`);
  return source.replace(oldText, newText);
}

const wheelKeys = ['junja','x2','x3','x5','x2','x10','x2','x3','x2','x5','x3','x2','x15','x2','x3','x5','x2','x10','x2','x3','x2','x5','x3','x2','x15','x2','x3','x5','x2','x3','x2','x10','x2','x5','x3','x2','x5','x2','x3','x2','x3','x2','x10','x2','x5','x3','x2','x15','x2','junja','x3','x5','x2','x3','x2','x5','x2','x10','x3','x2','x5','x2','x3','x2','x15','x2','x3','x2','x5','x10','x2','x3','x2','x5','x3','x2','x3','x2','x5','x2','x10','x2','x3','x2','x5','x3','x2','x15','x2','x3','x5','x2','x10','x2','x3','x2','x5','x3','x2'];
const counts = Object.fromEntries(['x2','x3','x5','x10','x15','junja'].map(k => [k, wheelKeys.filter(x => x === k).length]));
if (wheelKeys.length !== 99) throw new Error('Big Wheel must have 99 segments');
if (JSON.stringify(counts) !== JSON.stringify({x2:42,x3:25,x5:17,x10:8,x15:5,junja:2})) throw new Error('Big Wheel segment counts mismatch');
if (wheelKeys[0] !== 'junja' || wheelKeys[49] !== 'junja') throw new Error('JUNJA slots must sit opposite each other');
if (wheelKeys.some((x,i) => x === wheelKeys[(i+1)%wheelKeys.length])) throw new Error('Same payouts must not be adjacent');
const wheelKeysJs = wheelKeys.map(x => `'${x}'`).join(',');

// ----- server.js -----
let server = fs.readFileSync('server.js','utf8');
server = replaceOne(server,
`const BIG_WHEEL_SEGMENTS = [
  ...Array(10).fill({key:'x2',label:'×2',mult:2}),
  ...Array(6).fill({key:'x3',label:'×3',mult:3}),
  ...Array(4).fill({key:'x5',label:'×5',mult:5}),
  ...Array(2).fill({key:'x10',label:'×10',mult:10}),
  {key:'x15',label:'×15',mult:15},
  {key:'junja',label:'JUNJA',mult:40}
];`,
`const BIG_WHEEL_DEFS = {
  x2:{key:'x2',label:'×2',mult:2},
  x3:{key:'x3',label:'×3',mult:3},
  x5:{key:'x5',label:'×5',mult:5},
  x10:{key:'x10',label:'×10',mult:10},
  x15:{key:'x15',label:'×15',mult:15},
  junja:{key:'junja',label:'JUNJA',mult:60}
};
const BIG_WHEEL_KEYS=[${wheelKeysJs}];
const BIG_WHEEL_SEGMENTS=BIG_WHEEL_KEYS.map(key=>BIG_WHEEL_DEFS[key]);`,
'server big wheel segments');

server = replaceOne(server,
"  bet=gameWager(bet,1000,100000,1000);",
"  bet=gameWager(bet,1000,10000000,1000);if(bet>10000000)throw new Error('빅휠 최대 베팅은 10,000,000G입니다.');",
'server big wheel max');

server = replaceOne(server,
"function onlineCount(){ return sseClients.size; }\n\nfunction liveGameKey(v){",
`function onlineCount(){ return new Set([...sseClients.values()].map(x=>Number(x.userId)).filter(Number.isFinite)).size; }

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

function liveGameKey(v){`,
'presence snapshot');

server = replaceOne(server,
`function liveFloorTouch(user,game){
  game=liveGameKey(game);const map=cleanLiveFloor(game),t=now(),prev=map.get(user.id);
  const p=prev||{userId:user.id,nickname:user.nickname,avatar:user.avatar,joinedAt:t,reaction:null};
  p.nickname=user.nickname;p.avatar=user.avatar;p.lastSeen=t;map.set(user.id,p);
  return {isNew:!prev,member:p};
}`,
`function liveFloorTouch(user,game,state=null){
  game=liveGameKey(game);const map=cleanLiveFloor(game),t=now(),prev=map.get(user.id),nextState=state==='PLAYING'||state==='WAITING'?state:(prev?.state||'WAITING');
  const p=prev||{userId:user.id,nickname:user.nickname,avatar:user.avatar,joinedAt:t,reaction:null,state:'WAITING'};
  const stateChanged=!!prev&&p.state!==nextState;
  p.nickname=user.nickname;p.avatar=user.avatar;p.state=nextState;p.lastSeen=t;map.set(user.id,p);
  return {isNew:!prev,stateChanged,member:p};
}`,
'live floor state');

server = replaceOne(server,
"    userId:p.userId,nickname:p.nickname,avatar:p.avatar,cosmetics:cosmeticsPublic(p.userId),joinedAt:p.joinedAt,lastSeen:p.lastSeen,",
"    userId:p.userId,nickname:p.nickname,avatar:p.avatar,cosmetics:cosmeticsPublic(p.userId),joinedAt:p.joinedAt,lastSeen:p.lastSeen,state:presenceStateForGameUser(game,p.userId,p.state),",
'live member state');

server = replaceOne(server,
"if(url.pathname==='/api/me'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;return json(res,200,{user:u,online:onlineCount()});}",
"if(url.pathname==='/api/me'&&req.method==='GET'){const u=requireAuth(req,res);if(!u)return;return json(res,200,{user:u,online:onlineCount(),presence:presenceSnapshot()});}",
'api me presence');

server = replaceOne(server,
"      const touched=liveFloorTouch(u,game);if(touched.isNew)pushRefresh();\n      return json(res,200,{ok:true,game,members:liveFloorMembers(game),joined:touched.isNew});",
"      const touched=liveFloorTouch(u,game,b.state);if(touched.isNew||touched.stateChanged)pushRefresh();\n      return json(res,200,{ok:true,game,members:liveFloorMembers(game),joined:touched.isNew,stateChanged:touched.stateChanged});",
'heartbeat state');
fs.writeFileSync('server.js',server);

// ----- public/app.js -----
let app = fs.readFileSync('public/app.js','utf8');
app = replaceOne(app,
"const BIG_WHEEL_SEGMENTS=[...Array(10).fill({key:'x2',label:'×2',mult:2}),...Array(6).fill({key:'x3',label:'×3',mult:3}),...Array(4).fill({key:'x5',label:'×5',mult:5}),...Array(2).fill({key:'x10',label:'×10',mult:10}),{key:'x15',label:'×15',mult:15},{key:'junja',label:'JUNJA',mult:40}];",
`const BIG_WHEEL_DEFS={x2:{key:'x2',label:'×2',mult:2},x3:{key:'x3',label:'×3',mult:3},x5:{key:'x5',label:'×5',mult:5},x10:{key:'x10',label:'×10',mult:10},x15:{key:'x15',label:'×15',mult:15},junja:{key:'junja',label:'JUNJA',mult:60}};\nconst BIG_WHEEL_KEYS=[${wheelKeysJs}];\nconst BIG_WHEEL_SEGMENTS=BIG_WHEEL_KEYS.map(key=>BIG_WHEEL_DEFS[key]);`,
'client big wheel segments');

app = replaceOne(app,
"const canvas=$('#bigWheelCanvas');if(!canvas)return;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,cx=w/2,cy=h/2,n=BIG_WHEEL_SEGMENTS.length,step=Math.PI*2/n,r=w*.43;",
"const canvas=$('#bigWheelCanvas');if(!canvas)return;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,cx=w/2,cy=h/2,n=BIG_WHEEL_SEGMENTS.length,step=Math.PI*2/n,r=w*.43,dense=n>=80;",
'dense wheel flag');

app = replaceOne(app,
"ctx.save();ctx.rotate(mid);ctx.translate(r*.69,0);ctx.rotate(Math.PI/2);ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='#000';ctx.shadowBlur=8;ctx.fillStyle=x.key==='junja'?'#fff0a9':'#fff';ctx.font=`900 ${x.key==='junja'?22:30}px system-ui`;ctx.fillText(x.label,0,0);ctx.shadowBlur=0;ctx.restore();",
"ctx.save();ctx.rotate(mid);ctx.translate(dense?r*.64:r*.69,0);if(!dense)ctx.rotate(Math.PI/2);ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='#000';ctx.shadowBlur=dense?2:8;ctx.fillStyle=x.key==='junja'?'#fff0a9':'#fff';ctx.font=`900 ${dense?(x.key==='junja'?9:10):(x.key==='junja'?22:30)}px system-ui`;ctx.fillText(x.label,0,0);ctx.shadowBlur=0;ctx.restore();",
'dense wheel labels');

app = replaceOne(app,
"const input=$('#bigWheelBet'),bet=Math.max(1000,Math.min(100000,Math.floor(Number(input?.value||1000)/1000)*1000));",
"const input=$('#bigWheelBet'),bet=Math.max(1000,Math.min(10000000,Math.floor(Number(me?.balance||0)/1000)*1000,Math.floor(Number(input?.value||1000)/1000)*1000));",
'client big wheel max');

app = replaceOne(app,
"async function liveHeartbeat(){",
`function localPresenceState(){
  if(currentView==='slot')return autoSpinRunning||$('#spinBtn')?.disabled?'PLAYING':'WAITING';
  if(currentView==='horse')return horseRacing||horseAutoBusy?'PLAYING':'WAITING';
  if(currentView==='bigwheel')return bigWheelSpinning||bigWheelAutoRunning?'PLAYING':'WAITING';
  if(currentView==='sicbo')return sicboRolling||sicboAutoRunning?'PLAYING':'WAITING';
  if(currentView==='roulette')return rouletteSpinning?'PLAYING':'WAITING';
  return 'WAITING';
}
async function liveHeartbeat(){`,
'client presence state');

app = replaceOne(app,
"body:JSON.stringify({game:liveGame})",
"body:JSON.stringify({game:liveGame,state:localPresenceState()})",
'heartbeat payload');

app = replaceOne(app,
"${Number(p.userId)===Number(me?.id)?'나 · PLAYING':'ONLINE'}",
"${(Number(p.userId)===Number(me?.id)?'나 · ':'')+(p.state==='PLAYING'?'게임중':'대기중')}",
'live floor visible state');

app = replaceOne(app,
"async function refreshMe(){",
`function renderLobbyPresence(rows=[]){
  const root=$('#lobbyLiveFaces');if(!root)return;
  root.classList.add('presence-roster');
  root.innerHTML=rows.length?rows.map(p=>'<div class="presence-person '+(p.state==='PLAYING'?'playing':'waiting')+'">'+avatarImg(p.avatar,p.nickname,'presence-face',p.cosmetics)+'<div><b>'+html(p.nickname)+'</b><span>'+html(p.gameLabel||'로비')+(p.mode&&p.mode!=='LOBBY'?' · '+html(p.mode):'')+'</span></div><em>'+(p.state==='PLAYING'?'게임중':'대기중')+'</em></div>').join(''):'<div class="presence-empty">현재 다른 접속자가 없어.</div>';
}
async function refreshMe(){`,
'lobby presence renderer');

app = replaceOne(app,
"if($('#lobbyLiveFaces'))$('#lobbyLiveFaces').innerHTML=`<b>${d.online}</b><span>명 접속 중</span>`;return d",
"renderLobbyPresence(d.presence||[]);return d",
'lobby presence call');
fs.writeFileSync('public/app.js',app);

// ----- public/index.html -----
let index = fs.readFileSync('public/index.html','utf8');
index = index.replaceAll('?v=280','?v=283');
index = index.replace('JUNJA ARCADE · VERSION 2.7.0','JUNJA ARCADE · VERSION 2.8.3');
index = index.replace('현재 접속 중인 회원 · 같은 게임에 들어가면 LIVE FLOOR에서 바로 확인','현재 접속 중인 회원 · 닉네임, 플레이 위치, 게임중/대기중 상태를 실시간 표시');
index = index.replace('대형 휠 스핀 · JUNJA 최고 x20','99칸 대형 휠 · JUNJA 최고 x60');
index = replaceOne(index,
'<p class="casino-note">선택한 칸에 휠이 멈추면 표시된 배수만큼 총 지급. 최고 배당은 <b>JUNJA ×20</b>.</p><div id="bigWheelBets" class="wheel-bet-grid"><button data-wheel-bet="x2" type="button">×2<small>10칸</small></button><button data-wheel-bet="x3" type="button">×3<small>6칸</small></button><button data-wheel-bet="x5" type="button">×5<small>4칸</small></button><button data-wheel-bet="x10" type="button">×10<small>2칸</small></button><button data-wheel-bet="x15" type="button">×15<small>1칸</small></button><button data-wheel-bet="junja" class="junja-bet" type="button">JUNJA<small>×20 · 1칸</small></button></div><label class="casino-wager-label">베팅 금액<input id="bigWheelBet" type="number" min="1000" max="100000" step="1000" value="10000"><small>1,000G 단위 · MAX 100,000G</small></label>',
'<p class="casino-note">총 <b>99칸</b> · 같은 배당이 뭉치지 않도록 분산 배치. JUNJA는 휠 위·아래에 2칸이며 <b>×60</b>.</p><div id="bigWheelBets" class="wheel-bet-grid"><button data-wheel-bet="x2" type="button">×2<small>42칸</small></button><button data-wheel-bet="x3" type="button">×3<small>25칸</small></button><button data-wheel-bet="x5" type="button">×5<small>17칸</small></button><button data-wheel-bet="x10" type="button">×10<small>8칸</small></button><button data-wheel-bet="x15" type="button">×15<small>5칸</small></button><button data-wheel-bet="junja" class="junja-bet" type="button">JUNJA<small>×60 · 2칸</small></button></div><label class="casino-wager-label">베팅 금액<input id="bigWheelBet" type="number" min="1000" max="10000000" step="1000" value="10000"><small>1,000G 단위 · MAX 10,000,000G</small></label>',
'big wheel board');
fs.writeFileSync('public/index.html',index);

// ----- public/style.css -----
let css = fs.readFileSync('public/style.css','utf8');
if(!css.includes('/* v2.8.3 presence roster */')) css += `

/* v2.8.3 presence roster */
.lobby-live-faces.presence-roster{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;align-items:center;max-width:min(760px,65vw)}
.presence-person{display:grid;grid-template-columns:auto minmax(88px,1fr) auto;gap:8px;align-items:center;padding:7px 9px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(5,10,18,.48);min-width:190px}
.presence-person .styled-avatar{width:34px;height:34px}
.presence-person>div{display:grid;line-height:1.1;min-width:0}
.presence-person>div b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.presence-person>div span{font-size:10px;opacity:.72;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.presence-person em{font-style:normal;font-size:10px;font-weight:900;padding:5px 7px;border-radius:999px;white-space:nowrap}
.presence-person.playing em{background:rgba(64,214,136,.16);color:#8ff0bd}
.presence-person.waiting em{background:rgba(255,198,83,.14);color:#f5cf79}
.presence-empty{font-size:12px;opacity:.7;padding:8px 0}
@media(max-width:760px){.lobby-live-now{align-items:flex-start;flex-wrap:wrap}.lobby-live-faces.presence-roster{width:100%;max-width:none;justify-content:flex-start}.presence-person{min-width:0;flex:1 1 calc(50% - 4px)}}
@media(max-width:430px){.presence-person{flex-basis:100%}}
`;
fs.writeFileSync('public/style.css',css);

// ----- service worker cache -----
let sw = fs.readFileSync('public/sw.js','utf8');
sw = sw.replaceAll('v280','v283').replaceAll('?v=280','?v=283');
fs.writeFileSync('public/sw.js',sw);

// ----- version metadata -----
fs.writeFileSync('VERSION.txt',"JUNJA LAND v2.8.3 · BIG WHEEL 99 + LIVE PRESENCE\n");
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
pkg.version = '2.8.3';
pkg.description = 'JUNJA LAND v2.8.3 - 99-segment dispersed Big Wheel with two JUNJA x60 slots plus live user location and playing/waiting presence.';
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');

console.log('v2.8.3 patch applied:', counts);

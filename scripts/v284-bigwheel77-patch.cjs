'use strict';

const fs = require('node:fs');

function replaceOne(source, oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`patch target missing: ${label}`);
  return source.replace(oldText, newText);
}
function replaceRegex(source, regex, replacement, label) {
  if (!regex.test(source)) throw new Error(`patch regex target missing: ${label}`);
  return source.replace(regex, replacement);
}

// 77칸: JUNJA는 위/아래에 단 2칸, 나머지는 같은 배당이 연속되지 않도록 분산.
const wheelKeys = ['junja','x2','x3','x2','x3','x2','x3','x2','x3','x2','x3','x2','x3','x2','x5','x2','x3','x2','x5','x2','x3','x2','x5','x2','x3','x2','x5','x2','x3','x2','x5','x2','x3','x2','x5','x2','x3','x2','junja','x2','x5','x2','x3','x2','x5','x2','x3','x2','x10','x2','x5','x2','x3','x2','x15','x2','x10','x5','x3','x2','x15','x10','x5','x3','x2','x15','x10','x5','x3','x2','x15','x10','x5','x3','x2','x15','x10'];
const counts = Object.fromEntries(['x2','x3','x5','x10','x15','junja'].map(k => [k, wheelKeys.filter(x => x === k).length]));
if (wheelKeys.length !== 77) throw new Error('Big Wheel must have 77 segments');
if (JSON.stringify(counts) !== JSON.stringify({x2:32,x3:19,x5:13,x10:6,x15:5,junja:2})) throw new Error('Big Wheel 77 segment counts mismatch');
if (wheelKeys[0] !== 'junja' || wheelKeys[38] !== 'junja') throw new Error('JUNJA slots must be the two near-opposite hero slots');
if (wheelKeys.some((x,i) => x === wheelKeys[(i+1)%wheelKeys.length])) throw new Error('Same payouts must not be adjacent');
const wheelKeysJs = wheelKeys.map(x => `'${x}'`).join(',');

// ----- server.js -----
let server = fs.readFileSync('server.js','utf8');
server = replaceOne(server,
  "junja:{key:'junja',label:'JUNJA',mult:60}",
  "junja:{key:'junja',label:'JUNJA',mult:100}",
  'server JUNJA x100');
server = replaceRegex(server,
  /const BIG_WHEEL_KEYS=\[[^\n]+\];/,
  `const BIG_WHEEL_KEYS=[${wheelKeysJs}];`,
  'server 77 wheel keys');
fs.writeFileSync('server.js',server);

// ----- public/app.js -----
let app = fs.readFileSync('public/app.js','utf8');
app = replaceOne(app,
  "junja:{key:'junja',label:'JUNJA',mult:60}",
  "junja:{key:'junja',label:'JUNJA',mult:100}",
  'client JUNJA x100');
app = replaceRegex(app,
  /const BIG_WHEEL_KEYS=\[[^\n]+\];/,
  `const BIG_WHEEL_KEYS=[${wheelKeysJs}];`,
  'client 77 wheel keys');
app = replaceOne(app,
  'r=w*.43,dense=n>=80;',
  'r=w*.43,dense=n>=60;',
  '77 segment dense rendering');
app = replaceOne(app,
  "const mid=(a0+a1)/2,grad=ctx.createRadialGradient(0,0,r*.18,0,0,r);grad.addColorStop(0,cols[1]);grad.addColorStop(1,cols[0]);",
  "const mid=(a0+a1)/2,isJunja=x.key==='junja',grad=ctx.createRadialGradient(0,0,r*.18,0,0,r);if(isJunja){grad.addColorStop(0,'#fff6b0');grad.addColorStop(.34,'#ff62d7');grad.addColorStop(1,'#8f145d')}else{grad.addColorStop(0,cols[1]);grad.addColorStop(1,cols[0]);}",
  'JUNJA special wedge gradient');
app = replaceOne(app,
  "ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,r,a0+.004,a1-.004);ctx.closePath();ctx.fillStyle=grad;ctx.fill();ctx.strokeStyle='#f8df93';ctx.lineWidth=2.2;ctx.stroke();",
  "ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,r,a0+.004,a1-.004);ctx.closePath();ctx.fillStyle=grad;ctx.fill();ctx.strokeStyle=isJunja?'#fff7b5':'#f8df93';ctx.lineWidth=isJunja?5:2.2;ctx.shadowColor=isJunja?'#ffdf67':'transparent';ctx.shadowBlur=isJunja?18:0;ctx.stroke();ctx.shadowBlur=0;",
  'JUNJA special wedge border');
app = replaceOne(app,
  "ctx.save();ctx.rotate(mid);ctx.translate(dense?r*.64:r*.69,0);if(!dense)ctx.rotate(Math.PI/2);ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='#000';ctx.shadowBlur=dense?2:8;ctx.fillStyle=x.key==='junja'?'#fff0a9':'#fff';ctx.font=`900 ${dense?(x.key==='junja'?9:10):(x.key==='junja'?22:30)}px system-ui`;ctx.fillText(x.label,0,0);ctx.shadowBlur=0;ctx.restore();",
  "ctx.save();ctx.rotate(mid);ctx.translate(dense?r*.64:r*.69,0);if(!dense)ctx.rotate(Math.PI/2);ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor=isJunja?'#ffd84f':'#000';ctx.shadowBlur=isJunja?18:(dense?3:8);ctx.fillStyle=isJunja?'#fffdf0':'#fff';ctx.font=`900 ${dense?(isJunja?13:12):(isJunja?24:30)}px system-ui`;ctx.fillText(isJunja?'★JUNJA★':x.label,0,0);ctx.shadowBlur=0;ctx.restore();if(isJunja){ctx.save();ctx.rotate(mid);ctx.translate(r*.84,0);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff2a1';ctx.shadowColor='#ffce3f';ctx.shadowBlur=15;ctx.font='900 15px system-ui';ctx.fillText('♛',0,0);ctx.restore();}",
  'JUNJA wish label');
fs.writeFileSync('public/app.js',app);

// ----- public/index.html -----
let index = fs.readFileSync('public/index.html','utf8');
index = replaceOne(index,'VERSION 2.8.3','VERSION 2.8.4','lobby version');
index = replaceOne(index,'99칸 대형 휠 · JUNJA 최고 x60','77칸 대형 휠 · JUNJA 스페셜 x100','lobby wheel summary');
index = replaceOne(index,'총 <b>99칸</b>','총 <b>77칸</b>','wheel total copy');
index = replaceOne(index,'JUNJA는 휠 위·아래에 2칸이며 <b>×60</b>.','JUNJA는 휠 위·아래에 단 2칸이며 <b>×100</b>. 제발 걸리길 바라게 만드는 스페셜 칸!','wheel JUNJA copy');
index = replaceOne(index,'×2<small>42칸</small>','×2<small>32칸</small>','x2 segment count');
index = replaceOne(index,'×3<small>25칸</small>','×3<small>19칸</small>','x3 segment count');
index = replaceOne(index,'×5<small>17칸</small>','×5<small>13칸</small>','x5 segment count');
index = replaceOne(index,'×10<small>8칸</small>','×10<small>6칸</small>','x10 segment count');
index = replaceOne(index,'JUNJA<small>×60 · 2칸</small>','JUNJA<small>★ ×100 · 단 2칸 ★</small>','JUNJA bet copy');
index = replaceOne(index,
  '<div id="bigWheelResult" class="wheel-result-banner">배당을 선택하고 휠을 돌려.</div></div>',
  '<div class="junja-wish-badge">🙏 JUNJA 제발...! <b>단 2칸 · ×100</b></div><div id="bigWheelResult" class="wheel-result-banner">배당을 선택하고 휠을 돌려.</div></div>',
  'JUNJA wish badge');
index = index.replaceAll('v=283','v=284');
fs.writeFileSync('public/index.html',index);

// ----- public/style.css -----
let style = fs.readFileSync('public/style.css','utf8');
const styleMarker='/* v2.8.4 JUNJA WISH */';
if(!style.includes(styleMarker)) style += `\n${styleMarker}\n.bigwheel-stage{position:relative}\n.junja-wish-badge{position:absolute;z-index:8;top:18px;left:50%;transform:translateX(-50%);padding:9px 15px;border:1px solid #ffe27f99;border-radius:999px;background:linear-gradient(135deg,#6f123edb,#be246fdb 55%,#6d4d0ddb);box-shadow:0 0 18px #ff55c766,0 0 34px #ffd85c33,inset 0 1px #fff7;color:#fff7dc;font-size:12px;font-weight:900;letter-spacing:.02em;text-shadow:0 2px 8px #000;pointer-events:none;animation:junjaWishPulse 1.25s ease-in-out infinite}\n.junja-wish-badge b{color:#fff0a3;margin-left:5px}\n.wheel-bet-grid .junja-bet{border-color:#ffe171!important;background:linear-gradient(145deg,#7f164c,#c52878 55%,#70500e)!important;box-shadow:0 0 18px #ff4fc355,inset 0 0 0 1px #fff3a944!important;color:#fff8db!important}\n.wheel-bet-grid .junja-bet small{color:#fff0a3!important}\n@keyframes junjaWishPulse{0%,100%{filter:brightness(1);transform:translateX(-50%) scale(1)}50%{filter:brightness(1.18);transform:translateX(-50%) scale(1.035)}}\n@media(max-width:700px){.junja-wish-badge{top:10px;font-size:10px;padding:7px 10px}}\n`;
fs.writeFileSync('public/style.css',style);

// ----- service worker / version -----
let sw = fs.readFileSync('public/sw.js','utf8');
sw = sw.replaceAll('v283','v284').replaceAll('v=283','v=284');
fs.writeFileSync('public/sw.js',sw);
fs.writeFileSync('VERSION.txt','JUNJA LAND v2.8.4 · BIG WHEEL 77 + JUNJA x100 + LIVE PRESENCE\n');

console.log('v2.8.4 patch ready:', counts);

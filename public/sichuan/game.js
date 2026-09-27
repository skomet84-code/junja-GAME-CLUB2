'use strict';
(()=>{
const E=window.RoyalSichuan,$=s=>document.querySelector(s);
const worlds=[
 {name:'에메랄드 정원',en:'THE EMERALD GARDEN',icon:'♛',desc:'달빛 아래, 첫 번째 왕관의 조각을 찾아보세요.',rule:'정통 연결 · 차분하게 길 찾기'},
 {name:'달빛의 회랑',en:'THE MOONLIT GALLERY',icon:'☾',desc:'보석이 내려앉을 때마다 새로운 길이 열립니다.',rule:'아래로 중력 · 연결 후 패가 내려와요'},
 {name:'별의 도서관',en:'THE CELESTIAL LIBRARY',icon:'✦',desc:'빠른 연결로 별빛을 모아 로얄 피버를 깨우세요.',rule:'4초 콤보 · 더 빠른 연결에 도전'},
 {name:'황금 왕좌',en:'THE GOLDEN THRONE',icon:'♜',desc:'하늘로 떠오르는 보석, 마지막 왕관이 기다립니다.',rule:'위로 중력 · 연결 후 패가 올라가요'}
];
const symbols=[
 ['왕관','#b18533','<path d="M10 22 21 30 32 13 43 30 54 22 49 48H15Z"/><path d="M16 53h32" fill="none" stroke-width="4"/><circle cx="32" cy="9" r="3"/>'],
 ['에메랄드','#248d70','<path d="m32 8 19 13v25L32 58 13 46V21Z"/><path d="m13 21 19 9 19-9M32 30v28M32 8v22M13 46l19-16 19 16" fill="none" stroke="#b8f0ce" stroke-width="2"/>'],
 ['루비','#c45262','<path d="M11 20 23 10h18l12 10-21 37Z"/><path d="M11 20h42M23 10l9 10 9-10M23 20l9 37 9-37" fill="none" stroke="#ffb2b7" stroke-width="2"/>'],
 ['달','#617eb0','<path d="M42 10C12 4 5 45 29 54c10 4 20 0 25-8C28 51 21 20 42 10Z"/><path d="m47 15 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z"/>'],
 ['장미','#bd7483','<path d="M32 10c12-11 26 7 15 16 16 8 1 30-12 19-7 18-29 2-19-10C0 28 17 9 27 19Z"/><circle cx="31" cy="29" r="8" fill="#fbe9dc"/><path d="M32 43v15m0-6c9-13 17-6 10-2" fill="none" stroke="#508e68" stroke-width="3"/>'],
 ['별','#c69c42','<path d="m32 7 7 17 19 2-15 12 5 20-16-11-16 11 5-20L6 26l19-2Z"/><path d="m32 17 4 13 13-1-13 6 5 12-9-8-9 8 5-12-13-6 13 1Z" fill="#ffe8a0" stroke="none"/>'],
 ['나비','#8b63b1','<path d="M29 31C-3 0 3 52 25 43c-12 25 11 19 7-3 0 23 22 20 8 3 26 8 27-43-6-12Z"/><path d="M32 24v26m0-26-7-10m7 10 7-10" fill="none" stroke="#634487" stroke-width="3"/>'],
 ['열쇠','#ab863d','<circle cx="23" cy="22" r="12" fill="none" stroke-width="6"/><path d="m31 31 22 22m-9-9 7-7m-1 13 7-7" fill="none" stroke-width="6"/>'],
 ['백조','#4d95a3','<path d="M12 40c10 0 14-17 27-8 8-6 6-13 1-13-4 0-5 5-5 5-8-6 0-20 10-14 16 8 0 25 6 30 2 2 5 2 7 0-4 22-39 21-46 0Z"/><path d="M19 43q12 10 25-4" fill="none" stroke="#ceeee1" stroke-width="2"/>'],
 ['수련','#cc8150','<path d="M32 9Q13 28 32 43 51 28 32 9Z"/><path d="M9 22Q5 48 32 51 31 30 9 22ZM55 22Q59 48 32 51 33 30 55 22Z"/><path d="M10 52h44" fill="none" stroke="#5f9a7e" stroke-width="3"/>'],
 ['왕실 문장','#465e92','<path d="M13 12h38v22Q49 48 32 57 15 48 13 34Z"/><path d="m32 19 4 10 11 1-9 7 3 11-9-6-9 6 3-11-9-7 11-1Z" fill="#f0d990" stroke="none"/>'],
 ['황금 태양','#c3942e','<circle cx="32" cy="32" r="13"/><path d="M32 5v8m0 38v8M5 32h8m38 0h8M13 13l6 6m26 26 6 6M13 51l6-6m26-26 6-6" fill="none" stroke-width="4"/><circle cx="32" cy="32" r="6" fill="#ffe9ae"/>']
];
const account=new URLSearchParams(location.search).get('player')||'guest';
const key='junja-royal-sichuan-v1:'+account;
let progress={stars:{},best:{},daily:{},tower:{floor:25,best:24}},storageAvailable=true;
try{const p=JSON.parse(localStorage.getItem(key)||'null');if(p&&typeof p==='object'){for(const k of['stars','best','daily'])if(p[k]&&typeof p[k]==='object')progress[k]=p[k];if(p.tower&&typeof p.tower==='object')progress.tower={floor:Math.max(25,Number(p.tower.floor)||25),best:Math.max(24,Number(p.tower.best)||24)};}}catch{storageAvailable=false;}
let game=null,selected=-1,busy=false,paused=false,raf=0,lastTick=0,sound=false,audio=null,epoch=0;
let battle=null,battlePollTimer=null,battlePushTimer=null,battleStartTimer=null;
function save(){try{localStorage.setItem(key,JSON.stringify(progress));}catch{storageAvailable=false;}}
function icon(id){const[s,c,p]=symbols[id-1];return `<svg viewBox="0 0 64 64" aria-hidden="true" fill="${c}" stroke="${c}" stroke-width="1.4" stroke-linejoin="round">${p}</svg><span class="tile-mark">${String(id).padStart(2,'0')}</span>`;}
function unlocked(){let n=1;while(n<=24&&progress.stars[n])n++;return Math.min(24,n);}
function campaignComplete(){for(let i=1;i<=24;i++)if(!progress.stars[i])return false;return true;}
function stopBattlePolling(){clearInterval(battlePollTimer);battlePollTimer=null;clearTimeout(battlePushTimer);battlePushTimer=null;clearTimeout(battleStartTimer);battleStartTimer=null;}
async function battleApi(path,opts={}){const res=await fetch('/api/sichuan/battle'+path,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})},credentials:'same-origin'});let data={};try{data=await res.json()}catch{}if(!res.ok){const e=new Error(data.error||'대전 서버에 연결하지 못했습니다.');e.room=data.room;throw e;}return data;}
async function leaveBattle(silent=true){if(!battle?.room?.code)return;const code=battle.room.code;stopBattlePolling();battle=null;try{await battleApi('/'+code+'/leave',{method:'POST',body:'{}'});}catch(e){status(e.message);}if(window.parent!==window)window.parent.postMessage({type:'junja-sichuan-wallet'},location.origin);}
function lobby(){if(battle?.room)leaveBattle(true);else stopBattlePolling();epoch++;cancelAnimationFrame(raf);game=null;busy=false;paused=false;$('#modal').close();document.body.classList.remove('in-game');$('#lobby').hidden=false;$('#play').hidden=true;$('#battle-strip').hidden=true;document.body.dataset.world='0';
 $('#worlds').innerHTML=worlds.map((w,wi)=>`<article class="world-card"><div class="world-art"><span>${w.icon}</span></div><div class="world-meta"><small>CHAPTER 0${wi+1}</small><h3>${w.name}</h3><p>${w.rule}</p><div class="stage-dots">${Array.from({length:6},(_,i)=>{const l=wi*6+i+1;return `<button data-level="${l}" ${l>unlocked()?'disabled':''} class="${progress.stars[l]?'cleared':l===unlocked()?'next':''}" aria-label="${l} 스테이지${progress.stars[l]?', 별 '+progress.stars[l]+'개':''}">${l>unlocked()?'·':l}</button>`;}).join('')}</div></div></article>`).join('');
 $('#progress').textContent=Object.keys(progress.stars).filter(k=>Number(k)>=1&&Number(k)<=24).length+' / 24';
 $('#continue').innerHTML=`${unlocked()===1?'정원에 입장하기':unlocked()+' 스테이지 이어하기'} <span>↗</span>`;
 const complete=campaignComplete();if(complete)$('#continue').innerHTML='왕관 완성 · 로얄 타워 입장 <span>↗</span>';const towerCard=$('#tower-card'),towerBtn=$('#tower');towerCard.classList.toggle('locked',!complete);towerCard.classList.toggle('unlocked',complete);towerBtn.disabled=!complete;towerBtn.textContent=complete?`로얄 타워 ${progress.tower.floor}층 도전 ↗`:'왕관 4개를 먼저 완성';$('#tower-desc').textContent=complete?`현재 최고 ${progress.tower.best}층 · 다음 도전 ${progress.tower.floor}층 · 10층마다 왕관 시련`:'24스테이지를 모두 완성하면 25층부터 무한 도전이 열립니다.';
 $('#relics').innerHTML=worlds.map((w,i)=>`<span class="relic ${progress.stars[(i+1)*6]?'owned':''}" title="${w.name} 6개 스테이지 완료" aria-label="${w.name} 왕관 ${progress.stars[(i+1)*6]?'획득':'미획득'}">${w.icon}</span>`).join('');
 const d=progress.daily[E.dateKey()];$('#daily-best').textContent=d?'오늘 최고 '+Number(d).toLocaleString()+'점':'매일 자정(KST)에 새로운 배치';
 if(!storageAvailable)$('.storage-note').textContent='브라우저 저장 공간을 사용할 수 없어, 이번 기록은 화면을 닫으면 유지되지 않아요.';
}
function status(t){$('#status').textContent=t;}
function beep(kind){if(!sound)return;try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();audio.resume();const notes=kind==='win'?[523,659,784,1047]:kind==='error'?[180]:[660+(game?.combo||0)*22,880];notes.forEach((f,i)=>{const o=audio.createOscillator(),v=audio.createGain(),t=audio.currentTime+i*.065;o.type='sine';o.frequency.value=f;v.gain.setValueAtTime(0,t);v.gain.linearRampToValueAtTime(.055,t+.01);v.gain.exponentialRampToValueAtTime(.001,t+.18);o.connect(v).connect(audio.destination);o.start(t);o.stop(t+.2);});}catch{}}
function start(level,mode='journey',opts={}){
 epoch++;cancelAnimationFrame(raf);$('#modal').close();const day=E.dateKey(),seed=opts.seed??(mode==='daily'?E.dateSeed(day):crypto.getRandomValues(new Uint32Array(1))[0]),boardData=mode==='tower'?E.createTower(level,seed):E.create(level,seed);
 game={...boardData,mode,seed,day,score:0,combo:0,bestCombo:0,elapsed:Math.max(0,Number(opts.elapsed)||0),lastMatch:-Infinity,feverUntil:0,hints:3,shuffles:2,used:0,pairs:0,done:false,totalPairs:boardData.board.filter(Boolean).length/2,actions:[],seconds:opts.seconds||boardData.seconds};
 if(mode==='battle'&&opts.actions?.length)restoreBattleActions(opts.actions);
 selected=-1;busy=false;paused=false;lastTick=performance.now();document.body.classList.add('in-game');$('#lobby').hidden=true;$('#play').hidden=false;$('#battle-strip').hidden=mode!=='battle';document.body.dataset.world=game.world;
 const w=worlds[game.world];$('#world-label').textContent=mode==='battle'?'ROYAL BATTLE · '+w.en:mode==='tower'?'ENDLESS ROYAL TOWER':w.en;$('#stage-title').textContent=mode==='daily'?'오늘의 별자리':mode==='zen'?'시간을 잊는 정원':mode==='battle'?`ROUND ${battle?.room?.roundNo||1} · ${battle?.room?.maxPlayers||2}인 순위전`:mode==='tower'?`ROYAL TOWER · ${level}F${game.seal?' · CROWN TRIAL':''}`:`STAGE ${String(level).padStart(2,'0')} · ${game.seal?'왕관의 시련':'빛의 연결'}`;
 $('#chapter-number').textContent=mode==='tower'?String(level).padStart(2,'0'):String(game.world+1).padStart(2,'0');$('#region-title').textContent=mode==='tower'?`왕관의 탑 ${level}층`:w.name;$('#region-description').textContent=mode==='tower'?'층이 오를수록 시간은 짧아지고 길은 더 까다로워집니다.':mode==='battle'?'상대와 완전히 같은 배치에서 먼저 정원을 비우세요.':w.desc;$('#mission').textContent=mode==='battle'?'동일 배치 · 실시간 순위 · 게임머니 베팅':mode==='tower'?(game.seal?'10층마다 찾아오는 왕관의 시련':`무한 도전 · 현재 ${level}층`):w.rule;$('#time-label').textContent=mode==='zen'?'RELAX':'TIME';
 render();hud();status(mode==='battle'?'클리어 순서대로 1위·2위·3위! 상위 순위에 상금이 지급돼요.':mode==='tower'?(game.seal?'왕관의 시련층입니다. 이 층을 넘어 기록을 갱신하세요.':'로얄 타워 '+level+'층 도전 시작!'):game.seal?'왕관의 시련 · 이 정원을 완성해 왕관을 수집하세요.':w.rule);raf=requestAnimationFrame(tick);window.scrollTo(0,0);if(mode==='battle')updateBattleStrip();
}
function restoreBattleActions(actions){
 for(const a of actions){
  if(a.kind==='hint'){game.hints--;game.used++;}
  else if(a.kind==='shuffle'){game.shuffles--;game.used++;game.combo=0;game.board=E.reshuffle(game.board,game.cols,game.rows,E.rng(game.seed+game.pairs+game.shuffles+17));}
  else if(a.kind==='match'){
   game.combo=a.t-game.lastMatch<=game.comboWindow?game.combo+1:1;game.lastMatch=a.t;game.bestCombo=Math.max(game.bestCombo,game.combo);if(game.combo%5===0)game.feverUntil=a.t+12000;
   game.score+=100*(a.t<game.feverUntil?3:game.combo>=3?2:1);game.pairs++;game.board[a.a]=game.board[a.b]=0;game.board=E.compact(game.board,game.cols,game.rows,game.gravity);
   if(game.board.some(Boolean)&&!E.moves(game.board,game.cols,game.rows,true).length)game.board=E.reshuffle(game.board,game.cols,game.rows,E.rng(game.seed+game.pairs+91));
  }
 }
 game.actions=actions.slice();
}
function render(){if(!game)return;$('#board').innerHTML=game.board.map((v,i)=>`<button class="tile ${v?'':'empty'}" data-i="${i}" ${v?'':'disabled tabindex="-1"'} aria-label="${v?symbols[v-1][0]:'빈칸'}, ${Math.floor(i/game.cols)+1}행 ${i%game.cols+1}열" aria-pressed="false">${v?icon(v):''}</button>`).join('');selected=-1;}
function hud(){if(!game)return;$('#score').textContent=game.score.toLocaleString();const left=Math.max(0,Math.ceil(game.seconds-game.elapsed/1000));$('#time').textContent=game.mode==='zen'?'∞':`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;$('#time').classList.toggle('urgent',left<=30&&game.mode!=='zen');$('#remaining').textContent=game.board.filter(Boolean).length/2;
 const fever=game.elapsed<game.feverUntil;$('#combo').textContent='×'+(fever?3:game.combo>=3?2:1);$('#combo-label').textContent=fever?'ROYAL FEVER':game.combo?game.combo+' COMBO':'ROYAL FEVER';$('#fever-bar').style.width=(fever?100*(game.feverUntil-game.elapsed)/12000:game.combo%5*20)+'%';$('#board-frame').classList.toggle('fever',fever);$('#hint-count').textContent=game.hints;$('#shuffle-count').textContent=game.shuffles;$('#hint').disabled=game.hints<=0;$('#shuffle').disabled=game.shuffles<=0;if(game.mode==='battle')updateBattleStrip();}
function tick(t){if(!game||game.done||paused)return;game.elapsed+=Math.max(0,t-lastTick);lastTick=t;if(game.elapsed-game.lastMatch>game.comboWindow)game.combo=0;hud();if(game.mode!=='zen'&&game.elapsed>=game.seconds*1000){finish(false);return;}raf=requestAnimationFrame(tick);}
function points(path){const rect=$('#board-frame').getBoundingClientRect(),tiles=$('#board').children,a=tiles[0].getBoundingClientRect(),b=tiles[1].getBoundingClientRect(),c=tiles[game.cols].getBoundingClientRect();return path.map(([x,y])=>[a.left-rect.left+a.width/2+(x-1)*(b.left-a.left),a.top-rect.top+a.height/2+(y-1)*(c.top-a.top)]);}
function line(path){$('#connections').innerHTML='<polyline points="'+points(path).map(p=>p.join(',')).join(' ')+'" />';}
function burst(index,score){const xy=points([[index%game.cols+1,Math.floor(index/game.cols)+1]])[0],root=$('#burst');root.innerHTML=`<b class="score-pop" style="left:${xy[0]-20}px;top:${xy[1]}px">+${score}</b>`+Array.from({length:8},(_,i)=>`<i class="spark" style="left:${xy[0]}px;top:${xy[1]}px;--dx:${Math.cos(i*Math.PI/4)*55}px;--dy:${Math.sin(i*Math.PI/4)*55}px">✦</i>`).join('');}
async function choose(i){if(!game||game.done||busy||paused||!game.board[i])return;const tiles=$('#board').children;document.querySelectorAll('.hinted').forEach(t=>t.classList.remove('hinted'));
 if(selected===i){tiles[i].classList.remove('selected');tiles[i].setAttribute('aria-pressed','false');selected=-1;return;}
 if(selected<0){selected=i;tiles[i].classList.add('selected');tiles[i].setAttribute('aria-pressed','true');return;}
 const a=selected,p=E.path(game.board,game.cols,game.rows,a,i);tiles[a].classList.remove('selected');tiles[a].setAttribute('aria-pressed','false');selected=-1;
 if(!p){beep('error');tiles[i].classList.remove('invalid');void tiles[i].offsetWidth;tiles[i].classList.add('invalid');selected=i;tiles[i].classList.add('selected');tiles[i].setAttribute('aria-pressed','true');status(game.board[a]===game.board[i]?'길이 막혀 있어요. 두 번 이하로 꺾이는 다른 길을 찾아보세요.':'같은 문양의 패끼리 연결해 주세요.');return;}
 busy=true;const token=epoch;line(p);tiles[a].classList.add('removing');tiles[i].classList.add('removing');game.combo=game.elapsed-game.lastMatch<=game.comboWindow?game.combo+1:1;game.lastMatch=game.elapsed;game.bestCombo=Math.max(game.bestCombo,game.combo);if(game.combo%5===0)game.feverUntil=game.elapsed+12000;
 const mult=game.elapsed<game.feverUntil?3:game.combo>=3?2:1,gain=100*mult;game.score+=gain;game.pairs++;game.board[a]=game.board[i]=0;if(game.mode==='battle'){game.actions.push({kind:'match',a,b:i,t:Math.floor(game.elapsed)});queueBattleProgress();}burst(i,gain);beep('match');hud();status(mult===3?'로얄 피버! 모든 연결 점수 ×3':game.combo>=2?game.combo+'연속 연결 · +'+gain+'점':'빛나는 연결 · +100점');
 await new Promise(r=>setTimeout(r,230));if(token!==epoch||!game)return;$('#connections').innerHTML='';game.board=E.compact(game.board,game.cols,game.rows,game.gravity);render();busy=false;
 if(game.done)return;if(!game.board.some(Boolean)){finish(true);return;}
 ensureMove();hud();
}
function ensureMove(){if(!E.moves(game.board,game.cols,game.rows,true).length){game.board=E.reshuffle(game.board,game.cols,game.rows,E.rng(game.seed+game.pairs+91));render();status('연결 가능한 패가 없어 무료로 재배치했어요.');}}
function action(kind){if(!game||game.done||busy||paused)return;if(kind==='hint'&&game.hints>0){if(game.mode==='battle'){game.actions.push({kind:'hint',t:Math.floor(game.elapsed)});queueBattleProgress();}game.hints--;game.used++;const move=E.moves(game.board,game.cols,game.rows,true)[0];if(move){for(const i of[move.a,move.b])$('#board').children[i].classList.add('hinted');status('빛나는 두 패를 연결해 보세요.');}}if(kind==='shuffle'&&game.shuffles>0){if(game.mode==='battle'){game.actions.push({kind:'shuffle',t:Math.floor(game.elapsed)});queueBattleProgress();}game.shuffles--;game.used++;game.combo=0;game.board=E.reshuffle(game.board,game.cols,game.rows,E.rng(game.seed+game.pairs+game.shuffles+17));render();status('새로운 길이 열렸어요.');}hud();}
function modal(html){$('#modal-content').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();}
function resume(){if(!game||game.done)return;$('#modal').close();paused=false;lastTick=performance.now();cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);}
function pause(){if(!game||game.done||paused)return;if(game.mode==='battle'){modal('<small>ROYAL BATTLE</small><h2>대전은 계속 진행 중</h2><p>공정한 승부를 위해 대전 시간은 화면을 가려도 멈추지 않습니다.</p><button class="gold-button" data-action="resume">대전으로 돌아가기</button><button class="outline-button" data-action="lobby">대전 포기하고 나가기</button>');return;}paused=true;cancelAnimationFrame(raf);modal('<small>TAKE A BREATH</small><h2>잠시 쉬어가세요</h2><p>정원은 그대로 기다리고 있어요.<br>시간과 콤보가 멈췄습니다.</p><button class="gold-button" data-action="resume">계속 플레이</button><button class="outline-button" data-action="lobby">정원 선택으로</button>');}

function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function battleMoney(n){return new Intl.NumberFormat('ko-KR').format(Number(n||0))+' G';}
function standings(room,result=false){
 return ''+'<div class="battle-standings">'+room.players.map(p=>'<div class="battle-standing '+(p.userId===room.me?'is-me':'')+'"><strong>'+p.rank+'위</strong><div><b>'+esc(p.nickname)+'</b><small>'+(p.forfeit?'기권':p.cleared?'클리어':p.done?'종료':p.ready?'준비 완료':'진행 중')+' · '+p.pairs+'쌍 · '+p.score.toLocaleString()+'점</small></div>'+(result?'<span class="'+(p.net>0?'profit':'')+'">'+(p.net>0?'+':'')+battleMoney(p.net)+'</span>':'')+'</div>').join('')+'</div>';
}
function updateBattleStrip(){
 if(!battle?.room||!game||game.mode!=='battle')return;const room=battle.room;if(battle.stripRoom===room)return;battle.stripRoom=room;const html='<div class="battle-pot"><small>'+room.code+' · '+'개인 순위전'+'</small><b>총 상금 '+battleMoney(room.pot)+'</b></div>'+standings(room);
 if($('#battle-strip').innerHTML!==html)$('#battle-strip').innerHTML=html;
}
let battlePollBusy=false;
function startBattlePolling(){if(!battlePollTimer)battlePollTimer=setInterval(()=>pollBattle().catch(e=>status(e.message)),3000);}
async function pollBattle(){
 if(!battle?.room?.code||battlePollBusy)return;const code=battle.room.code,requestedRound=battle.room.roundId;battlePollBusy=true;
 try{const d=await battleApi('/'+code);if(battle?.room?.code!==code||battle.room.roundId!==requestedRound)return;const oldRound=battle.room.roundId;battle.room=d.room;
 if(d.room.status==='waiting'){if(!$('#battle-theme-select'))showBattleRoom(d.room);return;}
 if(d.room.status==='playing'){
  const me=d.room.players.find(p=>p.userId===d.room.me);
  if(me?.done){if(game)game.done=true;cancelAnimationFrame(raf);modal('<small>ROYAL BATTLE</small><h2>내 플레이 완료 · 순위 집계 중</h2>'+standings(d.room)+'<p>전원 종료 또는 제한시간 종료 후 자동 정산됩니다.</p><button class="outline-button" data-action="battle-exit">결과를 기다리지 않고 나가기</button>');return;}
  if(!game||game.mode!=='battle'||oldRound!==d.room.roundId)startBattleRoom(d.room);else updateBattleStrip();return;
 }
 if(d.room.status==='complete')showBattleResult(d.room);
 }finally{battlePollBusy=false;}
}
function battleTheme(level){
 const map={6:{name:'에메랄드 정원',sub:'CHAPTER 1 · 클래식'},12:{name:'달빛의 회랑',sub:'CHAPTER 2 · 중력'},18:{name:'별의 도서관',sub:'CHAPTER 3 · 스피드 피버'},24:{name:'황금 왕좌',sub:'CHAPTER 4 · 로열 중력'}};
 return map[Number(level)]||map[18];
}
function battleThemeOptions(selected){
 return [6,12,18,24].map(level=>{const t=battleTheme(level);return '<option value="'+level+'" '+(Number(selected)===level?'selected':'')+'>'+t.sub+' · '+t.name+'</option>';}).join('');
}
function battleRoomMarkup(room){
 const me=room.players.find(p=>p.userId===room.me),isHost=room.hostId===room.me,theme=battleTheme(room.level),cards=room.players.map(p=>'<div class="battle-player-card '+(p.ready?'ready':'')+'"><b>'+esc(p.nickname)+(p.userId===room.hostId?' ♛':'')+'</b><span>'+(p.ready?'✓ 준비 완료':'대기 중')+'</span></div>').join('');
 return '<div class="battle-room"><small>ROYAL BATTLE · '+'RANKED MATCH'+'</small><h2>ROUND '+room.roundNo+' · '+room.players.length+' / '+room.maxPlayers+'명 · '+esc(theme.name)+'</h2><div class="battle-room-code">'+room.code+'</div><div class="battle-theme-summary"><small>1인 베팅금</small><b>'+battleMoney(room.bet)+'</b><span>총 상금 '+battleMoney(room.bet*room.maxPlayers)+' · 제한시간 '+room.seconds+'초</span></div><p>방장 테마가 전원에게 자동 적용됩니다. 다음 라운드는 12초씩 짧아져 최저 60초까지 어려워집니다. 정원 전원 준비 시 참가금을 차감하고 시작합니다.</p><div class="battle-players">'+cards+'</div>'+(isHost?'<button class="outline-button" data-action="battle-theme">테마 바꾸기</button>':'')+'<button class="gold-button" data-action="battle-ready">'+(me?.ready?'준비 취소':battleMoney(room.bet)+' 베팅에 동의하고 준비')+'</button><p>'+battleRules()+'</p><button class="outline-button" data-action="battle-exit">대전방 나가기</button></div>';
}
function battleRules(){return '클리어 순서 → 연결 수 → 점수 순으로 순위를 정합니다. 기권자를 제외한 2명: 1위 100% / 3명: 1·2위 70·30% / 4~8명: 1·2·3위 60·30·10%. 동순위는 해당 등수의 상금을 합쳐 균등 분배합니다.';}
function showBattleRoom(room){
 battle=battle||{};battle.room=room;battle.resultShown=false;
 if(game?.mode==='battle'){game.done=true;cancelAnimationFrame(raf);game=null;}
 modal(battleRoomMarkup(room));startBattlePolling();
}
async function openBattle(){
 if(battle?.room){showBattleRoom(battle.room);return;}
 stopBattlePolling();battle=null;
 modal('<small>ROYAL BATTLE · 2–8 PLAYERS</small><div id="battle-public-rooms">참가 가능한 방을 불러오는 중…</div><button class="outline-button" data-action="battle-refresh">방 목록 새로고침</button><h2>왕관을 건 순위 대결</h2><p>방장의 테마와 같은 배치로 승부합니다. 각자 도전해 1위·2위·3위를 겨뤄보세요.</p><label><small>방장 테마</small><select id="battle-level" class="battle-select">'+battleThemeOptions(18)+'</select></label><label><small>참가 인원</small><select id="battle-size" class="battle-select">'+[2,3,4,5,6,7,8].map(n=>'<option value="'+n+'">'+n+'명</option>').join('')+'</select></label><label><small>1인 베팅금 · 게임머니 G</small><input id="battle-bet" class="battle-select" inputmode="numeric" value="1000000" maxlength="15"></label><p>1,000G~100조G · 1,000G 단위. 진행 중 기권하면 참가금은 반환되지 않습니다.</p><p>'+battleRules()+'</p><button class="gold-button" data-action="battle-create">베팅 대전방 만들기</button><button class="outline-button" data-action="close-help">닫기</button>');
 await loadBattleRooms();
}
async function createBattle(){
 const level=Number($('#battle-level')?.value||18),maxPlayers=Number($('#battle-size').value),bet=$('#battle-bet').value.replace(/,/g,'').trim();try{const d=await battleApi('/create',{method:'POST',body:JSON.stringify({level,maxPlayers,bet})});showBattleRoom(d.room);}catch(e){modal('<h2>대전방을 만들지 못했어요</h2><p>'+esc(e.message)+'</p><button class="gold-button" data-action="battle-lobby">다시 시도</button>');}
}
async function loadBattleRooms(){
 try{const d=await battleApi('/rooms'),el=$('#battle-public-rooms');if(!el)return;
 el.innerHTML='<h3>공개 대결방 · 비밀번호 없음</h3>'+(d.activeCode?'<button class="gold-button" data-join="'+esc(d.activeCode)+'">참가 중인 방으로 돌아가기</button>':'')+(d.rooms.length?d.rooms.map(r=>'<button class="public-battle-room" data-join="'+esc(r.code)+'"><b>'+esc(r.host)+'의 방 · '+r.players+'/'+r.maxPlayers+'명</b><span>'+esc(battleTheme(r.level).name)+' · '+battleMoney(r.bet)+'</span><small>ROUND '+r.roundNo+' · '+r.seconds+'초 · 눌러서 참가</small></button>').join(''):'<p>아직 열린 방이 없어요. 첫 대결방을 만들어보세요.</p>');
 }catch(e){const el=$('#battle-public-rooms');if(el)el.textContent=e.message;}
}
async function joinBattle(code){
 try{const d=await battleApi('/'+encodeURIComponent(code)+'/join',{method:'POST',body:'{}'});if(d.room.status==='playing')startBattleRoom(d.room);else if(d.room.status==='complete')showBattleResult(d.room);else showBattleRoom(d.room);}catch(e){modal('<h2>대전방 참가 실패</h2><p>'+esc(e.message)+'</p><button class="gold-button" data-action="battle-lobby">방 목록으로</button>');}
}
function openBattleThemePicker(){
 if(!battle?.room)return;const room=battle.room;if(Number(room.hostId)!==Number(room.me)){showBattleRoom(room);return;}
 modal('<small>HOST THEME SELECT</small><h2>이번 대전 테마 변경</h2><p>방장이 고르면 상대 화면도 자동으로 같은 테마로 바뀝니다.</p><select id="battle-theme-select" class="battle-select">'+battleThemeOptions(room.level)+'</select><button class="gold-button" data-action="battle-theme-apply">이 테마 적용</button><button class="outline-button" data-action="battle-room-back">취소</button>');
}
async function applyBattleTheme(){
 if(!battle?.room)return;const level=Number($('#battle-theme-select')?.value||battle.room.level);
 try{const d=await battleApi('/'+battle.room.code+'/theme',{method:'POST',body:JSON.stringify({level})});showBattleRoom(d.room);}catch(e){modal('<h2>테마 변경 실패</h2><p>'+esc(e.message)+'</p><button class="outline-button" data-action="battle-room-back">대전방으로</button>');}
}
async function rematchBattle(){
 if(!battle?.room)return;try{const d=await battleApi('/'+battle.room.code+'/rematch',{method:'POST',body:'{}'});game=null;showBattleRoom(d.room);}catch(e){modal('<h2>재대결 준비 실패</h2><p>'+esc(e.message)+'</p><button class="outline-button" data-action="battle-room-back">대전방으로</button>');}
}
function startBattleRoom(room){
 battle=battle||{};battle.room=room;battle.resultShown=false;const startAt=Number(room.startedAt||Date.now()),wait=startAt-Date.now(),theme=battleTheme(room.level);startBattlePolling();
 if(wait>30){modal('<small>ROYAL BATTLE · '+esc(theme.name)+'</small><h2>참가자 전원 준비 완료</h2><p>방장이 선택한 <b>'+esc(theme.name)+'</b> 테마로 동시에 시작합니다.</p><div class="result-score">VS</div>');clearTimeout(battleStartTimer);battleStartTimer=setTimeout(()=>startBattleRoom(room),wait+25);return;}
 const elapsed=Math.max(0,Date.now()-startAt);start(room.level,'battle',{seed:room.seed,elapsed,seconds:room.seconds,actions:room.myActions});if(window.parent!==window)window.parent.postMessage({type:'junja-sichuan-wallet'},location.origin);
}
async function toggleBattleReady(){
 if(!battle?.room)return;const me=battle.room.players.find(p=>Number(p.userId)===Number(battle.room.me));try{const d=await battleApi('/'+battle.room.code+'/ready',{method:'POST',body:JSON.stringify({ready:!me?.ready,roundId:battle.room.roundId})});battle.room=d.room;if(d.room.status==='playing')startBattleRoom(d.room);else showBattleRoom(d.room);}catch(e){modal('<h2>준비 상태 오류</h2><p>'+esc(e.message)+'</p><button class="outline-button" data-action="battle-room-back">대전방으로</button>');}
}
function queueBattleProgress(){if(!battle?.room||!game||game.mode!=='battle'||game.done||battlePushTimer)return;battlePushTimer=setTimeout(()=>{battlePushTimer=null;pushBattleProgress(false).catch(e=>status(e.message));},2000);}
async function pushBattleProgress(done=false){
 if(!battle?.room||!game||game.mode!=='battle')return null;
 const code=battle.room.code,roundId=battle.room.roundId;
 const d=await battleApi('/'+code+'/progress',{method:'POST',body:JSON.stringify({roundId,actions:game.actions,done})});
 if(battle?.room?.code!==code||battle.room.roundId!==roundId)return null;battle.room=d.room;updateBattleStrip();if(d.room.status==='complete')showBattleResult(d.room);return d.room;
}
function finishBattle(cleared){
 if(!game||game.done)return;game.done=true;cancelAnimationFrame(raf);clearTimeout(battlePushTimer);battlePushTimer=null;hud();
 modal('<small>ROYAL BATTLE</small><h2>'+(cleared?'클리어! 순위를 집계합니다':'시간 종료 · 정산 대기')+'</h2><p>전원 종료 후 등수와 획득 게임머니가 표시됩니다.</p>'+standings(battle.room));
 const send=()=>pushBattleProgress(true).catch(e=>{if(!battle?.room||battle.room.status==='complete')return;status(e.message+' · 기록 전송 재시도 중');battlePushTimer=setTimeout(send,3000);});send();startBattlePolling();
}
function showBattleResult(room){
 if(!battle)battle={};battle.room=room;if(battle.resultShown)return;battle.resultShown=true;
 clearTimeout(battlePushTimer);battlePushTimer=null;if(game?.mode==='battle'){game.done=true;cancelAnimationFrame(raf);updateBattleStrip();}
 const me=room.players.find(p=>p.userId===room.me),isHost=room.hostId===room.me,win=room.winnerIds?.includes(room.me);
 modal('<div class="modal-badge">'+(win?'♛':'☾')+'</div><small>ROYAL BATTLE RESULT</small><h2>'+ ('최종 '+me?.rank+'위')+'</h2><div class="battle-theme-summary"><small>내 상금 / 순손익</small><b>'+battleMoney(me?.payout)+'</b><span>'+(me?.net>0?'+':'')+battleMoney(me?.net)+'</span></div>'+standings(room,true)+(isHost?'<button class="gold-button" data-action="battle-rematch">다음 라운드 도전 · 시간 단축 ↗</button><button class="outline-button" data-action="battle-theme">다른 테마 선택</button>':'<p>방장이 재대결이나 다른 테마를 선택하면 자동으로 대기실로 이동합니다.</p>')+'<button class="outline-button" data-action="battle-exit">대전방 나가기</button>');
 startBattlePolling();
 if(window.parent!==window)window.parent.postMessage({type:'junja-sichuan-wallet'},location.origin);
}
function finish(won){if(!game||game.done)return;if(game.mode==='battle'){finishBattle(won);return;}game.done=true;cancelAnimationFrame(raf);const timeBonus=game.mode==='zen'?0:Math.max(0,Math.floor(game.seconds-game.elapsed/1000))*10;let stars=0;
 if(won){game.score+=timeBonus;stars=1+(game.used<=2?1:0)+(game.used===0&&game.elapsed<=game.seconds*700?1:0);if(game.mode==='journey'){progress.stars[game.level]=Math.max(Number(progress.stars[game.level])||0,stars);progress.best[game.level]=Math.max(Number(progress.best[game.level])||0,game.score);}else if(game.mode==='daily'){progress.daily[game.day]=Math.max(Number(progress.daily[game.day])||0,game.score);const days=Object.keys(progress.daily).sort();while(days.length>30)delete progress.daily[days.shift()];}else if(game.mode==='tower'){progress.tower.best=Math.max(Number(progress.tower.best)||24,game.level);progress.tower.floor=Math.max(Number(progress.tower.floor)||25,game.level+1);}save();beep('win');}hud();
 if(won&&game.mode==='journey'&&game.level===24){modal('<div class="ending-crown">♛</div><small>THE FOUR CROWNS ARE COMPLETE</small><h2>왕관의 정원을 완성했습니다</h2><p class="ending-copy">24번째 정원의 마지막 빛이 연결되며 네 개의 왕관이 하나가 되었습니다.<br><b>이제 끝없는 로얄 타워가 열립니다.</b></p><div class="result-score">'+game.score.toLocaleString()+'</div><small>FINAL STAGE POINTS</small><button class="gold-button" data-action="tower">25층 · 로얄 타워 입장 ↗</button><button class="outline-button" data-action="battle-lobby">친구와 베팅 대전</button><button class="outline-button" data-action="lobby">완성된 정원 보기</button>');return;}
 if(won&&game.mode==='tower'){const milestone=game.level%10===0;modal('<div class="tower-floor-badge">'+game.level+'F</div><small>ROYAL TOWER CLEARED</small><h2>'+(milestone?'왕관 시련을 돌파했습니다':'한 층 더 높은 왕좌로')+'</h2>'+(milestone?'<span class="tower-milestone">CROWN MILESTONE</span>':'')+'<div class="result-score">'+game.score.toLocaleString()+'</div><small>POINTS</small><div class="result-stats"><div><small>최고 콤보</small><b>'+game.bestCombo+'</b></div><div><small>연결한 패</small><b>'+game.pairs+'쌍</b></div><div><small>현재 최고층</small><b>'+progress.tower.best+'F</b></div></div><button class="gold-button" data-action="tower-next">'+(game.level+1)+'층 계속 도전 ↗</button><button class="outline-button" data-action="lobby">정원 선택으로</button>');return;}
 modal(`<div class="modal-badge">${won?worlds[game.world].icon:'☾'}</div><small>${won?'GARDEN COMPLETE':'ANOTHER CHANCE'}</small><h2>${won?(game.seal&&game.mode==='journey'?'왕관을 찾았어요':'정원이 빛나기 시작합니다'):'별빛이 잠시 쉬어갑니다'}</h2>${won?`<div class="result-stars" aria-label="별 ${stars}개">${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</div>`:'<p>찾아낸 길을 기억하며, 다시 한번 도전해 보세요.</p>'}<div class="result-score">${game.score.toLocaleString()}</div><small>POINTS</small><div class="result-stats"><div><small>최고 콤보</small><b>${game.bestCombo}</b></div><div><small>연결한 패</small><b>${game.pairs}쌍</b></div><div><small>시간 보너스</small><b>${won?timeBonus:0}</b></div></div>${won&&game.mode==='journey'&&game.level<24?'<button class="gold-button" data-action="next">다음 정원으로 ↗</button>':'<button class="gold-button" data-action="retry">한 번 더 도전</button>'}<button class="outline-button" data-action="lobby">정원 선택으로</button><p>${storageAvailable?'기록은 이 기기에 저장됩니다.':'저장 공간을 사용할 수 없어 기록이 유지되지 않아요.'}</p>`);
}
function help(){if(game&&!game.done&&game.mode!=='battle'){paused=true;cancelAnimationFrame(raf);}modal('<small>HOW TO PLAY</small><h2>두 개의 패, 하나의 길</h2><p>같은 문양의 패 두 개를 누르세요. 다른 패를 통과하지 않고, <b>두 번 이하로 꺾이는 선</b>으로 이어지면 사라집니다. 판 바깥 테두리도 길이 됩니다.</p><p>빠르게 연결하면 콤보! <b>5콤보마다 12초간 로얄 피버</b>가 켜져 점수가 3배가 됩니다. 힌트 3회와 재배치 2회를 사용할 수 있고, 막힌 판은 무료로 재배치됩니다.</p><p>24스테이지를 모두 깨면 <b>25층부터 무한 로얄 타워</b>가 열립니다. 대전모드는 2~8명이 각자 겨루는 개인 순위전입니다. 같은 배치에서 승부하고 등수에 따라 게임머니를 정산합니다.</p><p>별 1개는 클리어, 2개는 도구 2회 이하, 3개는 도구 없이 제한시간 70% 이내 클리어입니다. 휴식 모드는 스테이지 진행도에 반영되지 않아요.</p><button class="gold-button" data-action="close-help">알겠어요</button>');}
function confirmRestart(){if(!game||busy||game.done)return;if(game.mode==='battle'){modal('<small>ROYAL BATTLE</small><h2>대전 중에는 다시 시작할 수 없어요</h2><p>참가자들이 같은 조건으로 승부 중입니다. 현재 판을 계속하거나 대전을 포기할 수 있습니다.</p><button class="gold-button" data-action="resume">계속 플레이</button><button class="outline-button" data-action="lobby">대전 포기</button>');return;}paused=true;cancelAnimationFrame(raf);modal('<h2>다시 시작할까요?</h2><p>이번 판 점수는 사라지고 새로운 배치로 시작해요. 오늘의 도전은 같은 배치로 다시 시작합니다.</p><button class="gold-button" data-action="retry">다시 시작</button><button class="outline-button" data-action="resume">계속 플레이</button>');}
$('#board').addEventListener('click',e=>{const t=e.target.closest('[data-i]');if(t)choose(Number(t.dataset.i));});
$('#worlds').addEventListener('click',e=>{const b=e.target.closest('[data-level]');if(b&&!b.disabled)start(Number(b.dataset.level));});
$('#continue').onclick=()=>campaignComplete()?start(progress.tower.floor,'tower'):start(unlocked());$('#tower').onclick=()=>{if(campaignComplete())start(progress.tower.floor,'tower')};$('#battle').onclick=openBattle;$('#zen').onclick=()=>start(unlocked(),'zen');$('#daily').onclick=()=>start(9,'daily');$('#hint').onclick=()=>action('hint');$('#shuffle').onclick=()=>action('shuffle');$('#pause').onclick=pause;$('#restart').onclick=confirmRestart;$('#help').onclick=help;
$('#sound').onclick=()=>{sound=!sound;$('#sound').setAttribute('aria-pressed',String(sound));$('#sound').setAttribute('aria-label',sound?'효과음 끄기':'효과음 켜기');beep('match');};
$('#home').onclick=e=>{e.preventDefault();if(game&&!game.done)pause();else lobby();};
$('#exit').onclick=()=>{pause();if(window.parent!==window)window.parent.postMessage({type:'junja-sichuan-exit'},location.origin);else location.href='/';};
$('#modal').addEventListener('click',e=>{const join=e.target.closest('[data-join]')?.dataset.join;if(join){joinBattle(join);return;}const a=e.target.closest('[data-action]')?.dataset.action;if(!a)return;if(a==='resume')resume();if(a==='lobby')lobby();if(a==='next')start(game.level+1);if(a==='retry')start(game.level,game.mode);if(a==='tower')start(progress.tower.floor,'tower');if(a==='tower-next')start(game.level+1,'tower');if(a==='battle-lobby')openBattle();if(a==='battle-create')createBattle();if(a==='battle-refresh')loadBattleRooms();if(a==='battle-ready')toggleBattleReady();if(a==='battle-theme')openBattleThemePicker();if(a==='battle-theme-apply')applyBattleTheme();if(a==='battle-rematch')rematchBattle();if(a==='battle-room-back'&&battle?.room)showBattleRoom(battle.room);if(a==='battle-exit'){leaveBattle(true).finally(()=>lobby());}if(a==='close-help'){if(game&&!game.done)resume();else $('#modal').close();}});
$('#modal').addEventListener('cancel',e=>{e.preventDefault();if(game&&!game.done)resume();else if(game?.done)lobby();else $('#modal').close();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modal').open)pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',()=>{if(battle?.room)navigator.sendBeacon('/api/sichuan/battle/'+battle.room.code+'/leave',new Blob(['{}'],{type:'application/json'}));});
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==window.parent||e.data?.type!=='junja-sichuan-pause')return;if(battle?.room&&battle.room.status!=='complete'){leaveBattle(true);if(game){game.done=true;cancelAnimationFrame(raf);}return;}pause();});
window.addEventListener('resize',()=>{$('#connections').innerHTML='';});
lobby();
})();

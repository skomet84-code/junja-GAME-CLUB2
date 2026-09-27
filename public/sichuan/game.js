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
let battle=null,battlePollTimer=null,battlePushTimer=null,battleMe=null;
function save(){try{localStorage.setItem(key,JSON.stringify(progress));}catch{storageAvailable=false;}}
function icon(id){const[s,c,p]=symbols[id-1];return `<svg viewBox="0 0 64 64" aria-hidden="true" fill="${c}" stroke="${c}" stroke-width="1.4" stroke-linejoin="round">${p}</svg><span class="tile-mark">${String(id).padStart(2,'0')}</span>`;}
function unlocked(){let n=1;while(n<=24&&progress.stars[n])n++;return Math.min(24,n);}
function campaignComplete(){for(let i=1;i<=24;i++)if(!progress.stars[i])return false;return true;}
function stopBattlePolling(){clearInterval(battlePollTimer);battlePollTimer=null;clearTimeout(battlePushTimer);battlePushTimer=null;}
async function battleApi(path,opts={}){const res=await fetch('/api/sichuan/battle'+path,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})},credentials:'same-origin'});let data={};try{data=await res.json()}catch{}if(!res.ok){const e=new Error(data.error||'대전 서버에 연결하지 못했습니다.');e.room=data.room;throw e;}return data;}
async function leaveBattle(silent=true){if(!battle?.room?.code)return;const code=battle.room.code;stopBattlePolling();battle=null;try{await battleApi('/'+code+'/leave',{method:'POST',body:'{}'});}catch(e){if(!silent)status(e.message);}}
function lobby(){if(game?.mode==='battle'&&battle?.room?.status!=='complete')leaveBattle(true);else stopBattlePolling();epoch++;cancelAnimationFrame(raf);game=null;busy=false;paused=false;$('#modal').close();document.body.classList.remove('in-game');$('#lobby').hidden=false;$('#play').hidden=true;$('#battle-strip').hidden=true;document.body.dataset.world='0';
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
 game={...boardData,mode,seed,day,score:0,combo:0,bestCombo:0,elapsed:Math.max(0,Number(opts.elapsed)||0),lastMatch:-Infinity,feverUntil:0,hints:3,shuffles:2,used:0,pairs:0,done:false,totalPairs:boardData.board.filter(Boolean).length/2};
 selected=-1;busy=false;paused=false;lastTick=performance.now();document.body.classList.add('in-game');$('#lobby').hidden=true;$('#play').hidden=false;$('#battle-strip').hidden=mode!=='battle';document.body.dataset.world=game.world;
 const w=worlds[game.world];$('#world-label').textContent=mode==='battle'?'ROYAL BATTLE · '+w.en:mode==='tower'?'ENDLESS ROYAL TOWER':w.en;$('#stage-title').textContent=mode==='daily'?'오늘의 별자리':mode==='zen'?'시간을 잊는 정원':mode==='battle'?`1 VS 1 · STAGE ${String(level).padStart(2,'0')}`:mode==='tower'?`ROYAL TOWER · ${level}F${game.seal?' · CROWN TRIAL':''}`:`STAGE ${String(level).padStart(2,'0')} · ${game.seal?'왕관의 시련':'빛의 연결'}`;
 $('#chapter-number').textContent=mode==='tower'?String(level).padStart(2,'0'):String(game.world+1).padStart(2,'0');$('#region-title').textContent=mode==='tower'?`왕관의 탑 ${level}층`:w.name;$('#region-description').textContent=mode==='tower'?'층이 오를수록 시간은 짧아지고 길은 더 까다로워집니다.':mode==='battle'?'상대와 완전히 같은 배치에서 먼저 정원을 비우세요.':w.desc;$('#mission').textContent=mode==='battle'?'동일 배치 · 선착순 클리어':mode==='tower'?(game.seal?'10층마다 찾아오는 왕관의 시련':`무한 도전 · 현재 ${level}층`):w.rule;$('#time-label').textContent=mode==='zen'?'RELAX':'TIME';
 render();hud();status(mode==='battle'?'같은 판, 같은 시간. 먼저 전부 연결하면 승리!':mode==='tower'?(game.seal?'왕관의 시련층입니다. 이 층을 넘어 기록을 갱신하세요.':'로얄 타워 '+level+'층 도전 시작!'):game.seal?'왕관의 시련 · 이 정원을 완성해 왕관을 수집하세요.':w.rule);raf=requestAnimationFrame(tick);window.scrollTo(0,0);if(mode==='battle')updateBattleStrip();
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
 const mult=game.elapsed<game.feverUntil?3:game.combo>=3?2:1,gain=100*mult;game.score+=gain;game.pairs++;game.board[a]=game.board[i]=0;if(game.mode==='battle')queueBattleProgress();burst(i,gain);beep('match');hud();status(mult===3?'로얄 피버! 모든 연결 점수 ×3':game.combo>=2?game.combo+'연속 연결 · +'+gain+'점':'빛나는 연결 · +100점');
 await new Promise(r=>setTimeout(r,230));if(token!==epoch||!game)return;$('#connections').innerHTML='';game.board=E.compact(game.board,game.cols,game.rows,game.gravity);render();busy=false;
 if(game.done)return;if(!game.board.some(Boolean)){finish(true);return;}
 ensureMove();hud();
}
function ensureMove(){if(!E.moves(game.board,game.cols,game.rows,true).length){game.board=E.reshuffle(game.board,game.cols,game.rows,E.rng(game.seed+game.pairs+91));render();status('연결 가능한 패가 없어 무료로 재배치했어요.');}}
function action(kind){if(!game||game.done||busy||paused)return;if(kind==='hint'&&game.hints>0){game.hints--;game.used++;const move=E.moves(game.board,game.cols,game.rows,true)[0];if(move){for(const i of[move.a,move.b])$('#board').children[i].classList.add('hinted');status('빛나는 두 패를 연결해 보세요.');}}if(kind==='shuffle'&&game.shuffles>0){game.shuffles--;game.used++;game.combo=0;game.board=E.reshuffle(game.board,game.cols,game.rows,E.rng(game.seed+game.pairs+game.shuffles+17));render();status('새로운 길이 열렸어요.');}hud();}
function modal(html){$('#modal-content').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();}
function resume(){if(!game||game.done)return;$('#modal').close();paused=false;lastTick=performance.now();cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);}
function pause(){if(!game||game.done||paused)return;if(game.mode==='battle'){modal('<small>ROYAL BATTLE</small><h2>대전은 계속 진행 중</h2><p>공정한 승부를 위해 대전 시간은 화면을 가려도 멈추지 않습니다.</p><button class="gold-button" data-action="resume">대전으로 돌아가기</button><button class="outline-button" data-action="lobby">대전 포기하고 나가기</button>');return;}paused=true;cancelAnimationFrame(raf);modal('<small>TAKE A BREATH</small><h2>잠시 쉬어가세요</h2><p>정원은 그대로 기다리고 있어요.<br>시간과 콤보가 멈췄습니다.</p><button class="gold-button" data-action="resume">계속 플레이</button><button class="outline-button" data-action="lobby">정원 선택으로</button>');}

function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function updateBattleStrip(){
 if(!battle?.room||!game||game.mode!=='battle')return;const room=battle.room,me=room.players.find(p=>Number(p.userId)===Number(room.me)),rival=room.players.find(p=>Number(p.userId)!==Number(room.me)),total=Math.max(1,game.totalPairs||1);
 $('#battle-code').textContent=room.code;$('#battle-me-name').textContent=me?.nickname||'나';$('#battle-rival-name').textContent=rival?.nickname||'상대';$('#battle-me-pairs').textContent=game.pairs+'/'+total;$('#battle-rival-pairs').textContent=(rival?.pairs||0)+'/'+total;$('#battle-me-bar').style.width=Math.min(100,game.pairs/total*100)+'%';$('#battle-rival-bar').style.width=Math.min(100,Number(rival?.pairs||0)/total*100)+'%';
}
function startBattlePolling(){stopBattlePolling();battlePollTimer=setInterval(()=>pollBattle().catch(()=>{}),1800);}
async function pollBattle(){
 if(!battle?.room?.code)return;const d=await battleApi('/'+battle.room.code);battle.room=d.room;
 if(d.room.status==='waiting'){if(!game||game.mode!=='battle')modal(battleRoomMarkup(d.room));return;}
 if(d.room.status==='playing'){if(!game||game.mode!=='battle')startBattleRoom(d.room);else updateBattleStrip();return;}
 if(d.room.status==='complete')showBattleResult(d.room);
}
function battleRoomMarkup(room){
 const me=room.players.find(p=>Number(p.userId)===Number(room.me)),cards=room.players.map(p=>'<div class="battle-player-card '+(p.ready?'ready':'')+'"><b>'+esc(p.nickname)+'</b><span>'+(p.ready?'✓ 준비 완료':'대기 중')+'</span></div>').join('')+(room.players.length<2?'<div class="battle-player-card"><b>상대 기다리는 중</b><span>코드로 참가하면 바로 표시됩니다.</span></div>':'');
 return '<div class="battle-room"><small>ROYAL BATTLE · PRIVATE ROOM</small><h2>같은 판에서 정면승부</h2><div class="battle-room-code">'+room.code+'</div><p>친구에게 이 6자리 코드를 알려주세요. 두 명 모두 준비하면 같은 배치로 동시에 시작합니다.</p><div class="battle-players">'+cards+'</div><button class="gold-button" data-action="battle-ready">'+(me?.ready?'준비 취소':'준비 완료')+'</button><button class="outline-button" data-action="battle-leave">방 나가기</button></div>';
}
function showBattleRoom(room){battle=battle||{};battle.room=room;battle.resultShown=false;modal(battleRoomMarkup(room));startBattlePolling();}
async function openBattle(){
 stopBattlePolling();battle=null;modal('<small>ROYAL BATTLE · 1 VS 1</small><h2>친구와 왕관 쟁탈전</h2><p>게임머니 베팅 없이 실력만 겨룹니다. 서버에는 방 상태와 진행도만 가볍게 전송하고, 패 판정은 각 기기에서 처리합니다.</p><label><small>대전 난이도</small><select id="battle-level" class="battle-select"><option value="6">CHAPTER 1 · 클래식</option><option value="12">CHAPTER 2 · 중력</option><option value="18" selected>CHAPTER 3 · 스피드 피버</option><option value="24">CHAPTER 4 · 황금 왕좌</option></select></label><button class="gold-button" data-action="battle-create">새 대전방 만들기</button><div class="battle-join"><input id="battle-code-input" maxlength="6" autocomplete="off" placeholder="6자리 방 코드"><button class="outline-button" data-action="battle-join">코드로 참가</button></div><button class="outline-button" data-action="close-help">닫기</button>');
}
async function createBattle(){
 const level=Number($('#battle-level')?.value||18);try{const d=await battleApi('/create',{method:'POST',body:JSON.stringify({level})});showBattleRoom(d.room);}catch(e){modal('<h2>대전방을 만들지 못했어요</h2><p>'+esc(e.message)+'</p><button class="gold-button" data-action="battle-lobby">다시 시도</button>');}
}
async function joinBattle(){
 const code=String($('#battle-code-input')?.value||'').trim().toUpperCase();if(code.length!==6){modal('<h2>방 코드 확인</h2><p>6자리 대전방 코드를 입력해주세요.</p><button class="gold-button" data-action="battle-lobby">다시 입력</button>');return;}
 try{const d=await battleApi('/'+encodeURIComponent(code)+'/join',{method:'POST',body:'{}'});showBattleRoom(d.room);}catch(e){modal('<h2>대전방 참가 실패</h2><p>'+esc(e.message)+'</p><button class="gold-button" data-action="battle-lobby">다시 입력</button>');}
}
function startBattleRoom(room){battle=battle||{};battle.room=room;battle.resultShown=false;const elapsed=Math.max(0,Date.now()-Number(room.startedAt||Date.now()));start(room.level,'battle',{seed:room.seed,elapsed});startBattlePolling();}
async function toggleBattleReady(){
 if(!battle?.room)return;const me=battle.room.players.find(p=>Number(p.userId)===Number(battle.room.me));try{const d=await battleApi('/'+battle.room.code+'/ready',{method:'POST',body:JSON.stringify({ready:!me?.ready})});battle.room=d.room;if(d.room.status==='playing')startBattleRoom(d.room);else showBattleRoom(d.room);}catch(e){modal('<h2>준비 상태 오류</h2><p>'+esc(e.message)+'</p><button class="outline-button" data-action="battle-lobby">대전 메뉴</button>');}
}
function queueBattleProgress(){if(!battle?.room||!game||game.mode!=='battle'||game.done)return;clearTimeout(battlePushTimer);battlePushTimer=setTimeout(()=>pushBattleProgress(false,false).catch(()=>{}),650);}
async function pushBattleProgress(done=false,cleared=false){
 if(!battle?.room||!game||game.mode!=='battle')return null;const d=await battleApi('/'+battle.room.code+'/progress',{method:'POST',body:JSON.stringify({pairs:game.pairs,score:game.score,combo:game.bestCombo,done,cleared})});battle.room=d.room;updateBattleStrip();if(d.room.status==='complete')showBattleResult(d.room);return d.room;
}
function finishBattle(cleared){
 if(!game||game.done)return;game.done=true;cancelAnimationFrame(raf);hud();modal('<small>ROYAL BATTLE</small><h2>'+(cleared?'정원을 모두 연결했어요!':'시간 종료')+'</h2><p>두 플레이어의 진행도를 확인하고 있습니다.</p><div class="result-score">'+game.score.toLocaleString()+'</div><small>POINTS</small>');pushBattleProgress(true,cleared).catch(()=>{});startBattlePolling();
}
function showBattleResult(room){
 if(!battle)battle={};battle.room=room;if(battle.resultShown)return;battle.resultShown=true;stopBattlePolling();if(game?.mode==='battle'){game.done=true;cancelAnimationFrame(raf);updateBattleStrip();}
 const me=room.players.find(p=>Number(p.userId)===Number(room.me)),rival=room.players.find(p=>Number(p.userId)!==Number(room.me)),draw=!room.winnerId,win=Number(room.winnerId)===Number(room.me);
 modal('<div class="modal-badge">'+(draw?'✦':win?'♛':'☾')+'</div><small>ROYAL BATTLE RESULT</small><h2>'+(draw?'완벽한 무승부':win?'왕관 쟁탈전 승리!':'이번 왕관은 상대에게')+'</h2><div class="result-stats"><div><small>'+esc(me?.nickname||'나')+'</small><b>'+(me?.pairs||0)+'쌍 · '+Number(me?.score||0).toLocaleString()+'</b></div><div><small>'+esc(rival?.nickname||'상대')+'</small><b>'+(rival?.pairs||0)+'쌍 · '+Number(rival?.score||0).toLocaleString()+'</b></div></div><button class="gold-button" data-action="battle-lobby">새 대전 시작</button><button class="outline-button" data-action="lobby">정원 선택으로</button>');
}
function finish(won){if(!game||game.done)return;if(game.mode==='battle'){finishBattle(won);return;}game.done=true;cancelAnimationFrame(raf);const timeBonus=game.mode==='zen'?0:Math.max(0,Math.floor(game.seconds-game.elapsed/1000))*10;let stars=0;
 if(won){game.score+=timeBonus;stars=1+(game.used<=2?1:0)+(game.used===0&&game.elapsed<=game.seconds*700?1:0);if(game.mode==='journey'){progress.stars[game.level]=Math.max(Number(progress.stars[game.level])||0,stars);progress.best[game.level]=Math.max(Number(progress.best[game.level])||0,game.score);}else if(game.mode==='daily'){progress.daily[game.day]=Math.max(Number(progress.daily[game.day])||0,game.score);const days=Object.keys(progress.daily).sort();while(days.length>30)delete progress.daily[days.shift()];}else if(game.mode==='tower'){progress.tower.best=Math.max(Number(progress.tower.best)||24,game.level);progress.tower.floor=Math.max(Number(progress.tower.floor)||25,game.level+1);}save();beep('win');}hud();
 if(won&&game.mode==='journey'&&game.level===24){modal('<div class="ending-crown">♛</div><small>THE FOUR CROWNS ARE COMPLETE</small><h2>왕관의 정원을 완성했습니다</h2><p class="ending-copy">24번째 정원의 마지막 빛이 연결되며 네 개의 왕관이 하나가 되었습니다.<br><b>이제 끝없는 로얄 타워가 열립니다.</b></p><div class="result-score">'+game.score.toLocaleString()+'</div><small>FINAL STAGE POINTS</small><button class="gold-button" data-action="tower">25층 · 로얄 타워 입장 ↗</button><button class="outline-button" data-action="battle-lobby">친구와 1:1 대전</button><button class="outline-button" data-action="lobby">완성된 정원 보기</button>');return;}
 if(won&&game.mode==='tower'){const milestone=game.level%10===0;modal('<div class="tower-floor-badge">'+game.level+'F</div><small>ROYAL TOWER CLEARED</small><h2>'+(milestone?'왕관 시련을 돌파했습니다':'한 층 더 높은 왕좌로')+'</h2>'+(milestone?'<span class="tower-milestone">CROWN MILESTONE</span>':'')+'<div class="result-score">'+game.score.toLocaleString()+'</div><small>POINTS</small><div class="result-stats"><div><small>최고 콤보</small><b>'+game.bestCombo+'</b></div><div><small>연결한 패</small><b>'+game.pairs+'쌍</b></div><div><small>현재 최고층</small><b>'+progress.tower.best+'F</b></div></div><button class="gold-button" data-action="tower-next">'+(game.level+1)+'층 계속 도전 ↗</button><button class="outline-button" data-action="lobby">정원 선택으로</button>');return;}
 modal(`<div class="modal-badge">${won?worlds[game.world].icon:'☾'}</div><small>${won?'GARDEN COMPLETE':'ANOTHER CHANCE'}</small><h2>${won?(game.seal&&game.mode==='journey'?'왕관을 찾았어요':'정원이 빛나기 시작합니다'):'별빛이 잠시 쉬어갑니다'}</h2>${won?`<div class="result-stars" aria-label="별 ${stars}개">${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</div>`:'<p>찾아낸 길을 기억하며, 다시 한번 도전해 보세요.</p>'}<div class="result-score">${game.score.toLocaleString()}</div><small>POINTS</small><div class="result-stats"><div><small>최고 콤보</small><b>${game.bestCombo}</b></div><div><small>연결한 패</small><b>${game.pairs}쌍</b></div><div><small>시간 보너스</small><b>${won?timeBonus:0}</b></div></div>${won&&game.mode==='journey'&&game.level<24?'<button class="gold-button" data-action="next">다음 정원으로 ↗</button>':'<button class="gold-button" data-action="retry">한 번 더 도전</button>'}<button class="outline-button" data-action="lobby">정원 선택으로</button><p>${storageAvailable?'기록은 이 기기에 저장됩니다.':'저장 공간을 사용할 수 없어 기록이 유지되지 않아요.'}</p>`);
}
function help(){if(game&&!game.done&&game.mode!=='battle'){paused=true;cancelAnimationFrame(raf);}modal('<small>HOW TO PLAY</small><h2>두 개의 패, 하나의 길</h2><p>같은 문양의 패 두 개를 누르세요. 다른 패를 통과하지 않고, <b>두 번 이하로 꺾이는 선</b>으로 이어지면 사라집니다. 판 바깥 테두리도 길이 됩니다.</p><p>빠르게 연결하면 콤보! <b>5콤보마다 12초간 로얄 피버</b>가 켜져 점수가 3배가 됩니다. 힌트 3회와 재배치 2회를 사용할 수 있고, 막힌 판은 무료로 재배치됩니다.</p><p>24스테이지를 모두 깨면 <b>25층부터 무한 로얄 타워</b>가 열립니다. 대전모드는 친구와 동일한 배치에서 먼저 모든 패를 연결하는 1:1 승부입니다.</p><p>별 1개는 클리어, 2개는 도구 2회 이하, 3개는 도구 없이 제한시간 70% 이내 클리어입니다. 휴식 모드는 스테이지 진행도에 반영되지 않아요.</p><button class="gold-button" data-action="close-help">알겠어요</button>');}
function confirmRestart(){if(!game||busy||game.done)return;paused=true;cancelAnimationFrame(raf);modal('<h2>다시 시작할까요?</h2><p>이번 판 점수는 사라지고 새로운 배치로 시작해요. 오늘의 도전은 같은 배치로 다시 시작합니다.</p><button class="gold-button" data-action="retry">다시 시작</button><button class="outline-button" data-action="resume">계속 플레이</button>');}
$('#board').addEventListener('click',e=>{const t=e.target.closest('[data-i]');if(t)choose(Number(t.dataset.i));});
$('#worlds').addEventListener('click',e=>{const b=e.target.closest('[data-level]');if(b&&!b.disabled)start(Number(b.dataset.level));});
$('#continue').onclick=()=>campaignComplete()?start(progress.tower.floor,'tower'):start(unlocked());$('#tower').onclick=()=>{if(campaignComplete())start(progress.tower.floor,'tower')};$('#battle').onclick=openBattle;$('#zen').onclick=()=>start(unlocked(),'zen');$('#daily').onclick=()=>start(9,'daily');$('#hint').onclick=()=>action('hint');$('#shuffle').onclick=()=>action('shuffle');$('#pause').onclick=pause;$('#restart').onclick=confirmRestart;$('#help').onclick=help;
$('#sound').onclick=()=>{sound=!sound;$('#sound').setAttribute('aria-pressed',String(sound));$('#sound').setAttribute('aria-label',sound?'효과음 끄기':'효과음 켜기');beep('match');};
$('#home').onclick=e=>{e.preventDefault();if(game&&!game.done)pause();else lobby();};
$('#exit').onclick=()=>{pause();if(window.parent!==window)window.parent.postMessage({type:'junja-sichuan-exit'},location.origin);else location.href='/';};
$('#modal').addEventListener('click',e=>{const a=e.target.closest('[data-action]')?.dataset.action;if(!a)return;if(a==='resume')resume();if(a==='lobby')lobby();if(a==='next')start(game.level+1);if(a==='retry')start(game.level,game.mode);if(a==='tower')start(25,'tower');if(a==='tower-next')start(game.level+1,'tower');if(a==='battle-lobby')openBattle();if(a==='battle-create')createBattle();if(a==='battle-join')joinBattle();if(a==='battle-ready')toggleBattleReady();if(a==='battle-leave'){leaveBattle(true).finally(()=>openBattle());}if(a==='close-help'){if(game&&!game.done)resume();else $('#modal').close();}});
$('#modal').addEventListener('cancel',e=>{e.preventDefault();if(game&&!game.done)resume();else if(game?.done)lobby();else $('#modal').close();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modal').open)pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',pause);
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===window.parent&&e.data?.type==='junja-sichuan-pause')pause();});
window.addEventListener('resize',()=>{$('#connections').innerHTML='';});
lobby();
})();

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
let me=null,currentView='lobby',currentRoomId=null,currentGame=null,events=null,selectedBet=10000,refreshTimer=null,slotSpinState=null,autoSpinRunning=false,autoSpinStop=false,slotSession={spins:0,wins:0,net:0,best:0,recent:[]},selectedYutMoveIndex=0,selectedSoloYutMoveIndex=0,horseCardData=null,horseRacing=false,horseLastResult=null,bigWheelSelected='x2',bigWheelSpinning=false,bigWheelAngle=0,sicboSelected='small',sicboRolling=false,roomPollTimer=null,roomRefreshBusy=false,lastRoomVersion=-1,roomSeenMembers=new Map(),liveGame=null,liveHeartbeatTimer=null,livePollTimer=null,liveKnownIds=new Set(),liveInitialized=false,sevenAutoTimer=null,holdemAutoTimer=null,baccaratAutoTimer=null,baccaratLastAutoRound=-1,networkDegraded=false,bigWheelAutoStop=false,sicboAutoStop=false,bigWheelAutoRunning=false,sicboAutoRunning=false,shopData=null,shopCategory='all',shopOwnedOnly=false,shopCharacterGender='all',horseMeetTimer=null,horseMeetData=null,horseAnimatedRoundId=null,horseAnimationFrame=null,horseAutoRemaining=0,horseAutoTotal=0,horseAutoBetRound=null,horseAutoBusy=false,slotJackpotPollTimer=null,rouletteMode='straight',rouletteChip=10000,rouletteBets=[],rouletteSpinning=false,rouletteWheelAngle=0,rouletteBallAngle=0,roulettePending=[],audioScene='lobby',soloYutReplayBusy=false;
const SLOT_SYMBOLS=['🍒','🍋','🍊','🔔','⭐','💎','7️⃣','J'];
const SLOT_CELL_CLASS={'🍒':'cherry','🍋':'lemon','🍊':'orange','🔔':'bell','⭐':'star','💎':'diamond','7️⃣':'seven','J':'junja'};
const REACTION_META={frustrated:['😫','답답해!','base'],hurry:['⏩','빨리빨리!','base'],cry:['😭','으앙 ㅠㅠ','base'],laugh:['😂','ㅋㅋㅋㅋ','base'],wow:['😲','헐?!','base'],sad:['😢','슬퍼...','base'],nice:['😎','나이스~','base'],go:['🔥','가즈아!','base'],lucky:['🍀','오늘 느낌 온다!','bubble_hype'],gg:['🤝','굿게임!','bubble_hype'],boom:['💥','터졌다!','bubble_hype'],clutch:['🎯','딱 맞췄다!','bubble_hype'],heart:['💖','좋아좋아!','bubble_cute'],wink:['😉','찡긋~','bubble_cute'],pout:['🥺','한 번만...','bubble_cute'],clap:['👏','박수!','bubble_cute'],crown:['👑','품격 있게~','bubble_royal'],sparkle:['✨','클래스가 다르지','bubble_royal'],salute:['🫡','인정!','bubble_royal'],throne:['🪑','왕좌는 내 자리','bubble_royal'],bigbet:['💸','큰 판 간다!','bubble_highroller'],chips:['🪙','칩 쌓아!','bubble_highroller'],allin:['🔥','올인 감성!','bubble_highroller'],myday:['😎','오늘은 내 날','bubble_highroller'],legend:['⚡','전설 등장!','bubble_legend'],classup:['👑','이게 클래스','bubble_legend'],mood:['✨','분위기 잡았다','bubble_legend'],finish:['🏆','끝내자!','bubble_legend']};
const LIVE_GAME_VIEWS=new Set(['slot','holdem','sevenpoker','baccarat','yut','seotda','gostop','horse','bigwheel','sicbo','roulette']);
const LIVE_GAME_LABEL={slot:'ROYAL REELS',holdem:"HOLD'EM ARENA",sevenpoker:'SEVEN POKER',baccarat:'BACCARAT DUEL',yut:'YUT ARENA',seotda:'SEOTDA DUEL',gostop:'MATGO FLOOR',horse:'GRAND RACE',bigwheel:'BIG WHEEL',sicbo:'SIC BO',roulette:'ROYAL ROULETTE'};
const money=n=>new Intl.NumberFormat('ko-KR').format(Number(n||0))+' G';
const timeText=t=>new Intl.DateTimeFormat('ko-KR',{hour:'2-digit',minute:'2-digit',month:'numeric',day:'numeric'}).format(new Date(t));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function storageGet(key,fallback=null){try{const v=window.localStorage?.getItem(key);return v==null?fallback:v}catch{return fallback}}
function storageSet(key,value){try{window.localStorage?.setItem(key,String(value));return true}catch{return false}}
function html(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function cosmeticId(c,key){return c?.[key]?.id||''}
function cosmeticIcon(c,key){return c?.[key]?.icon||''}
function styledAvatar(avatar=0,alt='플레이어',extra='',cosmetics=null){const idx=Math.abs(Number(avatar||0))%10,frame=cosmeticId(cosmetics,'frame').replace('frame_',''),costume=cosmeticIcon(cosmetics,'costume'),pet=cosmeticIcon(cosmetics,'pet'),character=cosmetics?.character||null,src=character?.asset||`/art/poker-avatars/avatar-${idx}.svg`;return `<span class="styled-avatar ${extra} ${frame?'frame-'+frame:''} ${character?'premium-character':''}"><img class="game-face ${character?'character-portrait':''}" src="${html(src)}" alt="${html(character?.name||alt)}">${costume?`<i class="avatar-costume">${html(costume)}</i>`:''}${pet?`<em class="avatar-pet">${html(pet)}</em>`:''}</span>`}
function avatarImg(avatar=0,alt='플레이어',extra='',cosmetics=null){return styledAvatar(avatar,alt,extra,cosmetics||((me&&alt===me.nickname)?me.cosmetics:null))}
function reactionEntries(){const pack=me?.cosmetics?.bubble_pack?.id||'';return Object.entries(REACTION_META).filter(([,v])=>v[2]==='base'||v[2]===pack)}
function equippedTitle(c){return c?.title?.name||''}
function applyCosmetics(){if(!me)return;const table=cosmeticId(me.cosmetics,'table_skin').replace('table_',''),back=cosmeticId(me.cosmetics,'card_back').replace('card_','');document.body.className=[...document.body.classList].filter(x=>!x.startsWith('skin-table-')&&!x.startsWith('skin-card-')).join(' ');if(table)document.body.classList.add('skin-table-'+table);if(back)document.body.classList.add('skin-card-'+back)}
function botFace(game='poker',extra=''){const src=game==='poker'?'/art/poker-avatars/bot.svg':`/art/${game}-mascot.svg`;return `<img class="game-face bot-face ${extra}" src="${src}" alt="J-BOT">`}
function reactionBubble(room,userId){const x=(room?.reactions||[]).find(r=>Number(r.userId)===Number(userId));return x?`<div class="reaction-bubble" title="${html(x.label||'반응')}"><b>${html(x.emoji)}</b><span>${html(x.label||'')}</span><small>${html(x.nickname||'')}</small></div>`:''}
function reactionDockHtml(){return `<div class="reaction-dock"><span>QUICK BUBBLE</span>${reactionEntries().map(([k,[e,l]])=>`<button type="button" data-reaction="${k}" title="${html(l)}"><b>${e}</b><small>${html(l)}</small></button>`).join('')}<em>텍스트 입력 없이 정해진 말풍선만 전송</em></div>`}
function ensureLiveFloorMount(game){
  const section=$(`#view-${game}`);if(!section)return null;let mount=$('.live-floor-mount',section);
  if(!mount){mount=document.createElement('div');mount.className='live-floor-mount';const head=$('.view-head',section);head?.insertAdjacentElement('afterend',mount)}
  return mount;
}
function liveFace(p){return `<div class="live-player-face">${avatarImg(p.avatar,p.nickname,'live-face',p.cosmetics)}${p.reaction?`<div class="live-speech"><b>${html(p.reaction.emoji)}</b><span>${html(p.reaction.label)}</span></div>`:''}<i class="live-dot"></i></div>`}
function renderLiveFloor(game,members=[]){
  const mount=ensureLiveFloorMount(game);if(!mount)return;
  const nowMs=Date.now(),others=members.filter(p=>Number(p.userId)!==Number(me?.id));
  mount.innerHTML=`<div class="live-floor panel"><div class="live-floor-head"><div><small>LIVE FLOOR · ${html(LIVE_GAME_LABEL[game]||game.toUpperCase())}</small><h3><i></i> 실시간 참여자 <b>${members.length}</b>명</h3></div><span>${['holdem','yut','baccarat'].includes(game)?'방 참가자는 함께 플레이 · 진행 중엔 같은 게임 유저도 실시간 표시':'같은 게임에 들어온 유저와 동시에 플레이 · 결과는 각자 정산'}</span></div><div class="live-members">${members.map(p=>`<div class="live-member ${Number(p.userId)===Number(me?.id)?'me':''} ${nowMs-Number(p.joinedAt||0)<5000?'just-in':''}">${liveFace(p)}<div><b>${html(p.nickname)}</b>${equippedTitle(p.cosmetics)?`<em class="live-title">${html(equippedTitle(p.cosmetics))}</em>`:''}<small>${(Number(p.userId)===Number(me?.id)?'나 · ':'')+(p.state==='PLAYING'?'게임중':'대기중')}</small></div></div>`).join('')||'<div class="live-empty">아직 이 게임에 접속한 유저가 없어.</div>'}</div><div class="live-reaction-row"><span>말풍선</span>${reactionEntries().map(([k,[e,l]])=>`<button type="button" data-floor-reaction="${k}" title="${html(l)}"><b>${e}</b><small>${html(l)}</small></button>`).join('')}</div></div>`;
  $$('[data-floor-reaction]',mount).forEach(b=>b.onclick=()=>sendLiveReaction(b.dataset.floorReaction,b));
}
async function refreshLiveFloor(silent=true){
  if(!liveGame||currentView!==liveGame)return;
  try{
    const d=await api('/api/live?game='+encodeURIComponent(liveGame)),ids=new Set((d.members||[]).map(x=>Number(x.userId)));
    if(liveInitialized){
      for(const p of d.members||[]){const id=Number(p.userId);if(id!==Number(me?.id)&&!liveKnownIds.has(id))toast(`🎉 ${p.nickname}님이 ${LIVE_GAME_LABEL[liveGame]||'게임'}에 들어왔어!`)}
    }
    liveKnownIds=ids;liveInitialized=true;renderLiveFloor(liveGame,d.members||[]);
  }catch(e){if(!silent)toast(e.message)}
}
function localPresenceState(){
  if(currentView==='slot')return autoSpinRunning||$('#spinBtn')?.disabled?'PLAYING':'WAITING';
  if(currentView==='horse')return horseRacing||horseAutoBusy?'PLAYING':'WAITING';
  if(currentView==='bigwheel')return bigWheelSpinning||bigWheelAutoRunning?'PLAYING':'WAITING';
  if(currentView==='sicbo')return sicboRolling||sicboAutoRunning?'PLAYING':'WAITING';
  if(currentView==='roulette')return rouletteSpinning?'PLAYING':'WAITING';
  return 'WAITING';
}
async function liveHeartbeat(){
  if(document.hidden||!liveGame||currentView!==liveGame)return;
  try{const d=await api('/api/live/heartbeat',{method:'POST',body:JSON.stringify({game:liveGame,state:localPresenceState()})});renderLiveFloor(liveGame,d.members||[])}catch{}
}
function leaveLiveFloor(game){
  if(!game||!LIVE_GAME_VIEWS.has(game))return;
  fetch('/api/live/leave',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({game})}).catch(()=>{});
}
function startLiveFloor(game){
  if(!LIVE_GAME_VIEWS.has(game)){stopLiveFloor();return}
  if(liveGame&&liveGame!==game)leaveLiveFloor(liveGame);
  clearInterval(liveHeartbeatTimer);clearInterval(livePollTimer);liveGame=game;liveKnownIds=new Set();liveInitialized=false,sevenAutoTimer=null,baccaratAutoTimer=null,baccaratLastAutoRound=-1,networkDegraded=false,bigWheelAutoStop=false,sicboAutoStop=false,bigWheelAutoRunning=false,sicboAutoRunning=false,shopData=null,shopCategory='all',shopOwnedOnly=false;
  ensureLiveFloorMount(game);liveHeartbeat();refreshLiveFloor(true);
  liveHeartbeatTimer=setInterval(liveHeartbeat,10000);livePollTimer=setInterval(()=>{if(!document.hidden&&!currentRoomId&&currentView===liveGame)refreshLiveFloor(true)},4500);
}
function stopLiveFloor(){
  clearInterval(liveHeartbeatTimer);clearInterval(livePollTimer);liveHeartbeatTimer=null;livePollTimer=null;
  if(liveGame)leaveLiveFloor(liveGame);liveGame=null;liveKnownIds=new Set();liveInitialized=false,sevenAutoTimer=null,baccaratAutoTimer=null,baccaratLastAutoRound=-1,networkDegraded=false,bigWheelAutoStop=false,sicboAutoStop=false,bigWheelAutoRunning=false,sicboAutoRunning=false,shopData=null,shopCategory='all',shopOwnedOnly=false;
}
async function sendLiveReaction(key,btn){
  if(!liveGame)return;if(btn)btn.disabled=true;
  try{const d=await api('/api/live/reaction',{method:'POST',body:JSON.stringify({game:liveGame,key})});renderLiveFloor(liveGame,d.members||[]);fx('click')}catch(e){toast(e.message)}finally{setTimeout(()=>{if(btn)btn.disabled=false},750)}
}
function signedMoney(n){return (Number(n)>=0?'+':'')+money(n)}
function toast(msg){const e=$('#toast');if(!e)return;e.textContent=msg;e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('show'),2400)}
const BGM_TRACK_URL='/audio/bright_song.mp3';
let soundEnabled=storageGet('jgc_sound','1')!=='0',bgmAudio=null,audioUnlocked=false,audioUnlocking=false;
function audioContext(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;if(!fx.ctx||fx.ctx.state==='closed')fx.ctx=new C();return fx.ctx}catch{return null}}
function updateSoundButton(){
  const b=$('#soundBtn');if(!b)return;
  if(!soundEnabled){b.textContent='🔇 BGM OFF';b.setAttribute('aria-pressed','false');return}
  b.textContent=audioUnlocked?'🎵 BGM ON':'▶ BGM START';b.setAttribute('aria-pressed','true');
}
function ensureBgmAudio(){
  if(bgmAudio)return bgmAudio;
  const a=new Audio(BGM_TRACK_URL);a.loop=true;a.preload='auto';a.volume=.22;a.playsInline=true;
  a.addEventListener('error',()=>console.warn('[BGM] audio load failed'));
  bgmAudio=a;return a;
}
function stopAmbient(){if(bgmAudio){try{bgmAudio.pause()}catch{}}}
async function startAudioScene(scene='lobby'){
  audioScene=scene;if(!soundEnabled||!me)return false;
  const a=ensureBgmAudio();
  try{await a.play();audioUnlocked=true;updateSoundButton();return true}catch(e){audioUnlocked=false;updateSoundButton();return false}
}
async function ensureAudioUnlocked(startMusic=true){
  if(audioUnlocking)return audioUnlocked;audioUnlocking=true;
  try{const c=audioContext();if(c&&c.state!=='running')await c.resume()}catch{}
  if(startMusic&&soundEnabled&&me)await startAudioScene(audioScene||currentView||'lobby');
  audioUnlocking=false;updateSoundButton();return audioUnlocked;
}
function setAudioScene(scene='lobby'){
  audioScene=scene;if(!soundEnabled||!me){stopAmbient();updateSoundButton();return}
  startAudioScene(scene);
}
async function toggleSound(){
  soundEnabled=!soundEnabled;storageSet('jgc_sound',soundEnabled?'1':'0');
  if(!soundEnabled){stopAmbient();audioUnlocked=false;updateSoundButton();return}
  await startAudioScene(currentView||'lobby');
}
function fx(kind='click'){
  if(!soundEnabled)return;try{const c=audioContext();if(!c)return;if(c.state!=='running'){ensureAudioUnlocked(false);return}
    const seq={click:[[280,.05]],spin:[[170,.06],[240,.08]],stop:[[380,.07]],jackpot:[[740,.16],[990,.2],[1320,.32]],win:[[620,.1],[820,.18]],card:[[520,.035],[360,.05]],chip:[[900,.025],[680,.045]],dice:[[160,.045],[230,.06],[140,.08]],wheel:[[420,.025]],hoof:[[95,.035],[125,.04]],yut:[[210,.06],[320,.08]],baccarat:[[430,.05],[610,.07]],roulette:[[510,.03],[390,.045]]}[kind]||[[280,.05]];
    let t=c.currentTime;for(const [f,d] of seq){const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type=(kind==='win'||kind==='jackpot')?'triangle':kind==='hoof'?'square':'sine';o.frequency.value=f;g.gain.value=kind==='jackpot'?.045:.022;o.start(t);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.stop(t+d+.01);t+=d*.58}
  }catch{}
}

function setNetworkState(state='online',message=''){
  const bar=$('#networkBanner'),text=$('#networkText');if(!bar||!text)return;
  if(state==='online'){networkDegraded=false;bar.classList.add('hidden');bar.classList.remove('offline','degraded');return;}
  networkDegraded=true;bar.classList.remove('hidden','offline','degraded');bar.classList.add(state==='offline'?'offline':'degraded');text.textContent=message||(state==='offline'?'인터넷 연결이 끊겼어. 연결되면 자동 복구할게.':'서버 연결이 불안정해. 게임 상태를 다시 확인 중이야.');
}
async function mobileResumeSync(){
  if(document.hidden||!me)return;try{await refreshMe();setNetworkState('online');if(currentRoomId)await loadCurrentRoom(true);else if(currentView==='sevenpoker')await loadSevenPoker(true);else if(currentView==='baccarat')await loadBaccaratRooms(true);if(liveGame)refreshLiveFloor(true);}catch{setNetworkState('degraded')}
}
window.addEventListener('offline',()=>{bigWheelAutoStop=true;sicboAutoStop=true;autoSpinStop=true;clearTimeout(sevenAutoTimer);clearTimeout(baccaratAutoTimer);setNetworkState('offline')});
window.addEventListener('online',()=>{setNetworkState('degraded','인터넷이 다시 연결됐어. 게임 상태 확인 중...');setTimeout(mobileResumeSync,250)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(mobileResumeSync,180)});
window.addEventListener('pageshow',e=>{if(e.persisted)setTimeout(mobileResumeSync,120)});
async function api(url,opts={}){
  const method=opts.method||'GET',attempts=method==='GET'?2:1;
  let lastErr;
  for(let attempt=0;attempt<attempts;attempt++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const res=await fetch(url,{cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json','Cache-Control':'no-cache',...(opts.headers||{})},...opts,signal:controller.signal});
      clearTimeout(timer);let data={};try{data=await res.json()}catch{}
      if(!res.ok)throw new Error(data.error||'요청에 실패했습니다.');if(networkDegraded)setNetworkState('online');return data;
    }catch(e){clearTimeout(timer);lastErr=e;if(attempt+1<attempts)await sleep(250);}
  }
  setNetworkState(navigator.onLine?'degraded':'offline');throw new Error(lastErr?.name==='AbortError'?'서버 응답이 늦습니다. 잠시 후 다시 시도해주세요.':(lastErr?.message||'네트워크 오류가 발생했습니다.'));
}

function setAuthTab(tab){$$('[data-auth-tab]').forEach(b=>b.classList.toggle('active',b.dataset.authTab===tab));$('#loginForm')?.classList.toggle('hidden',tab!=='login');$('#registerForm')?.classList.toggle('hidden',tab!=='register');if($('#authMsg'))$('#authMsg').textContent='';}
$$('[data-auth-tab]').forEach(b=>b.onclick=()=>setAuthTab(b.dataset.authTab));
$('#loginForm').onsubmit=async e=>{e.preventDefault();ensureAudioUnlocked(false);const f=new FormData(e.currentTarget);try{const d=await api('/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});me=d.user;bootMain();}catch(err){$('#authMsg').textContent=err.message}};
$('#registerForm').onsubmit=async e=>{e.preventDefault();ensureAudioUnlocked(false);const f=new FormData(e.currentTarget);try{const d=await api('/api/register',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});me=d.user;bootMain();}catch(err){$('#authMsg').textContent=err.message}};
async function purgeLegacyAppCaches(){
  // v2.4.2 RECOVERY: mixed PWA caches can leave HTML/JS from different versions.
  // Run once per browser and keep the live web app network-first until stability is verified.
  try{
    if(storageGet('jgc_cache_recovery_242')==='1')return;
    storageSet('jgc_cache_recovery_242','1');
    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister().catch(()=>false)));
    }
    if('caches' in window){
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>String(k).startsWith('junja-club-')).map(k=>caches.delete(k)));
    }
  }catch(e){console.warn('[JGC cache recovery]',e)}
}
async function boot(){try{const d=await api('/api/me');me=d.user;bootMain();}catch{$('#authScreen').classList.remove('hidden')}}
function bootMain(){
  // v2.4.2 RECOVERY: one optional UI/service failure must never stop the whole casino.
  try{document.body.classList.remove('modal-open','jackpot-open');$('#helpModal')?.classList.add('hidden');$('#slotJackpotOverlay')?.classList.add('hidden')}catch(e){console.warn('[JGC UI RESET]',e)}
  $('#authScreen')?.classList.add('hidden');$('#mainApp')?.classList.remove('hidden');
  try{updateHeader()}catch(e){console.error('[JGC HEADER]',e)}
  try{bindMain()}catch(e){console.error('[JGC BIND]',e)}
  try{connectEvents()}catch(e){console.warn('[JGC EVENTS]',e)}
  const q=new URLSearchParams(location.search),rid=q.get('room'),game=q.get('game');
  const enter=async()=>{try{
    if(rid&&['holdem','yut','seotda','sevenpoker'].includes(game)){await go(game);await joinRoom(game,rid)}
    else if(rid&&game==='baccarat'){await go('baccarat');await joinBaccaratRoom(rid)}
    else{await go('lobby');setTimeout(resumeMyRoom,450)}
  }catch(e){console.error('[JGC ENTER]',e);try{await go('lobby')}catch{};toast('화면 복구 완료. 게임을 다시 눌러줘.') }};
  enter();
  if('serviceWorker' in navigator)purgeLegacyAppCaches();
  setTimeout(()=>{try{if(!storageGet('jgc_help_seen_242'))toast('처음이라면 상단의 ? 게임방법에서 가이드를 볼 수 있어.')}catch{}},700);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentRoomId)loadCurrentRoom(true).catch(()=>{})});
}
let mainBound=false;
function bindMain(){
  if(mainBound)return;
  const on=(sel,event,fn)=>{const el=$(sel);if(!el)return false;el.addEventListener(event,fn);return true};
  try{
    // Navigation is delegated so a single missing card/button can never disable the rest of the app.
    document.addEventListener('click',e=>{
      const profile=e.target?.closest?.('#profileBtn');if(profile){e.preventDefault();openProfile();return;}
      const b=e.target?.closest?.('[data-go]');if(!b)return;
      e.preventDefault();go(b.dataset.go).catch(err=>{console.error('[JGC NAV]',err);toast(err?.message||'화면 이동 중 오류가 발생했어.')});
    });
    on('#dailyBtn','click',claimDaily);on('#soundBtn','click',toggleSound);updateSoundButton();
    const unlockFromGesture=()=>{if(soundEnabled&&me&&!audioUnlocked)ensureAudioUnlocked(true)};
    document.addEventListener('pointerdown',unlockFromGesture,{capture:true,passive:true});document.addEventListener('keydown',unlockFromGesture,{capture:true});
    on('#refreshRank','click',loadLobby);on('#friendsBtn','click',()=>openFriendsHub());on('#profileBtn','click',openProfile);on('#closeProfile','click',()=>$('#profileSheet')?.classList.add('hidden'));on('#profileSheet','click',e=>{if(e.target.id==='profileSheet')$('#profileSheet')?.classList.add('hidden')});on('#logoutBtn','click',logout);
    on('#refreshHoldem','click',()=>loadRooms('holdem'));on('#refreshYut','click',()=>loadRooms('yut'));on('#refreshSeotda','click',()=>loadRooms('seotda'));on('#refreshSevenpoker','click',()=>loadRooms('sevenpoker'));on('#refreshBaccarat','click',()=>loadBaccaratRooms());
    on('#createHoldem','click',()=>createRoom('holdem'));on('#createYut','click',()=>createRoom('yut'));on('#createSeotda','click',()=>createRoom('seotda'));on('#createSevenpoker','click',()=>createRoom('sevenpoker'));on('#createBaccarat','click',createBaccaratRoom);
    on('#yutMode','change',syncYutMode);on('#horseBetType','change',syncHorseBetUI);on('#horseStartBtn','click',startHorseRace);$$('[data-horse-auto]').forEach(b=>b.addEventListener('click',()=>startHorseAuto(Number(b.dataset.horseAuto))));on('#horseAutoStop','click',stopHorseAuto);
    on('#bigWheelSpinBtn','click',()=>spinBigWheel(false));$$('[data-wheel-auto]').forEach(b=>b.addEventListener('click',()=>runBigWheelAuto(Number(b.dataset.wheelAuto))));on('#bigWheelAutoStop','click',()=>{bigWheelAutoStop=true});$$('[data-wheel-bet]').forEach(b=>b.addEventListener('click',()=>selectBigWheelBet(b.dataset.wheelBet)));
    on('#sicboRollBtn','click',()=>rollSicbo(false));$$('[data-sicbo-auto]').forEach(b=>b.addEventListener('click',()=>runSicboAuto(Number(b.dataset.sicboAuto))));on('#sicboAutoStop','click',()=>{sicboAutoStop=true});$$('[data-sicbo-bet]').forEach(b=>b.addEventListener('click',()=>selectSicboBet(b.dataset.sicboBet)));
    on('#rouletteSpinBtn','click',spinRoulette);on('#rouletteUndo','click',()=>{rouletteBets.pop();renderRouletteBets()});on('#rouletteClear','click',()=>{rouletteBets=[];roulettePending=[];renderRouletteBets();renderRouletteBoard()});$$('[data-rmode]').forEach(b=>b.addEventListener('click',()=>{rouletteMode=b.dataset.rmode;roulettePending=[];$$('[data-rmode]').forEach(x=>x.classList.toggle('active',x===b));renderRouletteBoard()}));$$('[data-rchip]').forEach(b=>b.addEventListener('click',()=>{rouletteChip=b.dataset.rchip==='max'?'max':Number(b.dataset.rchip);$$('[data-rchip]').forEach(x=>x.classList.toggle('active',x===b));fx('chip')}));
    on('#spinBtn','click',()=>spin({manual:true}));on('#slotBetInput','input',e=>syncSlotBetInput(e.target));on('#slotBetInput','change',e=>normalizeSlotBetInput(e.target));$$('[data-auto-spin]').forEach(b=>b.addEventListener('click',()=>runAutoSpins(Number(b.dataset.autoSpin))));on('#autoStopBtn','click',()=>{autoSpinStop=true;if($('#autoSpinStatus'))$('#autoSpinStatus').textContent='중지 요청...'});on('#slotSessionReset','click',resetSlotSession);on('#jackpotContinueBtn','click',closeSlotJackpot);
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&autoSpinRunning){autoSpinStop=true;if($('#autoSpinStatus'))$('#autoSpinStatus').textContent='화면 전환으로 자동 중지';}});
    const betRoot=$('#betRow');if(betRoot&&!betRoot.children.length)for(const b of [1000,5000,10000,25000,50000,100000]){const el=document.createElement('button');el.type='button';el.className='bet-chip'+(b===selectedBet?' active':'');el.textContent=money(b);el.onclick=()=>{selectedBet=b;if($('#slotBetInput'))$('#slotBetInput').value=b;$$('.bet-chip').forEach(x=>x.classList.remove('active'));el.classList.add('active');updateCurrentBetLabel();fx()};betRoot.appendChild(el)}
    on('#helpBtn','click',()=>openHelp(currentView));const rememberHelp=()=>{try{storageSet('jgc_help_seen_242','1')}catch{}};const closeHelpSafe=()=>{closeHelp();rememberHelp()};on('#closeHelp','click',closeHelpSafe);on('#helpDone','click',closeHelpSafe);on('.help-backdrop','click',closeHelpSafe);$$('[data-open-help]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openHelp(b.dataset.openHelp)}));$$('[data-help-tab]').forEach(b=>b.addEventListener('click',()=>setHelpTab(b.dataset.helpTab)));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#helpModal')?.classList.contains('hidden'))closeHelpSafe()});
    $$('[data-mode-game]').forEach(b=>b.addEventListener('click',()=>switchMode(b.dataset.modeGame,b.dataset.mode)));
    on('#startSoloHoldem','click',startSoloHoldem);on('#startSoloYut','click',startSoloYut);on('#startSeotda','click',startSeotda);on('#startGostop','click',startGostop);on('#startSevenPoker','click',startSevenPoker);on('#sevenAutoNext','change',e=>{try{storageSet('seven_auto',e.target.checked?'1':'0')}catch{}});on('#networkRetryBtn','click',mobileResumeSync);
    bindQuickWagers();
    on('#adminSearchBtn','click',()=>loadAdmin($('#adminSearch')?.value.trim()||''));on('#adminRefreshBtn','click',()=>{if($('#adminSearch'))$('#adminSearch').value='';loadAdmin('')});on('#adminSearch','keydown',e=>{if(e.key==='Enter')loadAdmin(e.currentTarget.value.trim())});
    initSlotMachine(true);renderSlotSession();
    mainBound=true;
  }catch(err){
    mainBound=false;console.error('[JGC BIND FATAL]',err);toast('게임 버튼 초기화 오류를 복구 중이야. 새로고침 후 다시 시도해줘.');
  }
}
function normalizeWagerInput(target,min=5000,max=100000){const el=typeof target==='string'?document.getElementById(target):target;if(!el)return 0;let v=Math.floor(Number(el.value||min)/1000)*1000;v=Math.max(min,Math.min(max,v));el.value=v;const group=document.querySelector(`[data-wager-group="${el.id}"]`);if(group)$$('[data-set-wager]',group).forEach(b=>b.classList.toggle('active',Number(b.dataset.setWager)===v));return v}
function normalizeWalletWagerInput(target,min=5000){const el=typeof target==='string'?document.getElementById(target):target;if(!el)return 0;const cap=Math.floor(Number(me?.balance||0)/1000)*1000;if(cap<min){el.value=cap>0?cap:0;return 0}let raw=Number(el.value);if(!Number.isFinite(raw)||raw<min)raw=min;let v=Math.floor(raw/1000)*1000;v=Math.max(min,Math.min(cap,v));el.value=v;const group=document.querySelector(`[data-wager-group="${el.id}"]`);if(group)$$('[data-set-wager]',group).forEach(b=>{const x=b.dataset.setWager==='max'?cap:Number(b.dataset.setWager);b.classList.toggle('active',x===v)});return v}
function syncYutMode(){const mode=$('#yutMode')?.value||'individual',max=$('#yutMax');if(!max)return;if(mode==='2v2'){max.value='4';max.disabled=true}else if(mode==='3v3'){max.value='6';max.disabled=true}else max.disabled=false}
function bindQuickWagers(){$$('[data-wager-group]').forEach(group=>{if(group.dataset.bound)return;group.dataset.bound='1';const target=document.getElementById(group.dataset.wagerGroup),walletLimited=target?.dataset.walletLimit==='1';$$('[data-set-wager]',group).forEach(b=>b.addEventListener('click',()=>{if(!target)return;const cap=Math.floor(Number(me?.balance||0)/1000)*1000,val=b.dataset.setWager==='max'?cap:Number(b.dataset.setWager);if(walletLimited&&val>cap){toast(`보유 게임머니는 ${money(me?.balance||0)}야.`);target.value=cap;normalizeWalletWagerInput(target);return}target.value=val;walletLimited?normalizeWalletWagerInput(target):normalizeWagerInput(target);$$('[data-set-wager]',group).forEach(x=>x.classList.toggle('active',x===b));fx()}));target?.addEventListener('change',()=>walletLimited?normalizeWalletWagerInput(target):normalizeWagerInput(target));});}
function setHelpTab(tab='lobby'){const ok=['lobby','slot','holdem','sevenpoker','baccarat','yut','seotda','gostop','horse','bigwheel','sicbo','roulette'];if(!ok.includes(tab))tab='lobby';$$('[data-help-tab]').forEach(b=>b.classList.toggle('active',b.dataset.helpTab===tab));$$('[data-help-page]').forEach(p=>p.classList.toggle('active',p.dataset.helpPage===tab))}
function openHelp(tab=currentView){const modal=$('#helpModal');if(!modal)return;setHelpTab(tab);modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open')}
function closeHelp(){const modal=$('#helpModal');if(!modal)return;modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open')}
function switchMode(game,mode){$$(`[data-mode-game="${game}"]`).forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$(`#${game}MultiArea`)?.classList.toggle('hidden',mode!=='multi');$(`#${game}SoloArea`)?.classList.toggle('hidden',mode!=='solo');if(mode==='solo'){if(game==='holdem')loadSoloHoldem();else if(game==='yut')loadSoloYut();else if(game==='seotda')loadSeotda();else if(game==='sevenpoker')loadSevenPoker()}else loadRooms(game)}
function connectEvents(){if(events)events.close();events=new EventSource('/api/events');events.onopen=()=>setNetworkState('online');events.onerror=()=>setNetworkState(navigator.onLine?'degraded':'offline');events.addEventListener('refresh',()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{try{const d=await api('/api/me');me=d.user;updateHeader();if(liveGame&&currentView===liveGame)refreshLiveFloor(true);if(currentView==='slot')refreshSlotJackpot(true);if(currentRoomId)await loadCurrentRoom();else if(currentView==='lobby')await loadLobby(false);else if(currentView==='holdem'&&!$('#holdemMultiArea').classList.contains('hidden'))await loadRooms('holdem');else if(currentView==='sevenpoker'&&!$('#sevenpokerMultiArea').classList.contains('hidden'))await loadRooms('sevenpoker');else if(currentView==='seotda'&&!$('#seotdaMultiArea').classList.contains('hidden'))await loadRooms('seotda');else if(currentView==='yut'&&!$('#yutMultiArea').classList.contains('hidden'))await loadRooms('yut');else if(currentView==='baccarat'&&!currentRoomId)await loadBaccaratRooms(true);else if(currentView==='admin'&&me?.is_admin)await loadAdmin($('#adminSearch')?.value.trim()||'',false)}catch{}},180)})}
function updateHeader(){if(!me)return;$('#walletBalance').textContent=money(me.balance);$('#avatarEmoji').innerHTML=avatarImg(me.avatar,me.nickname,'header-face',me.cosmetics);$('#nickName').textContent=me.nickname;const title=equippedTitle(me.cosmetics);$('#profileBtn')?.setAttribute('data-title',title);$('#dailyBtn').disabled=!me.dailyAvailable;const dailyPct=Number(me.cosmetics?.perks?.dailyBonusPct||0),dailyAmt=Math.floor(50000*(1+dailyPct/100));$('#dailyBtn').textContent=me.dailyAvailable?`🎁 출석 +${money(dailyAmt)}${dailyPct?` · +${dailyPct}%`:''}`:'✓ 오늘 출석 완료';$('#adminBtn')?.classList.toggle('hidden',!me.is_admin);applyCosmetics()}
function renderLobbyPresence(rows=[]){
  const root=$('#lobbyLiveFaces');if(!root)return;
  root.classList.add('presence-roster');
  root.innerHTML=rows.length?rows.map(p=>'<button type="button" class="presence-person '+(p.state==='PLAYING'?'playing':'waiting')+'" data-friend-profile="'+html(p.nickname)+'">'+avatarImg(p.avatar,p.nickname,'presence-face',p.cosmetics)+'<div><b>'+html(p.nickname)+'</b><span>'+html(p.gameLabel||'로비')+(p.mode&&p.mode!=='LOBBY'?' · '+html(p.mode):'')+'</span></div><em>'+(p.state==='PLAYING'?'게임중':'대기중')+'</em></button>').join(''):'<div class="presence-empty">현재 다른 접속자가 없어.</div>';root.querySelectorAll('[data-friend-profile]').forEach(b=>{b.onclick=()=>openFriendsHub(b.dataset.friendProfile)});
}
async function refreshMe(){const d=await api('/api/me');me=d.user;updateHeader();$('#onlineCount').textContent='ONLINE '+d.online;if($('#lobbyOnlineNow'))$('#lobbyOnlineNow').textContent='ONLINE '+d.online;renderLobbyPresence(d.presence||[]);return d}
async function go(view){
  if(view==='admin'&&!me?.is_admin){toast('관리자 권한이 필요합니다.');return}
  if(currentRoomId&&view!==currentGame){toast('먼저 멀티 게임방에서 나가기를 눌러줘.');return}
  const prevView=currentView;currentView=view;$$('.view').forEach(v=>v.classList.remove('active'));$('#view-'+view)?.classList.add('active');window.scrollTo({top:0,behavior:'smooth'});
  if(LIVE_GAME_VIEWS.has(view))startLiveFloor(view);else if(LIVE_GAME_VIEWS.has(prevView)||liveGame)stopLiveFloor();
  if(prevView==='horse'&&view!=='horse')stopHorseMeet();if(view==='lobby')await loadLobby();if(view==='shop')await loadShop();if(view==='slot'){initSlotMachine();refreshSlotJackpot(true)}if(view==='holdem')await loadRooms('holdem');if(view==='sevenpoker')await loadRooms('sevenpoker');if(view==='baccarat')await loadBaccaratRooms();if(view==='yut')await loadRooms('yut');if(view==='ledger')await loadLedger();if(view==='seotda')await loadRooms('seotda');if(view==='gostop')await loadGostop();if(view==='horse')startHorseMeet();if(view==='bigwheel')initBigWheel();if(view==='sicbo')initSicbo();if(view==='roulette')initRoulette();if(view==='admin')await loadAdmin('');setAudioScene(LIVE_GAME_VIEWS.has(view)?view:'lobby');
}
async function loadLobby(full=true){try{await refreshMe();const d=await api('/api/leaderboard');$('#leaderboard').innerHTML=d.rows.map((r,i)=>`<div class="rank-row rank-user-${html(r.rank?.className||'commoner')}"><div class="rank-no"><img class="rank-emblem-art" src="/assets/rank-emblems/rank-${Math.min(i+1,10)}.svg?v=325" alt="${i+1}위"></div><div class="rank-name">${avatarImg(r.avatar,r.nickname,'rank-face',r.cosmetics)}<span><b>${html(r.nickname)}</b>${equippedTitle(r.cosmetics)?`<small>${html(equippedTitle(r.cosmetics))}</small>`:''}</span></div><div class="rank-status-slot"><small class="rank-status-badge rank-crest rank-crest-${html(r.rank?.className||'commoner')}"><i class="rank-crest-icon">${r.rank?.className==='royal'?'J':html(r.rank?.icon||'◇')}</i><span>${html(r.rank?.name||'평민')}</span></small></div><div class="rank-money">${money(r.balance)}</div></div>`).join('')||'<div class="empty">아직 랭킹이 없습니다.</div>';$('#myStats').innerHTML=`<div class="stat"><span>홀덤 승리</span><b>${me.poker_wins}</b></div><div class="stat"><span>세븐포커 승리</span><b>${me.seven_wins||0}/${me.seven_games||0}</b></div><div class="stat"><span>바카라 승리</span><b>${me.baccarat_wins||0}/${me.baccarat_games||0}</b></div><div class="stat"><span>바카라 손익</span><b>${signedMoney(me.baccarat_profit||0)}</b></div><div class="stat"><span>윷놀이 승리</span><b>${me.yut_wins}</b></div><div class="stat"><span>섯다 승리</span><b>${me.seotda_wins||0}</b></div><div class="stat"><span>고스톱 승리</span><b>${me.gostop_wins||0}</b></div><div class="stat"><span>슬롯 스핀</span><b>${me.slot_spins}</b></div><div class="stat"><span>슬롯 손익</span><b>${signedMoney(me.slot_profit)}</b></div><div class="stat"><span>경마 적중</span><b>${me.horse_wins||0}/${me.horse_races||0}</b></div><div class="stat"><span>경마 손익</span><b>${signedMoney(me.horse_profit||0)}</b></div><div class="stat"><span>빅휠 적중</span><b>${me.bigwheel_wins||0}/${me.bigwheel_plays||0}</b></div><div class="stat"><span>빅휠 손익</span><b>${signedMoney(me.bigwheel_profit||0)}</b></div><div class="stat"><span>다이사이 적중</span><b>${me.sicbo_wins||0}/${me.sicbo_plays||0}</b></div><div class="stat"><span>다이사이 손익</span><b>${signedMoney(me.sicbo_profit||0)}</b></div><div class="stat"><span>룰렛 적중</span><b>${me.roulette_wins||0}/${me.roulette_plays||0}</b></div><div class="stat"><span>룰렛 손익</span><b>${signedMoney(me.roulette_profit||0)}</b></div>`;await refreshSlotJackpot(true)}catch(e){if(full)toast(e.message)}}
async function claimDaily(){try{const d=await api('/api/daily',{method:'POST',body:'{}'});toast(`출석 보너스 +${money(d.amount)}`);await refreshMe()}catch(e){toast(e.message)}}
const SHOP_CATEGORY_LABELS={all:'전체',character:'캐릭터',frame:'프로필 테두리',costume:'코스튬',title:'칭호',pet:'펫',table_skin:'테이블',card_back:'카드백',bubble_pack:'말풍선'};
const SHOP_RARITY_LABELS={common:'COMMON',rare:'RARE',epic:'EPIC',legendary:'LEGEND',mythic:'MYTHIC',prestige:'PRESTIGE 1B'};
function shopPreview(item){
  const current={...(me?.cosmetics||{})};current[item.category]=item;
  if(item.category==='character')return `<div class="shop-character-preview preview-${item.rarity}"><img src="${html(item.asset)}" alt="${html(item.name)}"><div class="character-preview-meta"><span>${item.gender==='F'?'WOMAN':'MAN'}</span><b>${html(item.name)}</b></div></div>`;
  if(item.category==='costume')return `<div class="shop-avatar-preview preview-${item.rarity}">${avatarImg(me.avatar,me.nickname,'shop-face',current)}</div>`;
  if(item.category==='frame')return `<div class="shop-frame-preview preview-${item.rarity}">${avatarImg(me.avatar,me.nickname,'shop-face',current)}<span class="frame-preview-label">PROFILE BORDER</span></div>`;
  if(item.category==='title')return `<div class="shop-title-preview preview-${item.rarity}"><b>${html(me.nickname)}</b><span>${html(item.name)}</span></div>`;
  if(item.category==='pet')return `<div class="shop-pet-preview preview-${item.rarity}">${avatarImg(me.avatar,me.nickname,'shop-face',current)}<span class="pet-showcase">${html(item.icon)}</span></div>`;
  if(item.category==='table_skin')return `<div class="shop-table-preview ${item.id} preview-${item.rarity}"><i></i><b>JUNJA</b><span>♠ ♥ ♦ ♣</span></div>`;
  if(item.category==='card_back')return `<div class="shop-card-preview ${item.id} preview-${item.rarity}"><b>${html(item.icon)}</b><span>JUNJA</span></div>`;
  return `<div class="shop-bubble-preview preview-${item.rarity}"><span>${html(item.icon)}</span><b>${html(item.name)}</b></div>`;
}
function renderShop(){
  const root=$('#shopContent');if(!root||!shopData)return;const c=shopData.loadout?.collection||{name:'NEW MEMBER',level:0};
  const all=shopData.items||[],items=all.filter(x=>(shopCategory==='all'||x.category===shopCategory)&&(shopCategory!=='character'||shopCharacterGender==='all'||x.gender===shopCharacterGender)&&(!shopOwnedOnly||x.owned));
  const prestige=all.filter(x=>x.rarity==='prestige'),frameCount=all.filter(x=>x.category==='frame').length,characterCount=all.filter(x=>x.category==='character').length;
  root.innerHTML=`<div class="luxury-boutique-shell">
    <div class="boutique-hero panel luxury-hero"><div class="boutique-me">${avatarImg(me.avatar,me.nickname,'boutique-face',me.cosmetics)}<div><small>JUNJA PRIVATE BOUTIQUE</small><h3>${html(me.nickname)}</h3>${equippedTitle(me.cosmetics)?`<span>${html(equippedTitle(me.cosmetics))}</span>`:'<span>칭호 미장착</span>'}<p>${c.icon||'◇'} ${html(c.name)} · ${shopData.ownedCount||0}/${all.length} COLLECTION</p></div></div><div class="boutique-wallet"><small>CLUB WALLET</small><b>${money(me.balance)}</b><em>게임머니 전용 · 현금 가치 없음</em></div></div>
    <div class="prestige-showcase panel"><div><small>PRESTIGE VAULT</small><h3>10억 G 레전드 컬렉션</h3><p>쉽게 살 수 없는 아이템이 있어야 진짜 목표가 생겨. 소유하면 프로필과 게임 테이블에서 바로 티가 나.</p></div><div class="prestige-mini-grid">${prestige.slice(0,4).map(x=>`<button type="button" data-prestige-jump="${x.category}"><b>${html(x.icon)}</b><span>${html(x.name)}</span><em>1,000,000,000 G</em></button>`).join('')}</div></div>
    <div class="shop-stat-strip"><div><b>${all.length}</b><span>전체 아이템</span></div><div><b>${characterCount}</b><span>프리미엄 캐릭터</span></div><div><b>${frameCount}</b><span>구매 가능 테두리</span></div><button id="openMyCollection" class="collection-stat-btn" type="button"><b>${shopData.ownedCount||0}</b><span>MY COLLECTION 보기</span></button></div>
    <div class="shop-toolbar panel"><div class="shop-tabs">${Object.entries(SHOP_CATEGORY_LABELS).map(([k,v])=>`<button type="button" data-shop-category="${k}" class="${shopCategory===k?'active':''}">${v}</button>`).join('')}</div><label class="owned-toggle"><input id="shopOwnedOnly" type="checkbox" ${shopOwnedOnly?'checked':''}><span>보유 아이템만</span></label></div>
    ${shopCategory==='character'?`<div class="character-filter panel"><div><small>ORIGINAL ANIME ALL-STARS</small><b>주인공부터 황제급 라이벌까지</b></div><div class="character-gender-tabs"><button type="button" data-char-gender="all" class="${shopCharacterGender==='all'?'active':''}">ALL</button><button type="button" data-char-gender="M" class="${shopCharacterGender==='M'?'active':''}">MAN</button><button type="button" data-char-gender="F" class="${shopCharacterGender==='F'?'active':''}">WOMAN</button></div></div>`:''}
    <div class="shop-grid">${items.map(x=>`<article class="shop-item panel rarity-${x.rarity} ${x.equipped?'equipped':''} ${x.featured?'featured-item':''}"><div class="shop-item-top"><span class="rarity">${SHOP_RARITY_LABELS[x.rarity]||x.rarity}</span>${x.featured?'<b class="prestige-badge">1 BILLION</b>':x.equipped?'<b class="equipped-badge">EQUIPPED</b>':x.owned?'<b class="owned-badge">OWNED</b>':''}</div>${shopPreview(x)}<div class="shop-item-copy"><small>${html(SHOP_CATEGORY_LABELS[x.category]||x.category)}</small><h3>${html(x.name)}</h3><p>${html(x.desc)}</p>${x.perk?`<div class="shop-perk">⚡ ${x.perk.slotLuckPct?`희귀 심볼 가중치 +${x.perk.slotLuckPct}%`:''}${x.perk.slotLuckPct&&x.perk.dailyBonusPct?' · ':''}${x.perk.dailyBonusPct?`출석 보너스 +${x.perk.dailyBonusPct}%`:''}</div>`:''}</div><div class="shop-item-foot"><div class="shop-price"><small>PRICE</small><b>${money(x.price)}</b></div>${x.equipped?`<button class="ghost" data-shop-unequip="${x.category}" type="button">장착 해제</button>`:x.owned?`<button class="primary" data-shop-equip="${x.id}" data-shop-slot="${x.category}" type="button">장착하기</button>`:`<button class="secondary buy-luxury" data-shop-buy="${x.id}" type="button">구매하기</button>`}</div></article>`).join('')||'<div class="empty panel">조건에 맞는 아이템이 없어.</div>'}</div>
  </div>`;
  $('#openMyCollection',root)?.addEventListener('click',()=>{shopCategory='all';shopOwnedOnly=true;renderShop();window.scrollTo({top:420,behavior:'smooth'})});
  $('[data-shop-category]',root).forEach(b=>b.onclick=()=>{shopCategory=b.dataset.shopCategory;if(shopCategory!=='character')shopCharacterGender='all';renderShop()});$$('[data-char-gender]',root).forEach(b=>b.onclick=()=>{shopCharacterGender=b.dataset.charGender;renderShop()});$('#shopOwnedOnly',root)?.addEventListener('change',e=>{shopOwnedOnly=e.target.checked;renderShop()});
  $$('[data-prestige-jump]',root).forEach(b=>b.onclick=()=>{shopCategory=b.dataset.prestigeJump;shopOwnedOnly=false;renderShop();window.scrollTo({top:420,behavior:'smooth'})});
  $$('[data-shop-buy]',root).forEach(b=>b.onclick=()=>buyShopItemUI(b.dataset.shopBuy,b));
  $$('[data-shop-equip]',root).forEach(b=>b.onclick=()=>equipShopItemUI(b.dataset.shopSlot,b.dataset.shopEquip,b));
  $$('[data-shop-unequip]',root).forEach(b=>b.onclick=()=>equipShopItemUI(b.dataset.shopUnequip,'',b));
}
async function loadShop(){try{const d=await api('/api/shop');shopData=d;me=d.user;updateHeader();renderShop()}catch(e){toast(e.message)}}
async function buyShopItemUI(itemId,btn){const item=shopData?.items?.find(x=>x.id===itemId);if(!item)return;if(Number(me.balance)<Number(item.price)){toast('게임머니가 부족해.');return}if(!confirm(`${item.name}을 ${money(item.price)}에 구매할까?\n구매한 아이템은 영구 보유해.`))return;btn.disabled=true;try{let d=await api('/api/shop/buy',{method:'POST',body:JSON.stringify({itemId})});me=d.user;shopData=d.state;updateHeader();toast(`🛍️ ${item.name} 구매 완료!`);d=await api('/api/shop/equip',{method:'POST',body:JSON.stringify({category:item.category,itemId:item.id})});me=d.user;shopData=d.state;updateHeader();renderShop();fx('win')}catch(e){toast(e.message);await loadShop()}finally{btn.disabled=false}}
async function equipShopItemUI(category,itemId,btn){if(btn)btn.disabled=true;try{const d=await api('/api/shop/equip',{method:'POST',body:JSON.stringify({category,itemId})});me=d.user;shopData=d.state;updateHeader();renderShop();toast(itemId?'장착 완료!':'장착 해제 완료')}catch(e){toast(e.message)}finally{if(btn)btn.disabled=false}}

async function openFriendsHub(prefill=''){
  await refreshMe();
  $('#profileContent').innerHTML=`<div class="friends-hub">
    <div class="friends-hub-title"><small>JUNJA SOCIAL CLUB</small><h2>👥 친구</h2><p>닉네임으로 친구를 찾아 캐릭터와 장착 아이템·컬렉션을 크게 보고, 송금이나 아이템 선물을 바로 할 수 있어.</p></div>
    <div class="friend-transfer friend-hub-card">
      <div class="friend-lookup-row"><input id="friendNickname" maxlength="14" placeholder="친구 닉네임 검색" autocomplete="off" value="${html(prefill)}"><button id="friendLookupBtn" class="secondary" type="button">친구 보기</button></div>
      <div id="friendLookupResult" class="friend-lookup-result muted">친구를 검색하면 큰 캐릭터 프로필이 여기에 표시돼.</div>
      <div class="friend-money-panel"><label>보낼 게임머니<div class="friend-amount-row"><input id="friendSendAmount" class="no-spinner" type="number" min="1" step="1000" value="10000" inputmode="numeric"><button id="friendMaxBtn" class="ghost" type="button">MAX</button></div></label><div class="friend-quick-row"><button type="button" data-friend-amount="1000000">100만</button><button type="button" data-friend-amount="10000000">1,000만</button><button type="button" data-friend-amount="100000000">1억</button></div><button id="friendSendBtn" class="primary full" type="button" disabled>선택한 친구에게 송금</button></div>
    </div></div>`;
  bindFriendTransfer();
  $('#profileSheet').classList.remove('hidden');
  if(prefill){const b=$('#friendLookupBtn');if(b)b.click()}
}
async function openProfile(){
  await refreshMe();
  const cc=me.cosmetics?.collection||{name:'NEW MEMBER',icon:'◇'};
  $('#profileContent').innerHTML=`<div class="profile-big profile-deluxe">${avatarImg(me.avatar,me.nickname,'profile-style-face',me.cosmetics)}<h3>${html(me.nickname)} ${me.is_admin?'<span class="profile-admin-badge">ADMIN</span>':''}</h3>${equippedTitle(me.cosmetics)?`<div class="profile-title">${html(equippedTitle(me.cosmetics))}</div>`:''}<p>@${html(me.username)} · 가입 ${new Date(me.created_at).toLocaleDateString('ko-KR')}</p><div class="collection-chip">${cc.icon||'◇'} ${html(cc.name)} · ${me.cosmetics?.ownedCount||0} ITEMS</div><button id="openBoutiqueFromProfile" class="boutique-open-btn" type="button">🛍️ JUNJA BOUTIQUE · 캐릭터 & 아바타 꾸미기</button></div><div class="stat-grid"><div class="stat"><span>보유머니</span><b id="profileBalance">${money(me.balance)}</b></div><div class="stat"><span>홀덤 승리</span><b>${me.poker_wins}</b></div><div class="stat"><span>윷 승리</span><b>${me.yut_wins}</b></div><div class="stat"><span>섯다/고스톱</span><b>${me.seotda_wins||0}/${me.gostop_wins||0}</b></div></div>
  <div class="friend-transfer"><div class="friend-transfer-head"><div><small>FRIEND GIFT</small><h3>친구에게 게임머니 보내기</h3></div><div class="friend-transfer-actions"><span>내 보유머니 안에서만 전송</span><button id="closeTransferProfile" type="button" aria-label="닫기">✕ 닫기</button></div></div><label>받는 친구 닉네임<div class="friend-lookup-row"><input id="friendNickname" maxlength="14" placeholder="친구 닉네임 정확히 입력" autocomplete="off"><button id="friendLookupBtn" class="secondary" type="button">친구 확인</button></div></label><div id="friendLookupResult" class="friend-lookup-result muted">닉네임을 확인하면 캐릭터가 표시돼.</div><label>보낼 금액<div class="friend-amount-row"><input id="friendSendAmount" class="no-spinner" type="number" min="1" step="1000" value="10000" inputmode="numeric"><button id="friendMaxBtn" class="ghost" type="button">MAX</button></div></label><div class="friend-quick-row"><button type="button" data-friend-amount="10000">1만</button><button type="button" data-friend-amount="50000">5만</button><button type="button" data-friend-amount="100000">10만</button><button type="button" data-friend-amount="500000">50만</button></div><button id="friendSendBtn" class="primary full" type="button" disabled>선택한 친구에게 보내기</button><p class="friend-transfer-note">전송은 즉시 반영되며 보내는 사람·받는 사람 양쪽 게임머니 내역에 기록돼. 게임머니는 현금 가치가 없어.</p></div>
  <p class="privacy-note">텍스트 채팅 없이 정해진 말풍선 반응만 제공하며, 친구 송금은 닉네임 확인 후에만 가능해.</p>`;
  bindFriendTransfer();
  $('#openBoutiqueFromProfile')?.addEventListener('click',()=>{$('#profileSheet').classList.add('hidden');go('shop')});
  $('#profileSheet').classList.remove('hidden');
}
let friendTransferTarget=null,friendTransferBusy=false;
function resetFriendTarget(message='닉네임을 확인하면 캐릭터가 표시돼.'){
  friendTransferTarget=null;const box=$('#friendLookupResult');if(box){box.className='friend-lookup-result muted';box.textContent=message}const send=$('#friendSendBtn');if(send)send.disabled=true;
}
function bindFriendTransfer(){
  $('#closeTransferProfile')?.addEventListener('click',()=>$('#profileSheet')?.classList.add('hidden'));
  const nick=$('#friendNickname'),lookup=$('#friendLookupBtn'),amount=$('#friendSendAmount'),max=$('#friendMaxBtn'),send=$('#friendSendBtn');if(!nick||!lookup||!amount||!send)return;
  nick.addEventListener('input',()=>resetFriendTarget('닉네임이 바뀌었어. 다시 친구 확인을 눌러줘.'));
  lookup.onclick=async()=>{const q=nick.value.trim();if(!q){toast('받는 친구 닉네임을 입력해줘.');return}lookup.disabled=true;try{const d=await api('/api/member/lookup?nickname='+encodeURIComponent(q));friendTransferTarget=d.user;$('#friendLookupResult').className='friend-lookup-result ok';$('#friendLookupResult').innerHTML=`<div class="friend-profile-hero">${avatarImg(d.user.avatar,d.user.nickname,'friend-profile-face',d.user.cosmetics)}<div><b>${html(d.user.nickname)}</b>${equippedTitle(d.user.cosmetics)?`<em>${html(equippedTitle(d.user.cosmetics))}</em>`:''}<small>${d.user.ownedCount||0}개 아이템 보유</small></div><span>✓ 친구 확인</span></div><div class="friend-equipped-row">${['character','frame','title','pet','table_skin','card_back'].map(k=>d.user.cosmetics?.[k]?`<i>${html(d.user.cosmetics[k].icon||'◆')} ${html(d.user.cosmetics[k].name)}</i>`:'').filter(Boolean).join('')||'<small>장착 아이템 없음</small>'}</div><div class="friend-owned-preview">${(d.user.ownedItems||[]).filter(Boolean).slice(0,8).map(x=>`<button type="button" data-friend-owned="${x.id}" title="${html(x.name||'아이템')}"><b>${html(x.icon||'◆')}</b><small>${html(x.name||'아이템')}</small></button>`).join('')||'<small>공개된 보유 아이템 없음</small>'}</div><button id="friendGiftOpen" class="secondary full" type="button">🎁 이 친구에게 아이템 선물하기</button>`;send.disabled=false;$('#friendGiftOpen')?.addEventListener('click',()=>openFriendGiftPicker(d.user));fx()}catch(e){resetFriendTarget('친구를 찾지 못했어. 닉네임을 다시 확인해줘.');toast(e.message)}finally{lookup.disabled=false}};
  $$('[data-friend-amount]').forEach(b=>b.onclick=()=>{amount.value=Math.min(Number(b.dataset.friendAmount),Number(me?.balance||0));fx()});
  max.onclick=()=>{amount.value=Math.max(0,Number(me?.balance||0));fx()};
  send.onclick=async()=>{
    if(friendTransferBusy||!friendTransferTarget)return;const n=Math.trunc(Number(amount.value));if(!Number.isFinite(n)||n<1){toast('보낼 금액을 입력해줘.');return}if(n>Number(me?.balance||0)){toast('현재 보유 게임머니보다 많이 보낼 수 없어.');return}
    const ok=confirm(`${friendTransferTarget.nickname}님에게 ${money(n)}를 보낼까?\n전송 후에는 자동 취소되지 않아.`);if(!ok)return;
    friendTransferBusy=true;send.disabled=true;send.textContent='보내는 중...';try{const d=await api('/api/wallet/transfer',{method:'POST',body:JSON.stringify({targetId:friendTransferTarget.id,amount:n})});me=d.user;updateHeader();const profileBalance=$('#profileBalance');if(profileBalance)profileBalance.textContent=money(me.balance);toast(`🎁 ${friendTransferTarget.nickname}님에게 ${money(n)} 보냈어!`);amount.value=Math.min(10000,Number(me.balance||0));resetFriendTarget('전송 완료. 또 보내려면 친구를 다시 확인해줘.');nick.value='';fx('win')}catch(e){toast(e.message);send.disabled=false}finally{friendTransferBusy=false;send.textContent='선택한 친구에게 보내기'}
  };
}
async function openFriendGiftPicker(target){
  if(!target)return;
  try{
    if(!shopData)shopData=await api('/api/shop');
    const items=(shopData.items||[]).filter(x=>x&&!x.adminOnly);
    const box=document.createElement('div');box.className='gift-picker-overlay';
    box.innerHTML=`<div class="gift-picker panel"><div class="gift-picker-head"><div><small>JUNJA GIFT</small><h3>${html(target.nickname)}에게 선물</h3></div><button type="button" data-gift-close>✕</button></div><p>내 게임머니로 새 아이템을 구매해서 친구 컬렉션에 바로 선물해.</p><div class="gift-picker-grid">${items.slice().sort((a,b)=>a.price-b.price).map(x=>`<button type="button" data-gift-item="${x.id}" ${(target.ownedItems||[]).filter(Boolean).some(o=>o.id===x.id)?'disabled':''}><b>${html(x.icon||'◆')}</b><span>${html(x.name)}</span><small>${(target.ownedItems||[]).filter(Boolean).some(o=>o.id===x.id)?'이미 보유':money(x.price)}</small></button>`).join('')}</div></div>`;
    document.body.appendChild(box);
    const close=()=>box.remove();box.querySelector('[data-gift-close]').onclick=close;box.onclick=e=>{if(e.target===box)close()};
    box.querySelectorAll('[data-gift-item]').forEach(b=>b.onclick=async()=>{const item=items.find(x=>x.id===b.dataset.giftItem);if(!item)return;if(!confirm(`${target.nickname}님에게 ${item.name}을 ${money(item.price)}에 선물할까?`))return;b.disabled=true;try{const d=await api('/api/shop/gift',{method:'POST',body:JSON.stringify({targetId:target.id,itemId:item.id})});me=d.user;updateHeader();shopData=null;toast(`🎁 ${target.nickname}님에게 ${item.name} 선물 완료!`);close();fx('win')}catch(e){toast(e.message);b.disabled=false}});
  }catch(e){toast(e.message)}
}
async function logout(){stopLiveFloor();await api('/api/logout',{method:'POST',body:'{}'}).catch(()=>{});location.reload()}
async function loadLedger(){try{const d=await api('/api/ledger');$('#ledgerList').innerHTML=d.rows.map(r=>`<div class="ledger-row"><div><b>${html(r.memo)}</b><small>${timeText(r.created_at)} · 잔액 ${money(r.balance_after)}</small></div><b class="${r.amount>=0?'plus':'minus'}">${r.amount>=0?'+':''}${money(r.amount)}</b></div>`).join('')||'<div class="empty">내역이 없습니다.</div>'}catch(e){toast(e.message)}}


// ADMIN CONTROL CENTER
async function loadAdmin(query='',notify=true){
  if(!me?.is_admin)return;
  try{
    const [u,a,rr]=await Promise.all([api('/api/admin/users?q='+encodeURIComponent(query)),api('/api/admin/audit'),api('/api/admin/rooms')]);
    const rows=u.rows||[];
    $('#adminUserCount').textContent=rows.length;
    $('#adminTotalMoney').textContent=money(rows.reduce((s,x)=>s+Number(x.balance||0),0));
    $('#adminDisabledCount').textContent=rows.filter(x=>x.is_disabled).length;
    $('#adminUsers').innerHTML=rows.map(adminUserHtml).join('')||'<div class="empty">검색 결과가 없습니다.</div>';
    $('#adminAudit').innerHTML=(a.rows||[]).map(x=>`<div class="admin-audit-row"><div><b>${x.action==='credit'?'💰 지급':x.action==='debit'?'💸 차감':x.action==='disable'?'⛔ 이용중지':'✅ 이용재개'}</b><span>${html(x.target_nickname)} <small>@${html(x.target_username)}</small></span></div><strong class="${x.amount>0?'plus':x.amount<0?'minus':''}">${x.amount?((x.amount>0?'+':'')+money(x.amount)):'-'}</strong><p>${html(x.memo)} · ${timeText(x.created_at)}</p></div>`).join('')||'<div class="empty">관리자 작업 기록이 없습니다.</div>';
    if($('#adminRooms'))$('#adminRooms').innerHTML=(rr.rows||[]).map(r=>`<div class="admin-room-row"><div><b>${html(r.name)}</b><small>${r.game==='holdem'?'홀덤':r.game==='baccarat'?'바카라':'윷놀이'} · ${r.status} · ${r.players}/${r.maxPlayers}명 · ${money(r.game==='baccarat'?r.stake:r.buyIn)}</small><div class="room-mini-users">${(r.participants||[]).map(p=>`<span class="${p.ready?'ready':''}">${AVATAR_SAFE(p.avatar)} ${html(p.nickname)}</span>`).join('')}</div></div><button class="danger" data-admin-close-room="${r.id}" type="button">강제 종료</button></div>`).join('')||'<div class="empty">현재 열린 게임방이 없습니다.</div>';
    bindAdminRows();bindAdminRoomRows();
  }catch(e){if(notify)toast(e.message)}
}
function adminUserHtml(u){
  const totalGames=(u.poker_hands||0)+(u.yut_games||0)+(u.seotda_games||0)+(u.gostop_games||0)+(u.slot_spins||0)+(u.horse_races||0)+(u.bigwheel_plays||0)+(u.sicbo_plays||0);
  return `<div class="admin-user-card ${u.is_disabled?'disabled-user':''}" data-admin-user="${u.id}">
    <div class="admin-user-main"><div class="admin-avatar">${u.avatarEmoji}</div><div class="admin-identity"><div><b>${html(u.nickname)}</b>${u.is_admin?'<span class="admin-mini-badge">ADMIN</span>':''}${u.is_disabled?'<span class="disabled-mini-badge">STOP</span>':''}</div><small>@${html(u.username)} · 가입 ${new Date(u.created_at).toLocaleDateString('ko-KR')}</small></div><div class="admin-balance"><span>보유머니</span><b>${money(u.balance)}</b></div></div>
    <div class="admin-user-stats"><span>플레이 <b>${totalGames}</b></span><span>홀덤승 <b>${u.poker_wins||0}</b></span><span>윷승 <b>${u.yut_wins||0}</b></span><span>슬롯손익 <b>${signedMoney(u.slot_profit||0)}</b></span></div>
    <div class="admin-quick-money credit"><span>빠른 지급</span><button type="button" data-admin-add="10000000">+1,000만</button><button type="button" data-admin-add="1000000000">+10억</button><button type="button" data-admin-add="100000000000">+1,000억</button></div>
    <div class="admin-quick-money debit"><span>빠른 차감</span><button type="button" data-admin-debit="100000">-10만</button><button type="button" data-admin-debit="1000000">-100만</button><button type="button" data-admin-debit="all">잔액 전액</button></div>
    <div class="admin-custom-control"><input class="admin-amount" inputmode="numeric" type="number" min="1" max="1000000000" step="1000" placeholder="직접 금액 입력"><input class="admin-memo" maxlength="60" placeholder="사유 예: 이벤트 보너스"><button class="admin-credit-btn" type="button">+ 지급</button><button class="admin-debit-btn danger" type="button">− 차감</button>${u.is_admin?'':`<button class="${u.is_disabled?'admin-enable-btn':'admin-disable-btn'}" type="button">${u.is_disabled?'이용재개':'이용중지'}</button>`}</div>
  </div>`;
}
function bindAdminRows(){
  $$('.admin-user-card').forEach(card=>{
    const userId=Number(card.dataset.adminUser),amountInput=$('.admin-amount',card),memoInput=$('.admin-memo',card);
    $$('[data-admin-add]',card).forEach(b=>b.onclick=()=>adminAdjustMoney(userId,Number(b.dataset.adminAdd),'credit',memoInput.value||'관리자 보너스'));
    $$('[data-admin-debit]',card).forEach(b=>b.onclick=()=>{const n=b.dataset.adminDebit==='all'?Number(card.querySelector('.admin-balance b')?.textContent.replace(/[^0-9]/g,'')||0):Number(b.dataset.adminDebit);if(n>0)adminAdjustMoney(userId,n,'debit',memoInput.value||'관리자 차감')});
    $('.admin-credit-btn',card)?.addEventListener('click',()=>{const n=Math.trunc(Number(amountInput.value));if(n>0)adminAdjustMoney(userId,n,'credit',memoInput.value||'관리자 지급');else toast('지급 금액을 입력해줘.')});
    $('.admin-debit-btn',card)?.addEventListener('click',()=>{const n=Math.trunc(Number(amountInput.value));if(n>0)adminAdjustMoney(userId,n,'debit',memoInput.value||'관리자 차감');else toast('차감 금액을 입력해줘.')});
    $('.admin-disable-btn',card)?.addEventListener('click',()=>adminSetStatus(userId,true));
    $('.admin-enable-btn',card)?.addEventListener('click',()=>adminSetStatus(userId,false));
  });
}
function bindAdminRoomRows(){
  $$('[data-admin-close-room]').forEach(b=>b.onclick=async()=>{if(!confirm('이 방을 강제 종료하고 참가자 판돈을 복구할까?'))return;try{await api(`/api/admin/rooms/${b.dataset.adminCloseRoom}/close`,{method:'POST',body:'{}'});toast('게임방 종료 완료');await loadAdmin($('#adminSearch')?.value.trim()||'')}catch(e){toast(e.message)}});
  if($('#adminClearWaiting'))$('#adminClearWaiting').onclick=async()=>{if(!confirm('현재 WAITING 상태의 모든 대기실을 비우고 판돈을 환급할까?'))return;try{const d=await api('/api/admin/rooms/clear-waiting',{method:'POST',body:'{}'});toast(`${d.count}개 대기실 정리 완료`);await loadAdmin($('#adminSearch')?.value.trim()||'')}catch(e){toast(e.message)}};
}
async function adminAdjustMoney(userId,amount,direction='credit',memo='관리자 조정'){
  amount=Math.abs(Math.trunc(Number(amount)||0));if(!Number.isInteger(amount)||amount<1){toast('금액을 입력해줘.');return}
  const action=direction==='debit'?'차감':'지급';
  if(direction==='debit'&&!confirm(`${money(amount)}을 정말 차감할까?`))return;
  if(direction==='credit'&&amount>=10000000&&!confirm(`${money(amount)}을 지급할까?`))return;
  try{const d=await api('/api/admin/wallet',{method:'POST',body:JSON.stringify({userId,amount,direction,memo})});toast(`✅ ${action} 완료 · 잔액 ${money(d.balance)}`);await loadAdmin($('#adminSearch')?.value.trim()||'');await refreshMe()}catch(e){toast(`❌ ${action} 실패 · ${e.message}`)}
}
async function adminSetStatus(userId,disabled){
  if(!confirm(disabled?'이 회원의 로그인을 즉시 중지할까?':'이 회원의 이용을 다시 허용할까?'))return;
  try{await api('/api/admin/status',{method:'POST',body:JSON.stringify({userId,disabled})});toast(disabled?'계정 이용중지 완료':'계정 이용재개 완료');await loadAdmin($('#adminSearch')?.value.trim()||'')}catch(e){toast(e.message)}
}

// SLOT 3x3 · v1.4 LAS VEGAS / JACKPOT SAFE AUTO SPIN
function renderSlotSession(){
  if($('#slotSessionSpins'))$('#slotSessionSpins').textContent=slotSession.spins;
  if($('#slotSessionWins'))$('#slotSessionWins').textContent=slotSession.wins;
  if($('#slotSessionNet')){$('#slotSessionNet').textContent=signedMoney(slotSession.net);$('#slotSessionNet').className=slotSession.net>0?'plus':slotSession.net<0?'minus':''}
  if($('#slotSessionBest'))$('#slotSessionBest').textContent=money(slotSession.best);
  if($('#slotRecentItems'))$('#slotRecentItems').innerHTML=slotSession.recent.map(x=>`<span class="${x.profit>0?'win':x.profit<0?'loss':'even'}">${x.jackpot?'★ ':''}${x.profit>=0?'+':''}${money(x.profit)}</span>`).join('')||'<em>아직 기록 없음</em>';
}
function updateSlotSession(d){slotSession.spins++;if(d.payout>0)slotSession.wins++;slotSession.net+=Number(d.profit||0);slotSession.best=Math.max(slotSession.best,Number(d.payout||0));slotSession.recent.unshift({profit:Number(d.profit||0),jackpot:!!d.jackpot});slotSession.recent=slotSession.recent.slice(0,6);renderSlotSession()}
function resetSlotSession(){slotSession={spins:0,wins:0,net:0,best:0,recent:[]};renderSlotSession();toast('슬롯 세션 기록을 초기화했어.')}
function closeSlotJackpot(){$('#slotJackpotOverlay')?.classList.add('hidden');document.body.classList.remove('jackpot-open')}
function jackpotConfetti(){for(let wave=0;wave<3;wave++)setTimeout(()=>{for(let i=0;i<60;i++){const x=document.createElement('i');x.className='jackpot-confetti';const fromLeft=Math.random()<.5;x.style.left=(fromLeft?-2:102)+'vw';x.style.top=(10+Math.random()*55)+'vh';x.style.setProperty('--tx',`${(fromLeft?1:-1)*(35+Math.random()*75)}vw`);x.style.setProperty('--ty',`${(-20+Math.random()*95)}vh`);x.style.setProperty('--rot',`${360+Math.random()*1080}deg`);x.style.setProperty('--delay',`${Math.random()*.18}s`);document.body.appendChild(x);setTimeout(()=>x.remove(),2600)}},wave*320)}
function showSlotJackpot(d){
  autoSpinStop=true;
  const isSeven=d.jackpotSymbol==='7️⃣',overlay=$('#slotJackpotOverlay');if(!overlay)return;
  overlay.classList.remove('hidden','j-jackpot','seven-jackpot');overlay.classList.add(isSeven?'seven-jackpot':'j-jackpot');
  $('#jackpotTitle').textContent=isSeven?'RED 777 JACKPOT':'JUNJA J JACKPOT';
  $('#jackpotSymbol').textContent=isSeven?'777':'JJJ';
  $('#jackpotPayout').textContent=isSeven&&d.poolJackpot?`누적 풀 ${money(d.jackpotAward)} + 기본 당첨 ${money(d.regularPayout)} = 총 ${money(d.payout)}`:`${money(d.payout)} · x${isSeven?1000:500}`;
  document.body.classList.add('jackpot-open');fx('jackpot');jackpotConfetti();setTimeout(confetti,150);setTimeout(confetti,850);
}
function updateCurrentBetLabel(){if($('#currentBetLabel'))$('#currentBetLabel').textContent=money(selectedBet)}
function normalizeSlotBet(v){v=Math.floor(Number(v)||1000);v=Math.max(1000,Math.min(100000,v));return Math.floor(v/1000)*1000}
function syncSlotBetInput(input){const n=Math.floor(Number(input?.value));if(Number.isFinite(n)&&n>=1000&&n<=100000&&n%1000===0){selectedBet=n;$$('.bet-chip').forEach(x=>x.classList.remove('active'));updateCurrentBetLabel()}}
function normalizeSlotBetInput(input){if(!input)return;selectedBet=normalizeSlotBet(input.value);input.value=selectedBet;$$('.bet-chip').forEach(x=>x.classList.remove('active'));updateCurrentBetLabel()}
function randomSlotSymbol(){return SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)]}
function slotCell(sym,r,c){
  const face=sym==='7️⃣'?'<span class="vegas-seven" aria-label="7">7</span>':sym==='J'?'<span class="junja-j" aria-label="J">J</span>':`<span>${sym}</span>`;
  return `<div class="slot-cell ${SLOT_CELL_CLASS[sym]||''}" data-r="${r}" data-c="${c}">${face}</div>`
}
function renderSlotGrid(grid){if(!grid)return;for(let c=0;c<3;c++){const inner=$(`.slot-column[data-col="${c}"] .slot-column-inner`);if(!inner)continue;inner.innerHTML='';for(let r=0;r<3;r++)inner.insertAdjacentHTML('beforeend',slotCell(grid[r][c],r,c))}}
function initSlotMachine(force=false){selectedBet=normalizeSlotBet($('#slotBetInput')?.value||selectedBet);if($('#slotBetInput'))$('#slotBetInput').value=selectedBet;updateCurrentBetLabel();if(!$('#slotGrid'))return;const empty=$$('.slot-column-inner').some(x=>!x.children.length);if(force||empty)renderSlotGrid(Array.from({length:3},()=>Array.from({length:3},randomSlotSymbol)))}
function clearSlotEffects(){$$('.slot-cell.win,.slot-cell.j-special,.slot-cell.seven-special').forEach(x=>x.classList.remove('win','j-special','seven-special'));$$('.payline.active').forEach(x=>x.classList.remove('active'));$('#slotGrid')?.classList.remove('jackpot-seven','jackpot-j');if($('#slotWins'))$('#slotWins').innerHTML=''}
function startSlotSpin(fast=false){
  clearSlotEffects();slotSpinState={timers:[],animations:[]};
  $$('.slot-column').forEach((col,idx)=>{
    col.classList.add('spinning');const inner=$('.slot-column-inner',col);inner.style.willChange='transform,filter';
    const tick=()=>{inner.innerHTML=[0,1,2].map(r=>slotCell(randomSlotSymbol(),r,idx)).join('')};tick();
    slotSpinState.timers.push(setInterval(tick,(fast?82:112)+idx*12));
    const anim=inner.animate([{transform:'translate3d(0,-13px,0)',filter:'blur(.5px)'},{transform:'translate3d(0,13px,0)',filter:'blur(1.6px)'}],{duration:(fast?100:138)+idx*12,iterations:Infinity,direction:'alternate',easing:'cubic-bezier(.32,.01,.46,.99)'});
    slotSpinState.animations.push(anim)
  });
  $('#slotGrid').classList.add('is-spinning');fx('spin')
}
async function stopSlotSpin(grid,fast=false){
  for(let c=0;c<3;c++){
    // Let each reel land clearly from left to right instead of revealing all
    // three columns almost at once.
    await sleep((fast?90:220)+c*(fast?60:130));
    clearInterval(slotSpinState?.timers?.[c]);slotSpinState?.animations?.[c]?.cancel();
    const col=$(`.slot-column[data-col="${c}"]`),inner=$('.slot-column-inner',col);
    inner.style.transform='translate3d(0,0,0)';inner.style.filter='none';inner.innerHTML=[0,1,2].map(r=>slotCell(grid[r][c],r,c)).join('');
    col.classList.remove('spinning');col.classList.add('settled');fx('stop');setTimeout(()=>col.classList.remove('settled'),300)
  }
  $('#slotGrid').classList.remove('is-spinning');slotSpinState=null
}
function applySlotHighlights(lines=[]){
  const active=new Set(),jCells=new Set(),sevenCells=new Set();let hasJ=false,hasSeven=false;
  for(const w of lines){if(w.cssClass)$(`.payline-${w.cssClass}`)?.classList.add('active');const sym=w.symbols?.[0];if(sym==='J')hasJ=true;if(sym==='7️⃣')hasSeven=true;(w.cells||[]).forEach(([r,c])=>{const k=`${r}-${c}`;active.add(k);if(sym==='J')jCells.add(k);if(sym==='7️⃣')sevenCells.add(k)})}
  for(const key of active){const [r,c]=key.split('-'),cell=$(`.slot-cell[data-r="${r}"][data-c="${c}"]`);cell?.classList.add('win');if(jCells.has(key))cell?.classList.add('j-special');if(sevenCells.has(key))cell?.classList.add('seven-special')}
  if(hasSeven)$('#slotGrid')?.classList.add('jackpot-seven');if(hasJ)$('#slotGrid')?.classList.add('jackpot-j');
  $('#slotWins').innerHTML=lines.map(w=>{const sym=w.symbols?.[0],special=sym==='7️⃣'?' seven-win':sym==='J'?' j-win':'';return `<div class="win-pill ${w.scatter?'scatter':''}${special}">${sym==='7️⃣'?'🔥 ':sym==='J'?'👑 ':w.scatter?'⭐ ':''}${w.label} · ${w.symbols.join(' ')} · x${w.mult}</div>`}).join('')
}
function setAutoSpinUi(active,status='수동 모드'){
  autoSpinRunning=active;
  if($('#autoSpinStatus'))$('#autoSpinStatus').textContent=status;
  $$('[data-auto-spin]').forEach(b=>b.disabled=active);
  $$('.bet-chip').forEach(b=>b.disabled=active);if($('#slotBetInput'))$('#slotBetInput').disabled=active;
  if($('#autoStopBtn'))$('#autoStopBtn').disabled=!active;
  if($('#spinBtn'))$('#spinBtn').disabled=active||!!slotSpinState
}
async function spin({manual=false,fast=false}={}){
  const btn=$('#spinBtn');if(slotSpinState||(manual&&autoSpinRunning))return false;
  selectedBet=normalizeSlotBet($('#slotBetInput')?.value||selectedBet);if($('#slotBetInput'))$('#slotBetInput').value=selectedBet;updateCurrentBetLabel();
  if(manual){btn.disabled=true;btn.textContent='SPINNING'}
  $('#slotResult').textContent='릴 회전 중...';startSlotSpin(fast);
  try{
    const d=await api('/api/slot/spin',{method:'POST',body:JSON.stringify({bet:selectedBet})});
    await sleep(fast?90:250);await stopSlotSpin(d.grid,fast);applySlotHighlights(d.winLines||[]);
    if(d.payout>0){$('#slotResult').textContent=`${d.jackpot?'🔥 JACKPOT! ':''}${money(d.payout)} 당첨 · x${d.totalMultiplier}`;fx(d.jackpot?'jackpot':'win');if(d.jackpot||(d.winLines||[]).length>1)confetti()}
    else $('#slotResult').textContent=`-${money(d.bet)} · 다음 SPIN 도전`;
    me=d.user;updateHeader();if($('#slotJackpotAmount'))$('#slotJackpotAmount').textContent=money(d.jackpotPool);if($('#lobbyJackpotAmount'))$('#lobbyJackpotAmount').textContent=money(d.jackpotPool);updateSlotSession(d);if(d.jackpot)showSlotJackpot(d);return d
  }catch(e){
    (slotSpinState?.timers||[]).forEach(clearInterval);(slotSpinState?.animations||[]).forEach(a=>a.cancel());slotSpinState=null;
    $$('.slot-column').forEach(c=>c.classList.remove('spinning'));$('#slotGrid').classList.remove('is-spinning');toast(e.message);$('#slotResult').textContent='자동/수동 SPIN을 중지했어. 잔액과 베팅금액을 확인해.';return false
  }finally{
    if(manual){btn.disabled=false;btn.textContent='SPIN'}
  }
}
async function runAutoSpins(count){
  if(autoSpinRunning||slotSpinState)return;
  selectedBet=normalizeSlotBet($('#slotBetInput')?.value||selectedBet);if($('#slotBetInput'))$('#slotBetInput').value=selectedBet;updateCurrentBetLabel();
  autoSpinStop=false;setAutoSpinUi(true,`0 / ${count}회`);
  let done=0,jackpotHit=false;
  try{
    for(let i=0;i<count&&!autoSpinStop;i++){
      if((me?.balance||0)<selectedBet){toast('게임머니가 부족해서 자동 SPIN을 중지했어.');break}
      const result=await spin({fast:true});if(!result)break;done++;
      if(result.jackpot){jackpotHit=true;autoSpinStop=true;if($('#autoSpinStatus'))$('#autoSpinStatus').textContent=`JACKPOT · ${done}회에서 자동 중지`;break}
      if($('#autoSpinStatus'))$('#autoSpinStatus').textContent=`${done} / ${count}회`;
      await sleep(90)
    }
  }finally{
    const finalStatus=jackpotHit?`JACKPOT · ${done}회에서 중지`:done===count?`${done}회 완료`:`${done}회에서 중지`;
    autoSpinStop=false;setAutoSpinUi(false,finalStatus);
    if($('#spinBtn')){$('#spinBtn').disabled=false;$('#spinBtn').textContent='SPIN'}
  }
}

// MULTI ROOMS v0.9 - READY / TURN / RECOVERY / POLLING
function stopRoomPolling(){if(roomPollTimer){clearInterval(roomPollTimer);roomPollTimer=null}}
function startRoomPolling(){stopRoomPolling();if(!currentRoomId)return;roomPollTimer=setInterval(()=>{if(!document.hidden&&currentRoomId&&currentView===currentGame)loadCurrentRoom(true).catch(()=>{})},2200)}
async function resumeMyRoom(){
  try{
    const d=await api('/api/my-room');if(!d.room)return;
    currentRoomId=d.room.id;currentGame=d.room.game;currentView=d.room.game;
    $$('.view').forEach(v=>v.classList.remove('active'));$('#view-'+currentView)?.classList.add('active');
    renderRoom(d.room);startRoomPolling();if(LIVE_GAME_VIEWS.has(d.room.game))startLiveFloor(d.room.game);toast(`진행 중인 ${d.room.name}으로 복귀했어.`);
  }catch{}
}
function roomParticipantChips(room){return `<div class="room-participant-strip">${room.players.map(p=>`<div class="participant-chip ${p.ready?'ready':''} ${p.userId===me.id?'me':''}">${avatarImg(p.avatar,p.nickname,'mini-face',p.cosmetics)}<b>${html(p.nickname)}</b>${room.status==='WAITING'?`<i>${p.ready?'READY':'WAIT'}</i>`:''}${room.hostId===p.userId?'<em>HOST</em>':''}${reactionBubble(room,p.userId)}</div>`).join('')}</div>`}
function roomTurnBanner(room){
  if(room.status==='WAITING'){
    const need=Math.max(0,room.players.length-(room.readyCount||0));
    return `<div class="turn-banner waiting"><strong>대기실 · READY ${room.readyCount||0}/${room.players.length}</strong><span>${room.players.length<2?'한 명 이상 더 입장해야 시작할 수 있어.':need?`${need}명이 아직 준비 전이야.`:(room.game==='holdem'?'전원 READY · 5초 뒤 자동 시작!':'전원 READY · 방장이 시작할 수 있어!')}</span></div>`;
  }
  if(room.myTurn)return `<div class="turn-banner my-turn"><strong>🔥 지금 내 차례!</strong><span>아래 행동 버튼을 눌러 진행해.</span></div>`;
  return `<div class="turn-banner other-turn"><strong>⏳ ${html(room.turnNickname||'상대')} 차례</strong><span>상대 행동이 끝나면 자동으로 화면이 갱신돼.</span></div>`;
}
async function createRoom(game){try{
  let body;if(game==='holdem')body={game,maxPlayers:Number($('#holdemMax').value)};
  else if(game==='yut')body={game,buyIn:Number($('#yutBuyIn').value),maxPlayers:Number($('#yutMax').value),yutMode:$('#yutMode')?.value||'individual'};
  else if(game==='seotda')body={game,buyIn:normalizeWalletWagerInput('seotdaMultiBuyIn',5000),maxPlayers:2};
  else if(game==='sevenpoker')body={game,maxPlayers:2};
  else throw new Error('지원하지 않는 게임방이야.');
  const d=await api('/api/rooms',{method:'POST',body:JSON.stringify(body)});currentRoomId=d.room.id;currentGame=game;lastRoomVersion=d.room.version||0;renderRoom(d.room);startRoomPolling();await refreshMe();toast(`방 코드 ${d.room.id} 생성 완료 · READY를 눌러줘`)
}catch(e){toast(e.message);if(/이미 다른 게임방/.test(e.message))resumeMyRoom()}}
async function loadRooms(game){if(currentRoomId)return loadCurrentRoom(true);try{
  const d=await api('/api/rooms?game='+game),root=$('#'+game+'Rooms');if(!root)return;
  const detail=r=>game==='holdem'?`BLIND ${money(r.smallBlind)}/${money(r.bigBlind)}`:game==='yut'?html(r.yutModeLabel||'개인전'):game==='seotda'?'3장 · 공개 버리기 · 1:1':'7 CARD STUD · 1:1';
  root.innerHTML=d.rooms.map(r=>`<div class="room-row deluxe-room-row"><div class="room-row-main"><h4>${html(r.name)} <span class="status ${r.status==='PLAYING'?'play':'wait'}">${r.status}</span></h4><p>코드 ${r.id} · ${r.players}/${r.maxPlayers}명 · ${money(r.buyIn)} · ${detail(r)}</p><div class="room-mini-users">${(r.participants||[]).map(p=>`<span class="${p.ready?'ready':''}">${AVATAR_SAFE(p.avatar)} ${html(p.nickname)}${p.ready?' ✓':''}</span>`).join('')||'<span>아직 참가자 없음</span>'}</div></div><div class="room-row-actions"><b>${r.readyCount||0} READY</b><button class="secondary" data-join="${r.id}" ${r.status==='PLAYING'?'disabled':''} type="button">${r.status==='PLAYING'?'진행중':'입장'}</button></div></div>`).join('')||'<div class="empty">열린 방이 없어. 먼저 하나 만들어봐.</div>';
  $$('[data-join]',root).forEach(b=>b.onclick=()=>joinRoom(game,b.dataset.join));
}catch(e){toast(e.message)}}
function AVATAR_SAFE(n){const a=['🧑‍💼','😎','🧢','👑','🐯','🐻','🦊','🐼','🐸','🦁'];return a[Number(n||0)%a.length]}
async function joinRoom(game,id){try{const d=await api(`/api/rooms/${id}/join`,{method:'POST',body:'{}'});currentRoomId=id;currentGame=game;lastRoomVersion=d.room.version||0;renderRoom(d.room);startRoomPolling();await refreshMe();toast('입장 완료 · READY를 눌러줘')}catch(e){toast(e.message);if(/이미 다른 게임방/.test(e.message))resumeMyRoom()}}
async function loadCurrentRoom(silent=false){
  if(!currentRoomId||roomRefreshBusy)return;roomRefreshBusy=true;
  try{
    const d=await api(currentGame==='baccarat'?`/api/baccarat/rooms/${currentRoomId}`:`/api/rooms/${currentRoomId}`);if(!d.room)throw new Error('방을 찾을 수 없습니다.');
    const version=d.room.version||0;if(version!==lastRoomVersion||!silent||(currentGame==='holdem'&&d.room.autoStartAt)){lastRoomVersion=version;renderRoom(d.room)}
    if(!silent)await refreshMe();
  }catch(e){
    if(!silent)toast(e.message);
    if(/찾을 수 없습니다|참가자가 아닙니다/.test(e.message)){const oldGame=currentGame;currentRoomId=null;currentGame=null;lastRoomVersion=-1;stopRoomPolling();if(oldGame){$(`#${oldGame}Room`)?.classList.add('hidden');$(`#${oldGame}Browser`)?.classList.remove('hidden');loadRooms(oldGame)}}
  }finally{roomRefreshBusy=false}
}
function notifyRoomJoins(room){
  const ids=new Set((room.players||[]).map(p=>Number(p.userId))),prev=roomSeenMembers.get(room.id);
  if(prev){for(const p of room.players||[]){const id=Number(p.userId);if(id!==Number(me?.id)&&!prev.has(id))toast(`🎮 ${p.nickname}님이 방에 들어왔어!`)}}
  roomSeenMembers.set(room.id,ids);
}
function renderRoom(room){lastRoomVersion=room.version||lastRoomVersion;notifyRoomJoins(room);if(room.game==='holdem')renderHoldem(room);else if(room.game==='sevenpoker')renderSevenPokerMulti(room);else if(room.game==='seotda')renderSeotdaMulti(room);else if(room.game==='yut')renderYut(room);else if(room.game==='baccarat')renderBaccaratRoom(room)}
async function toggleReady(){if(!currentRoomId)return;try{const d=await api(`/api/rooms/${currentRoomId}/ready`,{method:'POST',body:'{}'});renderRoom(d.room)}catch(e){toast(e.message)}}
function restoreRoomBrowser(game){$(`#${game}Room`)?.classList.add('hidden');$(`#${game}Browser`)?.classList.remove('hidden');if(game==='baccarat')loadBaccaratRooms();else if(game)loadRooms(game)}
async function leaveRoom(){if(!currentRoomId)return;try{const endpoint=currentGame==='baccarat'?`/api/baccarat/rooms/${currentRoomId}/leave`:`/api/rooms/${currentRoomId}/leave`;await api(endpoint,{method:'POST',body:'{}'});const old=currentGame;currentRoomId=null;currentGame=null;lastRoomVersion=-1;stopRoomPolling();clearTimeout(baccaratAutoTimer);await refreshMe();restoreRoomBrowser(old)}catch(e){toast(e.message)}}
async function closeRoom(){if(!currentRoomId)return;if(!confirm('대기실/게임을 종료하고 참가자에게 보유 판돈을 환급할까?'))return;try{await api(`/api/rooms/${currentRoomId}/close`,{method:'POST',body:'{}'});const old=currentGame;currentRoomId=null;currentGame=null;lastRoomVersion=-1;stopRoomPolling();toast('방을 비웠어.');await refreshMe();restoreRoomBrowser(old)}catch(e){toast(e.message)}}
async function recoverRoom(){if(!currentRoomId)return;if(!confirm('게임 상태가 꼬였을 때만 사용해. 방을 강제 종료하고 판돈을 복구할까?'))return;try{await api(`/api/rooms/${currentRoomId}/recover`,{method:'POST',body:'{}'});const old=currentGame;currentRoomId=null;currentGame=null;lastRoomVersion=-1;stopRoomPolling();toast('게임방 복구 완료 · 로비로 돌아왔어.');await refreshMe();restoreRoomBrowser(old)}catch(e){toast(e.message)}}
async function startRoom(){try{const d=await api(`/api/rooms/${currentRoomId}/start`,{method:'POST',body:'{}'});renderRoom(d.room);await loadCurrentRoom()}catch(e){toast(e.message)}}
function roomToolbar(room){const host=room.hostId===me.id,mine=room.players.find(p=>p.userId===me.id),waiting=room.status==='WAITING';return `<div class="room-shell-head">${roomTurnBanner(room)}${roomParticipantChips(room)}</div><div class="room-toolbar"><div class="room-title"><h3>${html(room.name)}</h3><small>방 코드 <b>${room.id}</b> · ${room.allWallet?'전액 스택 테이블':'판돈 '+money(room.buyIn)} · ${room.players.length}/${room.maxPlayers}명</small></div><div class="toolbar-actions"><button class="secondary copy-code" type="button">코드 복사</button><button class="secondary copy-link" type="button">초대 링크</button>${waiting?`<button class="${mine?.ready?'ready-on':'primary'} ready-room" type="button">${mine?.ready?'✓ READY':'READY'}</button>`:''}${host&&waiting?`<button class="primary start-room" ${!room.allReady?'disabled':''} type="button">${room.allReady?(room.game==='holdem'?'즉시 시작 · 자동 5초':'게임 시작'):'전원 READY 대기'}</button><button class="danger close-room" type="button">대기실 비우기</button>`:''}${!waiting?'<button class="danger recover-room" type="button">오류 복구</button>':''}<button class="secondary leave-room" ${!waiting?'disabled title="진행 중에는 오류 복구를 이용해줘"':''} type="button">나가기</button></div></div>${reactionDockHtml()}`}
function bindRoomCommon(root,room){$('.copy-code',root).onclick=async()=>{try{await navigator.clipboard.writeText(room.id);toast('방 코드 복사 완료')}catch{toast('방 코드: '+room.id)}};$('.copy-link',root).onclick=async()=>{const link=`${location.origin}/?game=${room.game}&room=${room.id}`;try{if(navigator.share)await navigator.share({title:'JUNJA GAME CLUB',text:`${room.name} 같이 하자!`,url:link});else{await navigator.clipboard.writeText(link);toast('초대 링크 복사 완료')}}catch(e){if(e.name!=='AbortError')toast('초대 링크를 복사하지 못했습니다.')}};$('.leave-room',root)?.addEventListener('click',leaveRoom);$('.ready-room',root)?.addEventListener('click',toggleReady);$('.start-room',root)?.addEventListener('click',startRoom);$('.close-room',root)?.addEventListener('click',closeRoom);$('.recover-room',root)?.addEventListener('click',recoverRoom);$$('[data-reaction]',root).forEach(b=>b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{const d=await api(`/api/rooms/${currentRoomId}/reaction`,{method:'POST',body:JSON.stringify({key:b.dataset.reaction})});renderRoom(d.room);setTimeout(()=>{if(currentRoomId===room.id)loadCurrentRoom(false).catch(()=>{})},4700)}catch(e){toast(e.message)}finally{setTimeout(()=>b.disabled=false,750)}})}
function privacyPanelHtml(){return `<div class="privacy-room-card panel"><div class="privacy-shield">🛡️</div><div><small>PRIVACY MODE</small><h3>텍스트 채팅 없음</h3><p>개인정보 노출 없는 고정 말풍선만 지원합니다.</p></div></div>`}

// POKER RENDER (MULTI + SOLO) · v1.2 IMPACT TABLE
const POKER_RANKS=['스트레이트 플러시','포카드','풀하우스','플러시','스트레이트','트리플','투페어','원페어','하이카드'];
const pokerSceneCache=new Map();
function pokerStatusPanel(h){
  const info=h?.myHand||{name:'카드 대기',detail:'카드가 배분되면 현재 패가 표시돼.',draws:[],rankLevel:-1};
  const draws=(info.draws||[]).map(x=>`<span>${html(x)}</span>`).join(''),level=Math.max(-1,Math.min(8,Number(info.rankLevel??-1)));
  const impact=level>=0?` impact-${level}`:'';
  return `<div class="poker-hand-panel panel${impact}"><div class="hand-impact-ring"></div><div class="hand-now"><small>CURRENT HAND</small><h3>${html(info.name||'카드 대기')}</h3><p>${html(info.detail||'')}</p>${draws?`<div class="draw-tags">${draws}</div>`:''}${level>=3?'<div class="hand-power"><i></i><i></i><i></i><span>HAND POWER</span></div>':''}</div><div class="hand-rank-table"><b>족보 순위</b>${POKER_RANKS.map((x,i)=>`<div class="${x===info.name?'active':''}"><span>${i+1}</span><em>${x}</em></div>`).join('')}</div><div class="hand-tip">하이카드부터 단계별 연출 · 높은 족보일수록 효과가 강해져.</div></div>`;
}
function pokerFaceHtml(p){const bot=p?.bot||Number(p?.userId)<0;if(bot)return `<img class="poker-face" src="/art/poker-avatars/bot.svg" alt="J-BOT">`;return styledAvatar(p?.avatar||0,p?.nickname||'플레이어','poker-face',p?.cosmetics||(Number(p?.userId)===Number(me?.id)?me?.cosmetics:null))}
function pokerShouldDeal(room,h){
  if(!h)return false;
  const key=`${h.startedAt||0}:${h.phase}:${h.board?.length||0}`;
  const old=pokerSceneCache.get(room.id);pokerSceneCache.set(room.id,key);return old!==key
}
function pokerTableHtml(room,h,solo=false,deal=false){
  const players=room.players;let seats='',di=0;
  for(let i=0;i<room.maxPlayers;i++){
    const p=players.find(x=>x.seat===i);
    if(!p){seats+=`<div class="seat s${i}"><div class="player-box empty-seat"><div class="player-name">빈 자리</div></div></div>`;continue}
    const hp=h?.players?.[p.userId],hole=hp?hp.hole.map(c=>cardHtml(c,'small',deal?di++:null)).join(''):'',flags=`${hp?.folded?' · FOLD':''}${hp?.allIn?' · ALL-IN':''}`;
    seats+=`<div class="seat s${i}"><div class="hole">${hole}</div><div class="player-box ${h?.turnUserId===p.userId?'turn':''}">${reactionBubble(room,p.userId)}${pokerFaceHtml(p)}<div class="player-meta"><div class="player-name">${html(p.nickname)} ${h?.dealerSeat===p.seat?'<span class="dealer-dot">D</span>':''}</div><div class="player-stack">${money(p.stack)}</div>${hp?`<div class="player-bet">BET ${money(hp.roundBet)}${flags}</div>`:''}</div></div></div>`
  }
  const board=h?h.board.map(c=>cardHtml(c,'',deal?di++:null)).join(''):Array(5).fill(0).map((_,i)=>cardHtml('XX','',deal?di+i:null)).join('');
  return `<div class="poker-table ${solo?'solo-poker-table':''} ${deal?'dealing':''}"><div class="felt-logo">JUNJA</div><div class="board-cards">${board}</div><div class="pot-label">POT ${money(h?.pot||0)} · ${h?String(h.phase).toUpperCase():'WAITING'}</div><div class="dealer-shoe" aria-hidden="true">♠</div>${seats}</div>`
}
function bindPokerPresets(root,h){
  $$('[data-raise-preset]',root).forEach(b=>b.onclick=()=>{
    const input=$('#raiseTo',root);if(!input||!h?.legal)return;
    const l=h.legal;let v=l.minRaiseTo;
    if(b.dataset.raisePreset==='half')v=Math.max(l.minRaiseTo,Math.min(l.maxRaiseTo,h.currentBet+Math.floor((h.pot+l.toCall)/2)));
    if(b.dataset.raisePreset==='max')v=l.maxRaiseTo;
    input.value=Math.max(l.minRaiseTo,Math.min(l.maxRaiseTo,Math.floor(v/100)*100));fx()
  })
}
function renderHoldem(room){
  $('#holdemBrowser').classList.add('hidden');const root=$('#holdemRoom');root.classList.remove('hidden');
  // Preserve a raise amount while live multiplayer refreshes redraw the table.
  const prevRaise=$('#raiseTo',root),raiseDraft=prevRaise?.value,raiseFocused=document.activeElement===prevRaise;
  const h=room.hand,deal=pokerShouldDeal(room,h),won=h?.result?.winners?.map(Number).includes(Number(me.id)),result=h?.result?`<div class="result-banner mega holdem-result ${won?'win':'lose'}">${won?'🏆 내가 이겼어!':h.result.timeoutUserId===me.id?'⏱ 시간 초과 · 자동 폴드':'상대 승리'}<small>${html(h.result.summary)} · POT ${money(h.result.pot)}</small></div>`:'';
  const sec=h?.turnDeadlineAt?Math.max(0,Math.ceil((h.turnDeadlineAt-Date.now())/1000)):null,autoSec=room.autoStartAt?Math.max(0,Math.ceil((room.autoStartAt-Date.now())/1000)):null;root.innerHTML=`${roomToolbar(room)}${result}${room.status==='WAITING'&&autoSec!==null?`<div class="holdem-countdown">🃏 ${h?.phase==='complete'?'다음 핸드':'첫 핸드'} 자동 시작 <b>${autoSec}</b>초 · 전원 READY 유지 시 자동으로 시작합니다.</div>`:''}${h?.phase!=='complete'&&sec!==null?`<div class="holdem-countdown ${sec<=3?'urgent':''}">⏱ ${html(room.turnNickname||'플레이어')} 행동시간 <b>${sec}</b>초 · 0초면 자동 폴드</div>`:''}<div class="table-wrap"><div class="poker-panel panel">${pokerTableHtml(room,h,false,deal)}${holdemActions(h)}</div><div class="side-panel">${pokerStatusPanel(h)}<div class="players-card panel"><div class="section-head"><div><small>PLAYERS</small><h3>참가자 ${room.players.length}/${room.maxPlayers}</h3></div></div><div class="member-list">${room.players.map(p=>`<div class="member poker-member">${pokerFaceHtml(p)}<span>${html(p.nickname)}${room.hostId===p.userId?' 👑':''}</span><b>${money(p.stack)}</b></div>`).join('')}</div></div>${privacyPanelHtml()}</div></div>`;
  bindRoomCommon(root,room);bindPokerPresets(root,h);
  const nextRaise=$('#raiseTo',root);if(nextRaise&&raiseDraft!==undefined&&h?.turnUserId===me.id){const n=Number(raiseDraft);if(Number.isFinite(n))nextRaise.value=Math.max(Number(nextRaise.min||0),Math.min(Number(nextRaise.max||Number.MAX_SAFE_INTEGER),n));if(raiseFocused){try{nextRaise.focus({preventScroll:true})}catch{nextRaise.focus()}}}
  $$('[data-poker]',root).forEach(b=>b.onclick=async()=>{const action=b.dataset.poker,raiseTo=Number($('#raiseTo',root)?.value||0);b.disabled=true;try{await api(`/api/rooms/${currentRoomId}/poker/action`,{method:'POST',body:JSON.stringify({action,raiseTo})});await loadCurrentRoom()}catch(e){toast(e.message);b.disabled=false}})
}
function holdemActions(h,solo=false){
  if(!h)return `<div class="action-bar"><span class="waiting-text">게임 시작을 기다리는 중...</span></div>`;
  if(h.phase==='complete')return solo?`<div class="action-bar"><button class="primary solo-next-hand" type="button">다음 핸드</button><button class="secondary solo-cashout" type="button">칩 정산 후 나가기</button></div>`:`<div class="action-bar"><span class="waiting-text">핸드 종료 · 전원 READY 상태면 5초 뒤 다음 핸드가 자동 시작돼.</span></div>`;
  if(h.turnUserId!==me.id)return `<div class="action-bar"><span class="waiting-text">J-BOT / 상대 행동 중...</span></div>`;
  const l=h.legal,half=Math.max(l.minRaiseTo,Math.min(l.maxRaiseTo,h.currentBet+Math.floor((h.pot+l.toCall)/2)));
  return `<div class="action-bar poker-actions"><button class="danger" data-poker="fold" type="button">폴드</button>${l.toCall===0?'<button class="secondary" data-poker="check" type="button">체크</button>':`<button class="secondary" data-poker="call" type="button">콜 ${money(l.toCall)}</button>`}<div class="raise-box"><div class="raise-presets"><button class="ghost" data-raise-preset="half" type="button">½ POT<br><small>${money(half)}</small></button><button class="ghost max-raise" data-raise-preset="max" type="button">MAX<br><small>${money(l.maxRaiseTo)}</small></button></div><div class="raise-input-row"><input id="raiseTo" type="number" min="${l.minRaiseTo}" max="${l.maxRaiseTo}" step="100" value="${Math.min(l.maxRaiseTo,l.minRaiseTo)}"><button class="primary" data-poker="raise" type="button">레이즈</button></div></div></div>`
}
function cardHtml(code,size='',dealIndex=null){
  const deal=dealIndex!==null?` deal-card" style="--deal-i:${dealIndex}`:'';
  if(code==='XX')return `<div class="card ${size} back${deal}"></div>`;
  const r=code[0],s=code[1],sym={S:'♠',H:'♥',D:'♦',C:'♣'}[s],red=s==='H'||s==='D';
  return `<div class="card ${size} ${red?'red':''}${deal}"><span>${r==='T'?'10':r}</span><span class="suit">${sym}</span></div>`
}
async function startSoloHoldem(){if(!confirm(`현재 보유한 ${money(me.balance)} 전액을 홀덤 테이블 스택으로 가져갈까? 나갈 때 남은 칩은 다시 정산돼.`))return;try{const d=await api('/api/solo/holdem/start',{method:'POST',body:'{}'});me=d.user;updateHeader();renderSoloHoldem(d.room)}catch(e){toast(e.message)}}
async function loadSoloHoldem(){try{const d=await api('/api/solo/holdem');if(d.room)renderSoloHoldem(d.room);else{$('#holdemSoloStart').classList.remove('hidden');$('#holdemSoloRoom').classList.add('hidden')}}catch(e){toast(e.message)}}
function renderSoloHoldem(room){
  clearTimeout(holdemAutoTimer);
  $('#holdemSoloStart').classList.add('hidden');const root=$('#holdemSoloRoom');root.classList.remove('hidden');const h=room.hand,deal=pokerShouldDeal(room,h),result=h?.result?`<div class="result-banner">${html(h.result.summary)} · POT ${money(h.result.pot)}</div>`:'';
  root.innerHTML=`<div class="solo-toolbar"><div><small>AI HEADS UP · SOLO MODE</small><h3>${pokerFaceHtml(room.players.find(p=>p.userId===me.id))}<span>${html(me.nickname)}</span><i>VS</i>${pokerFaceHtml(room.players.find(p=>p.bot))}<span>J-BOT</span></h3></div><button class="secondary solo-cashout" type="button">칩 정산 후 나가기</button></div>${result}<div class="table-wrap solo-table-wrap"><div class="poker-panel panel">${pokerTableHtml(room,h,true,deal)}${h?.turnUserId===me.id?'<div class="solo-turn-banner">🔥 내 차례 · 행동을 선택해</div>':h?.phase!=='complete'?'<div class="solo-turn-banner bot">🤖 J-BOT 생각 중...</div>':''}${holdemActions(h,true)}</div><div class="side-panel">${pokerStatusPanel(h)}<div class="panel solo-help-mini"><small>AI 홀덤</small><b>혼자 바로 플레이</b><p>패 분배 애니메이션, 현재 족보, ½ POT·MAX 레이즈를 지원해. 핸드 종료 후 ‘다음 핸드’로 계속 플레이.</p></div></div></div>`;
  bindPokerPresets(root,h);
  $$('[data-poker]',root).forEach(b=>b.onclick=async()=>{b.disabled=true;try{const d=await api('/api/solo/holdem/action',{method:'POST',body:JSON.stringify({action:b.dataset.poker,raiseTo:Number($('#raiseTo',root)?.value||0)})});renderSoloHoldem(d.room)}catch(e){toast(e.message);b.disabled=false}});
  $('.solo-next-hand',root)?.addEventListener('click',async()=>{try{const d=await api('/api/solo/holdem/next',{method:'POST',body:'{}'});renderSoloHoldem(d.room)}catch(e){toast(e.message)}});
  $$('.solo-cashout',root).forEach(b=>b.onclick=async()=>{clearTimeout(holdemAutoTimer);try{const d=await api('/api/solo/holdem/leave',{method:'POST',body:'{}'});me=d.user;updateHeader();toast(`정산 ${money(d.cashout)}`);pokerSceneCache.delete(room.id);$('#holdemSoloRoom').classList.add('hidden');$('#holdemSoloStart').classList.remove('hidden')}catch(e){toast(e.message)}});
  if(h?.phase==='complete'&&room.players.find(p=>p.userId===me.id)?.stack>0){let left=5;const next=$('.solo-next-hand',root);if(next)next.textContent=`다음 핸드 · 자동 시작 ${left}초`;holdemAutoTimer=setInterval(async()=>{left--;if(next)next.textContent=`다음 핸드 · 자동 시작 ${left}초`;if(left<=0){clearInterval(holdemAutoTimer);try{const d=await api('/api/solo/holdem/next',{method:'POST',body:'{}'});renderSoloHoldem(d.room)}catch(e){toast(e.message)}}},1000)}
}

// YUT MULTI
const YUT_NODE_POS={
  READY:[98,98],START:[90,90],O1:[90,74],O2:[90,58],O3:[90,42],O4:[90,26],O5:[90,10],
  O6:[74,10],O7:[58,10],O8:[42,10],O9:[26,10],O10:[10,10],
  O11:[10,26],O12:[10,42],O13:[10,58],O14:[10,74],O15:[10,90],
  O16:[26,90],O17:[42,90],O18:[58,90],O19:[74,90],O20:[82,90],
  A1:[75,25],A2:[63,37],C:[50,50],A4:[37,63],A5:[25,75],
  B1:[25,25],B2:[37,37],B4:[63,63],B5:[75,75],FINISH:[90,90]
};
function yutPhysicalClient(p){if(!p)return'READY';if(p.node==='CA'||p.node==='CB')return'C';return p.node||'READY'}
function yutSideForMe(y){return y?.sides?.find(s=>(s.playerIds||[]).map(Number).includes(Number(me.id)))}
function yutPiecesAt(y,node){const out=[];for(const side of (y?.sides||[])){const idx=[];(side.pieces||[]).forEach((p,i)=>{if(yutPhysicalClient(p)===node)idx.push(i)});if(idx.length)out.push({side,idx})}return out}
function yutSideAvatar(side,room,extra='yut-piece-face'){
  const ids=(side?.playerIds||[]).map(Number),p=(room?.players||[]).find(x=>ids.includes(Number(x.userId)));
  if(p)return avatarImg(p.avatar,p.nickname,extra,p.cosmetics);
  if(side?.id==='U'||ids.includes(Number(me?.id)))return avatarImg(me?.avatar,me?.nickname,extra,me?.cosmetics);
  return botFace('yut',extra)
}
function yutNodePieces(room,y,node){const mascots=['tiger','rabbit','fox','bear'];return yutPiecesAt(y,node).map(g=>{const si=Math.max(0,(y?.sides||[]).indexOf(g.side)),mascot=mascots[si%mascots.length];return `<div class="yut-stack cute-yut-token" style="--pc:${g.side.color}"><img src="/art/v28/yut/token-${mascot}.webp" alt="${html(g.side.label)} 말"><b>${g.idx.length>1?'×'+g.idx.length:g.idx[0]+1}</b></div>`}).join('')}
function yutBoardHtml(room,y){
  const nodes=Object.entries(YUT_NODE_POS).filter(([k])=>!['READY','FINISH'].includes(k)).map(([node,[x,yy]])=>`<div class="yut-node ${['START','O5','O10','O15','C'].includes(node)?'corner':''} ${node==='START'?'home-node':''}" style="--x:${x}%;--y:${yy}%"><span class="node-num">${node==='C'?'★':node==='START'?'HOME':node.replace('O','')}</span><div class="node-pieces">${yutNodePieces(room,y,node)}</div></div>`).join('');
  const reserveCounts=(y?.sides||[]).map(side=>`<span style="--pc:${side.color}">${html(side.label)} ${(side.pieces||[]).filter(p=>yutPhysicalClient(p)==='READY').length}</span>`).join('');
  const finishCounts=(y?.sides||[]).map(side=>`<span style="--pc:${side.color}">${html(side.label)} ${(side.pieces||[]).filter(p=>yutPhysicalClient(p)==='FINISH').length}/4</span>`).join('');
  return `<div class="yut-board-pro true-yut-board"><svg class="yut-path-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M90 90 L90 10 L10 10 L10 90 L90 90"/><path d="M90 10 L50 50 L10 90"/><path d="M10 10 L50 50 L90 90"/></svg><div class="board-title"><b>JUNJA YUT ARENA</b><span>출발 도=1번 칸 · 돌아온 HOME은 1칸으로 인정, 다음 이동에 골인</span></div><div class="start-zone"><b>대기 말</b>${reserveCounts}</div><div class="finish-zone"><b>FINISH</b>${finishCounts}</div>${nodes}</div>`;
}
function yutMoveChips(pending,sel,attr){return `<div class="yut-move-chips">${(pending||[]).map((m,i)=>`<button class="${i===sel?'active':''} ${m.backdo?'backdo-chip':''}" ${attr}="${i}" type="button">${m.name}<small>${m.backdo?'1칸 뒤로':m.move+'칸'}</small></button>`).join('')}</div>`}
function yutPieceButtons(side,move,attr){
  if(!side)return'';
  return `<div class="piece-picker pro">${(side.pieces||[]).map((p,i)=>{
    const pos=yutPhysicalClient(p),same=pos==='READY'?1:(side.pieces||[]).filter(x=>yutPhysicalClient(x)===pos).length,disabled=pos==='FINISH'||(move?.backdo&&pos==='READY'),label=pos==='READY'?'대기':pos==='START'?'HOME':pos;
    return `<button ${attr}="${i}" ${disabled?'disabled':''} type="button"><span class="piece-avatar">${side.id==='U'||(side.playerIds||[]).map(Number).includes(Number(me?.id))?avatarImg(me.avatar,me.nickname,'yut-pick-face',me.cosmetics):botFace('yut','yut-pick-face')}</span><b>말 ${i+1}${same>1?' · 업기×'+same:''}</b><small>${move?.backdo&&pos==='READY'?'빽도 이동 불가':label}${['O5','O10'].includes(pos)?' · 경로 선택 가능':''}</small></button>`;
  }).join('')}</div>`;
}
function yutRouteDialog(piece){const node=yutPhysicalClient(piece);if(!['O5','O10'].includes(node))return Promise.resolve(null);return new Promise(resolve=>{const wrap=document.createElement('div');wrap.className='yut-route-modal';wrap.innerHTML=`<div class="yut-route-card"><small>ROUTE SELECT · ${node}</small><h3>어느 길로 갈까?</h3><p>코너에 정확히 도착했어. 이번 이동에서 지름길 또는 외곽길을 직접 선택해.</p><div class="yut-route-options"><button data-route="shortcut"><b>↘ 지름길</b><span>중앙 대각선으로 빠르게</span></button><button data-route="outer"><b>↪ 외곽길</b><span>바깥 칸을 계속 이동</span></button></div></div>`;document.body.appendChild(wrap);$$('[data-route]',wrap).forEach(b=>b.onclick=()=>{const v=b.dataset.route;wrap.remove();fx();resolve(v)});wrap.onclick=e=>{if(e.target===wrap){wrap.remove();resolve(null)}}})}
function yutSticksHtml(sticks,throwing=false){
  const vals=Array.isArray(sticks)&&sticks.length===4?sticks:[1,0,1,0];
  return `<div class="yut-toss-scene ${throwing?'throwing':''}"><div class="yut-mat-grain"></div><div class="yut-shadow"></div><div class="yut-sticks">${vals.map((v,i)=>`<div class="yut-stick ${v===0?'back-face':'flat-face'} ${i===0?'marked-stick':''}" style="--i:${i}"><img src="/art/v28/yut/${v===0&&i!==0?'stick-back.webp':'stick-marked.webp'}" alt=""><span>${i===0?'●':''}</span></div>`).join('')}</div><div class="yut-toss-caption">${throwing?'윷을 던지고 있습니다...':'첫 번째 점 윷가락이 빽도 기준'}</div></div>`
}
let yutSeenAction='';
function yutActionBanner(last,room){if(!last)return'';const p=(room?.players||[]).find(x=>Number(x.userId)===Number(last.userId)),who=p?.nickname||(last.side==='bot'?'J-BOT':'나');return `<div class="yut-action-banner ${last.backdo?'backdo':''} ${last.captured?.length?'capture':''}"><b>${last.type==='throw'?'🪵':'🐾'} ${html(who)}</b><strong>${html(last.message||last.name||'')}</strong></div>`}
function animateYutTrace(root,last){if(!last?.trace?.length)return;const board=$('.true-yut-board',root),from=YUT_NODE_POS[last.from],steps=last.trace.map(n=>YUT_NODE_POS[n]).filter(Boolean);if(!board||!from||!steps.length)return;const token=document.createElement('div');token.className='yut-motion-token';token.textContent=last.backdo?'↩':'🐾';board.appendChild(token);const place=p=>{token.style.left=p[0]+'%';token.style.top=p[1]+'%'};place(from);steps.forEach((p,i)=>setTimeout(()=>place(p),120+i*520));setTimeout(()=>token.remove(),steps.length*520+750)}
function renderYut(room){
  $('#yutBrowser').classList.add('hidden');const root=$('#yutRoom');root.classList.remove('hidden');const y=room.yut,cur=y?.phase==='playing'?room.players[y.turnIndex%room.players.length]:null,isTurn=cur?.userId===me.id,mySide=yutSideForMe(y);let control='';
  if(!y)control=`${yutSticksHtml(null)}<h3>${html(room.yutModeLabel||'개인전')}</h3><p>방장이 시작하면 정통 윷판에서 경기해.</p>`;
  else if(y.phase==='complete'){const w=y.sides.find(s=>s.id===y.winnerSideId);control=`<div class="victory-crown">👑</div><div class="big-yut">${html(w?.label||'승리')}</div><h3>우승!</h3>`}
  else if(isTurn&&y.awaitingThrow)control=`${yutSticksHtml(y.last?.sticks)}<div class="big-yut">내 차례</div><p>${y.pending.length?'윷/모 보너스 던지기!':'윷가락을 던져줘.'}</p><button class="primary yut-throw" type="button">🪵 윷가락 던지기</button>`;
  else if(isTurn&&y.pending?.length){selectedYutMoveIndex=Math.min(selectedYutMoveIndex,y.pending.length-1);control=`${yutSticksHtml(y.last?.sticks)}<div class="big-yut result-name">${y.pending[selectedYutMoveIndex]?.backdo?'↩ 빽도':'말 이동'}</div>${yutMoveChips(y.pending,selectedYutMoveIndex,'data-yut-move')}<p>${y.pending[selectedYutMoveIndex]?.backdo?'판 위의 말을 골라 한 칸 뒤로 이동해.':'사용할 결과를 고르고 움직일 말을 선택해.'}</p>${yutPieceButtons(mySide,y.pending[selectedYutMoveIndex],'data-piece')}`}
  else control=`${yutSticksHtml(y.last?.sticks)}<div class="big-yut">${html(y.last?.name||'대기')}</div><p>${cur?`${cur.avatarEmoji} ${html(cur.nickname)} 차례`:''}</p>`;
  const teams=(y?.sides||[]).map(s=>`<div class="yut-team-card" style="--pc:${s.color}"><b>${html(s.label)}</b><span>${s.playerIds.map(id=>room.players.find(p=>p.userId===id)?.nickname||'?').map(html).join(' · ')}</span><small>완주 ${s.pieces.filter(p=>yutPhysicalClient(p)==='FINISH').length}/4</small></div>`).join('');
  root.innerHTML=`${roomToolbar(room)}${yutActionBanner(y?.last,room)}<div class="yut-team-strip">${teams}</div><div class="yut-layout yut-layout-pro"><div class="yut-game panel">${yutBoardHtml(room,y)}</div><div class="side-panel yut-side"><div class="throw-control panel">${control}</div><div class="panel yut-rule-panel"><b>정통 룰 + 빽도 적용</b><span>점 표시 윷가락 하나만 뒤집히면 빽도 · 한 칸 뒤로</span><span>판 위 말이 없을 때 빽도는 차례 넘김</span><span>업기 · 잡기 추가턴 · 윷/모 추가턴 · 대각선 지름길</span></div>${privacyPanelHtml()}</div></div>`;
  const actionKey=y?.last?`${y.last.at}-${y.last.type}`:'';if(actionKey&&actionKey!==yutSeenAction){yutSeenAction=actionKey;if(y.last.type==='move')animateYutTrace(root,y.last);if(y.last.type==='throw'&&Number(y.last.userId)!==Number(me.id)){const scene=$('.yut-toss-scene',root);scene?.classList.add('throwing');setTimeout(()=>scene?.classList.remove('throwing'),1650)}if(y.last.message)toast(y.last.message)}
  bindRoomCommon(root,room);$$('[data-yut-move]',root).forEach(b=>b.onclick=()=>{selectedYutMoveIndex=Number(b.dataset.yutMove);renderYut(room)});$('.yut-throw',root)?.addEventListener('click',async()=>{const btn=$('.yut-throw',root);btn.disabled=true;$('.yut-toss-scene',root)?.classList.add('throwing');fx('yut');try{const d=await api(`/api/rooms/${currentRoomId}/yut/throw`,{method:'POST',body:'{}'});await sleep(1750);renderYut(d.room)}catch(e){toast(e.message);btn.disabled=false}});$$('[data-piece]',root).forEach(b=>b.onclick=async()=>{try{const pi=Number(b.dataset.piece),routeChoice=await yutRouteDialog(mySide?.pieces?.[pi]);const d=await api(`/api/rooms/${currentRoomId}/yut/move`,{method:'POST',body:JSON.stringify({pieceIndex:pi,moveIndex:selectedYutMoveIndex,routeChoice})});selectedYutMoveIndex=0;renderYut(d.room);await refreshMe()}catch(e){toast(e.message)}})
}
function soloYutAsMulti(g){return {sides:[{id:'U',label:'나',color:'#f6cf67',playerIds:[me.id],pieces:g.sides.user},{id:'B',label:'J-BOT',color:'#71a8ff',playerIds:[-1],pieces:g.sides.bot}]}}
function soloYutBoard(g){return yutBoardHtml({},soloYutAsMulti(g))}
async function loadSoloYut(silent=false){try{const d=await api('/api/solo/yut');if(d.game)renderSoloYut(d.game);else{$('#yutSoloStart')?.classList.remove('hidden');$('#yutSoloRoom')?.classList.add('hidden')}}catch(e){if(!silent)toast(e.message)}}
async function startSoloYut(){try{const d=await api('/api/solo/yut/start',{method:'POST',body:JSON.stringify({bet:Number($('#soloYutBet').value)})});me=d.user;updateHeader();renderSoloYut(d.game)}catch(e){toast(e.message)}}
function renderSoloYut(g){
  $('#yutSoloStart').classList.add('hidden');const root=$('#yutSoloRoom');root.classList.remove('hidden');let control='';
  if(g.phase==='complete')control=`<div class="victory-crown">${g.winner==='user'?'🏆':'🤖'}</div><h2>${g.winner==='user'?'승리!':'J-BOT 승리'}</h2><button class="primary solo-yut-close" type="button">새 게임 준비</button>`;
  else if(soloYutReplayBusy)control=`${yutSticksHtml(g.last?.sticks)}<h3>🤖 J-BOT 차례 재생 중</h3><p>던진 결과와 말 이동을 순서대로 보여주는 중이야.</p>`;
  else if(g.turn==='user'&&g.awaitingThrow)control=`${yutSticksHtml(g.last?.sticks)}<h3>내 차례</h3><button class="primary solo-yut-throw" type="button">🪵 윷 던지기</button>`;
  else if(g.turn==='user'&&g.pending?.length){selectedSoloYutMoveIndex=Math.min(selectedSoloYutMoveIndex,g.pending.length-1);control=`${yutSticksHtml(g.last?.sticks)}${yutMoveChips(g.pending,selectedSoloYutMoveIndex,'data-solo-yut-move')}${yutPieceButtons({id:'U',pieces:g.sides.user},g.pending[selectedSoloYutMoveIndex],'data-solo-yut-piece')}`}
  else control=`${yutSticksHtml(g.last?.sticks)}<h3>J-BOT 진행 중</h3>`;
  root.innerHTML=`<div class="solo-toolbar character-toolbar"><div><small>AI YUT · ${money(g.bet)}</small><h3>${avatarImg(me.avatar,me.nickname,'duel-face',me.cosmetics)} <span>${html(me.nickname)}</span> <i>VS</i> ${botFace('yut','duel-face')} <span>J-BOT</span></h3></div><button class="danger solo-yut-quit" type="button">게임 포기</button></div>${yutActionBanner(g.last,{players:[]})}<div class="yut-layout yut-layout-pro"><div class="yut-game panel">${soloYutBoard(g)}</div><div class="throw-control panel">${control}<div id="soloYutAiReplay" class="solo-yut-ai-replay ${soloYutReplayBusy?'active':''}">${soloYutReplayBusy?'<b>🤖 J-BOT 행동 재생</b><span>윷 결과 확인 중...</span>':''}</div><div class="score-strip"><span>내 완주 <b>${g.sides.user.filter(x=>yutPhysicalClient(x)==='FINISH').length}/4</b></span><span>BOT 완주 <b>${g.sides.bot.filter(x=>yutPhysicalClient(x)==='FINISH').length}/4</b></span></div></div></div>`;
  $$('[data-solo-yut-move]',root).forEach(b=>b.onclick=()=>{selectedSoloYutMoveIndex=Number(b.dataset.soloYutMove);renderSoloYut(g)});
  $('.solo-yut-throw',root)?.addEventListener('click',async()=>{try{$('.yut-toss-scene',root)?.classList.add('throwing');const d=await api('/api/solo/yut/throw',{method:'POST',body:'{}'});await sleep(1450);renderSoloYut(d.game)}catch(e){toast(e.message)}});
  $$('[data-solo-yut-piece]',root).forEach(b=>b.onclick=async()=>{try{const pi=Number(b.dataset.soloYutPiece),routeChoice=await yutRouteDialog(g.sides.user?.[pi]);const d=await api('/api/solo/yut/move',{method:'POST',body:JSON.stringify({pieceIndex:pi,moveIndex:selectedSoloYutMoveIndex,routeChoice})});selectedSoloYutMoveIndex=0;if(d.user){me=d.user;updateHeader()}await playSoloYutReplay(d.game)}catch(e){soloYutReplayBusy=false;toast(e.message)}});
  $('.solo-yut-quit',root)?.addEventListener('click',async()=>{if(soloYutReplayBusy)return;if(!confirm('포기하면 참가금은 돌아오지 않아. 포기할까?'))return;const d=await api('/api/solo/yut/quit',{method:'POST',body:'{}'});me=d.user;updateHeader();root.classList.add('hidden');$('#yutSoloStart').classList.remove('hidden')});
  $('.solo-yut-close',root)?.addEventListener('click',async()=>{await api('/api/solo/yut/quit',{method:'POST',body:'{}'}).catch(()=>{});root.classList.add('hidden');$('#yutSoloStart').classList.remove('hidden');await refreshMe()})
}
async function playSoloYutReplay(g){
  const replay=(g?.replay||[]).filter(a=>a?.side==='bot');
  if(!replay.length){soloYutReplayBusy=false;renderSoloYut(g);return}
  soloYutReplayBusy=true;renderSoloYut(g);
  const root=$('#yutSoloRoom'),status=$('#soloYutAiReplay',root);
  for(const action of replay){
    if(currentView!=='yut'||!root||root.classList.contains('hidden'))break;
    if(action.type==='throw'){
      const scene=$('.yut-toss-scene',root);if(scene)scene.outerHTML=yutSticksHtml(action.sticks,true);
      const nextScene=$('.yut-toss-scene',root);nextScene?.classList.add('throwing');fx('yut');
      if(status)status.innerHTML=`<b>🤖 J-BOT이 윷을 던졌어</b><span>${action.backdo?'↩ ':''}${html(action.name||'')} · ${action.backdo?'한 칸 뒤로':Math.abs(Number(action.move||0))+'칸'}${action.skipped?' · 이동할 말 없어 턴 종료':''}</span>`;
      await sleep(1050);nextScene?.classList.remove('throwing');await sleep(350);
    }else if(action.type==='move'){
      if(status)status.innerHTML=`<b>${action.captured?.length?'💥 잡았다!':'🐾 J-BOT 말 이동'}</b><span>${html(action.message||`${action.name||''} 이동`)}</span>`;
      animateYutTrace(root,action);fx(action.captured?.length?'win':'click');await sleep(Math.max(900,(action.trace?.length||1)*520+420));
    }
  }
  soloYutReplayBusy=false;renderSoloYut({...g,replay:[]});
}


// HORSE RACING · v2.2 SHARED LIVE VERTICAL MEET
function stopHorseMeet(){clearInterval(horseMeetTimer);horseMeetTimer=null;if(horseAnimationFrame)cancelAnimationFrame(horseAnimationFrame);horseAnimationFrame=null;horseRacing=false}
function startHorseMeet(){stopHorseMeet();loadHorseMeet(false);horseMeetTimer=setInterval(()=>{if(currentView==='horse'&&!document.hidden)loadHorseMeet(true)},1500)}
async function loadHorseMeet(silent=true){try{const d=await api('/api/horse/meet');horseCardData=d.round.card;if(d.user){me=d.user;updateHeader()}renderHorseMeet(d.round);await maybeHorseAuto(d.round)}catch(e){if(!silent)toast(e.message)}}
function horseSelectedIds(){return [Number($('#horsePick1')?.value||0),Number($('#horsePick2')?.value||0)].filter(Boolean)}
function horseOddsFor(type,ids){if(!horseCardData||!ids.length)return 0;if(type==='win')return Number(horseCardData.horses.find(h=>h.id===ids[0])?.winOdds||0);if(ids.length<2)return 0;if(type==='quinella')return Number(horseCardData.quinellaOdds?.[[...ids].sort((a,b)=>a-b).join('-')]||0);return Number(horseCardData.exactaOdds?.[`${ids[0]}>${ids[1]}`]||0)}
function syncHorseBetUI(){if(!horseCardData)return;const type=$('#horseBetType')?.value||'win',p1=$('#horsePick1'),p2=$('#horsePick2');if(type==='win'&&p2)p2.value='';if(type!=='win'&&p2&&Number(p2.value)===Number(p1?.value))p2.value='';renderHorsePickGrid();renderHorseOdds();renderHorseOddsBoard();updateHorseStartState()}
function updateHorseStartState(){const r=horseMeetData,type=$('#horseBetType')?.value||'win',ids=horseSelectedIds(),need=type==='win'?1:2,btn=$('#horseStartBtn');if(!btn)return;const betting=r?.phase==='betting',already=!!r?.myBet,ready=betting&&!already&&ids.length===need&&!horseAutoBusy;btn.disabled=!ready;if(already)btn.textContent='✓ 이번 경주 베팅 접수됨';else if(!betting)btn.textContent=r?.phase==='running'?'🏇 LIVE RACE':'결과 확인 중';else btn.textContent=ready?`🏁 베팅 접수 · x${horseOddsFor(type,ids)}`:(need===1?'🏇 말 1마리를 선택해줘':'🏇 말 2마리를 차례로 선택해줘')}
function selectHorseOneTouch(id){if(horseMeetData?.phase!=='betting'||horseMeetData?.myBet)return;id=Number(id);const type=$('#horseBetType')?.value||'win',p1=$('#horsePick1'),p2=$('#horsePick2'),a=Number(p1?.value||0),b=Number(p2?.value||0);if(type==='win'){p1.value=String(id);if(p2)p2.value=''}else if(id===a){p1.value=b?String(b):'';if(p2)p2.value=''}else if(id===b){p2.value=''}else if(!a)p1.value=String(id);else if(!b)p2.value=String(id);else p2.value=String(id);syncHorseBetUI();fx()}
function renderHorsePickGrid(){if(!horseCardData)return;const grid=$('#horsePickGrid');if(!grid)return;const type=$('#horseBetType')?.value||'win',p1=Number($('#horsePick1')?.value||0),p2=Number($('#horsePick2')?.value||0);grid.innerHTML=horseCardData.horses.map(h=>{const first=h.id===p1,second=type!=='win'&&h.id===p2,selected=first||second,order=first?'1':second?'2':'';return `<button class="horse-pick-card ${selected?'selected':''}" data-horse-pick="${h.id}" type="button" style="--hc:${h.color}" ${horseMeetData?.myBet||horseMeetData?.phase!=='betting'?'disabled':''}><span class="horse-pick-no">${h.id}</span><span class="horse-pick-name">${html(h.name)}</span><small>단승 x${h.winOdds}</small>${order?`<b class="horse-pick-order">PICK ${order}</b>`:''}</button>`}).join('');$$('[data-horse-pick]',grid).forEach(b=>b.onclick=()=>selectHorseOneTouch(b.dataset.horsePick));const summary=$('#horsePickSummary'),ids=horseSelectedIds(),names=ids.map(id=>horseCardData.horses.find(h=>h.id===id)).filter(Boolean);if(summary)summary.innerHTML=names.length?names.map((h,i)=>`<span style="--hc:${h.color}"><b>${i+1} PICK</b> ${h.id}번 ${html(h.name)}</span>`).join(''):'선택한 말이 없습니다.'}
function renderHorseOdds(){if(!horseCardData)return;const type=$('#horseBetType')?.value||'win',ids=horseSelectedIds(),mult=horseOddsFor(type,ids),a=horseCardData.horses.find(h=>h.id===ids[0]),b=horseCardData.horses.find(h=>h.id===ids[1]);let txt;if(type==='win')txt=a?`${a.id}번 ${html(a.name)} · 적중 <b>x${mult}</b> · 2위는 베팅금 50% 위로금`:'단승마를 선택해줘.';else if(ids.length<2)txt=`${type==='quinella'?'복승':'쌍승'} · 서로 다른 말 2마리를 순서대로 선택해줘.`;else txt=`${type==='quinella'?'복승':'쌍승'} · <b>${a.id}번 ${html(a.name)} ${type==='exacta'?'→':'+'} ${b.id}번 ${html(b.name)}</b> · 확정 배당 <strong>x${mult}</strong>`;$('#horseOdds').innerHTML=txt}
function renderHorseOddsBoard(){const root=$('#horseOddsBoard');if(!root||!horseCardData)return;const hs=horseCardData.horses,q=[];for(let i=0;i<hs.length;i++)for(let j=i+1;j<hs.length;j++){const a=hs[i],b=hs[j],k=[a.id,b.id].sort((x,y)=>x-y).join('-');q.push({label:`${a.id} ${a.name} + ${b.id} ${b.name}`,v:Math.floor(Number(horseCardData.quinellaOdds[k]||0))})}const ex=[];for(const a of hs)for(const b of hs)if(a.id!==b.id)ex.push({label:`${a.id} ${a.name} → ${b.id} ${b.name}`,v:Math.floor(Number(horseCardData.exactaOdds[`${a.id}>${b.id}`]||0))});const table=(title,rows)=>`<div class="horse-odds-column"><h4>${title}<small>${rows.length} COMBINATIONS</small></h4><div>${rows.sort((a,b)=>a.v-b.v).map(x=>`<span><em>${html(x.label)}</em><b>x${x.v}</b></span>`).join('')}</div></div>`;const markup=table('복승 · 1·2위 순서 무관',q)+table('쌍승 · 1→2위 순서 정확히',ex);if(root.innerHTML!==markup)root.innerHTML=markup}
function horseSvg(h){return `<svg class="race-horse-svg topdown realistic" viewBox="0 0 140 230" aria-hidden="true"><defs><linearGradient id="coat-${h.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${h.coat||'#573725'}"/><stop offset=".58" stop-color="${h.coat||'#573725'}"/><stop offset="1" stop-color="#24140d"/></linearGradient><linearGradient id="silk-${h.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${h.color}"/><stop offset="1" stop-color="${h.color}"/></linearGradient></defs><ellipse class="horse-shadow" cx="70" cy="126" rx="43" ry="18"/><g class="horse-figure" style="--coat:${h.coat||'#573725'};--silk:${h.color}"><path class="horse-tail-real" d="M70 42 C57 31 54 17 62 9 C65 19 69 19 70 8 C76 15 77 23 75 30 C83 24 88 29 83 37 C79 42 76 46 72 50Z"/><path class="horse-hind" d="M33 78 C33 52 48 38 70 38 C92 38 107 52 107 78 C106 96 99 111 89 122 C82 129 79 136 78 145 L62 145 C61 136 58 129 51 122 C41 111 34 96 33 78Z" fill="url(#coat-${h.id})"/><path class="horse-torso" d="M43 96 C39 116 42 142 51 158 C56 167 58 174 57 184 L83 184 C82 174 84 167 89 158 C98 142 101 116 97 96 C89 105 81 112 70 112 C59 112 51 105 43 96Z" fill="url(#coat-${h.id})"/><path class="horse-neck-real" d="M52 146 C48 162 51 181 57 192 C61 199 62 205 61 211 L79 211 C78 205 80 198 83 191 C89 179 92 161 88 146 C82 155 77 162 70 162 C63 162 58 155 52 146Z" fill="url(#coat-${h.id})"/><path class="horse-head-real" d="M52 184 C53 170 60 161 70 160 C80 161 87 170 88 184 L85 207 C82 220 77 227 70 229 C63 227 58 220 55 207Z" fill="url(#coat-${h.id})"/><path class="horse-muzzle-real" d="M56 205 C60 214 64 219 70 219 C76 219 80 214 84 205 L82 220 C79 226 75 229 70 230 C65 229 61 226 58 220Z"/><path class="horse-ear-real e1" d="M57 176 L49 155 L64 169Z"/><path class="horse-ear-real e2" d="M83 176 L91 155 L76 169Z"/><path class="horse-mane-real" d="M54 151 C46 143 48 134 55 126 C49 118 52 108 58 101 C53 93 56 86 62 79"/><path class="horse-blaze" d="M68 169 C64 180 65 195 70 207 C75 195 76 180 72 169Z"/><circle class="horse-eye" cx="61" cy="187" r="2.2"/><circle class="horse-eye" cx="79" cy="187" r="2.2"/><circle class="horse-nostril" cx="64" cy="214" r="1.8"/><circle class="horse-nostril" cx="76" cy="214" r="1.8"/><g class="horse-legs realistic-legs"><path class="leg rear-l" d="M44 86 C29 92 20 106 14 126 C24 119 34 116 44 114"/><path class="leg rear-r" d="M96 86 C111 92 120 106 126 126 C116 119 106 116 96 114"/><path class="leg front-l" d="M51 139 C37 149 29 166 24 190 C34 181 44 177 54 174"/><path class="leg front-r" d="M89 139 C103 149 111 166 116 190 C106 181 96 177 86 174"/></g><path class="saddle-real" d="M39 73 C48 58 92 58 101 73 L94 112 C84 121 56 121 46 112Z"/><g class="jockey-real"><path class="jockey-body" d="M53 70 C55 51 61 42 70 42 C79 42 85 51 87 70 L81 100 L59 100Z" fill="url(#silk-${h.id})"/><circle class="jockey-head" cx="70" cy="33" r="11"/><path class="jockey-helmet" d="M58 33 C61 19 79 19 82 33 L79 39 L61 39Z" fill="url(#silk-${h.id})"/><path class="j-arm a1" d="M58 64 C45 78 41 96 38 116"/><path class="j-arm a2" d="M82 64 C95 78 99 96 102 116"/></g><path class="reins-real" d="M40 116 C50 143 59 166 62 191 M100 116 C90 143 81 166 78 191"/></g></svg>`}
function horseTrackBuild(card){const track=$('#horseTrack');if(!track)return;track.querySelectorAll('.race-lane').forEach(x=>x.remove());card.horses.forEach((h,i)=>{const rail=Number(h.lane||i+1),lane=document.createElement('div');lane.className='race-lane vertical';lane.innerHTML=`<div class="lane-head" style="--hc:${h.color}"><b>${rail}</b><span>${h.id}번 ${html(h.name)}</span><small>RAIL ${rail} · x${h.winOdds}</small></div><div class="race-runner cute-runner" data-horse="${h.id}" style="--hc:${h.color};--race-y:0px"><div class="horse-art"><img class="cute-racehorse" src="/art/v28/horses/horse-${h.id}.webp" alt="${html(h.name)} 달리는 말"></div><div class="runner-tag"><b>${h.id}</b><span>${html(h.name)}</span></div><div class="dust-cloud"><i></i><i></i><i></i></div></div>`;track.appendChild(lane)})}
function renderHorseParticipants(r){const root=$('#horseLiveBettors');if(!root)return;const ps=r.participants||[];root.innerHTML=ps.length?`<b>LIVE BETS ${ps.length}</b>${ps.map(p=>`<span>${avatarImg(p.avatar,p.nickname,'mini-live-face',p.cosmetics)}<em>${html(p.nickname)}</em><small>${p.type==='win'?'단승':p.type==='quinella'?'복승':'쌍승'} · ${p.picks.join('/')}</small></span>`).join('')}`:'<span>이번 경주 참여자 대기 중...</span>'}
function renderHorseMeet(r){if(!r?.card)return;const changed=!horseMeetData||horseMeetData.id!==r.id;horseMeetData=r;horseCardData=r.card;if(changed||!$('#horseTrack .race-lane'))horseTrackBuild(r.card);else if($('#horseTrack').querySelectorAll('.race-lane').length!==7)horseTrackBuild(r.card);renderHorsePickGrid();renderHorseOdds();renderHorseOddsBoard();renderHorseParticipants(r);const clock=$('#horseMeetClock'),remain=Math.max(0,(Number(r.bettingClosesAt)-Number(r.serverNow))/1000);if(clock)clock.innerHTML=`<small>${r.phase==='betting'?'BET CLOSE':r.phase==='running'?'LIVE RACE':'NEXT RACE'}</small><b>${r.phase==='betting'?remain.toFixed(1)+'s':r.phase==='running'?'RUNNING':Math.max(0,(Number(r.resultUntil)-Number(r.serverNow))/1000).toFixed(1)+'s'}</b>`;const ov=$('#raceOverlay');if(ov){ov.classList.toggle('hidden',r.phase==='running');ov.innerHTML=r.phase==='betting'?'<b>LIVE BETTING</b><span>같은 경주표에 모두 함께 베팅합니다.</span>':r.phase==='result'?'<b>OFFICIAL RESULT</b><span>곧 다음 경주가 자동으로 열립니다.</span>':'<b>LIVE RACE</b>'}if(r.phase==='running'&&r.order)animateHorseMeet(r);else if(r.phase==='result'&&r.order){setHorseFinalPositions(r);horseLastResult={round:r};renderHorseMeetResult(r)}else if(r.phase==='betting'){resetHorsePositions();if(r.myBet)renderHorseBetReceipt(r);else if(horseLastResult?.round)renderHorseMeetResult(horseLastResult.round);else if(!horseAutoRemaining)$('#horseResult').innerHTML='<div class="race-result-empty"><b>LIVE BETTING OPEN</b><p>복승·쌍승 전체 배당을 아래에서 확인하고 1~7번 말을 원터치로 선택해.</p></div>'}updateHorseStartState();updateHorseAutoUi()}
function resetHorsePositions(){$$('.race-runner').forEach(x=>{x.style.setProperty('--race-y','0px');x.classList.remove('running','finished');x.querySelector('.finish-rank')?.remove()});$('#horseTrack .horse-track-leaders')?.remove();horseAnimatedRoundId=null}
function setHorseFinalPositions(r){
  const track=$('#horseTrack'),distance=Math.max(330,(track?.clientHeight||720)-190);
  (r.order||[]).forEach((h,i)=>{const el=$(`.race-runner[data-horse="${h.id}"]`);if(el){el.style.setProperty('--race-y',`${distance-i*6}px`);el.classList.add('finished');if(!el.querySelector('.finish-rank'))el.insertAdjacentHTML('beforeend',`<span class="finish-rank">${i+1}</span>`)}})
  renderHorseTrackLeaders(r.order||[]);
}
function renderHorseTrackLeaders(order){
  const track=$('#horseTrack');if(!track)return;track.querySelector('.horse-track-leaders')?.remove();const top=(order||[]).slice(0,2);if(top.length<2)return;
  const box=document.createElement('div');box.className='horse-track-leaders';box.innerHTML=`<div class="horse-leader gold"><small>🥇 1등</small><b>${top[0].id}번 ${html(top[0].name)}</b></div><div class="horse-leader silver"><small>🥈 2등</small><b>${top[1].id}번 ${html(top[1].name)}</b></div>`;track.appendChild(box);
}

function animateHorseMeet(r){
  if(horseAnimatedRoundId===r.id)return;horseAnimatedRoundId=r.id;if(horseAnimationFrame)cancelAnimationFrame(horseAnimationFrame);
  const track=$('#horseTrack'),distance=Math.max(330,(track?.clientHeight||720)-190),total=Math.max(4200,Number(r.finishAt-r.startedAt)||6500),durations={};
  (r.order||[]).forEach((h,i)=>{const ratio=.72+i*.043;durations[h.id]=Math.min(total-80,Math.max(3600,total*ratio));});
  $$('.race-runner').forEach(x=>{x.classList.add('running');x.classList.remove('finished');x.querySelector('.finish-rank')?.remove()});
  let lastFx=0;const tick=()=>{if(currentView!=='horse'||horseMeetData?.id!==r.id)return;const t=Date.now(),elapsed=Math.max(0,t-Number(r.startedAt));
    (r.order||[]).forEach((h,rank)=>{const el=$(`.race-runner[data-horse="${h.id}"]`);if(!el)return;const d=durations[h.id],p=Math.min(1,elapsed/d);let prog;if(p<.16){const q=p/.16;prog=.11*q*q}else{const q=(p-.16)/.84;prog=.11+.89*(q*(2-q))}const y=Math.max(0,distance*Math.min(1,prog));el.style.setProperty('--race-y',`${y.toFixed(2)}px`);if(p>=1&&!el.classList.contains('finished')){el.classList.add('finished');el.classList.remove('running');el.insertAdjacentHTML('beforeend',`<span class="finish-rank">${rank+1}</span>`)}});
    if(t-lastFx>430){lastFx=t;if(elapsed>300&&elapsed<total-400)fx('hoof')}
    if(elapsed<total+120)horseAnimationFrame=requestAnimationFrame(tick);else horseAnimationFrame=null;
  };horseAnimationFrame=requestAnimationFrame(tick)
}
function renderHorseBetReceipt(r){const b=r.myBet,m=Number(b?.mult||horseOddsFor(b?.type,b?.picks||[]));$('#horseResult').innerHTML=`<div class="race-live-result bet-receipt"><i></i><b>BET ACCEPTED · ROUND ${html(r.id)}</b><span>${b.type==='win'?'단승':b.type==='quinella'?'복승':'쌍승'} · ${b.picks.join(' / ')} · ${money(b.bet)} · 확정 x${m}</span></div>`}
function renderHorseMeetResult(r){const b=r.myBet,res=r.myResult,root=$('#horseResult');if(!root)return;if(!b||!res){root.innerHTML=`<div class="race-result-empty"><b>OFFICIAL RESULT</b><p>${(r.order||[]).slice(0,3).map((h,i)=>`${i+1}위 ${h.id}번 ${html(h.name)}`).join(' · ')}</p></div>`;return}const payout=Number(res.payout||0),net=payout-Number(b.bet||0),rankRows=(b.picks||[]).map((id,i)=>{const h=(r.order||[]).find(x=>x.id===id);return `<div class="my-horse-rank ${h?.finish===1?'winner':h?.finish===2?'place':''}"><span>${i+1} PICK</span><b>${id}번 ${html(h?.name||'')}</b><strong>${h?.finish||'-'}위</strong></div>`}).join('');root.innerHTML=`<div class="race-result-sticky ${payout>0?'paid':'miss'}"><div class="race-result-verdict"><small>${b.type==='win'?'단승':b.type==='quinella'?'복승':'쌍승'} · OFFICIAL</small><h2>${res.won?'🏆 적중!':res.placeBonus?'🥈 2위 위로금':'MISS'}</h2><p>다음 경주가 열려도 이번 지급액은 이 라운드 기록으로 확정돼.</p></div><div class="my-horse-ranks">${rankRows}</div><div class="race-money-board"><div><span>베팅</span><b>${money(b.bet)}</b></div><div class="payout"><span>지급액</span><b>${money(payout)}</b></div><div class="${net>=0?'profit':'loss'}"><span>손익</span><b>${signedMoney(net)}</b></div></div><div class="horse-podium">${(r.order||[]).slice(0,3).map((h,i)=>`<div class="podium-row p${i+1}"><b>${i+1}위</b><span>${h.id}번 ${html(h.name)}</span></div>`).join('')}</div></div>`;if(res.won&&r.phase==='result'){fx('win')}}
async function startHorseRace(auto=false){const r=horseMeetData;if(!r||r.phase!=='betting'||r.myBet||horseAutoBusy)return false;const type=$('#horseBetType').value,ids=horseSelectedIds(),need=type==='win'?1:2;if(ids.length!==need){if(!auto)toast(need===1?'말 한 마리를 선택해줘.':'서로 다른 말 두 마리를 선택해줘.');return false}const bet=Math.max(1000,Math.min(100000,Math.floor(Number($('#horseBet').value||1000)/1000)*1000));$('#horseBet').value=bet;horseAutoBusy=true;updateHorseStartState();try{const d=await api('/api/horse/bet',{method:'POST',body:JSON.stringify({type,picks:ids,bet})});horseMeetData=d.round;horseCardData=d.round.card;if(d.user){me=d.user;updateHeader()}renderHorseMeet(d.round);return true}catch(e){if(!auto)toast(e.message);else{stopHorseAuto();toast('경마 AUTO 중지 · '+e.message)}return false}finally{horseAutoBusy=false;updateHorseStartState()}}
function startHorseAuto(count){if(horseAutoRemaining||horseAutoBusy)return;const type=$('#horseBetType')?.value||'win',ids=horseSelectedIds(),need=type==='win'?1:2;if(ids.length!==need){toast(need===1?'AUTO 전에 말 1마리를 선택해줘.':'AUTO 전에 말 2마리를 선택해줘.');return}horseAutoRemaining=count;horseAutoTotal=count;horseAutoBetRound=null;updateHorseAutoUi();maybeHorseAuto(horseMeetData)}
function stopHorseAuto(){horseAutoRemaining=0;horseAutoTotal=0;horseAutoBetRound=null;updateHorseAutoUi()}
function updateHorseAutoUi(){const st=$('#horseAutoStatus'),stop=$('#horseAutoStop');if(st)st.textContent=horseAutoRemaining?`남은 ${horseAutoRemaining}/${horseAutoTotal}`:'수동';if(stop)stop.disabled=!horseAutoRemaining}
async function maybeHorseAuto(r){if(!horseAutoRemaining||!r||document.hidden||currentView!=='horse'||horseAutoBusy)return;if(r.phase==='betting'&&!r.myBet&&horseAutoBetRound!==r.id){horseAutoBetRound=r.id;const ok=await startHorseRace(true);if(ok){horseAutoRemaining=Math.max(0,horseAutoRemaining-1);if(!horseAutoRemaining){horseAutoTotal=0;horseAutoBetRound=null}updateHorseAutoUi()}}}
async function refreshSlotJackpot(silent=true){try{const d=await api('/api/slot/jackpot');const text=money(d.pool);if($('#lobbyJackpotAmount'))$('#lobbyJackpotAmount').textContent=text;if($('#slotJackpotAmount'))$('#slotJackpotAmount').textContent=text;return d}catch(e){if(!silent)toast(e.message)}}

// SEOTDA
function resetSeotdaUI(){if($('#seotdaTable')?.classList.contains('hidden'))$('#seotdaStart')?.classList.remove('hidden')}
const BIG_WHEEL_DEFS={x2:{key:'x2',label:'×2',mult:2},x3:{key:'x3',label:'×3',mult:3},x5:{key:'x5',label:'×5',mult:5},x10:{key:'x10',label:'×10',mult:10},x15:{key:'x15',label:'×15',mult:15},junja:{key:'junja',label:'JUNJA',mult:100}};
const BIG_WHEEL_KEYS=['junja','x2','x3','x2','x3','x2','x3','x2','x3','x2','x3','x2','x3','x2','x5','x2','x3','x2','x5','x2','x3','x2','x5','x2','x3','x2','x5','x2','x3','x2','x5','x2','x3','x2','x5','x2','x3','x2','junja','x2','x5','x2','x3','x2','x5','x2','x3','x2','x10','x2','x5','x2','x3','x2','x15','x2','x10','x5','x3','x2','x15','x10','x5','x3','x2','x15','x10','x5','x3','x2','x15','x10','x5','x3','x2','x15','x10'];
const BIG_WHEEL_SEGMENTS=BIG_WHEEL_KEYS.map(key=>BIG_WHEEL_DEFS[key]);
const BIG_WHEEL_COLORS=['#6d1422','#d5aa52','#153d35','#c43a39','#284777','#75509b'];
function selectBigWheelBet(key){if(bigWheelSpinning)return;bigWheelSelected=key;$$('[data-wheel-bet]').forEach(b=>b.classList.toggle('active',b.dataset.wheelBet===key));fx()}
function drawBigWheel(){
  const canvas=$('#bigWheelCanvas');if(!canvas)return;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,cx=w/2,cy=h/2,n=BIG_WHEEL_SEGMENTS.length,step=Math.PI*2/n,r=w*.43,dense=n>=60;
  ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(cx,cy);
  // Casino frame / depth rings
  const outer=ctx.createRadialGradient(0,0,r*.65,0,0,r*1.12);outer.addColorStop(0,'#201207');outer.addColorStop(.66,'#090909');outer.addColorStop(.82,'#b7852f');outer.addColorStop(.91,'#f8e09a');outer.addColorStop(1,'#5d3e13');ctx.beginPath();ctx.arc(0,0,r*1.1,0,Math.PI*2);ctx.fillStyle=outer;ctx.shadowColor='#000';ctx.shadowBlur=34;ctx.fill();ctx.shadowBlur=0;
  ctx.beginPath();ctx.arc(0,0,r*1.015,0,Math.PI*2);ctx.fillStyle='#120c07';ctx.fill();ctx.strokeStyle='#e6c56f';ctx.lineWidth=5;ctx.stroke();
  // Rotating wheel
  ctx.save();ctx.rotate(bigWheelAngle);
  for(let i=0;i<n;i++){
    const x=BIG_WHEEL_SEGMENTS[i],a0=-Math.PI/2+i*step,a1=a0+step,ci=['x2','x3','x5','x10','x15','junja'].indexOf(x.key),cols=[['#6b1718','#b23a30'],['#0d3e31','#1b7657'],['#203a78','#3769be'],['#5f3510','#b36d1f'],['#43205d','#8445a7'],['#7a5810','#e2b339']][ci]||['#333','#555'];
    const mid=(a0+a1)/2,isJunja=x.key==='junja',grad=ctx.createRadialGradient(0,0,r*.18,0,0,r);if(isJunja){grad.addColorStop(0,'#fff6b0');grad.addColorStop(.34,'#ff62d7');grad.addColorStop(1,'#8f145d')}else{grad.addColorStop(0,cols[1]);grad.addColorStop(1,cols[0]);}
    ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,r,a0+.004,a1-.004);ctx.closePath();ctx.fillStyle=grad;ctx.fill();ctx.strokeStyle=isJunja?'#fff7b5':'#f8df93';ctx.lineWidth=isJunja?5:2.2;ctx.shadowColor=isJunja?'#ffdf67':'transparent';ctx.shadowBlur=isJunja?18:0;ctx.stroke();ctx.shadowBlur=0;
    // metal separator and outer peg
    ctx.save();ctx.rotate(a0);ctx.fillStyle='#d8b45a';ctx.fillRect(r*.74,-2,r*.27,4);ctx.restore();
    const px=Math.cos(a0)*r*1.035,py=Math.sin(a0)*r*1.035;ctx.beginPath();ctx.arc(px,py,7.5,0,Math.PI*2);const pg=ctx.createRadialGradient(px-2,py-2,1,px,py,8);pg.addColorStop(0,'#fff4c5');pg.addColorStop(.4,'#e7c369');pg.addColorStop(1,'#6f4a16');ctx.fillStyle=pg;ctx.fill();
    ctx.save();ctx.rotate(mid);ctx.translate(dense?r*.64:r*.69,0);if(!dense)ctx.rotate(Math.PI/2);ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor=isJunja?'#ffd84f':'#000';ctx.shadowBlur=isJunja?18:(dense?3:8);ctx.fillStyle=isJunja?'#fffdf0':'#fff';ctx.font=`900 ${dense?(isJunja?13:12):(isJunja?24:30)}px system-ui`;ctx.fillText(isJunja?'★JUNJA★':x.label,0,0);ctx.shadowBlur=0;ctx.restore();if(isJunja){ctx.save();ctx.rotate(mid);ctx.translate(r*.84,0);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff2a1';ctx.shadowColor='#ffce3f';ctx.shadowBlur=15;ctx.font='900 15px system-ui';ctx.fillText('♛',0,0);ctx.restore();}
  }
  // inner decorative rings
  ctx.beginPath();ctx.arc(0,0,r*.28,0,Math.PI*2);ctx.fillStyle='#140f0a';ctx.fill();ctx.strokeStyle='#d7ae54';ctx.lineWidth=9;ctx.stroke();ctx.beginPath();ctx.arc(0,0,r*.19,0,Math.PI*2);ctx.fillStyle='#05080c';ctx.fill();ctx.strokeStyle='#f3d27a';ctx.lineWidth=3;ctx.stroke();ctx.restore();
  // central spindle highlight (not rotating visually)
  const hub=ctx.createRadialGradient(-10,-12,3,0,0,r*.15);hub.addColorStop(0,'#fff1a8');hub.addColorStop(.28,'#d2a443');hub.addColorStop(.72,'#3d2b12');hub.addColorStop(1,'#090a0c');ctx.beginPath();ctx.arc(0,0,r*.135,0,Math.PI*2);ctx.fillStyle=hub;ctx.fill();ctx.strokeStyle='#f6dfa0';ctx.lineWidth=2;ctx.stroke();ctx.restore();
}
function initBigWheel(){drawBigWheel();selectBigWheelBet(bigWheelSelected);if($('#bigWheelResult'))$('#bigWheelResult').textContent='배당을 선택하고 실제 카지노 휠처럼 돌려봐.'}
function bigWheelPointerTick(){const p=$('.wheel-pointer');if(!p)return;p.classList.remove('tick');void p.offsetWidth;p.classList.add('tick');fx('wheel')}
async function spinBigWheel(auto=false){
  if(bigWheelSpinning)return false;const input=$('#bigWheelBet'),bet=Math.max(1000,Math.min(10000000,Math.floor(Number(me?.balance||0)/1000)*1000,Math.floor(Number(input?.value||1000)/1000)*1000));if(input)input.value=bet;bigWheelSpinning=true;const btn=$('#bigWheelSpinBtn');btn.disabled=true;btn.textContent='WHEEL SPINNING...';$('#bigWheelResult').innerHTML='<small>NO MORE BETS</small><b>딜러가 휠을 회전시켰습니다…</b>';
  let ok=false,lastPocket=-1;try{
    const d=await api('/api/bigwheel/spin',{method:'POST',body:JSON.stringify({bet,key:bigWheelSelected})}),idx=d.result.index,n=BIG_WHEEL_SEGMENTS.length,step=Math.PI*2/n,current=bigWheelAngle%(Math.PI*2),desired=-(idx*step+step/2),turns=8+Math.floor(Math.random()*3),target=current+(turns*Math.PI*2)+(((desired-current)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)),start=performance.now(),from=bigWheelAngle,dur=auto?4300:6200;
    $('.bigwheel-stage')?.classList.add('wheel-live');
    await new Promise(resolve=>{const frame=t=>{const p=Math.min(1,(t-start)/dur),ease=1-Math.pow(1-p,4.7);bigWheelAngle=from+(target-from)*ease;drawBigWheel();const pocket=Math.floor((((-bigWheelAngle+Math.PI/2)%(Math.PI*2)+Math.PI*2)%(Math.PI*2))/step);if(pocket!==lastPocket&&p<.97){lastPocket=pocket;if(p>.08)bigWheelPointerTick()}if(p<1)requestAnimationFrame(frame);else resolve()};requestAnimationFrame(frame)});
    bigWheelAngle=target;drawBigWheel();$('.bigwheel-stage')?.classList.remove('wheel-live');const r=d.result;$('#bigWheelResult').innerHTML=r.won?`<small>WINNING SEGMENT</small><b class="wheel-win">🏆 ${html(r.landed.label)} · ${money(r.payout)} 지급</b>`:`<small>WINNING SEGMENT</small><b>${html(r.landed.label)} · 다음 휠에 도전</b>`;me=d.user;updateHeader();fx(r.won?'win':'stop');if(r.won&&!auto)confetti();ok=true
  }catch(e){toast(e.message);$('#bigWheelResult').textContent='오류가 발생했어. 다시 시도해줘.'}finally{$('.bigwheel-stage')?.classList.remove('wheel-live');bigWheelSpinning=false;btn.disabled=false;btn.textContent='SPIN THE WHEEL'}return ok
}
function selectBigWheelBet(key){bigWheelSelected=key;$$('[data-wheel-bet]').forEach(b=>b.classList.toggle('active',b.dataset.wheelBet===key));fx()}
async function runBigWheelAuto(count){if(bigWheelAutoRunning||bigWheelSpinning)return;bigWheelAutoRunning=true;bigWheelAutoStop=false;const stop=$('#bigWheelAutoStop'),status=$('#bigWheelAutoStatus');stop.disabled=false;for(let i=0;i<count&&!bigWheelAutoStop;i++){if(status)status.textContent=`AUTO ${i+1}/${count}`;const ok=await spinBigWheel(true);if(!ok)break;if(i<count-1&&!bigWheelAutoStop)await sleep(650)}bigWheelAutoRunning=false;stop.disabled=true;if(status)status.textContent=bigWheelAutoStop?'중지됨':'완료'}

const DICE_PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function dieHtml(v){return Array.from({length:9},(_,i)=>`<i class="pip ${DICE_PIPS[v]?.includes(i)?'on':''}"></i>`).join('')}
function setDie(el,v){if(!el)return;el.innerHTML=dieHtml(v);el.dataset.value=v}
function selectSicboBet(key){if(sicboRolling)return;sicboSelected=key;$$('[data-sicbo-bet]').forEach(b=>b.classList.toggle('active',b.dataset.sicboBet===key));fx()}

function initSicbo(){const totals=$('#sicboTotals');if(totals&&!totals.children.length){const mult={4:51,5:19,6:15,7:13,8:9,9:7,10:6,11:6,12:7,13:9,14:13,15:15,16:19,17:51};for(let n=4;n<=17;n++){const b=document.createElement('button');b.type='button';b.dataset.sicboBet=`total-${n}`;b.innerHTML=`<b>${n}</b><small>×${mult[n]}</small>`;b.onclick=()=>selectSicboBet(b.dataset.sicboBet);totals.appendChild(b)}}$$('#sicboDice .die').forEach((d,i)=>setDie(d,i+2));selectSicboBet(sicboSelected);if($('#sicboResult'))$('#sicboResult').textContent='베팅 칸을 고르고 ROLL DICE'}
async function rollSicbo(auto=false){
  if(sicboRolling)return false;const input=$('#sicboBet'),bet=Math.max(1000,Math.min(100000,Math.floor(Number(input?.value||1000)/1000)*1000));if(input)input.value=bet;sicboRolling=true;const btn=$('#sicboRollBtn');btn.disabled=true;btn.textContent='SHAKING DOME...';const dice=$$('#sicboDice .die');$('.dice-dome')?.classList.add('shaking');dice.forEach((d,i)=>{d.classList.add('rolling');d.style.setProperty('--dx',`${(i-1)*22}px`);d.getAnimations?.().forEach(a=>a.cancel());d.animate([{transform:`translate3d(${(i-1)*18}px,-8px,0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1)`},{offset:.22,transform:`translate3d(${(i-1)*12+18}px,-72px,0) rotateX(${220+i*80}deg) rotateY(${310+i*65}deg) rotateZ(${90+i*45}deg) scale(1.06)`},{offset:.5,transform:`translate3d(${(i-1)*25-14}px,-18px,0) rotateX(${500+i*70}deg) rotateY(${600+i*95}deg) rotateZ(${190+i*65}deg) scale(.98)`},{offset:.74,transform:`translate3d(${(i-1)*16+9}px,-48px,0) rotateX(${720+i*90}deg) rotateY(${820+i*70}deg) rotateZ(${280+i*50}deg) scale(1.03)`},{transform:`translate3d(${(i-1)*20}px,0,0) rotateX(${900+i*180}deg) rotateY(${1080+i*90}deg) rotateZ(${360+i*120}deg) scale(1)`}],{duration:auto?1250:1750,iterations:1,easing:'cubic-bezier(.16,.68,.18,1)',fill:'forwards'})});fx('dice');let ticker=setInterval(()=>dice.forEach(d=>setDie(d,1+Math.floor(Math.random()*6))),80),ok=false;
  try{const d=await api('/api/sicbo/roll',{method:'POST',body:JSON.stringify({bet,key:sicboSelected})});await sleep(auto?1300:1800);clearInterval(ticker);ticker=null;dice.forEach((el,i)=>{el.classList.remove('rolling');el.getAnimations?.().forEach(a=>a.cancel());setDie(el,d.result.dice[i])});$('.dice-dome')?.classList.remove('shaking');const r=d.result;$('#sicboResult').innerHTML=`<div class="sicbo-result-line"><span>${r.dice.join(' · ')} = <b>${r.total}</b>${r.triple?' · TRIPLE':''}</span><strong class="${r.won?'win':'lose'}">${r.won?'🏆 '+money(r.payout)+' 지급':'MISS'}</strong></div>`;me=d.user;updateHeader();fx(r.won?'win':'stop');if(r.won&&!auto&&(r.triple||r.bet.mult>=15))confetti();ok=true}catch(e){if(ticker)clearInterval(ticker);$('.dice-dome')?.classList.remove('shaking');dice.forEach(d=>{d.classList.remove('rolling');d.getAnimations?.().forEach(a=>a.cancel())});toast(e.message)}finally{sicboRolling=false;btn.disabled=false;btn.textContent='ROLL DICE'}return ok
}
async function runSicboAuto(count){if(sicboAutoRunning||sicboRolling)return;sicboAutoRunning=true;sicboAutoStop=false;const stop=$('#sicboAutoStop'),status=$('#sicboAutoStatus');if(stop)stop.disabled=false;for(let i=0;i<count&&!sicboAutoStop;i++){if(document.hidden){sicboAutoStop=true;break}if(status)status.textContent=`${i+1}/${count}`;const ok=await rollSicbo(true);if(!ok)break;await sleep(450)}sicboAutoRunning=false;if(stop)stop.disabled=true;if(status)status.textContent=sicboAutoStop?'중지됨':'완료'}

const SEOTDA_RANK_ORDER=['38광땡','18광땡','13광땡','장땡','9땡','8땡','7땡','6땡','5땡','4땡','3땡','2땡','1땡','알리','독사','구삥','장삥','장사','세륙','갑오','8끗','7끗','6끗','5끗','4끗','3끗','2끗','1끗','망통'];
async function loadSeotda(){try{const d=await api('/api/solo/seotda');if(d.game)renderSeotda(d.game);else{$('#seotdaTable').classList.add('hidden');$('#seotdaStart').classList.remove('hidden')}}catch(e){toast(e.message)}}
function seotdaCard(c,hidden=false,selectable=false){if(hidden||!c||c.id==='XX')return `<div class="hwatu-card seotda-card hidden-card"><span>花</span></div>`;const month=Number(c.m||0);return `<button class="hwatu-card seotda-card month-${month} ${selectable?'discardable':''}" ${selectable?`data-seotda-card="${html(c.id)}"`:''} type="button"><small>${month}월</small><b>${month}</b><span>${c.g?'✨ 광':'화투'}</span>${selectable?'<em>버리기</em>':''}</button>`}
function seotdaClientEval(cards){const [a,b]=cards,m=[Number(a.m),Number(b.m)].sort((x,y)=>x-y),key=m.join('-'),both=a.g&&b.g;if(both&&key==='3-8')return [100,'38광땡'];if(both&&key==='1-8')return [99,'18광땡'];if(both&&key==='1-3')return [98,'13광땡'];if(m[0]===m[1])return [70+m[0],`${m[0]===10?'장':m[0]}땡`];const sp={'1-2':[69,'알리'],'1-4':[68,'독사'],'1-9':[67,'구삥'],'1-10':[66,'장삥'],'4-10':[65,'장사'],'4-6':[64,'세륙']};if(sp[key])return sp[key];const k=(m[0]+m[1])%10;return [k,k===9?'갑오':k===0?'망통':`${k}끗`]}function seotdaClientRank(cards){cards=(cards||[]).filter(c=>c&&c.id!=='XX');if(cards.length<2)return '패 대기';if(cards.length===2)return seotdaClientEval(cards)[1];let best=[-1,'패 대기'];for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){const r=seotdaClientEval([cards[i],cards[j]]);if(r[0]>best[0])best=r}return best[1]}
async function startSeotda(){try{const bet=normalizeWalletWagerInput('seotdaBet',5000);if(!bet)throw new Error('섯다를 시작하려면 최소 5,000G가 필요해.');const d=await api('/api/solo/seotda/start',{method:'POST',body:JSON.stringify({bet})});me=d.user;updateHeader();renderSeotda(d.game)}catch(e){toast(e.message)}}
function seotdaFx(rank=''){rank=String(rank||'');if(rank==='38광땡')return 7;if(/광땡/.test(rank))return 6;if(rank==='장땡')return 5;if(/땡$/.test(rank))return 4;if(/알리|독사|구삥|장삥|장사|세륙/.test(rank))return 3;if(rank==='갑오')return 2;if(/끗$/.test(rank))return 1;return 0}
function seotdaRankBadge(rank){const lv=seotdaFx(rank);return `<b class="hand-rank seotda-rank-fx fx-${lv}"><span>${html(rank||'')}</span>${lv>=4?'<i></i><i></i><i></i>':''}</b>`}
function seotdaRankPanel(current=''){return `<aside class="seotda-rank-board panel"><small>SEOTDA HAND RANK</small><h3>섯다 족보표</h3><div>${SEOTDA_RANK_ORDER.map((r,i)=>`<span class="${r===current?'active':''}"><b>${i+1}</b><em>${r}</em></span>`).join('')}</div></aside>`}
function renderSeotda(g){$('#seotdaStart').classList.add('hidden');const root=$('#seotdaTable');root.classList.remove('hidden');const done=g.phase==='complete',current=done?g.result?.userRank:seotdaClientRank(g.userCards),userLv=seotdaFx(current),botLv=done?seotdaFx(g.result?.botRank):0;let actions='';if(g.phase==='draw')actions='<button class="primary full seotda-draw" type="button">+ 세 번째 패 받기</button>';else if(g.phase==='discard')actions='<div class="seotda-guide">내 3장 중 버릴 한 장을 터치해. 버린 카드는 J-BOT에게 공개돼.</div>';else if(done)actions='<div class="seotda-next-actions"><button class="primary new-seotda" type="button">⚡ 같은 판돈으로 다음 판</button><button class="secondary change-seotda-bet" type="button">판돈 변경</button></div>';root.innerHTML=`<div class="seotda-pro-layout"><div class="kcard-table seotda-table pro panel ${done?'revealed fx-winner-'+Math.max(userLv,botLv):''}"><div class="kcard-header"><div><small>THREE CARD SHOWDOWN · VS J-BOT</small><h3>${money(g.bet)} · 공개 버리기</h3></div><span class="round-lamp ${done?'done':'live'}">${done?'RESULT':g.phase==='draw'?'DRAW 3RD':'DISCARD'}</span></div><div class="duel-zone"><div class="duel-player bot fx-${botLv}"><div class="avatar-ring character-ring">${botFace('seotda','duel-face')}</div><h4>J-BOT</h4><div class="three-cards">${(g.botCards||[]).map(c=>seotdaCard(c,!done&&c.id!==(g.botDiscard?.id))).join('')}</div>${g.botDiscard?`<div class="discard-public">공개 버림 ${seotdaCard(g.botDiscard,false)}</div>`:''}${done?seotdaRankBadge(g.result.botRank):''}</div><div class="versus-mark">VS</div><div class="duel-player user fx-${userLv}"><div class="avatar-ring character-ring">${avatarImg(me.avatar,me.nickname,'duel-face',me.cosmetics)}</div><h4>${html(me.nickname)}</h4><div class="three-cards">${(g.userCards||[]).map(c=>seotdaCard(c,false,g.phase==='discard')).join('')}</div><div class="current-seotda-rank"><small>CURRENT BEST</small>${seotdaRankBadge(current)}</div></div></div>${done?`<div class="result-banner mega seotda-result fx-${Math.max(userLv,botLv)}">${html(g.result.text)} ${g.result.payout?`· ${money(g.result.payout)} 정산`:''}</div>`:''}${actions}</div>${seotdaRankPanel(current)}</div>`;$('.seotda-draw',root)?.addEventListener('click',async()=>{try{const d=await api('/api/solo/seotda/draw',{method:'POST',body:'{}'});renderSeotda(d.game)}catch(e){toast(e.message)}});$$('[data-seotda-card]',root).forEach(b=>b.onclick=async()=>{try{const d=await api('/api/solo/seotda/discard',{method:'POST',body:JSON.stringify({cardId:b.dataset.seotdaCard})});me=d.user;updateHeader();renderSeotda(d.game)}catch(e){toast(e.message)}});$('.new-seotda',root)?.addEventListener('click',async e=>{const btn=e.currentTarget;btn.disabled=true;btn.textContent='다음 판 준비 중...';try{const d=await api('/api/solo/seotda/start',{method:'POST',body:JSON.stringify({bet:g.bet})});me=d.user;updateHeader();renderSeotda(d.game)}catch(err){toast(err.message);btn.disabled=false;btn.textContent='⚡ 같은 판돈으로 다음 판'}});$('.change-seotda-bet',root)?.addEventListener('click',async()=>{try{await api('/api/solo/seotda/reset',{method:'POST',body:'{}'});}catch{}root.classList.add('hidden');$('#seotdaStart').classList.remove('hidden');if($('#seotdaBet'))$('#seotdaBet').value=Math.min(Math.floor(Number(me?.balance||0)/1000)*1000,Math.max(5000,Number(g.bet||100000)))});if(done&&userLv>=5)setTimeout(confetti,120)}
function renderSeotdaMulti(room){$('#seotdaBrowser').classList.add('hidden');const root=$('#seotdaRoom');root.classList.remove('hidden');const s=room.seotda;if(!s){root.innerHTML=roomToolbar(room)+`<div class="seotda-wait-stage panel"><b>3장 섯다 LIVE DUEL</b><span>두 명 모두 READY → 방장 시작 → 각자 3번째 패 → 공개로 한 장 버리기</span></div>`;bindRoomCommon(root,room);return}const myId=String(me.id),opp=room.players.find(p=>Number(p.userId)!==Number(me.id)),myCards=s.cards?.[myId]||s.cards?.[me.id]||[],oppCards=s.cards?.[String(opp?.userId)]||s.cards?.[opp?.userId]||[],myDiscard=s.discard?.[myId]||s.discard?.[me.id],oppDiscard=s.discard?.[String(opp?.userId)]||s.discard?.[opp?.userId],done=s.phase==='complete',myCurrent=done?(s.result?.ranks?.[myId]||s.result?.ranks?.[me.id]):seotdaClientRank(myCards);let action='';if(s.phase==='draw'){const drew=!!(s.drawn?.[myId]??s.drawn?.[me.id]);action=drew?'<div class="seotda-guide wait">상대가 세 번째 패를 받을 때까지 기다리는 중...</div>':'<button class="primary full multi-seotda-draw" type="button">+ 세 번째 패 받기</button>'}else if(s.phase==='discard'){action=myDiscard?'<div class="seotda-guide wait">내 공개 버림 완료 · 상대 선택 대기</div>':'<div class="seotda-guide">내 3장 중 버릴 한 장을 터치해. 상대에게 즉시 공개돼.</div>'}else if(done){const winner=Number(s.result?.winnerId||0),mine=room.players.find(p=>Number(p.userId)===Number(me.id));action=`<div class="result-banner mega ${winner===Number(me.id)?'win':''}">${!winner?'무승부':winner===Number(me.id)?'🏆 승리!':'상대 승리'} · ${html(myCurrent||'')}</div><div class="seotda-rematch-box"><b>같은 방에서 바로 다음 판</b><span>둘 다 READY를 누르는 순간 자동으로 다음 판이 시작돼. 나갔다 다시 들어올 필요 없어.</span><button class="${mine?.ready?'ready-on':'primary'} seotda-rematch-ready" type="button">${mine?.ready?'✓ 다음 판 READY 완료':'다음 판 READY'}</button></div>`}root.innerHTML=`${roomToolbar(room)}<div class="seotda-pro-layout"><div class="kcard-table seotda-table pro multi panel"><div class="kcard-header"><div><small>LIVE THREE CARD DUEL</small><h3>${money(room.buyIn)} · 버린 패 공개</h3></div><span class="round-lamp ${done?'done':'live'}">${done?'SHOWDOWN':s.phase.toUpperCase()}</span></div><div class="duel-zone"><div class="duel-player bot">${avatarImg(opp?.avatar,opp?.nickname,'duel-face',opp?.cosmetics)}<h4>${html(opp?.nickname||'상대')}</h4><div class="three-cards">${oppCards.map(c=>seotdaCard(c,c.id==='XX')).join('')}</div>${oppDiscard?`<div class="discard-public">상대 공개 버림 ${seotdaCard(oppDiscard)}</div>`:''}${done?seotdaRankBadge(s.result?.ranks?.[opp?.userId]||''):''}${reactionBubble(room,opp?.userId)}</div><div class="versus-mark">VS</div><div class="duel-player user">${avatarImg(me.avatar,me.nickname,'duel-face',me.cosmetics)}<h4>${html(me.nickname)}</h4><div class="three-cards">${myCards.map(c=>seotdaCard(c,false,s.phase==='discard'&&!myDiscard)).join('')}</div><div class="current-seotda-rank"><small>CURRENT BEST</small>${seotdaRankBadge(myCurrent)}</div>${reactionBubble(room,me.id)}</div></div>${action}</div>${seotdaRankPanel(myCurrent)}</div>`;bindRoomCommon(root,room);$('.multi-seotda-draw',root)?.addEventListener('click',async()=>{try{const d=await api(`/api/rooms/${room.id}/seotda/draw`,{method:'POST',body:'{}'});renderRoom(d.room)}catch(e){toast(e.message)}});$$('[data-seotda-card]',root).forEach(b=>b.onclick=async()=>{try{const d=await api(`/api/rooms/${room.id}/seotda/discard`,{method:'POST',body:JSON.stringify({cardId:b.dataset.seotdaCard})});renderRoom(d.room);if(d.room.seotda?.phase==='complete')await refreshMe()}catch(e){toast(e.message)}});$('.seotda-rematch-ready',root)?.addEventListener('click',async e=>{const btn=e.currentTarget;btn.disabled=true;try{const d=await api(`/api/rooms/${room.id}/ready`,{method:'POST',body:'{}'});if(d.room){const prev=Number(room.buyIn||0),next=Number(d.room.buyIn||0);renderRoom(d.room);if(d.room.seotda?.phase!=='complete')toast(next<prev?`잔액에 맞춰 판돈을 ${money(next)}로 자동 조정하고 다음 판 시작!`:'두 명 READY 완료 · 다음 판 시작!')}}catch(err){toast(err.message);btn.disabled=false}})}

// GOSTOP
function resetGostopUI(){if($('#gostopTable')?.classList.contains('hidden'))$('#gostopStart')?.classList.remove('hidden')}
async function loadGostop(){try{const d=await api('/api/solo/gostop');if(d.game)renderGostop(d.game);else{$('#gostopTable').classList.add('hidden');$('#gostopStart').classList.remove('hidden')}}catch(e){toast(e.message)}}
const MONTH_ICON=['','🌲','🐦','🌸','🌿','🌺','🦋','🍁','🌕','🍂','🦌','🎑','☔'];
function hwatuCard(c,clickable=false,choice=false){if(c.id==='XX')return `<div class="hwatu-card hidden-card"><span>J</span><i>花</i></div>`;const tag=c.ribbon||c.type,flags=`${c.doublePi?' · 쌍피':''}${c.bird?' · 새':''}`;return `<button class="hwatu-card month-${c.m} type-${c.type} ${clickable?'clickable':''} ${choice?'choice-card':''}" ${clickable?`data-hwatu="${c.id}"`:''} ${choice?`data-hwatu-choice="${c.id}"`:''} type="button"><small>${c.m}월 · ${html(c.name||'화투')}</small><b>${MONTH_ICON[c.m]}</b><span>${html(tag)}${flags}</span></button>`}
async function startGostop(){try{const bet=normalizeWagerInput('gostopBet',5000,1000000);if(bet>Number(me?.balance||0))throw new Error(`보유 게임머니(${money(me?.balance||0)})를 초과해서 걸 수 없습니다.`);const d=await api('/api/solo/gostop/start',{method:'POST',body:JSON.stringify({bet})});me=d.user;updateHeader();renderGostop(d.game)}catch(e){toast(e.message)}}
function scoreBox(label,s,go,face=''){return `<div class="gscore"><div class="gscore-who">${face}<span>${html(label)}</span></div><b>${s.score+go}점</b><small>광 ${s.g} · 열 ${s.a} · 띠 ${s.r} · 피 ${s.p} · ${go}고</small>${s.combos?.length?`<div class="matgo-combos">${s.combos.map(x=>`<em>${html(x)}</em>`).join('')}</div>`:''}</div>`}
function capturedSummary(cards){const types=[['광','광'],['열끗','열'],['띠','띠'],['피','피']];return `<div class="captured-piles">${types.map(([key,label])=>{const list=cards.filter(c=>c.type===key);return `<div><span>${label} ${list.reduce((n,c)=>n+(c.doublePi?2:1),0)}</span><div>${list.slice(-7).map(c=>hwatuCard(c,false)).join('')}</div></div>`}).join('')}</div>`}
function renderGostop(g){$('#gostopStart').classList.add('hidden');const root=$('#gostopTable');root.classList.remove('hidden');const done=g.phase==='complete',canPlay=!done&&!g.needDecision&&!g.pendingChoice&&g.turn==='user';const result=g.result,events=(g.events||[]).map(e=>`<li class="${e.tone||''}">${html(e.text)}</li>`).join('');root.innerHTML=`<div class="gostop-board yashimchan-table panel"><div class="matgo-titlebar"><div><small>YASHIMCHAN ORIGINAL</small><b>야심찬 맞고</b></div><div class="turn-lamp ${g.turn==='user'?'mine':''}">${done?'경기 종료':g.pendingChoice?'먹을 패 선택':g.needDecision?'GO / STOP 결정':g.turn==='user'?'내 차례':'J-BOT 생각 중'}</div></div><div class="gostop-top"><div>${scoreBox('J-BOT',g.score.bot,g.goCount.bot,botFace('gostop','score-face'))}</div><div class="deck-stack"><div class="hwatu-card hidden-card mini"><span>J</span><i>花</i></div><b>${g.deckCount}장</b>${g.lastDraw?`<small>뒤집은 패 ${g.lastDraw.m}월</small>`:''}</div><div>${scoreBox(`${me.nickname} · 나`,g.score.user,g.goCount.user,avatarImg(me.avatar,me.nickname,'score-face',me.cosmetics))}</div></div><div class="bot-hand-row">${g.hands.bot.map(c=>hwatuCard(c,false)).join('')}</div><div class="floor-title">판 · 같은 월을 맞춰 먹어</div><div class="floor-cards">${g.floor.map(c=>hwatuCard(c,false,g.pendingChoice?.options?.some(x=>x.id===c.id))).join('')||'<span class="empty-floor">싹쓸이!</span>'}</div><div class="matgo-lower"><div class="matgo-capture-area"><h4>J-BOT 획득패</h4>${capturedSummary(g.captured.bot)}<h4>내 획득패</h4>${capturedSummary(g.captured.user)}</div><ul class="matgo-event-log">${events||'<li>패를 선택해 시작해.</li>'}</ul></div><div class="my-hand-title">내 손패 ${canPlay?'· 낼 패를 눌러':'· 잠시만'}</div><div class="my-hand-row">${g.hands.user.map(c=>hwatuCard(c,canPlay)).join('')}</div>${g.pendingChoice?`<div class="matgo-choice"><small>같은 월 패가 2장</small><h3>어느 패를 먹을까?</h3><p>빛나는 바닥패 중 하나를 선택해.</p></div>`:''}${g.needDecision?`<div class="go-stop-decision"><div><small>SCORE UP · ${g.goCount.user}고</small><h3>${g.score.user.score+g.goCount.user}점! 승부를 계속할까?</h3><p>3고부터 최종 금액이 2배씩 커져.</p></div><button class="primary" data-gdecision="go" type="button">GO</button><button class="danger" data-gdecision="stop" type="button">STOP</button></div>`:''}${done?`<div class="matgo-result ${g.winner==='user'?'win':'lose'}"><small>${g.winner==='user'?'VICTORY':g.winner==='bot'?'DEFEAT':'DRAW'}</small><h2>${g.winner==='user'?'야심찬 승리!':g.winner==='bot'?'J-BOT 승리':'나가리'}</h2><p>${html(result?.reason||'')} · ${result?.base||0}점 × ${result?.multiplier||1}배</p>${result?.bonuses?.length?`<div>${result.bonuses.map(x=>`<span>${html(x)}</span>`).join('')}</div>`:''}${result?.payout?`<b>${money(result.payout)} 획득</b>`:''}<button class="primary new-gostop" type="button">같은 자리에서 다음 판</button></div>`:''}</div>`;$$('[data-hwatu]',root).forEach(b=>b.onclick=async()=>{try{b.disabled=true;const d=await api('/api/solo/gostop/play',{method:'POST',body:JSON.stringify({cardId:b.dataset.hwatu})});if(d.user){me=d.user;updateHeader()}renderGostop(d.game)}catch(e){toast(e.message)}});$$('[data-hwatu-choice]',root).forEach(b=>b.onclick=async()=>{try{b.disabled=true;const d=await api('/api/solo/gostop/play',{method:'POST',body:JSON.stringify({cardId:g.pendingChoice?.card?.id||'',choiceId:b.dataset.hwatuChoice})});if(d.user){me=d.user;updateHeader()}renderGostop(d.game)}catch(e){toast(e.message)}});$$('[data-gdecision]',root).forEach(b=>b.onclick=async()=>{try{const d=await api('/api/solo/gostop/decision',{method:'POST',body:JSON.stringify({decision:b.dataset.gdecision})});if(d.user){me=d.user;updateHeader()}renderGostop(d.game)}catch(e){toast(e.message)}});$('.new-gostop',root)?.addEventListener('click',async()=>{await api('/api/solo/gostop/reset',{method:'POST',body:'{}'});root.classList.add('hidden');$('#gostopStart').classList.remove('hidden')})}



// SEVEN POKER · 7 CARD STUD
const SEVEN_STREET_NAME={3:'3RD STREET',4:'4TH STREET',5:'5TH STREET',6:'6TH STREET',7:'7TH · RIVER'};
let sevenAutoRound=-1;
function sevenCardStrip(cards=[],face='user'){
  return `<div class="seven-cards ${face}">${Array.from({length:7},(_,i)=>cards[i]?cardHtml(cards[i],'seven-card',i):`<div class="card seven-card empty"><span>${i+1}</span></div>`).join('')}</div>`;
}
function sevenHandImpact(status){const lv=Math.max(0,Math.min(8,Number(status?.rankLevel||0)));return `<div class="seven-hand-status impact-${lv}"><small>CURRENT HAND</small><b>${html(status?.name||'카드 대기')}</b><span>${html(status?.detail||'')}</span>${(status?.draws||[]).map(x=>`<i>${html(x)}</i>`).join('')}</div>`}
function sevenActions(g){
  if(g.complete)return `<div class="seven-action-bar complete"><button class="primary seven-next" type="button">다음 핸드</button><button class="secondary seven-cashout" type="button">칩 정산 후 나가기</button></div>`;
  if(g.turn!=='user')return `<div class="seven-action-bar waiting"><span>🤖 J-BOT이 다음 액션을 계산 중...</span></div>`;
  const call=Math.max(0,Number(g.currentBet||0)-Number(g.roundBet?.user||0)),max=Number(g.roundBet?.user||0)+Number(g.stack?.user||0),min=Math.min(max,Math.max(Number(g.currentBet||0)+Number(g.minRaise||1000),Number(g.minRaise||1000))),half=Math.min(max,Math.max(min,Math.floor((Number(g.currentBet||0)+(Number(g.pot||0)+call)/2)/1000)*1000));
  return `<div class="seven-action-bar"><button class="danger" data-seven-action="fold" type="button">FOLD</button>${call?`<button class="secondary" data-seven-action="call" type="button">CALL ${money(call)}</button>`:`<button class="secondary" data-seven-action="check" type="button">CHECK</button>`}<div class="seven-raise"><div><button data-seven-preset="half" type="button">½ POT<small>${money(half)}</small></button><button data-seven-preset="max" class="max" type="button">MAX<small>${money(max)}</small></button></div><div><input id="sevenRaiseTo" type="number" min="${min}" max="${max}" step="1000" value="${min}" inputmode="numeric"><button class="primary" data-seven-action="raise" type="button">RAISE</button></div></div></div>`;
}
async function startSevenPoker(){const btn=$('#startSevenPoker');if(btn.disabled)return;if(!confirm(`현재 보유한 ${money(me.balance)} 전액을 세븐포커 테이블 스택으로 가져갈까?`))return;btn.disabled=true;try{const d=await api('/api/solo/seven/start',{method:'POST',body:'{}'});me=d.user;updateHeader();renderSevenPoker(d.game)}catch(e){toast(e.message)}finally{btn.disabled=false}}
async function loadSevenPoker(silent=false){try{const d=await api('/api/solo/seven');if(d.game)renderSevenPoker(d.game);else{$('#sevenPokerStart')?.classList.remove('hidden');$('#sevenPokerTable')?.classList.add('hidden')}}catch(e){if(!silent)toast(e.message)}}
function renderSevenPoker(g){
  $('#sevenPokerStart').classList.add('hidden');const root=$('#sevenPokerTable');root.classList.remove('hidden');clearTimeout(sevenAutoTimer);
  const result=g.result?`<div class="seven-result ${g.result.winner}"><small>SHOWDOWN</small><h3>${html(g.result.text)}</h3><div><span>내 패 <b>${html(g.result.userRank||'—')}</b></span><span>J-BOT <b>${html(g.result.botRank||'—')}</b></span><strong>POT ${money(g.result.pot)}</strong></div></div>`:'';
  root.innerHTML=`<div class="seven-toolbar panel"><div><small>HAND #${g.handNo} · ${SEVEN_STREET_NAME[g.street]||g.street}</small><h3>${avatarImg(me.avatar,me.nickname,'seven-toolbar-face',me.cosmetics)} ${html(me.nickname)} <i>VS</i> ${botFace('poker','seven-toolbar-face')} J-BOT</h3></div><div class="seven-bank"><span>내 칩 <b>${money(g.stack.user)}</b></span><span>J-BOT <b>${money(g.stack.bot)}</b></span><button class="secondary seven-cashout" ${!g.complete?'disabled':''} type="button">정산 후 나가기</button></div></div>${result}<div class="seven-layout"><div class="seven-table-shell panel"><div class="seven-felt"><div class="seven-logo">JUNJA<br><span>SEVEN POKER</span></div><div class="seven-opponent"><div class="seven-player-title">${botFace('poker','seven-face')}<div><b>J-BOT</b><small>${html(g.botVisibleStatus?.name||'공개패 분석')}</small></div></div>${sevenCardStrip(g.cards.bot,'bot')}</div><div class="seven-pot"><small>TOTAL POT</small><b>${money(g.pot)}</b><span>${html(g.lastAction||'')}</span></div><div class="seven-me"><div class="seven-player-title">${avatarImg(me.avatar,me.nickname,'seven-face',me.cosmetics)}<div><b>${html(me.nickname)} · 나</b><small>${g.turn==='user'&&!g.complete?'🔥 YOUR TURN':'TABLE PLAYER'}</small></div></div>${sevenCardStrip(g.cards.user,'user')}</div></div>${sevenActions(g)}</div><aside class="seven-side"><div class="panel street-panel"><small>HAND PROGRESS</small>${[3,4,5,6,7].map(n=>`<div class="${g.street===n?'active':g.street>n?'done':''}"><b>${n}</b><span>${SEVEN_STREET_NAME[n]}</span></div>`).join('')}</div><div class="panel">${sevenHandImpact(g.userStatus)}</div><div class="panel seven-rules-mini"><small>7 CARD STUD</small><p>4·5·6번째 카드는 공개, 마지막 7번째 카드는 비공개. 최종 7장 중 최고의 5장으로 승부해.</p><label class="auto-next-toggle mini"><input id="sevenAutoNextTable" type="checkbox" ${storageGet('seven_auto')==='1'?'checked':''}><span></span><b>AUTO NEXT HAND</b></label></div></aside></div>`;
  const tableToggle=$('#sevenAutoNextTable',root);if(tableToggle)tableToggle.onchange=()=>storageSet('seven_auto',tableToggle.checked?'1':'0');
  const startToggle=$('#sevenAutoNext');if(startToggle){startToggle.checked=storageGet('seven_auto')==='1';startToggle.onchange=()=>storageSet('seven_auto',startToggle.checked?'1':'0')}
  $$('[data-seven-preset]',root).forEach(b=>b.onclick=()=>{const input=$('#sevenRaiseTo',root);if(!input)return;const max=Number(input.max||0),min=Number(input.min||0);input.value=b.dataset.sevenPreset==='max'?max:Math.max(min,Math.min(max,Math.floor((Number(g.currentBet||0)+(Number(g.pot||0)+Math.max(0,Number(g.currentBet||0)-Number(g.roundBet?.user||0)))/2)/1000)*1000));fx()});
  $$('[data-seven-action]',root).forEach(b=>b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{const d=await api('/api/solo/seven/action',{method:'POST',body:JSON.stringify({action:b.dataset.sevenAction,raiseTo:Number($('#sevenRaiseTo',root)?.value||0)})});if(d.user){me=d.user;updateHeader()}renderSevenPoker(d.game)}catch(e){toast(e.message);b.disabled=false}});
  $$('.seven-next',root).forEach(b=>b.onclick=()=>nextSevenPoker());$$('.seven-cashout',root).forEach(b=>b.onclick=()=>cashoutSevenPoker());
  if(g.complete&&storageGet('seven_auto')==='1'&&sevenAutoRound!==g.handNo){sevenAutoRound=g.handNo;sevenAutoTimer=setTimeout(()=>{if(currentView==='sevenpoker'&&!document.hidden)nextSevenPoker(true)},3000)}
}
async function nextSevenPoker(auto=false){clearTimeout(sevenAutoTimer);try{const d=await api('/api/solo/seven/next',{method:'POST',body:'{}'});if(d.user){me=d.user;updateHeader()}renderSevenPoker(d.game)}catch(e){if(auto)storageSet('seven_auto','0');toast(e.message)}}
async function cashoutSevenPoker(){clearTimeout(sevenAutoTimer);if(!confirm('현재 테이블 칩을 게임머니로 정산하고 나갈까?'))return;try{const d=await api('/api/solo/seven/leave',{method:'POST',body:'{}'});me=d.user;updateHeader();toast(`세븐포커 정산 ${money(d.cashout)}`);$('#sevenPokerTable').classList.add('hidden');$('#sevenPokerStart').classList.remove('hidden')}catch(e){toast(e.message)}}

function sevenMultiActions(room,s){if(s.complete)return `<div class="seven-action-bar complete"><span>핸드 종료 · 다시 하려면 두 명 모두 READY 후 방장이 게임 시작</span></div>`;if(!room.myTurn)return `<div class="seven-action-bar waiting"><span>⏳ ${html(room.turnNickname||'상대')} 액션 대기 중...</span></div>`;const l=s.legal||{},call=Number(l.toCall||0),min=Number(l.minRaiseTo||0),max=Number(l.maxRaiseTo||0),half=Math.min(max,Math.max(min,Math.floor((Number(s.currentBet||0)+(Number(s.pot||0)+call)/2)/1000)*1000));return `<div class="seven-action-bar"><button class="danger" data-seven-multi="fold">FOLD</button>${call?`<button class="secondary" data-seven-multi="call">CALL ${money(call)}</button>`:'<button class="secondary" data-seven-multi="check">CHECK</button>'}<div class="seven-raise"><div><button data-seven-mpreset="half">½ POT<small>${money(half)}</small></button><button data-seven-mpreset="max" class="max">MAX<small>${money(max)}</small></button></div><div><input id="sevenMultiRaise" type="number" min="${min}" max="${max}" step="1000" value="${min}" inputmode="numeric"><button class="primary" data-seven-multi="raise">RAISE</button></div></div></div>`}
function renderSevenPokerMulti(room){$('#sevenpokerBrowser').classList.add('hidden');const root=$('#sevenpokerRoom');root.classList.remove('hidden');const s=room.seven;if(!s){root.innerHTML=roomToolbar(room)+`<div class="seven-wait-stage panel"><div class="seven-neon">SEVEN</div><b>LIVE 7 CARD STUD</b><span>두 명 모두 READY 후 방장이 시작해.</span></div>`;bindRoomCommon(root,room);return}const opp=room.players.find(p=>Number(p.userId)!==Number(me.id)),mine=room.players.find(p=>Number(p.userId)===Number(me.id)),myCards=s.cards?.[me.id]||s.cards?.[String(me.id)]||[],oppCards=s.cards?.[opp?.userId]||s.cards?.[String(opp?.userId)]||[],myStatus=s.statuses?.[me.id]||s.statuses?.[String(me.id)]||{},oppStatus=s.statuses?.[opp?.userId]||s.statuses?.[String(opp?.userId)]||{};let result='';if(s.complete&&s.result){const winners=s.result.winnerIds||[s.result.winnerId].filter(Boolean),win=winners.map(Number).includes(Number(me.id));result=`<div class="seven-result ${win?'user':winners.length?'bot':'tie'}"><small>SHOWDOWN</small><h3>${html(s.result.summary||'핸드 종료')}</h3><div><span>내 패 <b>${html(s.result.ranks?.[me.id]?.name||s.result.ranks?.[String(me.id)]?.name||myStatus.name||'—')}</b></span><span>상대 <b>${html(s.result.ranks?.[opp?.userId]?.name||s.result.ranks?.[String(opp?.userId)]?.name||oppStatus.name||'—')}</b></span><strong>POT ${money(s.result.pot||s.pot)}</strong></div></div>`}root.innerHTML=`${roomToolbar(room)}${result}<div class="seven-layout"><div class="seven-table-shell panel"><div class="seven-felt"><div class="seven-logo">JUNJA<br><span>LIVE SEVEN</span></div><div class="seven-opponent"><div class="seven-player-title">${avatarImg(opp?.avatar,opp?.nickname,'seven-face',opp?.cosmetics)}<div><b>${html(opp?.nickname||'상대')}</b><small>${html(oppStatus.name||'공개패 분석')}</small></div><strong>${money(opp?.stack||0)}</strong>${reactionBubble(room,opp?.userId)}</div>${sevenCardStrip(oppCards,'bot')}</div><div class="seven-pot"><small>HAND #${s.handNo} · ${SEVEN_STREET_NAME[s.street]||s.street}</small><b>${money(s.pot)}</b><span>${html(s.lastAction||'')}</span></div><div class="seven-me"><div class="seven-player-title">${avatarImg(me.avatar,me.nickname,'seven-face',me.cosmetics)}<div><b>${html(me.nickname)} · 나</b><small>${room.myTurn&&!s.complete?'🔥 YOUR TURN':'TABLE PLAYER'}</small></div><strong>${money(mine?.stack||0)}</strong>${reactionBubble(room,me.id)}</div>${sevenCardStrip(myCards,'user')}</div></div>${sevenMultiActions(room,s)}</div><aside class="seven-side"><div class="panel street-panel"><small>HAND PROGRESS</small>${[3,4,5,6,7].map(n=>`<div class="${s.street===n?'active':s.street>n?'done':''}"><b>${n}</b><span>${SEVEN_STREET_NAME[n]}</span></div>`).join('')}</div><div class="panel">${sevenHandImpact(myStatus)}</div><div class="panel seven-rules-mini"><small>LIVE 7 CARD STUD</small><p>다운 2장 + 오픈 1장으로 시작. 4·5·6번째 공개, 7번째 비공개. 최고의 5장 족보로 승부.</p></div></aside></div>`;bindRoomCommon(root,room);$$('[data-seven-mpreset]',root).forEach(b=>b.onclick=()=>{const i=$('#sevenMultiRaise',root);if(!i)return;i.value=b.dataset.sevenMpreset==='max'?Number(i.max):Math.max(Number(i.min),Math.min(Number(i.max),Math.floor((Number(s.currentBet||0)+(Number(s.pot||0)+Number(s.legal?.toCall||0))/2)/1000)*1000))});$$('[data-seven-multi]',root).forEach(b=>b.onclick=async()=>{try{b.disabled=true;const d=await api(`/api/rooms/${room.id}/seven/action`,{method:'POST',body:JSON.stringify({action:b.dataset.sevenMulti,raiseTo:Number($('#sevenMultiRaise',root)?.value||0)})});renderRoom(d.room);if(d.room.seven?.complete)await refreshMe()}catch(e){toast(e.message);b.disabled=false}})}

// BACCARAT DUEL
function baccaratCardHtml(c,i=0){return cardHtml(c,'baccarat-playing-card',i)}
function baccaratPlayerCard(p,room){const role=p.role||'PLAYER';return `<div class="baccarat-player-card ${p.isMe?'me':''} ${String(role).toLowerCase()}">${avatarImg(p.avatar,p.nickname,'baccarat-face',p.cosmetics)}<div><small>${role}${p.userId===room.hostId?' · HOST':''}</small><b>${html(p.nickname)}</b><span>${money(p.balance)}</span></div><em class="${p.ready?'ready':''}">${p.auto?'AUTO':p.ready?'READY':'WAIT'}</em></div>`}
async function loadBaccaratRooms(silent=false){if(currentRoomId&&currentGame==='baccarat')return loadCurrentRoom(true);try{const d=await api('/api/baccarat/rooms'),root=$('#baccaratRooms');if(!root)return;root.innerHTML=(d.rooms||[]).map(r=>`<div class="room-row deluxe-room-row baccarat-room-row"><div class="room-row-main"><h4>${html(r.name)} <span class="status ${r.players===2?'play':'wait'}">${r.players===2?'2/2':'OPEN'}</span></h4><p>코드 ${r.id} · ${r.players}/2명 ${r.players===2?`· 최대 ${money(r.maxStake)}`:'· 상대 대기 중'}</p><div class="room-mini-users">${(r.participants||[]).map(p=>`<span class="${p.ready?'ready':''}">${AVATAR_SAFE(p.avatar)} ${html(p.nickname)}${p.auto?' AUTO':p.ready?' ✓':''}</span>`).join('')}</div></div><div class="room-row-actions"><button class="secondary" data-baccarat-join="${r.id}" ${r.players>=2?'disabled':''} type="button">${r.players>=2?'FULL':'입장'}</button></div></div>`).join('')||'<div class="empty">열린 바카라 대전방이 없어. 먼저 만들어봐.</div>';$$('[data-baccarat-join]',root).forEach(b=>b.onclick=()=>joinBaccaratRoom(b.dataset.baccaratJoin))}catch(e){if(!silent)toast(e.message)}}
async function createBaccaratRoom(){const b=$('#createBaccarat');if(b.disabled)return;b.disabled=true;try{const d=await api('/api/baccarat/rooms',{method:'POST',body:'{}'});currentRoomId=d.room.id;currentGame='baccarat';lastRoomVersion=d.room.version||0;renderBaccaratRoom(d.room);startRoomPolling();toast(`바카라방 ${d.room.id} 생성 · 친구를 기다리는 중`)}catch(e){toast(e.message);if(/참가 중/.test(e.message))resumeMyRoom()}finally{b.disabled=false}}
async function joinBaccaratRoom(id){try{const d=await api(`/api/baccarat/rooms/${id}/join`,{method:'POST',body:'{}'});currentRoomId=id;currentGame='baccarat';lastRoomVersion=d.room.version||0;renderBaccaratRoom(d.room);startRoomPolling();toast('바카라 대전 입장 완료')}catch(e){toast(e.message);if(/참가 중/.test(e.message))resumeMyRoom()}}
function baccaratResultHtml(room){const r=room.result;if(!r)return `<div class="baccarat-center-message"><div class="shoe-icon">🂠</div><b>${room.players.length<2?'상대를 기다리는 중':'두 명 모두 READY 후 DEAL'}</b><span>Player / Banker 역할은 매 판 교대해.</span></div>`;const myWin=r.winnerUserId===me.id,tie=r.winner==='tie';return `<div class="baccarat-result ${tie?'tie':myWin?'win':'lose'}"><small>ROUND ${room.roundNo} RESULT</small><h3>${tie?'TIE · 무승부':myWin?'🏆 WIN':'LOSE'}</h3><div class="baccarat-hands"><div><span>PLAYER · ${r.playerPoint}</span><div>${r.player.map((c,i)=>baccaratCardHtml(c,i)).join('')}</div></div><div class="versus-chip">VS</div><div><span>BANKER · ${r.bankerPoint}</span><div>${r.banker.map((c,i)=>baccaratCardHtml(c,i+3)).join('')}</div></div></div><div class="baccarat-money-result"><span>승부금 <b>${money(r.stake)}</b></span><strong>${tie?'±0 G':myWin?'+'+money(r.stake):'-'+money(r.stake)}</strong><small>${tie?'TIE · 잔액 변동 없음':`총 맞대결 규모 ${money(r.stake*2)}`}</small></div></div>`}
function renderBaccaratRoom(room){
  $('#baccaratBrowser').classList.add('hidden');const root=$('#baccaratRoom');root.classList.remove('hidden');clearTimeout(baccaratAutoTimer);const mine=room.players.find(p=>p.userId===me.id),host=room.hostId===me.id,both=room.players.length===2,canDeal=both&&room.players.every(p=>p.ready||p.auto),max=Math.max(0,Number(room.maxStake||0));
  root.innerHTML=`<div class="baccarat-room-head panel"><div><small>LIVE DUEL · ROOM ${room.id}</small><h3>${html(room.name)}</h3><span>고정 상한 없음 · 현재 두 사람 기준 최대 <b>${money(max)}</b></span></div><div class="baccarat-room-actions"><button class="secondary baccarat-copy" type="button">초대 링크</button><button class="secondary baccarat-leave" type="button">나가기</button></div></div><div class="baccarat-players">${room.players.map(p=>baccaratPlayerCard(p,room)).join('')}${room.players.length<2?'<div class="baccarat-empty-seat"><span>+</span><b>친구 입장 대기</b></div>':''}</div><div class="baccarat-table panel"><div class="baccarat-felt-mark"><b>JUNJA</b><span>GRAND SALON</span></div>${baccaratResultHtml(room)}</div><div class="baccarat-control panel"><div class="baccarat-status-line"><div><small>ROUND STAKE</small><b>${money(room.stake)}</b></div><div><small>MY STATUS</small><b>${mine?.auto?'AUTO NEXT':mine?.ready?'READY':'WAIT'}</b></div><div><small>ROUND</small><b>#${room.roundNo||0}</b></div></div>${host?`<div class="baccarat-stake-control"><label>다음 판 베팅금 <input id="baccaratStake" type="number" min="1000" max="${max||1000}" step="1" value="${Math.min(room.stake,max||room.stake)}" inputmode="numeric" ${!both?'disabled':''}></label><div class="baccarat-quick-stakes"><button data-baccarat-stake-pct="25" ${!both?'disabled':''}>25%</button><button data-baccarat-stake-pct="50" ${!both?'disabled':''}>50%</button><button data-baccarat-stake-pct="75" ${!both?'disabled':''}>75%</button><button data-baccarat-stake-pct="100" class="max" ${!both?'disabled':''}>MAX</button><button class="secondary baccarat-apply-stake" ${!both?'disabled':''}>적용</button></div></div>`:`<div class="baccarat-guest-stake"><span>방장이 다음 판 베팅금을 설정해.</span><b>${money(room.stake)}</b></div>`}<div class="baccarat-ready-row"><button class="${mine?.ready?'ready-on':'secondary'} baccarat-ready" ${!both?'disabled':''} type="button">${mine?.ready?'✓ READY':'READY'}</button><label class="auto-next-toggle baccarat-auto"><input id="baccaratAuto" type="checkbox" ${mine?.auto?'checked':''} ${!both?'disabled':''}><span></span><b>AUTO NEXT</b></label>${host?`<button class="primary baccarat-deal" ${!canDeal?'disabled':''} type="button">${canDeal?'DEAL CARDS':'상대 READY 대기'}</button>`:''}</div><p class="baccarat-rule-note">8덱 슈 · Natural 8/9 · 표준 Third Card Rule · Player/Banker 역할은 매 판 교대 · TIE는 무승부</p></div>`;
  $('.baccarat-copy',root).onclick=async()=>{const link=`${location.origin}/?game=baccarat&room=${room.id}`;try{if(navigator.share)await navigator.share({title:'JUNJA 바카라 대전',text:'바카라 1:1 한 판?',url:link});else{await navigator.clipboard.writeText(link);toast('초대 링크 복사 완료')}}catch(e){if(e.name!=='AbortError')toast('링크 공유 실패')}};$('.baccarat-leave',root).onclick=leaveRoom;
  $('.baccarat-ready',root)?.addEventListener('click',async()=>{try{const d=await api(`/api/baccarat/rooms/${room.id}/ready`,{method:'POST',body:'{}'});renderBaccaratRoom(d.room)}catch(e){toast(e.message)}});
  $('#baccaratAuto',root)?.addEventListener('change',async e=>{try{const d=await api(`/api/baccarat/rooms/${room.id}/auto`,{method:'POST',body:JSON.stringify({enabled:e.target.checked})});renderBaccaratRoom(d.room)}catch(err){toast(err.message)}});
  $$('[data-baccarat-stake-pct]',root).forEach(b=>b.onclick=()=>{const pct=Number(b.dataset.baccaratStakePct),v=pct===100?max:Math.max(1000,Math.floor(max*pct/100/1000)*1000);$('#baccaratStake',root).value=v;fx()});
  $('.baccarat-apply-stake',root)?.addEventListener('click',async()=>{try{const d=await api(`/api/baccarat/rooms/${room.id}/stake`,{method:'POST',body:JSON.stringify({stake:Number($('#baccaratStake',root).value)})});renderBaccaratRoom(d.room)}catch(e){toast(e.message)}});
  $('.baccarat-deal',root)?.addEventListener('click',()=>dealBaccarat(room.id));
  if(room.result&&mine?.auto&&host&&room.players.every(p=>p.auto)&&baccaratLastAutoRound!==room.roundNo){baccaratLastAutoRound=room.roundNo;baccaratAutoTimer=setTimeout(()=>{if(currentView==='baccarat'&&currentRoomId===room.id&&!document.hidden)dealBaccarat(room.id,true)},4200)}
  if(room.result){refreshMe().catch(()=>{});if(room.result.winnerUserId===me.id){fx('win');setTimeout(confetti,220)}}
}
async function baccaratCinematic(room){
  const table=$('.baccarat-table');if(!table||!room?.result)return;table.classList.add('baccarat-cinematic');const overlay=document.createElement('div');overlay.className='baccarat-show-overlay';overlay.innerHTML='<small>GRAND SALON</small><b>NO MORE BETS</b><span>카드를 오픈합니다</span>';table.appendChild(overlay);fx('baccarat');await sleep(650);overlay.querySelector('b').textContent='PLAYER';fx('card');await sleep(540);overlay.querySelector('b').textContent='BANKER';fx('card');await sleep(540);overlay.querySelector('b').textContent='FINAL DRAW';fx('card');await sleep(520);overlay.classList.add('reveal');overlay.querySelector('b').textContent=room.result.winner==='TIE'?'TIE':`${room.result.winner} WINS`;await sleep(500);overlay.remove();table.classList.remove('baccarat-cinematic')
}
async function dealBaccarat(id,auto=false){const btn=$('.baccarat-deal');if(btn)btn.disabled=true;try{const d=await api(`/api/baccarat/rooms/${id}/start`,{method:'POST',body:'{}'});if(d.user){me=d.user;updateHeader()}renderBaccaratRoom(d.room);await baccaratCinematic(d.room)}catch(e){if(auto)toast('AUTO NEXT 중지 · '+e.message);else toast(e.message);if(btn)btn.disabled=false}}


// ROYAL ROULETTE · v2.3
const ROULETTE_WHEEL=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const ROULETTE_RED=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function rouletteColor(n){return n===0?'green':ROULETTE_RED.has(Number(n))?'red':'black'}
function rouletteModeNeed(){return rouletteMode==='split'?2:rouletteMode==='corner'?4:1}
function rouletteAmount(){const used=rouletteBets.reduce((a,b)=>a+Number(b.amount||0),0),remain=Math.max(0,Number(me?.balance||0)-used);if(rouletteChip==='max')return Math.floor(remain);return Math.min(Number(rouletteChip||1000),remain)}
function rouletteBetKey(b){return `${b.kind}:${Array.isArray(b.target)?b.target.join(','):b.target??''}`}
function rouletteLabel(b){const k=b.kind,t=b.target;if(k==='straight')return `STRAIGHT ${t}`;if(k==='split')return `SPLIT ${t.join('/')}`;if(k==='street')return `STREET ${Number(t)*3-2}-${Number(t)*3}`;if(k==='corner')return `CORNER ${t.join('/')}`;if(k==='sixline')return `SIX ${Number(t)*3-2}-${(Number(t)+1)*3}`;if(k==='dozen')return `${t===1?'1ST':t===2?'2ND':'3RD'} 12`;if(k==='column')return `COLUMN ${t}`;return String(k).toUpperCase()}
function addRouletteBet(kind,target){if(rouletteSpinning)return;let amount=rouletteAmount();if(!Number.isFinite(amount)||amount<1000){toast('베팅 가능한 게임머니가 부족해.');return}const b={kind,target,amount},key=rouletteBetKey(b),same=rouletteBets.find(x=>rouletteBetKey(x)===key);if(same)same.amount+=amount;else rouletteBets.push(b);fx('chip');renderRouletteBets();renderRouletteBoard()}
function rouletteSelectNumber(n){n=Number(n);if(rouletteMode==='straight'){addRouletteBet('straight',n);return}if(rouletteMode==='street'){if(n===0)return toast('0은 STREET에 포함되지 않아.');addRouletteBet('street',Math.floor((n-1)/3)+1);return}if(rouletteMode==='sixline'){if(n===0)return toast('0은 SIX LINE에 포함되지 않아.');let row=Math.floor((n-1)/3)+1;if(row>=12)row=11;addRouletteBet('sixline',row);return}if(n===0&&rouletteMode==='corner')return toast('0이 포함된 코너 베팅은 이 테이블에서 지원하지 않아.');if(roulettePending.includes(n))roulettePending=roulettePending.filter(x=>x!==n);else roulettePending.push(n);const need=rouletteModeNeed();if(roulettePending.length>=need){const nums=[...roulettePending].sort((a,b)=>a-b);roulettePending=[];addRouletteBet(rouletteMode,nums)}else renderRouletteBoard()}
function renderRouletteBoard(){
  const root=$('#rouletteBoard');if(!root)return;const numbers=Array.from({length:36},(_,i)=>i+1),pending=new Set(roulettePending);
  const numberGrid=numbers.map(n=>`<button type="button" class="rnum ${rouletteColor(n)} ${pending.has(n)?'pending':''}" data-rnum="${n}"><b>${n}</b>${rouletteBets.some(x=>x.kind==='straight'&&Number(x.target)===n)?'<i>●</i>':''}</button>`).join('');
  root.innerHTML=`<div class="roulette-zero"><button class="rnum green ${pending.has(0)?'pending':''}" data-rnum="0"><b>0</b></button></div><div class="roulette-number-grid">${numberGrid}</div><div class="roulette-columns">${[1,2,3].map(c=>`<button data-routside="column:${c}">2 TO 1</button>`).join('')}</div><div class="roulette-dozens"><button data-routside="dozen:1">1ST 12</button><button data-routside="dozen:2">2ND 12</button><button data-routside="dozen:3">3RD 12</button></div><div class="roulette-outsides"><button data-routside="low">1–18</button><button data-routside="even">EVEN</button><button class="red" data-routside="red">◆ RED</button><button class="black" data-routside="black">◆ BLACK</button><button data-routside="odd">ODD</button><button data-routside="high">19–36</button></div>`;
  $$('[data-rnum]',root).forEach(b=>b.onclick=()=>rouletteSelectNumber(b.dataset.rnum));$$('[data-routside]',root).forEach(b=>b.onclick=()=>{const [kind,t]=b.dataset.routside.split(':');addRouletteBet(kind,t?Number(t):null)});
  const need=rouletteModeNeed();if(roulettePending.length)$('#rouletteResult').innerHTML=`<small>${rouletteMode.toUpperCase()} SELECT</small><b>${roulettePending.join(' · ')} · ${need-roulettePending.length}개 더 선택</b>`
}
function renderRouletteBets(){const total=rouletteBets.reduce((a,b)=>a+Number(b.amount||0),0);if($('#rouletteBetTotal'))$('#rouletteBetTotal').textContent=money(total);if($('#rouletteBetCount'))$('#rouletteBetCount').textContent=`${rouletteBets.length} bets`;const list=$('#rouletteBetList');if(list)list.innerHTML=rouletteBets.length?rouletteBets.map((b,i)=>`<button type="button" data-rremove="${i}"><span>${html(rouletteLabel(b))}</span><b>${money(b.amount)}</b><small>× REMOVE</small></button>`).join(''):'<span class="roulette-empty-slip">테이블에서 번호·구역을 터치해 칩을 올려.</span>';$$('[data-rremove]',list).forEach(b=>b.onclick=()=>{rouletteBets.splice(Number(b.dataset.rremove),1);renderRouletteBets();renderRouletteBoard()});if($('#rouletteSpinBtn'))$('#rouletteSpinBtn').disabled=rouletteSpinning||rouletteBets.length===0||total>Number(me?.balance||0)}
function drawRouletteWheel(){
  const canvas=$('#rouletteCanvas');if(!canvas)return;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,cx=w/2,cy=h/2,r=w*.455,step=Math.PI*2/37;ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(cx,cy);
  const wood=ctx.createRadialGradient(0,0,r*.5,0,0,r*1.08);wood.addColorStop(0,'#210d05');wood.addColorStop(.63,'#4d1808');wood.addColorStop(.82,'#b47a2a');wood.addColorStop(.92,'#f0ce77');wood.addColorStop(1,'#4b2c0b');ctx.beginPath();ctx.arc(0,0,r*1.08,0,Math.PI*2);ctx.fillStyle=wood;ctx.shadowColor='#000';ctx.shadowBlur=30;ctx.fill();ctx.shadowBlur=0;
  ctx.save();ctx.rotate(rouletteWheelAngle);for(let i=0;i<37;i++){const n=ROULETTE_WHEEL[i],a0=-Math.PI/2+i*step,a1=a0+step,col=rouletteColor(n);ctx.beginPath();ctx.arc(0,0,r*.92,a0,a1);ctx.arc(0,0,r*.69,a1,a0,true);ctx.closePath();ctx.fillStyle=col==='green'?'#0b783e':col==='red'?'#9e1f26':'#111216';ctx.fill();ctx.strokeStyle='#d9bd75';ctx.lineWidth=1.6;ctx.stroke();ctx.save();ctx.rotate((a0+a1)/2);ctx.translate(r*.805,0);ctx.rotate(Math.PI/2);ctx.fillStyle='#fff7dd';ctx.font='900 18px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(n),0,0);ctx.restore()}
  // inner bowl / frets
  const bowl=ctx.createRadialGradient(-35,-45,8,0,0,r*.68);bowl.addColorStop(0,'#f7e6ad');bowl.addColorStop(.1,'#c69a48');bowl.addColorStop(.34,'#2c190c');bowl.addColorStop(.58,'#a56d23');bowl.addColorStop(.75,'#1b1008');bowl.addColorStop(1,'#050505');ctx.beginPath();ctx.arc(0,0,r*.68,0,Math.PI*2);ctx.fillStyle=bowl;ctx.fill();ctx.beginPath();ctx.arc(0,0,r*.43,0,Math.PI*2);ctx.fillStyle='#0b1014';ctx.fill();ctx.strokeStyle='#e0bc65';ctx.lineWidth=5;ctx.stroke();ctx.restore();
  const hub=ctx.createRadialGradient(-12,-12,2,0,0,r*.23);hub.addColorStop(0,'#fff3b8');hub.addColorStop(.24,'#dcb65b');hub.addColorStop(.55,'#77501a');hub.addColorStop(1,'#100b06');ctx.beginPath();ctx.arc(0,0,r*.2,0,Math.PI*2);ctx.fillStyle=hub;ctx.fill();ctx.strokeStyle='#f3d991';ctx.lineWidth=3;ctx.stroke();ctx.restore();positionRouletteBall()
}
function positionRouletteBall(){const ball=$('#rouletteBall'),canvas=$('#rouletteCanvas'),stage=$('.roulette-wheel-stage');if(!ball||!canvas||!stage)return;const box=canvas.getBoundingClientRect(),pb=stage.getBoundingClientRect(),size=box.width,rad=size*.397,cx=box.left-pb.left+size/2,cy=box.top-pb.top+box.height/2,x=cx+Math.cos(rouletteBallAngle)*rad,y=cy+Math.sin(rouletteBallAngle)*rad;ball.style.left=`${x}px`;ball.style.top=`${y}px`}
function initRoulette(){drawRouletteWheel();renderRouletteBoard();renderRouletteBets();window.addEventListener('resize',positionRouletteBall,{passive:true});if(!rouletteBets.length)$('#rouletteResult').innerHTML='<small>EUROPEAN SINGLE ZERO</small><b>PLACE YOUR BETS</b>'}
async function animateRouletteTo(result){const idx=Number(result.index),step=Math.PI*2/37,start=performance.now(),fromW=rouletteWheelAngle,fromB=rouletteBallAngle,dur=6800,wTarget=fromW+Math.PI*2*(7+Math.random()*2),finalPocket=-Math.PI/2+(idx+.5)*step,ballTarget=wTarget+finalPocket+Math.PI*2*2;$('.roulette-wheel-stage')?.classList.add('spinning');let lastTick=-1;await new Promise(resolve=>{const frame=t=>{const p=Math.min(1,(t-start)/dur),ew=1-Math.pow(1-p,3.4),eb=1-Math.pow(1-p,4.2);rouletteWheelAngle=fromW+(wTarget-fromW)*ew;rouletteBallAngle=fromB+(ballTarget-fromB)*eb;drawRouletteWheel();const tick=Math.floor((((rouletteBallAngle-rouletteWheelAngle)%(Math.PI*2)+Math.PI*2)%(Math.PI*2))/step);if(tick!==lastTick&&p>.15&&p<.96){lastTick=tick;fx('roulette')}if(p<1)requestAnimationFrame(frame);else resolve()};requestAnimationFrame(frame)});rouletteWheelAngle=wTarget;rouletteBallAngle=ballTarget;drawRouletteWheel();$('.roulette-wheel-stage')?.classList.remove('spinning')}
async function spinRoulette(){if(rouletteSpinning||!rouletteBets.length)return;const total=rouletteBets.reduce((a,b)=>a+Number(b.amount||0),0);if(total>Number(me?.balance||0))return toast('전체 룰렛 베팅금이 보유 게임머니보다 많아.');rouletteSpinning=true;renderRouletteBets();const btn=$('#rouletteSpinBtn');if(btn)btn.textContent='NO MORE BETS · SPINNING';$('#rouletteResult').innerHTML='<small>NO MORE BETS</small><b>ROULETTE IN MOTION</b>';try{const d=await api('/api/roulette/spin',{method:'POST',body:JSON.stringify({bets:rouletteBets})});me=d.user;updateHeader();await animateRouletteTo(d.result);const r=d.result,won=r.payout>0;$('#rouletteResult').innerHTML=`<small>${r.color.toUpperCase()} · WINNING NUMBER</small><b class="${r.color}">${r.number}</b><span>${won?`${money(r.payout)} 지급 · ${signedMoney(r.profit)}`:`${money(r.totalBet)} 베팅 · MISS`}</span>`;rouletteBets=[];roulettePending=[];renderRouletteBets();renderRouletteBoard();fx(won?'win':'stop');if(won&&r.profit>0)confetti()}catch(e){toast(e.message)}finally{rouletteSpinning=false;if(btn)btn.textContent='SPIN · NO MORE BETS';renderRouletteBets()}}

function confetti(){for(let i=0;i<34;i++){const x=document.createElement('i');x.style.cssText=`position:fixed;z-index:999;left:${Math.random()*100}vw;top:-15px;width:7px;height:14px;background:hsl(${Math.random()*360} 90% 65%);transform:rotate(${Math.random()*180}deg);transition:1.8s linear;pointer-events:none`;document.body.appendChild(x);requestAnimationFrame(()=>{x.style.top='105vh';x.style.transform+=` translateX(${(Math.random()-.5)*180}px) rotate(720deg)`});setTimeout(()=>x.remove(),1900)}}
window.addEventListener('error',e=>{console.error('[JGC UI]',e.error||e.message);const t=$('#toast');if(t){t.textContent='화면 오류를 감지했어. 새로고침하면 자동 복구돼.';t.classList.add('show')}});
window.addEventListener('unhandledrejection',e=>{console.error('[JGC PROMISE]',e.reason)});
boot();

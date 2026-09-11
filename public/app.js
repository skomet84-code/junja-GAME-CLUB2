const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
let me=null,currentView='lobby',currentRoomId=null,currentGame=null,events=null,selectedBet=10000,refreshTimer=null,slotSpinState=null,autoSpinRunning=false,autoSpinStop=false,slotSession={spins:0,wins:0,net:0,best:0,recent:[]},selectedYutMoveIndex=0,selectedSoloYutMoveIndex=0,horseCardData=null,horseRacing=false,horseLastResult=null,bigWheelSelected='x2',bigWheelSpinning=false,bigWheelAngle=0,sicboSelected='small',sicboRolling=false,roomPollTimer=null,roomRefreshBusy=false,lastRoomVersion=-1,roomSeenMembers=new Map(),liveGame=null,liveHeartbeatTimer=null,livePollTimer=null,liveKnownIds=new Set(),liveInitialized=false,sevenAutoTimer=null,baccaratAutoTimer=null,baccaratLastAutoRound=-1,networkDegraded=false,bigWheelAutoStop=false,sicboAutoStop=false,bigWheelAutoRunning=false,sicboAutoRunning=false,shopData=null,shopCategory='all',shopOwnedOnly=false,shopCharacterGender='all';
const SLOT_SYMBOLS=['🍒','🍋','🍊','🔔','⭐','💎','7️⃣','J'];
const SLOT_CELL_CLASS={'🍒':'cherry','🍋':'lemon','🍊':'orange','🔔':'bell','⭐':'star','💎':'diamond','7️⃣':'seven','J':'junja'};
const REACTION_META={frustrated:['😫','답답해!','base'],hurry:['⏩','빨리빨리!','base'],cry:['😭','으앙 ㅠㅠ','base'],laugh:['😂','ㅋㅋㅋㅋ','base'],wow:['😲','헐?!','base'],sad:['😢','슬퍼...','base'],nice:['😎','나이스~','base'],go:['🔥','가즈아!','base'],lucky:['🍀','오늘 느낌 온다!','bubble_hype'],gg:['🤝','굿게임!','bubble_hype'],boom:['💥','터졌다!','bubble_hype'],clutch:['🎯','딱 맞췄다!','bubble_hype'],heart:['💖','좋아좋아!','bubble_cute'],wink:['😉','찡긋~','bubble_cute'],pout:['🥺','한 번만...','bubble_cute'],clap:['👏','박수!','bubble_cute'],crown:['👑','품격 있게~','bubble_royal'],sparkle:['✨','클래스가 다르지','bubble_royal'],salute:['🫡','인정!','bubble_royal'],throne:['🪑','왕좌는 내 자리','bubble_royal'],bigbet:['💸','큰 판 간다!','bubble_highroller'],chips:['🪙','칩 쌓아!','bubble_highroller'],allin:['🔥','올인 감성!','bubble_highroller'],myday:['😎','오늘은 내 날','bubble_highroller'],legend:['⚡','전설 등장!','bubble_legend'],classup:['👑','이게 클래스','bubble_legend'],mood:['✨','분위기 잡았다','bubble_legend'],finish:['🏆','끝내자!','bubble_legend']};
const LIVE_GAME_VIEWS=new Set(['slot','holdem','sevenpoker','baccarat','yut','seotda','gostop','horse','bigwheel','sicbo']);
const LIVE_GAME_LABEL={slot:'ROYAL REELS',holdem:"HOLD'EM ARENA",sevenpoker:'SEVEN POKER',baccarat:'BACCARAT DUEL',yut:'YUT ARENA',seotda:'SEOTDA DUEL',gostop:'MATGO FLOOR',horse:'GRAND RACE',bigwheel:'BIG WHEEL',sicbo:'SIC BO'};
const money=n=>new Intl.NumberFormat('ko-KR').format(Number(n||0))+' G';
const timeText=t=>new Intl.DateTimeFormat('ko-KR',{hour:'2-digit',minute:'2-digit',month:'numeric',day:'numeric'}).format(new Date(t));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
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
  mount.innerHTML=`<div class="live-floor panel"><div class="live-floor-head"><div><small>LIVE FLOOR · ${html(LIVE_GAME_LABEL[game]||game.toUpperCase())}</small><h3><i></i> 실시간 참여자 <b>${members.length}</b>명</h3></div><span>${['holdem','yut','baccarat'].includes(game)?'방 참가자는 함께 플레이 · 진행 중엔 같은 게임 유저도 실시간 표시':'같은 게임에 들어온 유저와 동시에 플레이 · 결과는 각자 정산'}</span></div><div class="live-members">${members.map(p=>`<div class="live-member ${Number(p.userId)===Number(me?.id)?'me':''} ${nowMs-Number(p.joinedAt||0)<5000?'just-in':''}">${liveFace(p)}<div><b>${html(p.nickname)}</b>${equippedTitle(p.cosmetics)?`<em class="live-title">${html(equippedTitle(p.cosmetics))}</em>`:''}<small>${Number(p.userId)===Number(me?.id)?'나 · PLAYING':'ONLINE'}</small></div></div>`).join('')||'<div class="live-empty">아직 이 게임에 접속한 유저가 없어.</div>'}</div><div class="live-reaction-row"><span>말풍선</span>${reactionEntries().map(([k,[e,l]])=>`<button type="button" data-floor-reaction="${k}" title="${html(l)}"><b>${e}</b><small>${html(l)}</small></button>`).join('')}</div></div>`;
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
async function liveHeartbeat(){
  if(document.hidden||!liveGame||currentView!==liveGame)return;
  try{const d=await api('/api/live/heartbeat',{method:'POST',body:JSON.stringify({game:liveGame})});renderLiveFloor(liveGame,d.members||[])}catch{}
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
  liveHeartbeatTimer=setInterval(liveHeartbeat,6000);livePollTimer=setInterval(()=>{if(!document.hidden)refreshLiveFloor(true)},1800);
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
function fx(kind='click'){
  try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;fx.ctx=fx.ctx||new C();const c=fx.ctx,o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type=(kind==='win'||kind==='jackpot')?'triangle':'sine';o.frequency.value=kind==='spin'?190:kind==='stop'?360:kind==='jackpot'?1040:kind==='win'?780:280;g.gain.value=kind==='jackpot'?.045:.025;o.start();g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+(kind==='jackpot'?.48:kind==='win'?.22:.07));o.stop(c.currentTime+(kind==='jackpot'?.48:kind==='win'?.22:.07));if(kind==='jackpot'){[1.25,1.5].forEach((m,i)=>{const oo=c.createOscillator(),gg=c.createGain();oo.connect(gg);gg.connect(c.destination);oo.type='triangle';oo.frequency.value=1040*m;gg.gain.value=.018;oo.start(c.currentTime+i*.07);gg.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.5+i*.07);oo.stop(c.currentTime+.52+i*.07)})}}catch{}
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
$('#loginForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api('/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});me=d.user;bootMain();}catch(err){$('#authMsg').textContent=err.message}};
$('#registerForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api('/api/register',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});me=d.user;bootMain();}catch(err){$('#authMsg').textContent=err.message}};
async function boot(){try{const d=await api('/api/me');me=d.user;bootMain();}catch{$('#authScreen').classList.remove('hidden')}}
function bootMain(){
  $('#authScreen').classList.add('hidden');$('#mainApp').classList.remove('hidden');updateHeader();bindMain();connectEvents();
  const q=new URLSearchParams(location.search),rid=q.get('room'),game=q.get('game');
  if(rid&&['holdem','yut'].includes(game)){go(game).then(()=>joinRoom(game,rid));}else if(rid&&game==='baccarat'){go('baccarat').then(()=>joinBaccaratRoom(rid));}else{go('lobby');setTimeout(resumeMyRoom,450);}
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js?v=190').catch(()=>{});
  if(!localStorage.getItem('jgc_help_seen_19'))setTimeout(()=>openHelp('lobby'),550);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentRoomId)loadCurrentRoom(true).catch(()=>{})});
}
let mainBound=false;
function bindMain(){if(mainBound)return;mainBound=true;
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
  $('#dailyBtn').onclick=claimDaily;$('#refreshRank').onclick=loadLobby;$('#profileBtn').onclick=openProfile;$('#closeProfile').onclick=()=>$('#profileSheet').classList.add('hidden');$('#profileSheet').onclick=e=>{if(e.target.id==='profileSheet')$('#profileSheet').classList.add('hidden')};$('#logoutBtn').onclick=logout;
  $('#refreshHoldem').onclick=()=>loadRooms('holdem');$('#refreshYut').onclick=()=>loadRooms('yut');$('#refreshBaccarat')?.addEventListener('click',()=>loadBaccaratRooms());$('#createHoldem').onclick=()=>createRoom('holdem');$('#createYut').onclick=()=>createRoom('yut');$('#createBaccarat')?.addEventListener('click',createBaccaratRoom);$('#yutMode')?.addEventListener('change',syncYutMode);$('#horseBetType')?.addEventListener('change',syncHorseBetUI);$('#horseStartBtn')?.addEventListener('click',startHorseRace);
  $('#bigWheelSpinBtn')?.addEventListener('click',()=>spinBigWheel(false));$$('[data-wheel-auto]').forEach(b=>b.addEventListener('click',()=>runBigWheelAuto(Number(b.dataset.wheelAuto))));$('#bigWheelAutoStop')?.addEventListener('click',()=>{bigWheelAutoStop=true});$$('[data-wheel-bet]').forEach(b=>b.addEventListener('click',()=>selectBigWheelBet(b.dataset.wheelBet)));$('#sicboRollBtn')?.addEventListener('click',()=>rollSicbo(false));$$('[data-sicbo-auto]').forEach(b=>b.addEventListener('click',()=>runSicboAuto(Number(b.dataset.sicboAuto))));$('#sicboAutoStop')?.addEventListener('click',()=>{sicboAutoStop=true});$$('[data-sicbo-bet]').forEach(b=>b.addEventListener('click',()=>selectSicboBet(b.dataset.sicboBet)));
  $('#spinBtn').addEventListener('click',()=>spin({manual:true}));$('#slotBetInput')?.addEventListener('input',e=>syncSlotBetInput(e.target));$('#slotBetInput')?.addEventListener('change',e=>normalizeSlotBetInput(e.target));$$('[data-auto-spin]').forEach(b=>b.addEventListener('click',()=>runAutoSpins(Number(b.dataset.autoSpin))));$('#autoStopBtn')?.addEventListener('click',()=>{autoSpinStop=true;$('#autoSpinStatus').textContent='중지 요청...'});$('#slotSessionReset')?.addEventListener('click',resetSlotSession);$('#jackpotContinueBtn')?.addEventListener('click',closeSlotJackpot);document.addEventListener('visibilitychange',()=>{if(document.hidden&&autoSpinRunning){autoSpinStop=true;if($('#autoSpinStatus'))$('#autoSpinStatus').textContent='화면 전환으로 자동 중지';}});$('#tourneyCard')?.addEventListener('click',()=>toast('토너먼트는 다음 업데이트에서 오픈 예정이야.'));
  const betRoot=$('#betRow');if(betRoot&&!betRoot.children.length)for(const b of [1000,5000,10000,25000,50000,100000]){const el=document.createElement('button');el.type='button';el.className='bet-chip'+(b===selectedBet?' active':'');el.textContent=money(b);el.onclick=()=>{selectedBet=b;if($('#slotBetInput'))$('#slotBetInput').value=b;$$('.bet-chip').forEach(x=>x.classList.remove('active'));el.classList.add('active');updateCurrentBetLabel();fx()};betRoot.appendChild(el)}
  $('#helpBtn').onclick=()=>openHelp(currentView);$('#closeHelp').onclick=closeHelp;$('#helpDone').onclick=()=>{localStorage.setItem('jgc_help_seen_19','1');closeHelp()};$('.help-backdrop').onclick=closeHelp;$$('[data-open-help]').forEach(b=>b.onclick=e=>{e.stopPropagation();openHelp(b.dataset.openHelp)});$$('[data-help-tab]').forEach(b=>b.onclick=()=>setHelpTab(b.dataset.helpTab));
  $$('[data-mode-game]').forEach(b=>b.onclick=()=>switchMode(b.dataset.modeGame,b.dataset.mode));
  $('#startSoloHoldem').onclick=startSoloHoldem;$('#startSoloYut').onclick=startSoloYut;$('#startSeotda').onclick=startSeotda;$('#startGostop').onclick=startGostop;$('#startSevenPoker')?.addEventListener('click',startSevenPoker);$('#sevenAutoNext')?.addEventListener('change',e=>localStorage.setItem('seven_auto',e.target.checked?'1':'0'));$('#networkRetryBtn')?.addEventListener('click',mobileResumeSync);
  bindQuickWagers();
  if($('#adminSearchBtn'))$('#adminSearchBtn').onclick=()=>loadAdmin($('#adminSearch').value.trim());
  if($('#adminRefreshBtn'))$('#adminRefreshBtn').onclick=()=>{if($('#adminSearch'))$('#adminSearch').value='';loadAdmin('')};
  if($('#adminSearch'))$('#adminSearch').addEventListener('keydown',e=>{if(e.key==='Enter')loadAdmin(e.currentTarget.value.trim())});
  initSlotMachine(true);renderSlotSession();
}
function normalizeWagerInput(target,min=5000,max=100000){const el=typeof target==='string'?document.getElementById(target):target;if(!el)return 0;let v=Math.floor(Number(el.value||min)/1000)*1000;v=Math.max(min,Math.min(max,v));el.value=v;const group=document.querySelector(`[data-wager-group="${el.id}"]`);if(group)$$('[data-set-wager]',group).forEach(b=>b.classList.toggle('active',Number(b.dataset.setWager)===v));return v}
function bindQuickWagers(){$$('[data-wager-group]').forEach(group=>{if(group.dataset.bound)return;group.dataset.bound='1';const target=document.getElementById(group.dataset.wagerGroup);$$('[data-set-wager]',group).forEach(b=>b.addEventListener('click',()=>{if(!target)return;target.value=Number(b.dataset.setWager);$$('[data-set-wager]',group).forEach(x=>x.classList.toggle('active',x===b));fx()}));target?.addEventListener('change',()=>normalizeWagerInput(target));});}
function setHelpTab(tab='lobby'){const ok=['lobby','slot','holdem','sevenpoker','baccarat','yut','seotda','gostop','horse','bigwheel','sicbo'];if(!ok.includes(tab))tab='lobby';$$('[data-help-tab]').forEach(b=>b.classList.toggle('active',b.dataset.helpTab===tab));$$('[data-help-page]').forEach(p=>p.classList.toggle('active',p.dataset.helpPage===tab))}
function openHelp(tab=currentView){setHelpTab(tab);$('#helpModal').classList.remove('hidden');document.body.classList.add('modal-open')}
function closeHelp(){$('#helpModal').classList.add('hidden');document.body.classList.remove('modal-open')}
function switchMode(game,mode){$$(`[data-mode-game="${game}"]`).forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$(`#${game}MultiArea`)?.classList.toggle('hidden',mode!=='multi');$(`#${game}SoloArea`)?.classList.toggle('hidden',mode!=='solo');if(mode==='solo'){if(game==='holdem')loadSoloHoldem();else if(game==='yut')loadSoloYut()}else loadRooms(game)}
function connectEvents(){if(events)events.close();events=new EventSource('/api/events');events.onopen=()=>setNetworkState('online');events.onerror=()=>setNetworkState(navigator.onLine?'degraded':'offline');events.addEventListener('refresh',()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{try{const d=await api('/api/me');me=d.user;updateHeader();if(liveGame&&currentView===liveGame)refreshLiveFloor(true);if(currentRoomId)await loadCurrentRoom();else if(currentView==='lobby')await loadLobby(false);else if(currentView==='holdem'&&!$('#holdemMultiArea').classList.contains('hidden'))await loadRooms('holdem');else if(currentView==='yut'&&!$('#yutMultiArea').classList.contains('hidden'))await loadRooms('yut');else if(currentView==='baccarat'&&!currentRoomId)await loadBaccaratRooms(true);else if(currentView==='admin'&&me?.is_admin)await loadAdmin($('#adminSearch')?.value.trim()||'',false)}catch{}},180)})}
function updateHeader(){if(!me)return;$('#walletBalance').textContent=money(me.balance);$('#avatarEmoji').innerHTML=avatarImg(me.avatar,me.nickname,'header-face',me.cosmetics);$('#nickName').textContent=me.nickname;const title=equippedTitle(me.cosmetics);$('#profileBtn')?.setAttribute('data-title',title);$('#dailyBtn').disabled=!me.dailyAvailable;$('#dailyBtn').textContent=me.dailyAvailable?'🎁 출석 +50,000 G':'✓ 오늘 출석 완료';$('#adminBtn')?.classList.toggle('hidden',!me.is_admin);applyCosmetics()}
async function refreshMe(){const d=await api('/api/me');me=d.user;updateHeader();$('#onlineCount').textContent='ONLINE '+d.online;return d}
async function go(view){
  if(view==='admin'&&!me?.is_admin){toast('관리자 권한이 필요합니다.');return}
  if(currentRoomId&&view!==currentGame){toast('먼저 멀티 게임방에서 나가기를 눌러줘.');return}
  const prevView=currentView;currentView=view;$$('.view').forEach(v=>v.classList.remove('active'));$('#view-'+view)?.classList.add('active');window.scrollTo({top:0,behavior:'smooth'});
  if(LIVE_GAME_VIEWS.has(view))startLiveFloor(view);else if(LIVE_GAME_VIEWS.has(prevView)||liveGame)stopLiveFloor();
  if(view==='lobby')await loadLobby();if(view==='shop')await loadShop();if(view==='slot')initSlotMachine();if(view==='holdem')await loadRooms('holdem');if(view==='sevenpoker')await loadSevenPoker();if(view==='baccarat')await loadBaccaratRooms();if(view==='yut')await loadRooms('yut');if(view==='ledger')await loadLedger();if(view==='seotda')await loadSeotda();if(view==='gostop')await loadGostop();if(view==='horse'){if(horseCardData)renderHorseCard({keepResult:true});else if(horseLastResult)renderHorseLastResult(horseLastResult);else await loadHorseCard();}if(view==='bigwheel')initBigWheel();if(view==='sicbo')initSicbo();if(view==='admin')await loadAdmin('');
}
async function loadLobby(full=true){try{await refreshMe();const d=await api('/api/leaderboard');$('#leaderboard').innerHTML=d.rows.map((r,i)=>`<div class="rank-row"><div class="rank-no">${i+1}</div><div class="rank-name">${avatarImg(r.avatar,r.nickname,'rank-face',r.cosmetics)}<span><b>${html(r.nickname)}</b>${equippedTitle(r.cosmetics)?`<small>${html(equippedTitle(r.cosmetics))}</small>`:''}</span></div><div class="rank-money">${money(r.balance)}</div></div>`).join('')||'<div class="empty">아직 랭킹이 없습니다.</div>';$('#myStats').innerHTML=`<div class="stat"><span>홀덤 승리</span><b>${me.poker_wins}</b></div><div class="stat"><span>세븐포커 승리</span><b>${me.seven_wins||0}/${me.seven_games||0}</b></div><div class="stat"><span>바카라 승리</span><b>${me.baccarat_wins||0}/${me.baccarat_games||0}</b></div><div class="stat"><span>바카라 손익</span><b>${signedMoney(me.baccarat_profit||0)}</b></div><div class="stat"><span>윷놀이 승리</span><b>${me.yut_wins}</b></div><div class="stat"><span>섯다 승리</span><b>${me.seotda_wins||0}</b></div><div class="stat"><span>고스톱 승리</span><b>${me.gostop_wins||0}</b></div><div class="stat"><span>슬롯 스핀</span><b>${me.slot_spins}</b></div><div class="stat"><span>슬롯 손익</span><b>${signedMoney(me.slot_profit)}</b></div><div class="stat"><span>경마 적중</span><b>${me.horse_wins||0}/${me.horse_races||0}</b></div><div class="stat"><span>경마 손익</span><b>${signedMoney(me.horse_profit||0)}</b></div><div class="stat"><span>빅휠 적중</span><b>${me.bigwheel_wins||0}/${me.bigwheel_plays||0}</b></div><div class="stat"><span>빅휠 손익</span><b>${signedMoney(me.bigwheel_profit||0)}</b></div><div class="stat"><span>다이사이 적중</span><b>${me.sicbo_wins||0}/${me.sicbo_plays||0}</b></div><div class="stat"><span>다이사이 손익</span><b>${signedMoney(me.sicbo_profit||0)}</b></div>`}catch(e){if(full)toast(e.message)}}
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
    <div class="shop-stat-strip"><div><b>${all.length}</b><span>전체 아이템</span></div><div><b>${characterCount}</b><span>프리미엄 캐릭터</span></div><div><b>${frameCount}</b><span>구매 가능 테두리</span></div><div><b>${shopData.ownedCount||0}</b><span>내 컬렉션</span></div></div>
    <div class="shop-toolbar panel"><div class="shop-tabs">${Object.entries(SHOP_CATEGORY_LABELS).map(([k,v])=>`<button type="button" data-shop-category="${k}" class="${shopCategory===k?'active':''}">${v}</button>`).join('')}</div><label class="owned-toggle"><input id="shopOwnedOnly" type="checkbox" ${shopOwnedOnly?'checked':''}><span>보유 아이템만</span></label></div>
    ${shopCategory==='character'?`<div class="character-filter panel"><div><small>CHARACTER COLLECTION</small><b>대표 캐릭터를 골라봐</b></div><div class="character-gender-tabs"><button type="button" data-char-gender="all" class="${shopCharacterGender==='all'?'active':''}">ALL</button><button type="button" data-char-gender="M" class="${shopCharacterGender==='M'?'active':''}">MAN</button><button type="button" data-char-gender="F" class="${shopCharacterGender==='F'?'active':''}">WOMAN</button></div></div>`:''}
    <div class="shop-grid">${items.map(x=>`<article class="shop-item panel rarity-${x.rarity} ${x.equipped?'equipped':''} ${x.featured?'featured-item':''}"><div class="shop-item-top"><span class="rarity">${SHOP_RARITY_LABELS[x.rarity]||x.rarity}</span>${x.featured?'<b class="prestige-badge">1 BILLION</b>':x.equipped?'<b class="equipped-badge">EQUIPPED</b>':x.owned?'<b class="owned-badge">OWNED</b>':''}</div>${shopPreview(x)}<div class="shop-item-copy"><small>${html(SHOP_CATEGORY_LABELS[x.category]||x.category)}</small><h3>${html(x.name)}</h3><p>${html(x.desc)}</p></div><div class="shop-item-foot"><div class="shop-price"><small>PRICE</small><b>${money(x.price)}</b></div>${x.equipped?`<button class="ghost" data-shop-unequip="${x.category}" type="button">장착 해제</button>`:x.owned?`<button class="primary" data-shop-equip="${x.id}" data-shop-slot="${x.category}" type="button">장착하기</button>`:`<button class="secondary buy-luxury" data-shop-buy="${x.id}" type="button">구매하기</button>`}</div></article>`).join('')||'<div class="empty panel">조건에 맞는 아이템이 없어.</div>'}</div>
  </div>`;
  $$('[data-shop-category]',root).forEach(b=>b.onclick=()=>{shopCategory=b.dataset.shopCategory;if(shopCategory!=='character')shopCharacterGender='all';renderShop()});$$('[data-char-gender]',root).forEach(b=>b.onclick=()=>{shopCharacterGender=b.dataset.charGender;renderShop()});$('#shopOwnedOnly',root)?.addEventListener('change',e=>{shopOwnedOnly=e.target.checked;renderShop()});
  $$('[data-prestige-jump]',root).forEach(b=>b.onclick=()=>{shopCategory=b.dataset.prestigeJump;shopOwnedOnly=false;renderShop();window.scrollTo({top:420,behavior:'smooth'})});
  $$('[data-shop-buy]',root).forEach(b=>b.onclick=()=>buyShopItemUI(b.dataset.shopBuy,b));
  $$('[data-shop-equip]',root).forEach(b=>b.onclick=()=>equipShopItemUI(b.dataset.shopSlot,b.dataset.shopEquip,b));
  $$('[data-shop-unequip]',root).forEach(b=>b.onclick=()=>equipShopItemUI(b.dataset.shopUnequip,'',b));
}
async function loadShop(){try{const d=await api('/api/shop');shopData=d;me=d.user;updateHeader();renderShop()}catch(e){toast(e.message)}}
async function buyShopItemUI(itemId,btn){const item=shopData?.items?.find(x=>x.id===itemId);if(!item)return;if(Number(me.balance)<Number(item.price)){toast('게임머니가 부족해.');return}if(!confirm(`${item.name}을 ${money(item.price)}에 구매할까?\n구매한 아이템은 영구 보유해.`))return;btn.disabled=true;try{let d=await api('/api/shop/buy',{method:'POST',body:JSON.stringify({itemId})});me=d.user;shopData=d.state;updateHeader();toast(`🛍️ ${item.name} 구매 완료!`);d=await api('/api/shop/equip',{method:'POST',body:JSON.stringify({category:item.category,itemId:item.id})});me=d.user;shopData=d.state;updateHeader();renderShop();fx('win')}catch(e){toast(e.message);await loadShop()}finally{btn.disabled=false}}
async function equipShopItemUI(category,itemId,btn){if(btn)btn.disabled=true;try{const d=await api('/api/shop/equip',{method:'POST',body:JSON.stringify({category,itemId})});me=d.user;shopData=d.state;updateHeader();renderShop();toast(itemId?'장착 완료!':'장착 해제 완료')}catch(e){toast(e.message)}finally{if(btn)btn.disabled=false}}

async function openProfile(){
  await refreshMe();
  const cc=me.cosmetics?.collection||{name:'NEW MEMBER',icon:'◇'};
  $('#profileContent').innerHTML=`<div class="profile-big profile-deluxe">${avatarImg(me.avatar,me.nickname,'profile-style-face',me.cosmetics)}<h3>${html(me.nickname)} ${me.is_admin?'<span class="profile-admin-badge">ADMIN</span>':''}</h3>${equippedTitle(me.cosmetics)?`<div class="profile-title">${html(equippedTitle(me.cosmetics))}</div>`:''}<p>@${html(me.username)} · 가입 ${new Date(me.created_at).toLocaleDateString('ko-KR')}</p><div class="collection-chip">${cc.icon||'◇'} ${html(cc.name)} · ${me.cosmetics?.ownedCount||0} ITEMS</div><button id="openBoutiqueFromProfile" class="boutique-open-btn" type="button">🛍️ JUNJA BOUTIQUE · 캐릭터 & 아바타 꾸미기</button></div><div class="stat-grid"><div class="stat"><span>보유머니</span><b id="profileBalance">${money(me.balance)}</b></div><div class="stat"><span>홀덤 승리</span><b>${me.poker_wins}</b></div><div class="stat"><span>윷 승리</span><b>${me.yut_wins}</b></div><div class="stat"><span>섯다/고스톱</span><b>${me.seotda_wins||0}/${me.gostop_wins||0}</b></div></div>
  <div class="friend-transfer"><div class="friend-transfer-head"><div><small>FRIEND GIFT</small><h3>친구에게 게임머니 보내기</h3></div><span>내 보유머니 안에서만 전송</span></div><label>받는 친구 닉네임<div class="friend-lookup-row"><input id="friendNickname" maxlength="14" placeholder="친구 닉네임 정확히 입력" autocomplete="off"><button id="friendLookupBtn" class="secondary" type="button">친구 확인</button></div></label><div id="friendLookupResult" class="friend-lookup-result muted">닉네임을 확인하면 캐릭터가 표시돼.</div><label>보낼 금액<div class="friend-amount-row"><input id="friendSendAmount" class="no-spinner" type="number" min="1" step="1000" value="10000" inputmode="numeric"><button id="friendMaxBtn" class="ghost" type="button">MAX</button></div></label><div class="friend-quick-row"><button type="button" data-friend-amount="10000">1만</button><button type="button" data-friend-amount="50000">5만</button><button type="button" data-friend-amount="100000">10만</button><button type="button" data-friend-amount="500000">50만</button></div><button id="friendSendBtn" class="primary full" type="button" disabled>선택한 친구에게 보내기</button><p class="friend-transfer-note">전송은 즉시 반영되며 보내는 사람·받는 사람 양쪽 게임머니 내역에 기록돼. 게임머니는 현금 가치가 없어.</p></div>
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
  const nick=$('#friendNickname'),lookup=$('#friendLookupBtn'),amount=$('#friendSendAmount'),max=$('#friendMaxBtn'),send=$('#friendSendBtn');if(!nick||!lookup||!amount||!send)return;
  nick.addEventListener('input',()=>resetFriendTarget('닉네임이 바뀌었어. 다시 친구 확인을 눌러줘.'));
  lookup.onclick=async()=>{const q=nick.value.trim();if(!q){toast('받는 친구 닉네임을 입력해줘.');return}lookup.disabled=true;try{const d=await api('/api/member/lookup?nickname='+encodeURIComponent(q));friendTransferTarget=d.user;$('#friendLookupResult').className='friend-lookup-result ok';$('#friendLookupResult').innerHTML=`${avatarImg(d.user.avatar,d.user.nickname,'transfer-face',d.user.cosmetics)}<div><b>${html(d.user.nickname)}</b><small>이 친구가 맞는지 확인해줘.</small></div><span>✓ 확인됨</span>`;send.disabled=false;fx()}catch(e){resetFriendTarget('친구를 찾지 못했어. 닉네임을 다시 확인해줘.');toast(e.message)}finally{lookup.disabled=false}};
  $$('[data-friend-amount]').forEach(b=>b.onclick=()=>{amount.value=Math.min(Number(b.dataset.friendAmount),Number(me?.balance||0));fx()});
  max.onclick=()=>{amount.value=Math.max(0,Number(me?.balance||0));fx()};
  send.onclick=async()=>{
    if(friendTransferBusy||!friendTransferTarget)return;const n=Math.trunc(Number(amount.value));if(!Number.isFinite(n)||n<1){toast('보낼 금액을 입력해줘.');return}if(n>Number(me?.balance||0)){toast('현재 보유 게임머니보다 많이 보낼 수 없어.');return}
    const ok=confirm(`${friendTransferTarget.nickname}님에게 ${money(n)}를 보낼까?\n전송 후에는 자동 취소되지 않아.`);if(!ok)return;
    friendTransferBusy=true;send.disabled=true;send.textContent='보내는 중...';try{const d=await api('/api/wallet/transfer',{method:'POST',body:JSON.stringify({targetId:friendTransferTarget.id,amount:n})});me=d.user;updateHeader();$('#profileBalance').textContent=money(me.balance);toast(`🎁 ${friendTransferTarget.nickname}님에게 ${money(n)} 보냈어!`);amount.value=Math.min(10000,Number(me.balance||0));resetFriendTarget('전송 완료. 또 보내려면 친구를 다시 확인해줘.');nick.value='';fx('win')}catch(e){toast(e.message);send.disabled=false}finally{friendTransferBusy=false;send.textContent='선택한 친구에게 보내기'}
  };
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
    <div class="admin-quick-money credit"><span>빠른 지급</span><button type="button" data-admin-add="100000">+10만</button><button type="button" data-admin-add="1000000">+100만</button><button type="button" data-admin-add="10000000">+1,000만</button></div>
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
  $('#jackpotPayout').textContent=`${money(d.payout)} · x${isSeven?1000:500}`;
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
    await sleep((fast?62:150)+c*(fast?42:85));
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
    me=d.user;updateHeader();updateSlotSession(d);if(d.jackpot)showSlotJackpot(d);return d
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
function startRoomPolling(){stopRoomPolling();if(!currentRoomId)return;roomPollTimer=setInterval(()=>{if(!document.hidden&&currentRoomId)loadCurrentRoom(true).catch(()=>{})},1200)}
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
    return `<div class="turn-banner waiting"><strong>대기실 · READY ${room.readyCount||0}/${room.players.length}</strong><span>${room.players.length<2?'한 명 이상 더 입장해야 시작할 수 있어.':need?`${need}명이 아직 준비 전이야.`:'전원 READY · 방장이 시작할 수 있어!'}</span></div>`;
  }
  if(room.myTurn)return `<div class="turn-banner my-turn"><strong>🔥 지금 내 차례!</strong><span>아래 행동 버튼을 눌러 진행해.</span></div>`;
  return `<div class="turn-banner other-turn"><strong>⏳ ${html(room.turnNickname||'상대')} 차례</strong><span>상대 행동이 끝나면 자동으로 화면이 갱신돼.</span></div>`;
}
async function createRoom(game){try{
  const body=game==='holdem'?{game,buyIn:Number($('#holdemBuyIn').value),maxPlayers:Number($('#holdemMax').value)}:{game,buyIn:Number($('#yutBuyIn').value),maxPlayers:Number($('#yutMax').value),yutMode:$('#yutMode')?.value||'individual'};
  const d=await api('/api/rooms',{method:'POST',body:JSON.stringify(body)});currentRoomId=d.room.id;currentGame=game;lastRoomVersion=d.room.version||0;renderRoom(d.room);startRoomPolling();await refreshMe();toast(`방 코드 ${d.room.id} 생성 완료 · READY를 눌러줘`)
}catch(e){toast(e.message);if(/이미 다른 게임방/.test(e.message))resumeMyRoom()}}
async function loadRooms(game){if(currentRoomId)return loadCurrentRoom(true);try{
  const d=await api('/api/rooms?game='+game),root=$('#'+game+'Rooms');
  root.innerHTML=d.rooms.map(r=>`<div class="room-row deluxe-room-row"><div class="room-row-main"><h4>${html(r.name)} <span class="status ${r.status==='PLAYING'?'play':'wait'}">${r.status}</span></h4><p>코드 ${r.id} · ${r.players}/${r.maxPlayers}명 · ${money(r.buyIn)} ${game==='holdem'?`· BLIND ${money(r.smallBlind)}/${money(r.bigBlind)}`:`· ${html(r.yutModeLabel||'개인전')}`}</p><div class="room-mini-users">${(r.participants||[]).map(p=>`<span class="${p.ready?'ready':''}">${AVATAR_SAFE(p.avatar)} ${html(p.nickname)}${p.ready?' ✓':''}</span>`).join('')||'<span>아직 참가자 없음</span>'}</div></div><div class="room-row-actions"><b>${r.readyCount||0} READY</b><button class="secondary" data-join="${r.id}" ${r.status==='PLAYING'?'disabled':''} type="button">${r.status==='PLAYING'?'진행중':'입장'}</button></div></div>`).join('')||'<div class="empty">열린 방이 없어. 먼저 하나 만들어봐.</div>';
  $$('[data-join]',root).forEach(b=>b.onclick=()=>joinRoom(game,b.dataset.join));
}catch(e){toast(e.message)}}
function AVATAR_SAFE(n){const a=['🧑‍💼','😎','🧢','👑','🐯','🐻','🦊','🐼','🐸','🦁'];return a[Number(n||0)%a.length]}
async function joinRoom(game,id){try{const d=await api(`/api/rooms/${id}/join`,{method:'POST',body:'{}'});currentRoomId=id;currentGame=game;lastRoomVersion=d.room.version||0;renderRoom(d.room);startRoomPolling();await refreshMe();toast('입장 완료 · READY를 눌러줘')}catch(e){toast(e.message);if(/이미 다른 게임방/.test(e.message))resumeMyRoom()}}
async function loadCurrentRoom(silent=false){
  if(!currentRoomId||roomRefreshBusy)return;roomRefreshBusy=true;
  try{
    const d=await api(currentGame==='baccarat'?`/api/baccarat/rooms/${currentRoomId}`:`/api/rooms/${currentRoomId}`);if(!d.room)throw new Error('방을 찾을 수 없습니다.');
    const version=d.room.version||0;if(version!==lastRoomVersion||!silent){lastRoomVersion=version;renderRoom(d.room)}
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
function renderRoom(room){lastRoomVersion=room.version||lastRoomVersion;notifyRoomJoins(room);if(room.game==='holdem')renderHoldem(room);else if(room.game==='yut')renderYut(room);else if(room.game==='baccarat')renderBaccaratRoom(room)}
async function toggleReady(){if(!currentRoomId)return;try{const d=await api(`/api/rooms/${currentRoomId}/ready`,{method:'POST',body:'{}'});renderRoom(d.room)}catch(e){toast(e.message)}}
async function leaveRoom(){if(!currentRoomId)return;try{const endpoint=currentGame==='baccarat'?`/api/baccarat/rooms/${currentRoomId}/leave`:`/api/rooms/${currentRoomId}/leave`;await api(endpoint,{method:'POST',body:'{}'});const old=currentGame;currentRoomId=null;currentGame=null;lastRoomVersion=-1;stopRoomPolling();clearTimeout(baccaratAutoTimer);await refreshMe();if(old==='holdem'){$('#holdemRoom').classList.add('hidden');$('#holdemBrowser').classList.remove('hidden');loadRooms('holdem')}else if(old==='yut'){$('#yutRoom').classList.add('hidden');$('#yutBrowser').classList.remove('hidden');loadRooms('yut')}else if(old==='baccarat'){$('#baccaratRoom').classList.add('hidden');$('#baccaratBrowser').classList.remove('hidden');loadBaccaratRooms()}}catch(e){toast(e.message)}}
async function closeRoom(){if(!currentRoomId)return;if(!confirm('대기실/게임을 종료하고 참가자에게 보유 판돈을 환급할까?'))return;try{await api(`/api/rooms/${currentRoomId}/close`,{method:'POST',body:'{}'});const old=currentGame;currentRoomId=null;currentGame=null;lastRoomVersion=-1;stopRoomPolling();toast('방을 비웠어.');await refreshMe();if(old==='holdem'){$('#holdemRoom').classList.add('hidden');$('#holdemBrowser').classList.remove('hidden');loadRooms('holdem')}else{$('#yutRoom').classList.add('hidden');$('#yutBrowser').classList.remove('hidden');loadRooms('yut')}}catch(e){toast(e.message)}}
async function recoverRoom(){if(!currentRoomId)return;if(!confirm('게임 상태가 꼬였을 때만 사용해. 방을 강제 종료하고 판돈을 복구할까?'))return;try{await api(`/api/rooms/${currentRoomId}/recover`,{method:'POST',body:'{}'});const old=currentGame;currentRoomId=null;currentGame=null;lastRoomVersion=-1;stopRoomPolling();toast('게임방 복구 완료 · 로비로 돌아왔어.');await refreshMe();if(old==='holdem'){$('#holdemRoom').classList.add('hidden');$('#holdemBrowser').classList.remove('hidden');loadRooms('holdem')}else{$('#yutRoom').classList.add('hidden');$('#yutBrowser').classList.remove('hidden');loadRooms('yut')}}catch(e){toast(e.message)}}
async function startRoom(){try{const d=await api(`/api/rooms/${currentRoomId}/start`,{method:'POST',body:'{}'});renderRoom(d.room);await loadCurrentRoom()}catch(e){toast(e.message)}}
function roomToolbar(room){const host=room.hostId===me.id,mine=room.players.find(p=>p.userId===me.id),waiting=room.status==='WAITING';return `<div class="room-shell-head">${roomTurnBanner(room)}${roomParticipantChips(room)}</div><div class="room-toolbar"><div class="room-title"><h3>${html(room.name)}</h3><small>방 코드 <b>${room.id}</b> · 판돈 ${money(room.buyIn)} · ${room.players.length}/${room.maxPlayers}명</small></div><div class="toolbar-actions"><button class="secondary copy-code" type="button">코드 복사</button><button class="secondary copy-link" type="button">초대 링크</button>${waiting?`<button class="${mine?.ready?'ready-on':'primary'} ready-room" type="button">${mine?.ready?'✓ READY':'READY'}</button>`:''}${host&&waiting?`<button class="primary start-room" ${!room.allReady?'disabled':''} type="button">${room.allReady?'게임 시작':'전원 READY 대기'}</button><button class="danger close-room" type="button">대기실 비우기</button>`:''}${!waiting?'<button class="danger recover-room" type="button">오류 복구</button>':''}<button class="secondary leave-room" ${!waiting?'disabled title="진행 중에는 오류 복구를 이용해줘"':''} type="button">나가기</button></div></div>${reactionDockHtml()}`}
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
  $('#holdemBrowser').classList.add('hidden');const root=$('#holdemRoom');root.classList.remove('hidden');const h=room.hand,deal=pokerShouldDeal(room,h),result=h?.result?`<div class="result-banner">🏆 ${html(h.result.summary)} · POT ${money(h.result.pot)}</div>`:'';
  root.innerHTML=`${roomToolbar(room)}${result}<div class="table-wrap"><div class="poker-panel panel">${pokerTableHtml(room,h,false,deal)}${holdemActions(h)}</div><div class="side-panel">${pokerStatusPanel(h)}<div class="players-card panel"><div class="section-head"><div><small>PLAYERS</small><h3>참가자 ${room.players.length}/${room.maxPlayers}</h3></div></div><div class="member-list">${room.players.map(p=>`<div class="member poker-member">${pokerFaceHtml(p)}<span>${html(p.nickname)}${room.hostId===p.userId?' 👑':''}</span><b>${money(p.stack)}</b></div>`).join('')}</div></div>${privacyPanelHtml()}</div></div>`;
  bindRoomCommon(root,room);bindPokerPresets(root,h);
  $$('[data-poker]',root).forEach(b=>b.onclick=async()=>{const action=b.dataset.poker,raiseTo=Number($('#raiseTo',root)?.value||0);b.disabled=true;try{await api(`/api/rooms/${currentRoomId}/poker/action`,{method:'POST',body:JSON.stringify({action,raiseTo})});await loadCurrentRoom()}catch(e){toast(e.message);b.disabled=false}})
}
function holdemActions(h,solo=false){
  if(!h)return `<div class="action-bar"><span class="waiting-text">게임 시작을 기다리는 중...</span></div>`;
  if(h.phase==='complete')return solo?`<div class="action-bar"><button class="primary solo-next-hand" type="button">다음 핸드</button><button class="secondary solo-cashout" type="button">칩 정산 후 나가기</button></div>`:`<div class="action-bar"><span class="waiting-text">핸드 종료. 방장이 다음 게임을 시작할 수 있어.</span></div>`;
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
async function startSoloHoldem(){try{const d=await api('/api/solo/holdem/start',{method:'POST',body:JSON.stringify({buyIn:Number($('#soloHoldemBuyIn').value)})});me=d.user;updateHeader();renderSoloHoldem(d.room)}catch(e){toast(e.message)}}
async function loadSoloHoldem(){try{const d=await api('/api/solo/holdem');if(d.room)renderSoloHoldem(d.room);else{$('#holdemSoloStart').classList.remove('hidden');$('#holdemSoloRoom').classList.add('hidden')}}catch(e){toast(e.message)}}
function renderSoloHoldem(room){
  $('#holdemSoloStart').classList.add('hidden');const root=$('#holdemSoloRoom');root.classList.remove('hidden');const h=room.hand,deal=pokerShouldDeal(room,h),result=h?.result?`<div class="result-banner">${html(h.result.summary)} · POT ${money(h.result.pot)}</div>`:'';
  root.innerHTML=`<div class="solo-toolbar"><div><small>AI HEADS UP · SOLO MODE</small><h3>${pokerFaceHtml(room.players.find(p=>p.userId===me.id))}<span>${html(me.nickname)}</span><i>VS</i>${pokerFaceHtml(room.players.find(p=>p.bot))}<span>J-BOT</span></h3></div><button class="secondary solo-cashout" type="button">칩 정산 후 나가기</button></div>${result}<div class="table-wrap solo-table-wrap"><div class="poker-panel panel">${pokerTableHtml(room,h,true,deal)}${h?.turnUserId===me.id?'<div class="solo-turn-banner">🔥 내 차례 · 행동을 선택해</div>':h?.phase!=='complete'?'<div class="solo-turn-banner bot">🤖 J-BOT 생각 중...</div>':''}${holdemActions(h,true)}</div><div class="side-panel">${pokerStatusPanel(h)}<div class="panel solo-help-mini"><small>AI 홀덤</small><b>혼자 바로 플레이</b><p>패 분배 애니메이션, 현재 족보, ½ POT·MAX 레이즈를 지원해. 핸드 종료 후 ‘다음 핸드’로 계속 플레이.</p></div></div></div>`;
  bindPokerPresets(root,h);
  $$('[data-poker]',root).forEach(b=>b.onclick=async()=>{b.disabled=true;try{const d=await api('/api/solo/holdem/action',{method:'POST',body:JSON.stringify({action:b.dataset.poker,raiseTo:Number($('#raiseTo',root)?.value||0)})});renderSoloHoldem(d.room)}catch(e){toast(e.message);b.disabled=false}});
  $('.solo-next-hand',root)?.addEventListener('click',async()=>{try{const d=await api('/api/solo/holdem/next',{method:'POST',body:'{}'});renderSoloHoldem(d.room)}catch(e){toast(e.message)}});
  $$('.solo-cashout',root).forEach(b=>b.onclick=async()=>{try{const d=await api('/api/solo/holdem/leave',{method:'POST',body:'{}'});me=d.user;updateHeader();toast(`정산 ${money(d.cashout)}`);pokerSceneCache.delete(room.id);$('#holdemSoloRoom').classList.add('hidden');$('#holdemSoloStart').classList.remove('hidden')}catch(e){toast(e.message)}})
}

// YUT MULTI
const YUT_NODE_POS={
  START:[90,90],O1:[90,74],O2:[90,58],O3:[90,42],O4:[90,26],O5:[90,10],
  O6:[74,10],O7:[58,10],O8:[42,10],O9:[26,10],O10:[10,10],
  O11:[10,26],O12:[10,42],O13:[10,58],O14:[10,74],O15:[10,90],
  O16:[26,90],O17:[42,90],O18:[58,90],O19:[74,90],O20:[82,90],
  A1:[75,25],A2:[63,37],C:[50,50],A4:[37,63],A5:[25,75],
  B1:[25,25],B2:[37,37],B4:[63,63],B5:[75,75],FINISH:[90,90]
};
function yutPhysicalClient(p){if(!p)return'START';if(p.node==='CA'||p.node==='CB')return'C';return p.node||'START'}
function yutSticksHtml(sticks,throwing=false){const vals=Array.isArray(sticks)&&sticks.length===4?sticks:[1,0,1,0];return `<div class="yut-toss-scene ${throwing?'throwing':''}"><div class="yut-shadow"></div><div class="yut-sticks">${vals.map((v,i)=>`<div class="yut-stick ${v===0?'back-face':'flat-face'}" style="--i:${i}"><span>${v===0?'●':''}</span></div>`).join('')}</div></div>`}
function syncYutMode(){const mode=$('#yutMode')?.value||'individual',max=$('#yutMax');if(!max)return;if(mode==='2v2'){max.value='4';max.disabled=true}else if(mode==='3v3'){max.value='6';max.disabled=true}else max.disabled=false}
function yutSideForMe(y){return y?.sides?.find(s=>(s.playerIds||[]).includes(me.id))}
function yutPiecesAt(y,node){const out=[];for(const side of (y?.sides||[])){const idx=[];side.pieces.forEach((p,i)=>{if(yutPhysicalClient(p)===node)idx.push(i)});if(idx.length)out.push({side,idx})}return out}
function yutNodePieces(y,node){return yutPiecesAt(y,node).map(g=>`<div class="yut-stack" style="--pc:${g.side.color}"><span>${g.side.id==='A'?'🐉':g.side.id==='B'?'🐯':'●'}</span><b>${g.idx.length>1?'×'+g.idx.length:g.idx[0]+1}</b></div>`).join('')}
function yutBoardHtml(room,y){const nodes=Object.entries(YUT_NODE_POS).filter(([k])=>!['START','FINISH'].includes(k)).map(([node,[x,yy]])=>`<div class="yut-node ${['O5','O10','O15','C'].includes(node)?'corner':''}" style="--x:${x}%;--y:${yy}%"><span class="node-num">${node==='C'?'★':node.replace('O','')}</span><div class="node-pieces">${yutNodePieces(y,node)}</div></div>`).join('');const startCounts=(y?.sides||[]).map(s=>`<span style="--pc:${s.color}">${html(s.label)} ${(s.pieces||[]).filter(p=>yutPhysicalClient(p)==='START').length}</span>`).join('');const finishCounts=(y?.sides||[]).map(s=>`<span style="--pc:${s.color}">${html(s.label)} ${(s.pieces||[]).filter(p=>yutPhysicalClient(p)==='FINISH').length}/4</span>`).join('');return `<div class="yut-board-pro true-yut-board"><svg class="yut-path-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M90 90 L90 10 L10 10 L10 90 L90 90"/><path d="M90 10 L50 50 L10 90"/><path d="M10 10 L50 50 L90 90"/></svg><div class="board-title"><b>JUNJA YUT ARENA</b><span>정통 지름길 · 업기 · 잡기</span></div><div class="start-zone"><b>START</b>${startCounts}</div><div class="finish-zone"><b>FINISH</b>${finishCounts}</div>${nodes}</div>`}
function yutMoveChips(pending,sel,attr){return `<div class="yut-move-chips">${(pending||[]).map((m,i)=>`<button class="${i===sel?'active':''}" ${attr}="${i}" type="button">${m.name}<small>${m.move}칸</small></button>`).join('')}</div>`}
function yutPieceButtons(side,sel,attr){if(!side)return'';return `<div class="piece-picker pro">${side.pieces.map((p,i)=>{const pos=yutPhysicalClient(p),same=pos==='START'?1:side.pieces.filter(x=>yutPhysicalClient(x)===pos).length;return `<button ${attr}="${i}" ${pos==='FINISH'?'disabled':''} type="button"><span class="piece-avatar">${side.id==='A'?'🐉':side.id==='B'?'🐯':me.avatarEmoji}</span><b>말 ${i+1}${same>1?' · 업기×'+same:''}</b><small>${pos}</small></button>`}).join('')}</div>`}
function renderYut(room){
  $('#yutBrowser').classList.add('hidden');const root=$('#yutRoom');root.classList.remove('hidden');const y=room.yut,cur=y?.phase==='playing'?room.players[y.turnIndex%room.players.length]:null,isTurn=cur?.userId===me.id,mySide=yutSideForMe(y);let control='';
  if(!y)control=`${yutSticksHtml(null)}<h3>${html(room.yutModeLabel||'개인전')}</h3><p>방장이 시작하면 정통 윷판에서 경기해.</p>`;
  else if(y.phase==='complete'){const w=y.sides.find(s=>s.id===y.winnerSideId);control=`<div class="victory-crown">👑</div><div class="big-yut">${html(w?.label||'승리')}</div><h3>우승!</h3>`}
  else if(isTurn&&y.awaitingThrow)control=`${yutSticksHtml(y.last?.sticks)}<div class="big-yut">내 차례</div><p>${y.pending.length?'윷/모 보너스 던지기!':'윷가락을 던져줘.'}</p><button class="primary yut-throw" type="button">🪵 윷가락 던지기</button>`;
  else if(isTurn&&y.pending?.length){selectedYutMoveIndex=Math.min(selectedYutMoveIndex,y.pending.length-1);control=`${yutSticksHtml(y.last?.sticks)}<div class="big-yut result-name">말 이동</div>${yutMoveChips(y.pending,selectedYutMoveIndex,'data-yut-move')}<p>사용할 결과를 고르고 움직일 말을 선택해.</p>${yutPieceButtons(mySide,selectedYutMoveIndex,'data-piece')}`}
  else control=`${yutSticksHtml(y.last?.sticks)}<div class="big-yut">${html(y.last?.name||'대기')}</div><p>${cur?`${cur.avatarEmoji} ${html(cur.nickname)} 차례`:''}</p>`;
  const teams=(y?.sides||[]).map(s=>`<div class="yut-team-card" style="--pc:${s.color}"><b>${html(s.label)}</b><span>${s.playerIds.map(id=>room.players.find(p=>p.userId===id)?.nickname||'?').map(html).join(' · ')}</span><small>완주 ${s.pieces.filter(p=>yutPhysicalClient(p)==='FINISH').length}/4</small></div>`).join('');
  root.innerHTML=`${roomToolbar(room)}<div class="yut-team-strip">${teams}</div><div class="yut-layout yut-layout-pro"><div class="yut-game panel">${yutBoardHtml(room,y)}</div><div class="side-panel yut-side"><div class="throw-control panel">${control}</div><div class="panel yut-rule-panel"><b>정통 룰 적용</b><span>같은 팀 말은 같은 지점에서 업혀 함께 이동</span><span>O5·O10 코너에 정확히 서면 대각선 지름길</span><span>상대 말 잡기 / 윷 / 모 = 추가 던지기</span></div>${privacyPanelHtml()}</div></div>`;
  bindRoomCommon(root,room);$$('[data-yut-move]',root).forEach(b=>b.onclick=()=>{selectedYutMoveIndex=Number(b.dataset.yutMove);renderYut(room)});$('.yut-throw',root)?.addEventListener('click',async()=>{const btn=$('.yut-throw',root);btn.disabled=true;$('.yut-toss-scene',root)?.classList.add('throwing');fx('spin');try{const d=await api(`/api/rooms/${currentRoomId}/yut/throw`,{method:'POST',body:'{}'});await sleep(700);renderYut(d.room)}catch(e){toast(e.message);btn.disabled=false}});$$('[data-piece]',root).forEach(b=>b.onclick=async()=>{try{const d=await api(`/api/rooms/${currentRoomId}/yut/move`,{method:'POST',body:JSON.stringify({pieceIndex:Number(b.dataset.piece),moveIndex:selectedYutMoveIndex})});selectedYutMoveIndex=0;renderYut(d.room);await refreshMe()}catch(e){toast(e.message)}})
}
function soloYutAsMulti(g){return {sides:[{id:'U',label:'나',color:'#f6cf67',playerIds:[me.id],pieces:g.sides.user},{id:'B',label:'J-BOT',color:'#71a8ff',playerIds:[-1],pieces:g.sides.bot}]}}
function soloYutBoard(g){return yutBoardHtml({},soloYutAsMulti(g))}
async function startSoloYut(){try{const d=await api('/api/solo/yut/start',{method:'POST',body:JSON.stringify({bet:Number($('#soloYutBet').value)})});me=d.user;updateHeader();renderSoloYut(d.game)}catch(e){toast(e.message)}}
function renderSoloYut(g){$('#yutSoloStart').classList.add('hidden');const root=$('#yutSoloRoom');root.classList.remove('hidden');let control='';if(g.phase==='complete')control=`<div class="victory-crown">${g.winner==='user'?'🏆':'🤖'}</div><h2>${g.winner==='user'?'승리!':'J-BOT 승리'}</h2><button class="primary solo-yut-close" type="button">새 게임 준비</button>`;else if(g.turn==='user'&&g.awaitingThrow)control=`${yutSticksHtml(g.last?.sticks)}<h3>내 차례</h3><button class="primary solo-yut-throw" type="button">🪵 윷 던지기</button>`;else if(g.turn==='user'&&g.pending?.length){selectedSoloYutMoveIndex=Math.min(selectedSoloYutMoveIndex,g.pending.length-1);control=`${yutSticksHtml(g.last?.sticks)}${yutMoveChips(g.pending,selectedSoloYutMoveIndex,'data-solo-yut-move')}${yutPieceButtons({id:'U',pieces:g.sides.user},selectedSoloYutMoveIndex,'data-solo-yut-piece')}`}else control=`${yutSticksHtml(g.last?.sticks)}<h3>J-BOT 진행 중</h3>`;root.innerHTML=`<div class="solo-toolbar character-toolbar"><div><small>AI YUT · ${money(g.bet)}</small><h3>${avatarImg(me.avatar,me.nickname,'duel-face',me.cosmetics)} <span>${html(me.nickname)}</span> <i>VS</i> ${botFace('yut','duel-face')} <span>J-BOT</span></h3></div><button class="danger solo-yut-quit" type="button">게임 포기</button></div><div class="yut-layout yut-layout-pro"><div class="yut-game panel">${soloYutBoard(g)}</div><div class="throw-control panel">${control}<div class="score-strip"><span>내 완주 <b>${g.sides.user.filter(x=>yutPhysicalClient(x)==='FINISH').length}/4</b></span><span>BOT 완주 <b>${g.sides.bot.filter(x=>yutPhysicalClient(x)==='FINISH').length}/4</b></span></div></div></div>`;$$('[data-solo-yut-move]',root).forEach(b=>b.onclick=()=>{selectedSoloYutMoveIndex=Number(b.dataset.soloYutMove);renderSoloYut(g)});$('.solo-yut-throw',root)?.addEventListener('click',async()=>{try{$('.yut-toss-scene',root)?.classList.add('throwing');const d=await api('/api/solo/yut/throw',{method:'POST',body:'{}'});await sleep(650);renderSoloYut(d.game)}catch(e){toast(e.message)}});$$('[data-solo-yut-piece]',root).forEach(b=>b.onclick=async()=>{try{const d=await api('/api/solo/yut/move',{method:'POST',body:JSON.stringify({pieceIndex:Number(b.dataset.soloYutPiece),moveIndex:selectedSoloYutMoveIndex})});selectedSoloYutMoveIndex=0;if(d.user){me=d.user;updateHeader()}renderSoloYut(d.game)}catch(e){toast(e.message)}});$('.solo-yut-quit',root)?.addEventListener('click',async()=>{if(!confirm('포기하면 참가금은 돌아오지 않아. 포기할까?'))return;const d=await api('/api/solo/yut/quit',{method:'POST',body:'{}'});me=d.user;updateHeader();root.classList.add('hidden');$('#yutSoloStart').classList.remove('hidden')});$('.solo-yut-close',root)?.addEventListener('click',async()=>{await api('/api/solo/yut/quit',{method:'POST',body:'{}'}).catch(()=>{});root.classList.add('hidden');$('#yutSoloStart').classList.remove('hidden');await refreshMe()})}

// HORSE RACING
async function loadHorseCard({keepResult=false}={}){if(horseRacing)return;try{const d=await api('/api/horse/card');horseCardData=d.card;renderHorseCard({keepResult})}catch(e){toast(e.message)}}
function horseSelectedIds(){return [Number($('#horsePick1')?.value||0),Number($('#horsePick2')?.value||0)].filter(Boolean)}
function syncHorseBetUI(){if(!horseCardData)return;const type=$('#horseBetType')?.value||'win',p1=$('#horsePick1'),p2=$('#horsePick2');if(type==='win'&&p2)p2.value='';if(type!=='win'&&p2&&Number(p2.value)===Number(p1?.value))p2.value='';renderHorsePickGrid();renderHorseOdds();updateHorseStartState()}
function updateHorseStartState(){const type=$('#horseBetType')?.value||'win',ids=horseSelectedIds(),need=type==='win'?1:2,btn=$('#horseStartBtn');if(!btn)return;if(!horseCardData){btn.disabled=true;btn.textContent=horseLastResult?'✓ 결과 확인 후 ‘다음 경주표’':'경주표 불러오는 중...';return}const ready=!horseRacing&&ids.length===need;btn.disabled=!ready;btn.textContent=ready?'🏁 경주 시작':(need===1?'🏇 말 1마리를 선택해줘':'🏇 말 2마리를 차례로 선택해줘')}
function selectHorseOneTouch(id){if(horseRacing||!horseCardData)return;id=Number(id);const type=$('#horseBetType')?.value||'win',p1=$('#horsePick1'),p2=$('#horsePick2'),a=Number(p1?.value||0),b=Number(p2?.value||0);if(type==='win'){p1.value=String(id);if(p2)p2.value=''}else if(id===a){p1.value=b?String(b):'';if(p2)p2.value=''}else if(id===b){p2.value=''}else if(!a){p1.value=String(id)}else if(!b){p2.value=String(id)}else{p2.value=String(id)}renderHorsePickGrid();renderHorseOdds();updateHorseStartState();fx()}
function renderHorsePickGrid(){if(!horseCardData)return;const grid=$('#horsePickGrid');if(!grid)return;const type=$('#horseBetType')?.value||'win',p1=Number($('#horsePick1')?.value||0),p2=Number($('#horsePick2')?.value||0);grid.innerHTML=horseCardData.horses.map(h=>{const first=h.id===p1,second=type!=='win'&&h.id===p2,selected=first||second,order=first?'1':second?'2':'';return `<button class="horse-pick-card ${selected?'selected':''} ${first?'pick-first':''} ${second?'pick-second':''}" data-horse-pick="${h.id}" type="button" style="--hc:${h.color}" aria-pressed="${selected?'true':'false'}"><span class="horse-pick-no">${h.id}</span><span class="horse-pick-name">${html(h.name)}</span><small>WIN x${h.winOdds}</small>${order?`<b class="horse-pick-order">PICK ${order}</b>`:''}</button>`}).join('');$$('[data-horse-pick]',grid).forEach(b=>b.onclick=()=>selectHorseOneTouch(b.dataset.horsePick));const summary=$('#horsePickSummary'),hint=$('#horsePickHint'),ids=horseSelectedIds(),names=ids.map(id=>horseCardData.horses.find(h=>h.id===id)).filter(Boolean);if(summary)summary.innerHTML=names.length?names.map((h,i)=>`<span style="--hc:${h.color}"><b>${i+1} PICK</b> ${h.id}번 ${html(h.name)} · x${h.winOdds}</span>`).join(''):'선택한 말이 없습니다.';if(hint)hint.textContent=type==='win'?(names.length?'선택 완료 · 다른 말을 누르면 즉시 변경':'말 1마리를 눌러 선택'):(names.length<2?`${names.length+1}번째 말을 눌러 선택`:'두 마리 선택 완료 · 다른 말 클릭 시 2 PICK 변경')}
function horseSvg(h){return `<svg class="race-horse-svg" viewBox="0 0 170 90" aria-hidden="true"><g class="horse-shadow"><ellipse cx="84" cy="78" rx="55" ry="7"/></g><g class="horse-figure" style="--horse:${h.color}"><path class="horse-tail" d="M31 41 Q9 32 13 18 Q18 31 36 28"/><path class="horse-body-shape" d="M39 34 Q63 16 103 25 Q122 29 132 43 Q118 55 96 57 L59 56 Q43 53 34 44 Z"/><path class="horse-neck" d="M105 30 Q114 9 134 10 Q146 12 151 21 Q144 30 128 31 L120 47 Z"/><path class="horse-head" d="M132 10 Q151 2 161 14 L154 27 L137 29 L128 21 Z"/><circle class="horse-eye" cx="150" cy="14" r="2"/><path class="horse-mane" d="M119 18 L126 5 L132 18 L137 4 L141 19"/><g class="jockey"><circle cx="111" cy="13" r="7"/><path d="M103 20 L122 22 L116 39 L101 34 Z"/><path d="M106 34 L91 48"/><path d="M116 35 L128 47"/></g><g class="leg leg-a"><path d="M58 51 L49 72 L43 79"/></g><g class="leg leg-b"><path d="M72 53 L79 72 L88 79"/></g><g class="leg leg-c"><path d="M99 52 L92 72 L84 79"/></g><g class="leg leg-d"><path d="M111 49 L124 68 L132 74"/></g><path class="saddle" d="M75 25 Q93 19 107 28 L99 38 L78 37 Z"/></g></svg>`}
function renderHorseCard({keepResult=false}={}){if(!horseCardData)return;$('#horsePick1').value='';$('#horsePick2').value='';$('#horseTrack').querySelectorAll('.race-lane').forEach(x=>x.remove());horseCardData.horses.forEach(h=>{const lane=document.createElement('div');lane.className='race-lane';lane.innerHTML=`<span class="lane-num" style="--hc:${h.color}">${h.id}</span><div class="race-runner" data-horse="${h.id}" style="--hc:${h.color}"><div class="horse-name"><b>${html(h.name)}</b><small>WIN x${h.winOdds}</small></div><div class="horse-art">${horseSvg(h)}</div><div class="dust-cloud"><i></i><i></i><i></i></div></div>`;$('#horseTrack').appendChild(lane)});syncHorseBetUI();$('#raceOverlay').classList.remove('hidden');if(!keepResult||!horseLastResult)$('#horseResult').innerHTML='<div class="race-result-empty"><b>READY TO RACE</b><p>1~7번 말을 한 번만 눌러 선택해. 경주가 끝나면 내가 고른 말의 순위와 지급액이 이 화면에 계속 남아.</p></div>';else renderHorseLastResult(horseLastResult,{freshCard:true})}
function renderHorseOdds(){if(!horseCardData)return;const type=$('#horseBetType')?.value||'win',ids=horseSelectedIds(),a=horseCardData.horses.find(h=>h.id===ids[0]),b=horseCardData.horses.find(h=>h.id===ids[1]);let txt;if(type==='win')txt=a?`${a.id}번 ${html(a.name)} · 1위 예상 <b>x${a.winOdds}</b> · 2위 <b>50% 위로금</b>`:'1~7번 말 중 한 마리를 터치해줘.';else if(ids.length<2)txt=`${type==='quinella'?'복승':'쌍승'} · 서로 다른 말 2마리를 차례대로 터치해줘.`;else txt=`${type==='quinella'?'복승':'쌍승'} · <b>${a?.id}번 + ${b?.id}번</b> 선택 완료. 최종 배당은 서버에서 확정.`;$('#horseOdds').innerHTML=txt}
function horseProgressCurve(rank,elapsed,duration,seed){
  const t=Math.min(1,elapsed/duration),ease=1-Math.pow(1-t,1.16);
  const surge=Math.sin(Math.PI*t)*(6.8-rank*.55);
  const stride=Math.sin((elapsed/1000)*10+seed)*(1.1+rank*.06)*(1-t*.82);
  const midRace=(rank%2===0?1:-1)*Math.sin(Math.PI*Math.min(1,t*1.55))*2.1;
  return Math.max(0,Math.min(100,ease*100+surge+stride+midRace))
}
function renderHorseLastResult(x,{freshCard=false}={}){const root=$('#horseResult');if(!root||!x)return;const typeLabel=x.type==='win'?'단승':x.type==='quinella'?'복승':'쌍승',net=x.payout-x.bet,rankRows=x.picks.map((id,i)=>{const h=x.order.find(v=>v.id===id),card=x.cardHorses.find(v=>v.id===id);return `<div class="my-horse-rank ${h?.finish===1?'winner':h?.finish===2?'place':''}"><span>${i+1} PICK</span><b>${id}번 ${html(card?.name||h?.name||'')}</b><strong>${h?.finish||'-'}위</strong></div>`}).join('');root.innerHTML=`<div class="race-result-sticky ${x.payout>0?'paid':'miss'}"><div class="race-result-verdict"><small>${typeLabel} · 결과 확정</small><h2>${x.result.won?'🏆 적중':x.result.placeBonus?'🥈 2위 위로금':'RESULT'}</h2><p>이 결과는 다음 경주표를 받을 때까지 유지돼.</p></div><div class="my-horse-ranks">${rankRows}</div><div class="race-money-board"><div><span>베팅</span><b>${money(x.bet)}</b></div><div class="payout"><span>지급액</span><b>${money(x.payout)}</b></div><div class="${net>=0?'profit':'loss'}"><span>이번 경주 손익</span><b>${signedMoney(net)}</b></div></div><div class="horse-podium">${x.order.slice(0,3).map((h,i)=>`<div class="podium-row p${i+1}"><b>${i+1}위</b><span>${h.id}번 ${html(h.name)}</span></div>`).join('')}</div>${freshCard?'<div class="next-race-ready">✓ 새 경주표 준비 완료 · 왼쪽에서 말을 선택해</div>':'<button id="horseNextRaceBtn" class="secondary full next-race-btn" type="button">↻ 다음 경주표 받기</button>'}</div>`;$('#horseNextRaceBtn')?.addEventListener('click',async()=>{const b=$('#horseNextRaceBtn');b.disabled=true;b.textContent='경주표 준비 중...';await loadHorseCard({keepResult:true})})}
async function startHorseRace(){
  if(horseRacing||!horseCardData)return;
  const type=$('#horseBetType').value,ids=horseSelectedIds(),need=type==='win'?1:2;if(ids.length!==need){toast(need===1?'말 한 마리를 선택해줘.':'서로 다른 말 두 마리를 선택해줘.');return}const p1=ids[0],p2=ids[1]||0;
  const bet=Math.max(1000,Math.min(100000,Math.floor(Number($('#horseBet').value||1000)/1000)*1000));$('#horseBet').value=bet;
  horseRacing=true;const btn=$('#horseStartBtn');btn.disabled=true;btn.textContent='RACING...';$('#raceOverlay').classList.add('hidden');$('#horseResult').innerHTML='<div class="race-live-result"><i></i><b>LIVE RACE</b><span>선택한 말의 최종 순위와 지급액을 계산 중...</span></div>';
  $$('.race-runner').forEach(r=>{r.style.setProperty('--race-x','0px');r.classList.remove('finished');r.classList.add('running');r.querySelector('.finish-rank')?.remove()});
  const cardSnapshot=horseCardData.horses.map(h=>({id:h.id,name:h.name,winOdds:h.winOdds,color:h.color}));
  try{
    const d=await api('/api/horse/race',{method:'POST',body:JSON.stringify({type,picks:type==='win'?[p1]:[p1,p2],bet})});
    const order=d.order,baseDuration=5350,seeds=Object.fromEntries(order.map(h=>[h.id,Math.random()*8]));
    const rankGap=[0,620,1120,1580,2010,2420,2810],durations=Object.fromEntries(order.map((h,rank)=>[h.id,baseDuration+rankGap[rank]+Math.random()*100]));
    const track=$('#horseTrack'),runnerWidth=$('.race-runner')?.getBoundingClientRect().width||120,finishDistance=Math.max(220,(track?.clientWidth||700)*.89-runnerWidth*.64);
    const maxDuration=Math.max(...Object.values(durations)),start=performance.now(),finished=new Set();
    await new Promise(resolve=>{
      function frame(now){
        const e=now-start;
        order.forEach((h,rank)=>{
          const r=$(`.race-runner[data-horse="${h.id}"]`);if(!r)return;
          const p=horseProgressCurve(rank,e,durations[h.id],seeds[h.id]),x=finishDistance*Math.min(1,p/100);r.style.setProperty('--race-x',`${x.toFixed(2)}px`);
          if(e>=durations[h.id]&&!finished.has(h.id)){finished.add(h.id);r.classList.remove('running');r.classList.add('finished');r.insertAdjacentHTML('beforeend',`<span class="finish-rank">${rank+1}</span>`);fx(rank===0?'win':'stop')}
        });
        if(e<maxDuration+100)requestAnimationFrame(frame);else resolve()
      }requestAnimationFrame(frame)
    });
    $$('.race-runner').forEach(r=>r.classList.remove('running'));
    horseLastResult={type,picks:type==='win'?[p1]:[p1,p2],bet,payout:Number(d.result.payout||0),result:d.result,order,cardHorses:cardSnapshot,at:Date.now()};renderHorseLastResult(horseLastResult);
    me=d.user;updateHeader();if(d.result.won){confetti();fx('win')}else if(d.result.placeBonus)fx('win');horseCardData=null;
  }catch(e){toast(e.message);$$('.race-runner').forEach(r=>r.classList.remove('running'));if(horseCardData)renderHorseCard({keepResult:!!horseLastResult})}
  finally{horseRacing=false;updateHorseStartState()}
}
$('#horsePick1')?.addEventListener('change',renderHorseOdds);$('#horsePick2')?.addEventListener('change',renderHorseOdds);

// SEOTDA
function resetSeotdaUI(){if($('#seotdaTable')?.classList.contains('hidden'))$('#seotdaStart')?.classList.remove('hidden')}
const BIG_WHEEL_SEGMENTS=[...Array(10).fill({key:'x2',label:'×2',mult:2}),...Array(6).fill({key:'x3',label:'×3',mult:3}),...Array(4).fill({key:'x5',label:'×5',mult:5}),...Array(2).fill({key:'x10',label:'×10',mult:10}),{key:'x15',label:'×15',mult:15},{key:'junja',label:'JUNJA',mult:20}];
const BIG_WHEEL_COLORS=['#6d1422','#d5aa52','#153d35','#c43a39','#284777','#75509b'];
function selectBigWheelBet(key){if(bigWheelSpinning)return;bigWheelSelected=key;$$('[data-wheel-bet]').forEach(b=>b.classList.toggle('active',b.dataset.wheelBet===key));fx()}
function drawBigWheel(){const canvas=$('#bigWheelCanvas');if(!canvas)return;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,cx=w/2,cy=h/2,r=w*.455,n=BIG_WHEEL_SEGMENTS.length,step=Math.PI*2/n;ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(cx,cy);ctx.rotate(bigWheelAngle);for(let i=0;i<n;i++){const x=BIG_WHEEL_SEGMENTS[i],a0=-Math.PI/2+i*step,a1=a0+step,ci=['x2','x3','x5','x10','x15','junja'].indexOf(x.key);ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,r,a0,a1);ctx.closePath();ctx.fillStyle=BIG_WHEEL_COLORS[ci]||'#333';ctx.fill();ctx.strokeStyle='#f4d784';ctx.lineWidth=3;ctx.stroke();ctx.save();ctx.rotate(a0+step/2);ctx.translate(r*.71,0);ctx.rotate(Math.PI/2);ctx.fillStyle=x.key==='junja'?'#fff3a4':'#fff';ctx.font=`900 ${x.key==='junja'?27:32}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='#000';ctx.shadowBlur=8;ctx.fillText(x.label,0,0);ctx.restore()}ctx.beginPath();ctx.arc(0,0,r*.18,0,Math.PI*2);ctx.fillStyle='#090b15';ctx.fill();ctx.strokeStyle='#f4d784';ctx.lineWidth=9;ctx.stroke();ctx.restore()}
function initBigWheel(){drawBigWheel();selectBigWheelBet(bigWheelSelected);if($('#bigWheelResult'))$('#bigWheelResult').textContent='배당을 선택하고 휠을 돌려.'}
async function spinBigWheel(auto=false){if(bigWheelSpinning)return false;const input=$('#bigWheelBet'),bet=Math.max(1000,Math.min(100000,Math.floor(Number(input?.value||1000)/1000)*1000));if(input)input.value=bet;bigWheelSpinning=true;const btn=$('#bigWheelSpinBtn');btn.disabled=true;btn.textContent='WHEEL SPINNING...';$('#bigWheelResult').textContent='딜러가 휠을 돌렸습니다…';let ok=false;try{const d=await api('/api/bigwheel/spin',{method:'POST',body:JSON.stringify({bet,key:bigWheelSelected})}),idx=d.result.index,n=BIG_WHEEL_SEGMENTS.length,step=Math.PI*2/n,current=bigWheelAngle%(Math.PI*2),desired=-(idx*step+step/2),turns=7+Math.floor(Math.random()*2),target=current+(turns*Math.PI*2)+(((desired-current)%(Math.PI*2)+Math.PI*2)%(Math.PI*2));const start=performance.now(),from=bigWheelAngle,dur=auto?3600:5200;await new Promise(resolve=>{const frame=t=>{const p=Math.min(1,(t-start)/dur),ease=1-Math.pow(1-p,4);bigWheelAngle=from+(target-from)*ease;drawBigWheel();if(p<1)requestAnimationFrame(frame);else resolve()};requestAnimationFrame(frame)});bigWheelAngle=target;drawBigWheel();const r=d.result;$('#bigWheelResult').innerHTML=r.won?`<b class="wheel-win">🏆 ${html(r.landed.label)} 적중 · ${money(r.payout)}</b>`:`<b>${html(r.landed.label)} 당첨 · 다음 휠에 도전</b>`;me=d.user;updateHeader();if(r.won){fx('win');if(!auto)confetti()}ok=true}catch(e){toast(e.message);$('#bigWheelResult').textContent='오류가 발생했어. 다시 시도해줘.'}finally{bigWheelSpinning=false;btn.disabled=false;btn.textContent='SPIN THE WHEEL'}return ok}
async function runBigWheelAuto(count){if(bigWheelAutoRunning||bigWheelSpinning)return;bigWheelAutoRunning=true;bigWheelAutoStop=false;const stop=$('#bigWheelAutoStop'),status=$('#bigWheelAutoStatus');if(stop)stop.disabled=false;for(let i=0;i<count&&!bigWheelAutoStop;i++){if(document.hidden){bigWheelAutoStop=true;break}if(status)status.textContent=`${i+1}/${count}`;const ok=await spinBigWheel(true);if(!ok)break;await sleep(550)}bigWheelAutoRunning=false;if(stop)stop.disabled=true;if(status)status.textContent=bigWheelAutoStop?'중지됨':'완료'}
const DICE_PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function dieHtml(v){return Array.from({length:9},(_,i)=>`<i class="pip ${DICE_PIPS[v]?.includes(i)?'on':''}"></i>`).join('')}
function setDie(el,v){el.innerHTML=dieHtml(v);el.dataset.value=v}
function selectSicboBet(key){if(sicboRolling)return;sicboSelected=key;$$('[data-sicbo-bet]').forEach(b=>b.classList.toggle('active',b.dataset.sicboBet===key));fx()}
function initSicbo(){const totals=$('#sicboTotals');if(totals&&!totals.children.length){const mult={4:51,5:19,6:15,7:13,8:9,9:7,10:6,11:6,12:7,13:9,14:13,15:15,16:19,17:51};for(let n=4;n<=17;n++){const b=document.createElement('button');b.type='button';b.dataset.sicboBet=`total-${n}`;b.innerHTML=`<b>${n}</b><small>×${mult[n]}</small>`;b.onclick=()=>selectSicboBet(b.dataset.sicboBet);totals.appendChild(b)}}$$('#sicboDice .die').forEach((d,i)=>setDie(d,i+2));selectSicboBet(sicboSelected);if($('#sicboResult'))$('#sicboResult').textContent='베팅 칸을 고르고 ROLL DICE'}
async function rollSicbo(auto=false){if(sicboRolling)return false;const input=$('#sicboBet'),bet=Math.max(1000,Math.min(100000,Math.floor(Number(input?.value||1000)/1000)*1000));if(input)input.value=bet;sicboRolling=true;const btn=$('#sicboRollBtn');btn.disabled=true;btn.textContent='ROLLING...';const dice=$$('#sicboDice .die');dice.forEach((d,i)=>{d.classList.add('rolling');d.style.setProperty('--dx',`${(i-1)*18}px`)});let ticker=setInterval(()=>dice.forEach(d=>setDie(d,1+Math.floor(Math.random()*6))),90),ok=false;try{const d=await api('/api/sicbo/roll',{method:'POST',body:JSON.stringify({bet,key:sicboSelected})});await sleep(auto?950:1450);clearInterval(ticker);ticker=null;dice.forEach((el,i)=>{el.classList.remove('rolling');setDie(el,d.result.dice[i])});const r=d.result;$('#sicboResult').innerHTML=`<div class="sicbo-result-line"><span>${r.dice.join(' · ')} = <b>${r.total}</b>${r.triple?' · TRIPLE':''}</span><strong class="${r.won?'win':'lose'}">${r.won?'🏆 '+money(r.payout)+' 지급':'MISS'}</strong></div>`;me=d.user;updateHeader();if(r.won){fx('win');if(!auto&&(r.triple||r.bet.mult>=15))confetti()}ok=true}catch(e){if(ticker)clearInterval(ticker);dice.forEach(d=>d.classList.remove('rolling'));toast(e.message)}finally{sicboRolling=false;btn.disabled=false;btn.textContent='ROLL DICE'}return ok}
async function runSicboAuto(count){if(sicboAutoRunning||sicboRolling)return;sicboAutoRunning=true;sicboAutoStop=false;const stop=$('#sicboAutoStop'),status=$('#sicboAutoStatus');if(stop)stop.disabled=false;for(let i=0;i<count&&!sicboAutoStop;i++){if(document.hidden){sicboAutoStop=true;break}if(status)status.textContent=`${i+1}/${count}`;const ok=await rollSicbo(true);if(!ok)break;await sleep(450)}sicboAutoRunning=false;if(stop)stop.disabled=true;if(status)status.textContent=sicboAutoStop?'중지됨':'완료'}

async function loadSeotda(){try{const d=await api('/api/solo/seotda');if(d.game)renderSeotda(d.game);else{$('#seotdaTable').classList.add('hidden');$('#seotdaStart').classList.remove('hidden')}}catch(e){toast(e.message)}}
function seotdaCard(c,hidden=false){if(hidden)return `<div class="hwatu-card seotda-card hidden-card"><span>花</span></div>`;const month=c.m;return `<div class="hwatu-card seotda-card month-${month}"><small>${month}월</small><b>${month}</b><span>${c.g?'✨ 광':'화투'}</span></div>`}
async function startSeotda(){try{const d=await api('/api/solo/seotda/start',{method:'POST',body:JSON.stringify({bet:normalizeWagerInput('seotdaBet')})});me=d.user;updateHeader();renderSeotda(d.game)}catch(e){toast(e.message)}}
function seotdaFx(rank=''){rank=String(rank||'');if(rank==='38광땡')return 7;if(/광땡/.test(rank))return 6;if(rank==='장땡')return 5;if(/땡$/.test(rank))return 4;if(/알리|독사|구삥|장삥|장사|세륙/.test(rank))return 3;if(rank==='갑오')return 2;if(/끗$/.test(rank))return 1;return 0}
function seotdaRankBadge(rank){const lv=seotdaFx(rank);return `<b class="hand-rank seotda-rank-fx fx-${lv}"><span>${html(rank||'')}</span>${lv>=4?'<i></i><i></i><i></i>':''}</b>`}
function renderSeotda(g){$('#seotdaStart').classList.add('hidden');const root=$('#seotdaTable');root.classList.remove('hidden');const done=g.phase==='complete',userLv=done?seotdaFx(g.result?.userRank):0,botLv=done?seotdaFx(g.result?.botRank):0,winnerLv=done?(g.result?.winner==='user'?userLv:g.result?.winner==='bot'?botLv:Math.max(userLv,botLv)):0;root.innerHTML=`<div class="kcard-table seotda-table panel ${done?'revealed fx-winner-'+winnerLv:''}"><div class="kcard-header"><div><small>J-BOT</small><h3>섯다 한 판 · ${money(g.bet)}</h3></div><span class="round-lamp ${done?'done':'live'}">${done?'RESULT':'LIVE'}</span></div><div class="duel-zone"><div class="duel-player bot fx-${botLv}"><div class="avatar-ring character-ring">${botFace('seotda','duel-face')}</div><h4>J-BOT</h4><div class="two-cards">${g.botCards.map(c=>seotdaCard(c,!done)).join('')}</div>${done?seotdaRankBadge(g.result.botRank):''}</div><div class="versus-mark">VS</div><div class="duel-player user fx-${userLv}"><div class="avatar-ring character-ring">${avatarImg(me.avatar,me.nickname,'duel-face',me.cosmetics)}</div><h4>${html(me.nickname)}</h4><div class="two-cards">${g.userCards.map(c=>seotdaCard(c,false)).join('')}</div>${done?seotdaRankBadge(g.result.userRank):''}</div></div>${done?`<div class="result-banner mega seotda-result fx-${winnerLv}">${winnerLv>=5?'<span class="seotda-burst">✦ ✦ ✦</span>':''}${html(g.result.text)} ${g.result.payout?`· ${money(g.result.payout)} 정산`:''}</div><button class="primary new-seotda" type="button">다음 판</button>`:`<div class="seotda-actions"><button class="danger" data-seotda="fold" type="button">다이</button><button class="secondary" data-seotda="show" type="button">승부</button><button class="primary" data-seotda="double" type="button">두 배 승부</button></div>`}</div>`;if(done&&winnerLv>=5){fx('win');setTimeout(confetti,100)}$$('[data-seotda]',root).forEach(b=>b.onclick=async()=>{try{const d=await api('/api/solo/seotda/action',{method:'POST',body:JSON.stringify({action:b.dataset.seotda})});me=d.user;updateHeader();renderSeotda(d.game)}catch(e){toast(e.message)}});$('.new-seotda',root)?.addEventListener('click',async()=>{await api('/api/solo/seotda/reset',{method:'POST',body:'{}'});root.classList.add('hidden');$('#seotdaStart').classList.remove('hidden')})}

// GOSTOP
function resetGostopUI(){if($('#gostopTable')?.classList.contains('hidden'))$('#gostopStart')?.classList.remove('hidden')}
async function loadGostop(){try{const d=await api('/api/solo/gostop');if(d.game)renderGostop(d.game);else{$('#gostopTable').classList.add('hidden');$('#gostopStart').classList.remove('hidden')}}catch(e){toast(e.message)}}
const MONTH_ICON=['','🌲','🐦','🌸','🌿','🌺','🦋','🍁','🌕','🍂','🦌','🎑','☔'];
function hwatuCard(c,clickable=false){if(c.id==='XX')return `<div class="hwatu-card hidden-card"><span>花</span></div>`;return `<button class="hwatu-card month-${c.m} ${clickable?'clickable':''}" ${clickable?`data-hwatu="${c.id}"`:''} type="button"><small>${c.m}월 · ${html(c.type)}</small><b>${MONTH_ICON[c.m]}</b><span>${['광','열끗','띠','피'].includes(c.type)?c.type:''}</span></button>`}
async function startGostop(){try{const d=await api('/api/solo/gostop/start',{method:'POST',body:JSON.stringify({bet:normalizeWagerInput('gostopBet')})});me=d.user;updateHeader();renderGostop(d.game)}catch(e){toast(e.message)}}
function scoreBox(label,s,go,face=''){return `<div class="gscore"><div class="gscore-who">${face}<span>${html(label)}</span></div><b>${s.score}점</b><small>광 ${s.g} · 열 ${s.a} · 띠 ${s.r} · 피 ${s.p} · GO ${go}</small></div>`}
function renderGostop(g){$('#gostopStart').classList.add('hidden');const root=$('#gostopTable');root.classList.remove('hidden');const done=g.phase==='complete';root.innerHTML=`<div class="gostop-board panel"><div class="gostop-top"><div>${scoreBox('J-BOT',g.score.bot,g.goCount.bot,botFace('gostop','score-face'))}</div><div class="deck-stack"><div class="hwatu-card hidden-card mini"><span>花</span></div><b>${g.deckCount}장</b></div><div>${scoreBox(`${me.nickname} · 나`,g.score.user,g.goCount.user,avatarImg(me.avatar,me.nickname,'score-face',me.cosmetics))}</div></div><div class="bot-hand-row">${g.hands.bot.map(c=>hwatuCard(c,false)).join('')}</div><div class="floor-title">바닥패</div><div class="floor-cards">${g.floor.map(c=>hwatuCard(c,false)).join('')||'<span class="empty-floor">바닥패 없음</span>'}</div><div class="capture-strip"><div><span>내가 먹은 패</span><b>${g.captured.user.length}장</b></div><div><span>J-BOT이 먹은 패</span><b>${g.captured.bot.length}장</b></div></div><div class="my-hand-title">내 손패 · 같은 월의 바닥패를 노려봐</div><div class="my-hand-row">${g.hands.user.map(c=>hwatuCard(c,!done&&!g.needDecision&&g.turn==='user')).join('')}</div>${g.needDecision?`<div class="go-stop-decision"><div><small>SCORE UP</small><h3>${g.score.user.score}점! 계속 갈까?</h3></div><button class="primary" data-gdecision="go" type="button">GO</button><button class="danger" data-gdecision="stop" type="button">STOP</button></div>`:''}${done?`<div class="result-banner mega">${g.winner==='user'?'🏆 승리!':'🤖 J-BOT 승리'} · ${html(g.result?.reason||'')} ${g.result?.payout?`· ${money(g.result.payout)} 획득`:''}</div><button class="primary new-gostop" type="button">다음 판</button>`:''}</div>`;$$('[data-hwatu]',root).forEach(b=>b.onclick=async()=>{try{b.disabled=true;const d=await api('/api/solo/gostop/play',{method:'POST',body:JSON.stringify({cardId:b.dataset.hwatu})});if(d.user){me=d.user;updateHeader()}renderGostop(d.game)}catch(e){toast(e.message)}});$$('[data-gdecision]',root).forEach(b=>b.onclick=async()=>{try{const d=await api('/api/solo/gostop/decision',{method:'POST',body:JSON.stringify({decision:b.dataset.gdecision})});if(d.user){me=d.user;updateHeader()}renderGostop(d.game)}catch(e){toast(e.message)}});$('.new-gostop',root)?.addEventListener('click',async()=>{await api('/api/solo/gostop/reset',{method:'POST',body:'{}'});root.classList.add('hidden');$('#gostopStart').classList.remove('hidden')})}



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
async function startSevenPoker(){const btn=$('#startSevenPoker');if(btn.disabled)return;btn.disabled=true;try{const buyIn=normalizeWagerInput('sevenBuyIn',10000,100000),d=await api('/api/solo/seven/start',{method:'POST',body:JSON.stringify({buyIn})});me=d.user;updateHeader();renderSevenPoker(d.game)}catch(e){toast(e.message)}finally{btn.disabled=false}}
async function loadSevenPoker(silent=false){try{const d=await api('/api/solo/seven');if(d.game)renderSevenPoker(d.game);else{$('#sevenPokerStart')?.classList.remove('hidden');$('#sevenPokerTable')?.classList.add('hidden')}}catch(e){if(!silent)toast(e.message)}}
function renderSevenPoker(g){
  $('#sevenPokerStart').classList.add('hidden');const root=$('#sevenPokerTable');root.classList.remove('hidden');clearTimeout(sevenAutoTimer);
  const result=g.result?`<div class="seven-result ${g.result.winner}"><small>SHOWDOWN</small><h3>${html(g.result.text)}</h3><div><span>내 패 <b>${html(g.result.userRank||'—')}</b></span><span>J-BOT <b>${html(g.result.botRank||'—')}</b></span><strong>POT ${money(g.result.pot)}</strong></div></div>`:'';
  root.innerHTML=`<div class="seven-toolbar panel"><div><small>HAND #${g.handNo} · ${SEVEN_STREET_NAME[g.street]||g.street}</small><h3>${avatarImg(me.avatar,me.nickname,'seven-toolbar-face',me.cosmetics)} ${html(me.nickname)} <i>VS</i> ${botFace('poker','seven-toolbar-face')} J-BOT</h3></div><div class="seven-bank"><span>내 칩 <b>${money(g.stack.user)}</b></span><span>J-BOT <b>${money(g.stack.bot)}</b></span><button class="secondary seven-cashout" ${!g.complete?'disabled':''} type="button">정산 후 나가기</button></div></div>${result}<div class="seven-layout"><div class="seven-table-shell panel"><div class="seven-felt"><div class="seven-logo">JUNJA<br><span>SEVEN POKER</span></div><div class="seven-opponent"><div class="seven-player-title">${botFace('poker','seven-face')}<div><b>J-BOT</b><small>${html(g.botVisibleStatus?.name||'공개패 분석')}</small></div></div>${sevenCardStrip(g.cards.bot,'bot')}</div><div class="seven-pot"><small>TOTAL POT</small><b>${money(g.pot)}</b><span>${html(g.lastAction||'')}</span></div><div class="seven-me"><div class="seven-player-title">${avatarImg(me.avatar,me.nickname,'seven-face',me.cosmetics)}<div><b>${html(me.nickname)} · 나</b><small>${g.turn==='user'&&!g.complete?'🔥 YOUR TURN':'TABLE PLAYER'}</small></div></div>${sevenCardStrip(g.cards.user,'user')}</div></div>${sevenActions(g)}</div><aside class="seven-side"><div class="panel street-panel"><small>HAND PROGRESS</small>${[3,4,5,6,7].map(n=>`<div class="${g.street===n?'active':g.street>n?'done':''}"><b>${n}</b><span>${SEVEN_STREET_NAME[n]}</span></div>`).join('')}</div><div class="panel">${sevenHandImpact(g.userStatus)}</div><div class="panel seven-rules-mini"><small>7 CARD STUD</small><p>4·5·6번째 카드는 공개, 마지막 7번째 카드는 비공개. 최종 7장 중 최고의 5장으로 승부해.</p><label class="auto-next-toggle mini"><input id="sevenAutoNextTable" type="checkbox" ${localStorage.getItem('seven_auto')==='1'?'checked':''}><span></span><b>AUTO NEXT HAND</b></label></div></aside></div>`;
  const tableToggle=$('#sevenAutoNextTable',root);if(tableToggle)tableToggle.onchange=()=>localStorage.setItem('seven_auto',tableToggle.checked?'1':'0');
  const startToggle=$('#sevenAutoNext');if(startToggle){startToggle.checked=localStorage.getItem('seven_auto')==='1';startToggle.onchange=()=>localStorage.setItem('seven_auto',startToggle.checked?'1':'0')}
  $$('[data-seven-preset]',root).forEach(b=>b.onclick=()=>{const input=$('#sevenRaiseTo',root);if(!input)return;const max=Number(input.max||0),min=Number(input.min||0);input.value=b.dataset.sevenPreset==='max'?max:Math.max(min,Math.min(max,Math.floor((Number(g.currentBet||0)+(Number(g.pot||0)+Math.max(0,Number(g.currentBet||0)-Number(g.roundBet?.user||0)))/2)/1000)*1000));fx()});
  $$('[data-seven-action]',root).forEach(b=>b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{const d=await api('/api/solo/seven/action',{method:'POST',body:JSON.stringify({action:b.dataset.sevenAction,raiseTo:Number($('#sevenRaiseTo',root)?.value||0)})});if(d.user){me=d.user;updateHeader()}renderSevenPoker(d.game)}catch(e){toast(e.message);b.disabled=false}});
  $$('.seven-next',root).forEach(b=>b.onclick=()=>nextSevenPoker());$$('.seven-cashout',root).forEach(b=>b.onclick=()=>cashoutSevenPoker());
  if(g.complete&&localStorage.getItem('seven_auto')==='1'&&sevenAutoRound!==g.handNo){sevenAutoRound=g.handNo;sevenAutoTimer=setTimeout(()=>{if(currentView==='sevenpoker'&&!document.hidden)nextSevenPoker(true)},3000)}
}
async function nextSevenPoker(auto=false){clearTimeout(sevenAutoTimer);try{const d=await api('/api/solo/seven/next',{method:'POST',body:'{}'});if(d.user){me=d.user;updateHeader()}renderSevenPoker(d.game)}catch(e){if(auto)localStorage.setItem('seven_auto','0');toast(e.message)}}
async function cashoutSevenPoker(){clearTimeout(sevenAutoTimer);if(!confirm('현재 테이블 칩을 게임머니로 정산하고 나갈까?'))return;try{const d=await api('/api/solo/seven/leave',{method:'POST',body:'{}'});me=d.user;updateHeader();toast(`세븐포커 정산 ${money(d.cashout)}`);$('#sevenPokerTable').classList.add('hidden');$('#sevenPokerStart').classList.remove('hidden')}catch(e){toast(e.message)}}

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
async function dealBaccarat(id,auto=false){const btn=$('.baccarat-deal');if(btn)btn.disabled=true;try{const d=await api(`/api/baccarat/rooms/${id}/start`,{method:'POST',body:'{}'});if(d.user){me=d.user;updateHeader()}renderBaccaratRoom(d.room)}catch(e){if(auto)toast('AUTO NEXT 중지 · '+e.message);else toast(e.message);if(btn)btn.disabled=false}}

function confetti(){for(let i=0;i<34;i++){const x=document.createElement('i');x.style.cssText=`position:fixed;z-index:999;left:${Math.random()*100}vw;top:-15px;width:7px;height:14px;background:hsl(${Math.random()*360} 90% 65%);transform:rotate(${Math.random()*180}deg);transition:1.8s linear;pointer-events:none`;document.body.appendChild(x);requestAnimationFrame(()=>{x.style.top='105vh';x.style.transform+=` translateX(${(Math.random()-.5)*180}px) rotate(720deg)`});setTimeout(()=>x.remove(),1900)}}
window.addEventListener('error',e=>{console.error('[JGC UI]',e.error||e.message);const t=$('#toast');if(t){t.textContent='화면 오류를 감지했어. 새로고침하면 자동 복구돼.';t.classList.add('show')}});
window.addEventListener('unhandledrejection',e=>{console.error('[JGC PROMISE]',e.reason)});
boot();

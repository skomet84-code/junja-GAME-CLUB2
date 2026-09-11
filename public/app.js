const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
let me=null,currentView='lobby',currentRoomId=null,currentGame=null,events=null,selectedBet=10000,refreshTimer=null,slotSpinState=null,autoSpinRunning=false,autoSpinStop=false,selectedYutMoveIndex=0,selectedSoloYutMoveIndex=0,horseCardData=null,horseRacing=false,roomPollTimer=null,roomRefreshBusy=false,lastRoomVersion=-1;
const SLOT_SYMBOLS=['🍒','🍋','🍊','🔔','⭐','💎','7️⃣','J'];
const SLOT_CELL_CLASS={'🍒':'cherry','🍋':'lemon','🍊':'orange','🔔':'bell','⭐':'star','💎':'diamond','7️⃣':'seven','J':'junja'};
const REACTION_META={frustrated:['😫','답답'],hurry:['⏩','빨리'],cry:['😭','울음'],laugh:['😂','웃음'],wow:['😲','놀람'],sad:['😢','슬픔']};
const money=n=>new Intl.NumberFormat('ko-KR').format(Number(n||0))+' G';
const timeText=t=>new Intl.DateTimeFormat('ko-KR',{hour:'2-digit',minute:'2-digit',month:'numeric',day:'numeric'}).format(new Date(t));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function html(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function avatarImg(avatar=0,alt='플레이어',extra=''){const idx=Math.abs(Number(avatar||0))%10;return `<img class="game-face ${extra}" src="/art/poker-avatars/avatar-${idx}.svg" alt="${html(alt)}">`}
function botFace(game='poker',extra=''){const src=game==='poker'?'/art/poker-avatars/bot.svg':`/art/${game}-mascot.svg`;return `<img class="game-face bot-face ${extra}" src="${src}" alt="J-BOT">`}
function reactionBubble(room,userId){const x=(room?.reactions||[]).find(r=>Number(r.userId)===Number(userId));return x?`<div class="reaction-bubble" title="${html(x.label||'반응')}"><b>${html(x.emoji)}</b><small>${html(x.nickname||'')}</small></div>`:''}
function reactionDockHtml(){return `<div class="reaction-dock"><span>QUICK REACTION</span>${Object.entries(REACTION_META).map(([k,[e,l]])=>`<button type="button" data-reaction="${k}" title="${l}"><b>${e}</b><small>${l}</small></button>`).join('')}<em>텍스트 채팅 없이 이모티콘만 전송</em></div>`}
function signedMoney(n){return (Number(n)>=0?'+':'')+money(n)}
function toast(msg){const e=$('#toast');if(!e)return;e.textContent=msg;e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('show'),2400)}
function fx(kind='click'){
  try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;fx.ctx=fx.ctx||new C();const c=fx.ctx,o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type=kind==='win'?'triangle':'sine';o.frequency.value=kind==='spin'?190:kind==='stop'?360:kind==='win'?780:280;g.gain.value=.025;o.start();g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+(kind==='win'?.22:.07));o.stop(c.currentTime+(kind==='win'?.22:.07));}catch{}
}
async function api(url,opts={}){
  const method=opts.method||'GET',attempts=method==='GET'?2:1;
  let lastErr;
  for(let attempt=0;attempt<attempts;attempt++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const res=await fetch(url,{cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json','Cache-Control':'no-cache',...(opts.headers||{})},...opts,signal:controller.signal});
      clearTimeout(timer);let data={};try{data=await res.json()}catch{}
      if(!res.ok)throw new Error(data.error||'요청에 실패했습니다.');return data;
    }catch(e){clearTimeout(timer);lastErr=e;if(attempt+1<attempts)await sleep(250);}
  }
  throw new Error(lastErr?.name==='AbortError'?'서버 응답이 늦습니다. 잠시 후 다시 시도해주세요.':(lastErr?.message||'네트워크 오류가 발생했습니다.'));
}

function setAuthTab(tab){$$('[data-auth-tab]').forEach(b=>b.classList.toggle('active',b.dataset.authTab===tab));$('#loginForm')?.classList.toggle('hidden',tab!=='login');$('#registerForm')?.classList.toggle('hidden',tab!=='register');if($('#authMsg'))$('#authMsg').textContent='';}
$$('[data-auth-tab]').forEach(b=>b.onclick=()=>setAuthTab(b.dataset.authTab));
$('#loginForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api('/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});me=d.user;bootMain();}catch(err){$('#authMsg').textContent=err.message}};
$('#registerForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api('/api/register',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});me=d.user;bootMain();}catch(err){$('#authMsg').textContent=err.message}};
async function boot(){try{const d=await api('/api/me');me=d.user;bootMain();}catch{$('#authScreen').classList.remove('hidden')}}
function bootMain(){
  $('#authScreen').classList.add('hidden');$('#mainApp').classList.remove('hidden');updateHeader();bindMain();connectEvents();
  const q=new URLSearchParams(location.search),rid=q.get('room'),game=q.get('game');
  if(rid&&['holdem','yut'].includes(game)){go(game).then(()=>joinRoom(game,rid));}else{go('lobby');setTimeout(resumeMyRoom,450);}
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js?v=120').catch(()=>{});
  if(!localStorage.getItem('jgc_help_seen_10'))setTimeout(()=>openHelp('lobby'),550);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentRoomId)loadCurrentRoom(true).catch(()=>{})});
}
let mainBound=false;
function bindMain(){if(mainBound)return;mainBound=true;
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
  $('#dailyBtn').onclick=claimDaily;$('#refreshRank').onclick=loadLobby;$('#profileBtn').onclick=openProfile;$('#closeProfile').onclick=()=>$('#profileSheet').classList.add('hidden');$('#profileSheet').onclick=e=>{if(e.target.id==='profileSheet')$('#profileSheet').classList.add('hidden')};$('#logoutBtn').onclick=logout;
  $('#refreshHoldem').onclick=()=>loadRooms('holdem');$('#refreshYut').onclick=()=>loadRooms('yut');$('#createHoldem').onclick=()=>createRoom('holdem');$('#createYut').onclick=()=>createRoom('yut');$('#yutMode')?.addEventListener('change',syncYutMode);$('#horseBetType')?.addEventListener('change',syncHorseBetUI);$('#horseStartBtn')?.addEventListener('click',startHorseRace);
  $('#spinBtn').addEventListener('click',()=>spin({manual:true}));$('#slotBetInput')?.addEventListener('input',e=>syncSlotBetInput(e.target));$('#slotBetInput')?.addEventListener('change',e=>normalizeSlotBetInput(e.target));$$('[data-auto-spin]').forEach(b=>b.addEventListener('click',()=>runAutoSpins(Number(b.dataset.autoSpin))));$('#autoStopBtn')?.addEventListener('click',()=>{autoSpinStop=true;$('#autoSpinStatus').textContent='중지 요청...'});$('#tourneyCard')?.addEventListener('click',()=>toast('토너먼트는 다음 업데이트에서 오픈 예정이야.'));
  const betRoot=$('#betRow');if(betRoot&&!betRoot.children.length)for(const b of [1000,5000,10000,25000,50000,100000]){const el=document.createElement('button');el.type='button';el.className='bet-chip'+(b===selectedBet?' active':'');el.textContent=money(b);el.onclick=()=>{selectedBet=b;if($('#slotBetInput'))$('#slotBetInput').value=b;$$('.bet-chip').forEach(x=>x.classList.remove('active'));el.classList.add('active');updateCurrentBetLabel();fx()};betRoot.appendChild(el)}
  $('#helpBtn').onclick=()=>openHelp(currentView);$('#closeHelp').onclick=closeHelp;$('#helpDone').onclick=()=>{localStorage.setItem('jgc_help_seen_10','1');closeHelp()};$('.help-backdrop').onclick=closeHelp;$$('[data-open-help]').forEach(b=>b.onclick=e=>{e.stopPropagation();openHelp(b.dataset.openHelp)});$$('[data-help-tab]').forEach(b=>b.onclick=()=>setHelpTab(b.dataset.helpTab));
  $$('[data-mode-game]').forEach(b=>b.onclick=()=>switchMode(b.dataset.modeGame,b.dataset.mode));
  $('#startSoloHoldem').onclick=startSoloHoldem;$('#startSoloYut').onclick=startSoloYut;$('#startSeotda').onclick=startSeotda;$('#startGostop').onclick=startGostop;
  if($('#adminSearchBtn'))$('#adminSearchBtn').onclick=()=>loadAdmin($('#adminSearch').value.trim());
  if($('#adminRefreshBtn'))$('#adminRefreshBtn').onclick=()=>{if($('#adminSearch'))$('#adminSearch').value='';loadAdmin('')};
  if($('#adminSearch'))$('#adminSearch').addEventListener('keydown',e=>{if(e.key==='Enter')loadAdmin(e.currentTarget.value.trim())});
  initSlotMachine(true);
}
function setHelpTab(tab='lobby'){const ok=['lobby','slot','holdem','yut','seotda','gostop','horse'];if(!ok.includes(tab))tab='lobby';$$('[data-help-tab]').forEach(b=>b.classList.toggle('active',b.dataset.helpTab===tab));$$('[data-help-page]').forEach(p=>p.classList.toggle('active',p.dataset.helpPage===tab))}
function openHelp(tab=currentView){setHelpTab(tab);$('#helpModal').classList.remove('hidden');document.body.classList.add('modal-open')}
function closeHelp(){$('#helpModal').classList.add('hidden');document.body.classList.remove('modal-open')}
function switchMode(game,mode){$$(`[data-mode-game="${game}"]`).forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$(`#${game}MultiArea`)?.classList.toggle('hidden',mode!=='multi');$(`#${game}SoloArea`)?.classList.toggle('hidden',mode!=='solo');if(mode==='solo'){if(game==='holdem')loadSoloHoldem();else if(game==='yut')loadSoloYut()}else loadRooms(game)}
function connectEvents(){if(events)events.close();events=new EventSource('/api/events');events.addEventListener('refresh',()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{try{const d=await api('/api/me');me=d.user;updateHeader();if(currentRoomId)await loadCurrentRoom();else if(currentView==='lobby')await loadLobby(false);else if(currentView==='holdem'&&!$('#holdemMultiArea').classList.contains('hidden'))await loadRooms('holdem');else if(currentView==='yut'&&!$('#yutMultiArea').classList.contains('hidden'))await loadRooms('yut');else if(currentView==='admin'&&me?.is_admin)await loadAdmin($('#adminSearch')?.value.trim()||'',false)}catch{}},180)})}
function updateHeader(){if(!me)return;$('#walletBalance').textContent=money(me.balance);$('#avatarEmoji').textContent=me.avatarEmoji;$('#nickName').textContent=me.nickname;$('#dailyBtn').disabled=!me.dailyAvailable;$('#dailyBtn').textContent=me.dailyAvailable?'🎁 출석 +50,000 G':'✓ 오늘 출석 완료';$('#adminBtn')?.classList.toggle('hidden',!me.is_admin)}
async function refreshMe(){const d=await api('/api/me');me=d.user;updateHeader();$('#onlineCount').textContent='ONLINE '+d.online;return d}
async function go(view){
  if(view==='admin'&&!me?.is_admin){toast('관리자 권한이 필요합니다.');return}
  if(currentRoomId&&!['holdem','yut'].includes(view)){toast('먼저 멀티 게임방에서 나가기를 눌러줘.');return}
  currentView=view;$$('.view').forEach(v=>v.classList.remove('active'));$('#view-'+view)?.classList.add('active');window.scrollTo({top:0,behavior:'smooth'});
  if(view==='lobby')await loadLobby();if(view==='slot')initSlotMachine();if(view==='holdem')await loadRooms('holdem');if(view==='yut')await loadRooms('yut');if(view==='ledger')await loadLedger();if(view==='seotda')await loadSeotda();if(view==='gostop')await loadGostop();if(view==='horse')await loadHorseCard();if(view==='admin')await loadAdmin('');
}
async function loadLobby(full=true){try{await refreshMe();const d=await api('/api/leaderboard');$('#leaderboard').innerHTML=d.rows.map((r,i)=>`<div class="rank-row"><div class="rank-no">${i+1}</div><div class="rank-name"><span>${r.avatarEmoji}</span><span>${html(r.nickname)}</span></div><div class="rank-money">${money(r.balance)}</div></div>`).join('')||'<div class="empty">아직 랭킹이 없습니다.</div>';$('#myStats').innerHTML=`<div class="stat"><span>홀덤 승리</span><b>${me.poker_wins}</b></div><div class="stat"><span>윷놀이 승리</span><b>${me.yut_wins}</b></div><div class="stat"><span>섯다 승리</span><b>${me.seotda_wins||0}</b></div><div class="stat"><span>고스톱 승리</span><b>${me.gostop_wins||0}</b></div><div class="stat"><span>슬롯 스핀</span><b>${me.slot_spins}</b></div><div class="stat"><span>슬롯 손익</span><b>${signedMoney(me.slot_profit)}</b></div><div class="stat"><span>경마 적중</span><b>${me.horse_wins||0}/${me.horse_races||0}</b></div><div class="stat"><span>경마 손익</span><b>${signedMoney(me.horse_profit||0)}</b></div>`}catch(e){if(full)toast(e.message)}}
async function claimDaily(){try{const d=await api('/api/daily',{method:'POST',body:'{}'});toast(`출석 보너스 +${money(d.amount)}`);await refreshMe()}catch(e){toast(e.message)}}
async function openProfile(){await refreshMe();$('#profileContent').innerHTML=`<div class="profile-big"><div class="emoji">${me.avatarEmoji}</div><h3>${html(me.nickname)} ${me.is_admin?'<span class="profile-admin-badge">ADMIN</span>':''}</h3><p>@${html(me.username)} · 가입 ${new Date(me.created_at).toLocaleDateString('ko-KR')}</p></div><div class="stat-grid"><div class="stat"><span>보유머니</span><b>${money(me.balance)}</b></div><div class="stat"><span>홀덤 승리</span><b>${me.poker_wins}</b></div><div class="stat"><span>윷 승리</span><b>${me.yut_wins}</b></div><div class="stat"><span>섯다/고스톱</span><b>${me.seotda_wins||0}/${me.gostop_wins||0}</b></div></div><p class="privacy-note">게임머니는 현금 가치가 없고, 텍스트 채팅 없이 6종 이모티콘 반응만 제공합니다.</p>`;$('#profileSheet').classList.remove('hidden')}
async function logout(){await api('/api/logout',{method:'POST',body:'{}'}).catch(()=>{});location.reload()}
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
    if($('#adminRooms'))$('#adminRooms').innerHTML=(rr.rows||[]).map(r=>`<div class="admin-room-row"><div><b>${html(r.name)}</b><small>${r.game==='holdem'?'홀덤':'윷놀이'} · ${r.status} · ${r.players}/${r.maxPlayers}명 · ${money(r.buyIn)}</small><div class="room-mini-users">${(r.participants||[]).map(p=>`<span class="${p.ready?'ready':''}">${AVATAR_SAFE(p.avatar)} ${html(p.nickname)}</span>`).join('')}</div></div><button class="danger" data-admin-close-room="${r.id}" type="button">강제 종료</button></div>`).join('')||'<div class="empty">현재 열린 게임방이 없습니다.</div>';
    bindAdminRows();bindAdminRoomRows();
  }catch(e){if(notify)toast(e.message)}
}
function adminUserHtml(u){
  const totalGames=(u.poker_hands||0)+(u.yut_games||0)+(u.seotda_games||0)+(u.gostop_games||0)+(u.slot_spins||0)+(u.horse_races||0);
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

// SLOT 3x3 · v1.2 LAS VEGAS / AUTO SPIN
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
    if(d.payout>0){$('#slotResult').textContent=`${d.jackpot?'🔥 JACKPOT! ':''}${money(d.payout)} 당첨 · x${d.totalMultiplier}`;fx('win');if(d.jackpot||(d.winLines||[]).length>1)confetti()}
    else $('#slotResult').textContent=`-${money(d.bet)} · 다음 SPIN 도전`;
    me=d.user;updateHeader();return true
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
  let done=0;
  try{
    for(let i=0;i<count&&!autoSpinStop;i++){
      if((me?.balance||0)<selectedBet){toast('게임머니가 부족해서 자동 SPIN을 중지했어.');break}
      const ok=await spin({fast:true});if(!ok)break;done++;
      if($('#autoSpinStatus'))$('#autoSpinStatus').textContent=`${done} / ${count}회`;
      await sleep(90)
    }
  }finally{
    autoSpinStop=false;setAutoSpinUi(false,done===count?`${done}회 완료`:`${done}회에서 중지`);
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
    renderRoom(d.room);startRoomPolling();toast(`진행 중인 ${d.room.name}으로 복귀했어.`);
  }catch{}
}
function roomParticipantChips(room){return `<div class="room-participant-strip">${room.players.map(p=>`<div class="participant-chip ${p.ready?'ready':''} ${p.userId===me.id?'me':''}">${avatarImg(p.avatar,p.nickname,'mini-face')}<b>${html(p.nickname)}</b>${room.status==='WAITING'?`<i>${p.ready?'READY':'WAIT'}</i>`:''}${room.hostId===p.userId?'<em>HOST</em>':''}${reactionBubble(room,p.userId)}</div>`).join('')}</div>`}
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
    const d=await api(`/api/rooms/${currentRoomId}`);if(!d.room)throw new Error('방을 찾을 수 없습니다.');
    const version=d.room.version||0;if(version!==lastRoomVersion||!silent){lastRoomVersion=version;renderRoom(d.room)}
    if(!silent)await refreshMe();
  }catch(e){
    if(!silent)toast(e.message);
    if(/찾을 수 없습니다|참가자가 아닙니다/.test(e.message)){const oldGame=currentGame;currentRoomId=null;currentGame=null;lastRoomVersion=-1;stopRoomPolling();if(oldGame){$(`#${oldGame}Room`)?.classList.add('hidden');$(`#${oldGame}Browser`)?.classList.remove('hidden');loadRooms(oldGame)}}
  }finally{roomRefreshBusy=false}
}
function renderRoom(room){lastRoomVersion=room.version||lastRoomVersion;if(room.game==='holdem')renderHoldem(room);else renderYut(room)}
async function toggleReady(){if(!currentRoomId)return;try{const d=await api(`/api/rooms/${currentRoomId}/ready`,{method:'POST',body:'{}'});renderRoom(d.room)}catch(e){toast(e.message)}}
async function leaveRoom(){if(!currentRoomId)return;try{await api(`/api/rooms/${currentRoomId}/leave`,{method:'POST',body:'{}'});const old=currentGame;currentRoomId=null;currentGame=null;lastRoomVersion=-1;stopRoomPolling();await refreshMe();if(old==='holdem'){$('#holdemRoom').classList.add('hidden');$('#holdemBrowser').classList.remove('hidden');loadRooms('holdem')}else{$('#yutRoom').classList.add('hidden');$('#yutBrowser').classList.remove('hidden');loadRooms('yut')}}catch(e){toast(e.message)}}
async function closeRoom(){if(!currentRoomId)return;if(!confirm('대기실/게임을 종료하고 참가자에게 보유 판돈을 환급할까?'))return;try{await api(`/api/rooms/${currentRoomId}/close`,{method:'POST',body:'{}'});const old=currentGame;currentRoomId=null;currentGame=null;lastRoomVersion=-1;stopRoomPolling();toast('방을 비웠어.');await refreshMe();if(old==='holdem'){$('#holdemRoom').classList.add('hidden');$('#holdemBrowser').classList.remove('hidden');loadRooms('holdem')}else{$('#yutRoom').classList.add('hidden');$('#yutBrowser').classList.remove('hidden');loadRooms('yut')}}catch(e){toast(e.message)}}
async function recoverRoom(){if(!currentRoomId)return;if(!confirm('게임 상태가 꼬였을 때만 사용해. 방을 강제 종료하고 판돈을 복구할까?'))return;try{await api(`/api/rooms/${currentRoomId}/recover`,{method:'POST',body:'{}'});const old=currentGame;currentRoomId=null;currentGame=null;lastRoomVersion=-1;stopRoomPolling();toast('게임방 복구 완료 · 로비로 돌아왔어.');await refreshMe();if(old==='holdem'){$('#holdemRoom').classList.add('hidden');$('#holdemBrowser').classList.remove('hidden');loadRooms('holdem')}else{$('#yutRoom').classList.add('hidden');$('#yutBrowser').classList.remove('hidden');loadRooms('yut')}}catch(e){toast(e.message)}}
async function startRoom(){try{const d=await api(`/api/rooms/${currentRoomId}/start`,{method:'POST',body:'{}'});renderRoom(d.room);await loadCurrentRoom()}catch(e){toast(e.message)}}
function roomToolbar(room){const host=room.hostId===me.id,mine=room.players.find(p=>p.userId===me.id),waiting=room.status==='WAITING';return `<div class="room-shell-head">${roomTurnBanner(room)}${roomParticipantChips(room)}</div><div class="room-toolbar"><div class="room-title"><h3>${html(room.name)}</h3><small>방 코드 <b>${room.id}</b> · 판돈 ${money(room.buyIn)} · ${room.players.length}/${room.maxPlayers}명</small></div><div class="toolbar-actions"><button class="secondary copy-code" type="button">코드 복사</button><button class="secondary copy-link" type="button">초대 링크</button>${waiting?`<button class="${mine?.ready?'ready-on':'primary'} ready-room" type="button">${mine?.ready?'✓ READY':'READY'}</button>`:''}${host&&waiting?`<button class="primary start-room" ${!room.allReady?'disabled':''} type="button">${room.allReady?'게임 시작':'전원 READY 대기'}</button><button class="danger close-room" type="button">대기실 비우기</button>`:''}${!waiting?'<button class="danger recover-room" type="button">오류 복구</button>':''}<button class="secondary leave-room" ${!waiting?'disabled title="진행 중에는 오류 복구를 이용해줘"':''} type="button">나가기</button></div></div>${reactionDockHtml()}`}
function bindRoomCommon(root,room){$('.copy-code',root).onclick=async()=>{try{await navigator.clipboard.writeText(room.id);toast('방 코드 복사 완료')}catch{toast('방 코드: '+room.id)}};$('.copy-link',root).onclick=async()=>{const link=`${location.origin}/?game=${room.game}&room=${room.id}`;try{if(navigator.share)await navigator.share({title:'JUNJA GAME CLUB',text:`${room.name} 같이 하자!`,url:link});else{await navigator.clipboard.writeText(link);toast('초대 링크 복사 완료')}}catch(e){if(e.name!=='AbortError')toast('초대 링크를 복사하지 못했습니다.')}};$('.leave-room',root)?.addEventListener('click',leaveRoom);$('.ready-room',root)?.addEventListener('click',toggleReady);$('.start-room',root)?.addEventListener('click',startRoom);$('.close-room',root)?.addEventListener('click',closeRoom);$('.recover-room',root)?.addEventListener('click',recoverRoom);$$('[data-reaction]',root).forEach(b=>b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{const d=await api(`/api/rooms/${currentRoomId}/reaction`,{method:'POST',body:JSON.stringify({key:b.dataset.reaction})});renderRoom(d.room);setTimeout(()=>{if(currentRoomId===room.id)loadCurrentRoom(false).catch(()=>{})},4700)}catch(e){toast(e.message)}finally{setTimeout(()=>b.disabled=false,750)}})}
function privacyPanelHtml(){return `<div class="privacy-room-card panel"><div class="privacy-shield">🛡️</div><div><small>PRIVACY MODE</small><h3>텍스트 채팅 없음</h3><p>개인정보 노출 없는 6종 이모티콘 반응만 지원합니다.</p></div></div>`}

// POKER RENDER (MULTI + SOLO) · v1.2 IMPACT TABLE
const POKER_RANKS=['스트레이트 플러시','포카드','풀하우스','플러시','스트레이트','트리플','투페어','원페어','하이카드'];
const pokerSceneCache=new Map();
function pokerStatusPanel(h){
  const info=h?.myHand||{name:'카드 대기',detail:'카드가 배분되면 현재 패가 표시돼.',draws:[],rankLevel:-1};
  const draws=(info.draws||[]).map(x=>`<span>${html(x)}</span>`).join(''),level=Math.max(-1,Math.min(8,Number(info.rankLevel??-1)));
  const impact=level>=0?` impact-${level}`:'';
  return `<div class="poker-hand-panel panel${impact}"><div class="hand-impact-ring"></div><div class="hand-now"><small>CURRENT HAND</small><h3>${html(info.name||'카드 대기')}</h3><p>${html(info.detail||'')}</p>${draws?`<div class="draw-tags">${draws}</div>`:''}${level>=3?'<div class="hand-power"><i></i><i></i><i></i><span>HAND POWER</span></div>':''}</div><div class="hand-rank-table"><b>족보 순위</b>${POKER_RANKS.map((x,i)=>`<div class="${x===info.name?'active':''}"><span>${i+1}</span><em>${x}</em></div>`).join('')}</div><div class="hand-tip">하이카드부터 단계별 연출 · 높은 족보일수록 효과가 강해져.</div></div>`;
}
function pokerFaceHtml(p){
  const bot=p?.bot||Number(p?.userId)<0;
  const src=bot?'/art/poker-avatars/bot.svg':`/art/poker-avatars/avatar-${Math.abs(Number(p?.avatar||0))%10}.svg`;
  return `<img class="poker-face" src="${src}" alt="${bot?'J-BOT':html(p?.nickname||'플레이어')}">`
}
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
function renderSoloYut(g){$('#yutSoloStart').classList.add('hidden');const root=$('#yutSoloRoom');root.classList.remove('hidden');let control='';if(g.phase==='complete')control=`<div class="victory-crown">${g.winner==='user'?'🏆':'🤖'}</div><h2>${g.winner==='user'?'승리!':'J-BOT 승리'}</h2><button class="primary solo-yut-close" type="button">새 게임 준비</button>`;else if(g.turn==='user'&&g.awaitingThrow)control=`${yutSticksHtml(g.last?.sticks)}<h3>내 차례</h3><button class="primary solo-yut-throw" type="button">🪵 윷 던지기</button>`;else if(g.turn==='user'&&g.pending?.length){selectedSoloYutMoveIndex=Math.min(selectedSoloYutMoveIndex,g.pending.length-1);control=`${yutSticksHtml(g.last?.sticks)}${yutMoveChips(g.pending,selectedSoloYutMoveIndex,'data-solo-yut-move')}${yutPieceButtons({id:'U',pieces:g.sides.user},selectedSoloYutMoveIndex,'data-solo-yut-piece')}`}else control=`${yutSticksHtml(g.last?.sticks)}<h3>J-BOT 진행 중</h3>`;root.innerHTML=`<div class="solo-toolbar character-toolbar"><div><small>AI YUT · ${money(g.bet)}</small><h3>${avatarImg(me.avatar,me.nickname,'duel-face')} <span>${html(me.nickname)}</span> <i>VS</i> ${botFace('yut','duel-face')} <span>J-BOT</span></h3></div><button class="danger solo-yut-quit" type="button">게임 포기</button></div><div class="yut-layout yut-layout-pro"><div class="yut-game panel">${soloYutBoard(g)}</div><div class="throw-control panel">${control}<div class="score-strip"><span>내 완주 <b>${g.sides.user.filter(x=>yutPhysicalClient(x)==='FINISH').length}/4</b></span><span>BOT 완주 <b>${g.sides.bot.filter(x=>yutPhysicalClient(x)==='FINISH').length}/4</b></span></div></div></div>`;$$('[data-solo-yut-move]',root).forEach(b=>b.onclick=()=>{selectedSoloYutMoveIndex=Number(b.dataset.soloYutMove);renderSoloYut(g)});$('.solo-yut-throw',root)?.addEventListener('click',async()=>{try{$('.yut-toss-scene',root)?.classList.add('throwing');const d=await api('/api/solo/yut/throw',{method:'POST',body:'{}'});await sleep(650);renderSoloYut(d.game)}catch(e){toast(e.message)}});$$('[data-solo-yut-piece]',root).forEach(b=>b.onclick=async()=>{try{const d=await api('/api/solo/yut/move',{method:'POST',body:JSON.stringify({pieceIndex:Number(b.dataset.soloYutPiece),moveIndex:selectedSoloYutMoveIndex})});selectedSoloYutMoveIndex=0;if(d.user){me=d.user;updateHeader()}renderSoloYut(d.game)}catch(e){toast(e.message)}});$('.solo-yut-quit',root)?.addEventListener('click',async()=>{if(!confirm('포기하면 참가금은 돌아오지 않아. 포기할까?'))return;const d=await api('/api/solo/yut/quit',{method:'POST',body:'{}'});me=d.user;updateHeader();root.classList.add('hidden');$('#yutSoloStart').classList.remove('hidden')});$('.solo-yut-close',root)?.addEventListener('click',async()=>{await api('/api/solo/yut/quit',{method:'POST',body:'{}'}).catch(()=>{});root.classList.add('hidden');$('#yutSoloStart').classList.remove('hidden');await refreshMe()})}

// HORSE RACING
async function loadHorseCard(){if(horseRacing)return;try{const d=await api('/api/horse/card');horseCardData=d.card;renderHorseCard()}catch(e){toast(e.message)}}
function syncHorseBetUI(){const type=$('#horseBetType')?.value||'win';$('#horsePick2Label')?.classList.toggle('hidden',type==='win');renderHorseOdds()}
function horseSvg(h){return `<svg class="race-horse-svg" viewBox="0 0 170 90" aria-hidden="true"><g class="horse-shadow"><ellipse cx="84" cy="78" rx="55" ry="7"/></g><g class="horse-figure" style="--horse:${h.color}"><path class="horse-tail" d="M31 41 Q9 32 13 18 Q18 31 36 28"/><path class="horse-body-shape" d="M39 34 Q63 16 103 25 Q122 29 132 43 Q118 55 96 57 L59 56 Q43 53 34 44 Z"/><path class="horse-neck" d="M105 30 Q114 9 134 10 Q146 12 151 21 Q144 30 128 31 L120 47 Z"/><path class="horse-head" d="M132 10 Q151 2 161 14 L154 27 L137 29 L128 21 Z"/><circle class="horse-eye" cx="150" cy="14" r="2"/><path class="horse-mane" d="M119 18 L126 5 L132 18 L137 4 L141 19"/><g class="jockey"><circle cx="111" cy="13" r="7"/><path d="M103 20 L122 22 L116 39 L101 34 Z"/><path d="M106 34 L91 48"/><path d="M116 35 L128 47"/></g><g class="leg leg-a"><path d="M58 51 L49 72 L43 79"/></g><g class="leg leg-b"><path d="M72 53 L79 72 L88 79"/></g><g class="leg leg-c"><path d="M99 52 L92 72 L84 79"/></g><g class="leg leg-d"><path d="M111 49 L124 68 L132 74"/></g><path class="saddle" d="M75 25 Q93 19 107 28 L99 38 L78 37 Z"/></g></svg>`}
function renderHorseCard(){if(!horseCardData)return;const opts=horseCardData.horses.map(h=>`<option value="${h.id}">${h.id}번 ${html(h.name)} · x${h.winOdds}</option>`).join('');$('#horsePick1').innerHTML=opts;$('#horsePick2').innerHTML=opts;$('#horsePick2').selectedIndex=1;$('#horseTrack').querySelectorAll('.race-lane').forEach(x=>x.remove());horseCardData.horses.forEach((h,i)=>{const lane=document.createElement('div');lane.className='race-lane';lane.innerHTML=`<span class="lane-num" style="--hc:${h.color}">${h.id}</span><div class="race-runner" data-horse="${h.id}" style="--hc:${h.color}"><div class="horse-name"><b>${html(h.name)}</b><small>WIN x${h.winOdds}</small></div><div class="horse-art">${horseSvg(h)}</div><div class="dust-cloud"><i></i><i></i><i></i></div></div>`;$('#horseTrack').appendChild(lane)});syncHorseBetUI();$('#raceOverlay').classList.remove('hidden');$('#horseResult').innerHTML='<p>말을 선택하고 경주를 시작해. 단승 선택마가 2위면 베팅금의 50%를 위로금으로 돌려줘.</p>'}
function renderHorseOdds(){if(!horseCardData)return;const type=$('#horseBetType')?.value||'win',p1=Number($('#horsePick1')?.value),p2=Number($('#horsePick2')?.value),a=horseCardData.horses.find(h=>h.id===p1),b=horseCardData.horses.find(h=>h.id===p2);let txt=type==='win'?`1위 예상 배당 <b>x${a?.winOdds||'-'}</b> · 2위 <b>PLACE BONUS x0.5</b>`:`${type==='quinella'?'복승':'쌍승'} 조합을 선택했어. 최종 배당은 경주 시작 시 서버에서 확정돼.`;$('#horseOdds').innerHTML=txt}
function horseProgressCurve(rank,elapsed,duration,seed){
  const t=Math.min(1,elapsed/duration),ease=1-Math.pow(1-t,1.16);
  const surge=Math.sin(Math.PI*t)*(6.8-rank*.55);
  const stride=Math.sin((elapsed/1000)*10+seed)*(1.1+rank*.06)*(1-t*.82);
  const midRace=(rank%2===0?1:-1)*Math.sin(Math.PI*Math.min(1,t*1.55))*2.1;
  return Math.max(0,Math.min(100,ease*100+surge+stride+midRace))
}
async function startHorseRace(){
  if(horseRacing||!horseCardData)return;
  const type=$('#horseBetType').value,p1=Number($('#horsePick1').value),p2=Number($('#horsePick2').value);
  if(type!=='win'&&p1===p2){toast('서로 다른 두 마리를 선택해줘.');return}
  const bet=Math.max(1000,Math.min(100000,Math.floor(Number($('#horseBet').value||1000)/1000)*1000));$('#horseBet').value=bet;
  horseRacing=true;const btn=$('#horseStartBtn');btn.disabled=true;btn.textContent='RACING...';$('#raceOverlay').classList.add('hidden');
  $$('.race-runner').forEach(r=>{r.style.setProperty('--race-x','0px');r.classList.remove('finished');r.classList.add('running');r.querySelector('.finish-rank')?.remove()});
  try{
    const d=await api('/api/horse/race',{method:'POST',body:JSON.stringify({type,picks:type==='win'?[p1]:[p1,p2],bet})});
    const order=d.order,baseDuration=5350,seeds=Object.fromEntries(order.map(h=>[h.id,Math.random()*8]));
    const rankGap=[0,520,930,1320,1690,2030,2350],durations=Object.fromEntries(order.map((h,rank)=>[h.id,baseDuration+rankGap[rank]+Math.random()*120]));
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
    const top=order.slice(0,3);$('#horseResult').innerHTML=`<div class="horse-podium">${top.map((h,i)=>`<div class="podium-row p${i+1}"><b>${i+1}위</b><span>${h.id}번 ${html(h.name)}</span></div>`).join('')}</div><div class="result-banner mega">${d.result.won?'🏆 적중! '+money(d.result.payout)+' · x'+d.result.mult:d.result.placeBonus?'🥈 2위 PLACE BONUS · '+money(d.result.payout)+' 환급':'아쉽게 미적중'}</div>`;
    me=d.user;updateHeader();if(d.result.won)confetti();horseCardData=null;setTimeout(loadHorseCard,1100)
  }catch(e){toast(e.message);$$('.race-runner').forEach(r=>r.classList.remove('running'))}
  finally{horseRacing=false;btn.disabled=false;btn.textContent='🏁 경주 시작'}
}
$('#horsePick1')?.addEventListener('change',renderHorseOdds);$('#horsePick2')?.addEventListener('change',renderHorseOdds);

// SEOTDA
function resetSeotdaUI(){if($('#seotdaTable')?.classList.contains('hidden'))$('#seotdaStart')?.classList.remove('hidden')}
async function loadSeotda(){try{const d=await api('/api/solo/seotda');if(d.game)renderSeotda(d.game);else{$('#seotdaTable').classList.add('hidden');$('#seotdaStart').classList.remove('hidden')}}catch(e){toast(e.message)}}
function seotdaCard(c,hidden=false){if(hidden)return `<div class="hwatu-card seotda-card hidden-card"><span>花</span></div>`;const month=c.m;return `<div class="hwatu-card seotda-card month-${month}"><small>${month}월</small><b>${month}</b><span>${c.g?'✨ 광':'화투'}</span></div>`}
async function startSeotda(){try{const d=await api('/api/solo/seotda/start',{method:'POST',body:JSON.stringify({bet:Number($('#seotdaBet').value)})});me=d.user;updateHeader();renderSeotda(d.game)}catch(e){toast(e.message)}}
function seotdaFx(rank=''){rank=String(rank||'');if(rank==='38광땡')return 7;if(/광땡/.test(rank))return 6;if(rank==='장땡')return 5;if(/땡$/.test(rank))return 4;if(/알리|독사|구삥|장삥|장사|세륙/.test(rank))return 3;if(rank==='갑오')return 2;if(/끗$/.test(rank))return 1;return 0}
function seotdaRankBadge(rank){const lv=seotdaFx(rank);return `<b class="hand-rank seotda-rank-fx fx-${lv}"><span>${html(rank||'')}</span>${lv>=4?'<i></i><i></i><i></i>':''}</b>`}
function renderSeotda(g){$('#seotdaStart').classList.add('hidden');const root=$('#seotdaTable');root.classList.remove('hidden');const done=g.phase==='complete',userLv=done?seotdaFx(g.result?.userRank):0,botLv=done?seotdaFx(g.result?.botRank):0,winnerLv=done?(g.result?.winner==='user'?userLv:g.result?.winner==='bot'?botLv:Math.max(userLv,botLv)):0;root.innerHTML=`<div class="kcard-table seotda-table panel ${done?'revealed fx-winner-'+winnerLv:''}"><div class="kcard-header"><div><small>J-BOT</small><h3>섯다 한 판 · ${money(g.bet)}</h3></div><span class="round-lamp ${done?'done':'live'}">${done?'RESULT':'LIVE'}</span></div><div class="duel-zone"><div class="duel-player bot fx-${botLv}"><div class="avatar-ring character-ring">${botFace('seotda','duel-face')}</div><h4>J-BOT</h4><div class="two-cards">${g.botCards.map(c=>seotdaCard(c,!done)).join('')}</div>${done?seotdaRankBadge(g.result.botRank):''}</div><div class="versus-mark">VS</div><div class="duel-player user fx-${userLv}"><div class="avatar-ring character-ring">${avatarImg(me.avatar,me.nickname,'duel-face')}</div><h4>${html(me.nickname)}</h4><div class="two-cards">${g.userCards.map(c=>seotdaCard(c,false)).join('')}</div>${done?seotdaRankBadge(g.result.userRank):''}</div></div>${done?`<div class="result-banner mega seotda-result fx-${winnerLv}">${winnerLv>=5?'<span class="seotda-burst">✦ ✦ ✦</span>':''}${html(g.result.text)} ${g.result.payout?`· ${money(g.result.payout)} 정산`:''}</div><button class="primary new-seotda" type="button">다음 판</button>`:`<div class="seotda-actions"><button class="danger" data-seotda="fold" type="button">다이</button><button class="secondary" data-seotda="show" type="button">승부</button><button class="primary" data-seotda="double" type="button">두 배 승부</button></div>`}</div>`;if(done&&winnerLv>=5){fx('win');setTimeout(confetti,100)}$$('[data-seotda]',root).forEach(b=>b.onclick=async()=>{try{const d=await api('/api/solo/seotda/action',{method:'POST',body:JSON.stringify({action:b.dataset.seotda})});me=d.user;updateHeader();renderSeotda(d.game)}catch(e){toast(e.message)}});$('.new-seotda',root)?.addEventListener('click',async()=>{await api('/api/solo/seotda/reset',{method:'POST',body:'{}'});root.classList.add('hidden');$('#seotdaStart').classList.remove('hidden')})}

// GOSTOP
function resetGostopUI(){if($('#gostopTable')?.classList.contains('hidden'))$('#gostopStart')?.classList.remove('hidden')}
async function loadGostop(){try{const d=await api('/api/solo/gostop');if(d.game)renderGostop(d.game);else{$('#gostopTable').classList.add('hidden');$('#gostopStart').classList.remove('hidden')}}catch(e){toast(e.message)}}
const MONTH_ICON=['','🌲','🐦','🌸','🌿','🌺','🦋','🍁','🌕','🍂','🦌','🎑','☔'];
function hwatuCard(c,clickable=false){if(c.id==='XX')return `<div class="hwatu-card hidden-card"><span>花</span></div>`;return `<button class="hwatu-card month-${c.m} ${clickable?'clickable':''}" ${clickable?`data-hwatu="${c.id}"`:''} type="button"><small>${c.m}월 · ${html(c.type)}</small><b>${MONTH_ICON[c.m]}</b><span>${['광','열끗','띠','피'].includes(c.type)?c.type:''}</span></button>`}
async function startGostop(){try{const d=await api('/api/solo/gostop/start',{method:'POST',body:JSON.stringify({bet:Number($('#gostopBet').value)})});me=d.user;updateHeader();renderGostop(d.game)}catch(e){toast(e.message)}}
function scoreBox(label,s,go,face=''){return `<div class="gscore"><div class="gscore-who">${face}<span>${html(label)}</span></div><b>${s.score}점</b><small>광 ${s.g} · 열 ${s.a} · 띠 ${s.r} · 피 ${s.p} · GO ${go}</small></div>`}
function renderGostop(g){$('#gostopStart').classList.add('hidden');const root=$('#gostopTable');root.classList.remove('hidden');const done=g.phase==='complete';root.innerHTML=`<div class="gostop-board panel"><div class="gostop-top"><div>${scoreBox('J-BOT',g.score.bot,g.goCount.bot,botFace('gostop','score-face'))}</div><div class="deck-stack"><div class="hwatu-card hidden-card mini"><span>花</span></div><b>${g.deckCount}장</b></div><div>${scoreBox(`${me.nickname} · 나`,g.score.user,g.goCount.user,avatarImg(me.avatar,me.nickname,'score-face'))}</div></div><div class="bot-hand-row">${g.hands.bot.map(c=>hwatuCard(c,false)).join('')}</div><div class="floor-title">바닥패</div><div class="floor-cards">${g.floor.map(c=>hwatuCard(c,false)).join('')||'<span class="empty-floor">바닥패 없음</span>'}</div><div class="capture-strip"><div><span>내가 먹은 패</span><b>${g.captured.user.length}장</b></div><div><span>J-BOT이 먹은 패</span><b>${g.captured.bot.length}장</b></div></div><div class="my-hand-title">내 손패 · 같은 월의 바닥패를 노려봐</div><div class="my-hand-row">${g.hands.user.map(c=>hwatuCard(c,!done&&!g.needDecision&&g.turn==='user')).join('')}</div>${g.needDecision?`<div class="go-stop-decision"><div><small>SCORE UP</small><h3>${g.score.user.score}점! 계속 갈까?</h3></div><button class="primary" data-gdecision="go" type="button">GO</button><button class="danger" data-gdecision="stop" type="button">STOP</button></div>`:''}${done?`<div class="result-banner mega">${g.winner==='user'?'🏆 승리!':'🤖 J-BOT 승리'} · ${html(g.result?.reason||'')} ${g.result?.payout?`· ${money(g.result.payout)} 획득`:''}</div><button class="primary new-gostop" type="button">다음 판</button>`:''}</div>`;$$('[data-hwatu]',root).forEach(b=>b.onclick=async()=>{try{b.disabled=true;const d=await api('/api/solo/gostop/play',{method:'POST',body:JSON.stringify({cardId:b.dataset.hwatu})});if(d.user){me=d.user;updateHeader()}renderGostop(d.game)}catch(e){toast(e.message)}});$$('[data-gdecision]',root).forEach(b=>b.onclick=async()=>{try{const d=await api('/api/solo/gostop/decision',{method:'POST',body:JSON.stringify({decision:b.dataset.gdecision})});if(d.user){me=d.user;updateHeader()}renderGostop(d.game)}catch(e){toast(e.message)}});$('.new-gostop',root)?.addEventListener('click',async()=>{await api('/api/solo/gostop/reset',{method:'POST',body:'{}'});root.classList.add('hidden');$('#gostopStart').classList.remove('hidden')})}

function confetti(){for(let i=0;i<34;i++){const x=document.createElement('i');x.style.cssText=`position:fixed;z-index:999;left:${Math.random()*100}vw;top:-15px;width:7px;height:14px;background:hsl(${Math.random()*360} 90% 65%);transform:rotate(${Math.random()*180}deg);transition:1.8s linear;pointer-events:none`;document.body.appendChild(x);requestAnimationFrame(()=>{x.style.top='105vh';x.style.transform+=` translateX(${(Math.random()-.5)*180}px) rotate(720deg)`});setTimeout(()=>x.remove(),1900)}}
window.addEventListener('error',e=>{console.error('[JGC UI]',e.error||e.message);const t=$('#toast');if(t){t.textContent='화면 오류를 감지했어. 새로고침하면 자동 복구돼.';t.classList.add('show')}});
window.addEventListener('unhandledrejection',e=>{console.error('[JGC PROMISE]',e.reason)});
boot();

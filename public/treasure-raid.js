(function(){
  'use strict';
  const state={root:null,room:null,rooms:[],poll:null,busy:false,me:null,lastRoomId:null};
  const q=(s,r=state.root||document)=>r?.querySelector?.(s)||null;
  const money=n=>new Intl.NumberFormat('ko-KR').format(Number(n||0))+' G';
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  async function api(path,opts={}){
    if(typeof window.api==='function') return window.api(path,opts);
    const r=await fetch(path,{headers:{'Content-Type':'application/json'},credentials:'same-origin',...opts});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'요청에 실패했어.');return d;
  }
  function toast(msg){if(typeof window.toast==='function')window.toast(msg);else alert(msg)}
  function avatar(p){
    if(typeof window.avatarImg==='function')return window.avatarImg(p.avatar,p.nickname,'tr-face',p.cosmetics||null);
    return ['🧑‍💼','😎','🧢','👑','🐯','🐻','🦊','🐼','🐸','🦁'][Math.abs(Number(p.avatar||0))%10];
  }
  function playerStatus(p){
    const map={waiting:'대기',ready:'준비완료',choosing:'상자 선택',decision:'선택 완료',escaped:'탈출',eliminated:'탈락',complete:'완주'};
    return map[p.status]||p.status||'대기';
  }
  function statusClass(p){return ['eliminated','escaped','complete'].includes(p.status)?p.status:'waiting'}
  function ensureRoot(){state.root=document.getElementById('treasureRaidRoot');return !!state.root}
  async function enter(me){state.me=me||state.me;if(!ensureRoot())return;renderLoading();await loadRooms();startPoll()}
  function leaveView(){stopPoll()}
  function startPoll(){stopPoll();state.poll=setInterval(()=>{if(document.hidden)return;if(document.getElementById('view-treasure')?.classList.contains('active'))refresh(false).catch(()=>{})},2500)}
  function stopPoll(){if(state.poll){clearInterval(state.poll);state.poll=null}}
  function renderLoading(){state.root.innerHTML='<div class="treasure-shell"><div class="tr-hero"><span class="tr-hero-tag">LOADING TREASURE RAID...</span></div><div class="tr-panel tr-empty" style="margin-top:14px">보물 레이드를 불러오는 중...</div></div>'}
  async function refresh(render=true){if(state.busy)return;if(state.room){try{const d=await api('/api/treasure-raid/rooms/'+state.room.id);state.room=d.room;state.me=d.user||state.me;if(render)renderGame()}catch(e){state.room=null;await loadRooms()}}else await loadRooms(render)}
  async function loadRooms(render=true){
    if(state.busy)return;state.busy=true;
    try{const d=await api('/api/treasure-raid/rooms');state.rooms=d.rooms||[];state.me=d.user||state.me;if(d.mine){state.room=d.mine;state.lastRoomId=d.mine.id;renderGame()}else{state.room=null;if(render)renderBrowser()}}
    catch(e){state.root.innerHTML='<div class="treasure-shell"><div class="tr-panel tr-empty">'+esc(e.message)+'</div></div>'}
    finally{state.busy=false}
  }
  function shell(inner){return '<div class="treasure-shell"><div class="tr-hero"><span class="tr-hero-tag">2~6인 · 같은 JUNJA G 사용 · 5 ROUND</span></div>'+inner+'</div>'}
  function renderBrowser(){
    const rooms=state.rooms.length?state.rooms.map(r=>`<div class="tr-room"><div><b>${esc(r.name)}</b><small>${money(r.entry)} · ${r.players}/${r.maxPlayers}명 · ${r.phase==='waiting'?'입장 가능':'진행 중'}</small></div><button class="${r.phase==='waiting'&&r.players<r.maxPlayers?'tr-primary':'tr-ghost'}" data-tr-join="${esc(r.id)}" ${r.phase!=='waiting'||r.players>=r.maxPlayers?'disabled':''}>입장</button></div>`).join(''):'<div class="tr-empty">아직 열린 보물 레이드 방이 없어. 첫 방을 만들어봐.</div>';
    state.root.innerHTML=shell(`<div class="tr-browser-grid"><section class="tr-panel tr-create"><span class="tr-kicker">CREATE RAID ROOM</span><h3>보물 원정대 만들기</h3><p>참가금은 준자랜드 보유머니에서 잠금 처리돼. 게임 중 서버가 재시작되면 참가금은 자동 환급된다.</p><div class="tr-form-row"><input id="trEntry" inputmode="numeric" value="500000" min="10000" step="10000" aria-label="참가금"><select id="trMax"><option value="2">2명</option><option value="3">3명</option><option value="4" selected>4명</option><option value="5">5명</option><option value="6">6명</option></select></div><div class="tr-quick"><button data-tr-entry="100000">10만</button><button data-tr-entry="500000">50만</button><button data-tr-entry="1000000">100만</button></div><button id="trCreate" class="tr-primary" style="width:100%">방 만들고 참가금 걸기</button></section><section class="tr-panel tr-rooms"><div class="tr-headrow"><div><span class="tr-kicker">OPEN EXPEDITIONS</span><h3>열린 원정대</h3></div><button id="trRefresh" class="tr-ghost">새로고침</button></div><div class="tr-room-list">${rooms}</div></section></div><div class="tr-rules"><div class="tr-rule"><b>① 상자 선택</b><span>매 라운드 8개 중 하나</span></div><div class="tr-rule"><b>② 보상 공개</b><span>×0 ~ JACKPOT</span></div><div class="tr-rule"><b>③ 탈출 선택</b><span>현재 보상을 안전하게 확보</span></div><div class="tr-rule"><b>④ 더 깊이</b><span>최대 5라운드 · 위험 증가</span></div></div>`);
    bindBrowser();
  }
  function bindBrowser(){
    q('#trRefresh')?.addEventListener('click',()=>loadRooms());
    state.root.querySelectorAll('[data-tr-entry]').forEach(b=>b.addEventListener('click',()=>{q('#trEntry').value=b.dataset.trEntry}));
    q('#trCreate')?.addEventListener('click',()=>act(async()=>{const entry=Math.floor(Number(q('#trEntry')?.value||0)),maxPlayers=Number(q('#trMax')?.value||4);const d=await api('/api/treasure-raid/rooms',{method:'POST',body:JSON.stringify({entry,maxPlayers})});state.room=d.room;await syncUser(d.user);renderGame()}));
    state.root.querySelectorAll('[data-tr-join]').forEach(b=>b.addEventListener('click',()=>act(async()=>{const d=await api('/api/treasure-raid/rooms/'+b.dataset.trJoin+'/join',{method:'POST',body:'{}'});state.room=d.room;await syncUser(d.user);renderGame()})));
  }
  async function syncUser(user){if(user)state.me=user;try{if(typeof window.refreshMe==='function')await window.refreshMe()}catch{}}
  function myPlayer(){return state.room?.players?.find(p=>Number(p.userId)===Number(state.room.selfId||state.me?.id))||null}
  function renderGame(){
    if(!state.room)return renderBrowser();const r=state.room,p=myPlayer()||{},isHost=Number(r.hostId)===Number(r.selfId),waiting=r.phase==='waiting',playing=r.phase==='playing';
    const roster=(r.players||[]).map(x=>`<div class="tr-player"><div class="tr-avatar">${avatar(x)}</div><div><b>${esc(x.nickname)}${Number(x.userId)===Number(r.hostId)?' 👑':''}</b><small>${money(x.bank||x.entry||r.entry)} · R${x.round||0}</small></div><span class="tr-status ${statusClass(x)}">${playerStatus(x)}</span></div>`).join('');
    const round=Math.max(1,Number(p.round||1));const last=p.lastOutcome||null;const lastChest=Number(p.lastChest||0);
    const chests=Array.from({length:8},(_,i)=>{const n=i+1,chosen=lastChest===n&&p.status!=='choosing',cls=chosen?(last?.key==='trap'?'trap':last?.key==='jackpot'?'jackpot':'open'):'';return `<button class="tr-chest ${cls}" data-tr-chest="${n}" ${!playing||p.status!=='choosing'?'disabled':''}><span>${n}</span>${chosen?`<span class="tr-chest-result">${esc(last.label||'')}</span>`:''}</button>`}).join('');
    const result=last?`<div class="tr-result-card"><b>${esc(last.label)} ${last.key==='jackpot'?'':'· '+(last.mult===0?'전액 소멸':'×'+last.mult)}</b><span>${last.key==='trap'?'원정 실패. 참가금은 소멸됐어.':p.status==='escaped'||p.status==='complete'?'정산 완료 · '+money(p.payout||p.bank):'현재 확보 가능 보상 '+money(p.bank)}</span></div>`:'';
    let actions='';
    if(waiting){actions=`<button id="trReady" class="${p.ready?'tr-ghost':'tr-primary'}">${p.ready?'준비 취소':'준비 완료'}</button>${isHost?'<button id="trStart" class="tr-primary">원정 시작</button>':''}<button id="trLeave" class="tr-danger">방 나가기</button>`}
    else if(playing&&p.status==='decision'){actions='<button id="trCashout" class="tr-primary">🏃 탈출 · '+money(p.bank)+'</button><button id="trContinue" class="tr-ghost">⚔ 계속 도전</button>'}
    else if(playing&&p.status==='choosing'){actions='<button id="trLeave" class="tr-danger">원정 중단 · 현재 보상 정산</button>'}
    else if(['escaped','eliminated','complete'].includes(p.status)){actions='<button id="trLeave" class="tr-ghost">결과 확인 · 방 나가기</button>'}
    const progress=Array.from({length:5},(_,i)=>`<b class="${i+1<=round?'on':''}">${i+1}</b>${i<4?'<i></i>':''}`).join('');
    state.root.innerHTML=shell(`<div class="tr-game"><aside class="tr-panel tr-roster"><div class="tr-headrow"><div><span class="tr-kicker">${esc(r.name)}</span><h3>참가자 ${r.players.length}/${r.maxPlayers}</h3></div><button class="tr-ghost" data-tr-back>← 로비</button></div><div class="tr-player-list">${roster}</div><div class="tr-note" style="margin-top:12px">참가금 ${money(r.entry)} · 참가금은 같은 준자랜드 지갑에서 차감/정산돼. 서버 재시작 시 미정산 참가금은 자동 환급돼.</div></aside><main class="tr-stage"><div class="tr-stage-top"><div class="tr-round"><small>${waiting?'EXPEDITION READY':'CURRENT ROUND'}</small><b>${waiting?'WAITING':'ROUND '+round}</b></div><div class="tr-bank"><small>현재 확보 가능</small><b>${money(p.bank||r.entry)}</b></div></div><div class="tr-prompt">${waiting?'전원이 준비되면 방장이 원정을 시작할 수 있어.':p.status==='choosing'?'보물상자 하나를 선택해!':p.status==='decision'?'지금 탈출할까, 더 깊이 들어갈까?':'원정 결과를 확인해.'}</div><div class="tr-chests">${chests}</div>${result}<div class="tr-actions">${actions}</div></main><aside class="tr-panel tr-info"><span class="tr-kicker">RISK & REWARD</span><h3>보상 배율</h3><div class="tr-progress">${progress}</div><div class="tr-rewards"><div class="tr-reward"><span>☠ 함정</span><b>×0</b></div><div class="tr-reward"><span>🪙 절반</span><b>×0.5</b></div><div class="tr-reward"><span>◎ 기본</span><b>×1</b></div><div class="tr-reward"><span>💰 행운</span><b>×2</b></div><div class="tr-reward"><span>🧰 대박</span><b>×5</b></div><div class="tr-reward"><span>✨ 초대박</span><b>×10</b></div><div class="tr-reward" style="grid-column:span 2"><span>💎 JACKPOT</span><b>최대 ×100</b></div></div><div class="tr-mascot"></div><div class="tr-note">라운드가 깊어질수록 함정과 고배당이 함께 늘어나. ×0.5~×10은 현재 보상에 적용되고, JACKPOT은 참가금의 100배까지 즉시 확보해.</div></aside></div>`);
    bindGame();
  }
  function bindGame(){
    state.root.querySelectorAll('[data-tr-back]').forEach(b=>b.addEventListener('click',()=>window.go?.('lobby')));
    state.root.querySelectorAll('[data-tr-chest]').forEach(b=>b.addEventListener('click',()=>{if(state.busy||b.disabled)return;state.root.querySelectorAll('[data-tr-chest]').forEach(x=>x.disabled=true);b.classList.add('selected');act(async()=>{const d=await api('/api/treasure-raid/rooms/'+state.room.id+'/pick',{method:'POST',body:JSON.stringify({chest:Number(b.dataset.trChest)})});state.room=d.room;await syncUser(d.user);renderGame()})}));
    q('#trReady')?.addEventListener('click',()=>roomAction('ready'));
    q('#trStart')?.addEventListener('click',()=>roomAction('start'));
    q('#trContinue')?.addEventListener('click',()=>roomAction('continue'));
    q('#trCashout')?.addEventListener('click',()=>roomAction('cashout'));
    q('#trLeave')?.addEventListener('click',()=>act(async()=>{const d=await api('/api/treasure-raid/rooms/'+state.room.id+'/leave',{method:'POST',body:'{}'});state.room=null;await syncUser(d.user);toast(d.payout?`보물 레이드 정산 ${money(d.payout)}`:'보물 레이드 방에서 나왔어.');await loadRooms()}));
  }
  function roomAction(op){return act(async()=>{const d=await api('/api/treasure-raid/rooms/'+state.room.id+'/'+op,{method:'POST',body:'{}'});state.room=d.room;await syncUser(d.user);renderGame()})}
  async function act(fn){if(state.busy)return;state.busy=true;try{await fn()}catch(e){toast(e.message);try{await refresh()}catch{}}finally{state.busy=false}}
  window.JunjaTreasureRaid={enter,leaveView,refresh};
})();
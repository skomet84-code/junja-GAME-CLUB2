(function(){
  'use strict';
  const state={root:null,room:null,rooms:[],poll:null,clock:null,busy:false,me:null,lastRoomId:null,bet:10000000,fxKey:null};
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
    const map={waiting:'대기',ready:'준비완료',choosing:'상자 선택',decision:'탈출/도전',escaped:'탈출',eliminated:'탈락',complete:'완주'};
    return map[p.status]||p.status||'대기';
  }
  function statusClass(p){return ['eliminated','escaped','complete'].includes(p.status)?p.status:'waiting'}
  function ensureRoot(){state.root=document.getElementById('treasureRaidRoot');return !!state.root}
  async function enter(me){state.me=me||state.me;if(!ensureRoot())return;renderLoading();await loadRooms();startPoll();startClock()}
  function leaveView(){stopPoll();stopClock();closeJackpotFx()}
  function startPoll(){stopPoll();state.poll=setInterval(()=>{if(document.hidden)return;if(document.getElementById('view-treasure')?.classList.contains('active'))refresh(false).catch(()=>{})},5000)}
  function stopPoll(){if(state.poll){clearInterval(state.poll);state.poll=null}}
  function startClock(){stopClock();state.clock=setInterval(updateCountdown,500)}
  function stopClock(){if(state.clock){clearInterval(state.clock);state.clock=null}}
  function renderLoading(){state.root.innerHTML='<div class="treasure-shell"><div class="tr-hero"><span class="tr-hero-tag">LOADING TREASURE RAID...</span></div><div class="tr-panel tr-empty" style="margin-top:14px">보물 레이드를 불러오는 중...</div></div>'}
  async function refresh(render=true){
    if(state.busy)return;
    if(state.room){
      try{
        const oldVersion=state.room.version;
        const d=await api('/api/treasure-raid/rooms/'+state.room.id);state.room=d.room;state.me=d.user||state.me;
        if(render||oldVersion!==state.room.version)renderGame();
      }catch(e){state.room=null;await loadRooms()}
    }else await loadRooms(render);
  }
  async function loadRooms(render=true){
    if(state.busy)return;state.busy=true;
    try{
      const d=await api('/api/treasure-raid/rooms');state.rooms=d.rooms||[];state.me=d.user||state.me;
      if(d.mine){state.room=d.mine;state.lastRoomId=d.mine.id;renderGame()}else{state.room=null;if(render)renderBrowser()}
    }catch(e){state.root.innerHTML='<div class="treasure-shell"><div class="tr-panel tr-empty">'+esc(e.message)+'</div></div>'}
    finally{state.busy=false}
  }
  function shell(inner){return '<div class="treasure-shell"><div class="tr-hero"><span class="tr-hero-tag">1~6인 · 각자 자유 배팅 · 30초 자동 탈출 · 5 ROUND</span></div>'+inner+'</div>'}
  function readBet(){const v=Math.floor(Number(q('#trEntry')?.value||state.bet||10000000));state.bet=Math.max(1000000,Math.min(1000000000,Math.floor(v/1000000)*1000000));if(q('#trEntry'))q('#trEntry').value=state.bet;return state.bet}
  function renderBrowser(){
    const rooms=state.rooms.length?state.rooms.map(r=>`<div class="tr-room"><div><b>${esc(r.name)}</b><small>각자 배팅 · ${r.players}/${r.maxPlayers}명 · ${r.phase==='waiting'?'입장 가능':'진행 중'}</small></div><button class="${r.phase==='waiting'&&r.players<r.maxPlayers?'tr-primary':'tr-ghost'}" data-tr-join="${esc(r.id)}" ${r.phase!=='waiting'||r.players>=r.maxPlayers?'disabled':''}>이 금액으로 입장</button></div>`).join(''):'<div class="tr-empty">아직 열린 보물 레이드 방이 없어. 1인 원정부터 바로 시작해도 돼.</div>';
    state.root.innerHTML=shell(`<div class="tr-browser-grid"><section class="tr-panel tr-create"><span class="tr-kicker">CREATE RAID ROOM</span><h3>내 배팅금으로 원정 참가</h3><p>같은 방이어도 참가자마다 배팅금이 달라도 돼. 내 보유 G에서 내 금액만 잠금/정산된다.</p><div class="tr-form-row"><input id="trEntry" inputmode="numeric" value="${state.bet}" min="1000000" max="1000000000" step="1000000" aria-label="내 배팅금"><select id="trMax"><option value="1">1명 · SOLO</option><option value="2">2명</option><option value="3">3명</option><option value="4" selected>4명</option><option value="5">5명</option><option value="6">6명</option></select></div><div class="tr-quick"><button data-tr-entry="1000000">100만</button><button data-tr-entry="10000000">1,000만</button><button data-tr-entry="100000000">1억</button><button data-tr-entry="1000000000">10억</button></div><button id="trCreate" class="tr-primary" style="width:100%">이 금액으로 방 만들기</button><div class="tr-note" style="margin-top:10px">1인 플레이 가능 · 멀티는 각자 금액 선택 · 상자/탈출 결정은 30초 제한 · 시간초과 시 현재 확보 금액으로 자동 탈출</div></section><section class="tr-panel tr-rooms"><div class="tr-headrow"><div><span class="tr-kicker">OPEN EXPEDITIONS</span><h3>열린 원정대</h3></div><button id="trRefresh" class="tr-ghost">새로고침</button></div><div class="tr-room-list">${rooms}</div></section></div><div class="tr-rules"><div class="tr-rule"><b>① 각자 배팅</b><span>100만 · 1,000만 · 1억 · 10억 기본</span></div><div class="tr-rule"><b>② 30초 선택</b><span>잠수 시 자동 탈출 정산</span></div><div class="tr-rule"><b>③ 독립 진행</b><span>다른 유저가 느려도 내 진행 가능</span></div><div class="tr-rule"><b>④ 더 깊이</b><span>최대 5라운드 · JACKPOT ×100</span></div></div>`);
    bindBrowser();
  }
  function bindBrowser(){
    q('#trRefresh')?.addEventListener('click',()=>loadRooms());
    q('#trEntry')?.addEventListener('change',readBet);
    state.root.querySelectorAll('[data-tr-entry]').forEach(b=>b.addEventListener('click',()=>{state.bet=Number(b.dataset.trEntry);q('#trEntry').value=state.bet}));
    q('#trCreate')?.addEventListener('click',()=>act(async()=>{const entry=readBet(),maxPlayers=Number(q('#trMax')?.value||4);const d=await api('/api/treasure-raid/rooms',{method:'POST',body:JSON.stringify({entry,maxPlayers})});state.room=d.room;await syncUser(d.user);renderGame()}));
    state.root.querySelectorAll('[data-tr-join]').forEach(b=>b.addEventListener('click',()=>act(async()=>{const entry=readBet();const d=await api('/api/treasure-raid/rooms/'+b.dataset.trJoin+'/join',{method:'POST',body:JSON.stringify({entry})});state.room=d.room;await syncUser(d.user);renderGame()})));
  }
  async function syncUser(user){if(user)state.me=user;try{if(typeof window.refreshMe==='function')await window.refreshMe()}catch{}}
  function myPlayer(){return state.room?.players?.find(p=>Number(p.userId)===Number(state.room.selfId||state.me?.id))||null}
  function timeLeft(p){if(!p?.deadlineAt)return 0;return Math.max(0,Math.ceil((Number(p.deadlineAt)-Date.now())/1000))}
  function renderGame(){
    if(!state.room)return renderBrowser();
    const r=state.room,p=myPlayer()||{},isHost=Number(r.hostId)===Number(r.selfId),waiting=r.phase==='waiting',playing=r.phase==='playing',complete=r.phase==='complete',allReady=(r.players||[]).every(x=>x.ready);
    const roster=(r.players||[]).map(x=>`<div class="tr-player"><div class="tr-avatar">${avatar(x)}</div><div><b>${esc(x.nickname)}${Number(x.userId)===Number(r.hostId)?' 👑':''}</b><small>시작 ${money(x.entry)} · 현재 ${money(x.bank||0)} · R${x.round||0}</small></div><span class="tr-status ${statusClass(x)}">${playerStatus(x)}</span></div>`).join('');
    const round=Math.max(1,Number(p.round||1)),last=p.lastOutcome||null,lastChest=Number(p.lastChest||0);
    const chests=Array.from({length:8},(_,i)=>{const n=i+1,chosen=lastChest===n&&p.status!=='choosing',cls=chosen?(last?.key==='trap'?'trap':last?.key==='jackpot'?'jackpot':'open'):'';return `<button class="tr-chest ${cls}" data-tr-chest="${n}" ${!playing||p.status!=='choosing'?'disabled':''}><span>${n}</span>${chosen?`<span class="tr-chest-result">${esc(last.label||'')}</span>`:''}</button>`}).join('');
    const result=last?`<div class="tr-result-card ${last.key==='jackpot'?'is-jackpot':''}"><b>${esc(last.label)} ${last.key==='jackpot'?'· ×100':'· '+(last.mult===0?'전액 소멸':'×'+last.mult)}</b><span>${last.key==='trap'?'원정 실패. 이번 배팅금은 소멸됐어.':p.status==='escaped'||p.status==='complete'?'정산 완료 · '+money(p.payout||p.bank):'현재 확보 가능 보상 '+money(p.bank)}</span></div>`:'';
    let actions='';
    if(complete){
      actions='<button id="trReplayReady" class="tr-primary">🔄 같은 방에서 다시 준비</button><button id="trLeave" class="tr-ghost">방 나가기</button>';
    }else if(waiting){
      actions=`<button id="trReady" class="${p.ready?'tr-ghost':'tr-primary'}">${p.ready?'준비 취소':'준비 완료'}</button>`;
      if(isHost)actions+=(r.players.length===1||allReady)?'<button id="trStart" class="tr-primary">원정 시작</button>':'<button id="trForceStart" class="tr-primary">준비된 인원으로 시작</button>';
      actions+='<button id="trLeave" class="tr-danger">방 나가기</button>';
    }else if(playing&&p.status==='decision'){
      actions='<button id="trCashout" class="tr-primary">🏃 탈출 · '+money(p.bank)+'</button><button id="trContinue" class="tr-ghost">⚔ 계속 도전</button>';
    }else if(playing&&p.status==='choosing'){
      actions='<button id="trCashout" class="tr-danger">🏳 포기 · '+money(p.bank)+' 자동정산</button>';
    }else if(['escaped','eliminated','complete'].includes(p.status)){
      actions='<button id="trLeave" class="tr-ghost">결과 확인 · 방 나가기</button>';
    }
    const progress=Array.from({length:5},(_,i)=>`<b class="${i+1<=round?'on':''}">${i+1}</b>${i<4?'<i></i>':''}`).join('');
    const timer=(playing&&['choosing','decision'].includes(p.status))?`<div class="tr-timer"><span>선택 제한</span><b id="trCountdown">${timeLeft(p)}</b><em>초</em><small>시간초과 시 현재 금액 자동 탈출</small></div>`:'';
    state.root.innerHTML=shell(`<div class="tr-game"><aside class="tr-panel tr-roster"><div class="tr-headrow"><div><span class="tr-kicker">${esc(r.name)}</span><h3>참가자 ${r.players.length}/${r.maxPlayers}</h3></div><button class="tr-ghost" data-tr-back>← 로비</button></div><div class="tr-player-list">${roster}</div><div class="tr-note" style="margin-top:12px">멀티도 각자 배팅금이 다를 수 있어. 다른 유저가 잠수·이탈해도 각자의 원정 진행은 독립적으로 계속된다.</div></aside><main class="tr-stage"><div class="tr-stage-top"><div class="tr-round"><small>${complete?'EXPEDITION COMPLETE':waiting?'EXPEDITION READY':'CURRENT ROUND'}</small><b>${complete?'RESULT':waiting?'WAITING':'ROUND '+round}</b></div><div class="tr-bank"><small>내 시작 배팅</small><b>${money(p.entry||0)}</b><small>현재 확보 가능</small><b>${money(p.bank||0)}</b></div></div>${timer}<div class="tr-prompt">${complete?'한 판 종료! 나갈 필요 없이 같은 멤버·같은 방에서 바로 다시 준비할 수 있어.':waiting?(r.players.length===1?'준비 후 바로 다시 시작할 수 있어.':'전원이 준비하면 바로 재시작. 잠수 인원은 방장이 제외 후 시작 가능.'):(p.status==='choosing'?'30초 안에 보물상자 하나를 선택해!':p.status==='decision'?'30초 안에 탈출할지 더 도전할지 선택해!':'원정 결과를 확인해.')}</div><div class="tr-chests">${chests}</div>${result}<div class="tr-actions">${actions}</div></main><aside class="tr-panel tr-info"><span class="tr-kicker">RISK & REWARD</span><h3>보상 배율</h3><div class="tr-progress">${progress}</div><div class="tr-rewards"><div class="tr-reward"><span>☠ 함정</span><b>×0</b></div><div class="tr-reward"><span>🪙 절반</span><b>×0.5</b></div><div class="tr-reward"><span>◎ 기본</span><b>×1</b></div><div class="tr-reward"><span>💰 행운</span><b>×2</b></div><div class="tr-reward"><span>🧰 대박</span><b>×5</b></div><div class="tr-reward"><span>✨ 초대박</span><b>×10</b></div><div class="tr-reward" style="grid-column:span 2"><span>💎 JACKPOT</span><b>×100</b></div></div><div class="tr-mascot"></div><div class="tr-note">라운드가 깊어질수록 함정과 고배당이 함께 늘어나. JACKPOT은 내 시작 배팅금의 100배를 즉시 정산하고 전용 연출이 재생돼.</div></aside></div>`);
    bindGame();updateCountdown();maybeJackpotFx(r,p);
  }
  function bindGame(){
    state.root.querySelectorAll('[data-tr-back]').forEach(b=>b.addEventListener('click',()=>window.go?.('lobby')));
    state.root.querySelectorAll('[data-tr-chest]').forEach(b=>b.addEventListener('click',()=>{if(state.busy||b.disabled)return;state.root.querySelectorAll('[data-tr-chest]').forEach(x=>x.disabled=true);b.classList.add('selected');act(async()=>{const d=await api('/api/treasure-raid/rooms/'+state.room.id+'/pick',{method:'POST',body:JSON.stringify({chest:Number(b.dataset.trChest)})});state.room=d.room;await syncUser(d.user);renderGame()})}));
    q('#trReplayReady')?.addEventListener('click',()=>{
      // Preserve the completed room id before replay reset.
      if(state.room?.id)state.lastRoomId=state.room.id;
      roomAction('ready')
    });
    q('#trReady')?.addEventListener('click',()=>roomAction('ready'));
    q('#trStart')?.addEventListener('click',()=>roomAction('start'));
    q('#trForceStart')?.addEventListener('click',()=>{if(confirm('준비하지 않은 참가자는 배팅금을 전액 환급하고 방에서 제외한 뒤 시작할까?'))roomAction('start',{force:true})});
    q('#trContinue')?.addEventListener('click',()=>roomAction('continue'));
    q('#trCashout')?.addEventListener('click',()=>roomAction('cashout'));
    q('#trLeave')?.addEventListener('click',()=>act(async()=>{const d=await api('/api/treasure-raid/rooms/'+state.room.id+'/leave',{method:'POST',body:'{}'});state.room=null;await syncUser(d.user);toast(d.payout?`보물 레이드 정산 ${money(d.payout)}`:'보물 레이드 방에서 나왔어.');await loadRooms()}));
  }
  function roomAction(op,body={}){return act(async()=>{
    // Capture the room id before any refresh/render can clear state.room.
    // This is especially important on the complete -> replay-ready transition,
    // where polling may replace the client room state while the tap is handled.
    const roomId=state.room?.id||state.lastRoomId;
    if(!roomId){await loadRooms();toast('원정대 정보를 다시 불러왔어. 다시 눌러줘.');return}
    const d=await api('/api/treasure-raid/rooms/'+roomId+'/'+op,{method:'POST',body:JSON.stringify(body)});
    state.room=d.room;state.lastRoomId=d.room?.id||roomId;await syncUser(d.user);renderGame()
  })}
  function updateCountdown(){
    const el=q('#trCountdown');if(!el)return;const p=myPlayer(),left=timeLeft(p);el.textContent=String(left);el.parentElement?.classList.toggle('urgent',left<=10);if(left<=0)el.textContent='0';
  }
  function maybeJackpotFx(r,p){
    if(p?.lastOutcome?.key!=='jackpot'||!Number(p.payout||0))return;
    const key=`${r.id}:${p.userId}:${p.round}:${p.lastChest}:${p.payout}`;if(state.fxKey===key)return;state.fxKey=key;playJackpotFx(p);
  }
  function playJackpotFx(p){
    closeJackpotFx();
    const fx=document.createElement('div');fx.id='trJackpotFx';fx.className='tr-jackpot-fx';fx.innerHTML=`<div class="tr-jackpot-rays"></div><div class="tr-jackpot-burst">${Array.from({length:54},(_,i)=>`<i style="--i:${i};--x:${Math.round(Math.random()*100)}%;--d:${(Math.random()*1.8).toFixed(2)}s;--r:${Math.round(Math.random()*720-360)}deg"></i>`).join('')}</div><div class="tr-jackpot-core"><small>JUNJA TREASURE RAID</small><strong>JACKPOT</strong><div>×100</div><b>${money(p.payout)}</b><span>보물이 폭발했다!</span><button type="button">확인</button></div>`;
    document.body.appendChild(fx);fx.querySelector('button')?.addEventListener('click',closeJackpotFx);fx.addEventListener('click',e=>{if(e.target===fx)closeJackpotFx()});try{navigator.vibrate?.([120,50,120,50,220])}catch{};setTimeout(()=>{if(document.getElementById('trJackpotFx')===fx)closeJackpotFx()},5500);
  }
  function closeJackpotFx(){document.getElementById('trJackpotFx')?.remove()}
  async function act(fn){if(state.busy)return;state.busy=true;try{await fn()}catch(e){toast(e.message);try{await refresh()}catch{}}finally{state.busy=false}}
  window.JunjaTreasureRaid={enter,leaveView,refresh};
})();
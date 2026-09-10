const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
let me=null, currentView='lobby', currentRoomId=null, currentGame=null, events=null, selectedBet=10000, refreshTimer=null, slotSpinState=null;
const SLOT_SYMBOLS=['🍒','🍋','🍊','🔔','⭐','💎','7️⃣'];
const SLOT_CELL_CLASS={'🍒':'cherry','🍋':'lemon','🍊':'orange','🔔':'bell','⭐':'star','💎':'diamond','7️⃣':'seven'};
const money=n=>new Intl.NumberFormat('ko-KR').format(Number(n||0))+' G';
const timeText=t=>new Intl.DateTimeFormat('ko-KR',{hour:'2-digit',minute:'2-digit',month:'numeric',day:'numeric'}).format(new Date(t));
function toast(msg){const e=$('#toast');e.textContent=msg;e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('show'),2200)}
async function api(url,opts={}){const res=await fetch(url,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});let data={};try{data=await res.json()}catch{}if(!res.ok)throw new Error(data.error||'요청에 실패했습니다.');return data;}
function setAuthTab(tab){$$('[data-auth-tab]').forEach(b=>b.classList.toggle('active',b.dataset.authTab===tab));$('#loginForm').classList.toggle('hidden',tab!=='login');$('#registerForm').classList.toggle('hidden',tab!=='register');$('#authMsg').textContent='';}
$$('[data-auth-tab]').forEach(b=>b.onclick=()=>setAuthTab(b.dataset.authTab));
$('#loginForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api('/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});me=d.user;bootMain();}catch(err){$('#authMsg').textContent=err.message}};
$('#registerForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api('/api/register',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});me=d.user;bootMain();}catch(err){$('#authMsg').textContent=err.message}};

async function boot(){try{const d=await api('/api/me');me=d.user;bootMain();}catch{$('#authScreen').classList.remove('hidden');}}
function bootMain(){
  $('#authScreen').classList.add('hidden');$('#mainApp').classList.remove('hidden');updateHeader();bindMain();connectEvents();const q=new URLSearchParams(location.search),rid=q.get('room'),game=q.get('game');if(rid&&['holdem','yut'].includes(game)){go(game).then(()=>joinRoom(game,rid));}else go('lobby');
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
  if(!localStorage.getItem('jgc_help_seen')) setTimeout(()=>openHelp('lobby'),650);
}
let mainBound=false;
function bindMain(){if(mainBound)return;mainBound=true;
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
  $('#dailyBtn').onclick=claimDaily;$('#refreshRank').onclick=loadLobby;$('#profileBtn').onclick=openProfile;$('#closeProfile').onclick=()=>$('#profileSheet').classList.add('hidden');
  $('#profileSheet').onclick=e=>{if(e.target.id==='profileSheet')$('#profileSheet').classList.add('hidden')};
  $('#logoutBtn').onclick=logout;$('#refreshHoldem').onclick=()=>loadRooms('holdem');$('#refreshYut').onclick=()=>loadRooms('yut');
  $('#createHoldem').onclick=()=>createRoom('holdem');$('#createYut').onclick=()=>createRoom('yut');
  $('#spinBtn').onclick=spin;$('#gostopCard').onclick=()=>toast('고스톱은 다음 버전에서 화투 엔진까지 제대로 붙일 예정이야.');
  const betRoot=$('#betRow');
  if(betRoot && !betRoot.children.length){
    for(const b of [1000,5000,10000,25000,50000]){
      const el=document.createElement('button');
      el.className='bet-chip'+(b===selectedBet?' active':'');
      el.textContent=money(b);
      el.onclick=()=>{
        selectedBet=b;
        $$('.bet-chip').forEach(x=>x.classList.remove('active'));
        el.classList.add('active');
        updateCurrentBetLabel();
      };
      betRoot.appendChild(el);
    }
  }
  $('#helpBtn').onclick=()=>openHelp(currentView);
  $('#closeHelp').onclick=closeHelp;
  $('#helpDone').onclick=()=>{localStorage.setItem('jgc_help_seen','1');closeHelp()};
  $('.help-backdrop').onclick=closeHelp;
  $$('[data-open-help]').forEach(b=>b.onclick=e=>{e.stopPropagation();openHelp(b.dataset.openHelp)});
  $$('[data-help-tab]').forEach(b=>b.onclick=()=>setHelpTab(b.dataset.helpTab));
  initSlotMachine();
}

function setHelpTab(tab='lobby'){
  if(!['lobby','slot','holdem','yut'].includes(tab))tab='lobby';
  $$('[data-help-tab]').forEach(b=>b.classList.toggle('active',b.dataset.helpTab===tab));
  $$('[data-help-page]').forEach(p=>p.classList.toggle('active',p.dataset.helpPage===tab));
}
function openHelp(tab=currentView){
  setHelpTab(tab);
  $('#helpModal').classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function closeHelp(){
  $('#helpModal').classList.add('hidden');
  document.body.classList.remove('modal-open');
}
function connectEvents(){if(events)events.close();events=new EventSource('/api/events');events.addEventListener('refresh',e=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{try{const d=await api('/api/me');me=d.user;updateHeader();if(currentRoomId)await loadCurrentRoom();else if(currentView==='holdem')await loadRooms('holdem');else if(currentView==='yut')await loadRooms('yut');else if(currentView==='lobby')await loadLobby(false);}catch{}},160)});}
function updateHeader(){if(!me)return;$('#walletBalance').textContent=money(me.balance);$('#avatarEmoji').textContent=me.avatarEmoji;$('#nickName').textContent=me.nickname;$('#dailyBtn').disabled=!me.dailyAvailable;$('#dailyBtn').textContent=me.dailyAvailable?'🎁 출석 +50,000 G':'✓ 오늘 출석 완료';}
async function refreshMe(){const d=await api('/api/me');me=d.user;updateHeader();$('#onlineCount').textContent='ONLINE '+d.online;return d;}
async function go(view){
  if(currentRoomId && !['holdem','yut'].includes(view)){toast('먼저 게임방에서 나가기를 눌러줘.');return;}
  currentView=view;$$('.view').forEach(v=>v.classList.remove('active'));$('#view-'+view)?.classList.add('active');window.scrollTo({top:0,behavior:'smooth'});
  if(view==='lobby')await loadLobby();if(view==='holdem')await loadRooms('holdem');if(view==='yut')await loadRooms('yut');if(view==='ledger')await loadLedger();
}
async function loadLobby(full=true){try{await refreshMe();const d=await api('/api/leaderboard');$('#leaderboard').innerHTML=d.rows.map((r,i)=>`<div class="rank-row"><div class="rank-no">${i+1}</div><div class="rank-name"><span>${r.avatarEmoji}</span><span>${html(r.nickname)}</span></div><div class="rank-money">${money(r.balance)}</div></div>`).join('')||'<div class="empty">아직 랭킹이 없습니다.</div>';
  $('#myStats').innerHTML=`<div class="stat"><span>홀덤 승리</span><b>${me.poker_wins}</b></div><div class="stat"><span>윷놀이 승리</span><b>${me.yut_wins}</b></div><div class="stat"><span>슬롯 스핀</span><b>${me.slot_spins}</b></div><div class="stat"><span>슬롯 손익</span><b>${signedMoney(me.slot_profit)}</b></div>`;}catch(e){if(full)toast(e.message)}}
async function claimDaily(){try{const d=await api('/api/daily',{method:'POST',body:'{}'});toast(`출석 보너스 +${money(d.amount)}`);await refreshMe();}catch(e){toast(e.message)}}
async function openProfile(){await refreshMe();$('#profileContent').innerHTML=`<div class="profile-big"><div class="emoji">${me.avatarEmoji}</div><h3>${html(me.nickname)}</h3><p>@${html(me.username)} · 가입 ${new Date(me.created_at).toLocaleDateString('ko-KR')}</p></div><div class="stat-grid"><div class="stat"><span>보유머니</span><b>${money(me.balance)}</b></div><div class="stat"><span>홀덤</span><b>${me.poker_wins}/${me.poker_hands}승</b></div><div class="stat"><span>윷놀이</span><b>${me.yut_wins}/${me.yut_games}승</b></div><div class="stat"><span>슬롯 손익</span><b>${signedMoney(me.slot_profit)}</b></div></div><p style="color:#8b95aa;font-size:11px;text-align:center">게임머니는 현금 가치가 없으며 충전·환전·상품교환이 불가능합니다.</p>`;$('#profileSheet').classList.remove('hidden')}
async function logout(){await api('/api/logout',{method:'POST',body:'{}'}).catch(()=>{});location.reload()}
async function loadLedger(){try{const d=await api('/api/ledger');$('#ledgerList').innerHTML=d.rows.map(r=>`<div class="ledger-row"><div><b>${html(r.memo)}</b><small>${timeText(r.created_at)} · 잔액 ${money(r.balance_after)}</small></div><b class="${r.amount>=0?'plus':'minus'}">${r.amount>=0?'+':''}${money(r.amount)}</b></div>`).join('')||'<div class="empty">내역이 없습니다.</div>'}catch(e){toast(e.message)}}


function updateCurrentBetLabel(){const el=$('#currentBetLabel');if(el)el.textContent=money(selectedBet)}
function randomSlotSymbol(){return SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)]}
function slotCell(sym,r,c,highlight=false){return `<div class="slot-cell ${SLOT_CELL_CLASS[sym]||''} ${highlight?'win':''}" data-r="${r}" data-c="${c}"><span>${sym}</span></div>`}
function renderSlotGrid(grid, highlights=[]){
  if(!grid) return;
  const mark=new Set(highlights.map(([r,c])=>`${r}-${c}`));
  for(let c=0;c<3;c++){
    const inner=$(`.slot-column[data-col="${c}"] .slot-column-inner`);
    if(!inner) continue;
    inner.innerHTML='';
    for(let r=0;r<3;r++) inner.insertAdjacentHTML('beforeend', slotCell(grid[r][c], r, c, mark.has(`${r}-${c}`)));
  }
}
function initSlotMachine(){
  updateCurrentBetLabel();
  if(!$('#slotGrid')) return;
  if(!slotSpinState){
    const initial=Array.from({length:3},()=>Array.from({length:3},()=>randomSlotSymbol()));
    renderSlotGrid(initial,[]);
  }
}
function startSlotSpin(){
  clearSlotEffects();
  const columns=$$('.slot-column');
  slotSpinState={timers:[]};
  columns.forEach((col,idx)=>{
    col.classList.add('spinning');
    const inner=col.querySelector('.slot-column-inner');
    const tick=()=>{
      const syms=[randomSlotSymbol(),randomSlotSymbol(),randomSlotSymbol()];
      inner.innerHTML=syms.map((sym,row)=>slotCell(sym,row,idx,false)).join('');
    };
    tick();
    slotSpinState.timers.push(setInterval(tick,90+(idx*25)));
  });
  $('#slotGrid')?.classList.add('is-spinning');
}
async function stopSlotSpin(grid, highlights=[]){
  const columns=$$('.slot-column');
  for(let c=0;c<columns.length;c++){
    const col=columns[c];
    await sleep(220);
    clearInterval(slotSpinState?.timers?.[c]);
    const inner=col.querySelector('.slot-column-inner');
    inner.innerHTML='';
    const mark=new Set(highlights.map(([r,cc])=>`${r}-${cc}`));
    for(let r=0;r<3;r++) inner.insertAdjacentHTML('beforeend',slotCell(grid[r][c],r,c,mark.has(`${r}-${c}`)));
    col.classList.remove('spinning');
    col.classList.add('settled');
    setTimeout(()=>col.classList.remove('settled'),300);
  }
  $('#slotGrid')?.classList.remove('is-spinning');
  slotSpinState=null;
}
function clearSlotEffects(){
  $$('.slot-cell.win').forEach(x=>x.classList.remove('win'));
  $$('.payline.active').forEach(x=>x.classList.remove('active'));
  $('#slotWins').innerHTML='';
}
function applySlotHighlights(winLines=[]){
  clearSlotEffects();
  const activeCells=new Set();
  winLines.forEach((w,idx)=>{
    $(`.payline-${w.cssClass}`)?.classList.add('active');
    (w.cells||[]).forEach(([r,c])=>activeCells.add(`${r}-${c}`));
  });
  activeCells.forEach(key=>{
    const [r,c]=key.split('-');
    $(`.slot-cell[data-r="${r}"][data-c="${c}"]`)?.classList.add('win');
  });
  $('#slotWins').innerHTML=winLines.map(w=>`<div class="win-pill">${w.label} · ${w.symbols.join(' ')} · x${w.mult}</div>`).join('');
}
async function spin(){
  const btn=$('#spinBtn');
  if(btn.disabled)return;
  btn.disabled=true;
  $('#slotResult').textContent='릴 회전 중...';
  startSlotSpin();
  try{
    const d=await api('/api/slot/spin',{method:'POST',body:JSON.stringify({bet:selectedBet})});
    await sleep(700);
    const highlightCells=(d.winLines||[]).flatMap(w=>w.cells||[]);
    await stopSlotSpin(d.grid, highlightCells);
    applySlotHighlights(d.winLines||[]);
    if(d.payout>0){
      $('#slotResult').textContent=`${d.jackpot?'🔥 JACKPOT! ':''}${money(d.payout)} 당첨 · 총 배당 x${d.totalMultiplier}`;
      if(d.jackpot || (d.winLines||[]).length>=2) confetti();
    }else{
      $('#slotResult').textContent=`-${money(d.bet)} · 아쉽지만 다음 스핀 도전`;
    }
    me=d.user;updateHeader();
  }catch(e){
    (slotSpinState?.timers||[]).forEach(clearInterval);
    slotSpinState=null;
    clearSlotEffects();
    $$('.slot-column').forEach(col=>col.classList.remove('spinning'));
    $('#slotGrid')?.classList.remove('is-spinning');
    toast(e.message);
  }finally{btn.disabled=false}
}


async function createRoom(game){try{
  const body=game==='holdem'?{game,name:$('#holdemRoomName').value,buyIn:Number($('#holdemBuyIn').value),maxPlayers:Number($('#holdemMax').value)}:{game,name:$('#yutRoomName').value,buyIn:Number($('#yutBuyIn').value),maxPlayers:Number($('#yutMax').value)};
  const d=await api('/api/rooms',{method:'POST',body:JSON.stringify(body)});currentRoomId=d.room.id;currentGame=game;renderRoom(d.room);await refreshMe();toast(`방 코드 ${d.room.id} 생성 완료`);
}catch(e){toast(e.message)}}
async function loadRooms(game){if(currentRoomId)return loadCurrentRoom();try{const d=await api('/api/rooms?game='+game);const root=$('#'+game+'Rooms');root.innerHTML=d.rooms.map(r=>`<div class="room-row"><div><h4>${html(r.name)} <span class="status ${r.status==='PLAYING'?'play':'wait'}">${r.status}</span></h4><p>코드 ${r.id} · ${r.players}/${r.maxPlayers}명 · ${money(r.buyIn)} ${game==='holdem'?`· BLIND ${money(r.smallBlind)}/${money(r.bigBlind)}`:'참가금'}</p></div><button class="secondary" data-join="${r.id}" ${r.status==='PLAYING'?'disabled':''}>입장</button></div>`).join('')||'<div class="empty">열린 방이 없어. 먼저 하나 만들어봐.</div>';$$('[data-join]',root).forEach(b=>b.onclick=()=>joinRoom(game,b.dataset.join));}catch(e){toast(e.message)}}
async function joinRoom(game,id){try{const d=await api(`/api/rooms/${id}/join`,{method:'POST',body:'{}'});currentRoomId=id;currentGame=game;renderRoom(d.room);await refreshMe();}catch(e){toast(e.message)}}
async function loadCurrentRoom(){if(!currentRoomId)return;try{const d=await api(`/api/rooms/${currentRoomId}`);renderRoom(d.room);await refreshMe();}catch(e){toast(e.message);currentRoomId=null;currentGame=null;go(currentView)}}
function renderRoom(room){if(room.game==='holdem')renderHoldem(room);else renderYut(room)}
async function leaveRoom(){if(!currentRoomId)return;try{await api(`/api/rooms/${currentRoomId}/leave`,{method:'POST',body:'{}'});currentRoomId=null;currentGame=null;await refreshMe();if(currentView==='holdem'){$('#holdemRoom').classList.add('hidden');$('#holdemBrowser').classList.remove('hidden');loadRooms('holdem')}else{$('#yutRoom').classList.add('hidden');$('#yutBrowser').classList.remove('hidden');loadRooms('yut')}}catch(e){toast(e.message)}}
async function startRoom(){try{await api(`/api/rooms/${currentRoomId}/start`,{method:'POST',body:'{}'});await loadCurrentRoom()}catch(e){toast(e.message)}}
function roomToolbar(room){const host=room.hostId===me.id;return `<div class="room-toolbar"><div class="room-title"><h3>${html(room.name)}</h3><small>방 코드 <b>${room.id}</b> · ${money(room.buyIn)}</small></div><div class="toolbar-actions"><button class="secondary copy-code">코드 복사</button><button class="secondary copy-link">초대 링크</button>${host?'<button class="primary start-room">게임 시작</button>':''}<button class="danger leave-room">나가기</button></div></div>`}
function bindRoomCommon(root,room){$('.copy-code',root).onclick=async()=>{try{await navigator.clipboard.writeText(room.id);toast('방 코드 복사 완료')}catch{toast('방 코드: '+room.id)}};$('.copy-link',root).onclick=async()=>{const link=`${location.origin}/?game=${room.game}&room=${room.id}`;try{if(navigator.share){await navigator.share({title:'JUNJA GAME CLUB',text:`${room.name} 같이 하자!`,url:link});}else{await navigator.clipboard.writeText(link);toast('초대 링크 복사 완료')}}catch(e){if(e.name!=='AbortError')toast('초대 링크를 복사하지 못했습니다.')}};$('.leave-room',root).onclick=leaveRoom;$('.start-room',root)?.addEventListener('click',startRoom);}
function privacyPanelHtml(){return `<div class="privacy-room-card panel"><div class="privacy-shield">🛡️</div><div><small>PRIVACY MODE</small><h3>채팅 기능 없음</h3><p>게임 안에서는 메시지·연락처·링크를 서로 보낼 수 없습니다.</p></div></div>`}

function renderHoldem(room){
  $('#holdemBrowser').classList.add('hidden');const root=$('#holdemRoom');root.classList.remove('hidden');const h=room.hand;
  const players=room.players;let seats='';for(let i=0;i<room.maxPlayers;i++){const p=players.find(x=>x.seat===i);if(!p){seats+=`<div class="seat s${i}"><div class="player-box"><div class="player-name">빈 자리</div></div></div>`;continue;}const hp=h?.players?.[p.userId];const hole=hp?hp.hole.map(c=>cardHtml(c,'small')).join(''):'';const flags=`${hp?.folded?' · FOLD':''}${hp?.allIn?' · ALL-IN':''}`;seats+=`<div class="seat s${i}"><div class="hole">${hole}</div><div class="player-box ${h?.turnUserId===p.userId?'turn':''}"><div class="player-name">${p.avatarEmoji} ${html(p.nickname)} ${h?.dealerSeat===p.seat?'<span class="dealer-dot">D</span>':''}</div><div class="player-stack">${money(p.stack)}</div>${hp?`<div class="player-bet">BET ${money(hp.roundBet)}${flags}</div>`:''}</div></div>`}
  const board=h?h.board.map(c=>cardHtml(c)).join(''):Array(5).fill(cardHtml('XX')).join('');
  const result=h?.result?`<div class="result-banner">🏆 ${html(h.result.summary)} · POT ${money(h.result.pot)}</div>`:'';
  const actions=holdemActions(h,room);
  root.innerHTML=`${roomToolbar(room)}${result}<div class="table-wrap"><div class="poker-panel panel"><div class="poker-table"><div class="felt-logo">JUNJA</div><div class="board-cards">${board}</div><div class="pot-label">POT ${money(h?.pot||0)} · ${h?String(h.phase).toUpperCase():'WAITING'}</div>${seats}</div>${actions}</div><div class="side-panel"><div class="players-card panel"><div class="section-head"><div><small>PLAYERS</small><h3>참가자 ${players.length}/${room.maxPlayers}</h3></div></div><div class="member-list">${players.map(p=>`<div class="member"><span>${p.avatarEmoji} ${html(p.nickname)}${room.hostId===p.userId?' 👑':''}</span><b>${money(p.stack)}</b></div>`).join('')}</div></div>${privacyPanelHtml()}</div></div>`;
  bindRoomCommon(root,room);bindPokerActions(root,h);
}
function holdemActions(h,room){if(!h)return `<div class="action-bar"><span style="color:#8791a6;font-size:12px">방장이 게임을 시작하면 카드가 배분됩니다.</span></div>`;if(h.phase==='complete')return `<div class="action-bar"><span style="color:#8791a6;font-size:12px">핸드 종료. 방장이 다음 게임 시작을 누를 수 있습니다.</span></div>`;if(h.turnUserId!==me.id)return `<div class="action-bar"><span style="color:#8791a6;font-size:12px">상대 행동을 기다리는 중...</span></div>`;const l=h.legal;return `<div class="action-bar"><button class="danger" data-poker="fold">폴드</button>${l.toCall===0?'<button class="secondary" data-poker="check">체크</button>':`<button class="secondary" data-poker="call">콜 ${money(l.toCall)}</button>`}<div class="raise-box"><input id="raiseTo" type="number" min="${l.minRaiseTo}" max="${l.maxRaiseTo}" value="${Math.min(l.maxRaiseTo,l.minRaiseTo)}"><button class="primary" data-poker="raise">레이즈</button></div></div>`}
function bindPokerActions(root,h){$$('[data-poker]',root).forEach(b=>b.onclick=async()=>{const action=b.dataset.poker;const raiseTo=Number($('#raiseTo',root)?.value||0);try{await api(`/api/rooms/${currentRoomId}/poker/action`,{method:'POST',body:JSON.stringify({action,raiseTo})});await loadCurrentRoom()}catch(e){toast(e.message)}})}
function cardHtml(code,size=''){if(code==='XX')return `<div class="card ${size} back"></div>`;const r=code[0],s=code[1],sym={S:'♠',H:'♥',D:'♦',C:'♣'}[s],red=s==='H'||s==='D';return `<div class="card ${size} ${red?'red':''}"><span>${r==='T'?'10':r}</span><span class="suit">${sym}</span></div>`}


const YUT_NODE_POS={
  1:[20,86],2:[35,86],3:[50,86],4:[65,86],5:[82,86],
  6:[82,70],7:[82,54],8:[82,38],9:[82,22],10:[82,8],
  11:[65,8],12:[50,8],13:[35,8],14:[18,8],15:[6,8],
  16:[6,24],17:[6,40],18:[6,56],19:[6,72],20:[6,86]
};
function yutSticksHtml(sticks){
  const vals=Array.isArray(sticks)&&sticks.length===4?sticks:[1,0,1,0];
  return `<div class="yut-sticks">${vals.map((v,i)=>`<div class="yut-stick ${v===0?'back-face':'flat-face'}" style="--i:${i}"><span>${v===0?'●':''}</span></div>`).join('')}</div>`;
}
function yutNodePieces(room,y,pos){
  if(!y)return '';
  let out='';
  for(const p of room.players){
    (y.positions[p.userId]||[]).forEach((v,pi)=>{
      if(v===pos && v!==20) out+=`<span class="yut-token" style="--pc:${pieceColor(p.seat)}" title="${html(p.nickname)} 말 ${pi+1}"><span>${p.avatarEmoji}</span><b>${pi+1}</b></span>`;
    });
  }
  return out;
}
function yutDockPieces(room,y,userId,where){
  if(!y)return '';
  const p=room.players.find(x=>x.userId===userId);if(!p)return '';
  const target=where==='start'?-1:20;
  return (y.positions[userId]||[]).map((v,i)=>v===target?`<span class="dock-token" style="--pc:${pieceColor(p.seat)}"><span>${p.avatarEmoji}</span><b>${i+1}</b></span>`:'').join('');
}
function yutBoardHtml(room,y){
  const nodes=Object.entries(YUT_NODE_POS).map(([pos,[x,yy]])=>`<div class="yut-node ${[5,10,15,20].includes(Number(pos))?'corner':''} ${Number(pos)===20?'finish-node':''}" style="--x:${x}%;--y:${yy}%"><span class="node-num">${pos}</span><div class="node-pieces">${yutNodePieces(room,y,Number(pos))}</div></div>`).join('');
  return `<div class="yut-board-pro"><div class="route outer-route"></div><div class="route diagonal-a"></div><div class="route diagonal-b"></div><div class="center-medallion"><span>J</span><small>GAME CLUB</small></div>${nodes}</div>`;
}
async function animateYutThrow(root){
  const area=$('.yut-sticks',root);if(!area)return;
  area.classList.add('throwing');
  await sleep(850);
}
function renderYut(room){
  $('#yutBrowser').classList.add('hidden');
  const root=$('#yutRoom');root.classList.remove('hidden');
  const y=room.yut;
  const mine=y?.positions?.[me.id]||[-1,-1,-1,-1];
  const cur=y?.phase==='playing'?room.players[y.turnIndex]:null;
  const isTurn=cur?.userId===me.id;
  const lastPlayer=y?.last?room.players.find(p=>p.userId===y.last.userId):null;
  const capturedCount=y?.last?.captured?.length||0;
  const statusText=!y?'방장이 게임을 시작하면 참가금이 걸린 윷놀이가 시작돼.':y.phase==='complete'?'게임 종료':isTurn?'내 차례':'상대 차례';
  let control='';
  if(!y){
    control=`<div class="turn-badge waiting">WAITING</div>${yutSticksHtml(null)}<h3>친구들이 모이면 방장이 시작!</h3><p>말 4개를 모두 완주시키는 사람이 승리해.</p>`;
  }else if(y.phase==='complete'){
    const w=room.players.find(p=>p.userId===y.winner);
    control=`<div class="victory-crown">👑</div><div class="big-yut">${html(w?.nickname||'승자')}</div><h3>우승!</h3><p>상금 ${money(room.buyIn*room.players.length)} 지급 완료</p>`;
  }else if(isTurn&&!y.pending){
    control=`<div class="turn-badge myturn">MY TURN</div>${yutSticksHtml(y.last?.sticks)}<div class="big-yut">윷을 던져!</div><p>윷·모 또는 상대 말을 잡으면 한 번 더 던질 수 있어.</p><button class="primary yut-throw">🪵 윷가락 던지기</button>`;
  }else if(isTurn&&y.pending){
    control=`<div class="turn-badge myturn">MOVE PIECE</div>${yutSticksHtml(y.pending.sticks)}<div class="big-yut result-name">${y.pending.name}</div><p><b>${y.pending.move}칸 이동</b>${y.pending.extra?' · ✨ 추가턴':''}</p><div class="piece-picker">${mine.map((p,i)=>`<button data-piece="${i}" ${p===20?'disabled':''}><span class="piece-avatar">${me.avatarEmoji}</span><b>말 ${i+1}</b><small>${p<0?'START':p===20?'FINISH':p+'번 칸'}</small></button>`).join('')}</div>`;
  }else{
    control=`<div class="turn-badge opponent">WAIT</div>${yutSticksHtml(y.last?.sticks)}<div class="big-yut">${y?.last?.name||'대기'}</div><p>${cur?`${cur.avatarEmoji} ${html(cur.nickname)} 차례`:'게임 대기'}</p>`;
  }
  const eventBanner=y?.last?`<div class="yut-event ${capturedCount?'capture':''}"><span>${lastPlayer?.avatarEmoji||'🎲'}</span><div><b>${html(lastPlayer?.nickname||'플레이어')} · ${y.last.name}</b><small>${capturedCount?`상대 말 ${capturedCount}개 잡기! 추가 턴 획득`:`${y.last.move}칸 이동`}</small></div></div>`:'';
  root.innerHTML=`${roomToolbar(room)}${eventBanner}<div class="yut-layout yut-layout-pro"><div class="yut-game panel"><div class="yut-game-top"><div><small>TRADITIONAL BOARD</small><h3>JUNJA 윷판</h3></div><div class="turn-summary"><span>${statusText}</span><b>${cur?`${cur.avatarEmoji} ${html(cur.nickname)}`:'대기 중'}</b></div></div>${yutBoardHtml(room,y)}<div class="yut-docks"><div class="yut-dock start-dock"><span>START</span><div>${y?room.players.map(p=>yutDockPieces(room,y,p.userId,'start')).join(''):'말 대기'}</div></div><div class="yut-dock finish-dock"><span>FINISH</span><div>${y?room.players.map(p=>yutDockPieces(room,y,p.userId,'finish')).join(''):'완주 말'}</div></div></div></div><div class="side-panel yut-side"><div class="players-card panel"><div class="section-head"><div><small>PLAYERS</small><h3>참가자</h3></div></div><div class="member-list character-list">${room.players.map(p=>`<div class="member character-member ${cur?.userId===p.userId?'active-turn':''}"><span class="member-avatar" style="--pc:${pieceColor(p.seat)}">${p.avatarEmoji}</span><span class="member-info"><b>${html(p.nickname)}${room.hostId===p.userId?' 👑':''}</b><small>완주 ${y?.positions?.[p.userId]?.filter(x=>x===20).length||0}/4</small></span><span class="member-dot" style="background:${pieceColor(p.seat)}"></span></div>`).join('')}</div></div><div class="throw-control panel">${control}</div>${privacyPanelHtml()}</div></div>`;
  bindRoomCommon(root,room);
  $('.yut-throw',root)?.addEventListener('click',async()=>{
    const btn=$('.yut-throw',root);if(btn)btn.disabled=true;
    try{await animateYutThrow(root);await api(`/api/rooms/${currentRoomId}/yut/throw`,{method:'POST',body:'{}'});await loadCurrentRoom()}catch(e){toast(e.message);if(btn)btn.disabled=false}
  });
  $$('[data-piece]',root).forEach(b=>b.onclick=async()=>{try{b.disabled=true;await api(`/api/rooms/${currentRoomId}/yut/move`,{method:'POST',body:JSON.stringify({pieceIndex:Number(b.dataset.piece)})});await loadCurrentRoom()}catch(e){toast(e.message);b.disabled=false}});
}
function pieceColor(seat){return ['#f6cf67','#71a8ff','#ff7c91','#72dfa8','#b68cff','#ff9d5d'][seat%6]}
function html(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function signedMoney(n){return (Number(n)>=0?'+':'')+money(n)}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function confetti(){for(let i=0;i<24;i++){const x=document.createElement('i');x.style.cssText=`position:fixed;z-index:999;left:${Math.random()*100}vw;top:-15px;width:7px;height:14px;background:hsl(${Math.random()*360} 90% 65%);transform:rotate(${Math.random()*180}deg);transition:1.8s linear;pointer-events:none`;document.body.appendChild(x);requestAnimationFrame(()=>{x.style.top='105vh';x.style.transform+=` translateX(${(Math.random()-.5)*160}px) rotate(720deg)`});setTimeout(()=>x.remove(),1900)}}
boot();

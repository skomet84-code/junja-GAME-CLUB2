
(()=>{
'use strict';
const root=document.getElementById('omokRoot'),notice=document.getElementById('omokMessage');
const state={room:null,home:null,busy:false,loading:false,offset:0,inviteChecked:false};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=c=>c===1?'흑':c===2?'백':'없음';
function message(t=''){notice.textContent=t;}
async function api(path,body){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
 try{
  const res=await fetch('/api/omok'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:ctrl.signal});
  const payload=await res.json();
  if(!res.ok){const error=new Error(payload.error||'오목 요청에 실패했습니다.');error.status=res.status;throw error;}
  return payload;
 }finally{clearTimeout(timer);}
}
function accept(data){
 state.room=data.room||null;
 if(data.rooms)state.home=data;
 if(state.room)state.offset=state.room.serverNow-Date.now();
 render();
}
async function homeRefresh(){try{accept(await api(''));}catch(e){message(e.message);}}
async function refresh(force=false){
 if(state.loading||state.busy||document.hidden)return;
 state.loading=true;
 try{
  const old=state.room,ret=await api(old?'/'+old.id:'');
  if(!force&&old&&ret.room&&ret.room.version===old.version)return;
  accept(ret);
  if(!state.room&&!state.inviteChecked){
   state.inviteChecked=true;
   const invite=new URL(location.href).searchParams.get('join');
   if(invite&&/^OM[a-f0-9]{14}$/.test(invite)){
    history.replaceState(null,'','/omok/index.html');
    await act('/'+invite+'/join');
   }
  }
 }catch(e){
  if(e.status===404){state.room=null;await homeRefresh();}
  else if(e.status===401)root.innerHTML='<section class="omk-panel omk-loading">로그인이 필요합니다. <a class="omk-btn" href="/">준자랜드 로그인</a></section>';
  else message(e.message||'서버 연결이 원활하지 않습니다.');
 }finally{state.loading=false;}
}
async function act(path,body={}){
 if(state.busy)return;
 state.busy=true;message('');
 root.querySelectorAll('button[data-action]').forEach(b=>b.disabled=true);
 try{
  const data=await api(path,body);accept(data);
  if(!data.room)await homeRefresh();
 }catch(e){render();message(e.message||'요청에 실패했습니다.');}
 finally{state.busy=false;}
}
function btn(action,text,variant='',extra=''){
 return `<button type="button" class="omk-btn ${variant}" data-action="${action}" ${extra}>${text}</button>`;
}
function home(){
 const d=state.home||{rooms:[],stats:{},leaders:[]},s=d.stats||{};
 root.innerHTML=`<div class="omk-home-grid">
  <section class="omk-panel omk-create"><span class="omk-badge">ROYAL MATCHMAKING</span><h2>친구를 초대하고<br>첫 수를 놓아보세요.</h2>
  <p>1:1 공식 대국! 게임머니 소모 없이 승리와 패배가 전적에 남아요. 흑은 3-3·4-4·장목 금수가 적용됩니다.</p>
  <form id="omkCreateForm" class="omk-form"><input name="name" maxlength="28" placeholder="대국방 이름 (선택)" aria-label="대국방 이름"><button type="submit" class="omk-btn">＋ 대국방 만들기</button></form>
  <div class="omk-rules"><strong>진행 순서</strong> · 방 생성 → 친구 입장 → 2명 모두 준비 → 방장 시작. 재대결할 때는 선후공이 바뀝니다.</div></section>
  <section class="omk-panel"><h2>⚔️ 참가 가능한 방</h2><div class="omk-room-list">
   ${d.rooms?.length?d.rooms.map(r=>`<div class="omk-room-card"><div><b>${esc(r.name)}</b><small>${esc(r.host)} · ${r.players}/2명</small></div>${btn('join','입장','omk-secondary',`data-id="${esc(r.id)}"`)}</div>`).join(''):'<div class="omk-empty">대기 중인 방이 없습니다.<br>첫 대국을 열어보세요!</div>'}</div>
   <div style="margin-top:14px">${btn('refresh','방 목록 새로고침','omk-ghost')}</div></section>
  <section class="omk-panel"><h2>🏆 나의 오목 전적</h2><div class="omk-record">
    <div><strong>${Number(s.games||0)}</strong><small>총 대국</small></div><div><strong>${Number(s.wins||0)}</strong><small>승리</small></div>
    <div><strong>${Number(s.losses||0)}</strong><small>패배</small></div><div><strong>${Number(s.draws||0)}</strong><small>무승부</small></div></div>
   <h3 style="margin-top:20px">명예의 전당 · 다승 TOP 10</h3><ol class="omk-list">${d.leaders?.length?d.leaders.map((p,i)=>`<li><span><b>${i+1}위</b> · ${esc(p.nickname)}</span><small>${p.wins}승 · 최고 ${p.bestStreak}연승</small></li>`).join(''):'<li>아직 공식 대국 기록이 없어요.</li>'}</ol>
  </section></div>`;
}
function waiting(r){
 const mine=r.players.find(p=>p.id===r.selfId),canStart=r.players.length===2&&r.players.every(p=>p.ready);
 root.innerHTML=`<section class="omk-panel omk-waiting"><span class="omk-badge">WAITING FOR A RIVAL</span><h2>${esc(r.name)}</h2><p>두 사람 모두 준비하면 방장이 대국을 시작할 수 있어요.</p>
 <div class="omk-players-ready">${[0,1].map(i=>{const p=r.players[i];return `<div><b>${i===0?'⚫':'⚪'} ${esc(p?.nickname||'친구 기다리는 중')}</b><small>${p?(p.ready?'✓ 준비 완료':'준비 중'):'초대 링크를 친구에게 전송하세요'}</small></div>`;}).join('')}</div>
 <div class="omk-controls">${btn('invite','🔗 방 초대 링크 복사','omk-secondary')}
 ${btn('ready',mine?.ready?'준비 취소':'✓ 대국 준비하기')}
 ${r.hostId===r.selfId?btn('start','⚔️ 대국 시작','',canStart?'':'disabled'):''}
 ${btn('leave','← 대국방 나가기','omk-ghost')}</div>
 <div class="omk-rules"><strong>정통 오목 규칙</strong> · 흑이 먼저 두고 정확히 5목을 완성해야 승리합니다. 흑의 3-3·4-4·장목은 금수입니다. 백은 5목 이상이면 승리합니다.</div></section>`;
}
function playerRow(r,color){
 const p=r.players.find(p=>p.color===color),turn=r.phase==='playing'&&r.turn===color;
 return `<div class="omk-player ${turn?'active':''}"><span class="stone ${color===2?'white':''}" aria-hidden="true"></span><div class="text">
  <b>${esc(p?.nickname||'대기')}</b><small>${color===1?'BLACK · 선공':'WHITE · 후공'} ${p?.id===r.selfId?'· 나':''}</small></div>
  ${turn?'<span class="turn">● 착수 차례</span>':''}</div>`;
}
function board(r){
 const wins=new Set((r.line||[]).map(([x,y])=>y*15+x)),[lx,ly]=r.last||[-1,-1];
 const cells=r.board.map((row,y)=>row.map((value,x)=>{
  const star=[3,7,11].includes(x)&&[3,7,11].includes(y);
  return `<button role="gridcell" type="button" class="omk-point ${star?'star':''} ${x===lx&&y===ly?'last':''} ${wins.has(y*15+x)?'winning':''}"
   data-action="move" data-x="${x}" data-y="${y}" aria-label="${x+1}열 ${y+1}행 ${value?label(value)+'돌':'빈 자리'}"
   ${!r.myTurn||r.phase!=='playing'||value?'disabled':''}>${value?`<span class="omk-stone ${value===1?'black':'white'}"></span>`:''}</button>`;
 }).join('')).join('');
 return `<div class="omk-board-wrap"><div class="omk-board" role="grid" aria-label="15줄 오목판">${cells}</div>
  <div class="omk-board-caption"><span>15 × 15 · 렌주룰</span><span>${r.moves}수 진행 · ${r.round}국</span></div></div>`;
}
function status(r){
 if(r.phase!=='complete')return r.myTurn?'🎯 내 차례! 교차점에 돌을 놓아주세요.':'⏳ 상대방이 착수 중입니다.';
 if(r.winner==null)return '🤝 무승부 · 다음 대국에서 승부를 가려보세요.';
 const p=r.players.find(x=>x.id===r.winner);
 return (r.winner===r.selfId?'🏆 승리!':'상대 승리 ·')+' '+esc(p?.nickname||'')+' · '+esc(r.reason);
}
function match(r){
 const end=r.phase==='complete',mine=r.players.find(p=>p.id===r.selfId);
 root.innerHTML=`<div class="omk-room-top"><div><b>⚔️ ${esc(r.name)}</b><small>ROUND ${r.round} · ${r.moves}수 진행 · ${r.id}</small></div>${btn('invite','초대 링크','omk-ghost')}</div>
 <div class="omk-room-layout">${board(r)}
 <div class="omk-side"><div class="omk-panel">${playerRow(r,1)}<div style="height:10px"></div>${playerRow(r,2)}</div>
 <div class="omk-clock" id="omkClockBox"><small>${end?'MATCH COMPLETE':'TURN CLOCK'}</small><b id="omkClock">${end?'종료':'90초'}</b></div>
 <div class="omk-status" role="status">${status(r)}</div><div class="omk-controls">
 ${end?(r.players.length===2?btn('rematch',mine?.rematch?'상대의 재대결 신청 기다리는 중':'↻ 재대결 신청','',mine?.rematch?'disabled':''):'<small>상대방이 나갔습니다.</small>'):btn('resign','기권하기','omk-danger')}
 ${btn('leave',end?'대국방 나가기':'나가기 (기권)','omk-ghost')}</div>
 <div class="omk-guide"><strong>렌주 금수 규칙</strong><br>⚫ 흑: 정확히 5목 승리, 3-3·4-4·6목 이상 금지<br>⚪ 백: 5목 이상 승리 · 금수 없음<br>턴당 90초 · 서버에서 착수를 검증합니다.<br>새로고침해도 같은 대국에 복귀합니다.</div></div></div>`;
 tick();
}
function render(){if(state.room){state.room.phase==='waiting'?waiting(state.room):match(state.room);}else home();}
function tick(){
 const r=state.room,el=document.getElementById('omkClock');
 if(!r||!el||r.phase!=='playing')return;
 const seconds=Math.max(0,Math.ceil((r.deadline-Date.now()-state.offset)/1000));
 el.textContent=String(seconds).padStart(2,'0')+'초';
 document.getElementById('omkClockBox')?.classList.toggle('urgent',seconds<=15);
}
root.addEventListener('submit',e=>{
 if(e.target?.id!=='omkCreateForm')return;
 e.preventDefault();act('/create',{name:e.target.elements.name.value.trim()||'준자 오목 대결'});
});
root.addEventListener('click',e=>{
 const b=e.target.closest('button[data-action]');
 if(!b||b.disabled||state.busy)return;
 const action=b.dataset.action,r=state.room;
 if(action==='refresh'){refresh(true);return;}
 if(action==='join'){act('/'+b.dataset.id+'/join');return;}
 if(action==='invite'){
  const link=location.origin+'/omok/index.html?join='+encodeURIComponent(r.id);
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(link).then(()=>message('초대 링크를 복사했어요. 친구에게 보내주세요.')).catch(()=>window.prompt('초대 링크 복사',link));
  else window.prompt('초대 링크 복사',link);
  return;
 }
 if(!r)return;
 if(action==='ready'){const p=r.players.find(p=>p.id===r.selfId);act('/'+r.id+'/ready',{ready:!p.ready});}
 else if(action==='start')act('/'+r.id+'/start');
 else if(action==='move')act('/'+r.id+'/move',{x:Number(b.dataset.x),y:Number(b.dataset.y)});
 else if(action==='rematch')act('/'+r.id+'/rematch');
 else if(action==='resign'){if(window.confirm('기권하면 패배로 기록됩니다. 기권할까요?'))act('/'+r.id+'/resign');}
 else if(action==='leave'){if(r.phase==='playing'&&!window.confirm('지금 나가면 기권패로 기록됩니다. 나갈까요?'))return;act('/'+r.id+'/leave');}
});
if(typeof EventSource==='function'){
 const events=new EventSource('/api/events');
 events.addEventListener('refresh',e=>{
  try{const d=JSON.parse(e.data);if(d.omok&&(!state.room||!d.roomId||d.roomId===state.room.id))refresh();}catch{}
 });
 window.addEventListener('pagehide',()=>events.close(),{once:true});
}
setInterval(tick,250);
setInterval(()=>{if(!document.hidden)refresh();},5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
refresh(true);
})();

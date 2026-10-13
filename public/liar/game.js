(()=>{
'use strict';
const root=document.querySelector('#liarRoot'),notice=document.querySelector('#liarNotice');
const state={room:null,home:null,busy:false,loading:false,offset:0,inviteChecked:false,drafts:{clue:'',chat:'',guess:''}};
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const name=(r,id)=>r.players.find(p=>p.id===id)?.nickname||'알 수 없음';
const btn=(action,label,cls='',attr='')=>'<button type="button" class="lg-btn '+cls+'" data-action="'+action+'" '+attr+'>'+label+'</button>';
const clock=()=>'<div class="lg-clock"><span>남은 시간</span><b id="liarClock">--:--</b><div class="lg-progress"><i id="liarBar"></i></div></div>';
const avatar=(n,i)=>'<span class="lg-avatar lg-a'+i%6+'">'+safe(String(n||'?').slice(0,1))+'</span>';
const pcard=(p,i,details='')=>'<div class="lg-player">'+avatar(p.nickname,i)+'<div><b>'+safe(p.nickname)+'</b><small>'+details+'</small></div></div>';
function say(s){notice.textContent=s||'';notice.classList.toggle('show',!!s);}
async function api(path,body){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
 try{
  const res=await fetch('/api/liar'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:ctrl.signal});
  const d=await res.json();if(!res.ok){const error=new Error(d.error||'요청을 처리하지 못했습니다.');error.status=res.status;throw error;}return d;
 }finally{clearTimeout(timer);}
}
function accept(d){
 state.room=d.room||null;if(d.rooms)state.home=d;
 if(state.room)state.offset=state.room.serverNow-Date.now();
 render();
}
async function homeRefresh(){try{accept(await api(''));}catch(e){say(e.message);}}
async function refresh(force=false){
 if(state.busy||state.loading||document.hidden)return;
 state.loading=true;
 try{
  const old=state.room,d=await api(old?'/'+old.id:'');
  if(!force&&old&&d.room&&old.version===d.room.version)return;
  accept(d);
  if(!state.room&&!state.inviteChecked){
   state.inviteChecked=true;const invite=new URL(location.href).searchParams.get('join');
   if(invite&&/^LI[a-f0-9]{14}$/.test(invite)){history.replaceState(null,'','/liar/index.html');await act('/'+invite+'/join');}
  }
 }catch(e){
  if(e.status===401){root.innerHTML='<div class="lg-panel lg-empty">준자랜드 로그인이 필요해요. <a href="/">로그인하러 가기 →</a></div>';return;}
  if(e.status===404||e.status===403){state.room=null;await homeRefresh();return;}
  say(e.message||'연결이 끊겼어요. 다시 시도하고 있습니다.');
 }finally{state.loading=false;}
}
async function act(path,body={}){
 if(state.busy)return;state.busy=true;say('');
 root.querySelectorAll('[data-action],button[type=submit]').forEach(b=>b.disabled=true);
 try{
  const d=await api(path,body);accept(d);
  if(!d.room)await homeRefresh();
  else if(path.endsWith('/clue')){state.drafts.clue='';render();}
  else if(path.endsWith('/chat')){state.drafts.chat='';render();}
  else if(path.endsWith('/guess')){state.drafts.guess='';render();}
 }catch(e){render();say(e.message||'요청에 실패했습니다.');}
 finally{state.busy=false;}
}
function initials(r){return r.players.map((p,i)=>pcard(p,i,p.ready?'✓ 준비 완료':'준비 전')+(r.hostId===r.selfId&&p.id!==r.selfId?btn('kick','내보내기','lg-mini','data-id="'+p.id+'"'):'' )).join('');}
function lobby(){
 const h=state.home||{rooms:[],stats:{},leaders:[],categories:['랜덤']},s=h.stats||{};
 root.innerHTML='<div class="lg-two"><section class="lg-panel lg-feature"><div class="lg-eyebrow">NEW SOCIAL DEDUCTION · PARTY GAME</div><h2>누가 진실을<br><em>숨기고 있을까?</em></h2><p>모두가 같은 단어를 아는 건 아니에요. 단 한 명의 라이어를 찾아내세요. 아무렇지 않은 힌트 뒤에 숨어 있는 거짓말!</p>'+
  '<form id="liarCreate" class="lg-form"><label>방 이름<input name="name" placeholder="친구들과 라이어 한 판" maxlength="28"></label>'+
  '<div class="lg-input-row"><label>최대 인원<select name="max"><option value="6">6명</option><option value="8" selected>8명</option><option value="10">10명</option><option value="4">4명</option><option value="3">3명</option></select></label>'+
  '<label>제시어 분야<select name="category">'+h.categories.map(c=>'<option>'+safe(c)+'</option>').join('')+'</select></label></div>'+
  '<div class="lg-input-row"><label>힌트 라운드<select name="clueRounds"><option value="2">2회씩 (추천)</option><option value="1">1회씩 (빠르게)</option></select></label><label class="lg-check"><input type="checkbox" name="private"> 비공개 초대방</label></div>'+
  '<button type="submit" class="lg-btn lg-primary lg-wide">＋ 새로운 라이어 방 만들기</button></form>'+
  '<div class="lg-footnote">3~10명 · 게임머니 소모 없음 · 서버에서 비밀 역할 무작위 배정</div></section>'+
  '<section class="lg-panel"><div class="lg-section-title"><h3>참가 가능한 게임방</h3>'+btn('reload','↻ 새로고침','lg-mini')+'</div><div class="lg-roomlist">'+
   (h.rooms.length?h.rooms.map(r=>'<div class="lg-listroom"><span class="lg-room-icon">♛</span><div><b>'+safe(r.name)+'</b><small>'+safe(r.host)+' · '+r.players+'/'+r.max+'명 · '+r.clueRounds+'회 힌트</small></div>'+btn('join','참가','lg-small','data-id="'+safe(r.id)+'"')+'</div>').join(''):'<div class="lg-empty">지금 공개된 방이 없어요.<br>먼저 방을 만들어 친구들을 초대해보세요!</div>')+
  '</div><div class="lg-how"><h4>HOW TO PLAY</h4><p><b>01</b> 시민은 같은 제시어를 받고 라이어는 분야만 봅니다.</p><p><b>02</b> 차례마다 한 줄 힌트를 발표합니다.</p><p><b>03</b> 토론 후 라이어로 의심되는 사람에게 투표합니다.</p><p><b>04</b> 라이어를 잡아도 제시어를 맞히면 역전!</p></div></section></div>'+
  '<div class="lg-two lg-lower"><section class="lg-panel"><h3>나의 라이어 전적</h3><div class="lg-stats">'+
   [['games','총 플레이'],['wins','승리'],['liarWins','라이어 승리'],['caught','시민 승리']].map(([k,l])=>'<div><strong>'+Number(s[k]||0)+'</strong><small>'+l+'</small></div>').join('')+
  '</div></section><section class="lg-panel"><h3>🏆 명예의 전당</h3><div class="lg-leaders">'+(h.leaders?.length?h.leaders.map((p,i)=>'<div><b>'+(i+1)+'위</b><span>'+safe(p.nickname)+'</span><small>'+p.wins+'승 · '+p.bestStreak+'연승</small></div>').join(''):'<p>첫 우승자가 되어보세요!</p>')+'</div></section></div>';
}
function waiting(r){
 const mine=r.players.find(p=>p.id===r.selfId);
 root.innerHTML='<section class="lg-panel lg-wait"><div class="lg-eyebrow">PRIVATE PARTY ROOM · WAITING</div><h2>'+safe(r.name)+'</h2><p>최소 3명 이상 필요해요. 모두 준비하면 방장이 게임을 시작할 수 있습니다.</p>'+
 '<div class="lg-wait-count"><b>'+r.players.length+'</b><span>/ '+r.max+' PLAYERS</span></div>'+
 '<div class="lg-wait-grid">'+initials(r)+Array.from({length:Math.max(0,Math.min(3,r.max-r.players.length))},()=>'<div class="lg-player lg-player-empty"><span class="lg-avatar">＋</span><div><b>빈 자리</b><small>친구 입장 대기</small></div></div>').join('')+'</div>'+
 '<div class="lg-actions">'+btn('invite','🔗 초대 링크 복사','lg-secondary')+btn('ready',mine?.ready?'준비 취소':'✓ 게임 준비하기','lg-primary')+
 (r.hostId===r.selfId?btn('start','♛ 게임 시작','lg-primary',r.players.length>=3&&r.players.every(p=>p.ready)?'':'disabled'):'')+btn('leave','방 나가기','lg-ghost')+'</div>'+
 '<div class="lg-hintnote">2회 힌트 × '+r.players.length+'명 · 시민에게만 제시어가 보입니다. 라이어도 힌트를 제출할 수 있어요.</div></section>';
}
function rolePanel(r){
 const liar=r.role==='liar',done=r.phase==='complete';
 return '<section class="lg-role '+(liar?'lg-role-liar':'')+'"><div><small>TOP SECRET · '+safe(r.category||'')+'</small><h3>'+(done?'공개된 제시어':liar?'당신은 라이어':'당신의 제시어')+'</h3>'+
  '<div class="lg-secret">'+(done||!liar?safe(r.secret||''): '???')+'</div><p>'+(done?'모든 역할이 공개되었습니다.':liar?'시민의 힌트로 단어를 추리하세요. 들키면 마지막 정답 기회가 있습니다.':'정확한 단어는 절대 말하지 말고 관련된 힌트만 알려주세요.')+'</p></div><div class="lg-seal">'+(liar?'◈':'♛')+'</div></section>';
}
function progress(r){
 const phases=['clue','discussion','vote','guess','complete'],names=['힌트','토론','투표','최종 추리','결과'];
 const current=phases.indexOf(r.phase);
 return '<div class="lg-steps">'+names.map((s,i)=>'<span class="'+(i===current?'active':i<current?'past':'')+'">'+(i+1)+' '+s+'</span>').join('')+'</div>';
}
function roster(r){
 return '<section class="lg-panel lg-roster"><h3>참가자 <small>'+r.players.filter(p=>!p.left).length+'명</small></h3><div class="lg-roster-grid">'+r.players.map((p,i)=>'<div class="lg-roster-player '+(r.turnId===p.id?'onturn':'')+' '+(p.left?'left':'')+'">'+avatar(p.nickname,i)+'<b>'+safe(p.nickname)+'</b>'+(p.id===r.selfId?'<small>나</small>':'')+(r.phase==='complete'&&p.id===r.liarId?'<span class="lg-liar-mark">LIAR</span>':'')+'</div>').join('')+'</div></section>';
}
function clues(r){
 if(!r.clues?.length)return '<div class="lg-empty">아직 공개된 힌트가 없습니다.</div>';
 return r.clues.map(c=>'<div class="lg-clue"><div>'+avatar(name(r,c.userId),r.players.findIndex(p=>p.id===c.userId))+'<b>'+safe(name(r,c.userId))+'</b><small>ROUND '+c.round+'</small></div><p>'+safe(c.text)+'</p></div>').join('');
}
function forms(r){
 const me=r.selfId,turn=r.turnId===me;let extra='';
 if(r.phase==='clue')extra='<div class="lg-phase-call"><span>🎙️ HINT ROUND '+r.clueRound+' / '+r.clueRounds+'</span><h2>'+safe(name(r,r.turnId))+'님의 힌트 차례</h2><p>단어를 직접 공개하지 않는, 짧고 영리한 힌트를 남겨보세요.</p></div>'+
 (turn?'<form id="liarClue" class="lg-send"><input name="text" minlength="2" maxlength="48" required autocomplete="off" placeholder="예: 따끈따끈한 겨울 간식" value="'+safe(state.drafts.clue)+'"><button class="lg-btn lg-primary">힌트 제출</button></form>':'<div class="lg-await">다음 참가자의 힌트를 기다려주세요.</div>');
 if(r.phase==='discussion')extra='<div class="lg-phase-call"><span>💬 FREE DISCUSSION</span><h2>이제 서로를 의심할 시간</h2><p>힌트가 수상한 사람에게 질문하고 라이어를 찾아보세요!</p></div>'+
  (r.hostId===me?btn('endDiscussion','토론 종료 · 투표 시작','lg-secondary'):'');
 if(r.phase==='discussion'||r.phase==='vote'){
  extra+='<div class="lg-chat"><h3>라이브 토론</h3><div class="lg-chat-log" id="lgChatLog">'+(r.messages.length?r.messages.map(m=>'<div class="lg-chat-line"><b>'+safe(m.nickname)+'</b><span>'+safe(m.text)+'</span></div>').join(''):'<p>토론을 시작해보세요. 다른 유저의 힌트에 질문할 수 있어요.</p>')+'</div><form id="liarChat" class="lg-send"><input name="text" maxlength="160" required autocomplete="off" placeholder="채팅 메시지" value="'+safe(state.drafts.chat)+'"><button class="lg-btn lg-small">전송</button></form></div>';
 }
 if(r.phase==='vote'){
  const voted=r.votesCast.includes(me),options=r.players.filter(p=>r.voteOptions.includes(p.id)&&p.id!==me);
  extra='<div class="lg-phase-call"><span>🗳️ '+(r.runoff?'RUNOFF VOTE':'SECRET BALLOT')+'</span><h2>'+(r.runoff?'동점자 재투표':'라이어를 지목하세요')+'</h2><p>'+(voted?'투표 완료! 다른 참가자를 기다리고 있어요.':'자신을 제외한 참가자 1명을 선택하세요. 투표 내용은 결과 전까지 비밀입니다.')+'</p></div>'+
   '<div class="lg-votes">'+options.map((p,i)=>'<button class="lg-vote" data-action="vote" data-id="'+p.id+'" '+(voted?'disabled':'')+'>'+avatar(p.nickname,i)+'<b>'+safe(p.nickname)+'</b><small>이 사람을 지목</small></button>').join('')+'</div>'+
   '<p class="lg-vote-status">'+r.votesCast.length+' / '+r.players.filter(p=>!p.left).length+'명 투표 완료</p>'+extra;
 }
 if(r.phase==='guess'){
  const liar=r.role==='liar';
  extra='<div class="lg-phase-call lg-final"><span>♛ FINAL CHANCE</span><h2>라이어는 잡혔지만, 끝나지 않았다!</h2><p>라이어가 제시어를 맞히면 즉시 역전 승리합니다.</p></div>'+
  (liar?'<form id="liarGuess" class="lg-send"><input name="text" maxlength="40" required autocomplete="off" placeholder="최종 제시어 정답" value="'+safe(state.drafts.guess)+'"><button class="lg-btn lg-primary">정답 확정</button></form>':'<div class="lg-await">라이어가 정답을 추리하는 중입니다.</div>');
 }
 if(r.phase==='complete'){
  const won=(r.winner==='liar')===(r.role==='liar'),abandoned=r.winner===null;
  extra='<div class="lg-result '+(won&&!abandoned?'lg-won':'')+'"><span class="lg-big-icon">'+(abandoned?'⏸️':won?'🏆':'🎭')+'</span><small>THE FINAL REVEAL</small><h2>'+(abandoned?'게임 중단':r.winner==='liar'?'라이어 승리!':'시민팀 승리!')+'</h2><p>'+safe(r.reason)+'</p><div class="lg-reveal"><span>진짜 라이어 <strong>'+safe(name(r,r.liarId))+'</strong></span><span>제시어 <strong>'+safe(r.secret)+'</strong></span>'+(r.guess?'<span>마지막 추리 <strong>'+safe(r.guess)+'</strong></span>':'')+'</div><div class="lg-actions">'+(r.hostId===me?btn('next','↻ 다음 판 준비','lg-primary'):'<span>방장이 다음 판을 준비하고 있습니다.</span>')+btn('leave','로비로 나가기','lg-secondary')+'</div></div>';
 }
 return extra;
}
function play(r){
 root.innerHTML='<div class="lg-game-head"><div><small>LIAR PARTY · ROUND '+r.round+'</small><h2>'+safe(r.name)+'</h2></div>'+btn('leave','나가기','lg-ghost')+'</div>'+progress(r)+
 '<div class="lg-game-grid"><div class="lg-main">'+rolePanel(r)+'<section class="lg-panel lg-phase">'+(r.deadline?clock():'')+forms(r)+'</section></div>'+
 '<aside>'+roster(r)+'<section class="lg-panel lg-clues"><div class="lg-section-title"><h3>공개된 힌트</h3><small>'+r.clues.length+'개</small></div><div class="lg-clue-scroll">'+clues(r)+'</div></section></aside></div>';
 tick();
 const log=document.getElementById('lgChatLog');if(log)log.scrollTop=log.scrollHeight;
}
function render(){const r=state.room;if(!r)lobby();else if(r.phase==='waiting')waiting(r);else play(r);}
function tick(){
 const r=state.room,el=document.getElementById('liarClock');
 if(!r||!el||!r.deadline)return;
 const s=Math.max(0,Math.ceil((r.deadline-Date.now()-state.offset)/1000));
 el.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
 el.classList.toggle('urgent',s<=10);
 const max=r.phase==='clue'?45:r.phase==='discussion'?70:r.phase==='vote'?45:30;
 const bar=document.getElementById('liarBar');if(bar)bar.style.width=Math.min(100,s/max*100)+'%';
}
root.addEventListener('input',e=>{if(e.target.matches('#liarClue input'))state.drafts.clue=e.target.value;if(e.target.matches('#liarChat input'))state.drafts.chat=e.target.value;if(e.target.matches('#liarGuess input'))state.drafts.guess=e.target.value;});
root.addEventListener('submit',e=>{
 const f=e.target;if(!['liarCreate','liarClue','liarChat','liarGuess'].includes(f.id))return;
 e.preventDefault();if(state.busy)return;
 const r=state.room;
 if(f.id==='liarCreate')act('/create',{name:f.elements.name.value,max:Number(f.elements.max.value),category:f.elements.category.value,clueRounds:Number(f.elements.clueRounds.value),private:f.elements.private.checked});
 else if(r)act('/'+r.id+'/'+({liarClue:'clue',liarChat:'chat',liarGuess:'guess'}[f.id]),{text:f.elements.text.value.trim()});
});
root.addEventListener('click',e=>{
 const b=e.target.closest('[data-action]');if(!b||b.disabled||state.busy)return;
 const a=b.dataset.action,r=state.room;
 if(a==='reload'){refresh(true);return;}
 if(a==='join'){act('/'+b.dataset.id+'/join');return;}
 if(a==='invite'&&r){
  const url=location.origin+'/liar/index.html?join='+encodeURIComponent(r.id);
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url).then(()=>say('초대 링크를 복사했어요! 친구에게 보내주세요.')).catch(()=>window.prompt('초대 링크 복사',url));
  else window.prompt('초대 링크 복사',url);return;
 }
 if(!r)return;
 if(a==='ready')act('/'+r.id+'/ready',{ready:!r.players.find(p=>p.id===r.selfId)?.ready});
 else if(a==='start')act('/'+r.id+'/start');
 else if(a==='kick'&&window.confirm('참가자를 내보낼까요?'))act('/'+r.id+'/kick',{targetId:Number(b.dataset.id)});
 else if(a==='vote')act('/'+r.id+'/vote',{targetId:Number(b.dataset.id)});
 else if(a==='next')act('/'+r.id+'/next');
 else if(a==='endDiscussion')act('/'+r.id+'/discussion-end');
 else if(a==='leave'&&window.confirm(r.phase==='waiting'||r.phase==='complete'?'방에서 나갈까요?':'게임 도중 퇴장하면 현재 판을 포기하게 됩니다. 나갈까요?'))act('/'+r.id+'/leave');
});
if(typeof EventSource==='function'){
 const events=new EventSource('/api/events');
 events.addEventListener('refresh',e=>{try{const d=JSON.parse(e.data);if(d.liar&&(!state.room||!d.roomId||d.roomId===state.room.id))refresh();}catch{}});
 window.addEventListener('pagehide',()=>events.close(),{once:true});
}
setInterval(tick,250);
setInterval(()=>{if(!document.hidden)refresh();},4500);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
refresh(true);
})();

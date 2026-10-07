(function(){
  'use strict';
  const s={root:null,room:null,home:null,active:false,busy:false,loading:false,pending:false,clock:null,deadline:null,epoch:0,offset:0};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>new Intl.NumberFormat('ko-KR').format(v||0)+' G';
  const modeLabel={solo:'혼자 도전',survival:'서바이벌',score:'점수전'};
  const q=id=>s.root.querySelector('#'+id);
  const api=(path,body)=>window.api('/api/goldenbell'+path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)});
  function error(message){const el=q('gbMessage');if(el){el.textContent=message;el.hidden=false;}else window.toast?.(message);}
  function accept(d){s.room=d.room||null;if(s.room)s.offset=s.room.serverNow-Date.now();if(d.categories)s.home=d;render();}
  async function refresh(){
    if(!s.active||document.hidden)return;
    if(s.busy||s.loading){s.pending=true;return;}
    const epoch=s.epoch;s.loading=true;
    try{const d=await api(s.room?'/'+s.room.id:'');if(epoch===s.epoch)accept(d);}
    catch(e){if(epoch===s.epoch){if(e.status===404||e.status===403){s.room=null;s.pending=true;}else error(e.message);}}
    finally{s.loading=false;if(s.pending&&s.active){s.pending=false;refresh();}}
  }
  async function act(path,body={}){
    if(s.busy||s.loading)return;
    s.busy=true;s.epoch++;clearTimeout(s.deadline);
    s.root.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{const d=await api(path,body);accept(d);if(!d.room)accept(await api(''));if(!d.room||d.room.phase==='complete')window.refreshMe?.(false).catch(()=>{});}
    catch(e){render();error(e.message);s.pending=true;}
    finally{s.busy=false;s.root.querySelectorAll('[data-busy]').forEach(b=>b.disabled=false);if(s.pending&&s.active){s.pending=false;refresh();}}
  }
  function banner(){return `<header class="gb-hero"><div><span class="gb-kicker">JUNJA LAND · KNOWLEDGE ARENA</span><h2>도전, <em>준자 골든벨</em></h2><p>한 문제씩, 정상에 가까워지는 순간.</p></div><div class="gb-bell" aria-hidden="true">🔔</div></header>`;}
  function shell(content){s.root.innerHTML=`<div class="gb-shell">${banner()}<div id="gbMessage" class="gb-message" role="alert" hidden></div>${content}</div>`;}
  function categories(){return '<option value="전체">🌐 전체 랜덤 · 30문제</option>'+(s.home?.categories||[]).map(c=>`<option value="${esc(c.name)}">${esc(c.name)} · ${Math.min(30,c.count)}문제</option>`).join('');}
  function renderHome(){
    const d=s.home||{},st=d.stats||{},rooms=d.rooms||[];
    shell(`<div class="gb-strip"><span><b>${d.questionCount||0}</b> 문제</span><span><b>${d.categories?.length||15}</b> 분야</span><span>오늘 보상 도전 <b>${d.dailyRemaining??3}회</b></span><span>내 최고 <b>${st.best||0}개 정답</b></span><span class="gb-hard-badge">LEVEL 4 · 극한 난이도 포함</span></div>
    <div class="gb-modes"><section class="gb-panel gb-solo"><span class="gb-kicker">SOLO CHALLENGE</span><h3>나의 한계에 도전</h3><p>목숨 3개로 마지막 문제까지.<br>차근차근 실력을 쌓고 골든벨을 울려봐.</p><label for="gbSoloCategory">문제 분야</label><select id="gbSoloCategory">${categories()}</select><button id="gbSolo" class="gb-primary">${d.dailyRemaining?'혼자 도전 시작':'무료 연습 시작'} <span>→</span></button><small>정답당 1억 G · 정답 10개 +10억 / 20개 +30억<br>30문제 완벽정답 +100억 G · 최대 170억 G · 하루 3회 보상</small></section>
    <section class="gb-panel"><span class="gb-kicker">PLAY TOGETHER</span><h3>함께 풀면 더 짜릿하게</h3><p>끝까지 살아남거나, 가장 많이 맞히거나.<br>방을 만들고 친구들과 실력을 겨뤄봐.</p><div class="gb-form-grid"><label>대결 방식<select id="gbMode"><option value="survival">서바이벌 · 오답 탈락</option><option value="score">점수전 · 끝까지 참여</option></select></label><label>최대 인원<select id="gbMax"><option>2</option><option>4</option><option selected>6</option><option>8</option><option>12</option></select></label></div><label>문제 분야<select id="gbMultiCategory">${categories()}</select></label><label>1인 참가비<select id="gbEntry"><option value="0">무료 대결</option><option value="1000000">100만 G</option><option value="10000000">1,000만 G</option><option value="100000000">1억 G</option><option value="1000000000">10억 G</option></select></label><button id="gbCreate" class="gb-secondary">대결방 만들기 ＋</button></section></div>
    <section class="gb-panel"><div class="gb-heading"><h3>열린 골든벨 교실 <span>${rooms.length}</span></h3><button id="gbRefresh" class="gb-ghost">새로고침 ↻</button></div><div class="gb-room-list">${rooms.length?rooms.map(r=>`<article class="gb-open-room"><div><b>${esc(r.host)}의 교실</b><p>${modeLabel[r.mode]} · ${esc(r.category)} · ${r.players}/${r.maxPlayers}명 · ${money(r.entry)}</p></div><button data-join="${esc(r.id)}" class="gb-secondary" ${r.players>=r.maxPlayers?'disabled':''}>입장 →</button></article>`).join(''):'<div class="gb-empty">아직 열린 교실이 없어. 첫 번째 방장이 되어봐! 🔔</div>'}</div></section>
    <div class="gb-bottom-grid"><section class="gb-panel"><h3>골든벨 명예의 전당</h3>${(d.leaders||[]).length?`<ol class="gb-leaders">${d.leaders.map(p=>`<li><b>${esc(p.nickname)}</b><span>전체 랜덤 30문제 완벽정답 ${p.random30Bells??p.bells??0}회 · 대결 우승 ${p.wins}회</span></li>`).join('')}</ol>`:'<p class="gb-muted">첫 기록의 주인공을 기다리고 있어.</p>'}</section><section class="gb-panel"><h3>알고 시작하기</h3><ul class="gb-rules"><li>문제당 20초 · 정답 공개와 해설 2초</li><li>서바이벌 10·20번째 문제는 패자부활전. 전원 오답이면 해당 문제 탈락 유예.</li><li>순위는 생존 여부(서바이벌) → 정답 수 → 총 답변 시간 순. 완전 동률이면 상금 분할.</li><li>참가비는 모두 준비 후 시작할 때 차감. 2명은 70/30%, 3명 이상은 60/30/10% 지급.</li><li>진행 중 나가면 대결 상금 제외. 서버 재시작 시 미정산 참가비 자동 환급.</li><li>게임머니만 사용하며 현금 가치·환전은 없어.</li></ul></section></div>`);
    q('gbSolo').onclick=()=>act('/create',{mode:'solo',category:q('gbSoloCategory').value});
    q('gbCreate').onclick=()=>act('/create',{mode:q('gbMode').value,category:q('gbMultiCategory').value,maxPlayers:Number(q('gbMax').value),entry:Number(q('gbEntry').value)});
    q('gbRefresh').onclick=refresh;
    s.root.querySelectorAll('[data-join]').forEach(b=>b.onclick=()=>act('/'+b.dataset.join+'/join'));
  }
  function roster(r){return `<aside class="gb-panel gb-roster"><div class="gb-heading"><h3>${r.mode==='solo'?'내 도전':'참가자'} <span>${r.players.filter(p=>!p.left).length}${r.mode!=='solo'?'/'+r.maxPlayers:''}</span></h3></div>${r.players.map(p=>`<div class="gb-player ${!p.alive||p.left?'gb-out':''} ${p.id===r.selfId?'gb-self':''}"><span class="gb-avatar">${p.left?'↗':r.phase==='complete'&&p.rank===1?'🏆':p.alive?'🙂':'👻'}</span><div><b>${esc(p.nickname)} ${p.id===r.hostId?'♛':''}</b><small>${p.left?'퇴장':r.phase==='waiting'?(p.ready?'준비 완료':'준비 중'):r.phase==='complete'?money(p.payout):`${p.correct} 정답 · ${p.answered?'답변 완료':p.alive?'도전 중':'관전 중'}`}</small></div><strong>${r.phase==='complete'?p.rank+'위':r.phase==='waiting'?(p.ready?'✓':'…'):p.correct}</strong></div>`).join('')}</aside>`;}
  function renderRoom(){
    const r=s.room,p=r.players.find(p=>p.id===r.selfId)||{},waiting=r.phase==='waiting',complete=r.phase==='complete';
    let content='';
    if(waiting){
      content=`<section class="gb-panel gb-stage gb-wait"><span class="gb-kicker">READY FOR THE CHALLENGE?</span><div class="gb-stage-icon">🔔</div><h3>친구들이 모이고 있어</h3><p>${esc(r.category)} · ${modeLabel[r.mode]} · 참가비 ${money(r.entry)}</p><p class="gb-muted">2명 이상 모두 준비하면 방장이 시작할 수 있어.<br>시작 전에는 참가비가 차감되지 않아.</p><div class="gb-actions"><button id="gbReady" class="gb-primary">${p.ready?'준비 취소':'준비 완료 ✓'}</button>${r.hostId===r.selfId?`<button id="gbStart" class="gb-secondary" ${r.players.length<2||!r.players.every(p=>p.ready)?'disabled':''}>골든벨 시작 →</button>`:''}</div></section>`;
    }else if(complete){
      const perfect=p.correct===r.total&&!p.left;
      content=`<section class="gb-panel gb-stage gb-finish"><span class="gb-kicker">${perfect?'GOLDEN BELL!':'CHALLENGE COMPLETE'}</span><div class="gb-stage-icon">${perfect?'🔔':'🏆'}</div><h3>${perfect?'골든벨을 울렸어!':r.mode==='solo'?'도전을 마쳤어!':p.rank===1?'축하해, 1위야!':'멋진 대결이었어!'}</h3><div class="gb-result-score">${p.correct}<span> / ${r.total} 정답</span></div><p class="gb-prize">획득 상금 ${money(p.payout)}</p><p class="gb-muted">최고 연속 정답 ${p.bestStreak}개${r.mode==='solo'&&!r.rewarded?' · 연습 모드 (보상 없음)':''}</p><button id="gbAgain" class="gb-primary">다시 도전 / 다른 분야 →</button></section>`;
    }else{
      const question=r.question,result=r.result,reveal=r.phase==='reveal';
      content=`<section class="gb-panel gb-stage"><div class="gb-question-top"><span class="gb-tag">${esc(question.category)} · ${['','쉬움','보통','어려움','극한'][question.level]||'극한'}</span><span id="gbTimer" class="gb-timer" aria-label="남은 시간"></span></div><div class="gb-progress"><i style="width:${(r.index+1)/r.total*100}%"></i></div><div class="gb-round">QUESTION ${String(r.index+1).padStart(2,'0')} <span>/ ${r.total}</span>${r.mode==='solo'?`<b>${'♥'.repeat(Math.max(0,p.lives))}${'♡'.repeat(3-Math.max(0,p.lives))}</b>`:''}</div>${r.revival?'<p class="gb-revival">✨ 패자부활전! 정답을 맞히면 다시 도전할 수 있어.</p>':''}<h3 class="gb-question">${esc(question.text)}</h3><div class="gb-options">${question.options.map((v,i)=>`<button data-choice="${i}" class="gb-option ${r.myAnswer===i?'gb-picked':''} ${reveal&&result.answer===i?'gb-correct':''} ${reveal&&r.myAnswer===i&&result.answer!==i?'gb-wrong':''}" ${!r.canAnswer?'disabled':''}><span>${question.options.length===2?'OX'[i]:'ABCD'[i]}</span><b>${esc(v)}</b>${reveal&&result.answer===i?'<em>✓ 정답</em>':''}</button>`).join('')}</div><div class="gb-feedback" role="status">${reveal?`<strong>${result.correctIds.includes(r.selfId)?'정답이야! ✨':p.alive||r.mode!=='survival'?'정답을 확인해봐':'다음 패자부활전을 기다려봐'}</strong><p>${esc(result.explanation)}</p>${result.grace?'<small>생존자 전원 오답 · 이번 문제는 탈락 유예</small>':''}`:r.myAnswer!==null?'답변 완료! 다른 참가자들의 답을 기다리고 있어.':!r.canAnswer?'관전 중 · 10·20번째 문제에서 부활에 도전!':'정답을 누르면 바로 제출돼. 신중하게 골라봐.'}</div></section>`;
    }
    shell(`<div class="gb-room-bar"><div><b>${modeLabel[r.mode]}</b> <span>${esc(r.category)}${r.pot?' · 총 상금 '+money(r.pot):''}</span></div><button id="gbLeave" class="gb-ghost">${waiting||complete?'홈으로':'도전 종료'}</button></div><div class="gb-game-grid">${content}${roster(r)}</div>`);
    q('gbLeave').onclick=()=>{if(!waiting&&!complete&&!window.confirm(r.mode==='solo'?'도전을 마치고 현재까지의 보상을 받을까?':'지금 나가면 이번 대결 상금을 받을 수 없어. 나갈까?'))return;act('/'+r.id+'/leave');};
    if(waiting){q('gbReady').onclick=()=>act('/'+r.id+'/ready',{ready:!p.ready});if(q('gbStart'))q('gbStart').onclick=()=>act('/'+r.id+'/start');}
    if(complete){q('gbAgain').onclick=()=>act('/'+r.id+'/leave');window.refreshMe?.(false).catch(()=>{});}
    s.root.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>act('/'+r.id+'/answer',{choice:Number(b.dataset.choice),token:r.question.token}));
    countdown();clearTimeout(s.deadline);
    if(r.deadline)s.deadline=setTimeout(refresh,Math.max(100,r.deadline-(Date.now()+s.offset)+300));
  }
  function countdown(){if(!s.active||document.hidden||!s.room)return;const el=q('gbTimer');if(el){const left=Math.max(0,Math.ceil((s.room.deadline-Date.now()-s.offset)/1000));el.textContent=(s.room.phase==='reveal'?'다음 문제 ':'')+left+'초';el.classList.toggle('gb-urgent',left<=5);}}
  function render(){if(!s.root)return;s.room?renderRoom():renderHome();}
  function leaveView(){s.active=false;s.epoch++;clearInterval(s.clock);clearTimeout(s.deadline);}
  async function enter(){s.root=document.getElementById('goldenbellRoot');s.active=true;s.epoch++;clearInterval(s.clock);s.clock=setInterval(countdown,250);if(!s.home)shell('<div class="gb-panel gb-empty">골든벨 교실을 여는 중…</div>');await refresh();}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&s.active)refresh();});
  window.JunjaGoldenbell={enter,leaveView,refresh};
})();

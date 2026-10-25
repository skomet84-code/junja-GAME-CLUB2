/* BLACK ROOM EP01 — accessible single-player investigation UI.
   Storage is local to device and separate from JUNJA LAND account/money. */
(() => {
 'use strict';
 const E=window.BlackRoomEngine;
 const STORAGE='junja_blackroom_ep01_v1';
 const $=s=>document.querySelector(s);
 const $$=s=>[...document.querySelectorAll(s)];
 const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let state;
 try{state=E.hydrate(JSON.parse(localStorage.getItem(STORAGE)||'null'));}
 catch{state=E.initial();}
 let tab='scene',selected=[],toastTimer=0;
 const panel=$('#panelRoot'),modal=$('#modal'),modalBody=$('#modalBody');
 const preserve=()=>{
  try{localStorage.setItem(STORAGE,JSON.stringify(state));$('#saveStatus').innerHTML='<span class="save-dot"></span>이 기기에 자동 저장';}
  catch{$('#saveStatus').textContent='이 기기 저장 불가 · 설정을 확인해';}
 };
 const notify=(message)=>{
  const node=$('#toast');node.textContent=message;node.classList.add('show');
  window.clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>node.classList.remove('show'),3300);
 };
 const openModal=(markup)=>{
  modalBody.innerHTML=markup;modal.hidden=false;
  const focus=modal.querySelector('input,button:not([data-action="close-modal"]),select');
  if(focus)window.setTimeout(()=>focus.focus(),25);
 };
 const closeModal=()=>{modal.hidden=true;modalBody.innerHTML='';};
 const mark=x=>'<span class="small-caps">'+esc(x)+'</span>';
 const objective=()=>{
  if(state.solved)return '사건 종결 · 진엔딩 해금';
  if(!state.door)return '13층 복도의 출입 장부를 조사하고 13호실 문을 열어.';
  if(!state.archive)return '객실 안 단서를 모으고, 보안실의 영상 보관함 암호를 해제해.';
  if(!state.clues.includes('footage'))return '보안실에서 CCTV 원본 영상을 확보해.';
  if(!E.ready(state))return '수사 보드에서 시각·출입·변장에 대한 증거를 연결해.';
  return '충분한 모순을 발견했어. 용의자를 지목하고 진상을 입증해.';
 };
 const heading=(title,sub,tag)=>'<header class="section-head"><div>'+mark(tag||'BLACK ROOM / INVESTIGATION')+'<h1>'+esc(title)+'</h1><p>'+esc(sub||'')+'</p></div><div class="section-meta"><span>사건 파일</span><strong>001 / 13</strong></div></header>';
 const places=()=>'<div class="location-tabs" aria-label="조사 위치">'+Object.entries(E.SCENES).map(([id,item])=>
  '<button type="button" data-scene="'+id+'" class="'+(state.scene===id?'active':'')+'" '+(id!=='hall'&&!state.door?'disabled':'')+'>'+
  (id==='hall'?'⌖ ':id==='room'?'⌑ ':'◫ ')+esc(item.name)+'</button>').join('')+'</div>';
 const scene=()=>{
  const loc=E.SCENES[state.scene];
  const markers=Object.entries(E.CLUES).filter(([,c])=>c.scene===state.scene).map(([id,c])=>{
   const found=state.clues.includes(id),locked=c.gate&&!state[c.gate];
   return '<button type="button" data-clue="'+id+'" style="left:'+c.x+'%;top:'+c.y+'%" class="hotspot '+(found?'found ':'')+(locked?'locked':'')+
    '" aria-label="'+esc((locked?'잠금 · ':'')+c.name)+'"><span>'+esc(found?'확보됨':locked?'잠김':c.name)+'</span></button>';
  }).join('');
  const lockButton=state.scene==='hall'&&!state.door?'<button class="scene-action" type="button" data-puzzle="door">⌑ 13호실 잠금 해제</button>':
   state.scene==='security'&&!state.archive?'<button class="scene-action security-lock" type="button" data-puzzle="archive">▣ CCTV 보관함 잠금 해제</button>':'';
  const collected=Object.entries(E.CLUES).filter(([id,c])=>c.scene===state.scene&&state.clues.includes(id)).length;
  const total=Object.values(E.CLUES).filter(c=>c.scene===state.scene).length;
  return heading(loc.name,loc.sub,'LOCATION / 0'+(Object.keys(E.SCENES).indexOf(state.scene)+1))+places()+
   '<div class="scene-frame"><img class="scene-art" src="/blackroom/scenes/'+state.scene+'.svg" alt="'+esc(loc.name+'의 현장 일러스트')+'">'+
   '<div class="scene-shade"></div><div class="scene-noise"></div><span class="scene-corner">OBJECT SEARCH · TAP TO INSPECT</span>'+
   markers+lockButton+'<span class="scene-caption">BLACK ROOM / '+esc(state.scene.toUpperCase())+'</span></div>'+
   '<div class="scene-footer"><span><strong>'+collected+' / '+total+'</strong> 현장 단서 확보</span><span>빛나는 지점을 터치해 확대 조사</span></div>'+
   '<section class="panel-card"><span class="eyebrow">CURRENT OBJECTIVE</span><h3>'+esc(objective())+'</h3><p>각 물건에서 증거를 확보하고, 수사 보드에서 서로 연결해 가설을 검증해. 오답도 조사 기록을 지우지는 않아.</p>'+
   '<button class="secondary-action" type="button" data-tab="board">증거 연결하러 가기 ↗</button></section>';
 };
 const evidenceCard=(id,selectable=false)=>{
  const c=E.CLUES[id],index=Object.keys(E.CLUES).indexOf(id)+1;
  return '<button type="button" class="evidence-card '+(selectable&&selected.includes(id)?'selected':'')+'" '+(selectable?'data-evidence="'+id+'"':'data-clue="'+id+'"')+'>'+
   '<span class="card-num">E—'+String(index).padStart(2,'0')+' / '+esc(c.type)+'</span>'+
   (selected.includes(id)&&selectable?'<span class="tick">✓</span>':'')+
   '<strong>'+esc(c.name)+'</strong><small>'+esc(c.fragment)+'</small></button>';
 };
 const empty=(title,description)=>'<div class="empty-state"><div class="empty-symbol">⌕</div><h3>'+esc(title)+'</h3><p>'+esc(description)+'</p><button class="secondary-action" type="button" data-tab="scene">현장 조사하기</button></div>';
 const evidence=()=>heading('증거 수첩','확보된 물증과 진술을 보관하는 사건 기록','DOSSIER / EVIDENCE')+
  (state.clues.length?'<div class="evidence-grid">'+state.clues.map(id=>evidenceCard(id)).join('')+'</div>':
  empty('수집된 증거 없음','복도의 빛나는 물건을 눌러 첫 번째 단서를 찾아봐.'))+
  '<div class="panel-card" style="margin-top:16px"><span class="eyebrow">NOTE</span><p>증거는 사실이고, 추리는 해석이야. 증거 두 개가 서로 어떤 모순을 일으키는지 생각해 봐.</p><button class="secondary-action" data-tab="board" type="button">수사 보드로 이동</button></div>';
 const board=()=>{
  const list=state.clues.map(id=>evidenceCard(id,true)).join('');
  const chips=state.links.map(id=>E.LINKS[id]).map(item=>
   '<article class="theory"><span class="theory-symbol">'+esc(item.icon)+'</span><b>'+esc(item.name)+'</b><p>'+esc(item.result)+'</p></article>').join('');
  const picks=selected.map(id=>E.CLUES[id].name).join(' + ')||'단서를 두 개 선택해';
  return heading('수사 보드','증거 두 개를 직접 선택하고 연결해 논리적인 결론을 만들어','DEDUCTION / EVIDENCE LINKS')+
   '<div class="board-summary"><strong>'+state.links.length+' / 5 추론 입증</strong><p>틀린 연결도 시도할 수 있어. 우연한 조합은 정답 처리되지 않아.</p></div>'+
   (state.clues.length?'<div class="evidence-grid">'+list+'</div>':empty('연결할 증거가 없어','현장에서 최소 두 개를 확보한 뒤 돌아와.'))+
   (state.clues.length?'<div class="combine-dock"><div class="chosen">'+esc(picks)+'</div><button class="outline-action" data-action="clear" type="button">초기화</button><button class="primary-action" data-action="connect" type="button" '+(selected.length!==2?'disabled':'')+'>증거 연결 ⟷</button></div>':'')+
   '<div class="section-head" style="margin-top:25px"><div><span class="eyebrow">VERIFIED THEORY</span><h1 style="font-size:23px">입증된 추론</h1></div></div>'+
   (chips?'<div class="theory-grid">'+chips+'</div>':empty('아직 성립한 추론 없음','장부와 잠금 로그처럼 서로 관련 있는 증거를 연결해 봐.'));
 };
 const people=()=>heading('용의자 심문','진술의 모순을 뒷받침할 증거가 있다면 대답이 달라진다','INTERROGATION / SUSPECTS')+
  '<div class="suspects">'+Object.entries(E.PEOPLE).map(([id,p],i)=>{
   const good=p.needs.every(k=>state.clues.includes(k));
   return '<article class="suspect-card"><div class="suspect-portrait"><span class="portrait-initial">'+['尹','姜','李'][i]+'</span></div>'+
    '<div class="suspect-info"><span class="eyebrow">PERSON '+String(i+1).padStart(2,'0')+'</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.role)+'</p>'+
    '<button type="button" class="'+(good?'primary-action':'secondary-action')+'" data-person="'+id+'">'+
    (state.interviews[id]?'진술 다시 보기':good?'증거 제시하고 추궁':'증언 듣기')+'</button></div></article>';
  }).join('')+'</div><section class="panel-card" style="margin-top:15px"><h3>심문 원칙</h3><p>증거가 충분하지 않으면 용의자는 기존의 알리바이를 반복해. 잘못된 심문으로 게임이 막히지 않도록 단서는 보존돼.</p></section>';
 const options=(arr)=>'<option value="">— 선택해 —</option>'+arr.map(([value,label])=>'<option value="'+value+'">'+esc(label)+'</option>').join('');
 const verdict=()=>{
  const satisfied=E.REQUIRED.map(id=>[id,E.LINKS[id]]);
  return heading('최종 추리','누가, 언제, 어떻게 밀실을 만들었는지 증거로 입증해야 한다','VERDICT / THE TRUTH')+
   '<section class="panel-card"><span class="eyebrow">REQUIRED EVIDENCE</span><h3>진실을 말할 준비가 되었는가?</h3>'+
   '<div class="verdict-gates">'+satisfied.map(([id,it])=>'<span class="'+(state.links.includes(id)?'passed':'')+'">'+(state.links.includes(id)?'✓ ':'⌑ ')+esc(it.name)+'</span>').join('')+'</div>'+
   (state.solved?'<div class="outcome"><strong>CASE CLOSED</strong><p>사건 해결 완료 · 최종 평점 '+state.score+'점</p></div>'+
    '<button type="button" class="secondary-action" data-action="ending">해결 결말 다시 보기</button>':
    E.ready(state)?'<p>검증 가능한 논리 세 가지가 완성됐어. 이제 최종 판단을 내려.</p>'+
    '<form id="verdictForm" class="verdict-form">'+
    '<label>① 진짜 범인은 누구인가?<select name="culprit" required>'+options([['yoon','윤서린 · 총지배인'],['kang','강도윤 · 기술자'],['lee','이현 · 투숙객']])+'</select></label>'+
    '<label>② CCTV 시간의 모순은 무엇인가?<select name="time" required>'+options([['offset','CCTV가 실제보다 7분 느렸다'],['fake','복도 시계가 7분 빨랐다'],['none','시간 조작은 없었다']])+'</select></label>'+
    '<label>③ 어떻게 밀실을 만들었는가?<select name="method" required>'+options([['inside','안에서 잠그고 창문으로 탈출'],['maintenance','정비용 마스터 잠금 해제'],['guest','일반 투숙객 카드로 열었다']])+'</select></label>'+
    '<button class="primary-action" type="submit">최종 지목 · 진상 입증 →</button></form>':
    '<p>성급한 지목은 진실을 왜곡해. 수사 보드에서 위 세 결론을 먼저 입증해야 해.</p>'+
    '<button type="button" class="secondary-action" data-tab="board">수사 보드에서 추론하기</button>')+
   '</section><section class="panel-card"><h3>판결 기준</h3><p>범인을 우연히 맞혀도 성공하지 않아. CCTV의 실제 시각과 잠금 장치 조작 방법까지 모두 설명해야 해. 오판하면 감점되지만, 확보한 단서는 사라지지 않아.</p></section>';
 };
 const journal=()=>heading('수사 기록','조사에서 실제로 확인한 사건의 연표','JOURNAL / FIELD NOTES')+
  (state.log.length?'<ol class="log-list">'+state.log.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ol>':empty('아직 기록 없음','현장에서 새로운 단서를 발견하면 사건 기록에 남아.'))+
  '<section class="panel-card"><h3>다시 시작</h3><p>이 기기에만 저장된 1인 플레이 기록이 초기화돼. 준자랜드 계정·게임머니·다른 게임 데이터에는 영향을 주지 않아.</p><button class="outline-action" type="button" data-action="restart">이 사건만 초기화</button></section>';
 const screens={scene,evidence,board,people,verdict,journal};
 const render=()=>{
  if(!screens[tab])tab='scene';
  panel.innerHTML=screens[tab]();
  $$('#sideRail [data-tab],.mobile-nav [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  const p=E.progress(state);
  $('#percentNum').textContent=p.percent+'%';$('#progressBar').style.width=p.percent+'%';
  $('#evidenceNum').textContent=String(p.clues).padStart(2,'0');
  $('#deductionNum').textContent=String(p.links).padStart(2,'0');
  $('#objectiveText').textContent=objective();
  $('#opening').hidden=state.started;
 };
 const clueDialog=id=>{
  const c=E.CLUES[id];if(!c)return;
  if(c.gate&&!state[c.gate]){puzzleDialog('archive');return;}
  const found=state.clues.includes(id);
  openModal('<span class="eyebrow">FORENSIC REPORT · '+esc(c.type)+'</span><h2 class="modal-headline" id="modalTitle">'+esc(c.name)+'</h2>'+
   '<p class="modal-copy">'+esc(c.description)+'</p><div class="forensic-quote">“'+esc(c.fragment)+'”</div>'+
   '<div class="modal-actions">'+(found?'<span class="chip">✓ 확보된 증거</span>':
    '<button type="button" class="primary-action" data-collect="'+id+'">증거 확보 · 수첩에 기록 →</button>')+
   '<button class="secondary-action" type="button" data-action="close-modal">현장으로 돌아가기</button></div>');
 };
 const puzzleDialog=id=>{
  const door=id==='door';
  if(!door&&!state.door){notify('13호실부터 조사해야 해.');return;}
  const solved=door?state.door:state.archive;
  openModal('<span class="eyebrow">ACCESS CONTROL · '+(door?'ROOM 13':'CCTV ARCHIVE')+'</span>'+
   '<h2 class="modal-headline" id="modalTitle">'+(door?'객실 출입 장치':'영상 보관함 인증')+'</h2>'+
   '<p class="modal-copy">'+(door?'마지막 방문 시각 4자리가 접근 코드야. 복도의 출입 장부를 먼저 확인해.':
    '보안실의 동기화 안내문에 적힌 암호 규칙을 해독해야 해. 지연 분 2자리와 객실 번호 2자리.')+'</p>'+
   (solved?'<div class="forensic-quote">ACCESS GRANTED · 이미 해제한 장치야.</div>':
    '<form id="puzzleForm" class="code-form"><input type="hidden" name="puzzle" value="'+id+'">'+
    '<label for="lockCode">4자리 보안 코드</label><input id="lockCode" type="text" name="code" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" placeholder="••••" autocomplete="off" required aria-label="네 자리 잠금 암호">'+
    '<button type="submit" class="primary-action">코드 입력 · 잠금 해제 →</button></form>')+
   '<p class="lock-hint">단서에 근거해 해독해야 해. 힌트는 오른쪽 위에서 볼 수 있어.</p>');
 };
 const interviewDialog=id=>{
  const res=E.interrogate(state,id);preserve();render();
  openModal('<span class="eyebrow">INTERROGATION / '+esc(E.PEOPLE[id].role)+'</span>'+
   '<h2 class="modal-headline" id="modalTitle">'+esc(E.PEOPLE[id].name)+'</h2>'+
   '<div class="forensic-quote">'+esc(res.message)+'</div>'+
   (res.reveal?'<p class="modal-copy">진술의 모순을 기록했어. 추가 증거와 연결해 최종 추리에 활용할 수 있어.</p>':
    '<p class="modal-copy">반박할 물증이 부족해. 관련 단서를 확보한 후 다시 심문하면 달라질 수 있어.</p>')+
   '<div class="modal-actions"><button type="button" class="primary-action" data-action="close-modal">심문 마치기</button></div>');
 };
 const endingDialog=()=>{
  openModal('<span class="eyebrow">TRUE ENDING / CASE CLOSED</span><h2 class="modal-headline" id="modalTitle">검은 문 뒤의 진실</h2>'+
   '<div class="outcome"><strong>RANK '+(state.score>=90?'S':state.score>=75?'A':state.score>=55?'B':'C')+'</strong><p>최종 '+state.score+'점 · 단서 '+state.clues.length+'개 · 힌트 '+state.hints+'회 · 오판 '+state.misses+'회</p></div>'+
   '<p class="modal-copy">강도윤은 실제보다 7분 느린 CCTV를 이용해 시간 기록을 조작하고, 정비 권한으로 객실을 열었다. 영상 속 초승달 브로치는 당신이 아니라 위장한 그를 가리켰다.</p>'+
   '<p class="modal-copy">하지만 초대장 뒷면에는 누군가 다른 필체로 적은 한 문장이 더 남아 있다. “그는 혼자가 아니었다.”</p>'+
   '<div class="modal-actions"><button type="button" data-action="close-modal" class="primary-action">수사 파일 확인</button></div>');
 };
 const feedbackDialog=(title,message,positive=false)=>{
  openModal('<span class="eyebrow">'+(positive?'DEDUCTION CONFIRMED':'FIELD ANALYSIS')+'</span><h2 class="modal-headline" id="modalTitle">'+esc(title)+'</h2><p class="modal-copy">'+esc(message)+'</p>'+
   '<div class="modal-actions"><button type="button" data-action="close-modal" class="primary-action">'+(positive?'추론 기록 확인':'수사 계속하기')+'</button></div>');
 };
 const help=()=>{
  openModal('<span class="eyebrow">FIELD MANUAL / HOW TO PLAY</span><h2 class="modal-headline" id="modalTitle">수사 방법</h2>'+
   '<div class="forensic-quote">① 현장의 빛나는 지점 클릭 → ② 단서 확보 → ③ 수사 보드에서 두 증거 연결 → ④ 용의자 심문 → ⑤ 최종 지목</div>'+
   '<p class="modal-copy">첫 번째 퍼즐은 복도의 장부, 두 번째 퍼즐은 보안실의 장비 안내문이 핵심이야. 틀려도 단서는 유지되고 마지막 지목에서 증거가 충분하지 않으면 진행할 수 없어.</p>'+
   '<p class="modal-copy">현재는 <strong>첫 번째 1인 플레이 테스트</strong>야. 진행도는 이 기기 브라우저에만 저장돼. 서버 계정 연동과 친구 협동 플레이는 후속 버전에서 추가할 계획이야.</p>'+
   '<button type="button" class="secondary-action" data-action="close-modal">수사 계속하기</button>');
 };
 document.addEventListener('click',ev=>{
  const element=ev.target.closest('button[data-action],button[data-tab],button[data-scene],button[data-clue],button[data-evidence],button[data-puzzle],button[data-collect],button[data-person]');
  if(!element)return;
  if(element.dataset.tab){tab=element.dataset.tab;if(tab!=='board')selected=[];render();$('#mainContent').scrollIntoView({block:'start',behavior:'smooth'});return;}
  if(element.dataset.scene){const result=E.travel(state,element.dataset.scene);if(result.ok){tab='scene';preserve();render();}else notify(result.message);return;}
  if(element.dataset.clue){clueDialog(element.dataset.clue);return;}
  if(element.dataset.puzzle){puzzleDialog(element.dataset.puzzle);return;}
  if(element.dataset.collect){const res=E.collect(state,element.dataset.collect);if(res.ok){closeModal();preserve();render();}notify(res.message);return;}
  if(element.dataset.evidence){
   const id=element.dataset.evidence;
   if(selected.includes(id))selected=selected.filter(x=>x!==id);
   else{if(selected.length===2)selected.shift();selected.push(id);}
   render();return;
  }
  if(element.dataset.person){interviewDialog(element.dataset.person);return;}
  const act=element.dataset.action;
  if(act==='start'){state.started=true;preserve();render();notify('첫 번째 수사를 시작해. 출입 장부를 찾아봐.');return;}
  if(act==='hint'){const value=E.hint(state);preserve();render();feedbackDialog('수사 힌트',value,false);return;}
  if(act==='help'){help();return;}
  if(act==='close-modal'){closeModal();return;}
  if(act==='clear'){selected=[];render();return;}
  if(act==='connect'){
   if(selected.length!==2){notify('두 개의 증거를 선택해.');return;}
   const res=E.connect(state,selected[0],selected[1]);
   if(res.ok){selected=[];preserve();render();}
   feedbackDialog(res.ok?'추론 입증 완료':'증거 연결 실패',res.message,res.ok);return;
  }
  if(act==='ending'){endingDialog();return;}
  if(act==='restart'){
   if(!window.confirm('제13호실의 이 기기 저장 기록만 초기화할까? 준자랜드 계정·게임머니에는 영향 없어.'))return;
   state=E.initial();tab='scene';selected=[];closeModal();preserve();render();return;
  }
 });
 document.addEventListener('submit',ev=>{
  if(ev.target.id==='puzzleForm'){
   ev.preventDefault();
   const fd=new FormData(ev.target);const res=E.puzzle(state,fd.get('puzzle'),fd.get('code'));
   if(res.ok){closeModal();tab='scene';preserve();render();notify(res.message);}
   else notify(res.message);return;
  }
  if(ev.target.id==='verdictForm'){
   ev.preventDefault();
   const fd=new FormData(ev.target);
   const res=E.verdict(state,{culprit:fd.get('culprit'),time:fd.get('time'),method:fd.get('method')});
   preserve();render();
   if(res.ok)endingDialog();else feedbackDialog('추론에 오류가 있어',res.message,false);
  }
 });
 modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)closeModal();});
 render();
})();

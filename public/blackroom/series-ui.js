/* BLACK ROOM 13-case serial UI; all campaign progress is saved in the existing ep01 cloud snapshot. */
(() => {
 'use strict';
 const E=window.BlackRoomEngine,S=window.BlackRoomSeriesEngine;
 const KEY='junja_blackroom_ep01_v1',app=document.getElementById('srApp'),list=document.getElementById('srCaseList'),
 modal=document.getElementById('srModal'),inside=document.getElementById('srModalInside'),toast=document.getElementById('srToast');
 const safe=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[x]));
 const clone=x=>JSON.parse(JSON.stringify(x));
 const local=k=>{try{return E.hydrate(JSON.parse(localStorage.getItem(k)||'null'));}catch{return E.initial();}};
 let account=null,revision=0,cloud=false,uploading=false,pending=false,tab='scene',selection=[],active=2,loaded=false,state=local(KEY),toastTimer=0;
 const userKey=()=>account?KEY+'_user_'+account.id:KEY;
 const prog=()=>state.series||(state.series=S.fresh());
 const lookup=id=>S.lookup.get(id);
 const status=msg=>{document.getElementById('srSave').textContent=msg;};
 const showToast=msg=>{toast.textContent=msg;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),4300);};
 const openModal=html=>{inside.innerHTML=html;modal.hidden=false;const input=inside.querySelector('input,select,button');if(input)setTimeout(()=>input.focus(),30);};
 const closeModal=()=>{modal.hidden=true;inside.innerHTML='';};
 const errMessage=res=>showToast(res.message||'수사 기록을 확인해.');
 const proofCard=t=>'<div class="sr-logic-piece"><b>✓ '+safe(t.name)+'</b><p>'+safe(t.text)+'</p></div>';
 function save(){
  try{localStorage.setItem(userKey(),JSON.stringify(state));}catch{status('⚠ 로컬 저장 불가');}
  if(cloud){pending=true;sync();}
  else status('이 기기에 저장됨 · 로그인이 필요하면 로비에서 로그인');
 }
 async function sync(){
  if(!cloud||uploading)return;uploading=true;
  try{
   while(pending&&cloud){
    pending=false;
    const snapshot=clone(state),requestRev=revision;
    status('☁ 계정 수사 기록 저장 중');
    const response=await fetch('/api/blackroom/state',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:requestRev,state:snapshot})});
    const data=await response.json();
    if(response.status===409){
     revision=data.revision;
     const remote=E.hydrate(data.state);
     // The server revision is authoritative for old EP01 progress. Merge only the campaign's monotonic unlocks.
     remote.series=S.merge(remote.series,state.series,remote.solved);
     state=remote;
     try{localStorage.setItem(userKey(),JSON.stringify(state));}catch{}
     pending=true;render();continue;
    }
    if(!response.ok){cloud=false;status('⚠ 서버 동기화 실패 · 기기 기록 유지');showToast(data.error||'서버 저장 실패');break;}
    revision=data.revision;
    if(pending){const current=state;state=E.hydrate(data.state);state.series=S.merge(state.series,current.series,state.solved);}
    status('☁ 준자랜드 계정에 저장됨');
   }
  }catch(e){cloud=false;status('⚠ 인터넷 연결 오류 · 기기 기록 유지');}
  finally{uploading=false;}
 }
 async function load(){
  const guest=local(KEY);
  try{
   const r=await fetch('/api/blackroom/state',{credentials:'same-origin',cache:'no-store'});
   if(!r.ok)throw Error('not authenticated');
   const data=await r.json();
   if(!Number.isInteger(data.account?.id))throw Error('bad identity');
   account=data.account;revision=data.revision;cloud=true;
   const own=local(userKey());
   state=data.state?E.hydrate(data.state):own.started?own:E.initial();
   if(own.started&&state.solved){
    const merged=S.merge(state.series,own.series,true);
    if(JSON.stringify(merged)!==JSON.stringify(state.series)){state.series=merged;pending=true;}
   }
   if(!data.state&&state.started)pending=true;
   loaded=true;active=S.highestUnlocked(prog(),state.solved);prog().active=active;
   render();status('☁ 준자랜드 계정 기록 불러옴');
   try{localStorage.setItem(userKey(),JSON.stringify(state));}catch{}
   if(pending)sync();
  }catch{
   state=guest;cloud=false;loaded=true;
   active=S.highestUnlocked(prog(),state.solved);render();
   status('이 기기에서만 진행 저장 · 로비 로그인 시 계정 저장');
  }
 }
 const progressCount=()=>(state.solved?1:0)+Object.values(prog().cases).filter(p=>p?.solved).length;
 function renderList(){
  const done1=state.solved;
  list.innerHTML='<a class="sr-case '+(done1?'done':'')+'" href="/blackroom/"><b>01</b><span><small>사라진 제13호실</small><em>'+(state.ending==='true'?'TRUE ENDING':done1?'본편 해결 · 진엔딩 도전 가능':'조사 미완료')+'</em></span><span class="sr-tick">'+(done1?'✓':'⌕')+'</span></a>'+
   S.CASES.map(c=>{
    const p=prog().cases[c.id],locked=!S.unlocked(prog(),c.id,done1),done=!!p?.solved;
    return '<button class="sr-case '+(active===c.id?'active ':'')+(done?'done':'')+'" type="button" data-case="'+c.id+'" '+(locked?'disabled':'')+'>'+
      '<b>'+String(c.id).padStart(2,'0')+'</b><span><small>'+safe(c.title)+'</small><em>'+(locked?'잠김 · 이전 사건 해결 필요':done?'해결 완료':p?.opened?'수사 중':'새 사건')+'</em></span><span class="sr-tick">'+(locked?'⌑':done?'✓':'⌖')+'</span></button>';
   }).join('');
  document.getElementById('srComplete').textContent=String(progressCount()).padStart(2,'0')+' / 13';
  document.getElementById('srHint').disabled=!done1||!!prog().cases[active]?.solved;
 }
 const pct=(p)=>Math.min(100,Math.round((p.clues.length/8*.4+p.gates.length/2*.2+p.theories.length/3*.2+p.interviews.length/2*.1+(p.solved?.1:0))*100));
 const top=(c,p)=>'<span class="sr-topline">CLASSIFIED CASE FILE / '+String(c.id).padStart(3,'0')+' / 013</span>'+
  '<div class="sr-heading"><div><h1>'+safe(c.title)+'</h1><p>'+safe(c.subtitle)+'</p></div><div class="sr-index">'+String(c.id).padStart(2,'0')+'</div></div>'+
  '<div class="sr-progress"><div style="width:'+pct(p)+'%"></div></div>'+
  '<div class="sr-tabs">'+[['scene','현장 조사'],['evidence','증거 수첩'],['board','수사 보드'],['people','용의자'],['verdict','최종 판결']].map(([id,name])=>'<button data-tab="'+id+'" class="sr-tab '+(tab===id?'active':'')+'">'+name+'</button>').join('')+'</div>';
 const intro=(c,p)=>p.opened?'':'<div class="sr-opening"><div><span class="sr-overline">THE STORY CONTINUES</span><h2>'+safe(c.title)+'</h2><p>'+safe(c.subtitle)+' — 앞선 사건의 마지막 단서를 따라 새로운 진실을 찾아라.</p></div></div>';
 const outcome=(c,p)=>p.solved?'<div class="sr-result"><span class="sr-overline">CASE '+String(c.id).padStart(3,'0')+' / RESOLVED</span><strong>TRUE ENDING</strong><p>'+safe(c.ending)+'</p><p>사건 점수 '+p.score+'점 · 확보 증거 '+p.clues.length+'개</p>'+
  (c.id<13?'<button type="button" class="sr-btn" data-next="'+(c.id+1)+'">다음 사건 '+String(c.id+1).padStart(3,'0')+' 시작 →</button>':'<button type="button" class="sr-btn" data-tab="journal">13개 사건의 수사 결과 보기</button>')+'</div>':'';
 function scene(c,p){
  const index=p.scene,items=c.clues.filter(x=>x.scene===index),puzzle=c.puzzles[index];
  const places='<div class="sr-locations">'+c.locations.map((name,i)=>'<button type="button" data-place="'+i+'" class="'+(index===i?'active':'')+'" '+(i>p.gates.length?'disabled':'')+'>'+String(i+1).padStart(2,'0')+' · '+safe(name)+'</button>').join('')+'</div>';
  const art='<div class="sr-scene"><div><small>SCENE '+String(index+1).padStart(2,'0')+' · INTERACTIVE INVESTIGATION</small><b>'+safe(c.locations[index])+'</b></div></div>';
  const cards='<div class="sr-cards">'+items.map(e=>'<button type="button" class="sr-clue '+(p.clues.includes(e.id)?'found':'')+'" data-clue="'+e.id+'"><small>증거 / '+safe(e.id.toUpperCase())+'</small><strong>'+safe(e.name)+'</strong><em>'+(p.clues.includes(e.id)?'✓ 수사 수첩 기록됨':'⌕ 터치하여 조사')+'</em></button>').join('')+'</div>';
  const box=puzzle?'<div class="sr-card"><span class="sr-overline">SECURED AREA</span><h3>'+safe(puzzle.name)+'</h3><p>'+safe(puzzle.intro)+'</p><div class="sr-actions"><button class="sr-btn" type="button" data-lock="'+puzzle.id+'">▣ 단서 조합하여 잠금 해제</button></div></div>':'';
  return intro(c,p)+places+art+'<div class="sr-card"><span class="sr-overline">EVIDENCE / TAP TO INVESTIGATE</span><h3>현장에 남겨진 물증</h3>'+cards+'</div>'+
   (puzzle&&!p.gates.includes(puzzle.id)?box:'')+(!puzzle&&p.scene===2?'<div class="sr-info">최종 증거를 찾았다면 수사 보드에서 기록을 교차 검증해.</div>':'')+outcome(c,p);
 }
 function evidence(c,p){
  return '<div class="sr-card"><span class="sr-overline">PERSONAL EVIDENCE LOG</span><h2>증거 수첩 · '+p.clues.length+' / 8</h2><p>현장 조사에서 확보한 기록만 열람할 수 있어. 사라진 퍼즐의 조각을 연결해.</p>'+
   (p.clues.length?'<div class="sr-cards">'+p.clues.map(id=>{const e=c.clues.find(x=>x.id===id);return '<button class="sr-clue found" data-clue="'+id+'"><small>'+safe(c.locations[e.scene])+'</small><strong>'+safe(e.name)+'</strong><em>자세히 보기 →</em></button>';}).join('')+'</div>':'<p>확보한 물증이 없어. 먼저 현장을 조사해.</p>')+'</div>'+outcome(c,p);
 }
 function board(c,p){
  return '<div class="sr-card"><span class="sr-overline">FORENSIC DEDUCTION</span><h2>증거를 선택하고 연결해</h2><p>서로 다른 물증 두 개를 선택하면 논리적인 관계가 있는지 검증할 수 있어. 잘못 추론해도 증거는 사라지지 않아.</p>'+
   '<div class="sr-cards">'+p.clues.map(id=>{const e=c.clues.find(x=>x.id===id);return '<button data-evidence="'+id+'" class="sr-clue '+(selection.includes(id)?'selected':'')+'"><small>'+safe(e.id.toUpperCase())+'</small><strong>'+safe(e.name)+'</strong><em>'+ (selection.includes(id)?'✓ 선택됨':'선택하기')+'</em></button>';}).join('')+'</div>'+
   '<div class="sr-actions"><button class="sr-btn" data-action="connect">증거 '+selection.length+' / 2 · 인과관계 입증</button><button class="sr-btn ghost" data-action="clear">선택 초기화</button></div></div>'+
   '<div class="sr-card"><h3>입증한 논증 · '+p.theories.length+' / 3</h3><div class="sr-logic">'+p.theories.map(id=>proofCard(c.theories.find(t=>t.id===id))).join('')+(p.theories.length?'':'<p>증거를 교차 검증하면 이곳에 결과가 기록돼.</p>')+'</div></div>'+outcome(c,p);
 }
 function people(c,p){
  return '<div class="sr-card"><span class="sr-overline">INTERROGATION ROOM</span><h2>모순된 증언</h2><p>기록과 진술을 대조해야 자백이 아닌 입증을 얻을 수 있어.</p></div>'+
   c.witnesses.map((w,i)=>'<div class="sr-card"><div class="sr-witness"><div class="sr-avatar">'+safe(w.name.slice(0,1))+'</div><div><h3>'+safe(w.name)+' <small>· '+safe(w.role)+'</small></h3><p>“'+safe(w.claim)+'”</p><button class="sr-btn secondary" data-witness="'+w.id+'">'+(p.interviews.includes(w.id)?'✓ 진술 입증 다시 보기':'증거 제시하며 심문하기')+'</button></div></div></div>').join('')+outcome(c,p);
 }
 function verdict(c,p){
  const complete=p.gates.length===2&&p.theories.length===3&&p.interviews.length===2;
  const question=(key,label)=>'<label class="sr-field">'+label+'<select name="'+key+'" required><option value="">— 증거를 보고 선택해 —</option>'+S.options(c.id,key).map(value=>'<option value="'+safe(value)+'">'+safe(value)+'</option>').join('')+'</select></label>';
  const forms=complete?'<form id="srVerdict">'+question('culprit','① 증거를 조작한 핵심 인물은 누구인가?')+
   question('act','② 사건에서 조작된 핵심 사실은 무엇인가?')+question('motive','③ 조작과 은폐의 최종 목적은 무엇인가?')+
   '<button class="sr-btn" type="submit">최종 판결 · 진상 입증 →</button></form>':
   '<div class="sr-info">필요 조건: 잠금 2/2 · 추론 '+p.theories.length+'/3 · 심문 '+p.interviews.length+'/2. 나머지 증거를 확인해.</div>';
  return '<div class="sr-card"><span class="sr-overline">THE FINAL JUDGMENT</span><h2>판결에 필요한 근거</h2>'+
   '<div class="sr-logic">'+c.theories.map(t=>'<div class="sr-logic-piece"><b>'+(p.theories.includes(t.id)?'✓':'⌑')+' '+safe(t.name)+'</b><p>'+(p.theories.includes(t.id)?safe(t.text):'아직 증명되지 않은 추론')+'</p></div>').join('')+'</div>'+
   '<p>용의자의 이름만 맞혀서는 해결로 인정하지 않아. 조작과 동기를 모두 입증해야 해.</p>'+(!p.solved?forms:'')+'</div>'+outcome(c,p);
 }
 function journal(){
  const cases=S.CASES,done=cases.filter(c=>prog().cases[c.id]?.solved);
  return '<div class="sr-card"><span class="sr-overline">FINAL INVESTIGATION REPORT</span><h2>열세 개 사건의 진실</h2><p>제13호실에서 시작된 조작은 실험실, 열차, 병원, 해저 서버를 거쳐 도시 감시체계까지 이어졌다.</p><div class="sr-logic">'+
   cases.map(c=>'<div class="sr-logic-piece"><b>'+String(c.id).padStart(3,'0')+' · '+safe(c.title)+'</b><p>'+(prog().cases[c.id]?.solved?'✓ 해결 · '+safe(c.ending):'아직 조사되지 않은 사건')+'</p></div>').join('')+
   '</div></div>'+(done.length===12?'<div class="sr-result"><span class="sr-overline">ALL 13 CASES COMPLETED</span><strong>THE FINAL TRUTH</strong><p>누군가는 시간을 바꾸고, 누군가는 신원을 바꾸었다. 그러나 13개의 사건을 연결한 수사 기록은 어느 한 사람도 쉽게 지울 수 없게 되었다.</p><a class="sr-btn" href="/blackroom/">첫 사건 다시 보기</a></div>':'');
 }
 function render(){
  if(!loaded)return;
  const cleared=state.solved;
  renderList();
  if(!cleared){
   app.innerHTML='<div class="sr-opening"><div><span class="sr-overline">ARCHIVE LOCKED / CASE 001</span><h2>제13호실의 기본 판결을 마쳐야 해</h2><p>시각·출입·변장에 관한 핵심 추론 3개를 입증하고 결론 탭에서 사건을 해결하면 002화가 열려. 진엔딩은 필수가 아니야. 기존 기록은 유지돼.</p><a href="/blackroom/" class="sr-btn">제13호실 수사 계속하기 →</a></div></div>';return;
  }
  if(tab==='journal'){app.innerHTML=journal();return;}
  if(!S.unlocked(prog(),active,true)){active=S.highestUnlocked(prog(),true);}
  const c=lookup(active);if(!c){app.innerHTML='<p>사건 파일을 찾을 수 없어.</p>';return;}
  if(!prog().cases[active])prog().cases[active]=S.freshCase();
  const p=prog().cases[active];
  app.innerHTML=top(c,p)+({scene,evidence,board,people,verdict}[tab]||scene)(c,p);
 }
 function goCase(id){if(!S.unlocked(prog(),id,state.solved))return;
  active=id;prog().active=id;tab='scene';selection=[];closeModal();render();save();window.scrollTo({top:0,behavior:'smooth'});}
 function action(name,arg){
  if(!state.series)return;
  let res;
  if(name==='clue'){const c=lookup(active),e=c.clues.find(x=>x.id===arg);
   res=S.inspect(prog(),active,arg);if(res.ok){save();render();openModal('<span class="sr-overline">EVIDENCE '+safe(arg.toUpperCase())+'</span><h2 id="srModalTitle">'+safe(e.name)+'</h2><p>'+safe(e.description)+'</p><button data-global="close" class="sr-btn">수첩에 기록 확인</button>');}else errMessage(res);return;}
  if(name==='witness'){const c=lookup(active),w=c.witnesses.find(x=>x.id===arg);
   res=S.question(prog(),active,arg);save();render();openModal('<span class="sr-overline">INTERROGATION / '+(res.reveal?'EVIDENCE CONFIRMED':'TESTIMONY')+'</span><h2 id="srModalTitle">'+safe(w.name)+'</h2><p>'+safe(res.message)+'</p><button data-global="close" class="sr-btn">수사 계속하기</button>');return;}
  if(name==='hint'){res=S.hint(prog(),active);if(res.ok){save();openModal('<span class="sr-overline">INVESTIGATOR HINT</span><h2 id="srModalTitle">수사 힌트</h2><p>'+safe(res.message)+'</p><p>힌트 1회 사용 · 최종 점수 -5</p><button class="sr-btn" data-global="close">계속 조사</button>');}return;}
  if(name==='connect'){
   if(selection.length!==2)return showToast('단서 두 개를 선택해야 해.');
   res=S.connect(prog(),active,selection[0],selection[1]);selection=[];save();render();
   openModal('<span class="sr-overline">'+(res.ok?'PROOF CONFIRMED':'RECHECK REQUIRED')+'</span><h2 id="srModalTitle">'+safe(res.name||'증거 검토')+'</h2><p>'+safe(res.message)+'</p><button class="sr-btn" data-global="close">확인</button>');return;}
  if(name==='clear'){selection=[];render();return;}
 }
 document.addEventListener('click',event=>{
  const t=event.target.closest('[data-case],[data-next],[data-tab],[data-place],[data-clue],[data-evidence],[data-lock],[data-witness],[data-action],[data-global]');
  if(!t)return;
  if(t.dataset.case){goCase(Number(t.dataset.case));return;}
  if(t.dataset.next){goCase(Number(t.dataset.next));return;}
  if(t.dataset.tab){tab=t.dataset.tab;selection=[];render();return;}
  if(t.dataset.place){const res=S.travel(prog(),active,Number(t.dataset.place));if(res.ok){render();save();}else errMessage(res);return;}
  if(t.dataset.clue){action('clue',t.dataset.clue);return;}
  if(t.dataset.evidence){const id=t.dataset.evidence;selection=selection.includes(id)?selection.filter(x=>x!==id):[...selection.slice(-1),id];render();return;}
  if(t.dataset.lock){
   const c=lookup(active),p=c.puzzles.find(x=>x.id===t.dataset.lock);
   openModal('<span class="sr-overline">SECURITY LOCK / '+safe(c.title)+'</span><h2 id="srModalTitle">'+safe(p.name)+'</h2><p>'+safe(p.intro)+'</p><form id="srPuzzle"><input type="hidden" name="gate" value="'+p.id+'"><label class="sr-field">네 자리 암호<input class="sr-code" name="answer" type="text" inputmode="numeric" autocomplete="off" maxlength="4" required placeholder="••••"></label><button class="sr-btn" type="submit">잠금 해제</button></form>');return;
  }
  if(t.dataset.witness){action('witness',t.dataset.witness);return;}
  if(t.dataset.action){action(t.dataset.action);return;}
  if(t.dataset.global==='close'){closeModal();return;}
  if(t.dataset.global==='archive'){openModal('<h2 id="srModalTitle">사건 보관함</h2><div class="sr-case-list">'+S.CASES.map(c=>'<button class="sr-case" type="button" data-case="'+c.id+'" '+(!S.unlocked(prog(),c.id,state.solved)?'disabled':'')+'><b>'+String(c.id).padStart(2,'0')+'</b><span>'+safe(c.title)+(prog().cases[c.id]?.solved?' ✓':'')+'</span><span>›</span></button>').join('')+'</div>');return;}
  if(t.dataset.global==='scene'||t.dataset.global==='board'||t.dataset.global==='verdict'){tab=t.dataset.global;render();window.scrollTo({top:0,behavior:'smooth'});return;}
 });
 document.addEventListener('submit',event=>{
  if(event.target.id==='srPuzzle'){
   event.preventDefault();const fd=new FormData(event.target),res=S.unlock(prog(),active,fd.get('gate'),fd.get('answer'));
   save();if(res.ok){closeModal();render();showToast(res.message);}else{showToast(res.message);}
   return;
  }
  if(event.target.id==='srVerdict'){
   event.preventDefault();const fd=new FormData(event.target),res=S.verdict(prog(),active,{culprit:fd.get('culprit'),act:fd.get('act'),motive:fd.get('motive')});
   save();render();
   if(res.ok){openModal('<span class="sr-overline">TRUE ENDING / CASE '+String(active).padStart(3,'0')+'</span><h2 id="srModalTitle">사건 해결 · '+res.score+'점</h2><p>'+safe(res.message)+'</p>'+
    (res.finished?'<button class="sr-btn" data-tab="journal">13개 사건 최종 보고서 보기</button>':'<button class="sr-btn" data-next="'+res.next+'">다음 사건으로 →</button>'));}
   else showToast(res.message);
  }
 });
 modal.addEventListener('click',event=>{if(event.target===modal)closeModal();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();});
 document.getElementById('srHint').addEventListener('click',()=>action('hint'));
 load();
})();
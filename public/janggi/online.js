(()=>{'use strict';
const R=window.JanggiRules;if(!R)return;
const $=id=>document.getElementById(id),state={room:null,home:null,loading:false,busy:false,selected:null,hints:[],offset:0,inviteDone:false,prefs:{aiSide:'c',aiFormation:'inner',pvpCho:'inner',pvpHan:'inner'}};
const TEXT={rook:'車',horse:'馬',elephant:'象',guard:'士',king:'楚',cannon:'包',soldier:'卒'};
const HAN={...TEXT,king:'漢',cannon:'砲',soldier:'兵'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(action,text,cls='',attr='')=>'<button class="jg-btn '+cls+'" type="button" data-action="'+action+'" '+attr+'>'+text+'</button>';
const winnerName=r=>r.players.find(p=>p.id===r.winner)?.nickname||'상대';
const sideName=s=>s==='c'?'초楚':'한漢';
const SIDE_CHOICES=[{value:'c',title:'초楚',detail:'선공'},{value:'h',title:'한漢',detail:'후공'}];
const FORMATION_CHOICES=[
 {value:'left',title:'왼상',detail:'象馬象馬'},
 {value:'right',title:'오른상',detail:'馬象馬象'},
 {value:'inner',title:'안상',detail:'馬象象馬'},
 {value:'outer',title:'바깥상',detail:'象馬馬象'}
];
function choiceButtons(kind,options,selected){
 return '<div class="jg-choice-grid '+(options.length===2?'two':'')+'" role="group" aria-label="'+(kind==='aiSide'?'내 진영':'시작 차림')+'">'+
 options.map(o=>'<button type="button" class="jg-choice'+(o.value===selected?' active':'')+'" data-action="choose" data-kind="'+kind+'" data-value="'+o.value+'" aria-pressed="'+(o.value===selected)+'"><strong>'+o.title+'</strong><small>'+o.detail+'</small></button>').join('')+'</div>';
}
function notify(t=''){$('jgNotice').textContent=t;}
async function api(path,body){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{const res=await fetch('/api/janggi'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
 headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
 const d=await res.json();if(!res.ok){const e=new Error(d.error||'요청이 실패했습니다.');e.status=res.status;throw e;}return d;}finally{clearTimeout(timer);}
}
function update(d){state.room=d.room||null;if(d.rooms)state.home=d;if(state.room)state.offset=state.room.serverNow-Date.now();state.selected=null;state.hints=[];render();}
async function refresh(force=false){
 if(state.loading||state.busy||document.hidden)return;state.loading=true;
 try{const old=state.room,d=await api(old?'/'+old.id:'');
 if(!force&&old&&d.room&&d.room.version===old.version)return;
 update(d);
 if(!state.room&&!state.inviteDone){
  state.inviteDone=true;const invite=new URL(location.href).searchParams.get('join');
  if(invite&&/^JG[a-f0-9]{14}$/.test(invite)){history.replaceState(null,'','/janggi/online.html');await act('/'+invite+'/join');}
 }
 }catch(e){
 if(e.status===401){$('jgHome').innerHTML='<section class="jg-panel"><h2>로그인이 필요합니다.</h2><a href="/">준자랜드 로그인 →</a></section>';return;}
 if(e.status===404||e.status===403){state.room=null;try{update(await api(''));}catch{}return;}
 notify(e.message);
 }finally{state.loading=false;}
}
async function act(path,body={}){
 if(state.busy)return;state.busy=true;notify('');
 document.querySelectorAll('button').forEach(b=>{if(b.dataset.action)b.disabled=true;});
 try{const d=await api(path,body);update(d);if(!d.room)update(await api(''));}
 catch(e){notify(e.message);render();}
 finally{state.busy=false;}
}
function lobby(){
 $('jgHome').hidden=false;$('jgMatch').hidden=true;
 const h=state.home||{rooms:[],stats:{}},s=h.stats||{};
 $('jgHome').innerHTML='<section class="jg-panel jg-high"><div class="jg-panelcap">ROYAL GRANDMASTER CHALLENGE</div><h2>🤖 최강 AI 도전</h2><div class="jg-prize">🏆 1조 G</div><p>서버에서 직접 수읽기하는 최고 난도 J-BOT과 대국하세요. AI를 <b>정상적인 외통승</b>으로 이기면 게임머니 1조가 자동 지급됩니다.</p>'+
 '<div class="jg-setup-heading">내 진영 <small>원하는 진영을 누르세요</small></div>'+choiceButtons('aiSide',SIDE_CHOICES,state.prefs.aiSide)+
 '<div class="jg-setup-heading">내 기물 차림 <small>마·상 배치 4가지</small></div>'+choiceButtons('aiFormation',FORMATION_CHOICES,state.prefs.aiFormation)+
 btn('ai','⚔️ 최강 AI 도전 시작','primary')+'<p>무료 도전 · 무르기 없음 · 패배/기권/무승부는 상금 없음 · 서버 검증 후 지급</p></section>'+
 '<section class="jg-panel"><div class="jg-panelcap">LIVE 1:1 MATCHMAKING</div><h2>🌐 친구와 온라인 대결</h2><p>같은 기기가 아닌 <b>서로 다른 휴대폰</b>으로 진짜 대결합니다. 공개방을 만들거나 초대 링크를 친구에게 보내세요.</p>'+
 '<label>방 이름<input id="jgRoomInput" maxlength="28" placeholder="친구들과 장기 한 판"></label>'+
 '<div class="jg-setup-heading">초楚 시작 차림</div>'+choiceButtons('pvpCho',FORMATION_CHOICES,state.prefs.pvpCho)+
 '<div class="jg-setup-heading">한漢 시작 차림</div>'+choiceButtons('pvpHan',FORMATION_CHOICES,state.prefs.pvpHan)+
 btn('create','＋ 온라인 장기방 만들기','primary')+'<h2 style="margin-top:22px">참가 가능한 방</h2><div>'+
 (h.rooms?.length?h.rooms.map(r=>'<div class="jg-room-row"><span><b>'+esc(r.name)+'</b><small>'+esc(r.host)+' · '+r.players+'/2명</small></span>'+btn('join','입장','secondary','data-id="'+esc(r.id)+'"')+'</div>').join(''):'<p>아직 공개된 방이 없습니다.</p>')+'</div>'+btn('refresh','방 목록 새로고침','secondary')+'</section>'+
 '<section class="jg-panel"><h2>나의 장기 전적</h2><div class="jg-stats">'+[['games','대국'],['wins','승리'],['aiWins','AI 격파'],['earnings','상금 G']].map(([key,name])=>'<div><strong>'+Number(s[key]||0).toLocaleString('ko-KR')+'</strong><small>'+name+'</small></div>').join('')+'</div></section>'+
 '<section class="jg-panel"><h2>☑️ 실전 안내</h2><p>온라인 대인전: 방 만들기 → 친구 입장 → 양쪽 준비 → 방장 시작.<br>한 수당 3분, 실시간 기보·초대 링크·재대국 지원.<br>AI 상금은 <b>온라인 최강 AI 챌린지</b>에서만 지급됩니다. 같은 기기 로컬 연습은 상금 대상이 아닙니다.</p><a href="/janggi/index.html" class="jg-btn secondary" style="display:grid;place-items:center">로컬 연습 장기로 이동</a></section>';
}
function vector(){
 let html='<svg class="jg-board-svg" viewBox="0 0 780 860" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" aria-hidden="true">';
 for(let x=0;x<9;x++)html+='<line class="jg-line" x1="'+(70+80*x)+'" y1="70" x2="'+(70+80*x)+'" y2="790"/>';
 for(let y=0;y<10;y++)html+='<line class="jg-line" x1="70" y1="'+(70+80*y)+'" x2="710" y2="'+(70+80*y)+'"/>';
 for(const top of [70,630])html+='<line class="jg-palace" x1="310" y1="'+top+'" x2="470" y2="'+(top+160)+'"/><line class="jg-palace" x1="470" y1="'+top+'" x2="310" y2="'+(top+160)+'"/>';
 return html+'</svg>';
}
const grid=vector();
function match(){
 $('jgHome').hidden=true;$('jgMatch').hidden=false;
 const r=state.room,pvp=!r.ai,waiting=r.phase==='waiting',finished=r.phase==='complete';
 const turnSide=r.turn,me=r.mySide;
 $('jgRoomName').textContent=r.name;$('jgRound').textContent='ROUND '+r.round;
 $('jgHanName').textContent=esc(r.players.find(p=>p.color==='h')?.nickname||'대기');
 $('jgChoName').textContent=esc(r.players.find(p=>p.color==='c')?.nickname||'대기');
 $('jgHanTurn').textContent=turnSide==='h'&&!waiting&&!finished?'착수':'대기';
 $('jgChoTurn').textContent=turnSide==='c'&&!waiting&&!finished?'착수':'대기';
 for(const side of ['c','h'])$(side==='c'?'jgChoTurn':'jgHanTurn').classList.toggle('active',!waiting&&!finished&&r.turn===side);
 $('jgPlayers').innerHTML=r.players.map(p=>'<div class="jg-room-row"><span><b>'+esc(p.nickname)+'</b><small>'+esc(p.color?sideName(p.color):'진영 대기')+(p.id===r.selfId?' · 나':'')+'</small></span>'+(waiting?'<small>'+(p.ready?'✅ 준비 완료':'⌛ 대기')+'</small>':'')+'</div>').join('');
 const options=new Set(state.hints.map(m=>m.tx+','+m.ty)),last=r.last,board=r.board||R.fresh();
 const cells=[];
 for(let y=0;y<10;y++)for(let x=0;x<9;x++){
  const p=board[y][x],pt=x+','+y,on=options.has(pt),selected=state.selected?.x===x&&state.selected?.y===y;
  const from=last&&last.x===x&&last.y===y,to=last&&last.tx===x&&last.ty===y;
  cells.push('<button type="button" class="jg-cell '+(selected?'selected ':'')+(on?'hint ':'')+(on&&p?'capture ':'')+(from?'from ':'')+(to?'to ':'')+'" data-x="'+x+'" data-y="'+y+'" role="gridcell" aria-label="'+(x+1)+'열 '+(y+1)+'행 '+(p?esc(p.t):'빈칸')+'" style="--x:'+((70+80*x)/780*100).toFixed(5)+'%;--y:'+((70+80*y)/860*100).toFixed(5)+'%">'+(p?'<span class="jg-piece '+(p.s==='c'?'cho ':'han ')+p.t+'">'+esc((p.s==='c'?TEXT:HAN)[p.t])+'</span>':'')+'</button>');
 }
 $('jgBoard').innerHTML=grid+cells.join('');
 let message=waiting?'친구 입장 후 모두 준비를 눌러주세요.':finished?r.reason:r.thinking?'최강 AI가 깊이 수읽기 중입니다…':r.myTurn?'내 차례! 기물을 선택하세요.':'상대방이 수를 두고 있습니다.';
 if(finished&&r.winner===r.selfId)message='🏆 승리! '+r.reason+(r.payout?' · 상금 1조 G 지급 완료':r.payoutError?' · '+r.payoutError:'');
 else if(finished&&r.winner===null)message='무승부 · '+r.reason;
 else if(finished)message=esc(winnerName(r))+' 승리 · '+r.reason;
 $('jgBanner').textContent=message;$('jgBanner').classList.toggle('win',finished&&r.winner===r.selfId);
 $('jgMoves').textContent=r.moves.length+'수';
 $('jgHistory').innerHTML=r.moves.slice(-22).reverse().map((e,i)=>'<li>'+sideName(e.side)+(e.pass?' · 차례 넘김':' · '+(e.p?.t||'기물')+' ['+(e.m.x+1)+','+(e.m.y+1)+'] → ['+(e.m.tx+1)+','+(e.m.ty+1)+']')+'</li>').join('')||'<li class="empty">착수를 기다리는 중…</li>';
 $('jgGuide').textContent=r.ai?'AI 승리 상금 1조 G · 서버에서 결과 검증 · 기권/점수 판정/무승부 제외':'각자 다른 휴대폰으로 대국 중 · 서버에서 착수 검증';
 $('jgActions').innerHTML=waiting?
  btn('invite','🔗 초대 링크 복사','secondary')+btn('ready',r.players.find(p=>p.id===r.selfId)?.ready?'준비 취소':'✓ 준비','secondary')+
  (r.hostId===r.selfId?btn('start','⚔️ 온라인 대국 시작','primary',r.players.length===2&&r.players.every(p=>p.ready)?'':'disabled'):'')+btn('leave','나가기','secondary'):
  finished?(btn('rematch',r.ai?'↻ AI 다시 도전':'↻ 다음 판 준비','primary')+btn('leave','로비 나가기','secondary')):
  btn('pass','차례 넘기기','secondary',r.myTurn&&!R.checked(r.board,r.turn)?'':'disabled')+btn('resign','기권하기','secondary')+btn('leave','나가기','secondary');
 tick();
}
function render(){if(state.room)match();else lobby();}
function tick(){
 const r=state.room,el=$('jgClock');if(!r||!el)return;
 if(r.phase==='waiting'){el.textContent='⏳ 준비 대기';return;}
 if(r.phase==='complete'){el.textContent='🏁 대국 종료 · '+(r.payout?'상금 1조 지급 완료':r.payoutError||'결과 확인');return;}
 if(r.thinking){el.textContent='🤖 AI 수읽기 중';return;}
 const s=Math.max(0,Math.ceil((r.deadline-Date.now()-state.offset)/1000));
 el.textContent=sideName(r.turn)+' · '+Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
 el.classList.toggle('urgent',s<25);
}
$('jgBoard').addEventListener('click',e=>{
 const node=e.target.closest('.jg-cell'),r=state.room;
 if(!node||!r||!r.myTurn||state.busy)return;
 const x=Number(node.dataset.x),y=Number(node.dataset.y),dest=state.hints.find(m=>m.tx===x&&m.ty===y);
 if(dest){state.selected=null;state.hints=[];act('/'+r.id+'/move',{x:dest.x,y:dest.y,tx:dest.tx,ty:dest.ty});return;}
 if(r.board[y][x]?.s===r.turn){state.selected={x,y};state.hints=R.legal(r.board,r.turn).filter(m=>m.x===x&&m.y===y);}
 else{state.selected=null;state.hints=[];}
 render();
});
document.addEventListener('click',e=>{
 const b=e.target.closest('button[data-action]');if(!b||b.disabled||state.busy)return;
 const a=b.dataset.action,r=state.room;
 if(a==='refresh'){refresh(true);return;}
 if(a==='choose'){
  const kind=b.dataset.kind,value=b.dataset.value;
  if(!Object.hasOwn(state.prefs,kind))return;
  const options=kind==='aiSide'?SIDE_CHOICES:FORMATION_CHOICES;
  if(!options.some(o=>o.value===value))return;
  state.prefs[kind]=value;render();return;
 }
 if(a==='ai'){
  const p=state.prefs;
  act('/create-ai',{side:p.aiSide,cFormation:p.aiSide==='c'?p.aiFormation:'inner',hFormation:p.aiSide==='h'?p.aiFormation:'inner'});return;
 }
 if(a==='create'){
  act('/create',{name:$('jgRoomInput')?.value||'준자 온라인 장기',cFormation:state.prefs.pvpCho,hFormation:state.prefs.pvpHan});return;
 }
 if(a==='join'){act('/'+b.dataset.id+'/join');return;}
 if(a==='invite'&&r){const link=location.origin+'/janggi/online.html?join='+encodeURIComponent(r.id);
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(link).then(()=>notify('친구 초대 링크를 복사했어요.')).catch(()=>window.prompt('링크 복사',link));
  else window.prompt('링크 복사',link);return;}
 if(!r)return;
 if(a==='ready')act('/'+r.id+'/ready',{ready:!r.players.find(p=>p.id===r.selfId)?.ready});
 else if(a==='start')act('/'+r.id+'/start');
 else if(a==='pass'&&window.confirm('한 수를 쉬고 차례를 넘길까요?'))act('/'+r.id+'/pass');
 else if(a==='resign'&&window.confirm('기권하면 패배 처리되며 AI 상금은 없습니다. 기권할까요?'))act('/'+r.id+'/resign');
 else if(a==='rematch')act('/'+r.id+'/rematch');
 else if(a==='leave'&&(r.phase!=='playing'||window.confirm('퇴장하면 기권패 처리됩니다. 나갈까요?')))act('/'+r.id+'/leave');
});
if(typeof EventSource==='function'){
 const es=new EventSource('/api/events');es.addEventListener('refresh',e=>{
  try{const data=JSON.parse(e.data);if(data.janggi&&(!state.room||!data.roomId||data.roomId===state.room.id))refresh();}catch{}
 });window.addEventListener('pagehide',()=>es.close(),{once:true});
}
setInterval(tick,250);setInterval(()=>refresh(),3600);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});refresh(true);
})();
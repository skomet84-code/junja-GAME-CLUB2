'use strict';
const game=new URLSearchParams(location.search).get('game')==='hula'?'hula':'onecard';
document.body.dataset.game=game;
const $=sel=>document.querySelector(sel);
const $$=sel=>[...document.querySelectorAll(sel)];
let room=null,selected=new Set(),changedVersion=-1,busy=false,stopping=false,callOne=false,inviteAttempted=false,localDeadline=0,score={games:0,wins:0,bestStreak:0,streak:0};
const SUIT={S:'♠',H:'♥',D:'♦',C:'♣'};
const NAME={onecard:'ROYAL ONE CARD',hula:'ROYAL HULA'};
const ESC={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>ESC[c]);
function message(s){$('#notice').textContent=s||'';if(s){clearTimeout(message.timer);message.timer=setTimeout(()=>$('#notice').textContent='',6500);}}
function n(c){if(c.startsWith('JOK'))return 'JOKER';let x=Number(c.slice(1));return ({1:'A',11:'J',12:'Q',13:'K'})[x]||String(x);}
function glyph(c){return c?.startsWith('JOK')?'♛':SUIT[c?.[0]]||'♠';}
function cardHtml(c,{hand=false,active=false,select=false,hint=''}={}){
 if(!c)return '<div class="card face">–</div>';
 const red=c.startsWith('JOKR')||'HD'.includes(c[0]);
 const name=n(c),g=glyph(c),plain=c.startsWith('JOK');
 let klass='card face'+(red?' red':'')+(plain?' joker':'')+(select?' selected':'')+(active?' playable':'')+(hint?' hint-'+hint:'');
 const hintName=hint==='meld'?'등록 가능':hint==='play'?'낼 수 있음':hint==='attach'?'붙이기 가능':'';
 const body='<span class="corner">'+esc(name)+'<small>'+g+'</small></span><span class="middle">'+g+'</span><span class="corner bottom">'+esc(name)+'</span>';
 return hand?'<button class="'+klass+'" data-card="'+esc(c)+'" aria-pressed="'+(select?'true':'false')+'" aria-label="'+esc(g+name+(hintName?' · '+hintName:''))+'">'+body+(hintName?'<span class="card-hint-label">'+hintName+'</span>':'')+'</button>':'<div class="'+klass+'">'+body+'</div>';
}
async function api(path,body){
 const opts={credentials:'same-origin',cache:'no-store'};
 if(body!==undefined){opts.method='POST';opts.headers={'Content-Type':'application/json'};opts.body=JSON.stringify(body);}
 const resp=await fetch('/api/royalcards'+path,opts);
 const data=await resp.json().catch(()=>({error:'서버 응답이 올바르지 않아'}));
 if(!resp.ok)throw Error(data.error||'서버 연결에 실패했어.');
 return data;
}
async function command(path,body){
 if(busy)return;busy=true;
 try{const data=await api(path,body||{});if(data.room)showRoom(data.room);else await refresh();}catch(e){message(e.message);}finally{busy=false;}
}
async function refresh(){
 if(busy||stopping)return;
 try{const data=await api('?game='+game);if(data.stats)showStats(data.stats);
 if(data.room)showRoom(data.room);else {room=null;showLanding(data.rooms||[]);const target=new URLSearchParams(location.search).get('room');if(target&&!inviteAttempted&&/^RC[a-f0-9]{14}$/.test(target)){inviteAttempted=true;command('/'+target+'/join');}}
 $('#account').textContent='● CONNECTED';
 }catch(e){if(e.message.includes('로그인')){$('#account').textContent='로그인 필요';message('준자랜드에서 먼저 로그인해줘.');}else message(e.message);}
}
function showStats(s){score=s;$('#record').textContent=s.wins+' WIN · '+s.games+' PLAYED';$('#streak').textContent='연승 '+s.streak+'회 · 최고 '+s.bestStreak+'연승';}
function showLanding(rooms){
 $('#landing').classList.remove('hidden');$('#match').classList.add('hidden');
 $('#rooms').innerHTML=rooms.length?rooms.map(r=>'<div class="room"><div><strong>'+esc(r.name)+'</strong><p>'+esc(r.host)+' · '+r.players+'/'+r.max+'명</p></div><button data-join="'+esc(r.id)+'">입장 →</button></div>').join(''):'<div class="empty">지금 대기 중인 테이블이 없어. 네가 첫 방장이 되어줘!</div>';
 $$('[data-join]').forEach(btn=>btn.onclick=()=>command('/'+btn.dataset.join+'/join'));
}
function showThankCelebration(r){
 const banner=$('#thankBanner'),ev=r.game==='hula'?r.lastThank:null;
 if(!ev||!Number.isFinite(Number(ev.at))||Math.max(0,(r.serverNow||Date.now())-Number(ev.at))>6500){
  banner.classList.add('hidden');return;
 }
 const key=r.id+':'+r.round+':'+ev.id;
 if(banner.dataset.eventKey===key)return;
 banner.dataset.eventKey=key;
 banner.innerHTML='<span class="thank-spark">✨ 💝 ✨</span><strong>'+esc(ev.playerName)+'님 땡큐!</strong>'+
  '<span>버림패 '+glyph(ev.card)+esc(n(ev.card))+' · 즉시 등록 완료</span>';
 banner.classList.remove('hidden');
 banner.classList.remove('thank-show');
 void banner.offsetWidth;
 banner.classList.add('thank-show');
}
function showRoom(r){
 if(!r)return;
 if(room&&room.id===r.id&&Number(r.version)<Number(room.version))return; // A late GET cannot undo a newer turn.
 const next=room?.id!==r.id||room?.version!==r.version||room?.phase!==r.phase;
 if(room?.id!==r.id||room?.round!==r.round){selected.clear();callOne=false;}
 room=r;localDeadline=Date.now()+Math.max(0,((r.phase==='thank'?r.thankDeadline:r.deadline)||0)-(r.serverNow||Date.now()));$('#landing').classList.add('hidden');$('#match').classList.remove('hidden');
 if(!next)return;
 const mine=r.players.find(p=>p.id===r.selfId);
 $('#roomName').textContent=r.name;$('#matchSub').textContent=(r.mode==='ai'?'J-BOT 대전':'실시간 멀티플레이')+' · '+(r.game==='onecard'?'원카드':'훌라')+' · '+r.round+'판';
 $('#waiting').classList.toggle('hidden',r.phase!=='waiting');
 $('#table').classList.toggle('hidden',r.phase!=='playing'&&r.phase!=='thank');
 $('#finalPanel').classList.toggle('hidden',r.phase!=='done');
 if(r.phase==='waiting')renderWaiting(r,mine);
 if(r.phase==='playing'||r.phase==='thank')renderPlaying(r,mine);
 if(r.phase==='done')renderDone(r);
 showThankCelebration(r);
 changedVersion=r.version;
}
function renderWaiting(r,mine){
 $('#readyList').innerHTML=r.players.map(p=>'<div class="ready-person"><span>'+esc(p.name)+(p.id===r.hostId?' ♛':'')+'</span><b>'+(p.ready?'READY':'WAITING')+'</b></div>').join('');
 $('#readyBtn').textContent=mine?.ready?'준비 취소':'준비 완료';$('#readyBtn').onclick=()=>command('/'+r.id+'/ready',{ready:!mine?.ready});
 $('#startBtn').classList.toggle('hidden',r.hostId!==r.selfId);
 $('#startBtn').disabled=r.players.length<2||r.players.some(p=>!p.ready);
 $('#startBtn').onclick=()=>command('/'+r.id+'/start');
 $('#roomCode').innerHTML='<span>친구에게 초대 링크를 공유해. · '+esc(r.id)+'</span> <button id="shareRoom" class="outline-btn">초대 링크 복사 ↗</button>';
 $('#shareRoom').onclick=async()=>{const link=location.origin+'/royalcards/index.html?game='+r.game+'&room='+r.id;try{await navigator.clipboard.writeText(link);message('친구 초대 링크를 복사했어!');}catch{prompt('이 링크를 친구에게 보내줘',link);}};
}
function renderPlaying(r,mine){
 const myTurn=r.turnId===r.selfId;
 const actor=r.players.find(p=>p.id===r.turnId);
 $('#turnBadge').textContent=r.phase==='thank'?'💝 땡큐 찬스!':myTurn?'✦ 지금 네 차례':'⏳ '+(actor?.name||'친구')+' 차례';
 $('#yourName').textContent=mine?.name||'PLAYER';
 $('#handCount').textContent=r.hand.length+'장';
 $('#countdown').textContent=Math.max(0,Math.ceil((r.deadline-(r.serverNow||Date.now()))/1000))+'s';
 $('#opponents').innerHTML=r.players.filter(p=>p.id!==r.selfId).map(p=>'<div class="opponent '+(r.turnId===p.id?'on':'')+'"><span class="avatar">'+(p.bot?'🤖':'♛')+'</span><strong>'+esc(p.name)+'</strong><small>'+p.cardCount+'장 '+(r.turnId===p.id?'· PLAYING':'')+'</small></div>').join('');
 $('#topDiscard').outerHTML=cardHtml(r.discard).replace('class="card','id="topDiscard" class="card');
 const justThank=r.lastThank&&Number(r.serverNow||Date.now())-Number(r.lastThank.at)<6000;
 $('#discardCaption').textContent=justThank?'땡큐 카드 등록됨 · 이전 버림패':'DISCARD PILE';
 $('#playInfo').textContent=r.game==='onecard'?'현재 무늬 '+(SUIT[r.suit]||'')+(r.pending?' · 공격 누적 +'+r.pending:'')+' · 방향 '+(r.direction===1?'↻':'↺'):'등록 '+r.melds.length+'개 · 더미 '+r.deckCount+'장'+(r.drew?' · 내려놓거나 버려줘':' · 먼저 카드를 받아줘');
 selected=new Set([...selected].filter(id=>r.hand.includes(id)));
 
 const groups=Array.isArray(r.allowedMelds)?r.allowedMelds:[];
 const attachments=Array.isArray(r.allowedAttachments)?r.allowedAttachments:[];
 const meldCards=new Set(groups.flat()),attachCards=new Set(attachments.map(x=>x.card));
 const action=myTurn&&r.phase==='playing';
 $('#hand').innerHTML=r.hand.map(c=>{
  const hint=!action?'':r.game==='onecard'?(r.legal.includes(c)?'play':''):
    r.drew?(meldCards.has(c)?'meld':attachCards.has(c)?'attach':''):'';
  return cardHtml(c,{hand:true,active:!!hint,select:selected.has(c),hint});
 }).join('');
 const guide=$('#handHints');
 if(guide){
  const labelCards=cards=>cards.map(c=>glyph(c)+n(c)).join(' ');
  if(r.phase==='thank')guide.innerHTML=r.canThank?'<strong>💝 땡큐 가능</strong><span>땡큐 버튼으로 버림패를 등록해!</span>':'<span>땡큐 반응을 기다리는 중이야.</span>';
  else if(!myTurn)guide.innerHTML='<span>⏳ 상대 차례야. 내 차례에 가능한 카드가 표시돼.</span>';
  else if(r.game==='onecard')guide.innerHTML=r.legal.length?'<strong>🟢 낼 수 있는 카드 '+r.legal.length+'장</strong><span>초록색 테두리 카드를 눌러서 내면 돼.</span>':'<strong>낼 수 있는 카드 없음</strong><span>한 장을 받거나 누적 공격을 받아줘.</span>';
  else if(!r.drew)guide.innerHTML='<strong>🂠 먼저 카드 받기</strong><span>받은 뒤 등록 가능한 카드를 찾아줄게.</span>';
  else guide.innerHTML='<span class="hand-legend">🟢 등록 가능 · 🔵 붙이기 가능 · 🟡 선택됨</span>'+
   (groups.length?'<strong>♛ 등록 가능한 조합 '+groups.length+'개</strong><div class="suggestion-list">'+
     groups.slice(0,8).map((cs,i)=>'<button class="suggestion-btn" type="button" data-suggest="'+i+'">♛ '+labelCards(cs)+' · 즉시 등록</button>').join('')+'</div><span>조합을 누르면 즉시 등록되고 아래 등록 현황에 표시돼.</span>':
     '<strong>지금은 등록할 새 조합이 없어.</strong><span>카드 한 장을 버리거나 파란색 카드라면 붙여줘.</span>');
  $('[data-suggest]').forEach(b=>b.onclick=()=>{if(!action||!r.drew||busy)return;const combo=groups[Number(b.dataset.suggest)];if(!combo)return;selected.clear();command('/'+r.id+'/meld',{cards:combo.slice()});});
 }
 $$('[data-card]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.card;if(!myTurn)return;if(r.game==='onecard'&&!r.legal.includes(id))return message('지금 낼 수 없는 카드야.');if(selected.has(id))selected.delete(id);else {if(r.game==='onecard')selected.clear();selected.add(id);}renderPlaying(r,mine);});
 const canDraw=r.phase==='playing'&&myTurn&&(r.game==='onecard'||!r.drew);
 const readyHula=r.game==='hula'&&canDraw;
 const doDraw=()=>{if(canDraw&&!busy)command('/'+r.id+(r.game==='onecard'?'/draw':'/take'),r.game==='onecard'?{}:{source:'stock'});};
 $('#drawPile').disabled=!canDraw;
 $('#drawPile').classList.toggle('take-ready',readyHula);
 $('#drawPile').onclick=doDraw;
 $('#quickTake').classList.toggle('hidden',!readyHula);
 $('#quickTake').disabled=!readyHula;
 $('#quickTake').onclick=doDraw;
 $('#stockCaption').textContent=r.game==='onecard'?'더미에서 받기':readyHula?'여기를 눌러 카드 받기':r.drew?'이번 턴 받기 완료':'상대 차례';
 $('#stockCaption').classList.toggle('emphasis',readyHula);
 $('#turnSteps').classList.toggle('hidden',r.game!=='hula');
 if(r.game==='hula'){
  const stage=r.phase==='thank'?'reaction':!myTurn?'wait':r.drew?'register':'receive';
  $('#turnSteps').innerHTML='<span class="'+(stage==='receive'?'current':'')+'">① 받기</span><span class="'+(stage==='register'?'current':'')+'">② 등록·붙이기</span><span>③ 버리기</span>';
 }
 $('#melds').innerHTML=r.game==='hula'?r.melds.map((m,i)=>{
  const owner=r.players.find(p=>String(p.id)===String(m.owner));
  const thanked=!!r.lastThank&&String(r.lastThank.playerId)===String(m.owner)&&
    m.cards.some(c=>r.lastThank.cards.includes(c))&&
    Number(r.serverNow||Date.now())-Number(r.lastThank.at)<9000;
  const title=thanked?'💝 땡큐 등록':m.kind==='set'?'땡':m.kind==='run'?'연속':'세븐';
  return '<div class="meld-row '+(thanked?'thank-meld':'')+'"><b>'+esc(owner?.name||'플레이어')+' · '+title+'</b>'+
    m.cards.map(c=>'<span>'+glyph(c)+esc(n(c))+'</span>').join('')+
    '<button data-attach="'+i+'" '+(!myTurn||!r.drew||selected.size!==1||!attachments.some(a=>a.card===[...selected][0]&&a.index===i)?'disabled':'')+'>+ 붙이기</button></div>';
 }).join(''):'';
 $('[data-attach]').forEach(btn=>btn.onclick=()=>{const card=[...selected][0];if(!card||busy)return;selected.clear();command('/'+r.id+'/attach',{card,index:Number(btn.dataset.attach)});});
 renderHulaLedger(r,myTurn,attachments);
 renderActions(r,myTurn);
 const recent=r.events.slice(-3).reverse().map(e=>esc(e.text)).join(' · ');
 $('#feedback').textContent=recent;
}

function renderHulaLedger(r,myTurn,attachments){
 // The game UI also runs in a small no-DOM test harness.
 if(r.game!=='hula'||typeof document.createElement!=='function')return;
 let panel=$('#hulaLedger');
 if(!panel){
  // Keep the registration panel optional for limited DOM/legacy renderers.
  const board=$('.bottom-board');
  if(typeof document.createElement!=='function'||typeof board?.insertBefore!=='function')return;
  panel=document.createElement('section');
  panel.id='hulaLedger';panel.className='hula-ledger';
  panel.setAttribute('aria-label','훌라 등록 패 현황');
  board.insertBefore(panel,$('#quickTake'));
  const style=document.createElement('style');style.id='hula-ledger-style';
  style.textContent=[
   'body[data-game="hula"] .hula-ledger{margin:2px 0 14px;padding:12px;border:1px solid #d9b973b0;border-radius:15px;background:linear-gradient(140deg,#102f2d,#111e30);color:#f6e8c7;box-shadow:inset 0 1px #ffffff19,0 6px 15px #0005}',
   '.hula-ledger-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px}',
   '.hula-ledger-head strong{font-size:16px;color:#ffe0a0}.hula-ledger-status{font-size:12px;font-weight:850;padding:6px 10px;border:1px solid #e9c78380;border-radius:20px;background:#233a35}',
   '.hula-ledger-status.unregistered{color:#ffd9a1;border-color:#d9a97899;background:#413124}',
   '.hula-ledger-label{font-size:12px;font-weight:900;color:#ffdd94;letter-spacing:.02em;margin:10px 0 6px}',
   '.hula-ledger-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:7px;padding:8px;margin:5px 0;border:1px solid #bba36b70;border-radius:11px;background:#0c1f2c}',
   '.hula-ledger-row.mine{border-color:#e6c27ead;background:#253d30}.hula-ledger-row strong{font-size:12px;color:#f9ddb2}',
   '.hula-ledger-cards{display:flex;flex-wrap:wrap;gap:4px}.hula-ledger-card{padding:5px 7px;border-radius:6px;background:#faf4e7;color:#26303b;font-weight:950;font-size:14px;white-space:nowrap}',
   '.hula-ledger-empty{font-size:12px;line-height:1.5;color:#c6d5d0;padding:7px 3px}',
   '.hula-ledger-others{max-height:175px;overflow-y:auto;overscroll-behavior:contain}',
   '.hula-ledger-attach{display:flex;gap:6px;flex-wrap:wrap;padding-top:7px}.hula-ledger-attach button{flex:1 1 160px;min-height:40px;padding:7px 9px;border:1px solid #a5e9aa;border-radius:9px;background:linear-gradient(110deg,#c6f6a9,#82d5b3);color:#133523;font-size:12px;font-weight:900;cursor:pointer}',
   '.hula-ledger-tip{font-size:12px;line-height:1.5;color:#d5c9a5;padding-top:7px}',
   '@media(max-width:650px){body[data-game="hula"] .hula-ledger{padding:10px;margin:4px 0 10px}.hula-ledger-head strong{font-size:15px}.hula-ledger-status{font-size:11px}.hula-ledger-row{padding:7px}.hula-ledger-card{font-size:13px}}'
  ].join('');
  document.head.appendChild(style);
 }
 const indexed=(r.melds||[]).map((m,index)=>({m,index}));
 const own=indexed.filter(x=>String(x.m.owner)===String(r.selfId));
 const others=indexed.filter(x=>String(x.m.owner)!==String(r.selfId));
 const makeRow=({m,index},mine)=>{
  const p=r.players.find(p=>String(p.id)===String(m.owner));
  const name=mine?'내 패':(p?.name||'다른 플레이어');
  const kind=m.kind==='seven'?'7 단독':m.kind==='set'?'땡':'연속';
  return '<div class="hula-ledger-row'+(mine?' mine':'')+'"><strong>'+esc(name)+' · '+kind+' #'+(index+1)+'</strong><div class="hula-ledger-cards">'+m.cards.map(c=>'<span class="hula-ledger-card">'+esc(glyph(c)+n(c))+'</span>').join('')+'</div></div>';
 };
 const canAct=r.phase==='playing'&&myTurn&&r.drew;
 const available=canAct&&own.length?attachments:[];
 const attachButtons=available.slice(0,10).map(a=>{
  const m=r.melds[a.index],owner=r.players.find(p=>String(p.id)===String(m?.owner));
  const who=String(m?.owner)===String(r.selfId)?'내 등록':(owner?.name||'상대 등록');
  return '<button type="button" data-ledger-card="'+esc(a.card)+'" data-ledger-index="'+a.index+'">+ '+esc(glyph(a.card)+n(a.card))+' → '+esc(who)+' #'+(a.index+1)+' 붙이기</button>';
 }).join('');
 const tip=own.length
  ?(canAct?'다른 조합도 아래에서 따로 추가 등록할 수 있어. 등록된 패에는 위 버튼으로 바로 붙이기 가능해.':'추가 등록·붙이기는 내 차례에 한 장 받은 뒤 가능해.')
  :'먼저 7 한 장, 같은 숫자 3장, 또는 같은 무늬 연속 3장 이상을 등록하면 붙이기가 열려.';
 panel.innerHTML='<div class="hula-ledger-head"><strong>♛ 등록한 패 확인 · 추가 등록</strong><span class="hula-ledger-status'+(own.length?'':' unregistered')+'">'+
  (own.length?'✓ 내 등록 '+own.length+'조합 완료':'미등록 · 첫 등록 필요')+'</span></div>'+
  '<div class="hula-ledger-label">내가 등록한 패</div>'+
  (own.length?own.map(x=>makeRow(x,true)).join(''):'<div class="hula-ledger-empty">아직 등록한 패가 없어.</div>')+
  '<div class="hula-ledger-label">다른 플레이어 등록 패</div><div class="hula-ledger-others">'+
  (others.length?others.map(x=>makeRow(x,false)).join(''):'<div class="hula-ledger-empty">아직 상대가 등록한 패가 없어.</div>')+'</div>'+
  (attachButtons?'<div class="hula-ledger-label">지금 붙일 수 있는 패 · 한 번 누르면 즉시 붙이기</div><div class="hula-ledger-attach">'+attachButtons+'</div>':'')+
  '<div class="hula-ledger-tip">'+(available.length>10?'붙이기 가능한 조합이 더 있어. ':'')+tip+'</div>';
 panel.querySelectorAll('[data-ledger-card]').forEach(btn=>btn.onclick=()=>{
  if(busy)return;
  const card=btn.dataset.ledgerCard,index=Number(btn.dataset.ledgerIndex);
  selected.clear();command('/'+r.id+'/attach',{card,index});
 });
}

function renderActions(r,myTurn){
 const el=$('#actions'),one=r.game==='onecard',sel=[...selected];
 if(r.phase==='thank'){
  el.innerHTML=r.canThank?'<button id="thankNow" class="thank-action">💝 땡큐! 즉시 등록</button>':'<span class="muted">다른 플레이어의 땡큐 반응을 기다리는 중…</span>';
  if($('#thankNow'))$('#thankNow').onclick=()=>command('/'+r.id+'/thank');
  return;
 }
 if(one){
  $('#suitPicker').classList.add('hidden');
  const playable=sel.length===1&&r.legal.includes(sel[0]);
  el.innerHTML='<button id="playBtn" '+(!myTurn||!playable?'disabled':'')+'>✦ 선택 카드 내기</button><button class="secondary" id="drawBtn" '+(!myTurn?'disabled':'')+'>♠ '+(r.pending?'공격 '+r.pending+'장 받기':'한 장 받기')+'</button>'+(r.hand.length===2&&myTurn?'<button class="'+(callOne?'':'secondary')+'" id="callBtn">'+(callOne?'✓ 원카드 선언했어!':'📣 원카드 선언')+'</button>':'');
  $('#drawBtn').onclick=()=>command('/'+r.id+'/draw');
  if($('#callBtn'))$('#callBtn').onclick=()=>{callOne=!callOne;renderActions(r,myTurn);};
  $('#playBtn').onclick=()=>{const c=sel[0];if(c.startsWith('JOK')||Number(c.slice(1))===7){const picker=$('#suitPicker');picker.classList.remove('hidden');$$('[data-suit]').forEach(b=>b.onclick=()=>{picker.classList.add('hidden');selected.clear();command('/'+r.id+'/play',{card:c,suit:b.dataset.suit,call:callOne});});}else{selected.clear();command('/'+r.id+'/play',{card:c,call:callOne});}};
 }else{
  $('#suitPicker').classList.add('hidden');
  const canMeld=sel.length>0&&(r.allowedMelds||[]).some(cs=>cs.length===sel.length&&cs.every(c=>sel.includes(c)));
  el.innerHTML=!r.drew?'<button id="takeStock" class="take-card-button" '+(!myTurn?'disabled':'')+'>🂠 카드 한 장 받기</button><button id="stopBtn" class="secondary" '+(!myTurn?'disabled':'')+'>✋ 스톱 선언</button>':
   '<button id="meldBtn" '+(!myTurn||!canMeld?'disabled':'')+'>♛ '+(canMeld?'선택 조합 등록하기':'새 조합을 선택해')+'</button><button class="secondary" id="discardBtn" '+(!myTurn||sel.length!==1?'disabled':'')+'>↗ 선택 카드 버리기</button><span class="muted">붙이려면 한 장 선택 후 바닥 조합의 +버튼</span>';
  if($('#takeStock'))$('#takeStock').onclick=()=>command('/'+r.id+'/take',{source:'stock'});
  if($('#stopBtn'))$('#stopBtn').onclick=()=>command('/'+r.id+'/stop');
  if($('#meldBtn'))$('#meldBtn').onclick=()=>{if(!canMeld||busy)return;selected.clear();command('/'+r.id+'/meld',{cards:sel});};
  if($('#discardBtn'))$('#discardBtn').onclick=()=>command('/'+r.id+'/discard',{card:sel[0]}).then(()=>selected.clear());
 }
}
function renderDone(r){
 const who=r.players.find(p=>p.id===r.winner),meWins=r.winner===r.selfId;
 $('#winnerName').textContent=(meWins?'👑 내가 승리!':esc(who?.name||'승자'))+' · '+(meWins?'VICTORY':'WINNER');
 $('#winReason').textContent=r.reason;
 $('#finalScores').innerHTML=r.finalScores?r.finalScores.map(p=>'<div class="score-row">'+esc(r.players.find(x=>x.id===p.id)?.name)+' · '+p.score+'점</div>').join(''):'';
 $('#againBtn').textContent=r.mode==='ai'?'J-BOT과 재대결':'다시 준비하기';
 $('#againBtn').onclick=()=>{selected.clear();command('/'+r.id+'/rematch');};
}
const RULES={
 onecard:['<b>기본</b> · 조커 2장을 포함한 54장. 각자 7장으로 시작하고 손패를 먼저 비우면 승리야.','<b>내기</b> · 위 카드와 같은 무늬 또는 같은 숫자를 내. 맞는 패가 없다면 더미에서 1장 받고 턴 종료.','<b>공격</b> · 2 = +2장, A = +3장(♠A는 +5장), 검정 조커 = +5장, 빨강 조커 = +7장. 공격 중에는 같은 등급 이상 공격만 쌓을 수 있고 아니면 누적 장수만큼 받아.','<b>특수</b> · 7은 무늬 변경, J는 다음 사람 건너뛰기, Q는 진행 방향 반전, K는 내 추가 턴. 1:1의 J는 곧바로 내 턴이야.','<b>원카드 선언</b> · 카드를 내고 한 장이 남게 되면 「원카드 선언」을 함께 눌러줘. 선언하지 않으면 벌칙 2장을 받아.','<b>승부</b> · 50초 턴 제한, 타임아웃 시 자동 한 장 받기. 서버가 비밀 덱·판정·턴 순서를 관리해.'],
 hula:['<b>기본</b> · 52장, 조커 없음. 2~4명이 각자 7장씩 받고 손패를 먼저 다 비우는 사람이 이겨.','<b>받기</b> · 내 차례 시작에는 더미에서 1장 받기. 누군가 카드를 버렸을 때 즉시 등록이 가능하면 모든 참가자에게 6초간 「땡큐」 기회가 열려.','<b>등록</b> · 같은 숫자 3~4장(땡), 같은 무늬로 이어지는 3장 이상(연속), 또는 7 카드 한 장도 등록 가능. A는 K 다음에 이어질 수 있어 (Q-K-A, K-A-2 모두 가능).','<b>붙이기</b> · 내 등록이 하나 이상 있으면 누구의 등록 조합에든 카드 한 장씩 붙일 수 있어. 7 단독 등록에는 같은 무늬의 6 또는 8을 붙일 수 있어.','<b>버리기</b> · 받기 → 등록·붙이기 → 버리기. 손패를 모두 털면 즉시 승리, 미등록 상태에서 한 번에 털면 「훌라!」','<b>스톱</b> · 카드를 받기 전 손패가 10점 이하면 스톱 선언 가능. 다른 사람의 점수가 같거나 낮으면 스톱 실패야. 점수는 A=1, J=11, Q=12, K=13.','<b>안전한 친선 대전</b> · 이번 모드는 카드 전적만 기록하며 기존 회원·게임머니 잔액을 직접 건드리지 않아.']
};
function showRules(){
 $('#rulesHeading').textContent=(game==='onecard'?'원카드':'훌라')+' · HOUSE RULES';
 $('#rulesBody').innerHTML='<ul>'+RULES[game].map(x=>'<li>'+x+'</li>').join('')+'</ul>';
 $('#rulesModal').classList.remove('hidden');
}
$('#closeRules').onclick=$('#closeRulesBottom').onclick=()=>$('#rulesModal').classList.add('hidden');
$('#rulesModal').onclick=e=>{if(e.target.id==='rulesModal')$('#rulesModal').classList.add('hidden');};
$('#rulesBtn').onclick=showRules;
$('#refreshBtn').onclick=refresh;
$('#aiBtn').onclick=()=>command('/create',{game,mode:'ai'});
$('#multiBtn').onclick=()=>command('/create',{game,mode:'multi',max:4});
$('#leaveBtn').onclick=()=>{if(!room)return;if(room.phase==='playing'&&!confirm('진행 중인 대결에서 나가면 패배로 처리돼. 나갈까?'))return;command('/'+room.id+'/leave');};
$('#lobbyBtn').onclick=()=>room&&command('/'+room.id+'/leave');
document.querySelector('#nav-'+game).classList.add('active');
$('#heroTitle').textContent=NAME[game];$('#heroSub').textContent=game==='onecard'?'한 장의 반전. 단 한 사람의 왕좌.':'땡·연속·세븐. 한국 카드 승부의 진짜 재미.';
$('#ruleHeadline').textContent=game==='onecard'?'공격과 역전의 심리전 · 원카드':'정통 한국 카드 게임 · 훌라';
$('#ruleSummary').textContent=game==='onecard'?'2·A·조커 공격 누적, 7 무늬 전환, J 건너뛰기, Q 역방향, K 추가 턴. 단 한 장을 남기는 순간 원카드 선언을 잊지 마.':'7장으로 시작해 땡·연속·7 단독 등록. ♣K-A-2 같은 연속도 가능! 등록하고 서로의 조합에 붙여봐. 스톱은 10점 이하.';
refresh();const polling=setInterval(()=>{if(document.visibilityState==='visible')refresh();},2600);
setInterval(()=>{if(room&&(room.phase==='playing'||room.phase==='thank'))$('#countdown').textContent=Math.max(0,Math.ceil((localDeadline-Date.now())/1000))+'s';},400);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});

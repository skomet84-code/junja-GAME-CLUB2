/* JUNJA LAND — Royal Janggi client, touch-first, fixed 9×10 intersections. */
(()=>{'use strict';
const R=window.JanggiRules;if(!R)return;
const $=id=>document.getElementById(id);
const NAME={rook:'車',horse:'馬',elephant:'象',guard:'士',king:'楚',cannon:'包',soldier:'卒'};
const HAN_NAME={...NAME,king:'漢',cannon:'砲',soldier:'兵'};
const KN={rook:'차',horse:'마',elephant:'상',guard:'사',king:'궁',cannon:'포',soldier:'졸'};
const STORE='junja_janggi_game_v1';
const state={board:R.fresh(),turn:'c',mode:'ai',difficulty:'normal',side:'c',formations:{c:'inner',h:'inner'},round:1,
 moves:[],snapshots:[],selected:null,possibles:[],result:null,reason:'',passes:0,
 worker:null,thinking:false,token:0,sound:false};
const step=(x,y)=>({x:70+80*x,y:70+80*y});
const cls=s=>s==='c'?'cho':'han';
const label=s=>s==='c'?'초楚':'한漢';
function boardVector(){
 const lines=[];
 for(let x=0;x<9;x++){const n=70+80*x;lines.push('<line class="jg-line" x1="'+n+'" y1="70" x2="'+n+'" y2="790"/>');}
 for(let y=0;y<10;y++){const n=70+80*y;lines.push('<line class="jg-line" x1="70" y1="'+n+'" x2="710" y2="'+n+'"/>');}
 for(const top of [70,630]){
  lines.push('<line class="jg-palace" x1="310" y1="'+top+'" x2="470" y2="'+(top+160)+'"/>');
  lines.push('<line class="jg-palace" x1="470" y1="'+top+'" x2="310" y2="'+(top+160)+'"/>');
 }
 for(const [x,y] of [[70,70],[710,70],[70,790],[710,790]]){
  lines.push('<path class="jg-palace-mark" d="M'+(x-7)+' '+y+'h14 M'+x+' '+(y-7)+'v14"/>');
 }
 return '<svg class="jg-board-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 860" preserveAspectRatio="none" aria-hidden="true">'+lines.join('')+'</svg>';
}
const svg=boardVector();
const coords=(x,y)=>(x+1)+'선 '+(y+1)+'행';
const key=(s)=>s.board.map(r=>r.map(p=>p?p.s+p.t[0]:'-').join('')).join('/')+'|'+s.turn;
function snapshot(){return {board:state.board.map(r=>r.slice()),turn:state.turn,moves:state.moves.map(m=>({...m})),
 passes:state.passes,result:state.result,reason:state.reason};}
function cancelAi(){state.token++;if(state.worker){state.worker.terminate();state.worker=null;}state.thinking=false;}
function save(){
 try{localStorage.setItem(STORE,JSON.stringify({board:state.board,turn:state.turn,mode:state.mode,difficulty:state.difficulty,
 side:state.side,formations:state.formations,round:state.round,moves:state.moves,
 snapshots:state.snapshots.slice(-6),result:state.result,reason:state.reason,passes:state.passes,sound:state.sound}));}catch{}
}
function load(){
 try{
  const s=JSON.parse(localStorage.getItem(STORE)||'null');
  if(!s||!Array.isArray(s.board)||s.board.length!==10||s.board.some(r=>!Array.isArray(r)||r.length!==9))return;
  if(!['c','h'].includes(s.turn)||!['c','h'].includes(s.side)||!['ai','local'].includes(s.mode))return;
  if(!R.kingAt(s.board,'c')||!R.kingAt(s.board,'h'))return;
  const legacyFormation=s.formation==='swapped'?'outer':'inner';
  const formations={};
  for(const side of ['c','h']){
   const value=s.formations?.[side];
   formations[side]=Object.hasOwn(R.FORMATIONS,value)?value:legacyFormation;
  }
  Object.assign(state,{board:s.board,turn:s.turn,mode:s.mode,side:s.side,difficulty:s.difficulty||'normal',
   formations,round:s.round||1,moves:s.moves||[],snapshots:(s.snapshots||[]).slice(-6),
   result:s.result||null,reason:s.reason||'',passes:s.passes||0,sound:!!s.sound});
 }catch{}
}
function scores(){
 const value={rook:13,cannon:7,horse:5,elephant:3,guard:3,soldier:2,king:0};
 let c=0,h=1.5,nc=0,nh=0;
 for(const row of state.board)for(const p of row)if(p){if(p.s==='c'){c+=value[p.t];nc++;}else{h+=value[p.t];nh++;}}
 return {c,h,nc,nh};
}
function isHuman(){return state.mode==='local'||state.turn===state.side;}
function maybeSound(freq=440){
 if(!state.sound)return;
 try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
  const ctx=new Audio(),osc=ctx.createOscillator(),gain=ctx.createGain();
  osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(.038,ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.12);
  osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.13);setTimeout(()=>ctx.close(),400);
 }catch{}
}
function render(){
 $('difficulty').value=state.difficulty;$('mySide').value=state.side;
 $('choFormation').value=state.formations.c;$('hanFormation').value=state.formations.h;
 $('difficulty').disabled=state.mode!=='ai';$('mySide').disabled=state.mode!=='ai';
 for(const b of document.querySelectorAll('#modeGroup button'))b.classList.toggle('active',b.dataset.mode===state.mode);
 const opts=new Set(state.possibles.map(m=>m.tx+','+m.ty));
 const last=state.moves.at(-1), lastMove=last&&last.m;
 const html=[];
 for(let y=0;y<10;y++)for(let x=0;x<9;x++){
  const p=state.board[y][x],pos=step(x,y);
  const from=lastMove&&lastMove.x===x&&lastMove.y===y,to=lastMove&&lastMove.tx===x&&lastMove.ty===y;
  const chosen=state.selected?.x===x&&state.selected?.y===y;
  const hint=opts.has(x+','+y),classes=['jg-cell',hint?'hint':'',hint&&p?'capture':'',chosen?'selected':'',from?'from':'',to?'to':''].join(' ');
  const text=p?(p.s==='c'?NAME:HAN_NAME)[p.t]:'';
  const piece=p?'<span class="jg-piece '+cls(p.s)+' '+p.t+'" aria-hidden="true">'+text+'</span>':'';
  html.push('<button type="button" role="gridcell" class="'+classes+'" data-x="'+x+'" data-y="'+y+'" aria-label="'+coords(x,y)+' '+(p?label(p.s)+' '+KN[p.t]:'빈 자리')+'" style="--x:'+(pos.x/780*100).toFixed(5)+'%;--y:'+(pos.y/860*100).toFixed(5)+'%">'+piece+'</button>');
 }
 $('janggiBoard').innerHTML=svg+html.join('');
 const isCheck=R.checked(state.board,state.turn),s=scores();
 $('choPieces').textContent=s.nc+'기';$('hanPieces').textContent=s.nh+'기';
 $('choScore').textContent=s.c.toFixed(1)+'점';$('hanScore').textContent=s.h.toFixed(1)+'점';
 $('hanName').textContent=state.mode==='ai'?(state.side==='h'?'나':'J-BOT · '+({easy:'초급',normal:'고급',hard:'극한'}[state.difficulty])):'플레이어 2';
 $('choName').textContent=state.mode==='ai'?(state.side==='c'?'나':'J-BOT · '+({easy:'초급',normal:'고급',hard:'극한'}[state.difficulty])):'플레이어 1';
 for(const s of ['c','h']){
  const el=$(s==='c'?'choTurn':'hanTurn');el.textContent=state.result?'종료':state.turn===s?'착수':'대기';
  el.classList.toggle('active',!state.result&&state.turn===s);
 }
 $('turnSide').textContent=state.turn==='c'?'楚':'漢';
 $('turnSide').classList.toggle('han',state.turn==='h');
 $('turnName').textContent=state.result==='draw'?'무승부':state.result?label(state.result)+' 승리':label(state.turn)+(state.thinking?' · AI 수읽기 중':' · '+(isHuman()?'착수 차례':'AI 차례'));
 $('moveNumber').textContent=(state.moves.length+1)+'수';
 $('roundText').textContent='ROUND '+String(state.round).padStart(2,'0');
 $('recordCount').textContent=state.moves.length+'수 진행';
 const banner=$('gameBanner');banner.className='jg-banner';
 let msg='기물을 누르면 이동 가능한 교차점이 표시됩니다.';
 if(state.result){msg=state.reason;banner.classList.add('win');}
 else if(isCheck){msg='⚠️ 장군! '+label(state.turn)+'의 궁을 반드시 지키세요.';banner.classList.add('alert');}
 else if(state.thinking)msg='🤖 J-BOT이 다음 수를 계산하고 있어요…';
 else if(state.selected)msg='✦ 표시된 교차점을 선택하세요. 다른 기물을 누르면 선택이 바뀝니다.';
 else if(state.mode==='local')msg=label(state.turn)+' 차례입니다. 기물을 선택하세요.';
 else if(state.turn===state.side)msg='당신의 차례 · 장군을 노려보세요!';
 else msg='AI가 수를 읽고 있습니다…';
 banner.textContent=msg;
 $('checkNotice').textContent=state.result?state.reason:isCheck?'⚠ 장군 · 멍군 필수':R.facing(state.board)?'♛ 빅장: 두 궁이 마주 보고 있습니다.':'● 정상 대국 진행 중';
 $('checkNotice').style.color=isCheck?'#ffc393':'';
 $('undo').disabled=!state.snapshots.length;
 $('pass').disabled=!!state.result||state.thinking||!isHuman()||isCheck;
 $('soundToggle').textContent=state.sound?'🔊 효과음 켬':'🔇 효과음 끔';
 const records=state.moves.slice(-18).map((entry,i)=>{
  if(entry.pass)return '<li><span class="move-side '+cls(entry.side)+'">'+label(entry.side)+'</span>차례 넘김 <span class="move-number">'+(state.moves.length-Math.min(18,state.moves.length)+i+1)+'</span></li>';
  const m=entry.m;return '<li><span class="move-side '+cls(entry.side)+'">'+label(entry.side)+'</span>'+
    ((entry.side==='c'?NAME:HAN_NAME)[entry.p.t]||'기물')+' · '+coords(m.x,m.y)+' → '+coords(m.tx,m.ty)+
    (entry.capture?' × '+KN[entry.capture.t]:'')+
    '<span class="move-number">'+(state.moves.length-Math.min(18,state.moves.length)+i+1)+'</span></li>';
 });
 $('moveHistory').innerHTML=records.length?records.reverse().join(''):'<li class="empty">첫 수를 기다리는 중…</li>';
}
function afterAction(){
 const stat=R.status(state.board,state.turn);
 if(stat.winner){state.result=stat.winner;state.reason='🏆 '+label(stat.winner)+' 승리 · 외통수!';maybeSound(660);}
 else if(stat.draw){state.result='draw';state.reason='서로 움직일 수 없어 무승부입니다.';}
 else if(state.moves.length>=220){state.result='draw';state.reason='장시간 대국 종료 · 무승부입니다.';}
 save();render();
 if(!state.result&&!isHuman())queueAi();
}
function commit(move,pass=false){
 if(state.result)return;
 state.snapshots.push(snapshot());if(state.snapshots.length>12)state.snapshots.shift();
 if(pass){
  state.moves.push({side:state.turn,pass:true});state.passes++;
 }else{
  const p=state.board[move.y][move.x],capture=state.board[move.ty][move.tx];
  state.board=R.moved(state.board,move);
  state.moves.push({side:state.turn,p,m:move,capture});
  state.passes=0;maybeSound(capture?570:420);
 }
 state.turn=R.ENEMY(state.turn);state.selected=null;state.possibles=[];
 if(state.passes>=2){
  const score=scores();state.result=score.c===score.h?'draw':score.c>score.h?'c':'h';
  state.reason=(state.result==='draw'?'무승부':label(state.result)+' 판정승')+' · 연속 차례 넘김 점수 판정';
  save();render();return;
 }
 afterAction();
}
function pick(x,y){
 if(state.result||state.thinking||!isHuman())return;
 const p=state.board[y][x],m=state.possibles.find(v=>v.tx===x&&v.ty===y);
 if(m){commit(m);return;}
 if(p?.s===state.turn){
  if(state.selected?.x===x&&state.selected?.y===y){state.selected=null;state.possibles=[];}
  else {state.selected={x,y};state.possibles=R.legal(state.board,state.turn).filter(v=>v.x===x&&v.y===y);}
  render();
 }else if(state.selected){state.selected=null;state.possibles=[];render();}
}
function queueAi(){
 if(state.thinking||state.result||state.mode!=='ai'||state.turn===state.side)return;
 state.thinking=true;const token=++state.token;render();
 let ended=false;const finish=move=>{
  if(ended||token!==state.token)return;
  ended=true;
  if(state.worker){state.worker.terminate();state.worker=null;}
  state.thinking=false;
  const legal=R.legal(state.board,state.turn);
  const chosen=legal.find(m=>move&&m.x===move.x&&m.y===move.y&&m.tx===move.tx&&m.ty===move.ty)||
    legal.sort((a,b)=>(b.score||0)-(a.score||0))[0];
  if(chosen)commit(chosen);else afterAction();
 };
 try{
  const w=new Worker('/janggi/ai-worker.js?v=1');state.worker=w;
  const kill=setTimeout(()=>finish(null),5500);
  w.onmessage=e=>{if(e.data?.type==='done'){clearTimeout(kill);finish(e.data.move);}else if(e.data?.type==='error'){clearTimeout(kill);finish(null);}};
  w.onerror=()=>{clearTimeout(kill);finish(null);};
  w.postMessage({board:state.board,side:state.turn,difficulty:state.difficulty});
 }catch{setTimeout(()=>finish(null),500);}
}
function reset(ask){
 if(ask&&state.moves.length&&!state.result&&!window.confirm('진행 중인 대국을 종료하고 새로 시작할까요?')){render();return;}
 cancelAi();state.board=R.fresh({cFormation:state.formations.c,hFormation:state.formations.h});
 state.turn='c';state.moves=[];state.snapshots=[];state.selected=null;state.possibles=[];state.passes=0;
 state.result=null;state.reason='';state.round++;save();render();
 if(state.mode==='ai'&&state.side==='h')queueAi();
}
$('janggiBoard').addEventListener('click',e=>{const cell=e.target.closest('.jg-cell');if(cell)pick(Number(cell.dataset.x),Number(cell.dataset.y));});
for(const b of document.querySelectorAll('#modeGroup button'))b.addEventListener('click',()=>{
 if(b.dataset.mode===state.mode)return;const old=state.mode;state.mode=b.dataset.mode;
 if(state.moves.length&&!state.result&&!confirm('대국 방식을 바꾸면 새 대국이 시작됩니다. 계속할까요?')){state.mode=old;render();return;}
 reset(false);
});
$('difficulty').addEventListener('change',e=>{state.difficulty=e.target.value;save();render();});
$('mySide').addEventListener('change',e=>{const old=state.side;state.side=e.target.value;
 if(state.moves.length&&!state.result&&!confirm('진영을 바꾸면 새 대국이 시작됩니다. 계속할까요?')){state.side=old;render();return;}reset(false);
});
for(const [side,id] of [['c','choFormation'],['h','hanFormation']]){
 $(id).addEventListener('change',e=>{
  const next=e.target.value,old=state.formations[side];
  if(!Object.hasOwn(R.FORMATIONS,next)){render();return;}
  if(next===old)return;
  if(state.moves.length&&!state.result&&!confirm('차림을 변경하면 새 대국을 시작합니다. 계속할까요?')){render();return;}
  state.formations={...state.formations,[side]:next};
  reset(false);
 });
}
$('newGame').addEventListener('click',()=>reset(true));
$('pass').addEventListener('click',()=>{if(isHuman()&&!R.checked(state.board,state.turn)&&!state.result)commit(null,true);});
$('undo').addEventListener('click',()=>{
 if(!state.snapshots.length)return;cancelAi();
 let saved=null;do{saved=state.snapshots.pop();}while(state.mode==='ai'&&saved?.turn!==state.side&&state.snapshots.length);
 if(!saved)return;
 state.board=saved.board;state.turn=saved.turn;state.moves=saved.moves;state.passes=saved.passes;
 state.result=saved.result;state.reason=saved.reason;state.selected=null;state.possibles=[];
 save();render();if(!isHuman())queueAi();
});
$('soundToggle').addEventListener('click',()=>{state.sound=!state.sound;save();render();});
load();render();if(state.mode==='ai'&&state.turn!==state.side&&!state.result)queueAi();
})();
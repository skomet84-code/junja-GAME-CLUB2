(()=>{'use strict';
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const HOUR=3600000,KST=9*HOUR,MATCH_MS=120000,MAX_RETURN=1000000000000000000n,TAX_LIMIT=10000000000000000n;
const names={H:'홈 승',D:'무승부',A:'원정 승'},numbers={H:'1',D:'X',A:'2'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let status=null,clubs=new Map(),selection=new Map(),fixtureTab='today',watchId=null,allSchedule=null,serverOffset=0,loading=false,betting=false,demo=null;
let canvas=$('#pitch'),ctx=canvas?.getContext('2d'),lastDraw=0,toastTimer=null,scheduleBusy=false;
const now=()=>Date.now()+serverOffset;
const dateKey=ms=>new Date(Number(ms)+KST).toISOString().slice(0,10);
const time=ms=>new Date(Number(ms)).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false});
const shortDate=ms=>new Date(Number(ms)).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'short',day:'numeric',weekday:'short'});
function fmtMoney(v){
 try{
  let n=BigInt(v||'0'),sign=n<0n?'-':'';if(n<0n)n=-n;
  let out=[],remaining=n;
  for(const [name,size] of [['경',10000000000000000n],['조',1000000000000n],['억',100000000n],['만',10000n]]){
   const unit=remaining/size;if(unit>0n){out.push(unit.toLocaleString('ko-KR')+name);remaining%=size}
  }
  if(remaining>0n&&out.length<2)out.push(remaining.toLocaleString('ko-KR'));
  return sign+(out.length?out.slice(0,2).join(' '):'0')+' G';
 }catch{return '—'}
}
function toast(text,error=false){
 const n=$('#message');if(!n)return;
 n.textContent=String(text);n.hidden=false;n.classList.toggle('error',error);
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>{n.hidden=true},4500);
}
function badge(c,cls='',id=''){
 return window.JPLCrests?.badge(c,cls,id)||'<span class="crest placeholder">'+esc(c?.emblem||'?')+'</span>';
}
function team(id){return clubs.get(id)||{name:id,short:id,emblem:'?',code:'---',primary:'#789',secondary:'#abc'}}
function labelStatus(f){return f.status==='LIVE'?'진행 중':f.status==='FINAL'?'경기 종료':'예정'}
function findFixture(id){
 return [...(status?.live||[]),...(status?.today||[]),...(status?.upcoming||[]),...(status?.recent||[]),...(allSchedule||[])].find(f=>f.id===id)||null;
}
function chooseBroadcast(){
 if(demo)return null;
 if(watchId){const f=findFixture(watchId);if(f)return f}
 return status?.live?.[0]||status?.today?.find(f=>f.status==='LIVE')||status?.upcoming?.[0]||status?.today?.[0]||status?.recent?.[0]||null;
}
function renderTop(){
 if(!status)return;
 $('#wallet').textContent=fmtMoney(status.wallet);
 $('#seasonBadge').textContent='SEASON '+String(status.season.number).padStart(2,'0');
 $('#statSeason').textContent=String(status.season.number).padStart(2,'0');
 $('#statPlayed').innerHTML=status.season.finished+' <span>/ '+status.season.totalGames+'</span>';
 const next=status.upcoming[0];
 $('#statNext').textContent=next?shortDate(next.kickoff)+' '+time(next.kickoff):'시즌 종료';
 $('#statLeader').textContent=status.table?.[0]?.short||'—';
 $('#todayLabel').textContent=status.day+' KST';
 $('#scheduleDate').min=dateKey(status.season.startAt);
 $('#scheduleDate').max=dateKey(status.season.endAt);
 if(!$('#scheduleDate').value)$('#scheduleDate').value=status.day<dateKey(status.season.startAt)?dateKey(status.season.startAt):status.day;
}
function fixtureHTML(f){
 const h=team(f.home),a=team(f.away),bettable=f.status==='SCHEDULED'&&now()<f.kickoff;
 const isLive=f.status==='LIVE',selected=watchId===f.id;
 const oddButtons=(market,table)=>['H','D','A'].map(x=>
  '<button type="button" data-pick="'+esc(f.id)+':'+market+':'+x+'" class="'+(selection.get(f.id)?.pick===x&&selection.get(f.id)?.market===market?'active':'')+'" '+(!bettable?'disabled':'')+' title="'+(market==='HDP'?'핸디캡 ':'')+esc(names[x])+' 선택"><span>'+numbers[x]+'</span><b>'+(table[x]/100).toFixed(2)+'</b></button>').join('');
 const handicap=f.handicap||{line:-1,odds:f.odds};
 const score=f.score?String(f.score.home)+' : '+String(f.score.away):'VS';
 return '<article class="fixture-item"><div class="fixture-main"><div class="fixture-time"><b>'+esc(time(f.kickoff))+'</b><small>'+esc(shortDate(f.kickoff))+'</small></div>'+
  '<div class="fixture-match"><div class="fixture-team">'+badge(h)+'<span>'+esc(h.short)+'</span></div>'+
  '<div class="fixture-vs '+(f.score?'fixture-outcome':'')+'">'+esc(score)+'</div>'+
  '<div class="fixture-team away">'+badge(a)+'<span>'+esc(a.short)+'</span></div></div>'+
  '<div class="fixture-right"><button class="watch-btn '+(isLive?'live':'')+'" type="button" data-watch="'+esc(f.id)+'">'+
  (isLive?'● LIVE':f.status==='FINAL'?'다시보기':selected?'선택됨':'관전하기')+'</button></div></div>'+
  (f.status==='SCHEDULED'?'<div class="market-rows"><div class="market-row"><span class="market-label">일반 승무패</span><div class="odds-row" aria-label="일반 승무패 배당">'+oddButtons('NORMAL',f.odds)+'</div></div>'+
   '<div class="market-row"><span class="market-label hdp">핸디캡 '+(handicap.line>0?'+':'')+handicap.line+'</span><div class="odds-row" aria-label="핸디캡 승무패 배당">'+oddButtons('HDP',handicap.odds)+'</div></div></div>':
   '<div class="odds-row fixture-finished"><small>'+labelStatus(f)+' · '+(f.status==='LIVE'?f.minute+'분':'90분')+' · 배당 마감</small></div>')+
  '</article>';
}
function renderFixtures(){
 if(!status)return;
 $$('.fixture-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.fixtureTab===fixtureTab));
 const items=fixtureTab==='today'?status.today:fixtureTab==='recent'?status.recent:status.upcoming;
 $('#fixturesList').innerHTML=items?.length?items.map(fixtureHTML).join(''):'<div class="fixture-message">이 날짜에 등록된 경기가 없어요. 다음 경기 탭을 확인해줘.</div>';
}
function renderTable(){
 if(!status)return;
 $('#tableBody').innerHTML=status.table.map(t=>
  '<tr class="'+(t.rank>=21?'relegation-zone':'')+'"><td>'+t.rank+'</td><td><div class="table-team">'+badge(t)+'<b>'+esc(t.name)+'</b></div></td>'+
  '<td>'+t.played+'</td><td>'+t.won+'</td><td>'+t.drawn+'</td><td>'+t.lost+'</td><td>'+(t.gd>0?'+':'')+t.gd+'</td><td class="points">'+t.points+'</td><td>'+
  (t.lastFive.length?t.lastFive.map(x=>'<span class="form-bubble '+x+'">'+x+'</span>').join(''):'<span style="color:#8293a9">—</span>')+'</td></tr>').join('');
 const reserves=status.reserves||[];
 $('#leagueTransition').innerHTML='<span>CHAMPIONSHIP · 2부 승격 예정</span><b>'+
   (reserves.map(c=>badge(c)+' '+esc(c.name)).join('<span class="reserve-sep">＋</span>')||'승격 대기팀 없음')+
   '</b><small>시즌 종료 시 1부 21·22위 강등 · 2부 대기 2팀 자동 승격</small>';
}
function renderTickets(){
 if(!status)return;
 $('#ticketList').innerHTML=status.tickets.length?status.tickets.map(t=>{
  const stat=t.status==='OPEN'?'진행 대기':t.status==='WIN'?'적중':t.status==='FORFEITED'?'회생 소멸':'미적중';
  const legs=t.legs.map(l=>'<div class="ticket-leg"><span>'+esc(team(l.home).short)+' – '+esc(team(l.away).short)+'</span><span class="pick">'+numbers[l.pick]+' '+esc(names[l.pick])+' · '+(l.market==='HDP'?'핸디캡 '+(l.line>0?'+':'')+l.line+' · ':'')+(l.odds100/100).toFixed(2)+'</span></div>').join('');
  return '<article class="ticket-card"><div class="ticket-head"><div><strong>JPL '+esc(t.seasonId)+' · '+t.legs.length+'폴더</strong><small> &nbsp;'+esc(shortDate(t.placedAt))+' '+esc(time(t.placedAt))+'</small></div><span class="ticket-status '+t.status+'">'+stat+'</span></div>'+
   '<div class="ticket-legs">'+legs+'</div><div class="ticket-footer"><span>베팅 <b>'+fmtMoney(t.stake)+'</b></span><span>확정 배당 <b>'+esc(t.totalOdds)+'x</b></span><span>'+(t.status==='WIN'?'실수령':'예상 실수령')+' <b>'+fmtMoney(t.status==='LOSE'||t.status==='FORFEITED'?'0':t.status==='WIN'?t.paid:t.expectedNet||t.potential)+'</b></span>'+(BigInt(t.tax||t.expectedTax||'0')>0n?'<span>잭팟 적립 <b>'+fmtMoney(t.tax||t.expectedTax)+'</b></span>':'')+'</div></article>';
 }).join(''):'<div class="fixture-message">아직 승부예측 티켓이 없어. 첫 경기를 선택해 봐!</div>';
}
function renderSlip(){
 const picks=[...selection.values()].sort((a,b)=>a.kickoff-b.kickoff);
 $('#slipCount').textContent=picks.length;
 $('#slipPicks').innerHTML=picks.length?picks.map(p=>
  '<div class="pick-line"><div class="pick-head"><b>'+esc(team(p.home).short)+' vs '+esc(team(p.away).short)+'</b><button type="button" data-remove="'+esc(p.matchId)+'" aria-label="선택 취소">×</button></div>'+
  '<div class="pick-sub"><span>'+esc(numbers[p.pick])+' · '+esc(names[p.pick])+' / '+(p.market==='HDP'?'핸디캡 '+(p.line>0?'+':'')+p.line+' · ':'')+esc(shortDate(p.kickoff))+'</span><strong>'+(p.odds100/100).toFixed(2)+'x</strong></div></div>'
 ).join(''):'<div class="slip-empty"><span>⚽</span><b>아직 선택된 경기가 없어</b><small>일반 또는 핸디캡 1 / X / 2를 눌러봐.</small></div>';
 let mult=1n,denom=1n;for(const p of picks){mult*=BigInt(p.odds100);denom*=100n}
 const odds=picks.length?(Number(mult)/Number(denom)).toFixed(2):'0.00';
 $('#totalOdds').innerHTML=odds+' <small>x</small>';
 const raw=$('#stake').value.trim().replaceAll(',','');
 let valid=/^[1-9][0-9]{0,30}$/.test(raw),stake=0n,payout=0n;
 try{if(valid)stake=BigInt(raw);if(valid)payout=stake*mult/denom}catch{valid=false}
 const taxed=!!picks.length&&(mult>=100n*denom||payout>TAX_LIMIT),tax=taxed?payout/5n:0n;
 $('#taxPreview').textContent=taxed?'예상 총 적중금 '+fmtMoney(payout)+' · 슬롯 잭팟 적립 20% '+fmtMoney(tax):
  '100배 이상 또는 적중금 1경 G 초과 시 20%가 슬롯 잭팟에 적립돼.';
 const within=valid&&stake>=1000n&&stake<=1000000000000n&&payout<=MAX_RETURN;
 $('#potential').textContent=picks.length&&valid?fmtMoney(payout-tax):'0 G';
 const button=$('#placeBet');
 button.disabled=betting||!picks.length||!within;
 button.textContent=betting?'베팅 접수 중...':!picks.length?'경기를 선택해 주세요':!valid||stake<1000n?'최소 1,000 G부터':stake>1000000000000n?'베팅 한도 1조 G':payout>MAX_RETURN?'예상 당첨금 100경 G 초과':'승무패 '+picks.length+'폴더 · '+fmtMoney(stake)+' 베팅 확정';
}
function setPick(matchId,pick,market='NORMAL'){
 if(!['H','D','A'].includes(pick)||!['NORMAL','HDP'].includes(market))return;
 const f=findFixture(matchId);
 if(!f||f.status!=='SCHEDULED'||now()>=f.kickoff){toast('킥오프한 경기는 베팅할 수 없어.',true);return}
 if(selection.get(matchId)?.pick===pick&&selection.get(matchId)?.market===market){selection.delete(matchId)}
 else{
  if(selection.size>=10&&!selection.has(matchId)){toast('최대 10경기까지 묶을 수 있어.',true);return}
  selection.set(matchId,{matchId,pick,market,line:market==='HDP'?f.handicap.line:0,
   odds100:market==='HDP'?f.handicap.odds[pick]:f.odds[pick],home:f.home,away:f.away,kickoff:f.kickoff});
 }
 renderFixtures();renderSlip();
}
function prunePicks(){
 for(const [id] of selection){
  const f=findFixture(id);
  if(!f||f.status!=='SCHEDULED'||now()>=f.kickoff)selection.delete(id);
 }
}
async function placeBet(){
 if(betting||!selection.size||!status)return;
 const legs=[...selection.values()].sort((a,b)=>a.kickoff-b.kickoff);
 const amount=$('#stake').value.trim().replaceAll(',','');
 if(!/^[1-9][0-9]{0,30}$/.test(amount)){toast('베팅 금액을 정수로 입력해 줘.',true);return}
 const stake=BigInt(amount);let product=stake,scale=1n;
 for(const leg of legs){product*=BigInt(leg.odds100);scale*=100n}
 const potential=product/scale,untaxed=product>=stake*scale*100n||potential>TAX_LIMIT;
 const tax=untaxed?potential/5n:0n;
 if(stake<1000n||stake>1000000000000n||potential>MAX_RETURN){toast('베팅 한도 또는 예상 당첨금 한도를 확인해 줘.',true);return}
 if(stake>BigInt(status.wallet)){toast('게임머니가 부족해.',true);return}
 if(!confirm(legs.length+'폴더에 '+fmtMoney(stake)+'를 베팅할까?\n모두 적중하면 '+fmtMoney(potential-tax)+' 실수령!'+(tax?'\n슬롯 잭팟 적립 20%: '+fmtMoney(tax):'')+'\n킥오프 전 확정되며 취소할 수 없어.'))return;
 betting=true;renderSlip();
 try{
  const response=await fetch('/api/jpl/bet',{method:'POST',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({amount,legs:legs.map(l=>({matchId:l.matchId,pick:l.pick,market:l.market})),requestId:crypto.randomUUID()})});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'베팅 접수에 실패했어.');
  selection.clear();toast('승무패 예측 접수 완료! 경기 종료 후 자동 정산돼.');
  if(status)status.wallet=data.wallet||data.user?.balance||status.wallet;
  await refresh(true);
 }catch(e){toast(e.message||'베팅 중 문제가 발생했어.',true)}
 finally{betting=false;renderSlip()}
}
function renderSchedule(){
 if(!allSchedule)return;
 const date=$('#scheduleDate').value;
 const arr=allSchedule.filter(f=>!date||dateKey(f.kickoff)===date);
 if(!arr.length){$('#scheduleResults').innerHTML='<p>선택한 날짜에는 경기가 없어.</p>';return}
 const groups=new Map();
 for(const f of arr){const k=dateKey(f.kickoff);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(f)}
 $('#scheduleResults').innerHTML=[...groups].map(([day,fs])=>
  '<article class="schedule-day"><h3>'+esc(day)+' · '+fs.length+'경기</h3>'+
  fs.map(f=>'<div class="schedule-line"><span class="time">'+esc(time(f.kickoff))+'</span><span class="name">'+esc(team(f.home).short)+' vs '+esc(team(f.away).short)+'</span><span class="time">'+(f.score?f.score.home+':'+f.score.away:'1 / X / 2')+'</span><button type="button" data-watch="'+esc(f.id)+'">관전</button></div>').join('')+
  '</article>').join('');
}
async function loadSchedule(){
 if(scheduleBusy)return;scheduleBusy=true;
 $('#scheduleResults').innerHTML='<p>시즌 전체 462경기 일정을 불러오는 중...</p>';
 try{
  const r=await fetch('/api/jpl/schedule',{credentials:'same-origin',cache:'no-store'});
  const d=await r.json();if(!r.ok)throw Error(d.error||'일정을 가져오지 못했어.');
  allSchedule=d.fixtures;renderSchedule();
 }catch(e){$('#scheduleResults').textContent=e.message||'일정을 불러올 수 없어요.'}
 finally{scheduleBusy=false}
}
function selectWatch(id){
 const f=findFixture(id);
 if(!f){toast('경기 정보를 불러오는 중이야.',true);return}
 watchId=id;demo=null;renderBroadcast();renderFixtures();
 $('#broadcast').scrollIntoView({behavior:'smooth',block:'start'});
}
function displayMatch(){
 if(demo){
  const elapsed=Math.min(MATCH_MS,now()-demo.startedAt);
  const minute=Math.min(90,Math.max(0,Math.floor(elapsed/MATCH_MS*90)));
  const events=demo.events.filter(e=>e.minute<=minute);
  return {id:'DEMO',home:'junja',away:'happy',round:0,kickoff:demo.startedAt,
   status:elapsed>=MATCH_MS?'FINAL':'LIVE',minute,events,seed:5121,score:{
    home:events.filter(e=>e.kind==='GOAL'&&e.side==='H').length,
    away:events.filter(e=>e.kind==='GOAL'&&e.side==='A').length},odds:{H:235,D:320,A:270},demo:true};
 }
 return chooseBroadcast();
}
function renderBroadcast(){
 const f=displayMatch();if(!f)return;
 const h=team(f.home),a=team(f.away),live=f.status==='LIVE',finished=f.status==='FINAL';
 $('#crestHome').outerHTML=badge(h,'','crestHome');
 $('#crestAway').outerHTML=badge(a,'','crestAway');
 $('#teamHome').textContent=h.name;$('#teamAway').textContent=a.name;
 $('#broadcastRound').textContent=f.demo?'EXHIBITION · 연출 데모':'JPL ROUND '+f.round;
 $('#broadcastVenue').textContent=h.stadium;
 $('#broadcastTime').textContent=shortDate(f.kickoff)+' · '+time(f.kickoff)+' KST';
 const onair=$('#onair');onair.className='onair'+(live?' live':finished?' final':'');
 onair.lastElementChild.textContent=f.demo?'DEMO · NO BET':live?'● LIVE':finished?'FULL TIME':'PRE-MATCH';
 $('#matchScore').innerHTML=f.score?f.score.home+' <span>:</span> '+f.score.away:'– <span>:</span> –';
 $('#matchClock').textContent=finished?'FULL TIME · 90′':live?(f.minute>45?'후반 ':'전반 ')+f.minute+'′':'KICK OFF '+time(f.kickoff);
 $('#pitchHalf').textContent=f.demo?'DEMO':finished?'FULL TIME':live?(f.minute>=45?'2ND HALF':'1ST HALF'):'PRE MATCH';
 $('#pitchMinute').textContent=finished?'FT':f.minute?f.minute+'′':'00′';
 const latest=[...(f.events||[])].reverse().find(x=>x.minute<=f.minute);
 $('#commentary').textContent=f.demo?'[연출 데모] '+(latest?latest.minute+'분 · '+(latest.kind==='GOAL'?'GOAL! ':'')+latest.text:'실제 베팅 결과와 관계없는 예시 경기입니다.'):
  !live&&!finished?'경기는 '+shortDate(f.kickoff)+' '+time(f.kickoff)+'에 시작해. 킥오프부터 120초간 실시간 중계돼.':
  latest?(latest.minute+'분 · '+team(latest.side==='H'?f.home:f.away).short+' · '+latest.text):
  finished?'풀타임! 경기 결과와 예측 적중금을 확인해 봐.':'선수들이 피치 위에서 공격을 전개하고 있어!';
 $('#progressFill').style.width=finished?'100%':live?f.minute/90*100+'%':'0%';
 $('#demoButton').textContent=demo?'데모 종료 ×':'2분 중계 미리보기 ↗';
}
function canvasDraw(timestamp){
 requestAnimationFrame(canvasDraw);
 if(!ctx||document.hidden||timestamp-lastDraw<33)return;lastDraw=timestamp;
 const w=canvas.width,h=canvas.height,match=displayMatch();
 const tick=match?(match.status==='LIVE'?Math.max(0,(now()-match.kickoff)/1000):match.status==='FINAL'?120:0):0;
 const tm=match?.status==='LIVE'?tick:timestamp/1100;
 const seed=Number(match?.seed||25),home=team(match?.home||'junja'),away=team(match?.away||'happy');
 // Stadium ambience, floodlights, and pixelated crowd tiers.
 ctx.fillStyle='#0b1824';ctx.fillRect(0,0,w,h);
 const crowdGradient=ctx.createLinearGradient(0,0,0,h);
 crowdGradient.addColorStop(0,'#26354e');crowdGradient.addColorStop(.45,'#101c2c');crowdGradient.addColorStop(1,'#0a1822');
 ctx.fillStyle=crowdGradient;ctx.fillRect(0,0,w,h);
 for(let row=0;row<12;row++){
  for(let col=0;col<140;col++){
   const noise=Math.sin((row*137+col*51+seed)*7.213);
   ctx.fillStyle=noise>.62?'#e9c88e':noise<-.55?'#648ba8':'#52657b';
   ctx.globalAlpha=.08+Math.abs(noise)*.30;
   ctx.fillRect(5+col*7.9,14+row*4,4.1,2);
   ctx.fillRect(5+col*7.9,h-15-row*4,4.1,2);
  }
 }
 ctx.globalAlpha=1;
 const X=63,Y=82,W=974,H=466;
 ctx.shadowColor='#000e';ctx.shadowBlur=26;ctx.fillStyle='#09251e';ctx.fillRect(X-9,Y-9,W+18,H+18);ctx.shadowBlur=0;
 const pitchGradient=ctx.createLinearGradient(X,Y,X,Y+H);
 pitchGradient.addColorStop(0,'#1b614e');pitchGradient.addColorStop(.5,'#205f4e');pitchGradient.addColorStop(1,'#164a3d');
 ctx.fillStyle=pitchGradient;ctx.fillRect(X,Y,W,H);
 for(let i=0;i<14;i++){
  ctx.fillStyle=i%2?'#ffffff09':'#0000000b';ctx.fillRect(X+i*W/14,Y,W/14,H);
 }
 const lx=X+20,ly=Y+18,lw=W-40,lh=H-36;
 ctx.strokeStyle='#e2f0e3b7';ctx.lineWidth=2.5;ctx.strokeRect(lx,ly,lw,lh);
 ctx.beginPath();ctx.moveTo(lx+lw/2,ly);ctx.lineTo(lx+lw/2,ly+lh);ctx.stroke();
 ctx.beginPath();ctx.arc(lx+lw/2,ly+lh/2,69,0,Math.PI*2);ctx.stroke();
 ctx.fillStyle='#e4eee2';ctx.beginPath();ctx.arc(lx+lw/2,ly+lh/2,4.3,0,Math.PI*2);ctx.fill();
 ctx.strokeRect(lx,ly+lh*.22,lw*.155,lh*.56);
 ctx.strokeRect(lx+lw-lw*.155,ly+lh*.22,lw*.155,lh*.56);
 ctx.strokeRect(lx,ly+lh*.37,lw*.061,lh*.26);
 ctx.strokeRect(lx+lw-lw*.061,ly+lh*.37,lw*.061,lh*.26);
 ctx.strokeStyle='#d5f5eb70';ctx.lineWidth=3;ctx.strokeRect(lx-13,ly+lh*.37,13,lh*.26);ctx.strokeRect(lx+lw,ly+lh*.37,13,lh*.26);
 ctx.fillStyle='#f2f3da';ctx.beginPath();ctx.arc(lx+lw*.112,ly+lh/2,3.8,0,7);ctx.arc(lx+lw*.888,ly+lh/2,3.8,0,7);ctx.fill();
 ctx.strokeStyle='#d9eee19a';ctx.lineWidth=1;ctx.beginPath();ctx.arc(lx+lw*.112,ly+lh/2,64,-.92,.92);ctx.stroke();
 ctx.beginPath();ctx.arc(lx+lw*.888,ly+lh/2,64,Math.PI-.92,Math.PI+.92);ctx.stroke();
 // Deterministic stadium player movement, only the authoritative score comes from the server.
 const base=[[.08,.5],[.23,.13],[.23,.38],[.23,.62],[.23,.87],[.41,.16],[.41,.4],[.41,.6],[.41,.84],[.61,.35],[.61,.65]];
 const advance=match?.status==='LIVE'?1:0.22;
 const ballX=.5+.35*Math.sin(tm*.36+seed*.003),ballY=.5+.32*Math.sin(tm*.72+seed*.001);
 const ball={x:ballX,y:ballY};
 if(match?.status==='LIVE'&&match.events){
  const goal=[...match.events].filter(e=>e.kind==='GOAL').find(e=>Math.abs((e.minute/90*120)-tick)<2.7);
  if(goal){ball.x=goal.side==='H'?.95:.05;ball.y=.5+.065*Math.sin(tm*2)}
 }
 const px=x=>lx+x*lw,py=y=>ly+y*lh;
 function player(side,i){
  const hside=side==='H',p=base[i],bx=hside?p[0]:1-p[0],by=hside?p[1]:1-p[1];
  const rx=Math.sin(tm*(.7+i*.021)+i*2.2+(hside?0:5))*.016*advance+(ball.x-bx)*.04*advance;
  const ry=Math.cos(tm*(.65+i*.04)+i*1.8)*.024*advance+(ball.y-by)*.035*advance;
  const xx=px(Math.max(.018,Math.min(.982,bx+rx))),yy=py(Math.max(.025,Math.min(.975,by+ry)));
  const c=hside?home:away,fill=c.primary||'#eee';
  ctx.fillStyle='#0009';ctx.beginPath();ctx.ellipse(xx+2,yy+9,9,4,0,0,7);ctx.fill();
  ctx.beginPath();ctx.arc(xx,yy,10,0,Math.PI*2);ctx.fillStyle=fill;ctx.shadowBlur=8;ctx.shadowColor=fill;ctx.fill();ctx.shadowBlur=0;
  ctx.strokeStyle=hside?'#f8dca9':'#e3ebf8';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle=hside&&fill==='#e4c275'?'#192332':'#ffffff';
  ctx.font='bold 10px Arial';ctx.textAlign='center';ctx.fillText(String(i+1),xx,yy+3.5);
 }
 for(let i=0;i<11;i++)player('H',i);
 for(let i=0;i<11;i++)player('A',i);
 const bx=px(ball.x),by=py(ball.y),bounce=2.4*Math.abs(Math.sin(tm*8));
 ctx.fillStyle='#0006';ctx.beginPath();ctx.ellipse(bx+2,by+7,8,3,0,0,7);ctx.fill();
 ctx.fillStyle='#fffff6';ctx.beginPath();ctx.arc(bx,by-bounce,7,0,7);ctx.fill();
 ctx.fillStyle='#172438';ctx.beginPath();ctx.arc(bx,by-bounce,2.8,0,7);ctx.fill();
 ctx.textAlign='left';ctx.fillStyle='#e6efefcc';ctx.font='bold 14px Arial';ctx.fillText('JPL / MATCH ENGINE',X+5,h-21);
 ctx.textAlign='right';ctx.fillStyle='#d8bd83';ctx.fillText(match?.demo?'EXHIBITION  ·  NOT FOR BETTING':'JUNJA PREMIER LEAGUE',w-X-5,h-21);
}
function updateLiveClock(){
 if(!status)return;
 const f=displayMatch();if(!f)return;
 if(f.status==='LIVE'||f.status==='SCHEDULED'&&now()>=f.kickoff||demo)renderBroadcast();
}
async function refresh(force=false){
 if(loading||document.hidden&&!force)return;
 loading=true;
 try{
  const response=await fetch('/api/jpl/status',{credentials:'same-origin',cache:'no-store'});
  if(response.status===401||response.status===403){
   $('#authNotice').hidden=false;throw Error('준자랜드에 로그인해 주세요.');
  }
  const d=await response.json();
  if(!response.ok)throw Error(d.error||'경기 정보를 가져올 수 없어.');
  if(status?.season.id!==d.season.id){allSchedule=null;selection.clear();watchId=null}
  status=d;clubs=new Map(d.clubs.map(c=>[c.id,c]));serverOffset=d.serverNow-Date.now();
  if(watchId&&!findFixture(watchId))watchId=null;
  prunePicks();renderTop();renderFixtures();renderTable();renderTickets();renderSlip();renderBroadcast();
  if(allSchedule)renderSchedule();
 }catch(e){if(!status)$('#fixturesList').textContent=e.message||'연결 실패';if(e.message?.includes('로그인'))$('#authNotice').hidden=false;else if(force)toast('리그 연결 확인: '+e.message,true)}
 finally{loading=false}
}
document.addEventListener('click',e=>{
 const pick=e.target.closest('[data-pick]');if(pick){const [matchId,market,result]=pick.dataset.pick.split(':');setPick(matchId,result,market);return}
 const remove=e.target.closest('[data-remove]');if(remove){selection.delete(remove.dataset.remove);renderFixtures();renderSlip();return}
 const watch=e.target.closest('[data-watch]');if(watch){selectWatch(watch.dataset.watch);return}
 const tab=e.target.closest('[data-fixture-tab]');if(tab){fixtureTab=tab.dataset.fixtureTab;renderFixtures();return}
 const nav=e.target.closest('[data-scroll]');if(nav){const dest=document.getElementById(nav.dataset.scroll);dest?.scrollIntoView({behavior:'smooth',block:'start'});$$('.section-nav button').forEach(b=>b.classList.toggle('nav-current',b===nav));return}
 const quick=e.target.closest('[data-stake]');if(quick){$('#stake').value=quick.dataset.stake;renderSlip()}
});
$('#stake').addEventListener('input',()=>{const n=$('#stake');n.value=n.value.replace(/[^0-9]/g,'');renderSlip()});
$('#clearSlip').addEventListener('click',()=>{selection.clear();renderFixtures();renderSlip()});
$('#placeBet').addEventListener('click',placeBet);
$('#scheduleLoad').addEventListener('click',loadSchedule);
$('#scheduleDate').addEventListener('change',()=>{if(!allSchedule)loadSchedule();else renderSchedule()});
$('#demoButton').addEventListener('click',()=>{
 if(demo){demo=null;renderBroadcast();return}
 if(status?.live?.length){toast('진행 중인 실제 경기를 시청해 줘!');return}
 demo={startedAt:now(),events:[
  {minute:12,kind:'SHOT',side:'A',text:'위협적인 슈팅을 막아냅니다!'},
  {minute:22,kind:'GOAL',side:'H',text:'준자의 선제골!'},
  {minute:34,kind:'CORNER',side:'A',text:'코너킥 기회입니다'},
  {minute:54,kind:'GOAL',side:'A',text:'햅피의 동점골!'},
  {minute:69,kind:'SAVE',side:'H',text:'골키퍼 슈퍼 세이브!'},
  {minute:83,kind:'GOAL',side:'H',text:'준자의 극적인 결승골!'}]};
 renderBroadcast();
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true)});
window.addEventListener('focus',()=>refresh(false));
setInterval(()=>refresh(),5000);
setInterval(updateLiveClock,350);
requestAnimationFrame(canvasDraw);
refresh(true);
})();
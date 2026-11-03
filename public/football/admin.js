(()=>{'use strict';
// Dedicated read-only dashboard; protected again by the server's admin guard.
const el=id=>document.getElementById(id);
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>{
 try{
  let n=BigInt(value||'0'),sign=n<0n?'-':'';if(n<0n)n=-n;
  const out=[];
  for(const [unit,size] of [['경',10000000000000000n],['조',1000000000000n],['억',100000000n],['만',10000n]]){
   const q=n/size;if(q>0n){out.push(q.toLocaleString('ko-KR')+unit);n%=size;}
  }
  if(n&&out.length<2)out.push(n.toLocaleString('ko-KR'));
  return sign+(out.slice(0,2).join(' ')||'0')+' G';
 }catch{return '—'}
};
const label={H:'홈 승',D:'무승부',A:'원정 승'};
const stateNames={OPEN:'진행 중',WIN:'적중',LOSE:'낙첨',FORFEITED:'회생 소멸'};
const tstamp=ms=>new Date(Number(ms)||0).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
let operator=false,busy=false,last=null,clubNames={};
function setNotice(v){el('adminNotice').textContent=String(v);}
function card(title,value){
 return '<div class="jpl-admin-metric"><span>'+safe(title)+'</span><strong>'+safe(value)+'</strong></div>';
}
function render(data){
 last=data;
 const keep=el('adminSeason').value||'current';
 const opts=['<option value="current">현재 시즌 '+safe(data.currentSeason)+'</option>','<option value="all">전체 시즌</option>']
  .concat((data.seasons||[]).map(s=>'<option value="'+safe(s)+'">'+safe(s)+' 시즌</option>'));
 el('adminSeason').innerHTML=opts.join('');
 el('adminSeason').value=['current','all',...(data.seasons||[])].includes(keep)?keep:'current';
 const s=data.summary;
 el('adminSummary').innerHTML=
  card('전체 티켓',s.tickets.toLocaleString('ko-KR')+'건')+
  card('참여 회원',s.bettors.toLocaleString('ko-KR')+'명')+
  card('총 베팅금 (중복 제외)',money(s.staked))+
  card('실제 지급금',money(s.paid))+
  card('미정산 티켓',s.open+'건')+
  card('적중 / 낙첨',s.win+' / '+s.lose)+
  card('미정산 예상 실수령 합계',money(s.expected))+
  card('잭팟 적립액',money(s.tax));
 const names=data.clubNames||clubNames;
 const club=id=>safe(names[id]||id||'?');
 el('adminMatches').innerHTML=data.matches?.length?data.matches.map(m=>{
  const choices=['H','D','A'].map(k=>{
   const p=m.picks[k]||{count:0,stake:'0'};
   return '<div class="jpl-admin-choice"><b>'+label[k]+'</b><span>'+p.count+'장 선택</span><strong>'+safe(money(p.stake))+'</strong></div>';
  }).join('');
  const market=m.market==='HDP'?'핸디캡 '+(m.line>0?'+':'')+m.line:'일반 승무패';
  return '<article class="jpl-admin-match"><header><span>'+club(m.home)+' vs '+club(m.away)+'</span>'+
   '<small>'+safe(m.seasonId)+' · '+safe(tstamp(m.kickoff))+' · '+safe(market)+' · '+m.tickets+'장</small></header>'+
   '<div class="jpl-admin-choices">'+choices+'</div></article>';
 }).join(''):'<div class="jpl-admin-empty">해당 조건의 베팅 경기가 없어.</div>';
 el('adminTickets').innerHTML=data.tickets?.length?data.tickets.map(t=>{
  const detail=t.legs.map(l=>{
   const choice=(l.pick==='H'||l.pick==='D'||l.pick==='A')?label[l.pick]:'—';
   const market=l.market==='HDP'?'핸디캡 '+(l.line>0?'+':'')+l.line:'일반';
   return '<div class="leg"><span>'+club(l.home)+' vs '+club(l.away)+'</span><span>'+safe(market)+' · '+safe(choice)+' · '+(l.odds100/100).toFixed(2)+'배</span></div>';
  }).join('');
  return '<details class="jpl-admin-ticket"><summary><b>'+safe(t.nickname)+'</b>'+
   '<span>'+t.legs.length+'폴더 · '+safe(money(t.stake))+'</span>'+
   '<span class="jpl-admin-status '+safe(t.status)+'">'+safe(stateNames[t.status]||t.status)+'</span>'+
   '<span class="right">'+safe(tstamp(t.placedAt))+'</span></summary>'+
   '<div class="detail"><div>구매표 '+safe(t.receiptNumber)+' · '+safe(t.seasonId)+' · 확정 배당 '+safe(t.totalOdds)+'배</div>'+
   detail+'<div>예상 당첨금 '+safe(money(t.potential))+' · '+(t.status==='WIN'?'실제 지급 ':t.status==='OPEN'?'예상 실수령 ':'실제 지급 ')+
   safe(money(t.status==='WIN'?t.paid:t.status==='OPEN'?t.expectedNet:'0'))+'</div></div></details>';
 }).join(''):'<div class="jpl-admin-empty">이 조건에 맞는 회원 베팅이 없어.</div>';
 el('adminPagerLabel').textContent=data.pagination.page+' / '+data.pagination.pages+'페이지 · '+data.pagination.total+'건';
 el('adminPrev').disabled=data.pagination.page<=1;
 el('adminNext').disabled=data.pagination.page>=data.pagination.pages;
 el('adminExposureNote').textContent=data.exposureNote;
 setNotice('운영자만 볼 수 있는 실시간 조회 화면 · 마지막 갱신 '+tstamp(Date.now()));
}
async function load(page=1){
 if(!operator||busy)return;
 busy=true;el('adminLoad').disabled=true;
 const query=new URLSearchParams({
  season:el('adminSeason').value||'current',status:el('adminStatus').value||'ALL',
  user:el('adminUser').value.trim(),page:String(page)
 });
 try{
  const response=await fetch('/api/admin/jpl-bets?'+query,{credentials:'same-origin',cache:'no-store'});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'베팅 현황을 불러올 수 없어.');
  render(result);
 }catch(e){setNotice('조회 실패: '+(e.message||'서버 오류'))}
 finally{busy=false;el('adminLoad').disabled=false}
}
async function start(){
 try{
  const r=await fetch('/api/me',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)return;
  const d=await r.json();
  if(Number(d?.user?.is_admin)!==1)return;
  operator=true;
  el('adminNav').hidden=false;
  el('adminPanel').hidden=false;
  el('adminNav').addEventListener('click',()=>load(1));
  el('adminLoad').addEventListener('click',()=>load(1));
  el('adminStatus').addEventListener('change',()=>load(1));
  el('adminSeason').addEventListener('change',()=>load(1));
  el('adminUser').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();load(1)}});
  el('adminPrev').addEventListener('click',()=>{if(last)load(last.pagination.page-1)});
  el('adminNext').addEventListener('click',()=>{if(last)load(last.pagination.page+1)});
  await load(1);
  setInterval(()=>{if(last&&!document.hidden)load(last.pagination.page)},30000);
 }catch{}
}
start();
})();
'use strict';
// Operator-only read-only panel; access is enforced by the authenticated server.
(function(){
 const root=document.getElementById('casinoAuditPanel');
 if(!root)return;
 const member=document.getElementById('casinoAuditMember');
 const game=document.getElementById('casinoAuditGame');
 const refresh=document.getElementById('casinoAuditRefresh');
 const more=document.getElementById('casinoAuditMore');
 const rows=document.getElementById('casinoAuditRows');
 const summary=document.getElementById('casinoAuditSummary');
 let busy=false,cursor=null,initialized=false;
 const create=(tag,cls,text)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=String(text);
  return node;
 };
 const amount=value=>{
  if(value===null||value===undefined)return '기록 없음';
  try{return BigInt(value).toLocaleString('ko-KR')+' G';}
  catch{return String(value).slice(0,48)+' G';}
 };
 const stamp=ms=>{
  const n=Number(ms);
  if(!Number.isFinite(n))return '일시 미확인';
  return new Date(n).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
 };
 const states={
  matched:'지급 금액 일치',
  mismatch:'금액 불일치 · 확인 필요',
  unknown:'결과 미확인 · 낙첨 가능',
  unpaired:'단독 지급 · 무료권 가능'
 };
 const gameNames={roulette:'룰렛',bigwheel:'빅휠'};
 function drawSummary(data){
  summary.replaceChildren();
  const stats=[['정상 쌍',data.totals.matched],['불일치',data.totals.mismatch],['판정 불가',data.totals.unknown],['단독 지급',data.totals.unpaired]];
  for(const [name,n] of stats){
   const chip=create('span','stat'+(name==='불일치'&&n?' attention':''));
   chip.append(create('span','',name),create('strong','',String(n)));
   summary.append(chip);
  }
  summary.append(create('span','','최근 원장 '+data.scannedRows+'행 분석 · 이번 조회 '+data.shown+'건'));
 }
 function drawEntry(item){
  const card=create('article','casino-watch-card'+(item.status==='mismatch'?' mismatch':''));
  const head=create('div','top');
  const identity=create('div','ident',(gameNames[item.game]||item.game)+' · '+(item.nickname||'회원'));
  identity.append(create('small','','#'+item.userId+' · '+stamp(item.createdAt)));
  head.append(identity,create('span','casino-watch-status '+item.status,states[item.status]||'기록 확인'));
  const values=create('div','casino-watch-values');
  for(const [name,value,css] of [
   ['베팅 차감',item.betG===null?'무료권/미상':amount(item.betG),''],
   ['당첨 지급',amount(item.payoutG),'plus'],
   ['기록된 잔액',amount(item.afterG),'']
  ]){
   const wrap=create('div');
   wrap.append(create('small','',name),create('strong',css,value));
   values.append(wrap);
  }
  card.append(head,values);
  if(item.landing)card.append(create('p','note','기록 결과: '+item.landing));
  for(const issue of item.issues||[])card.append(create('p','note','⚠ 정산 검사 코드: '+issue));
  for(const note of item.notes||[])card.append(create('p','note',note));
  card.append(create('div','evidence','LEDGER #'+(item.ledgerIds||[]).join(' · #')));
  return card;
 }
 async function load(append=false){
  if(busy)return;
  busy=true;refresh.disabled=true;more.disabled=true;
  if(!append){cursor=null;initialized=true;rows.replaceChildren();}
  summary.textContent='서버 원장을 읽고 비교하는 중입니다…';
  try{
   const q=new URLSearchParams({game:game.value||'all',limit:'30'});
   const m=member.value.trim();
   if(m)q.set('member',m.slice(0,32));
   if(append&&cursor!==null)q.set('beforeId',String(cursor));
   const res=await fetch('/api/admin/casino-settlements?'+q.toString(),{method:'GET',credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store'});
   const payload=await res.json();
   if(!res.ok)throw new Error(payload.error||'원장을 조회할 수 없습니다.');
   for(const item of payload.events||[])rows.append(drawEntry(item));
   if(!rows.childElementCount)rows.append(create('div','casino-watch-card','조회 조건에 맞는 정산 기록이 없습니다.'));
   drawSummary(payload);
   cursor=payload.nextBeforeId??null;
   more.hidden=cursor===null;
  }catch(err){
   summary.textContent='정산 조회 실패: '+String(err?.message||err).slice(0,180);
   if(!append)rows.append(create('div','casino-watch-card','대표 운영자 계정으로 로그인한 뒤 조회할 수 있습니다.'));
   more.hidden=true;
  }finally{
   busy=false;refresh.disabled=false;more.disabled=false;
  }
 }
 refresh.addEventListener('click',()=>load(false));
 more.addEventListener('click',()=>{if(cursor!==null)load(true)});
 member.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();load(false)}});
 game.addEventListener('change',()=>{if(initialized)load(false)});
})();

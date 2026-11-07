'use strict';
// Member round receipts from server-verified, ledger-backed evidence. No bet or wallet mutation.
(function(){
 const panel=document.getElementById('roundReceiptPanel');
 if(!panel)return;
 const list=document.getElementById('roundReceiptRows'),more=document.getElementById('roundReceiptMore');
 const reload=document.getElementById('roundReceiptReload'),filter=document.getElementById('roundReceiptGame');
 let busy=false,cursor=null;
 const node=(tag,cls,content)=>{
  const e=document.createElement(tag);if(cls)e.className=cls;
  if(content!==undefined)e.textContent=String(content);return e;
 };
 const formatG=v=>{
  try{return BigInt(String(v)).toLocaleString('ko-KR')+' G';}
  catch{return '—';}
 };
 const timestamp=ms=>{
  const n=Number(ms);if(!Number.isFinite(n))return '일시 확인 불가';
  return new Date(n).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
 };
 function displayReceipt(r){
  const item=node('article','round-proof-item'+(r.status!=='verified'?' '+r.status:''));
  const top=node('div','round-proof-item-top');
  const title=node('div');
  title.append(node('strong','round-proof-label',r.game==='roulette'?'유럽식 룰렛':'빅휠'));
  title.append(node('div','round-proof-ref',(r.reference||'영수증')+' · '+timestamp(r.createdAt)));
  const status=node('span','round-proof-status'+(r.status==='verified'?'':' bad'),r.status==='verified'?'원장 대조 완료':'수동 확인 필요');
  top.append(title,status);item.append(top);
  const values=node('div','round-proof-values');
  for(const [label,value,isPaid] of [
   ['베팅 차감',formatG(r.spentG),''],
   ['당첨 지급',formatG(r.payoutG),'paid'],
   ['최종 잔액',formatG(r.balanceG),'']
  ]){
   const cell=node('div');cell.append(node('small','',label),node('strong',isPaid,value));
   values.append(cell);
  }
  item.append(values);
  if(r.outcome){
   const result=r.game==='roulette'
    ?'당첨 번호 '+r.outcome.number+' · '+({red:'RED',black:'BLACK',green:'GREEN'}[r.outcome.color]||r.outcome.color)
    :'결과 '+(r.outcome.label||r.outcome.key)+' · '+(r.outcome.multiplier||'—')+'배';
   item.append(node('p','round-proof-result',result+(r.free?' · 신분 무료 이용권':'')));
  }
  const details=node('details'),summary=node('summary','',r.game==='roulette'?'배팅 상세·검증 기록':'결과·검증 기록');
  details.append(summary);
  if(r.game==='roulette'){
   for(const bet of r.bets||[]){
    const target=Array.isArray(bet.target)?bet.target.join('/'):(bet.target??'-');
    details.append(node('p','',String(bet.kind)+' '+String(target)+' · '+formatG(bet.amountG)+' · '+(bet.won?'적중':'미적중')+' · 지급 '+formatG(bet.returnedG)));
   }
  }else details.append(node('p','','선택 '+(r.selection||'기록 없음')+' · 결과 칸 '+String(r.outcome?.index??'—')));
  if((r.errors||[]).length)for(const issue of r.errors)details.append(node('p','','검증 항목: '+issue));
  details.append(node('p','','서버 거래원장에 기록된 회차 증빙입니다. 이전 기록이 없는 회차에 대해서는 소급 보증하지 않습니다.'));
  item.append(details);
  const copy=node('button','round-proof-copy','영수증 번호 복사');
  copy.type='button';
  copy.addEventListener('click',async()=>{
   if(!r.reference)return;
   try{
    await navigator.clipboard.writeText(r.reference);
    copy.textContent='복사 완료';
   }catch{
    copy.textContent='번호: '+r.reference;
   }
  });
  item.append(copy);
  return item;
 }
 async function load(reset=true){
  if(busy)return;
  busy=true;reload.disabled=true;more.disabled=true;
  if(reset){cursor=null;list.replaceChildren();}
  if(!list.childElementCount)list.textContent='영수증을 조회하고 있어.';
  try{
   const q=new URLSearchParams({game:filter.value||'all',limit:'12'});
   if(!reset&&cursor!==null)q.set('beforeId',String(cursor));
   const r=await fetch('/api/casino/receipts?'+q.toString(),{
    method:'GET',credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store'
   });
   const data=await r.json();
   if(!r.ok)throw Error(data.error||'영수증 조회 실패');
   if(reset||!list.querySelector('.round-proof-item'))list.replaceChildren();
   for(const item of data.rows||[])list.append(displayReceipt(item));
   if(!list.childElementCount)list.append(node('div','round-proof-item','아직 발급된 회차 영수증이 없어. 다음 룰렛·빅휠 게임부터 기록이 남아.'));
   cursor=data.nextBeforeId??null;more.hidden=cursor===null;
  }catch(err){
   if(reset)list.replaceChildren();
   list.append(node('div','round-proof-item','조회 오류: '+String(err.message||err).slice(0,130)));
   more.hidden=true;
  }finally{busy=false;reload.disabled=false;more.disabled=false;}
 }
 reload.addEventListener('click',()=>load(true));
 filter.addEventListener('change',()=>load(true));
 more.addEventListener('click',()=>{if(cursor!==null)load(false)});
 window.JunjaReceipts=Object.freeze({load});
})();

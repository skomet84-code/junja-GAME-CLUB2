'use strict';
(function(){
 const $=id=>document.getElementById(id),modal=$('supportCenterModal'),openBtn=$('supportCenterBtn'),close=$('supportCenterClose');
 if(!modal||!openBtn)return;
 const form=$('supportForm'),status=$('supportStatus'),myRows=$('supportMyRows');
 const admin=$('supportAdminPanel'),adminRows=$('supportAdminRows');
 const categories={game_settlement:'정산·영수증',account:'계정',premium_preview:'프리미엄 전시관',refund_inquiry:'환불 문의(자동 처리 불가)',other:'기타'};
 const states={OPEN:'접수',REVIEWING:'검토 중',NEEDS_INFO:'추가 정보 필요',RESOLVED:'처리 완료',CLOSED:'종결'};
 let busy=false,adminLoaded=false;
 function node(tag,text,cls){
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=String(text??'');
  if(cls)el.className=cls;
  return el;
 }
 function formatTime(t){const d=new Date(t);return Number.isFinite(d.getTime())?d.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'시간 미상'}
 function shortText(v,n=800){return String(v??'').slice(0,n)}
 function id(){return globalThis.crypto?.randomUUID?.()||'ticket_'+Date.now()+'_'+Math.random().toString(36).slice(2);}
 async function request(url,body){
  const response=await fetch(url,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
   body:body?JSON.stringify(body):undefined});
  const json=await response.json();
  if(!response.ok)throw Error(json.error||'서버 요청을 처리하지 못했습니다.');
  return json;
 }
 function itemCard(t,owner=false){
  const card=node('article',undefined,'support-ticket');
  const head=node('div',undefined,'support-ticket-head');
  const title=node('strong',t.reference+' · '+shortText(t.subject,75));
  const badge=node('span',states[t.status]||t.status,'support-ticket-state');
  head.append(title,badge);card.append(head);
  card.append(node('small',(categories[t.category]||t.category)+' · '+formatTime(t.createdAt)+(owner?' · '+shortText(t.nickname,50):''),'support-ticket-meta'));
  card.append(node('p',shortText(t.message,600),'support-ticket-message'));
  if(t.adminNote)card.append(node('p','운영자 안내: '+shortText(t.adminNote,250),'support-ticket-note'));
  if(!owner)return card;
  if(t.status==='CLOSED')return card;
  const tools=node('div',undefined,'support-ticket-tools');
  const select=node('select');select.setAttribute('aria-label',t.reference+' 처리 상태');
  for(const [value,name] of Object.entries(states)){
   if(value==='OPEN')continue;
   const option=node('option',name);option.value=value;select.append(option);
  }
  select.value=['OPEN'].includes(t.status)?'REVIEWING':t.status;
  const note=node('input');note.value='';note.placeholder='처리 메모(선택, 250자)';note.maxLength=250;note.setAttribute('aria-label',t.reference+' 처리 메모');
  const update=node('button','상태 기록');update.type='button';
  update.addEventListener('click',async()=>{
   if(busy)return;
   if(!window.confirm(t.reference+' 문의를 '+states[select.value]+' 상태로 바꾸겠습니까?\n이 작업은 문의 상태만 변경하며 실제 환불이나 게임머니 지급은 하지 않습니다.'))return;
   busy=true;update.disabled=true;
   try{
    await request('/api/admin/support/cases',{id:t.id,status:select.value,adminNote:note.value,
     expectedVersion:t.version,requestId:id()});
    await loadAdmin();
   }catch(e){adminRows.prepend(node('p','상태 변경 실패: '+shortText(e.message,160),'support-error'))}
   finally{busy=false;update.disabled=false;}
  });
  tools.append(select,note,update);card.append(tools);
  return card;
 }
 async function loadMine(){
  myRows.replaceChildren(node('div','내 문의 기록을 불러오는 중…'));
  try{
   const reply=await request('/api/support/cases');
   myRows.replaceChildren();
   if(!reply.items?.length)myRows.append(node('p','아직 접수한 문의가 없습니다.','support-empty'));
   for(const ticket of reply.items||[])myRows.append(itemCard(ticket));
  }catch(e){myRows.replaceChildren(node('p','조회 실패: '+shortText(e.message,150),'support-error'))}
 }
 function show(){modal.hidden=false;close.focus();loadMine()}
 function hide(){modal.hidden=true;openBtn.focus()}
 openBtn.addEventListener('click',show);close.addEventListener('click',hide);
 modal.addEventListener('click',e=>{if(e.target===modal)hide()});
 document.addEventListener('keydown',e=>{if(!modal.hidden&&e.key==='Escape')hide()});
 $('supportRefresh').addEventListener('click',loadMine);
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;
  busy=true;$('supportSubmit').disabled=true;status.textContent='문의 접수 처리 중…';
  const input={category:$('supportCategory').value,subject:$('supportSubject').value,message:$('supportMessage').value,requestId:id()};
  try{
   const reply=await request('/api/support/cases',input);
   status.textContent='문의가 접수되었습니다. 접수번호: '+reply.item.reference;
   form.reset();await loadMine();
  }catch(err){status.textContent='접수 실패: '+shortText(err.message,200)}
  finally{busy=false;$('supportSubmit').disabled=false}
 });
 async function loadAdmin(){
  if(!admin)return;
  adminRows.replaceChildren(node('div','대표 운영자 문의 목록을 불러오는 중…'));
  try{
   const filter=$('supportAdminFilter').value;
   const reply=await request('/api/admin/support/cases?status='+encodeURIComponent(filter));
   adminLoaded=true;adminRows.replaceChildren();
   if(!reply.items?.length)adminRows.append(node('p','접수된 문의가 없습니다.','support-empty'));
   for(const t of reply.items||[])adminRows.append(itemCard(t,true));
  }catch(e){adminRows.replaceChildren(node('p','조회 제한: '+shortText(e.message,170),'support-error'))}
 }
 if(admin){
  $('supportAdminRefresh').addEventListener('click',loadAdmin);
  $('supportAdminFilter').addEventListener('change',loadAdmin);
  const view=$('view-admin');
  if(view){
   const check=()=>{if(view.classList.contains('active')&&!adminLoaded)loadAdmin()};
   const obs=new MutationObserver(check);obs.observe(view,{attributes:true,attributeFilter:['class']});check();
  }
 }
})();

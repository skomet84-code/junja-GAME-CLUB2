'use strict';
(function(){
 const el=id=>document.getElementById(id),root=el('commerceReadinessPanel');
 if(!root)return;
 const stats=el('commerceReadinessStats'),rows=el('commerceReadinessItems'),warning=el('commerceReadinessWarning'),refresh=el('commerceReadinessRefresh');
 let busy=false,loaded=false;
 const labels={blocked:'미충족', 'prototype-tested':'시범 검증',verified:'증빙 확인'};
 function node(tag,value,cls){const x=document.createElement(tag);x.textContent=String(value??'');if(cls)x.className=cls;return x;}
 function show(data){
  stats.replaceChildren();
  for(const [label,num] of [['미충족',data.totals.blocked],['시범 검증',data.totals.prototypeTested],['증빙 확인',data.totals.verified]]){
   const chip=node('div',undefined,'cg-stat');
   chip.append(node('small',label),node('strong',String(num)));
   stats.append(chip);
  }
  rows.replaceChildren();
  for(const requirement of data.requirements){
   const item=node('div',undefined,'cg-item');
   const body=node('div');
   body.append(node('b',requirement.label),node('small','담당: '+requirement.owner));
   if(requirement.evidence)body.append(node('small','현재 근거: '+requirement.evidence));
   item.append(body,node('span',labels[requirement.status]||requirement.status,'cg-state '+(requirement.status==='prototype-tested'?'prototype':requirement.status==='verified'?'verified':'')));
   rows.append(item);
  }
  const off=data.livePaymentsEnabled===false&&data.goLive===false&&data.checkoutBlocked===true;
  warning.textContent=(off?'실제 현금결제: 비활성화. ':'주의: 결제 상태가 예상과 다릅니다. ')+
   '상용화 판단 '+data.decision+' · '+data.totals.required+'개 조건 중 '+data.totals.blocked+'개 미충족. 법률 및 PG 검증 이전에는 결제를 열지 않습니다.';
 }
 async function load(){
  if(busy)return;
  busy=true;refresh.disabled=true;
  rows.replaceChildren(node('p','법률·PG·환불·보안 준비 상태 확인 중…'));
  try{
   const response=await fetch('/api/admin/commerce-readiness',{method:'GET',cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'출시 조건 점검에 실패했습니다.');
   loaded=true;show(data);
  }catch(e){rows.replaceChildren(node('p','접근 제한 또는 점검 오류: '+String(e.message||e).slice(0,170)));warning.textContent='실제 결제는 계속 비활성화 상태입니다.'}
  finally{busy=false;refresh.disabled=false}
 }
 refresh.addEventListener('click',load);
 const adminView=el('view-admin');
 if(adminView){
  const check=()=>{if(adminView.classList.contains('active')&&!loaded)load()};
  const observer=new MutationObserver(check);observer.observe(adminView,{attributes:true,attributeFilter:['class']});check();
 }
})();

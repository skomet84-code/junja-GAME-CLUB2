'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const form=document.getElementById('claim'),message=document.getElementById('message'),button=document.getElementById('submit');
 form.addEventListener('submit',async(event)=>{
  event.preventDefault();
  button.disabled=true;
  message.className='message';
  message.textContent='관리자 계정을 개설하고 있습니다…';
  const setupCode=form.elements.setupCode.value.trim(),password=form.elements.password.value;
  try{
   const response=await fetch('/api/admin/claim',{
    method:'POST',
    credentials:'same-origin',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({setupCode,password}),
   });
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'개설 요청에 실패했습니다.');
   message.className='message good';
   message.textContent='관리자 계정 개설 완료!\n아이디: admin_junja\n설정한 비밀번호로 게임에 로그인하세요.';
   form.hidden=true;
  }catch(err){
   message.className='message bad';
   message.textContent=err.message||'잠시 후 다시 시도하세요.';
  }finally{button.disabled=false;form.elements.password.value='';}
 });
});

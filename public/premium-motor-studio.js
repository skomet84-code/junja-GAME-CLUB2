'use strict';
// Free premium design draft locker. Opt-in public link, never paid ownership.
(()=>{
 const $=id=>document.getElementById(id),panel=$('motorDesignPanel');
 if(!panel)return;
 const status=$('motorDesignStatus'),member=$('motorDesignMember'),visitor=$('motorDesignVisitor'),login=$('motorDesignLogin');
 const save=$('motorDesignSave'),publish=$('motorDesignPublish'),rotate=$('motorDesignRotate');
 const shareBox=$('motorDesignShareBox'),shareUrl=$('motorDesignShareUrl'),copy=$('motorDesignCopy');
 let record=null,busy=false,mode='loading';
 const fallbackDesign={paint:'platinum',doorsOpen:false,lightsOn:false,rotation:-.44,pitch:.22,zoom:9.1};
 const notify=(s)=>{status.textContent=s;};
 const lab=()=>window.JunjaSovereignLab||null;
 const browserDesign=()=>{
  const snap=lab()?.snapshot?.();
  if(!snap?.supported)return record?.design||fallbackDesign;
  return {paint:snap.color,doorsOpen:snap.doorsOpen,lightsOn:snap.lightsOn,
   rotation:snap.rotation,pitch:snap.pitch,zoom:snap.zoom};
 };
 const link=token=>location.origin+'/premium-sovereign-lab.html?design='+encodeURIComponent(token);
 async function request(url,payload){
  const response=await fetch(url,{method:payload?'POST':'GET',credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},
   body:payload?JSON.stringify(payload):undefined});
  let out={};try{out=await response.json()}catch{}
  if(!response.ok){const e=new Error(out.error||'디자인을 불러오지 못했습니다.');e.httpStatus=response.status;throw e;}
  return out;
 }
 function showState(){
  if(mode!=='owner'||!record)return;
  member.hidden=false;visitor.hidden=true;login.hidden=true;
  const published=record.published===true&&!!record.shareToken;
  publish.setAttribute('aria-pressed',String(published));
  publish.textContent=published?'공개 해제하기':'공개 링크 만들기';
  rotate.hidden=!published;shareBox.hidden=!published;
  shareUrl.value=published?link(record.shareToken):'';
  const hasWebgl=!!lab()?.snapshot?.().supported;
  save.disabled=busy||!hasWebgl;
  publish.disabled=busy||(!hasWebgl&&!record.version);
  rotate.disabled=busy||!published;
  notify((record.version?'저장된 디자인 시안 '+record.version+'번째 버전 · ':'저장된 디자인 시안 없음 · ')+
   (published?'링크 공개 중 · 실제 소유권 없음':'비공개 · 실제 소유권 없음'));
 }
 async function putDesign({visibility,rotateShare=false}={}){
  if(mode!=='owner'||!record||busy)return;
  const published=visibility??record.published;
  if(published&&!record.published&&!window.confirm('닉네임과 무료 디자인 시안이 공유 링크를 아는 사람에게 공개됩니다. 공개할까요?'))return;
  if(!published&&record.published&&!window.confirm('기존 방문 링크를 즉시 해제할까요?'))return;
  if(rotateShare&&!window.confirm('이전 방문 링크가 즉시 무효화됩니다. 새 링크를 발급할까요?'))return;
  busy=true;showState();notify('디자인 설정을 안전하게 저장하는 중…');
  try{
   const req={design:browserDesign(),published,rotateShare,expectedVersion:record.version,
    requestId:globalThis.crypto?.randomUUID?.()||'motor_request_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)};
   record=await request('/api/premium/motor-studio',req);
   showState();
   notify(published?'디자인을 저장하고 공개 중입니다. 다른 회원이 링크로 방문할 수 있습니다.':'비공개 디자인 시안을 저장했습니다. 아직 소유하거나 구매한 상품은 아닙니다.');
  }catch(e){
   if(e.httpStatus===409){
    try{record=await request('/api/premium/motor-studio');showState();}
    catch{}
   }
   notify('저장 실패: '+String(e.message||e).slice(0,180));
  }finally{busy=false;showState();}
 }
 async function load(){
  const token=new URL(location.href).searchParams.get('design');
  if(token!==null){
   mode='visitor';member.hidden=true;visitor.hidden=false;login.hidden=true;
   if(!/^[A-Za-z0-9_-]{24}$/.test(token)){notify('올바르지 않은 디자인 공유 링크입니다.');return;}
   try{
    const data=await request('/api/premium/motor-studio/share/'+encodeURIComponent(token));
    const applied=lab()?.applyDesign?.(data.design)||false;
    $('motorDesignVisitorNote').textContent=String(data.designerNickname||'회원').slice(0,36)+'님의 공개된 소버린 GT 무료 디자인 시안입니다. 실제 상품 소유권을 뜻하지 않으며, 감상 중 변경한 설정은 저장되지 않습니다.';
    notify(applied?'방문 디자인 시안을 불러와 차량 3D에 적용했습니다. 소유권과 무관합니다.':'방문 시안 정보를 불러왔습니다. 실시간 3D를 지원하지 않는 기기에서는 정적 이미지로 보여줍니다.');
   }catch(e){$('motorDesignVisitorNote').textContent='공개가 해제됐거나 만료된 디자인 링크입니다.';notify('공개 디자인을 볼 수 없습니다. 본인만 다시 공개할 수 있습니다.');}
   return;
  }
  try{
   record=await request('/api/premium/motor-studio');
   mode='owner';member.hidden=false;visitor.hidden=true;login.hidden=true;
   const applied=lab()?.applyDesign?.(record.design)||false;
   showState();
   if(record.version&&applied)notify('저장된 내 차량 디자인을 불러와 실제 3D 모델에 적용했어요. 미소유 디자인 시안입니다.');
  }catch(e){
   if(e.httpStatus===401){mode='guest';member.hidden=true;visitor.hidden=true;login.hidden=false;notify('로그인하지 않아도 차량 조작은 체험할 수 있어요. 계정 저장은 로그인 후 가능합니다.');}
   else{mode='error';member.hidden=true;login.hidden=false;notify('디자인 보관함을 열지 못했습니다: '+String(e.message||e).slice(0,120));}
  }
 }
 save.addEventListener('click',()=>putDesign());
 publish.addEventListener('click',()=>putDesign({visibility:!record?.published}));
 rotate.addEventListener('click',()=>putDesign({visibility:true,rotateShare:true}));
 copy.addEventListener('click',async()=>{
  if(!record?.published||!record.shareToken)return;
  try{
   if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(shareUrl.value);
   else{shareUrl.select();if(!document.execCommand?.('copy'))throw Error('복사 기능을 사용할 수 없습니다.');}
   notify('공개 디자인 링크를 복사했습니다. 링크를 공유한 사람에게만 시안이 표시돼요.');
  }catch{shareUrl.focus();shareUrl.select();notify('주소를 선택했어요. 직접 복사해 주세요.');}
 });
 load();
})();

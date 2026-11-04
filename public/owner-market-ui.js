'use strict';
(function(){
 const root=document.getElementById('ownerMarketPanel');
 if(!root)return;
 const el=id=>document.getElementById(id);
 const market=el('ownerMarketType'),asset=el('ownerMarketAsset'),refresh=el('ownerMarketRefresh');
 const input=el('ownerMarketPercent'),vol=el('ownerMarketVolSelect');
 const priceBtn=el('ownerMarketApplyPrice'),volBtn=el('ownerMarketApplyVol');
 const status=el('ownerMarketStatus'),preview=el('ownerMarketPreview');
 const history=el('ownerMarketHistory');
 let snapshot=null,loading=false,pendingKey=null;
 const fmt=x=>{try{return BigInt(x).toLocaleString('ko-KR')+' G'}catch{return '—'}};
 const txt=(tag,value,cls)=>{
  const node=document.createElement(tag);
  node.textContent=String(value??'');
  if(cls)node.className=cls;
  return node;
 };
 function selected(){
  return snapshot?.markets?.[market.value]?.find(x=>x.id===asset.value)||null;
 }
 function pctBp(){
  const match=/^([+-]?)(\d{1,3})(?:\.(\d{1,2}))?$/.exec(String(input.value||'').trim());
  if(!match)return null;
  return (match[1]==='-'?-1:1)*(Number(match[2])*100+Number((match[3]||'').padEnd(2,'0')));
 }
 function limit(){return snapshot?.limits?.[market.value]||{minPercent:-30,maxPercent:30}}
 function estimate(){
  const item=selected(),bp=pctBp();
  if(!item){preview.textContent='시장 정보를 조회해주세요.';return null;}
  if(bp===null||bp===0||bp<limit().minPercent*100||bp>limit().maxPercent*100){
   preview.textContent='허용 범위: '+limit().minPercent+'% ~ +'+limit().maxPercent+'% (0% 제외)';
   return null;
  }
  const old=BigInt(item.price),next=(old*BigInt(10000+bp)+5000n)/10000n;
  if(next===old){preview.textContent='가격 변동이 1G보다 작아 반영되지 않습니다.';return null;}
  if((market.value==='stock'&&(next<100n||next>100000000n))||(market.value==='coin'&&(next<100n||next>1000000000000n))){
   preview.textContent='변경 후 가격이 종목 허용 한도를 벗어납니다.';return null;
  }
  preview.textContent=fmt(old)+' → '+fmt(next)+' ('+(bp>0?'+':'')+(bp/100).toFixed(2)+'%)';
  return {old,next,bp};
 }
 function showSelected(){
  const a=selected();
  el('ownerMarketCurrent').textContent=a?fmt(a.price):'—';
  const change=el('ownerMarketChange');
  change.textContent=a?((a.changeBp>0?'+':'')+(a.changeBp/100).toFixed(2)+'%'):'—';
  change.className=a?.changeBp>0?'om-rise':a?.changeBp<0?'om-fall':'';
  el('ownerMarketVolatility').textContent=a?a.volatilityPct+'%':'—';
  if(a)vol.value=String(a.volatilityPct);
  priceBtn.disabled=!a||loading;
  volBtn.disabled=!a||loading;
  estimate();
 }
 function selectMarket(){
  const items=snapshot?.markets?.[market.value]||[];
  const previous=asset.value;
  asset.replaceChildren();
  for(const x of items){
   const option=txt('option',x.icon+' '+x.name+' ('+x.id+')');
   option.value=x.id;asset.append(option);
  }
  if(items.some(x=>x.id===previous))asset.value=previous;
  showSelected();
 }
 function showHistory(){
  history.replaceChildren();
  const events=snapshot?.history||[];
  if(!events.length){history.append(txt('div','아직 변경된 시세 기록이 없습니다.','om-event'));return;}
  for(const item of events.slice(0,14)){
   const row=txt('div','','om-event');
   const label=txt('div',item.type==='stock'?'📊 주식':'🪙 코인');
   label.append(txt('b',' · '+(item.name||item.symbol)));
   const time=new Date(item.at);
   label.append(txt('small',(Number.isFinite(time.getTime())?time.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'')+' · 운영자 #'+item.actorId));
   const outcome=item.mode==='price'?
    fmt(item.previousPrice)+' → '+fmt(item.price):
    '변동폭 '+item.volatilityPct+'%';
   row.append(label,txt('strong',outcome));
   history.append(row);
  }
 }
 function draw(){
  selectMarket();showHistory();
 }
 async function load(){
  if(loading)return;
  loading=true;refresh.disabled=true;priceBtn.disabled=true;volBtn.disabled=true;
  status.textContent='가상 주식·코인 시세를 조회 중입니다…';
  try{
   const response=await fetch('/api/admin/market-control',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'운영자 시장 조회에 실패했습니다.');
   snapshot=result;draw();
   status.textContent='서버 기준 최신 시세를 불러왔습니다. 실제 시장이 아닌 준자랜드 가상 시세입니다.';
   const active=result.coinCampaign;
   if(active&&active.complete!==true)status.textContent+=' 일부 코인은 2시간 이벤트 진행 중 변경이 제한됩니다.';
  }catch(e){status.textContent='조회 실패: '+String(e.message||e).slice(0,180)}
  finally{loading=false;refresh.disabled=false;showSelected();}
 }
 function requestId(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  return 'operator_'+Date.now()+'_'+Math.random().toString(36).slice(2);
 }
 function clearPending(){pendingKey=null}
 async function apply(mode){
  if(loading)return;
  const a=selected();
  if(!a){status.textContent='종목을 먼저 불러와주세요.';return;}
  const info=mode==='price'?estimate():null;
  if(mode==='price'&&!info){status.textContent='적용할 변동률을 확인해주세요.';return;}
  const volatilityPct=Number(vol.value);
  const message=mode==='price'?
   '준자랜드 '+a.name+' 시세를 '+fmt(info.old)+'에서 '+fmt(info.next)+'로 변경할까요?\n모든 회원의 평가금액이 즉시 변동할 수 있습니다.':
   a.name+' 자동 변동폭을 '+volatilityPct+'%로 설정할까요?\n이후 정기 시세 변화부터 적용됩니다.';
  if(!window.confirm(message))return;
  loading=true;refresh.disabled=true;priceBtn.disabled=true;volBtn.disabled=true;
  status.textContent='서버에 변경 요청을 검증하고 기록하는 중입니다…';
  const body={
   type:market.value,symbol:a.id,mode,requestId:pendingKey||requestId(),
   expectedPrice:a.price,
   deltaPercent:String(input.value),
   volatilityPct
  };
  pendingKey=body.requestId;
  try{
   const response=await fetch('/api/admin/market-control',{
    method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)
   });
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'시세 변경이 거부됐습니다.');
   clearPending();snapshot=data.market;draw();
   status.textContent=(data.duplicate?'이미 처리된 요청: ':'서버 반영 완료: ')+a.name+' '+(mode==='price'?fmt(data.previousPrice)+' → '+fmt(data.price):'변동폭 '+data.volatilityPct+'%')+' · 기록 보관됨';
  }catch(e){status.textContent='반영 실패: '+String(e.message||e).slice(0,200)+' · 재시도 시 동일 요청번호 사용';}
  finally{loading=false;refresh.disabled=false;showSelected();}
 }
 market.addEventListener('change',()=>{clearPending();selectMarket()});
 asset.addEventListener('change',()=>{clearPending();showSelected()});
 input.addEventListener('input',()=>{clearPending();estimate()});
 vol.addEventListener('change',clearPending);
 refresh.addEventListener('click',()=>{clearPending();load()});
 priceBtn.addEventListener('click',()=>apply('price'));
 volBtn.addEventListener('click',()=>apply('volatility'));
 const admin=document.getElementById('view-admin');
 if(admin){
  const observer=new MutationObserver(()=>{if(admin.classList.contains('active')&&!snapshot&&!loading)load()});
  observer.observe(admin,{attributes:true,attributeFilter:['class']});
  if(admin.classList.contains('active'))load();
 }
 window.JunjaMarketOperator={refresh:load};
})();

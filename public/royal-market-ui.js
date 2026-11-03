'use strict';
/* MAISON JUNJA PRIVATE EXCHANGE · certified items only; server is price/ownership authority. */
(()=>{
 const root=document.getElementById('junjaRoyalMarketRoot');
 if(!root)return;
 const G=10n**16n,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=v=>{let n;try{n=BigInt(String(v??0))}catch{return '—'};const sign=n<0n?'−':'';if(n<0n)n=-n;for(const [u,d] of [['해',10n**20n],['경',G],['조',10n**12n],['억',10n**8n]]){if(n>=d){const q=n/d,r=n%d,dec=(r*100n/d).toString().padStart(2,'0').replace(/0+$/,'');return sign+q.toLocaleString('ko-KR')+(dec?'.'+dec:'')+u+' G'}}return sign+n.toLocaleString('ko-KR')+' G'};
 const gy=v=>{const n=BigInt(String(v??0)),a=n/G,b=(n%G)*100n/G;return a.toString()+(b?'.'+b.toString().padStart(2,'0').replace(/0+$/,''):'')};
 const toMoney=input=>{const value=String(input??'').trim().replaceAll(',','');if(!/^\d{1,10}(?:\.\d{1,2})?$/.test(value))throw Error('경 단위로 입력해줘. 예: 1 또는 2.5');const [main,frac='']=value.split('.');return String(BigInt(main)*G+BigInt(frac.padEnd(2,'0')||0)*G/100n)};
 const art=item=>window.JunjaRoyalObjects?.render(item,item?.name||item?.itemName||'로얄 명품')||
  '<img src="/art/royal/'+esc(/^[a-z-]+$/.test(item?.art||'')?item.art:'gem')+'.svg" alt="">';
 const endText=at=>{const d=Math.max(0,Number(at)-Date.now());if(!d)return '마감 · 정산 대기';const h=Math.floor(d/3600000),m=Math.floor(d%3600000/60000),sec=Math.floor(d%60000/1000);return h+'시간 '+String(m).padStart(2,'0')+'분 '+String(sec).padStart(2,'0')+'초'};
 let state=null,busy=false,selectedId='',error='',success='',lastUpdated=0;
 async function request(url,body){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  let data={};try{data=await response.json()}catch{}
  if(!response.ok)throw Error(data.error||'명품 거래에 실패했어.');
  return data;
 }
 const initials=piece=>piece?.certificate?.serial||'소장 증명 준비 중';
 function ownedCard(item){
  const picked=selectedId===item.id,selected=item.certificate||{};
  return '<button type="button" class="jrm-owned-piece '+(picked?'selected ':'')+(item.listed?'listed':'')+'" data-jrm-select="'+esc(item.id)+'">'+
   '<div class="jrm-owned-art">'+art(item)+'</div><div class="jrm-owned-copy"><small>'+esc(item.category==='jewel'?'HAUTE JOAILLERIE':item.category==='watch'?'HAUTE HORLOGERIE':'ROYAL MASTERPIECE')+'</small><strong>'+esc(item.name)+'</strong><span>'+esc(initials(item))+'</span></div>'+
   '<span class="jrm-owned-state">'+(item.listed?'경매 등록 중':picked?'선택됨':'선택')+'</span></button>';
 }
 function auctionCard(item){
  return '<article class="jrm-lot"><div class="jrm-lot-picture">'+art({...item,name:item.itemName})+'<span>VERIFIED · '+esc(item.serial)+'</span></div>'+
   '<div class="jrm-lot-content"><small>24H · LIVE AUCTION</small><h4>'+esc(item.itemName)+'</h4><p>출품자 <b>'+esc(item.sellerName)+'</b> · 최고 입찰 <b>'+esc(item.bidderName||'없음')+'</b></p>'+
   '<div class="jrm-lot-prices"><div><span>현재 입찰가</span><strong>'+fmt(item.currentBid||item.start)+'</strong></div><div><span>최소 다음 입찰</span><strong>'+fmt(item.minimumBid)+'</strong></div></div>'+
   '<div class="jrm-lot-time" data-jrm-expires="'+Number(item.expiresAt)+'">⌛ '+endText(item.expiresAt)+'</div>'+
   (item.mine
    ?'<button type="button" class="jrm-lot-action" '+(item.bidderName?'disabled':'data-jrm-cancel="'+esc(item.id)+'"')+'>'+(item.bidderName?'입찰 진행 중 · 취소 불가':'입찰 전 · 출품 취소')+'</button>'
    :item.alreadyOwned?'<span class="jrm-lot-unavailable">이미 소장한 상품이야</span>'
    :item.myBid?'<span class="jrm-lot-unavailable">♛ 현재 최고 입찰자 · 예치 중</span>'
    :'<div class="jrm-lot-bid"><label>입찰 금액 (경 G)<input inputmode="decimal" data-jrm-bid-input="'+esc(item.id)+'" value="'+gy(item.minimumBid)+'"></label><button type="button" data-jrm-bid="'+esc(item.id)+'">입찰하기</button></div>')+
   '</div></article>';
 }
 function render(){
  if(!state)return;
  const owned=state.owned||[],active=state.active||[];
  if(!owned.some(x=>x.id===selectedId))selectedId=owned[0]?.id||'';
  const selected=owned.find(x=>x.id===selectedId);
  const offer=selected?fmt(selected.bankOffer):'—';
  root.innerHTML=
   '<section class="jrm-exchange" aria-label="준자 명품 거래소">'+
    '<header class="jrm-hero"><div><small>MAISON JUNJA · PRIVATE EXCHANGE</small><h2>THE ROYAL <em>EXCHANGE</em></h2><p>소장 가치의 다음 이야기. 인증된 소유권만 거래되는 프라이빗 경매장.</p><span>♛ CERTIFIED OWNERSHIP · J-BANK · LIVE AUCTION</span></div><button type="button" data-jrm-refresh>시세 · 경매 새로고침 ↻</button></header>'+
    (error?'<p class="jrm-message error">'+esc(error)+'</p>':'')+(success?'<p class="jrm-message success">'+esc(success)+'</p>':'')+
    '<div class="jrm-info-strip"><span>경매 시간 <b>24시간</b></span><span>낙찰 판매 수수료 <b>8%</b></span><span>은행 즉시 매입 <b>정가의 75%</b></span><span>최소 입찰 상승 <b>5%</b></span></div>'+
    '<section class="jrm-owner-section"><div class="jrm-section-title"><small>01 / PRIVATE VAULT</small><h3>내 소장품 판매</h3><p>내 컬렉션에서 작품을 선택해 경매하거나 J-BANK에 즉시 매각할 수 있어.</p></div>'+
    (owned.length?'<div class="jrm-owned-grid">'+owned.map(ownedCard).join('')+'</div>'+
     (selected?'<div class="jrm-appraisal"><div class="jrm-appraisal-head"><span>SELECTED MASTERPIECE</span><strong>'+esc(selected.name)+'</strong><small>'+esc(initials(selected))+'</small></div>'+
      '<div class="jrm-appraisal-quote"><div><small>명품관 표시 가격</small><b>'+fmt(selected.retail)+'</b></div><div><small>J-BANK 확정 매입가</small><b>'+offer+'</b></div></div>'+
      '<div class="jrm-appraisal-actions">'+
      '<label>경매 시작가 (경 G)<input id="jrmOpeningPrice" inputmode="decimal" value="'+gy(selected.retail)+'" '+(selected.listed?'disabled':'')+'></label>'+
      '<button type="button" data-jrm-list="'+esc(selected.id)+'" '+(selected.listed?'disabled':'')+'>♛ 24시간 경매 등록</button>'+
      '<button type="button" class="jrm-bank-button" data-jrm-bank="'+esc(selected.id)+'" '+(selected.listed?'disabled':'')+'>🏦 J-BANK 즉시 매각</button>'+
      '</div><p class="jrm-appraisal-note">'+(selected.listed?'현재 경매에 등록 중이므로 은행 매각이 잠겨 있어.':'은행에 팔면 해당 소장품은 소멸하고 게임머니가 즉시 지급돼. 경매는 낙찰 시 8% 수수료를 제외하고 판매자에게 지급해.')+'</p></div>':'')
     :'<div class="jrm-empty">아직 소장한 명품이 없어. 로얄 명품관에서 첫 작품을 구매해봐.</div>')+
    '</section>'+
    '<section class="jrm-auction-section"><div class="jrm-section-title"><small>02 / LIVE EXCHANGE</small><h3>회원 간 실시간 경매</h3><p>최고 입찰금은 서버가 안전하게 보관하고, 더 높은 입찰이 들어오면 이전 입찰자에게 전액 돌려줘.</p></div>'+
    (active.length?'<div class="jrm-auctions">'+active.map(auctionCard).join('')+'</div>':'<div class="jrm-empty">아직 진행 중인 경매가 없어. 첫 번째 경매의 주인공이 되어봐.</div>')+
    '</section>'+
    '<section class="jrm-ledger-section"><small>03 / PROVENANCE REGISTER</small><h3>최근 거래 완료 내역</h3>'+
    (state.history?.length?'<div class="jrm-history">'+state.history.slice(0,10).map(x=>'<div><span>'+esc(x.itemName)+'</span><small>'+esc(x.status==='SOLD'?'낙찰 · '+x.winnerName:x.status==='CANCELLED'?'출품 취소':x.status==='EXPIRED'?'입찰 없이 종료':'거래 취소')+'</small><b>'+fmt(x.finalPrice||x.currentBid||x.start)+'</b></div>').join('')+'</div>':'<p>아직 종료된 경매가 없어.</p>')+'</section>'+
    '<p class="jrm-caveat">이 경매장과 J-BANK는 준자랜드 안에서만 유효한 가상 게임머니 거래소야. 실제 명품·실물 소유권·현금으로 교환할 수 없어.</p>'+
   '</section>';
 }
 async function load(){
  if(busy)return;
  busy=true;
  try{state=await request('/api/royal-market');error='';render();lastUpdated=Date.now()}
  catch(e){error=e.message;if(!state)root.innerHTML='<div class="jrm-empty">로얄 경매장 정보를 불러오지 못했어. '+esc(e.message)+' <button data-jrm-refresh>재시도</button></div>';else render()}
  finally{busy=false}
 }
 async function act(path,body,goodMessage){
  if(busy)return;
  busy=true;error='';success='';
  try{
   const data=await request('/api/royal-market/'+path,body);
   if(data.user)document.dispatchEvent(new CustomEvent('jbank:wallet-change',{detail:{user:data.user}}));
   success=goodMessage(data);
   state=await request('/api/royal-market');
   render();
   document.dispatchEvent(new Event('junja:royal-market-update'));
  }catch(e){error=e.message;render()}finally{busy=false}
 }
 root.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-jrm-refresh'))return load();
  if(button.dataset.jrmSelect){selectedId=button.dataset.jrmSelect;render();return}
  if(button.dataset.jrmList){
   try{
    const start=toMoney(root.querySelector('#jrmOpeningPrice')?.value);
    if(!confirm('이 명품을 '+fmt(start)+'부터 24시간 경매에 등록할까?\n낙찰 시 판매액의 8%는 수수료로 소멸해.'))return;
    return act('auction/list',{itemId:button.dataset.jrmList,start},d=>'경매 등록 완료! 24시간 동안 회원들이 입찰할 수 있어.');
   }catch(err){error=err.message;render();return}
  }
  if(button.dataset.jrmBank){
   const item=state?.owned?.find(x=>x.id===button.dataset.jrmBank);if(!item)return;
   if(!confirm(item.name+'을 J-BANK에 '+fmt(item.bankOffer)+'로 매각할까?\n소장품과 소유권 증명서는 현재 보유 목록에서 사라져. 이 거래는 되돌릴 수 없어.'))return;
   return act('bank/sell',{itemId:item.id},d=>item.name+' 은행 매각 완료 · +'+fmt(d.received));
  }
  if(button.dataset.jrmBid){
   try{
    const id=button.dataset.jrmBid,amount=toMoney(root.querySelector('[data-jrm-bid-input="'+id+'"]')?.value),lot=state?.active?.find(x=>x.id===id);
    if(!lot||BigInt(amount)<BigInt(lot.minimumBid))throw Error('최소 입찰가 '+fmt(lot?.minimumBid)+' 이상을 입력해줘.');
    if(!confirm(lot.itemName+' 경매에 '+fmt(amount)+'를 입찰할까?\n즉시 게임머니가 예치되며 낙찰 또는 상위 입찰 시 정산돼.'))return;
    return act('auction/bid',{lotId:id,amount},d=>'입찰 성공! 게임머니 '+fmt(amount)+'이 예치됐어.');
   }catch(err){error=err.message;render();return}
  }
  if(button.dataset.jrmCancel){
   if(!confirm('입찰이 아직 없는 경매를 취소할까?'))return;
   return act('auction/cancel',{lotId:button.dataset.jrmCancel},d=>'경매를 취소했어. 소장품은 그대로 보관돼.');
  }
 });
 function openFor(id){
  selectedId=String(id||'');success='';
  const view=document.querySelector('#view-shop');
  if(!view?.classList.contains('active'))document.querySelector('#view-gallery [data-go="shop"]')?.click();
  const wings=document.getElementById('junjaShopWingNav');
  const palace=wings?.querySelector('[data-shop-wing="palace"]');if(view?.classList.contains('store-mode'))palace?.click();
  void load();
  setTimeout(()=>root.scrollIntoView({behavior:'smooth',block:'start'}),350);
 }
 setInterval(()=>{
  if(!root.closest('.view.active'))return;
  root.querySelectorAll('[data-jrm-expires]').forEach(el=>{el.textContent='⌛ '+endText(Number(el.dataset.jrmExpires))});
  if(lastUpdated&&Date.now()-lastUpdated>=45000&&!busy)void load();
 },1000);
 const shopView=document.getElementById('view-shop');
 if(shopView){
  let active=shopView.classList.contains('active');
  if(active)void load();
  new MutationObserver(()=>{const v=shopView.classList.contains('active');if(v&&!active)void load();active=v}).observe(shopView,{attributes:true,attributeFilter:['class']});
 }
 window.JunjaRoyalMarket=Object.freeze({load,openFor});
})();

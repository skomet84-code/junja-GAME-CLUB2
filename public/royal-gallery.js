'use strict';
/* JUNJA PRIVATE MUSEUM: independent illustrated owner and visitor showrooms.
 * Existing authenticated royal inventory + server-validated three-slot showcase.
 * Never calculate or move wallet amounts in browser.
 */
(()=>{
 const host=document.getElementById('junjaRoyalGalleryRoot');
 const view=document.getElementById('view-gallery');
 if(!host||!view)return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=value=>{
   let n;try{n=BigInt(String(value??0))}catch{return '—'}
   const neg=n<0n?'−':'';if(n<0n)n=-n;
   for(const [unit,step] of [['해',10n**20n],['경',10n**16n],['조',10n**12n],['억',10n**8n]]){
     if(n>=step){const q=n/step,r=n%step,dp=(r*100n/step).toString().padStart(2,'0').replace(/0+$/,'');return neg+q.toLocaleString('ko-KR')+(dp?'.'+dp:'')+unit+' G'}
   }
   return neg+n.toLocaleString('ko-KR')+' G';
 };
 const asDate=n=>{if(!n)return '기록 없음';const d=new Date(Number(n));return Number.isFinite(d.getTime())?d.toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):'기록 없음'};
 const media=window.JunjaRoyalMedia;
 const iconFor=item=>media?.picture(item)||('/art/royal/'+String(item?.art||'crown')+'.svg');
 const realPhoto=item=>!!media?.isPhoto(item);
 const cinematicScene=item=>media?.scene(item)||'/art/royal/cinematic/jewelry-showroom.webp';
 const imageTag=(item,alt='',eager=false)=>'<img src="'+esc(iconFor(item))+'" alt="'+esc(alt)+'" loading="'+(eager?'eager':'lazy')+'" decoding="async" referrerpolicy="no-referrer"'+
   (realPhoto(item)?' data-junja-photo="1" data-photo-fallback="'+esc(media.fallback(item))+'" data-photo-remote="'+esc(media.remote(item))+'"':'')+'>';
 const credit=item=>!realPhoto(item)?'':
  '<div class="jrg-photo-credit">실차 참고 사진 · <a href="'+esc(media.sourceUrl(item))+'" target="_blank" rel="noopener noreferrer">'+esc(item.photoBy||'Wikimedia Commons')+'</a> · <a href="'+esc(media.licenseUrl(item))+'" target="_blank" rel="noopener noreferrer">'+esc(item.photoLicense||'라이선스')+'</a><p>게임 내 한정판은 가상 모델이며 사진 속 실제 차량과 사양이 다를 수 있습니다.</p></div>';
 const categoryName={
  car:'슈퍼카 · 하이퍼카',watch:'하이엔드 워치',yacht:'프라이빗 요트',jet:'황실 전용기',
  art:'로얄 예술품',estate:'럭셔리 에스테이트',vault:'프라이빗 금고',
  title:'황실 칭호',frame:'전설의 장식',costume:'왕실 의상',pet:'신화 수호수'
 };
 const isPanorama=i=>['car','jet','yacht'].includes(i?.category);
 let state=null,visitor=null,loading=false,busy=false,focusId='',filter='all',sortMode='featured',certificateId='',loadToken=0;
 const isOwner=()=>!visitor;
 const selectedIds=()=>Array.isArray(state?.collector?.showcase)?state.collector.showcase.map(x=>x.id):[];
 const allOwned=()=>Array.isArray(state?.items)?state.items.filter(x=>x&&x.owned):[];
 const safeId=id=>String(id||'').replace(/[^a-z0-9_]/gi,'');
 const pill=item=>item?.stock!=null?'LIMITED EDITION · '+item.stock+'점 한정':String(item?.rarity||'exclusive').toUpperCase()+' · EXCLUSIVE';
 const isDisplayed=id=>selectedIds().includes(id);
 async function request(url,options){
   const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
   let data={};try{data=await res.json()}catch{}
   if(!res.ok)throw Error(data.error||'전시관 정보를 불러오지 못했어.');
   return data;
 }
 function stageSlot(item,where,index){
   const side=where==='center'?'center':'side';
   const chosen=item?item.id===focusId:false;
   const className='jrg-object jrg-object-'+where+' '+side+(item?' occupied':' unoccupied')+(item&&isPanorama(item)?' jrg-wide-piece':'')+(item&&realPhoto(item)?' jrg-real-photo':'')+(chosen?' chosen':'');
   const content=item
     ?'<span class="jrg-piece-glow" aria-hidden="true"></span>'+imageTag(item,item.name+' 소장 사진',true)+'<span class="jrg-piece-frame"><strong>'+esc(item.name)+'</strong><small>'+(where==='center'?'SIGNATURE MASTERPIECE':'ROYAL COLLECTION')+'</small></span>'
     :'<span class="jrg-vacant-mark" aria-hidden="true">♛</span><span class="jrg-piece-frame"><strong>전시 대기</strong><small>EMPTY PEDESTAL</small></span>';
   return '<button type="button" class="'+className+'" '+(item?'data-jrg-focus="'+esc(item.id)+'"':'data-jrg-empty="1"')+' aria-label="'+(item?esc(item.name)+' 작품 상세 보기':'비어 있는 전시대')+'">'+content+'</button>';
 }

 const roomFor=item=>({
  car:'motors',yacht:'fleet',jet:'fleet',watch:'jewels',frame:'jewels',
  art:'relics',estate:'relics',vault:'relics',title:'heritage',costume:'heritage',pet:'heritage'
 })[item?.category]||'heritage';
 const grade=item=>({
  sovereign:'IMPERIAL · 초월 소장품',mythic:'MYTHIC · 신화 소장품',
  prestige:'PRESTIGE · 명예 소장품'
 })[item?.rarity]||'EXCLUSIVE · 로얄 소장품';
 const serial=item=>item?.collectionNo!=null?'№ '+String(item.collectionNo).padStart(3,'0'):'№ —';
 const acquired=item=>asDate(item?.inscription?.purchasedAt||item?.acquiredAt);
 const filtersFor=item=>filter==='all'||
  filter==='room-'+roomFor(item)||
  filter===item.category||
  filter.startsWith('brand-')&&item.brand===filter.slice(6)||
  filter==='displayed'&&isDisplayed(item.id);
 const sortOwned=items=>items.slice().sort((a,b)=>{
  if(sortMode==='recent')return Number(b.inscription?.purchasedAt||b.acquiredAt||0)-Number(a.inscription?.purchasedAt||a.acquiredAt||0);
  if(sortMode==='rarity'){
    const rank={sovereign:3,mythic:2,prestige:1};
    return (rank[b.rarity]||0)-(rank[a.rarity]||0);
  }
  const ia=selectedIds().indexOf(a.id),ib=selectedIds().indexOf(b.id);
  if(ia>=0||ib>=0)return (ia<0?99:ia)-(ib<0?99:ib);
  return Number(b.inscription?.purchasedAt||b.acquiredAt||0)-Number(a.inscription?.purchasedAt||a.acquiredAt||0);
 });
 function card(item){
   const displayed=isDisplayed(item.id),primary=selectedIds()[0]===item.id;
   const selected=focusId===item.id;
   const status=primary?'♛ 대표 전시품':displayed?'✦ 전시 중':'◆ 소장 보관 중';
   return '<article class="jrg-vault-piece '+(selected?'active ':'')+(primary?'signature ':'')+(realPhoto(item)?'photo-piece ':'')+'jrg-grade-'+esc(item.rarity||'prestige')+'">'+
    '<div class="jrg-vault-piece-top"><span>JUNJA · PRIVATE COLLECTION</span><strong>'+esc(serial(item))+'</strong></div>'+
    '<button type="button" class="jrg-vault-art" data-jrg-focus="'+esc(item.id)+'" aria-label="'+esc(item.name)+' 소장품 상세 보기">'+
      '<span class="jrg-vault-image-backdrop jrg-cinematic-card-backdrop" style="background-image:linear-gradient(0deg,rgba(9,5,18,.76),rgba(9,5,18,.2)),url('+esc(cinematicScene(item))+')"></span>'+imageTag(item,item.name+' 컬렉션 소장품')+
      '<span class="jrg-vault-art-engrave">'+esc(item.brand?item.brand.toUpperCase():categoryName[item.category]||'ROYAL COLLECTION')+'</span>'+
    '</button>'+
    '<div class="jrg-vault-piece-foot"><div class="jrg-vault-grade"><span>'+esc(grade(item))+'</span><small>'+esc(status)+'</small></div>'+
      '<h3>'+esc(item.name)+'</h3>'+
      '<div class="jrg-vault-provenance"><span>등록 소유주 <b>'+esc(state?.nickname||'컬렉터')+'</b></span><span>획득 '+acquired(item)+'</span></div>'+
      '<button type="button" class="jrg-vault-certificate-btn" data-jrg-certificate="'+esc(item.id)+'">♛ 내 소장 증서 열기 <span>↗</span></button>'+
    '</div></article>';
 }
 function certificate(item){
  if(!item)return '';
  const paid=item.inscription?.paid!=null?money(item.inscription.paid):'구매가 기록 없음';
  const mark=item.stock!=null?'서버 한정 발행 · '+item.stock+'점':'준자랜드 영구 소장품';
  return '<dialog class="jrg-certificate-overlay" aria-label="소장 증서 보기">'+
   '<section class="jrg-certificate-dialog" role="dialog" aria-modal="true" aria-label="'+esc(item.name)+' 게임 내 소장 증서">'+
    '<button class="jrg-cert-close" type="button" data-jrg-dismiss="1" aria-label="소장 증서 닫기">✕</button>'+
    '<div class="jrg-cert-crest">♛</div><small>JUNJA LAND · PRIVATE OWNERSHIP RECORD</small>'+
    '<h2>CERTIFICATE<br><em>OF COLLECTION</em></h2>'+
    '<div class="jrg-cert-picture jrg-cinematic-certificate" style="--jrg-cinema-image:url('+esc(cinematicScene(item))+')">'+imageTag(item,item.name+' 사진')+'</div>'+
    '<span class="jrg-cert-rarity">'+esc(grade(item))+'</span>'+
    '<h3>'+esc(item.name)+'</h3>'+
    '<div class="jrg-cert-facts">'+
      '<div><span>소장 등록번호</span><strong>'+esc(serial(item))+'</strong></div>'+
      '<div><span>등록 소유자</span><strong>'+esc(state?.nickname||'로얄 컬렉터')+'</strong></div>'+
      '<div><span>최초 획득일</span><strong>'+acquired(item)+'</strong></div>'+
      '<div><span>구매 당시 금액</span><strong>'+paid+'</strong></div>'+
      '<div><span>컬렉션 등급</span><strong>'+esc(grade(item))+'</strong></div>'+
      '<div><span>전시 상태</span><strong>'+(selectedIds()[0]===item.id?'대표 전시':isDisplayed(item.id)?'전시 중':'보관 중')+'</strong></div>'+
    '</div>'+
    '<p class="jrg-cert-fineprint">'+esc(mark)+' · 해당 번호는 소유자의 개인 수집 순번이며 제조사 차량 번호나 전 서버 희귀번호를 의미하지 않습니다. 게임 안에서만 유효한 가상 소장 증서입니다.</p>'+
    credit(item)+
    '<button type="button" class="jrg-cert-done" data-jrg-dismiss="1">소장 증서 닫기</button>'+
   '</section></dialog>';
 }
 function render(){
   if(!state)return;
   const own=isOwner(),owner=esc(state.nickname||'로얄 컬렉터');
   const collector=state.collector||{},items=allOwned();
   const showcase=Array.isArray(collector.showcase)?collector.showcase:[];
   const shown=showcase.map(ref=>items.find(x=>x.id===ref.id)||ref).filter(Boolean);
   const selected=items.find(x=>x.id===focusId)||shown[0]||items[0]||null;
   const filtered=sortOwned(items.filter(filtersFor));
   const left=shown[1]||null,center=shown[0]||null,right=shown[2]||null;
   const rooms=Array.isArray(collector.rooms)?collector.rooms:[];
   const brandSets=Array.isArray(collector.brandSets)?collector.brandSets:[];
   const badges='<span>✦ OWNER VERIFIED IN-GAME</span><span>♛ PRIVATE COLLECTION</span><span>◆ PERMANENTLY OWNED</span>';
   const portfolioValue=money(collector.ownedCatalogValue||'0');
   const tally=Number(collector.totalItems||40);
   const roomPalette={motors:'🏎',fleet:'✈',jewels:'◆',relics:'♛',heritage:'✦'};
   const roomCards=rooms.map(room=>{
     const progress=room.total?Math.min(100,Math.round(room.owned/room.total*100)):0;
     return '<button type="button" data-jrg-filter="room-'+esc(room.id)+'" class="jrg-room '+(filter==='room-'+room.id?'active':'')+' '+(room.owned?'has-collection':'')+'">'+
       '<span class="jrg-room-symbol">'+(roomPalette[room.id]||'◆')+'</span>'+
       '<span class="jrg-room-info"><small>'+esc(room.name)+'</small><strong>'+esc(room.label)+'</strong>'+
       '<em>'+room.owned+' / '+room.total+' COLLECTION</em></span>'+
       '<span class="jrg-room-progress"><span style="width:'+progress+'%"></span></span>'+
      '</button>';
   }).join('');
   host.innerHTML='<div class="jrg-museum-shell">'+
    '<div class="jrg-entry jrg-entry-v8"><div class="jrg-entry-left"><small>JUNJA LAND · PRIVATE COLLECTION</small><h1><span>♛</span> '+(own?'나의 로얄 컬렉션':owner+'의 로얄 컬렉션')+'</h1><p>구매 기록이 아닌, 내가 쌓아 올린 왕실의 유산.</p></div><div class="jrg-entry-crest" aria-hidden="true"><span>J</span><small>EST. MMXXVI</small></div></div>'+
    '<section class="jrg-collector-passport"><div class="jrg-passport-profile"><div class="jrg-passport-seal">♛</div><div><small>THE PRIVATE COLLECTOR</small><h2>'+owner+'</h2><span>'+esc(collector.tierIcon||'◇')+' '+esc(collector.tier||'NEW COLLECTOR')+'</span></div></div>'+
     '<div class="jrg-passport-stats"><div><small>MY COLLECTION</small><strong>'+items.length+' <em>/ '+tally+'</em></strong><span>영구 소장 작품</span></div><div><small>EXHIBITED</small><strong>'+shown.length+' <em>/ 3</em></strong><span>현재 전시 중</span></div><div><small>CATALOG VALUE</small><strong>'+portfolioValue+'</strong><span>보유 작품의 현재 표시가격 합계</span></div></div>'+
     '<div class="jrg-passport-note">♛ JUNJA REGISTERED COLLECTION · 게임 내 가상 수집품 / 현금 및 실물 교환 불가</div></section>'+
    '<section class="jrg-hall '+(isPanorama(center)?'jrg-grand-garage':'')+'" aria-label="대표 컬렉션 황실 전시실">'+
     '<div class="jrg-hall-heading"><span>THE GRAND PRIVATE SHOWROOM</span><span>✦ THE LEGACY OF '+owner+' ✦</span></div>'+
     '<div class="jrg-stage jrg-cinematic-stage" style="--jrg-cinema-image:url('+esc(cinematicScene(selected||center))+')">'+stageSlot(left,'left',1)+stageSlot(center,'center',0)+stageSlot(right,'right',2)+
      '<div class="jrg-stage-inscription">JUNJA<br><span>PRIVATE COLLECTION</span></div></div>'+
     '<div class="jrg-hall-foot"><span>♛ '+owner+' · '+esc(collector.tier||'NEW COLLECTOR')+'</span><span>'+shown.length+' / 3 PRIVATE EXHIBITS</span></div></section>'+
    '<div class="jrg-relic-promises">'+badges+'</div>'+
    (!items.length?
     '<section class="jrg-empty-state"><div class="jrg-empty-crown">♛</div><h2>나만의 컬렉션을 시작해봐</h2><p>아직 구매한 로얄 명품이 없어. 첫 작품을 소장하면 이 궁전과 소장 증서에 네 이름이 새겨져.</p>'+(own?'<button type="button" data-go="shop">첫 로얄 컬렉션 만나기</button>':'')+'</section>':
     '<section class="jrg-selected-panel '+(realPhoto(selected)?'jrg-photo-detail':'')+'" aria-label="대표 소장품 상세">'+
      '<div class="jrg-selected-image jrg-cinematic-selected" style="--jrg-cinema-image:url('+esc(cinematicScene(selected))+')"><span>PRIVATE COLLECTION · '+esc(serial(selected))+'</span>'+imageTag(selected,selected.name+' 소장품 사진',true)+'</div>'+
      '<div class="jrg-selected-info"><small>OWNER REGISTERED · ROYAL COLLECTION</small>'+
       '<h2>'+esc(selected.name)+'</h2><span class="jrg-selected-rarity">'+esc(grade(selected))+'</span>'+
       '<p>'+esc(selected.desc||'영구 소장하는 준자랜드 로얄 컬렉션')+'</p>'+
       '<div class="jrg-certificate"><div><small>소유주</small><b>'+owner+'</b></div><div><small>개인 소장번호</small><b>'+esc(serial(selected))+'</b></div><div><small>획득 날짜</small><b>'+acquired(selected)+'</b></div></div>'+
       '<div class="jrg-selected-actions"><button type="button" class="jrg-primary-btn" data-jrg-certificate="'+esc(selected.id)+'">♛ 소장 증서 보기</button>'+
       (own?
        (selectedIds()[0]===selected.id?'<span class="jrg-current-primary">대표 전시 중</span>':'<button type="button" class="jrg-outline-btn" data-jrg-primary="'+esc(selected.id)+'">대표 컬렉션 지정</button>')+
        (isDisplayed(selected.id)?'<button type="button" class="jrg-outline-btn" data-jrg-remove="'+esc(selected.id)+'">전시관에서 보관실로</button>':'<button type="button" class="jrg-outline-btn" data-jrg-pin="'+esc(selected.id)+'">전시실에 올리기</button>')+
        (selected.displayOnly?'<span class="jrg-exhibit-only">◆ 영구 소장 · 전시 전용</span>':selected.equipped?'<span class="jrg-equipped">✓ 현재 장착</span>':'<button type="button" class="jrg-outline-btn" data-jrg-equip="'+esc(selected.id)+'">꾸미기 아이템 장착</button>')
       :'<p class="jrg-readonly">소유주의 작품을 감상하고 있어. 전시 변경은 소유주만 가능해.</p>')+'</div>'+
       credit(selected)+
      '</div></section>')+
    '<section class="jrg-vault" id="jrgInventory"><div class="jrg-vault-header"><div><small>THE PERSONAL COLLECTION VAULT</small><h2>나의 소장 보관실</h2><p>이곳의 모든 작품은 '+owner+'의 실제 게임 내 소장 기록이야.</p></div><strong>'+items.length+' PIECES OWNED</strong></div>'+
     '<div class="jrg-room-grid">'+roomCards+'</div>'+
     (brandSets.some(x=>x.owned>0)?'<div class="jrg-brand-heritage"><div><small>COMPLETE THE LEGEND</small><h3>브랜드 컬렉션 완성도</h3></div><div>'+brandSets.map(x=>'<div class="jrg-brand-progress"><span>'+esc(x.brand.toUpperCase())+'</span><b>'+x.owned+' / '+x.total+'</b><div><i style="width:'+Math.min(100,Math.round(x.owned/Math.max(1,x.total)*100))+'%"></i></div></div>').join('')+'</div></div>':'')+
     '<div class="jrg-vault-toolbar"><nav class="jrg-vault-tabs" aria-label="소장품 필터"><button type="button" data-jrg-filter="all" class="'+(filter==='all'?'active':'')+'">전체 소장품</button><button type="button" data-jrg-filter="displayed" class="'+(filter==='displayed'?'active':'')+'">전시 중</button><button type="button" data-jrg-filter="brand-rolls-royce" class="'+(filter==='brand-rolls-royce'?'active':'')+'">롤스로이스</button><button type="button" data-jrg-filter="brand-bentley" class="'+(filter==='brand-bentley'?'active':'')+'">벤틀리</button><button type="button" data-jrg-filter="brand-aston-martin" class="'+(filter==='brand-aston-martin'?'active':'')+'">애스턴마틴</button></nav>'+
      '<div class="jrg-vault-sort"><span>정렬</span><button type="button" data-jrg-sort="featured" class="'+(sortMode==='featured'?'active':'')+'">대표 우선</button><button type="button" data-jrg-sort="recent" class="'+(sortMode==='recent'?'active':'')+'">최근 획득</button><button type="button" data-jrg-sort="rarity" class="'+(sortMode==='rarity'?'active':'')+'">희귀도</button></div></div>'+
     '<div class="jrg-vault-grid '+(filtered.length<=3?'jrg-vault-sparse':'')+'">'+(filtered.length?filtered.map(card).join(''):'<div class="jrg-inventory-empty">이 전시 구역에 소장한 작품이 아직 없어. 다른 전시실을 선택해봐.</div>')+'</div>'+
     '<div class="jrg-vault-foot"><span>♛ THE JUNJA PRIVATE LEGACY · VIRTUAL COLLECTOR REGISTER</span>'+(own?'<button type="button" data-go="shop">명품관 입장</button>':'<button type="button" data-go="lobby">로비로 돌아가기</button>')+'</div>'+
    '</section></div>'+
    certificate(items.find(x=>x.id===certificateId));
   host.querySelectorAll('button[data-jrg-focus]').forEach(b=>{if(b.dataset.jrgFocus===focusId)b.setAttribute('aria-current','true')});
   const dialog=host.querySelector('.jrg-certificate-overlay');
   if(dialog&&typeof dialog.showModal==='function'){
     dialog.addEventListener('cancel',event=>{event.preventDefault();certificateId='';render()},{once:true});
     dialog.showModal();
   }
 }
 async function load(){
   const reqToken=++loadToken;
   const heading=view.querySelector('.jrg-view-head h2');
   if(heading)heading.textContent=visitor?'♛ '+visitor+'의 로얄 전시관':'♛ 내 전시관';
   loading=true;
   host.innerHTML='<div class="jrg-loading"><span>♛</span><h2>나만의 로얄 전시실을 여는 중</h2><p>JUNJA PRIVATE MUSEUM</p></div>';
   try{
     const data=await request(visitor?'/api/royal-economy/gallery?nickname='+encodeURIComponent(visitor):'/api/royal-economy');
     if(reqToken!==loadToken)return;
     state=data;
     const items=allOwned();
     if(!items.some(x=>x.id===focusId))focusId=data.collector?.showcase?.[0]?.id||items[0]?.id||'';
     render();
   }catch(e){
     if(reqToken===loadToken)host.innerHTML='<div class="jrg-load-error">전시관을 열지 못했어. '+esc(e.message)+' <button type="button" data-jrg-retry="1">다시 불러오기</button></div>';
   }finally{if(reqToken===loadToken)loading=false}
 }
 function scrollInventory(){host.querySelector('#jrgInventory')?.scrollIntoView({behavior:'smooth',block:'start'})}
 async function updateShowcase(action,id){
   if(!isOwner()||busy||!state)return;
   const item=allOwned().find(x=>x.id===id);
   if(!item)return;
   let next=selectedIds();
   if(action==='remove')next=next.filter(x=>x!==id);
   else if(action==='pin'){
     if(next.includes(id))return;
     if(next.length>=3){alert('전시대는 최대 3개야. 기존 작품을 먼저 내려줘.');return;}
     next.push(id);
   }else if(action==='primary'){
     if(!next.includes(id)&&next.length>=3&&!confirm('전시대가 가득 찼어. 마지막 작품을 내리고 이 작품을 대표로 전시할까?'))return;
     next=[id,...next.filter(x=>x!==id)].slice(0,3);
   }
   busy=true;
   try{
     const data=await request('/api/royal-economy/showcase',{
       method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selectedIds:next})
     });
     state.collector=data.collector;focusId=id;render();
   }catch(e){alert(e.message);await load()}finally{busy=false}
 }
 async function equip(id){
   if(!isOwner()||busy||!state)return;
   const item=allOwned().find(x=>x.id===id);
   if(!item||item.equipped||item.displayOnly)return;
   busy=true;
   try{
     const data=await request('/api/shop/equip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:item.category,itemId:id})});
     if(data.user)document.dispatchEvent(new CustomEvent('jbank:wallet-change',{detail:{user:data.user}}));
     await load();focusId=id;render();
   }catch(e){alert(e.message)}finally{busy=false}
 }
 host.addEventListener('click',event=>{
   const b=event.target.closest('button');if(!b)return;
   if(b.hasAttribute('data-jrg-dismiss')){certificateId='';render();return;}
   if(b.dataset.jrgCertificate){certificateId=b.dataset.jrgCertificate;render();host.querySelector('.jrg-cert-close')?.focus();return;}
   if(b.dataset.jrgSort){sortMode=b.dataset.jrgSort;render();return;}
   if(b.dataset.jrgFocus){focusId=b.dataset.jrgFocus;render();host.querySelector('.jrg-selected-panel')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
   if(b.dataset.jrgEmpty){scrollInventory();return;}
   if(b.dataset.jrgFilter){filter=b.dataset.jrgFilter;render();return;}
   if(b.dataset.jrgPrimary){updateShowcase('primary',b.dataset.jrgPrimary);return;}
   if(b.dataset.jrgPin){updateShowcase('pin',b.dataset.jrgPin);return;}
   if(b.dataset.jrgRemove){updateShowcase('remove',b.dataset.jrgRemove);return;}
   if(b.dataset.jrgEquip){equip(b.dataset.jrgEquip);return;}
   if(b.hasAttribute('data-jrg-retry'))load();
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&certificateId&&view.classList.contains('active')){certificateId='';render();}});
 host.addEventListener('click',event=>{if(event.target?.dataset?.jrgDismiss){certificateId='';render();}});
 // Visiting a friend's palace is read-only; ordinary "내 전시관" buttons return to the owner's palace.
 document.addEventListener('click',event=>{
   const b=event.target?.closest?.('[data-go="gallery"]');if(!b)return;
   visitor=b.dataset.visitRoyal||null;
   focusId='';filter='all';sortMode='featured';certificateId='';
   const sheet=document.getElementById('profileSheet');if(sheet)sheet.classList.add('hidden');
 },true);
 let wasActive=view.classList.contains('active');
 new MutationObserver(()=>{
   const nowActive=view.classList.contains('active');
   if(nowActive&&!wasActive){state=null;load()}
   wasActive=nowActive;
 }).observe(view,{attributes:true,attributeFilter:['class']});
 if(wasActive)load();
 window.JunjaRoyalGallery={reload:load,reset(){visitor=null;state=null;focusId=''},getVisitor(){return visitor}};
})();

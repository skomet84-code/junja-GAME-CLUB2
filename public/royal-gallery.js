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
 const imageTag=(item,alt='',eager=false)=>'<img src="'+esc(iconFor(item))+'" alt="'+esc(alt)+'" loading="'+(eager?'eager':'lazy')+'" decoding="async" referrerpolicy="no-referrer"'+
   (realPhoto(item)?' data-junja-photo="1" data-photo-fallback="'+esc(media.fallback(item))+'"':'')+'>';
 const credit=item=>!realPhoto(item)?'':
  '<div class="jrg-photo-credit">실차 참고 사진 · <a href="'+esc(media.sourceUrl(item))+'" target="_blank" rel="noopener noreferrer">'+esc(item.photoBy||'Wikimedia Commons')+'</a> · <a href="'+esc(media.licenseUrl(item))+'" target="_blank" rel="noopener noreferrer">'+esc(item.photoLicense||'라이선스')+'</a><p>게임 내 한정판은 가상 모델이며 사진 속 실제 차량과 사양이 다를 수 있습니다.</p></div>';
 const categoryName={
  car:'슈퍼카 · 하이퍼카',watch:'하이엔드 워치',yacht:'프라이빗 요트',jet:'황실 전용기',
  art:'로얄 예술품',estate:'럭셔리 에스테이트',vault:'프라이빗 금고',
  title:'황실 칭호',frame:'전설의 장식',costume:'왕실 의상',pet:'신화 수호수'
 };
 const isPanorama=i=>['car','jet','yacht'].includes(i?.category);
 let state=null,visitor=null,loading=false,busy=false,focusId='',filter='all',loadToken=0;
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
 function card(item){
   const displayed=isDisplayed(item.id),primary=selectedIds()[0]===item.id;
   const active=focusId===item.id;
   return '<article class="jrg-collection-card '+(active?'active ':'')+(displayed?'on-show':'')+'">'+
     '<button type="button" class="jrg-card-art '+(realPhoto(item)?'jrg-real-photo':'')+'" data-jrg-focus="'+esc(item.id)+'" aria-label="'+esc(item.name)+' 자세히 보기">'+imageTag(item,item.name)+'<span class="jrg-card-number">'+(item.stock!=null?'LIMITED · '+item.stock+'PCS':item.brand?'REAL MODEL REFERENCE':'JUNJA AUTHENTIC')+'</span></button>'+
     '<div class="jrg-card-info"><small>'+esc(item.brand?item.brand.toUpperCase():(categoryName[item.category]||'ROYAL ARTIFACT'))+'</small><h3>'+esc(item.name)+'</h3><span>'+money(item.inscription?.paid||item.price)+'</span>'+
     '<div class="jrg-card-state">'+(primary?'♛ 대표 전시':displayed?'✦ 전시 중':'◇ 소장 완료')+(item.equipped?' · 착용 중':'')+'</div></div>'+
     '<div class="jrg-card-buttons"><button type="button" data-jrg-focus="'+esc(item.id)+'">작품 감상</button>'+
     (isOwner()?(primary?'<button class="jrg-action-quiet" disabled>대표 작품</button>':'<button class="jrg-action-gold" type="button" data-jrg-primary="'+esc(item.id)+'">대표 전시</button>'):'')+
     '</div></article>';
 }
 function render(){
   if(!state)return;
   const own=isOwner(),owner=esc(state.nickname||'로얄 컬렉터');
   const collector=state.collector||{},items=allOwned(),showcase=Array.isArray(collector.showcase)?collector.showcase:[];
   const shown=showcase.map(ref=>items.find(x=>x.id===ref.id)||ref).filter(Boolean);
   const selected=items.find(x=>x.id===focusId)||shown[0]||items[0]||null;
   const filtered=filter==='all'?items:items.filter(x=>x.category===filter||(filter.startsWith('brand-')&&x.brand===filter.slice(6)));
   const badges='<span>✦ VERIFIED OWNERSHIP</span><span>♛ PRIVATE COLLECTION</span><span>◆ PERMANENT EXHIBITION</span>';
   const left=shown[1]||null,center=shown[0]||null,right=shown[2]||null;
   const empties=3-shown.length;
   host.innerHTML=
     '<div class="jrg-museum-shell">'+
      '<div class="jrg-entry"><div class="jrg-entry-left"><small>JUNJA LAND · ROYAL PRIVATE MUSEUM</small><h1><span>♛</span> '+(own?'내 전시관':owner+'의 전시관')+'</h1><p>소유한 명품이 전설이 되는 곳. 세상에 단 하나뿐인 나만의 왕실 갤러리.</p></div><div class="jrg-entry-crest" aria-hidden="true"><span>J</span><small>EST. MMXXVI</small></div></div>'+
      '<div class="jrg-owner-ribbon"><div class="jrg-owner-avatar">♛</div><div class="jrg-owner-name"><small>OWNER OF THE PRIVATE COLLECTION</small><strong>'+owner+'</strong><span>'+esc(collector.tierIcon||'◇')+' '+esc(collector.tier||'NEW COLLECTOR')+'</span></div>'+
       '<div class="jrg-stat-strip"><div><small>보유 작품</small><b>'+items.length+'<em> / '+Number(collector.totalItems||28)+'</em></b></div><div><small>전시 작품</small><b>'+shown.length+'<em> / 3</em></b></div><div><small>누적 컬렉션 가치</small><b class="jrg-spent">'+money(collector.spent)+'</b></div></div></div>'+
      '<section class="jrg-hall '+(isPanorama(center)?'jrg-grand-garage':'')+'" aria-label="궁전형 로얄 전시실">'+
       '<div class="jrg-hall-heading"><span>THE GRAND GALLERY · JUNJA ROYAL PALACE</span><span>✦ PRIVATE MOTORS & ART ✦</span></div>'+
       '<div class="jrg-stage">'+stageSlot(left,'left',1)+stageSlot(center,'center',0)+stageSlot(right,'right',2)+
         '<div class="jrg-stage-inscription">JUNJA<br><span>PRIVATE COLLECTION</span></div>'+
       '</div>'+
       '<div class="jrg-hall-foot"><span>♛ '+owner+' · '+esc(collector.tier||'NEW COLLECTOR')+'</span><span>'+shown.length+' ARTWORKS EXHIBITED</span></div>'+
      '</section>'+
      '<div class="jrg-relic-promises">'+badges+'</div>'+
      (!items.length?'<section class="jrg-empty-state"><div class="jrg-empty-crown">♛</div><h2>아직 비어 있는 나만의 궁전</h2><p>명품관에서 첫 작품을 구매하면 이 전시실에 진짜 소장품이 나타나. 구매한 작품은 영구 보관돼.</p>'+(own?'<button type="button" data-go="shop">♛ 첫 번째 작품 만나러 가기</button>':'')+'</section>':
       '<section class="jrg-selected-panel '+(realPhoto(selected)?'jrg-photo-detail':'')+'" aria-label="선택한 작품의 소장 증서"><div class="jrg-selected-image"><span>JUNJA · PRIVATE LUXURY COLLECTION</span>'+imageTag(selected,selected.name+' 실차 참고 사진',true)+'</div>'+
         '<div class="jrg-selected-info"><small>OFFICIAL ROYAL CERTIFICATE · AUTHENTIC</small><h2>'+esc(selected.name)+'</h2><span class="jrg-selected-rarity">'+esc(pill(selected))+'</span><p>'+esc(selected.desc||'왕실의 영원한 소장품')+'</p>'+
           '<div class="jrg-certificate"><div><small>소유주</small><b>'+owner+'</b></div><div><small>획득 날짜</small><b>'+asDate(selected.inscription?.purchasedAt)+'</b></div><div><small>소장 당시 구매가</small><b>'+money(selected.inscription?.paid||selected.price)+'</b></div></div>'+
           (own?'<div class="jrg-selected-actions">'+
             (selectedIds()[0]===selected.id?'<span class="jrg-current-primary">♛ 대표 작품으로 전시 중</span>':'<button type="button" class="jrg-primary-btn" data-jrg-primary="'+esc(selected.id)+'">♛ 대표 작품으로 전시</button>')+
             (isDisplayed(selected.id)?'<button type="button" class="jrg-outline-btn" data-jrg-remove="'+esc(selected.id)+'">전시에서 내리기</button>':'<button type="button" class="jrg-outline-btn" data-jrg-pin="'+esc(selected.id)+'">전시대에 올리기</button>')+
             (selected.displayOnly?'<span class="jrg-exhibit-only">◆ 전시 전용 소장품</span>':selected.equipped?'<span class="jrg-equipped">✓ 현재 장착 중</span>':'<button type="button" class="jrg-outline-btn" data-jrg-equip="'+esc(selected.id)+'">꾸미기 아이템 장착</button>')+
           '</div>':'<p class="jrg-readonly">방문자는 소장품을 감상할 수 있어. 전시는 소유주만 변경할 수 있어.</p>')+
           credit(selected)+
         '</div></section>')+
      '<section class="jrg-inventory" id="jrgInventory"><div class="jrg-inventory-header"><div><small>YOUR ACQUISITIONS · COLLECTION VAULT</small><h2>소유 작품 갤러리</h2><p>구매가 확인된 작품만 이곳에 전시돼. 나만의 대표 작품을 골라봐.</p></div><span class="jrg-inventory-count">'+items.length+' / '+Number(collector.totalItems||28)+' COLLECTED</span></div>'+
        '<nav class="jrg-filter-nav" aria-label="소장품 유형">'+[
          ['all','ALL'],['brand-rolls-royce','ROLLS-ROYCE'],['brand-bentley','BENTLEY'],['brand-aston-martin','ASTON MARTIN'],['car','🏎 슈퍼카'],['watch','⌚ 명품 시계'],['yacht','🛥 요트'],['jet','✈ 전용기'],['art','♛ 예술품'],['estate','럭셔리 부동산'],['vault','황실 금고'],['costume','왕실 의상'],['frame','왕실 장식'],['title','황실 칭호'],['pet','신화 수호수']
        ].map(([value,label])=>'<button type="button" data-jrg-filter="'+value+'" class="'+(filter===value?'active':'')+'">'+label+'</button>').join('')+'</nav>'+
        '<div class="jrg-inventory-grid">'+(filtered.length?filtered.map(card).join(''):'<div class="jrg-inventory-empty">이 카테고리에는 아직 소장한 작품이 없어.</div>')+'</div>'+
        '<div class="jrg-museum-footer"><span>♛ THE JUNJA PRIVATE LEGACY · EST. 2026</span>'+(own?'<button data-go="shop" type="button">명품관으로 돌아가기</button>':'<button data-go="lobby" type="button">로비로 돌아가기</button>')+'</div>'+
      '</section>'+
     '</div>';
   host.querySelectorAll('button').forEach(b=>{if(b.dataset.jrgFocus===focusId)b.setAttribute('aria-current','true')});
 }
 async function load(){
   const reqToken=++loadToken;
   const heading=view.querySelector('.jrg-view-head h2');
   if(heading)heading.textContent=visitor?'♛ '+visitor+'의 로얄 전시관':'♛ 내 로얄 전시관';
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
   if(b.dataset.jrgFocus){focusId=b.dataset.jrgFocus;render();host.querySelector('.jrg-selected-panel')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
   if(b.dataset.jrgEmpty){scrollInventory();return;}
   if(b.dataset.jrgFilter){filter=b.dataset.jrgFilter;render();return;}
   if(b.dataset.jrgPrimary){updateShowcase('primary',b.dataset.jrgPrimary);return;}
   if(b.dataset.jrgPin){updateShowcase('pin',b.dataset.jrgPin);return;}
   if(b.dataset.jrgRemove){updateShowcase('remove',b.dataset.jrgRemove);return;}
   if(b.dataset.jrgEquip){equip(b.dataset.jrgEquip);return;}
   if(b.hasAttribute('data-jrg-retry'))load();
 });
 // Visiting a friend's palace is read-only; ordinary "내 전시관" buttons return to the owner's palace.
 document.addEventListener('click',event=>{
   const b=event.target?.closest?.('[data-go="gallery"]');if(!b)return;
   visitor=b.dataset.visitRoyal||null;
   focusId='';filter='all';
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

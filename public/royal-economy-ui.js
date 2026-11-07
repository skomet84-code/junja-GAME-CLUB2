'use strict';
/* JUNJA ROYAL BOUTIQUE + owner-only economy center. No wallet arithmetic in browser. */
(()=>{
 const royal=document.getElementById('royalBoutiqueRoot'),economy=document.getElementById('economyCenterRoot');
 if(!royal&&!economy)return;
 const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=value=>{
   let n;try{n=BigInt(String(value??0))}catch{return '—'}
   const neg=n<0n?'−':'';if(n<0n)n=-n;
   if(n===0n)return '0 G';
   for(const [u,d] of [['해',10n**20n],['경',10n**16n],['조',10n**12n],['억',10n**8n]]){
     if(n>=d){const q=n/d,r=n%d;const decimal=(r*100n/d).toString().padStart(2,'0').replace(/0+$/,'');return neg+q.toLocaleString('ko-KR')+(decimal?'.'+decimal:'')+u+' G'}
   }
   return neg+n.toLocaleString('ko-KR')+' G';
 };
 async function get(url,options){
   const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
   let d={};try{d=await r.json()}catch{}
   if(!r.ok)throw Error(d.error||'요청을 완료하지 못했어.');
   return d;
 }

 const media=window.JunjaRoyalMedia;
 const showcaseArt=item=>media?.picture(item)||('/art/royal/'+String(item?.art||'crown')+'.svg');
 const isRealPhoto=item=>!!media?.isPhoto(item)&&!window.JunjaRoyalObjects;
 const sceneArt=item=>item?.category==='bag'?(window.JunjaRoyalObjects?.shot(item)?.src||'/art/royal/handbags/hermes-birkin.webp'):media?.scene(item)||'/art/royal/cinematic/jewelry-showroom.webp';
 // The COUTURE SALON entry uses a curated THREE-piece cover rather than
 // passing an ID-less bag into sceneArt(), which always fell back to Birkin.
 // Other hall artwork, product artwork and ownership views remain untouched.
 const roomCover=room=>room.id==='bag'
   ?'<span class="jrp-couture-entry-art" aria-hidden="true"><img src="/art/royal/couture-salon-entry-v16.webp" alt="" loading="lazy" decoding="async"></span>'
   :'<img src="'+safe(sceneArt({category:room.id}))+'" alt="" loading="lazy" decoding="async">';
 const cinematicRooms=[
 {id:'bag',english:'00 / COUTURE SALON',name:'에르메스 · 샤넬 명품백'},
 {id:'car',english:'01 / AUTOMOTIVE',name:'슈퍼카 · 명차'},
 {id:'watch',english:'02 / HAUTE HORLOGERIE',name:'하이엔드 시계'},
 {id:'jewel',english:'03 / HIGH JEWELLERY',name:'다이아몬드 · 하이주얼리'},
 {id:'yacht',english:'04 / PRIVATE MARINA',name:'프라이빗 요트'},
 {id:'jet',english:'05 / ROYAL AVIATION',name:'황실 전용기'},
 {id:'estate',english:'06 / SIGNATURE ESTATES',name:'초호화 부동산'}
 ];
 const photoTag=(item,alt='',eager=false)=>window.JunjaRoyalObjects?.render(item,alt)||'<img src="'+safe(showcaseArt(item))+'" alt="'+safe(alt)+'" loading="'+(eager?'eager':'lazy')+'">';
 const photoCredit=item=>!isRealPhoto(item)?'':
   '<span class="jrp-media-credit">실차 참고 사진 · <a href="'+safe(media.sourceUrl(item))+'" target="_blank" rel="noopener noreferrer">'+safe(item.photoBy||'Wikimedia Commons')+'</a> · <a href="'+safe(media.licenseUrl(item))+'" target="_blank" rel="noopener noreferrer">'+safe(item.photoLicense||'사진 이용 조건')+'</a></span>';
 const itemType=item=>({
  car:'SUPERCAR & GRAND TOURING',yacht:'PRIVATE YACHT',jet:'ROYAL AVIATION',watch:'HAUTE HORLOGERIE',bag:'HERITAGE HANDBAG COLLECTION',
  art:'ROYAL ART & SCULPTURE',estate:'PRIVATE REAL ESTATE',vault:'EXCLUSIVE ARTIFACT',
  jewel:'HIGH JEWELLERY · GEMSTONES'
 })[item.category]||'ROYAL COLLECTION';
 const showTime=time=>{try{return new Date(Number(time)).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}catch{return '—'}};
 let royalBusy=false,adminBusy=false,royalState=null,selectedId='bag_royalboutique_hermes_birkin',category='all',ownedOnly=false;
 const brands=[{id:'brand-rolls-royce',label:'ROLLS-ROYCE',sub:'영국 왕실의 품격'},{id:'brand-bentley',label:'BENTLEY',sub:'GRAND TOURING'},{id:'brand-aston-martin',label:'ASTON MARTIN',sub:'THE ART OF DRIVING'},{id:'brand-hermes',label:'HERMÈS',sub:'ROYAL HANDBAGS'},{id:'brand-chanel',label:'CHANEL',sub:'COUTURE COLLECTION'}];
 const filters=[{id:'all',label:'ALL · 전체'},{id:'bag',label:'👜 명품 가방'},{id:'car',label:'🏎 슈퍼카'},{id:'watch',label:'⌚ 워치'},{id:'jewel',label:'💎 하이주얼리'},{id:'yacht',label:'🛥 요트'},{id:'jet',label:'✈ 전용기'},{id:'art',label:'♛ 예술품'},{id:'estate',label:'◆ 부동산'},{id:'vault',label:'◈ 금고'}];
 const pill=item=>item.stock!=null?'<span class="jrp-rare-pill">♛ 한정 '+item.stock+'점 · 남은 재고 '+item.remaining+'점</span>':'<span class="jrp-rare-pill">'+safe(item.rarity.toUpperCase())+' EDITION</span>';
  const ownerLine=item=>'<div class="jrp-item-owners"><span>♛ 현재 등록 소유주</span><strong>'+((Array.isArray(item.owners)&&item.owners.length)?item.owners.map(safe).join(' · '):'아직 소유주 없음')+'</strong></div>';
 function renderRoyal(){
   if(!royal||!royalState)return;
   const all=royalState.items||[];
   const featured=all.find(i=>i.id===selectedId)||all[0];
   if(!featured)return;
   const tiles=all.filter(i=>(category==='all'||i.category===category||(category.startsWith('brand-')&&i.brand===category.slice(6)))&&(!ownedOnly||i.owned));
   const collector=royalState.collector||{tier:'NEW COLLECTOR',tierIcon:'◇',spent:'0',ownedCount:0,showcase:[],nextTier:'ROYAL',nextAt:'10000000000000000'};
   const showcase=Array.isArray(collector.showcase)?collector.showcase:[];
   const displayName=royalState.nickname||'ROYAL COLLECTOR';
   const pinButton=i=>!i.owned?'':showcase.some(s=>s.id===i.id)?'<button type="button" class="jrp-pin-action selected" data-jre-unpin="'+safe(i.id)+'">✦ 전시 중 · 해제</button>':'<button type="button" class="jrp-pin-action" data-jre-pin="'+safe(i.id)+'">♛ 프로필 전시</button>';
   const actionText=i=>i.owned?(i.displayOnly?'✓ 전시용 소장 중':i.equipped?'✓ 착용 중':'보유 상품 장착'):i.soldOut?'판매 완료':'영구 소장 구매';
   const actionAttr=i=>i.owned?(i.displayOnly||i.equipped?'disabled':'data-jre-equip="'+safe(i.id)+'"'):i.soldOut?'disabled':'data-jre-buy="'+safe(i.id)+'"';
   royal.innerHTML=
    '<div class="jrp-opening"><span>♛ JUNJA LAND</span><span>MAISON JUNJA · PRIVATE ROYAL BOUTIQUE</span></div>'+
    '<section class="jrp-motors-hero jrp-cinematic-hero" aria-label="준자랜드 로얄 컬렉터 쇼룸">'+
      '<div class="jrp-cinematic-panorama"><img src="/art/royal/cinematic/car-showroom.webp" alt="준자랜드 최고급 자동차 전시관" loading="eager" decoding="async"><div class="jrp-cinematic-panorama-caption"><small>JUNJA LAND · THE IMPERIAL COLLECTOR HOUSE</small><h1>MAISON <em>JUNJA</em></h1><p>소유하는 순간, 너만의 왕실 컬렉션이 시작된다.</p><span>고품질 시네마틱 3D 아트워크 · 1경 G부터</span></div></div>'+
      '<div class="jrp-motors-title jrp-cinematic-title"><small>EXPLORE THE COLLECTION</small><h2>THE SEVEN ROYAL HALLS</h2><p>일곱 전시실에서 원하는 명품을 선택하고 소장해봐.</p></div>'+
      '<div class="jrp-motors-photo-row jrp-cinematic-room-grid">'+cinematicRooms.map(room=>'<button type="button" class="jrp-cinematic-room '+(category===room.id?'active':'')+'" data-jre-filter="'+room.id+'" aria-label="'+safe(room.name)+' 쇼룸 보기">'+roomCover(room)+'<span class="jrp-cinematic-room-caption"><small>'+safe(room.english)+'</small><strong>'+safe(room.name)+'</strong></span></button>').join('')+'</div>'+
      '<div class="jrp-motors-bottom"><span>✧ ORIGINAL CINEMATIC ART · 가상 게임 컬렉션</span><button type="button" data-jrm-jump>🔨 로얄 경매장 · J-BANK 매각</button><button type="button" data-go="gallery">♛ 내 프라이빗 전시관 입장</button></div>'+
    '</section>'+
    (cinematicRooms.some(room=>room.id===category)?
       '<section class="jrp-hall-detail" id="jrpSelectedHall" aria-label="선택한 로얄 전시실">'+
        '<div class="jrp-hall-detail-head" style="--jrp-hall-img:url('+safe(sceneArt({category}))+')"><button type="button" data-jre-all="1">‹ 일곱 전시실</button><small>THE GRAND PRIVATE COLLECTION</small><h2>'+safe(cinematicRooms.find(r=>r.id===category).english)+'</h2><p>'+safe(cinematicRooms.find(r=>r.id===category).name)+'</p></div>'+
        '<div class="jrp-hall-product-grid">'+tiles.map(item=>'<article class="jrp-hall-product">'+photoTag(item,item.name)+'<small>'+safe(item.rarity.toUpperCase())+'</small><strong>'+safe(item.name)+'</strong>'+pill(item)+ownerLine(item)+'<b>'+fmt(item.price)+'</b><button type="button" '+actionAttr(item)+'>'+actionText(item)+'</button></article>').join('')+'</div></section>'
      :'')+
    '<section class="jrp-collector" aria-label="내 로얄 명품 프로필"><div class="jrp-collector-identity"><small>MY ROYAL PROFILE</small><div class="jrp-collector-name"><strong>'+safe(collector.tierIcon)+' '+safe(collector.tier)+'</strong><span>'+safe(displayName)+'</span></div><p>'+Number(collector.ownedCount||0)+'종 소장 · 누적 구매액 '+fmt(collector.spent)+'</p><div class="jrp-collector-links"><button type="button" data-jre-owned>'+ (ownedOnly?'전체 명품 보기':'✦ 내 컬렉션만 보기') +'</button><button type="button" data-go="gallery">♛ 내 전시관 입장</button><button type="button" data-jre-collection>간편 전시 설정 ↓</button></div></div><div class="jrp-collector-showcase" id="jrpMyShowcase"><div class="jrp-collection-topline">MY SHOWCASE <small>최대 3종 · 첫 번째가 대표 명품</small></div><div class="jrp-collector-slots">'+Array.from({length:3},(_,idx)=>{const x=showcase[idx];return '<div class="jrp-collector-slot '+(x?'filled':'empty')+'">'+(x?''+photoTag(x,x.name)+'<b>'+safe(x.name)+'</b>'+(idx>0?'<button class="jrp-set-primary" type="button" data-jre-primary="'+safe(x.id)+'">대표 설정</button>':'<small>★ 대표 명품</small>')+'<button type="button" data-jre-unpin="'+safe(x.id)+'" aria-label="'+safe(x.name)+' 전시 해제">×</button>':'<span>✧</span><small>전시 슬롯 '+(idx+1)+'</small>')+'</div>'}).join('')+'</div></div></section>'+
    '<section class="jrp-featured" aria-label="로얄 명품 특별 전시관">'+
      '<div class="jrp-featured-copy"><div class="jrp-label"><i></i> EXCLUSIVE ROYAL SHOWROOM</div>'+
        '<p class="jrp-serif">Wear the Legacy.</p>'+
        '<h2>소유하는 순간,<br><em>전설이 된다.</em></h2>'+
        '<p class="jrp-intro">MAISON JUNJA · 롤스로이스부터 하이엔드 아트까지, 소유자의 이름이 남는 프라이빗 컬렉션.</p>'+
        '<div class="jrp-featured-divider"></div><span class="jrp-featured-index">SIGNATURE OBJECT · NO. '+String(all.findIndex(x=>x.id===featured.id)+1).padStart(2,'0')+'</span>'+
        '<h3>'+safe(featured.name)+'</h3><p class="jrp-featured-desc">'+safe(featured.desc)+'</p>'+
        '<div class="jrp-featured-pills">'+pill(featured)+'<span class="jrp-outline-pill">정품 등록 · 소유 이력</span></div>'+ownerLine(featured)+
        '<div class="jrp-featured-foot"><div><small>EXCLUSIVE PRICE</small><strong>'+fmt(featured.price)+'</strong></div><button '+actionAttr(featured)+' type="button">'+actionText(featured)+'</button></div>'+
        '<div class="jrp-featured-pin">'+pinButton(featured)+'</div>'+
      '</div>'+
      '<div class="jrp-featured-art '+(isRealPhoto(featured)?'jrp-photo-real':'')+'"><div class="jrp-cinematic-feature-bg" style="background-image:url('+safe(sceneArt(featured))+')"></div><div class="jrp-art-arch"><div class="jrp-art-aura"></div>'+photoTag(featured,featured.name+' 실차 또는 명품 이미지',true)+'<div class="jrp-stage-plinth"></div></div>'+photoCredit(featured)+'<div class="jrp-art-caption"><span>JUNJA</span><b>ROYAL PALACE</b><small>EST. 2026</small></div></div>'+
    '</section>'+
    '<div class="jrp-promises"><span>✧ <b>SOULBOUND</b> 영구 소장</span><span>✦ <b>LIMITED</b> 실제 서버 재고</span><span>♛ <b>LEGACY</b> 소유주 기록</span></div>'+
    '<section class="jrp-editorial"><div class="jrp-editorial-title"><span>✦ NEW EXCLUSIVE ARRIVALS</span><h2>모두가 가질 수 없는 것들</h2><p>아래 시그니처 컬렉션부터 감상해봐. 가격은 전부 1경 이상이야.</p></div><div class="jrp-editorial-items">'+['bag_royalboutique_hermes_birkin','bag_royalboutique_chanel_classic','car_royalboutique_rr_phantom','jet_royalboutique_royal'].map(id=>{const o=all.find(x=>x.id===id);return o?'<button type="button" data-jre-feature="'+safe(o.id)+'">'+photoTag(o,o.name)+'<span>'+itemType(o)+'</span><b>'+safe(o.name)+'</b><small>'+fmt(o.price)+'</small></button>':''}).join('')+'</div></section>'+
    '<div class="jrp-gallery-head"><div><small>THE GRAND COLLECTION · '+all.length+' PIECES</small><h2>JUNJA PRIVATE LUXURY</h2><p>슈퍼카부터 제트까지. 진짜 보유할 작품을 골라봐.</p></div><button class="jrp-owned-toggle '+(ownedOnly?'selected':'')+'" data-jre-owned type="button">'+(ownedOnly?'✓ 내 소장품만 보는 중':'내 소장품만 보기')+'</button></div>'+
    '<nav class="jrp-brand-nav" aria-label="브랜드별 명품관"><button type="button" data-jre-filter="all" class="'+(category==='all'?'active':'')+'"><b>ALL COLLECTION</b><small>총 '+all.length+'작품</small></button>'+brands.map(f=>'<button type="button" class="'+(category===f.id?'active':'')+'" data-jre-filter="'+f.id+'"><b>'+f.label+'</b><small>'+f.sub+'</small></button>').join('')+'</nav>'+
    '<nav class="jrp-filters" aria-label="명품 카테고리">'+filters.map(f=>'<button type="button" class="'+(category===f.id?'selected':'')+'" data-jre-filter="'+f.id+'">'+f.label+'</button>').join('')+'</nav>'+
    '<div class="jrp-gallery">'+(tiles.map(item=>'<article class="jrp-tile '+(item.id===featured.id?'selected ':'')+(item.stock!=null?'limited ':'')+(item.owned?'owned':'')+'">'+
      '<button class="jrp-tile-preview '+(isRealPhoto(item)?'jrp-photo-real':'')+'" type="button" data-jre-select="'+safe(item.id)+'" aria-label="'+safe(item.name)+' 상세 전시 보기"><div class="jrp-tile-art jrp-cinematic-tile-art" style="background-image:linear-gradient(0deg,rgba(4,2,9,.88),rgba(4,2,9,.23)),url('+safe(sceneArt(item))+')">'+photoTag(item,item.name)+'</div><span class="jrp-tile-index">'+(item.brand?safe(item.brand.toUpperCase()):itemType(item))+'</span></button>'+
      '<div class="jrp-tile-meta"><div><small>'+(item.stock!=null?'NUMBERED EDITION · '+item.remaining+'/'+item.stock:'PERMANENT COLLECTION')+'</small><h3>'+safe(item.name)+'</h3>'+ownerLine(item)+'</div><b>'+fmt(item.price)+'</b></div>'+
      '<div class="jrp-tile-actions"><button type="button" data-jre-select="'+safe(item.id)+'">자세히 보기</button><button type="button" '+actionAttr(item)+'>'+actionText(item)+'</button>'+pinButton(item)+'</div>'+
    '</article>').join('')||'<div class="jrp-gallery-empty">해당 조건의 소장품이 없어.</div>')+'</div>'+
    '<section class="jrp-collection-tiers"><div class="jrp-tier-head"><small>EXCLUSIVE COLLECTION STATUS</small><h2>명품 컬렉터 등급</h2><p>신분과 별개로 명품 소비에 따라 올라가는 명예 등급</p></div><div class="jrp-tier-track">'+[{name:'ROYAL',at:'1경',icon:'♛'},{name:'EMPEROR',at:'10경',icon:'💎'},{name:'LEGEND',at:'100경',icon:'✦'},{name:'THE ABSOLUTE',at:'1,000경',icon:'♜'},{name:'GOD COLLECTOR',at:'1해',icon:'👑'}].map(t=>'<div class="jrp-tier-step '+(t.name===collector.tier?'current':'')+'"><span>'+t.icon+'</span><b>'+t.name+'</b><small>'+t.at+' G~</small></div>').join('')+'</div><p class="jrp-next-tier">'+(collector.nextTier?'다음 명예 등급 '+safe(collector.nextTier)+' · 누적 '+fmt(collector.nextAt)+' 달성':'최고 등급 GOD COLLECTOR 달성')+'</p></section>'+
    '<section class="jrp-social"><div class="jrp-social-heading"><small>02 / THE HALL OF FAME</small><h2>로얄 명예의 전당</h2><p>소유의 가치를 증명하는 이름들. 명품 소비 금액만으로 순위를 계산해.</p></div>'+
    '<div class="jrp-social-columns"><div class="jrp-rank">'+
     '<h3>♛ TOP COLLECTORS</h3>'+((royalState.ranking||[]).length?royalState.ranking.map(x=>'<div class="jrp-rank-row"><em>'+String(x.rank).padStart(2,'0')+'</em><button type="button" class="jrp-rank-visit" data-go="gallery" data-visit-royal="'+safe(x.nickname)+'">'+safe(x.nickname)+' · 전시관</button><b>'+fmt(x.spent)+'</b></div>').join(''):'<p>첫 로얄 컬렉터를 기다리는 중.</p>')+
    '</div><div class="jrp-news"><h3>✧ RECENT ACQUISITIONS</h3>'+((royalState.recent||[]).length?royalState.recent.map(x=>'<div class="jrp-news-row"><b>'+safe(x.nickname)+'</b><span>'+safe(x.itemName)+' 소장</span><small>'+showTime(x.purchasedAt)+'</small></div>').join(''):'<p>아직 구매 기록이 없어.</p>')+'</div></div></section>'+
    '<details class="jrp-all-photo-credits"><summary>실차 사진 촬영자 및 라이선스 확인 (Wikimedia Commons)</summary><div class="jrp-all-photo-list">'+all.filter(x=>isRealPhoto(x)).map(x=>'<p><b>'+safe(x.name)+'</b> · '+photoCredit(x)+'</p>').join('')+'</div></details>'+
    '<div class="jrp-disclaimer">게임 속 가상 컬렉션입니다. 실물 차량·현금으로 교환되지 않으며 차량 제조사와 제휴·후원 관계가 없습니다. 실차 이미지는 참고 사진으로, 게임 내 가상 특별 에디션의 실제 사양과 다를 수 있습니다. 사진 출처와 라이선스는 상품 상세에서 확인할 수 있습니다.</div>';
 }
 async function loadRoyal(){
   if(!royal||royalBusy)return;royalBusy=true;
   try{royalState=await get('/api/royal-economy');renderRoyal();}
   catch(e){royal.innerHTML='<div class="jrp-error">전시관을 불러오지 못했어. '+safe(e.message)+' <button data-jre-retry type="button">다시 불러오기</button></div>';}
   finally{royalBusy=false;}
 }
 function celebrate(item,inscription){
   const overlay=document.createElement('div');overlay.className='jrp-victory';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
   overlay.innerHTML='<div class="jrp-victory-card"><span class="jrp-victory-glow"></span><small>MAISON JUNJA · AUTHENTIC ACQUISITION</small><div class="jrp-victory-art"><img alt="" src="'+showcaseArt(item)+'"></div><h2>ROYAL ACQUIRED</h2><h3>'+safe(item.name)+'</h3><p>이 명품은 이제 너만의 역사야.</p><div class="jrp-victory-sign">소유주 · '+safe(inscription?.ownerNickname||'ROYAL COLLECTOR')+'<br>구매가 · '+fmt(inscription?.paid||item.price)+'</div><button class="jrp-victory-done" type="button">컬렉션 돌아가기</button></div>';
   function close(){overlay.remove();}
   overlay.querySelector('.jrp-victory-done').addEventListener('click',close);
   overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
   document.body.appendChild(overlay);overlay.querySelector('button')?.focus();
 }
 async function buy(id,button){
   if(button.disabled||!royalState)return;
   const item=royalState.items.find(x=>x.id===id);if(!item)return;
   const financing=royalState.financing||{};
    const wallet=BigInt(String(financing.wallet||'0')),price=BigInt(String(item.price||'0'));
    let loanPurchase=false;
    if(price>wallet){
      const shortage=price-wallet,minLoan=BigInt(String(financing.minLoan||'1000000'));
      const loanAmount=shortage>minLoan?shortage:minLoan;
      if(!financing.canBorrow||loanAmount>BigInt(String(financing.available||'0'))){
        alert('지갑 잔액이 부족하고 J-BANK 대출 한도로도 구매할 수 없어. 기존 대출·적금 또는 신분별 한도를 확인해줘.');return;
      }
      if(!confirm(item.name+' 구매에 부족한 게임머니는 '+fmt(shortage)+'야.\\nJ-BANK에서 '+fmt(loanAmount)+'를 대출받아 지금 구매할까?\\n원금 기준 하루 0.1% 단리 · 7일 이내 상환 의무 · 연체 시 자산 강제 매각 가능\\n[확인] 대출구매 / [취소] 구매하지 않음'))return;
      loanPurchase=true;
    }else if(!confirm(item.name+'을(를) '+fmt(item.price)+'에 구매할까?\\n결제 금액은 게임 내에서 소멸하고 소유권 증명서가 발급돼.'))return;
   const buttons=royal.querySelectorAll('[data-jre-buy]');
   buttons.forEach(x=>x.disabled=true);
   try{
     const d=await get('/api/royal-economy/buy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemId:id,loanPurchase})});
     document.dispatchEvent(new CustomEvent('jbank:wallet-change',{detail:{balance:d.balance,user:d.user}}));
     await loadRoyal();celebrate(d.item,d.inscription);
     if(typeof window.loadShop==='function')await window.loadShop();
   }catch(e){alert(e.message);await loadRoyal();}
 }
 async function equip(id,button){
   if(button.disabled||!royalState)return;
   const item=royalState.items.find(x=>x.id===id);if(!item||!item.owned)return;
   button.disabled=true;
   try{
     const d=await get('/api/shop/equip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:item.category,itemId:id})});
     if(d.user)document.dispatchEvent(new CustomEvent('jbank:wallet-change',{detail:{user:d.user}}));
     await loadRoyal();
     if(typeof window.loadShop==='function')await window.loadShop();
   }catch(e){alert(e.message);await loadRoyal();}
 }
 async function setPrimary(id){
   const current=(royalState?.collector?.showcase||[]).map(x=>x.id);
   if(!current.includes(id))return;
   try{
     const d=await get('/api/royal-economy/showcase',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selectedIds:[id,...current.filter(x=>x!==id)]})});
     royalState.collector=d.collector;renderRoyal();
   }catch(e){alert(e.message);await loadRoyal();}
 }
 async function pinItem(id,remove=false){
   if(!royalState)return;
   const current=(royalState.collector?.showcase||[]).map(x=>x.id);
   let next=remove?current.filter(x=>x!==id):[...current.filter(x=>x!==id),id];
   if(next.length>3){alert('전시는 최대 3개까지 가능해. 기존 전시품을 먼저 해제해줘.');return;}
   try{
     const d=await get('/api/royal-economy/showcase',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selectedIds:next})});
     royalState.collector=d.collector;renderRoyal();
   }catch(e){alert(e.message);await loadRoyal();}
 }
 async function loadEconomy(){
   if(!economy||adminBusy)return;adminBusy=true;
   try{
     const d=await get('/api/admin/economy');
     const info=[
       ['현금 지갑 합계',d.wallet],['은행 자유저축',d.savings],['은행 적금 납입',d.installments],
       ['주식 평가액',d.stocks],['코인 평가액',d.coins],['대출 잔액',d.outstandingDebt],
       ['총자산 평가액',d.grossAssets],['대출 차감 순자산',d.netAssets]
     ];
     const sub=[
       ['오늘 장부 유입',d.today.ledgerIn],['오늘 장부 유출',d.today.ledgerOut],
       ['오늘 장부 순증감',d.today.ledgerNet],['오늘 확인된 재화 소멸',d.today.confirmedBurned],
       ['로얄 명품 소멸',d.today.royalBurned],['기존 상점 소멸',d.today.shopBurned],['신분 상승 소멸',d.today.rankBurned]
     ];
     economy.innerHTML='<div class="jre-economy-head"><div><small>ECONOMY INTELLIGENCE · ADMIN ONLY</small><h2>준자랜드 경제관리센터</h2><p>회원 '+d.registered+'명 · 이용중지 '+d.disabled+'명 · '+safe(d.date)+' (KST) 기준</p></div><button type="button" id="jreEconomyReload">새로고침 ↻</button></div>'+
       '<h3 class="jre-economy-sub">전체 재화 · 자산 보유 현황</h3><div class="jre-economy-grid">'+info.map(([k,v])=>'<div class="jre-econ-stat"><small>'+safe(k)+'</small><b>'+fmt(v)+'</b></div>').join('')+'</div>'+
       '<h3 class="jre-economy-sub">오늘 유통 및 소멸 장부</h3><div class="jre-economy-grid">'+sub.map(([k,v])=>'<div class="jre-econ-stat"><small>'+safe(k)+'</small><b>'+fmt(v)+'</b></div>').join('')+'</div>'+
       '<div class="jre-econ-note">※ '+safe(d.note)+(d.assetsFailed?' · 일부 회원 '+d.assetsFailed+'명의 투자/은행 평가 조회 실패':'')+'</div>'+
       '<h3 class="jre-economy-sub">회원별 순자산 TOP 10 (게임머니 기준)</h3><div class="jre-econ-rank">'+d.topWealth.map((x,i)=>'<div><span>'+(i+1)+'위 · '+safe(x.nickname)+'</span><b>'+fmt(x.total)+'</b></div>').join('')+'</div>';
   }catch(e){economy.innerHTML='<div class="jre-error">경제 지표 조회 실패: '+safe(e.message)+'</div>'}
   finally{adminBusy=false;}
 }
 royal?.addEventListener('click',e=>{
   const b=e.target.closest('button');if(!b)return;
   if(b.hasAttribute('data-jrm-jump'))return window.JunjaRoyalMarket?.openFor('');
   if(b.dataset.jrePrimary)return setPrimary(b.dataset.jrePrimary);
   if(b.dataset.jrePin)return pinItem(b.dataset.jrePin);
   if(b.dataset.jreUnpin)return pinItem(b.dataset.jreUnpin,true);
   if(b.hasAttribute('data-jre-collection')){royal.querySelector('#jrpMyShowcase')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
   if(b.dataset.jreBuy)return buy(b.dataset.jreBuy,b);
   if(b.dataset.jreEquip)return equip(b.dataset.jreEquip,b);
   if(b.dataset.jreFeature){selectedId=b.dataset.jreFeature;renderRoyal();royal.querySelector('.jrp-featured')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
   if(b.dataset.jreSelect){selectedId=b.dataset.jreSelect;renderRoyal();royal.querySelector('.jrp-featured')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
   if(b.hasAttribute('data-jre-all')){category='all';renderRoyal();royal.querySelector('.jrp-cinematic-room-grid')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
   if(b.dataset.jreFilter){category=b.dataset.jreFilter;renderRoyal();royal.querySelector('#jrpSelectedHall')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
   if(b.hasAttribute('data-jre-owned')){ownedOnly=!ownedOnly;renderRoyal();return;}
   if(b.hasAttribute('data-jre-retry'))loadRoyal();
 });
 economy?.addEventListener('click',e=>{if(e.target.closest('#jreEconomyReload'))loadEconomy()});
 const shopView=document.getElementById('view-shop'),adminView=document.getElementById('view-admin');
 function observe(el,loader){
   if(!el)return;let active=el.classList.contains('active');
   if(active)loader();
   new MutationObserver(()=>{const next=el.classList.contains('active');if(next&&!active)loader();active=next}).observe(el,{attributes:true,attributeFilter:['class']});
 }
 observe(shopView,loadRoyal);observe(adminView,loadEconomy);
 const wings=document.getElementById('junjaShopWingNav');
 wings?.addEventListener('click',event=>{
   const btn=event.target.closest('[data-shop-wing]');if(!btn||!shopView)return;
   const showPalace=btn.dataset.shopWing==='palace';
   shopView.classList.toggle('palace-mode',showPalace);
   shopView.classList.toggle('store-mode',!showPalace);
   wings.querySelectorAll('[data-shop-wing]').forEach(x=>{x.classList.toggle('active',x===btn);x.setAttribute('aria-pressed',String(x===btn));});
   if(showPalace&&!royalState)loadRoyal();
   document.querySelector('#view-shop .view-head')?.scrollIntoView({behavior:'smooth',block:'start'});
 });
})();

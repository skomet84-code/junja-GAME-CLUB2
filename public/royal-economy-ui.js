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

 const showcaseArt=item=>{
   const key=String(item?.id||'');
   if(key.includes('phoenix'))return '/art/royal/phoenix.svg';
   if(key.includes('regalia')||key.includes('frame_royalboutique_royal'))return '/art/royal/regalia.svg';
   if(key.includes('entry'))return '/art/royal/scepter.svg';
   if(key.includes('dragon')||key.includes('immortal'))return '/art/royal/dragon.svg';
   if(key.includes('wings'))return '/art/royal/wings.svg';
   if(key.includes('diamond')||key.includes('frame_royalboutique'))return '/art/royal/gem.svg';
   return '/art/royal/crown.svg';
 };
 const itemType=item=>{
   if(item.id.includes('wings'))return 'CELESTIAL WINGS';
   if(item.category==='frame')return 'ROYAL GEMSTONE';
   if(item.category==='pet')return 'MYTHIC GUARDIAN';
   if(item.category==='title')return 'NOBLE INSIGNIA';
   return 'IMPERIAL CROWN';
 };
 const showTime=time=>{try{return new Date(Number(time)).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}catch{return '—'}};
 let royalBusy=false,adminBusy=false,royalState=null,selectedId='costume_royalboutique_phoenix',category='all',ownedOnly=false;
 const filters=[{id:'all',label:'전체 컬렉션'},{id:'costume',label:'왕실 의상'},{id:'frame',label:'보석 · 오라'},{id:'pet',label:'신화 수호수'},{id:'title',label:'황실 칭호'}];
 const pill=item=>item.stock!=null?'<span class="jrp-rare-pill">LIMITED '+item.stock+' · '+item.remaining+' LEFT</span>':'<span class="jrp-rare-pill">'+safe(item.rarity.toUpperCase())+' EDITION</span>';
 function renderRoyal(){
   if(!royal||!royalState)return;
   const all=royalState.items||[];
   const featured=all.find(i=>i.id===selectedId)||all[0];
   if(!featured)return;
   const tiles=all.filter(i=>(category==='all'||i.category===category)&&(!ownedOnly||i.owned));
   const collector=royalState.collector||{tier:'NEW COLLECTOR',tierIcon:'◇',spent:'0',ownedCount:0,showcase:[],nextTier:'ROYAL',nextAt:'100000000000000'};
   const showcase=Array.isArray(collector.showcase)?collector.showcase:[];
   const displayName=royalState.nickname||'ROYAL COLLECTOR';
   const pinButton=i=>!i.owned?'':showcase.some(s=>s.id===i.id)?'<button type="button" class="jrp-pin-action selected" data-jre-unpin="'+safe(i.id)+'">✦ 전시 중 · 해제</button>':'<button type="button" class="jrp-pin-action" data-jre-pin="'+safe(i.id)+'">♛ 프로필 전시</button>';
   const actionText=i=>i.owned?(i.equipped?'✓ 착용 중':'보유 상품 장착'):i.soldOut?'판매 완료':'컬렉션 소장하기';
   const actionAttr=i=>i.owned?(i.equipped?'disabled':'data-jre-equip="'+safe(i.id)+'"'):i.soldOut?'disabled':'data-jre-buy="'+safe(i.id)+'"';
   royal.innerHTML=
    '<div class="jrp-opening"><span>♛ JUNJA LAND</span><span>MAISON JUNJA · PRIVATE ROYAL BOUTIQUE</span></div>'+
    '<div class="jrp-palace-intro"><div class="jrp-palace-word"><small>DIAMOND & GOLD · LUXURY COLLECTION</small><h1>♛ 명품관</h1><p>당신의 컬렉션이 곧 당신의 품격입니다.</p></div><div class="jrp-palace-scene" aria-hidden="true"><span>✦</span><b>♛</b><span>✧</span></div></div>'+
    '<section class="jrp-collector" aria-label="내 로얄 명품 프로필"><div class="jrp-collector-identity"><small>MY ROYAL PROFILE</small><div class="jrp-collector-name"><strong>'+safe(collector.tierIcon)+' '+safe(collector.tier)+'</strong><span>'+safe(displayName)+'</span></div><p>'+Number(collector.ownedCount||0)+'종 소장 · 누적 구매액 '+fmt(collector.spent)+'</p><div class="jrp-collector-links"><button type="button" data-jre-owned>'+ (ownedOnly?'전체 명품 보기':'✦ 내 컬렉션만 보기') +'</button><button type="button" data-jre-collection>프로필 전시 설정 ↓</button></div></div><div class="jrp-collector-showcase" id="jrpMyShowcase"><div class="jrp-collection-topline">MY SHOWCASE <small>최대 3종 · 첫 번째가 대표 명품</small></div><div class="jrp-collector-slots">'+Array.from({length:3},(_,idx)=>{const x=showcase[idx];return '<div class="jrp-collector-slot '+(x?'filled':'empty')+'">'+(x?'<img alt="" src="'+showcaseArt(x)+'"><b>'+safe(x.name)+'</b><button type="button" data-jre-unpin="'+safe(x.id)+'" aria-label="'+safe(x.name)+' 전시 해제">×</button>':'<span>✧</span><small>전시 슬롯 '+(idx+1)+'</small>')+'</div>'}).join('')+'</div></div></section>'+
    '<section class="jrp-featured" aria-label="로얄 명품 특별 전시관">'+
      '<div class="jrp-featured-copy"><div class="jrp-label"><i></i> EXCLUSIVE ROYAL SHOWROOM</div>'+
        '<p class="jrp-serif">Wear the Legacy.</p>'+
        '<h2>소유하는 순간,<br><em>전설이 된다.</em></h2>'+
        '<p class="jrp-intro">JUNJA ROYAL PALACE · 왕관과 보석이 주인공이 되는 황실 전시장. 하나의 명품에 하나의 이름을 남겨봐.</p>'+
        '<div class="jrp-featured-divider"></div><span class="jrp-featured-index">SIGNATURE OBJECT · NO. '+String(all.findIndex(x=>x.id===featured.id)+1).padStart(2,'0')+'</span>'+
        '<h3>'+safe(featured.name)+'</h3><p class="jrp-featured-desc">'+safe(featured.desc)+'</p>'+
        '<div class="jrp-featured-pills">'+pill(featured)+'<span class="jrp-outline-pill">평생 소장 · 구매자 각인</span></div>'+
        '<div class="jrp-featured-foot"><div><small>EXCLUSIVE PRICE</small><strong>'+fmt(featured.price)+'</strong></div><button '+actionAttr(featured)+' type="button">'+actionText(featured)+'</button></div>'+
        '<div class="jrp-featured-pin">'+pinButton(featured)+'</div>'+
      '</div>'+
      '<div class="jrp-featured-art"><div class="jrp-art-arch"><div class="jrp-art-aura"></div><img src="'+showcaseArt(featured)+'" alt="'+safe(featured.name)+' 고급 일러스트"><div class="jrp-stage-plinth"></div></div><div class="jrp-art-caption"><span>JUNJA</span><b>ROYAL PALACE</b><small>EST. 2026</small></div></div>'+
    '</section>'+
    '<div class="jrp-promises"><span>✧ <b>SOULBOUND</b> 영구 소장</span><span>✦ <b>LIMITED</b> 실제 서버 재고</span><span>♛ <b>LEGACY</b> 소유주 기록</span></div>'+
    '<div class="jrp-gallery-head"><div><small>01 / THE COLLECTION</small><h2>갤러리에서 고르는 나만의 명품</h2><p>상품을 선택하면 위 메인 쇼케이스에서 상세 정보를 감상할 수 있어.</p></div><button class="jrp-owned-toggle '+(ownedOnly?'selected':'')+'" data-jre-owned type="button">'+(ownedOnly?'✓ 내 소장품만 보는 중':'내 소장품만 보기')+'</button></div>'+
    '<nav class="jrp-filters" aria-label="명품 카테고리">'+filters.map(f=>'<button type="button" class="'+(category===f.id?'selected':'')+'" data-jre-filter="'+f.id+'">'+f.label+'</button>').join('')+'</nav>'+
    '<div class="jrp-gallery">'+(tiles.map(item=>'<article class="jrp-tile '+(item.id===featured.id?'selected ':'')+(item.stock!=null?'limited ':'')+(item.owned?'owned':'')+'">'+
      '<button class="jrp-tile-preview" type="button" data-jre-select="'+safe(item.id)+'" aria-label="'+safe(item.name)+' 상세 전시 보기"><div class="jrp-tile-art"><img src="'+showcaseArt(item)+'" loading="lazy" alt=""></div><span class="jrp-tile-index">'+itemType(item)+'</span></button>'+
      '<div class="jrp-tile-meta"><div><small>'+(item.stock!=null?'NUMBERED EDITION · '+item.remaining+'/'+item.stock:'PERMANENT COLLECTION')+'</small><h3>'+safe(item.name)+'</h3></div><b>'+fmt(item.price)+'</b></div>'+
      '<div class="jrp-tile-actions"><button type="button" data-jre-select="'+safe(item.id)+'">자세히 보기</button><button type="button" '+actionAttr(item)+'>'+actionText(item)+'</button>'+pinButton(item)+'</div>'+
    '</article>').join('')||'<div class="jrp-gallery-empty">해당 조건의 소장품이 없어.</div>')+'</div>'+
    '<section class="jrp-collection-tiers"><div class="jrp-tier-head"><small>EXCLUSIVE COLLECTION STATUS</small><h2>명품 컬렉터 등급</h2><p>신분과 별개로 명품 소비에 따라 올라가는 명예 등급</p></div><div class="jrp-tier-track">'+[{name:'ROYAL',at:'100조',icon:'♛'},{name:'EMPEROR',at:'1경',icon:'💎'},{name:'LEGEND',at:'10경',icon:'✦'},{name:'THE ABSOLUTE',at:'100경',icon:'♜'},{name:'GOD COLLECTOR',at:'1,000경',icon:'👑'}].map(t=>'<div class="jrp-tier-step '+(t.name===collector.tier?'current':'')+'"><span>'+t.icon+'</span><b>'+t.name+'</b><small>'+t.at+' G~</small></div>').join('')+'</div><p class="jrp-next-tier">'+(collector.nextTier?'다음 명예 등급 '+safe(collector.nextTier)+' · 누적 '+fmt(collector.nextAt)+' 달성':'최고 등급 GOD COLLECTOR 달성')+'</p></section>'+
    '<section class="jrp-social"><div class="jrp-social-heading"><small>02 / THE HALL OF FAME</small><h2>로얄 명예의 전당</h2><p>소유의 가치를 증명하는 이름들. 명품 소비 금액만으로 순위를 계산해.</p></div>'+
    '<div class="jrp-social-columns"><div class="jrp-rank">'+
     '<h3>♛ TOP COLLECTORS</h3>'+((royalState.ranking||[]).length?royalState.ranking.map(x=>'<div class="jrp-rank-row"><em>'+String(x.rank).padStart(2,'0')+'</em><span>'+safe(x.nickname)+'</span><b>'+fmt(x.spent)+'</b></div>').join(''):'<p>첫 로얄 컬렉터를 기다리는 중.</p>')+
    '</div><div class="jrp-news"><h3>✧ RECENT ACQUISITIONS</h3>'+((royalState.recent||[]).length?royalState.recent.map(x=>'<div class="jrp-news-row"><b>'+safe(x.nickname)+'</b><span>'+safe(x.itemName)+' 소장</span><small>'+showTime(x.purchasedAt)+'</small></div>').join(''):'<p>아직 구매 기록이 없어.</p>')+'</div></div></section>'+
    '<div class="jrp-disclaimer">게임 내 가상 재화로만 거래됩니다. 현금 환급·실물 교환 불가. 명품은 외형 및 수집용으로 승률이나 현금 가치에 영향을 주지 않아.</div>';
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
   if(!confirm(item.name+'을(를) '+fmt(item.price)+'에 구매할까?\n결제 금액은 게임 내에서 소멸하며 이 상품은 영구 소장돼.'))return;
   const buttons=royal.querySelectorAll('[data-jre-buy]');
   buttons.forEach(x=>x.disabled=true);
   try{
     const d=await get('/api/royal-economy/buy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemId:id})});
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
   if(b.dataset.jrePin)return pinItem(b.dataset.jrePin);
   if(b.dataset.jreUnpin)return pinItem(b.dataset.jreUnpin,true);
   if(b.hasAttribute('data-jre-collection')){royal.querySelector('#jrpMyShowcase')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
   if(b.dataset.jreBuy)return buy(b.dataset.jreBuy,b);
   if(b.dataset.jreEquip)return equip(b.dataset.jreEquip,b);
   if(b.dataset.jreSelect){selectedId=b.dataset.jreSelect;renderRoyal();royal.querySelector('.jrp-featured')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
   if(b.dataset.jreFilter){category=b.dataset.jreFilter;renderRoyal();return;}
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

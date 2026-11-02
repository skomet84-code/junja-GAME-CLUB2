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
 const itemImage=i=>'<span class="jre-item-icon" aria-hidden="true">'+safe(i.icon)+'</span>';
 let royalBusy=false,adminBusy=false;
 async function loadRoyal(){
   if(!royal||royalBusy)return;royalBusy=true;
   try{
     const data=await get('/api/royal-economy');
     royal.innerHTML='<div class="jre-hero"><div><small>PRIVATE COLLECTION · WHITE / GOLD / PURPLE</small><h2>♛ JUNJA ROYAL BOUTIQUE</h2><p>부의 끝에는 이름이 남는다. 고가 명품을 영구 소장하고 프로필·게임 아바타에서 과시해봐.</p><em>아이템 구매금액 전액 소멸 · 재판매 불가 · 승률 영향 없음</em></div><span class="jre-emblem">♛</span></div>'+
       '<div class="jre-topline"><strong>ROYAL COLLECTION</strong><span>실시간 한정 수량 · 소유주 영구 각인</span></div>'+
       '<div class="jre-products">'+data.items.map(i=>{
         const sold=i.stock!=null&&i.remaining===0;
         return '<article class="jre-product '+(i.stock?'jre-limited ':'')+(i.owned?'jre-owned':'')+'">'+itemImage(i)+
           '<div class="jre-product-copy"><span class="jre-rarity">'+safe(i.rarity.toUpperCase())+(i.stock?' · LIMITED '+i.stock:'')+'</span><h3>'+safe(i.name)+'</h3><p>'+safe(i.desc)+'</p></div>'+
           '<b class="jre-price">'+fmt(i.price)+'</b>'+
           (i.inscription?'<p class="jre-inscription">각인 · '+safe(i.inscription.ownerNickname)+' · '+new Date(i.inscription.purchasedAt).toLocaleDateString('ko-KR')+'</p>':'')+
           (i.stock?'<small class="jre-stock">남은 수량 '+i.remaining+' / '+i.stock+'</small>':'')+
           '<button type="button" data-jre-buy="'+safe(i.id)+'" '+(i.owned||i.soldOut?'disabled':'')+'>'+
             (i.owned?'✓ 소장 완료':sold?'품절':'명품 구매하기')+'</button></article>'
       }).join('')+'</div>'+
       '<div class="jre-leaderboard"><div><small>ROYAL HALL OF FAME</small><h3>로얄 명품 구매 누적 랭킹</h3><p>닉네임은 현재 이름으로 표시 · 명품 소비 누적액만 집계</p></div><div class="jre-ranks">'+(data.ranking.length?data.ranking.map(x=>'<div><b>'+x.rank+'위</b><span>'+safe(x.nickname)+'</span><strong>'+fmt(x.spent)+'</strong></div>').join(''):'<p>아직 첫 구매자가 없어.</p>')+'</div></div>';
   }catch(e){royal.innerHTML='<div class="jre-error">명품관을 불러오지 못했어. '+safe(e.message)+' <button id="jreRetry" type="button">다시 불러오기</button></div>'}
   finally{royalBusy=false;}
 }
 async function buy(id,button){
   if(button.disabled)return;
   const name=button.closest('.jre-product')?.querySelector('h3')?.textContent||'이 아이템';
   if(!confirm(name+'을 구매할까?\n결제한 게임머니는 완전히 소멸하고 환불되지 않아.'))return;
   button.disabled=true;
   try{
     const d=await get('/api/royal-economy/buy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemId:id})});
     document.dispatchEvent(new CustomEvent('jbank:wallet-change',{detail:{balance:d.balance,user:d.user}}));
     await loadRoyal();
     if(typeof window.loadShop==='function')await window.loadShop();
     alert('구매 완료! '+name+'이(가) 자동 장착됐어.\n소유주 각인이 저장됐어.');
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
   const buyBtn=e.target.closest('[data-jre-buy]');if(buyBtn)return buy(buyBtn.dataset.jreBuy,buyBtn);
   if(e.target.closest('#jreRetry'))loadRoyal();
 });
 economy?.addEventListener('click',e=>{if(e.target.closest('#jreEconomyReload'))loadEconomy()});
 const shopView=document.getElementById('view-shop'),adminView=document.getElementById('view-admin');
 function observe(el,loader){
   if(!el)return;let active=el.classList.contains('active');
   if(active)loader();
   new MutationObserver(()=>{const next=el.classList.contains('active');if(next&&!active)loader();active=next}).observe(el,{attributes:true,attributeFilter:['class']});
 }
 observe(shopView,loadRoyal);observe(adminView,loadEconomy);
})();

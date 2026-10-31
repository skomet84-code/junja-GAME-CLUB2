(()=>{'use strict';
// Fictional J-STOCK UI. Prices, wallet checks, trades and portfolio are server-authoritative.
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{try{return BigInt(v??'0')}catch{return 0n}};
const fmt=v=>{let n=num(v),sign=n<0n?'-':'';if(n<0n)n=-n;
 let out='';for(const [label,unit] of [['경',10000000000000000n],['조',1000000000000n],['억',100000000n],['만',10000n]]){
 const piece=n/unit;if(piece){out+=piece.toLocaleString('ko-KR')+label+' ';n%=unit;}}
 return sign+(out.trim()+(n?' '+n.toLocaleString('ko-KR'):'')).trim()||'0';
};
const money=v=>fmt(v)+' G', profit=v=>{const n=num(v);return (n>0n?'+':'')+money(v)};
const cls=v=>num(v)>0n?'up':num(v)<0n?'down':'flat';
const qtyLimit=1000000000000000n;
let snapshot=null,active='A',busy=false,refreshing=false,lastRefreshAttempt=0,timer=null,refreshTimer=null,offset=0,lastQuantity='1',side='buy';
function mount(){
 if($('#jstockModal'))return;
 const modal=document.createElement('div');modal.id='jstockModal';modal.className='jstock-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','J-STOCK 증권 거래소');
 modal.innerHTML='<div class="jstock-panel"><header class="jstock-header"><div><small>JUNJA FINANCIAL DISTRICT</small><h2>📈 J-STOCK</h2><span>준자 가상 증권 거래소 · 게임머니 전용</span></div><button type="button" class="jstock-exit" data-jstock-close aria-label="닫기">×</button></header><div id="jstockBody">거래소 연결 중...</div><p id="jstockNotice" aria-live="polite"></p></div>';
 document.body.appendChild(modal);
 modal.addEventListener('click',e=>{
  if(e.target===modal||e.target.closest('[data-jstock-close]')){close();return;}
  if(e.target.closest('[data-jstock-back]')){close();window.JBank?.open();return;}
  const stock=e.target.closest('[data-jstock-select]');if(stock){active=stock.dataset.jstockSelect;lastQuantity='1';render();return;}
  const choice=e.target.closest('[data-jstock-side]');if(choice){side=choice.dataset.jstockSide;render();return;}
  const preset=e.target.closest('[data-jstock-qty]');if(preset){lastQuantity=preset.dataset.jstockQty==='max'?String(maxQty()):preset.dataset.jstockQty;const input=$('#jstockQuantity');if(input)input.value=lastQuantity;estimate();return;}
  if(e.target.closest('[data-jstock-refresh]')){refresh(true);return;}
  if(e.target.closest('[data-jstock-submit]'))trade();
 });
 modal.addEventListener('input',e=>{if(e.target.id==='jstockQuantity'){e.target.value=e.target.value.replace(/[^0-9]/g,'');lastQuantity=e.target.value;estimate();}});
 document.addEventListener('click',e=>{if(e.target.closest('#jbankMarketOpen'))open();});
}
async function api(path,options){const r=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},cache:'no-store',...options});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'거래소 요청 실패');return d;}
function alertText(text,error=false){const el=$('#jstockNotice');if(el){el.textContent=text;el.className=error?'jstock-error':'jstock-success';}}
function maxQty(){
 if(!snapshot)return 0n;const s=snapshot.stocks.find(s=>s.id===active);if(!s)return 0n;
 if(side==='sell')return num(snapshot.holdings.find(x=>x.id===active)?.quantity||'0');
 const unit=num(s.price);const n=(num(snapshot.wallet)*10000n)/(unit*10050n);
 return n>qtyLimit?qtyLimit:n;
}
function trend(series){
 const vals=Array.isArray(series)?series.map(Number).filter(Number.isFinite):[];
 if(!vals.length)return '';
 const min=Math.min(...vals),max=Math.max(...vals),span=Math.max(1,max-min);
 const points=vals.map((v,i)=>((i*120)/Math.max(1,vals.length-1)).toFixed(1)+','+(32-((v-min)/span)*29).toFixed(1)).join(' ');
 return '<svg class="jstock-spark" viewBox="0 0 120 35" preserveAspectRatio="none" aria-hidden="true"><polyline points="'+points+'"/></svg>';
}
function clock(){
 if(!snapshot)return;
 const el=$('#jstockClock');if(!el)return;
 const remain=Math.max(0,Math.ceil((snapshot.nextTickAt-(Date.now()+offset))/1000));
 const hh=String(Math.floor(remain/3600)).padStart(2,'0'),mm=String(Math.floor(remain%3600/60)).padStart(2,'0'),ss=String(remain%60).padStart(2,'0');
 const next=new Date(snapshot.nextTickAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 el.textContent='다음 변동 '+next+' KST · '+hh+':'+mm+':'+ss+' 남음';
 if(remain===0&&!busy)refresh(false);
}
function render(){
 if(!snapshot||!$('#jstockBody'))return;
 const s=snapshot.stocks.find(x=>x.id===active)||snapshot.stocks[0];active=s.id;
 const h=snapshot.holdings.find(x=>x.id===active)||{quantity:'0',cost:'0',value:'0',unrealized:'0'};
 const owned=num(h.quantity),average=owned?num(h.cost)/owned:0n,unitDifference=num(s.price)-average;
 const quoteTime=snapshot.referenceFetchedAt?new Date(snapshot.referenceFetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):null;
 const referenceNotice=snapshot.pricingModel==='kospi-inspired'
  ?(quoteTime?'📍 실제 코스피 종목 등락 참고 · 조회 '+esc(quoteTime)+' KST':'📍 코스피 변동폭 방식 · 참고 시세 연결 확인 중 (가상 변동 적용)')
  :'실제 증권과 별개인 가상 거래소';
 const tradeRows=(snapshot.trades||[]).slice(0,6).map(t=>{
  const item=snapshot.stocks.find(s=>s.id===t.stockId);
  return '<div class="jstock-transaction"><span>'+esc(item?.name||t.stockId)+' <b>'+ (t.side==='buy'?'매수':'매도')+'</b></span><span>'+fmt(t.quantity)+'주 · '+money(t.gross)+'</span></div>';
 }).join('')||'<p class="jstock-empty">아직 거래 기록이 없어.</p>';
 $('#jstockBody').innerHTML='<div class="jstock-market-info"><span class="jstock-live">● LIVE SIMULATION</span><strong id="jstockClock">다음 시세 변동</strong><button type="button" data-jstock-refresh>↻ 새로고침</button></div>'+
 '<p class="jstock-disclaimer" style="margin:4px 0 9px">'
 +referenceNotice+' · 실제 종목과 동일한 수익률을 보장하지 않습니다. 주말은 게임 자체 시세로 변동합니다.</p>'+
 '<div class="jstock-stats"><div><small>지갑 잔액</small><b>'+money(snapshot.wallet)+'</b></div><div><small>보유 주식 평가액</small><b>'+money(snapshot.marketValue)+'</b></div><div><small>평가손익</small><b class="'+cls(snapshot.unrealized)+'">'+profit(snapshot.unrealized)+'</b></div><div><small>누적 실현손익</small><b class="'+cls(snapshot.realized)+'">'+profit(snapshot.realized)+'</b></div></div>'+
 '<h3>상장기업 <small>총 '+snapshot.stocks.length+'종 · 하루 4회(00·06·12·18시 KST) 변동 · 실제 코스피 업종 참고</small></h3><div class="jstock-list">'+snapshot.stocks.map(x=>{
  const sign=x.changeBp>0?'+':'',percent=(x.changeBp/100).toFixed(2),direction=x.changeBp>0?'up':x.changeBp<0?'down':'flat';
  const holding=snapshot.holdings.find(h=>h.id===x.id)||{quantity:'0',unrealized:'0'};
  return '<button type="button" class="jstock-item '+(x.id===active?'selected':'')+'" data-jstock-select="'+esc(x.id)+'" aria-pressed="'+(x.id===active)+'"><span class="jstock-icon">'+x.icon+'</span><span class="jstock-name"><b>'+esc(x.id)+' · '+esc(x.name)+'</b><small>'+esc(x.sector)+'</small>'+(x.reference?'<small class="jstock-peer">실제 '+esc(x.reference.name)+' '+(x.reference.changeBp>=0?'+':'')+(x.reference.changeBp/100).toFixed(2)+'% '+(x.reference.fresh?'참고 중':'최근 장마감')+'</small>':'')+'</span>'+trend(x.history)+'<span class="jstock-value"><b>'+money(x.price)+'</b><small class="'+direction+'">'+sign+percent+'%</small><small class="jstock-owned">보유 '+fmt(holding.quantity)+'주</small><small class="'+cls(holding.unrealized)+'">'+profit(holding.unrealized)+'</small></span></button>';
 }).join('')+'</div>'+
 '<section class="jstock-portfolio"><h3>📊 내 보유 주식 · 매입가 대비 차액</h3><div class="jstock-portfolio-scroll"><table><thead><tr><th>종목</th><th>보유 주식</th><th>매입금액</th><th>현재 평가금액</th><th>차액(수익·손실)</th></tr></thead><tbody>'+snapshot.stocks.map(item=>{const x=snapshot.holdings.find(h=>h.id===item.id)||{quantity:'0',cost:'0',value:'0',unrealized:'0'};return '<tr><td>'+esc(item.name)+'</td><td>'+fmt(x.quantity)+'주</td><td>'+money(x.cost)+'</td><td>'+money(x.value)+'</td><td class="'+cls(x.unrealized)+'">'+profit(x.unrealized)+'</td></tr>';}).join('')+'</tbody></table></div></section>'+
 '<div class="jstock-order"><div class="jstock-selected"><div><small>'+esc(s.sector)+' · '+esc(s.id)+'</small><h3>'+esc(s.icon)+' '+esc(s.name)+'</h3><p>보유 <b>'+fmt(h.quantity)+'주</b> · 평균 매입가 '+money(average)+'/주</p><p>총 매입금 '+money(h.cost)+' → 현재 '+money(h.value)+'<br><strong class="'+cls(h.unrealized)+'">평가 차액 '+profit(h.unrealized)+'</strong> · 1주당 차액 '+profit(unitDifference)+'</p></div><b class="'+(s.changeBp>0?'up':s.changeBp<0?'down':'flat')+'">'+money(s.price)+'</b></div>'+
 (s.event?'<p class="jstock-event">📰 시장 속보: '+esc(s.name)+' · '+esc(s.event)+'</p>':'')+
 '<div class="jstock-side"><button type="button" data-jstock-side="buy" class="'+(side==='buy'?'selected buy':'')+'">매수</button><button type="button" data-jstock-side="sell" class="'+(side==='sell'?'selected sell':'')+'">매도</button></div>'+
 '<label for="jstockQuantity">주문 수량 (주)</label><input id="jstockQuantity" type="text" inputmode="numeric" value="'+esc(lastQuantity)+'" placeholder="주식 수량 입력" autocomplete="off"/>'+
 '<div class="jstock-presets">'+['1','10','100','1000','max'].map(x=>'<button type="button" data-jstock-qty="'+x+'">'+(x==='max'?'최대':fmt(x)+'주')+'</button>').join('')+'</div>'+
 '<div id="jstockEstimate" class="jstock-estimate"></div><button type="button" class="jstock-submit '+side+'" data-jstock-submit '+(busy?'disabled':'')+'>'+ (side==='buy'?'선택 종목 매수하기':'보유 주식 매도하기')+'</button>'+
 '<p class="jstock-disclaimer">가상 주식 · 실제 투자 및 현금 거래가 아닙니다. 매수·매도 수수료 각 0.5%. 공매도·빚 자동청산 없음. 주식 가치는 오르거나 내릴 수 있습니다.</p></div>'+
 '<div class="jstock-bottom"><section><h3>최근 거래내역</h3>'+tradeRows+'</section><section><h3>🏆 투자 수익 랭킹</h3>'+(snapshot.ranking||[]).slice(0,5).map((r,i)=>'<div class="jstock-transaction"><span>'+(i+1)+'위 '+esc(r.nickname)+'</span><b class="'+cls(r.profit)+'">'+profit(r.profit)+'</b></div>').join('')+'</section></div><button type="button" class="jstock-back" data-jstock-back>← J-BANK로 돌아가기</button>';
 clock();estimate();
 // Publish the same server-authoritative P/L for the lobby header (no extra request).
 document.dispatchEvent(new CustomEvent('jstock:status',{detail:snapshot}));
}
function estimate(){
 if(!snapshot)return;const el=$('#jstockEstimate');if(!el)return;const s=snapshot.stocks.find(x=>x.id===active);
 let quantity;try{quantity=BigInt($('#jstockQuantity')?.value||'0')}catch{quantity=0n;}
 const gross=quantity*num(s.price),fee=(gross*50n+9999n)/10000n;
 const net=side==='buy'?gross+fee:gross-fee;
 el.innerHTML='<span>예상 '+(side==='buy'?'지급액':'수령액')+'</span><strong>'+money(net)+'</strong><small>주문액 '+money(gross)+' · 수수료 '+money(fee)+'</small>';
}
async function refresh(showNotice){
 if(busy||refreshing||!$('#jstockModal')?.classList.contains('open'))return;
 if(!showNotice&&Date.now()-lastRefreshAttempt<5000)return;
 refreshing=true;lastRefreshAttempt=Date.now();
 try{const d=await api('/api/jstock');snapshot=d;offset=Number(d.serverNow)-Date.now();render();if(showNotice)alertText('최신 공통 시세로 업데이트했어.');}
 catch(e){if(showNotice)alertText(e.message,true);}finally{refreshing=false;}
}
async function trade(){
 if(busy||!snapshot)return;
 const raw=($('#jstockQuantity')?.value||'').trim();
 if(!/^[1-9][0-9]{0,15}$/.test(raw)||num(raw)>qtyLimit){alertText('1주부터 1,000조 주까지 정확히 입력해 줘.',true);return;}
 const amount=num(raw),s=snapshot.stocks.find(x=>x.id===active),gross=amount*num(s.price),fee=(gross*50n+9999n)/10000n;
 if(side==='buy'&&gross+fee>num(snapshot.wallet)){alertText('보유머니가 부족해.',true);return;}
 if(side==='sell'&&amount>num(snapshot.holdings.find(x=>x.id===active)?.quantity||'0')){alertText('보유 수량을 확인해 줘.',true);return;}
 if(!confirm(s.name+' '+fmt(amount)+'주를 '+(side==='buy'?'매수':'매도')+'할까?\n현재 1주 '+money(s.price)+'\n거래 수수료 '+money(fee)+'\n시세는 하루 4회(00·06·12·18시 KST) 달라질 수 있어.'))return;
 busy=true;try{
  const d=await api('/api/jstock/trade',{method:'POST',body:JSON.stringify({side,stockId:active,quantity:raw,requestId:crypto.randomUUID()})});
  snapshot=d.status;offset=Number(snapshot.serverNow)-Date.now();lastQuantity='1';render();
  document.dispatchEvent(new CustomEvent('jbank:wallet-change',{detail:{balance:d.status.wallet,user:d.user}}));
  alertText(s.name+' '+fmt(amount)+'주 '+(side==='buy'?'매수':'매도')+' 완료. 적용 시세 '+money(d.receipt.price)+'.');
 }catch(e){alertText(e.message,true);await refresh(false);}finally{busy=false;render();}
}
async function open(){mount();window.JBank?.close();$('#jstockModal').classList.add('open');alertText('');
 $('#jstockBody').textContent='실시간 가상시세 확인 중...';
 try{const d=await api('/api/jstock');snapshot=d;offset=Number(d.serverNow)-Date.now();render();}
 catch(e){$('#jstockBody').textContent='거래소 정보를 불러오지 못했습니다.';alertText(e.message,true);}
 clearInterval(timer);clearInterval(refreshTimer);timer=setInterval(clock,1000);refreshTimer=setInterval(()=>refresh(false),30000);
}
function close(){$('#jstockModal')?.classList.remove('open');clearInterval(timer);clearInterval(refreshTimer);timer=null;refreshTimer=null;}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
window.JStocks={open,close};
})();
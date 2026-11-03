(()=>{'use strict';
let snapshot=null,selected='JJC',busy=false,refreshing=false,clockTimer=null,refreshTimer=null,serverOffset=0,lastRefreshAttempt=0;
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=s=>{try{return BigInt(s).toLocaleString('ko-KR')}catch{return String(s)}};
const signed=v=>{const n=BigInt(v||0);return (n>0n?'+':'')+fmt(n)+' G'},tone=v=>BigInt(v||0)>=0n?'jcoin-positive':'jcoin-negative';
const money=v=>fmt(v)+' G';
const css=document.createElement('style');css.textContent=`.jcoin-modal{position:fixed;inset:0;z-index:99999;background:#050a18ed;display:flex;align-items:center;justify-content:center;padding:12px;color:#eaf1ff;font-family:system-ui,sans-serif}.jcoin-panel{width:min(920px,100%);max-height:94vh;overflow:auto;background:linear-gradient(130deg,#18213b,#0a1021);border:1px solid #a98a48;border-radius:22px;padding:20px;box-shadow:0 20px 80px #000}.jcoin-top{display:flex;justify-content:space-between;align-items:center}.jcoin-top h2{color:#f4c86c;margin:0}.jcoin-close{font-size:26px;background:none;border:0;color:white;cursor:pointer}.jcoin-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.jcoin-card{padding:10px;background:#182845;border:1px solid #35486b;border-radius:12px;color:white;text-align:left;cursor:pointer}.jcoin-card.active{border-color:#e6be64;background:#293351}.jcoin-panel input{width:100%;padding:12px;border-radius:10px;background:#101b34;border:1px solid #647392;color:white;box-sizing:border-box}.jcoin-action{padding:12px 24px;border-radius:12px;border:0;background:#f1bd58;color:#131b30;font-weight:800;cursor:pointer}.jcoin-action.sell{background:#739ff0}.jcoin-note{color:#aebbd1;font-size:13px}.jcoin-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}.jcoin-summary>div{background:#101c35;border:1px solid #425374;border-radius:12px;padding:12px;min-width:0}.jcoin-summary small{display:block;color:#aebbd1;font-size:11px}.jcoin-summary strong{display:block;font-size:clamp(13px,2.4vw,20px);overflow-wrap:anywhere}.jcoin-holdings{overflow-x:auto;margin:12px 0}.jcoin-holdings table{width:100%;border-collapse:collapse;min-width:530px;font-size:13px}.jcoin-holdings th,.jcoin-holdings td{padding:9px 7px;border-bottom:1px solid #394663;text-align:right;white-space:nowrap}.jcoin-holdings th:first-child,.jcoin-holdings td:first-child{text-align:left}.jcoin-holdings button{background:transparent;color:#f3ca78;border:0;text-align:left;font:inherit;cursor:pointer}.jcoin-holdings .jcoin-empty{text-align:center;color:#aebbd1}.jcoin-positive{color:#ff8282}.jcoin-negative{color:#85b5ff}@media(max-width:650px){.jcoin-panel{padding:12px}.jcoin-grid{grid-template-columns:1fr 1fr;gap:7px}.jcoin-card{font-size:12px}}`;css.textContent+="\n.jcoin-panel{width:min(980px,100%);max-height:calc(100dvh - 18px);overflow-x:hidden}\n.jcoin-wallet{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}\n.jcoin-wallet>div{min-width:0;background:#121e36;border:1px solid #344560;border-radius:12px;padding:11px}\n.jcoin-wallet small,.jcoin-wallet b{display:block}.jcoin-wallet small{color:#b7c8e5;font-size:11px;margin-bottom:4px}\n.jcoin-wallet b{font-size:clamp(14px,2.8vw,20px);overflow-wrap:anywhere}\n.jcoin-holdings-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:18px 0 8px}\n.jcoin-holdings-head h3{margin:0;color:#f3d592}.jcoin-holdings-head small{font-size:11px;color:#c5cfdf}\n.jcoin-holdings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}\n.jcoin-owned{display:block;width:100%;text-align:left;border:1px solid #40516e;color:#f3f6ff;background:#101d33;border-radius:14px;padding:12px;cursor:pointer;min-width:0}\n.jcoin-owned.active{border-color:#f1c974;box-shadow:0 0 0 1px #d6a64f}\n.jcoin-owned strong{font-size:13px;color:white}.jcoin-owned .jcoin-line{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:8px}\n.jcoin-owned small{display:block;color:#b5c1db;font-size:11px}.jcoin-owned b{display:block;font-size:14px;overflow-wrap:anywhere}\n.jcoin-owned .jcoin-owned-qty{color:#f6db92;font-weight:800;font-size:14px}\n.jcoin-asset-empty{padding:15px;border:1px dashed #53637f;border-radius:12px;color:#bfcee4}\n.jcoin-focus{border:1px solid #b4985b;background:linear-gradient(135deg,#263553,#111d35);border-radius:15px;margin:14px 0;padding:14px}\n.jcoin-focus h3{margin:0 0 12px;color:#f6d790}\n.jcoin-focus-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}\n.jcoin-focus-grid>div{min-width:0;background:#0c1733a9;border-radius:9px;padding:9px}\n.jcoin-focus-grid small{display:block;font-size:11px;color:#b5c1da}\n.jcoin-focus-grid b{font-size:13px;overflow-wrap:anywhere}\n.jcoin-trade-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:10px 0}\n.jcoin-trade-controls button{width:100%;padding:13px 5px}\n.jcoin-trade-quick{display:flex;gap:7px;flex-wrap:wrap;margin:9px 0}\n.jcoin-trade-quick button,.jcoin-refresh{border:1px solid #64769e;background:#202d4a;border-radius:8px;color:white;padding:7px 10px;cursor:pointer}\n.jcoin-trades details{font-size:12px;color:#c8d4e8;margin-top:12px}\n.jcoin-trades p{margin:8px 0}\n.jcoin-max-info{margin:13px 0 8px;padding:12px;background:#253b37;border:1px solid #6ebca6;border-radius:12px;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;justify-content:space-between}\n.jcoin-max-info span{color:#d7eee4;font-size:12px}.jcoin-max-info strong{color:#d9ffca;font-size:16px;overflow-wrap:anywhere}\n.jcoin-all-buy{width:100%;margin:3px 0 12px;background:linear-gradient(120deg,#f2d58a,#dca951);box-shadow:0 3px 18px #c3993d24}\n.jcoin-all-buy:disabled{opacity:.4;cursor:not-allowed}\n@media(max-width:650px){.jcoin-modal{padding:4px;align-items:stretch}.jcoin-panel{padding:12px;max-height:calc(100dvh - 8px);border-radius:13px}.jcoin-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.jcoin-holdings{grid-template-columns:1fr}.jcoin-owned{padding:11px}.jcoin-owned .jcoin-line{margin-top:4px}.jcoin-wallet b{font-size:16px}.jcoin-wallet{gap:6px}}\n";
css.textContent+=`
.jcoin-leaders{margin:18px 0 3px;padding:14px;background:#101b2c;border:1px solid #536484;border-radius:14px}
.jcoin-leaders h3{margin:0 0 5px;color:#f3d592}
.jcoin-leaders p{color:#aebbd1;font-size:11px;margin:0 0 12px}
.jcoin-rank-item{background:#1b2841;border-radius:10px;padding:10px;margin:7px 0}
.jcoin-rank-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px}
.jcoin-rank-head strong{color:#f6dba1;font-size:13px;overflow-wrap:anywhere}
.jcoin-rank-head b{font-size:13px;overflow-wrap:anywhere}
.jcoin-rank-split{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:7px;font-size:11px;color:#aebbd1}
.jcoin-rank-split b{margin-left:3px}
`;
css.textContent+=`
/* Server-synchronized coin countdown and historical quote charts. */
.jcoin-market-clock{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:9px;margin:10px 0 14px;padding:12px 14px;border:1px solid #ba985b;border-radius:13px;background:linear-gradient(110deg,#273553,#162940);color:#ffe1a3}
.jcoin-market-clock strong{font-size:15px;letter-spacing:.03em;font-variant-numeric:tabular-nums}
.jcoin-market-clock small{font-size:11px;color:#cedbf0}
.jcoin-price-chart{padding:12px;margin:12px 0 16px;border:1px solid #526785;border-radius:14px;background:linear-gradient(145deg,#13243c,#0d152a)}
.jcoin-price-head{display:flex;justify-content:space-between;align-items:flex-start;gap:7px;margin-bottom:7px;flex-wrap:wrap}
.jcoin-price-head h3{margin:0;color:#f4d393;font-size:16px}
.jcoin-price-head small{color:#b8c6dc;font-size:11px}
.jcoin-price-head b{font-size:14px}
.jcoin-price-svg{display:block;width:100%;height:156px;overflow:visible}
.jcoin-price-svg .gridline{stroke:#89a0bc;stroke-opacity:.2;stroke-width:1}
.jcoin-price-svg .price-path{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.jcoin-price-axis{display:flex;justify-content:space-between;gap:8px;color:#acbfd5;font-size:11px;margin-top:6px}
.jcoin-price-axis b{color:#e6cf9a;font-weight:700}
.jcoin-spark{display:block;width:100%;height:30px;margin:5px 0 2px}
.jcoin-spark polyline{fill:none;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
@media(max-width:650px){.jcoin-market-clock{padding:10px;gap:4px}.jcoin-market-clock strong{font-size:13px}.jcoin-price-svg{height:128px}.jcoin-price-head h3{font-size:14px}.jcoin-spark{height:24px}}
`;
document.head.appendChild(css);
function ensure(){if($('#jcoinModal'))return;const m=document.createElement('div');m.id='jcoinModal';m.className='jcoin-modal';m.innerHTML='<div class="jcoin-panel" role="dialog" aria-modal="true" aria-label="J-COIN 거래소"><div class="jcoin-top"><h2>🪙 J-COIN EXCHANGE</h2><button class="jcoin-close" data-jcoin-close>×</button></div><p class="jcoin-note">준자랜드 전용 가상 코인 · 15분 공통 시세 · 게임머니 전용</p><div id="jcoinContent">시장 정보 연결 중...</div><p id="jcoinNotice" aria-live="polite"></p></div>';document.body.appendChild(m);m.addEventListener('click',onModalClick);}
function onModalClick(e){const button=e.target?.closest?.('button');if(!button)return;if(button.matches('[data-jcoin-close]')){e.preventDefault();closeJCoin();return}if(button.matches('[data-coin]')){e.preventDefault();selected=button.dataset.coin;render();return}if(button.matches('[data-jcoin-qty]')){e.preventDefault();const i=$('#jcoinQty');if(i)i.value=button.dataset.jcoinQty;return}if(button.matches('[data-jcoin-buy-max]')){e.preventDefault();if(window.confirm('현재 잔액으로 구매 가능한 최대 코인을 수수료 포함하여 매수합니다. 진행할까요?'))trade('buy','MAX');return}if(button.matches('[data-jcoin-fill-max]')){e.preventDefault();const input=$('#jcoinQty'),coin=snapshot?.stocks?.find(x=>x.id===selected);if(input)input.value=coin?.maxBuy||'0.0000';return}if(button.matches('[data-jcoin-max]')){e.preventDefault();const i=$('#jcoinQty'),h=snapshot?.holdings?.find(x=>x.id===selected);if(i)i.value=h?.quantity||'0.0000';return}if(button.matches('[data-jcoin-refresh]')){e.preventDefault();fetchStatus().catch(err=>{const n=$('#jcoinNotice');if(n)n.textContent='새로고침 실패: '+err.message});return}if(button.matches('[data-jcoin-trade]')){e.preventDefault();trade(button.dataset.jcoinTrade);}}

const raw=v=>{try{return BigInt(v??'0')}catch{return 0n}};
function shortMoney(v){
 let n=raw(v),s=n<0n?'-':'';if(n<0n)n=-n;
 const units=[['경',10000000000000000n],['조',1000000000000n],['억',100000000n],['만',10000n]];
 let parts=[];for(const [u,d] of units){const q=n/d;if(q){parts.push(q.toLocaleString('ko-KR')+u);n%=d;}if(parts.length>=2)break;}
 return s+(parts.length?parts.join(' '):n.toLocaleString('ko-KR'))+' G';
}
const pnl=v=>(raw(v)>0n?'+':'')+shortMoney(v);
const profitClass=v=>raw(v)>0n?'jcoin-positive':raw(v)<0n?'jcoin-negative':'';
const pct=(gain,cost)=>{let d=raw(cost);if(d<=0n)return '0.00%';const bp=raw(gain)*10000n/d;const abs=bp<0n?-bp:bp;return (bp>0n?'+':bp<0n?'-':'')+(abs/100n).toString()+'.'+(abs%100n).toString().padStart(2,'0')+'%';};
// History is the common 15-minute server quote sequence (up to 49 samples).
// Coordinates are derived from server values, never from fake/generated prices.
function historyPoints(history,width,height,pad=7){
 const values=Array.isArray(history)?history.map(Number).filter(v=>Number.isFinite(v)&&v>0).slice(-49):[];
 if(!values.length)return {values,points:[],min:0,max:0};
 const min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min);
 const points=values.map((v,i)=>{
  const x=pad+(width-2*pad)*(values.length===1?.5:i/(values.length-1));
  const y=pad+(height-2*pad)*(1-(max===min?.5:(v-min)/span));
  return [Number(x.toFixed(2)),Number(y.toFixed(2))];
 });
 return {values,points,min,max};
}
function spark(history){
 const {points,values}=historyPoints(history,120,34,4);
 if(!points.length)return '';
 const rising=values.at(-1)>=values[0],color=rising?'#ff9295':'#8dbdff';
 return '<svg class="jcoin-spark" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><polyline stroke="'+color+'" points="'+points.map(p=>p.join(',')).join(' ')+'"/></svg>';
}
function priceChart(coin){
 const {values,points,min,max}=historyPoints(coin.history,600,170,14);
 const growth=values.length>1?(values.at(-1)-values[0])/values[0]*100:0;
 const rising=growth>=0,color=growth>0?'#ff969a':growth<0?'#8cbcff':'#e6c582';
 const polyline=points.map(p=>p.join(',')).join(' '),last=points.at(-1);
 const area=points.length?'M '+points[0][0]+' 160 L '+points.map(p=>p.join(' ')).join(' L ')+' L '+last[0]+' 160 Z':'';
 const currentSlot=Number(snapshot?.nextTickAt)||0;
 const lastTick=currentSlot-15*60000;
 const firstTick=lastTick-Math.max(0,values.length-1)*15*60000;
 const timeLabel=at=>new Date(at).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 return '<section class="jcoin-price-chart" aria-label="'+esc(coin.name)+' 최근 시세 그래프">'+
  '<div class="jcoin-price-head"><div><h3>📈 '+esc(coin.icon)+' '+esc(coin.name)+' 시세 추이</h3><small>15분 간격 공통 시세 · 최근 '+values.length+'개 기록</small></div>'+
  '<b class="'+(growth>=0?'jcoin-positive':'jcoin-negative')+'">'+(growth>0?'+':'')+growth.toFixed(2)+'%</b></div>'+
  (points.length?'<svg class="jcoin-price-svg" viewBox="0 0 600 170" preserveAspectRatio="none" role="img" aria-label="가격이 '+Math.round(min).toLocaleString('ko-KR')+'G에서 '+Math.round(max).toLocaleString('ko-KR')+'G 범위로 변동한 그래프">'+
    '<defs><linearGradient id="jcoinChartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="'+color+'" stop-opacity=".28"/><stop offset="1" stop-color="'+color+'" stop-opacity=".01"/></linearGradient></defs>'+
    '<path class="gridline" d="M14 14 H586 M14 85 H586 M14 156 H586"/>'+
    '<path d="'+area+'" fill="url(#jcoinChartFill)"/><polyline class="price-path" points="'+polyline+'" stroke="'+color+'"/>'+
    '<circle cx="'+last[0]+'" cy="'+last[1]+'" r="5" fill="'+color+'" stroke="#18263b" stroke-width="2"/></svg>':
    '<p class="jcoin-note">시세 기록이 쌓이면 그래프가 표시돼.</p>')+
  '<div class="jcoin-price-axis"><span>'+timeLabel(firstTick)+' KST</span><b>'+shortMoney(coin.price)+'</b><span>'+timeLabel(lastTick)+' KST</span></div>'+
  '<div class="jcoin-price-axis"><span>최저 '+shortMoney(min)+'</span><span>최고 '+shortMoney(max)+'</span></div></section>';
}
function clock(){
 if(!snapshot||!$('#jcoinModal'))return;
 const el=$('#jcoinClock');if(!el)return;
 const next=Number(snapshot.nextTickAt),serverNow=Date.now()+serverOffset;
 if(!Number.isFinite(next)||next<=0){el.textContent='다음 시세 확인 중';return;}
 const remain=Math.max(0,Math.ceil((next-serverNow)/1000));
 const mm=String(Math.floor(remain/60)).padStart(2,'0'),ss=String(remain%60).padStart(2,'0');
 const nextTime=new Date(next).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 el.textContent='다음 변동 '+nextTime+' KST · '+mm+':'+ss+' 남음';
 // At the boundary the server, not the browser, computes the new common quote.
 if(remain===0&&!busy&&!refreshing)fetchStatus(true).catch(()=>{});
}
function closeJCoin(){
 clearInterval(clockTimer);clearInterval(refreshTimer);clockTimer=null;refreshTimer=null;
 $('#jcoinModal')?.remove();
}
function render(){
 if(!snapshot)return;const c=$('#jcoinContent');if(!c)return;
 const oldNotice=$('#jcoinNotice');if(oldNotice&&c.contains(oldNotice))c.parentElement.appendChild(oldNotice);
 const chosen=snapshot.stocks.find(s=>s.id===selected)||snapshot.stocks[0];if(!chosen)return;selected=chosen.id;
 const holdings=snapshot.holdings||[];
 const getHolding=id=>holdings.find(h=>h.id===id)||{quantity:'0.0000',cost:'0',value:'0',unrealized:'0'};
 const holding=getHolding(selected),owned=holdings.filter(h=>raw((h.quantity||'0').replace('.',''))>0n);
 const avg=raw((holding.quantity||'0').replace('.',''))>0n ? raw(holding.cost)*10000n/raw((holding.quantity||'0').replace('.','')) : 0n;
 const rankingRows=(snapshot.ranking||[]).slice(0,10).map((r,i)=>`
  <div class="jcoin-rank-item">
   <div class="jcoin-rank-head"><strong>${i+1}위 · ${esc(r.nickname)}</strong><b class="${profitClass(r.profit)}">${pnl(r.profit)}</b></div>
   <div class="jcoin-rank-split">
    <span>📈 주식 <b class="${profitClass(r.stockProfit)}">${pnl(r.stockProfit)}</b></span>
    <span>🪙 코인 <b class="${profitClass(r.coinProfit)}">${pnl(r.coinProfit)}</b></span>
   </div>
  </div>`).join('');
 c.innerHTML=`
 <div class="jcoin-market-clock"><div><strong>⏱️ <span id="jcoinClock">다음 시세 확인 중</span></strong></div><small>15분마다 전 종목 공동 갱신</small></div>
 <div class="jcoin-wallet" aria-label="내 코인 자산 현황">
  <div><small>내 지갑</small><b title="${fmt(snapshot.wallet)} G">${shortMoney(snapshot.wallet)}</b></div>
  <div><small>코인 총 평가액</small><b title="${fmt(snapshot.marketValue)} G">${shortMoney(snapshot.marketValue)}</b></div>
  <div><small>전체 매입원금·수수료 포함</small><b>${shortMoney(snapshot.cost||'0')}</b></div>
  <div><small>총 평가손익 / 수익률</small><b class="${profitClass(snapshot.unrealized)}">${pnl(snapshot.unrealized)} <small class="${profitClass(snapshot.unrealized)}">${pct(snapshot.unrealized,snapshot.cost)}</small></b></div>
 </div>
 ${priceChart(chosen)}
 <div class="jcoin-holdings-head"><h3>💼 내 보유 코인 (${owned.length}종)</h3><small>수익 빨강(+) · 손실 파랑(-)</small></div>
 <div class="jcoin-holdings" aria-label="보유 종목별 자산과 차액">
 ${owned.length?owned.map(h=>{
  const s=snapshot.stocks.find(s=>s.id===h.id)||{name:h.id,icon:'🪙'};
  return `<button type="button" class="jcoin-owned ${h.id===selected?'active':''}" data-coin="${esc(h.id)}">
   <strong>${esc(s.icon)} ${esc(s.name)}</strong>
   <div class="jcoin-line"><small>보유 수량</small><span class="jcoin-owned-qty">${esc(h.quantity)}개</span></div>
   <div class="jcoin-line"><small>매입금액</small><b>${shortMoney(h.cost)}</b></div>
   <div class="jcoin-line"><small>현재 평가액</small><b>${shortMoney(h.value)}</b></div>
   <div class="jcoin-line"><small>차액·수익률</small><b class="${profitClass(h.unrealized)}">${pnl(h.unrealized)} <small>${pct(h.unrealized,h.cost)}</small></b></div>
   </button>`;
 }).join(''):'<div class="jcoin-asset-empty">아직 보유한 코인이 없어. 아래에서 코인을 선택해 구매할 수 있어.</div>'}
 </div>
 <div class="jcoin-holdings-head"><h3>📈 코인 시세</h3><button type="button" class="jcoin-refresh" data-jcoin-refresh>↻ 새로고침</button></div>
 <div class="jcoin-grid">${snapshot.stocks.map(s=>`<button type="button" class="jcoin-card ${s.id===selected?'active':''}" data-coin="${esc(s.id)}"><b>${esc(s.icon)} ${esc(s.name)}</b><div>${shortMoney(s.price)}</div><small class="${s.changeBp>=0?'jcoin-positive':'jcoin-negative'}">${s.changeBp>=0?'+':''}${(s.changeBp/100).toFixed(2)}%</small>${spark(s.history)}<small style="display:block;color:#cbd6e9">보유 ${esc(getHolding(s.id).quantity)}개</small></button>`).join('')}</div>
 <section class="jcoin-focus">
  <h3>${esc(chosen.icon)} ${esc(chosen.name)} · ${shortMoney(chosen.price)}</h3>
  <div class="jcoin-focus-grid">
   <div><small>내 보유 수량</small><b>${esc(holding.quantity)}개</b></div>
   <div><small>평균 매입가 (수수료 포함)</small><b>${shortMoney(avg)}</b></div>
   <div><small>매입금액 → 평가금액</small><b>${shortMoney(holding.cost)} → ${shortMoney(holding.value)}</b></div>
   <div><small>평가 차액 · 수익률</small><b class="${profitClass(holding.unrealized)}">${pnl(holding.unrealized)} (${pct(holding.unrealized,holding.cost)})</b></div>
  </div>
  <div class="jcoin-max-info" aria-live="polite"><span>💰 내 지갑 기준 최대 매수 · 수수료 0.2% 포함</span><strong>${esc(chosen.maxBuy||'0.0000')}개</strong></div>
  <label for="jcoinQty" style="display:block;margin-top:14px">거래 수량 (소수점 네 자리까지)</label>
  <input id="jcoinQty" type="text" inputmode="decimal" value="1.0000" autocomplete="off">
  <div class="jcoin-trade-quick"><button type="button" data-jcoin-qty="0.1000">0.1개</button><button type="button" data-jcoin-qty="1.0000">1개</button><button type="button" data-jcoin-qty="10.0000">10개</button><button type="button" data-jcoin-fill-max>MAX 수량 입력</button><button type="button" data-jcoin-max>보유 전량 입력</button></div>
  <div class="jcoin-trade-controls"><button type="button" class="jcoin-action" data-jcoin-trade="buy">매수하기</button><button type="button" class="jcoin-action sell" data-jcoin-trade="sell">매도하기</button></div>
  <button type="button" class="jcoin-action jcoin-all-buy" data-jcoin-buy-max ${chosen.maxBuy==='0.0000'?'disabled':''}>💰 잔액 전액으로 MAX 매수</button>
  <div data-jcoin-message></div>
  <p class="jcoin-note">수수료 0.2% · 15분마다 공통 시세 변동 · 게임머니 전용</p>
 </section>
 <section class="jcoin-leaders">
  <h3>🏆 주식 + 코인 통합 투자랭킹</h3>
  <p>회원별 주식·코인 실현손익과 평가손익을 합산한 순위</p>
  ${rankingRows||'<p>아직 투자한 회원이 없어.</p>'}
 </section>
 <section class="jcoin-trades"><details><summary>최근 내 거래 ${snapshot.trades?.length||0}건 보기</summary>${snapshot.trades?.length?snapshot.trades.map(t=>`<p>${new Date(t.at).toLocaleString('ko-KR')} · ${esc(t.stockId)} ${t.side==='buy'?'매수':'매도'} ${esc(t.quantity)}개</p>`).join(''):'<p>거래 내역 없음</p>'}</details></section>`;
 const slot=c.querySelector('[data-jcoin-message]'),notice=$('#jcoinNotice');
 if(slot&&notice)slot.appendChild(notice);
 clock();
 document.dispatchEvent(new CustomEvent('jcoin:status',{detail:snapshot}));
}
async function fetchStatus(silent=false){
 if(busy||refreshing||!$('#jcoinModal'))return;
 if(silent&&Date.now()-lastRefreshAttempt<4000)return;
 refreshing=true;lastRefreshAttempt=Date.now();
 try{
  const r=await fetch('/api/jcoin',{credentials:'same-origin',cache:'no-store'});
  const d=await r.json();if(!r.ok)throw Error(d.error||'시세 조회 실패');
  if(!$('#jcoinModal'))return; // Ignore responses after the dialog closed.
  const panel=$('#jcoinModal .jcoin-panel'),scroll=panel?.scrollTop||0,quantity=$('#jcoinQty')?.value;
  snapshot=d;serverOffset=Number(d.serverNow)-Date.now();render();
  if(quantity!==undefined&&$('#jcoinQty'))$('#jcoinQty').value=quantity;
  if(panel)panel.scrollTop=scroll;
 }catch(e){if(!silent)throw e;const message=$('#jcoinNotice');if(message)message.textContent='시세 연결 확인 중 · '+e.message;}
 finally{refreshing=false;}
}
async function trade(side,quantityOverride){if(busy)return;const notice=$('#jcoinNotice');if(!notice)return;busy=true;notice.textContent='주문 처리 중...';document.querySelectorAll('#jcoinModal [data-jcoin-trade],#jcoinModal [data-jcoin-buy-max]').forEach(b=>b.disabled=true);try{const quantity=quantityOverride==='MAX'?'MAX':$('#jcoinQty').value.trim();if(quantity!=='MAX'&&!/^(?:[1-9][0-9]{0,39}(?:\.[0-9]{1,4})?|0\.[0-9]{1,4})$/.test(quantity))throw Error('수량을 소수점 4자리까지 입력하세요.');const r=await fetch('/api/jcoin/trade',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({side,stockId:selected,quantity,requestId:crypto.randomUUID()})});const d=await r.json();if(!r.ok)throw Error(d.error||'거래 실패');snapshot=d.status;serverOffset=Number(d.status.serverNow)-Date.now();render();const message=$('#jcoinNotice');if(message)message.textContent=(side==='buy'?'매수':'매도')+' 완료! '+(d.receipt?.quantity||quantity)+'개 · 게임머니 잔액과 보유 코인에 반영했습니다.';document.dispatchEvent(new Event('jbank:wallet-change'));}catch(e){notice.textContent='거래 실패: '+(e?.message||'네트워크 연결을 확인해 주세요.')}finally{busy=false;document.querySelectorAll('#jcoinModal [data-jcoin-trade],#jcoinModal [data-jcoin-buy-max]').forEach(b=>b.disabled=false);}}
window.openJCoin=async()=>{ensure();$('#jcoinModal').style.display='flex';$('#jcoinNotice').textContent='';try{await fetchStatus()}catch(e){$('#jcoinNotice').textContent='시세 조회 실패: '+e.message}clearInterval(clockTimer);clearInterval(refreshTimer);clockTimer=setInterval(clock,1000);refreshTimer=setInterval(()=>fetchStatus(true).catch(()=>{}),30000);clock();};
document.addEventListener('click',e=>{if(e.target?.closest?.('#jbankCoinOpen')){e.preventDefault();window.openJCoin();}});
})();
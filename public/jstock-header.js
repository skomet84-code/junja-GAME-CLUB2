(()=>{'use strict';
// Lobby investment P/L: server-authoritative stock + coin status, never mutate holdings or wallets.
// Include realized + unrealized P/L for both markets, matching the unified investment ranking.
const $=s=>document.querySelector(s);
const label=()=>$('#jstockHeaderProfit'),value=()=>$('#jstockHeaderProfitAmount');
const positions={stock:null,coin:null};
let fetching=false,lastAttempt=0,tickTimer=null,sessionEpoch=0;
function compact(value){
 let n=value<0n?-value:value,out='';
 for(const [unit,amount] of [['경',10000000000000000n],['조',1000000000000n],['억',100000000n],['만',10000n]]){
  const piece=n/amount;if(piece){out+=piece.toLocaleString('ko-KR')+unit+' ';n%=amount;}
 }
 return (out.trim()+(n?' '+n.toLocaleString('ko-KR'):'')).trim()||'0';
}
const signed=n=>(n>0n?'+':n<0n?'-':'')+compact(n)+' G';
function clear(){
 sessionEpoch++;positions.stock=null;positions.coin=null;
 clearTimeout(tickTimer);tickTimer=null;
 const pill=label(),amount=value();if(!pill||!amount)return;
 pill.classList.remove('up','down');pill.classList.add('flat');
 amount.textContent='—';
 pill.setAttribute('aria-label','주식·코인 통합수익 확인 전');
 pill.title='주식·코인 실현손익 + 평가손익';
}
function show(raw){
 const pill=label(),amount=value();if(!pill||!amount)return;
 let profit;try{profit=BigInt(raw);}catch{return;}
 pill.classList.toggle('up',profit>0n);
 pill.classList.toggle('down',profit<0n);
 pill.classList.toggle('flat',profit===0n);
 amount.textContent=signed(profit);
 pill.setAttribute('aria-label','주식·코인 통합수익 '+signed(profit));
}
function display(){
 if(!positions.stock||!positions.coin)return;
 const stock=positions.stock.unrealized+positions.stock.realized;
 const coin=positions.coin.unrealized+positions.coin.realized;
 show(stock+coin);
 const pill=label();if(!pill)return;
 const breakdown='주식 '+signed(stock)+' · 코인 '+signed(coin);
 pill.setAttribute('aria-label','주식·코인 통합수익 '+signed(stock+coin)+' · '+breakdown+' · 실현손익 및 평가손익 포함');
 pill.title=breakdown+' (실현 + 평가손익)';
}
function schedule(){
 clearTimeout(tickTimer);tickTimer=null;
 const next=[positions.stock?.nextTickAt,positions.coin?.nextTickAt]
  .filter(n=>Number.isFinite(n)&&n>Date.now()-3000);
 if(next.length){
  // Stocks tick four times per day; coins tick every 15 minutes.
  tickTimer=setTimeout(()=>refresh(true),Math.max(1500,Math.min(...next)-Date.now()+1300));
 }
}
function receive(market,status){
 if(!status||status.unrealized==null||!['stock','coin'].includes(market))return;
 if($('#mainApp')?.classList.contains('hidden'))return;
 try{
  positions[market]={
   unrealized:BigInt(status.unrealized),
   realized:BigInt(status.realized??'0'),
   nextTickAt:Number(status.nextTickAt)
  };
 }catch{return;}
 display();schedule();
}
async function refresh(force=false){
 if(!label()||!$('#mainApp')||$('#mainApp').classList.contains('hidden')||document.hidden)return;
 if(fetching||(!force&&Date.now()-lastAttempt<30000))return;
 fetching=true;lastAttempt=Date.now();const epoch=sessionEpoch;
 try{
  const [stocks,coins]=await Promise.all([
   fetch('/api/jstock',{credentials:'same-origin',cache:'no-store'}),
   fetch('/api/jcoin',{credentials:'same-origin',cache:'no-store'})
  ]);
  if(stocks.status===401||stocks.status===403||coins.status===401||coins.status===403){
   if(epoch===sessionEpoch)clear();return;
  }
  // Never mislabel a stock-only number as combined P/L when either API fails.
  if(!stocks.ok||!coins.ok)return;
  const [stock,coin]=await Promise.all([stocks.json(),coins.json()]);
  if(epoch!==sessionEpoch)return;
  receive('stock',stock);receive('coin',coin);
 }catch{/* Offline: retain the last complete quote, never fabricate a missing market. */}
 finally{fetching=false;}
}
function init(){
 const main=$('#mainApp');if(!main||!label())return;
 new MutationObserver(()=>{
  if(main.classList.contains('hidden'))clear();else refresh(true);
 }).observe(main,{attributes:true,attributeFilter:['class']});
 document.addEventListener('jstock:status',e=>receive('stock',e.detail));
 document.addEventListener('jcoin:status',e=>receive('coin',e.detail));
 document.addEventListener('jbank:wallet-change',()=>refresh(true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
 window.addEventListener('focus',()=>refresh(false));
 setInterval(()=>refresh(false),60000);
 refresh(true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.JStockHeader={refresh,show};
})();

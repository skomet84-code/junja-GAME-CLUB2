(()=>{'use strict';
// Show server-authoritative J-STOCK unrealized P/L beside the lobby wallet.
// Does not write to balances, holdings or the trading ledger.
const $=selector=>document.querySelector(selector);
const label=()=>$('#jstockHeaderProfit'),value=()=>$('#jstockHeaderProfitAmount');
let fetching=false,lastAttempt=0,tickTimer=null,sessionEpoch=0;
function compact(value){
 let n=value<0n?-value:value,out='';
 for(const [unit,amount] of [['경',10000000000000000n],['조',1000000000000n],['억',100000000n],['만',10000n]]){
  const piece=n/amount;if(piece){out+=piece.toLocaleString('ko-KR')+unit+' ';n%=amount;}
 }
 return (out.trim()+(n?' '+n.toLocaleString('ko-KR'):'')).trim()||'0';
}
function clear(){
 sessionEpoch++;
 clearTimeout(tickTimer);tickTimer=null;
 const pill=label(),amount=value();if(!pill||!amount)return;
 pill.classList.remove('up','down');pill.classList.add('flat');
 amount.textContent='—';pill.setAttribute('aria-label','주식 평가손익 확인 전');
}
function show(raw){
 const pill=label(),amount=value();if(!pill||!amount)return;
 let profit;try{profit=BigInt(raw);}catch{return;}
 const sign=profit>0n?'+':profit<0n?'-':'';
 pill.classList.toggle('up',profit>0n);
 pill.classList.toggle('down',profit<0n);
 pill.classList.toggle('flat',profit===0n);
 amount.textContent=sign+compact(profit)+' G';
 pill.setAttribute('aria-label','현재 주식 평가손익 '+sign+((profit<0n?-profit:profit).toLocaleString('ko-KR'))+' G');
 pill.title='현재 보유한 주식의 평가손익 (매입금액 대비, 미실현)';
}
function receive(status){
 if(!status||status.unrealized==null)return;
 if($('#mainApp')?.classList.contains('hidden'))return;
 show(status.unrealized);
 clearTimeout(tickTimer);tickTimer=null;
 const next=Number(status.nextTickAt);
 if(Number.isFinite(next)&&next>Date.now()-3000){
  // Quotes change simultaneously for everyone at 00/06/12/18 KST.
  tickTimer=setTimeout(()=>refresh(true),Math.max(1500,next-Date.now()+1300));
 }
}
async function refresh(force=false){
 if(!label()||!$('#mainApp')||$('#mainApp').classList.contains('hidden')||document.hidden)return;
 if(fetching||(!force&&Date.now()-lastAttempt<30000))return;
 fetching=true;lastAttempt=Date.now();const epoch=sessionEpoch;
 try{
  const r=await fetch('/api/jstock',{credentials:'same-origin',cache:'no-store'});
  if(r.status===401||r.status===403){clear();return;}
  if(!r.ok)return;
  const data=await r.json();
  if(epoch===sessionEpoch)receive(data);
 }catch{/* transient offline: retain the last successful quote */}finally{fetching=false;}
}
function init(){
 const main=$('#mainApp');if(!main||!label())return;
 new MutationObserver(()=>{
  if(main.classList.contains('hidden'))clear();
  else refresh(true);
 }).observe(main,{attributes:true,attributeFilter:['class']});
 document.addEventListener('jstock:status',e=>receive(e.detail));
 document.addEventListener('jbank:wallet-change',()=>refresh(false));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
 window.addEventListener('focus',()=>refresh(false));
 setInterval(()=>refresh(false),120000);
 refresh(true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.JStockHeader={refresh,show};
})();

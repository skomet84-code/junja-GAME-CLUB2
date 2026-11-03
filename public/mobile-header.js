(()=>{'use strict';
// Presentation-only: do not modify game balances, trades, or API data.
const mobile=window.matchMedia('(max-width:820px)');
const assets=[
  {id:'walletBalance',container:'.topbar .wallet-pill',label:'보유머니'},
  {id:'jstockHeaderProfitAmount',container:'.topbar #jstockHeaderProfit',label:'주식 평가손익'}
];
const units=[['경',10000000000000000n],['조',1000000000000n],['억',100000000n],['만',10000n]];
let activeDialog=null,previousFocus=null;
function asUnits(n){
  const negative=n<0n;let abs=negative?-n:n;const parts=[];
  for(const [unit,scale] of units){
    const value=abs/scale;
    if(value>0n)parts.push(value.toLocaleString('ko-KR')+unit);
    if(parts.length===2)break;
    // Use remaining part for the next lower unit, never repeat a higher unit.
    abs%=scale;
  }
  return (negative?'-':'')+(parts.join(' ')||n.toLocaleString('ko-KR'))+' G';
}
function shortText(full){
  const text=String(full||'').trim();
  const pieces=[...text.matchAll(/([0-9][0-9,]*)\s*(경|조|억|만)/g)];
  if(pieces.length>2){
    return (/^-/.test(text)?'-':/^\+/.test(text)?'+':'')+pieces.slice(0,2).map(p=>p[1]+p[2]).join(' ')+' G';
  }
  if(text.length>21){
    const m=text.match(/^([+-]?)\s*([0-9,]+)\s*G$/);
    if(m){
      try{const value=BigInt(m[2].replaceAll(',',''))*(m[1]==='-'?-1n:1n);return (m[1]==='+'?'+':'')+asUnits(value);}catch{}
    }
  }
  return text;
}
function updateStat(el){
  if(!el)return;
  const current=el.textContent.trim();
  if(!mobile.matches){
    if(el.dataset.mobileShown&&current===el.dataset.mobileShown&&el.dataset.mobileFull){
      el.textContent=el.dataset.mobileFull;
    }
    delete el.dataset.mobileShown;
    return;
  }
  if(current===el.dataset.mobileShown)return;
  el.dataset.mobileFull=current;
  const shortened=shortText(current);
  el.dataset.mobileShown=shortened;
  el.title=current;
  if(current!==shortened)el.textContent=shortened;
}
function closeDialog(){
  if(!activeDialog)return;
  activeDialog.remove();activeDialog=null;
  document.body.classList.remove('mobile-asset-open');
  previousFocus?.focus?.();previousFocus=null;
}
function openDialog(item,el){
  if(!mobile.matches)return;
  closeDialog();
  previousFocus=document.activeElement;
  const layer=document.createElement('div');layer.className='mobile-asset-dialog';
  layer.innerHTML='<div class="mobile-asset-backdrop"></div><section class="mobile-asset-sheet" role="dialog" aria-modal="true" aria-labelledby="mobileAssetTitle"><div class="mobile-asset-kicker">JUNJA LAND · ASSET DETAILS</div><h2 id="mobileAssetTitle"></h2><div class="mobile-asset-full"></div><div class="mobile-asset-exact"></div><button class="mobile-asset-close" type="button">확인</button></section>';
  layer.querySelector('#mobileAssetTitle').textContent=item.label;
  layer.querySelector('.mobile-asset-full').textContent=el.dataset.mobileFull||el.textContent.trim();
  const aria=item.id==='jstockHeaderProfitAmount'?
    document.getElementById('jstockHeaderProfit')?.getAttribute('aria-label'):'';
  layer.querySelector('.mobile-asset-exact').textContent=aria||'상단에는 보기 편하게 축약하여 표시됩니다.';
  layer.querySelector('.mobile-asset-backdrop').addEventListener('click',closeDialog);
  layer.querySelector('.mobile-asset-close').addEventListener('click',closeDialog);
  document.body.appendChild(layer);activeDialog=layer;
  document.body.classList.add('mobile-asset-open');
  layer.querySelector('.mobile-asset-close').focus();
}
function init(){
  for(const item of assets){
    const el=document.getElementById(item.id);
    const card=document.querySelector(item.container);
    if(!el||!card)continue;
    const refresh=()=>updateStat(el);
    new MutationObserver(refresh).observe(el,{subtree:true,characterData:true,childList:true});
    mobile.addEventListener('change',refresh);
    card.setAttribute('tabindex','0');
    card.setAttribute('role','button');
    card.setAttribute('aria-description','눌러서 전체 금액 확인');
    card.addEventListener('click',()=>openDialog(item,el));
    card.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();openDialog(item,el);}
    });
    refresh();
  }
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&activeDialog){e.preventDefault();closeDialog();}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();